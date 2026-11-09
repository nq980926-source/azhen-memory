import {
  MemoryActionError,
  type MemoryAction,
  type MemoryActionGateway,
} from "./actions.ts";
import {
  PendingOperationStore,
  createPendingOperation,
  operationMatchesBinding,
  type PendingMemoryOperation,
} from "./pending-operation.ts";

export interface MemoryOperationContext {
  serviceBaseUrl: string;
  assistantId: string;
  bearerToken: string;
}

export type MemoryOperationExecution =
  | {
      kind: "confirmed";
      message: string;
      receipt: Record<string, unknown>;
    }
  | {
      kind: "not_committed";
      message: string;
      receipt: Record<string, unknown>;
    }
  | {
      kind: "rejected";
      message: string;
      code?: string;
      httpStatus?: number;
    }
  | {
      kind: "unknown";
      message: string;
      receipt?: Record<string, unknown>;
    }
  | { kind: "none" };

export class MemoryOperationController {
  private probe: {
    operationId: string;
    status: "confirmed" | "not_committed" | "unknown";
  } | null = null;

  constructor(
    private readonly store: PendingOperationStore,
    private readonly gateway: MemoryActionGateway,
    private readonly onServerStateChanged: () => void,
    private readonly createId: () => string = () =>
      globalThis.crypto.randomUUID(),
    private readonly now: () => number = Date.now,
  ) {}

  getPendingOperation(): PendingMemoryOperation | null {
    return this.store.load();
  }

  operationMatches(context: MemoryOperationContext): boolean {
    const operation = this.store.load();
    return operation ? operationMatchesBinding(operation, context) : false;
  }

  canRetry(operationId: string): boolean {
    return (
      this.probe?.operationId === operationId &&
      this.probe.status === "not_committed"
    );
  }

  async begin(
    context: MemoryOperationContext,
    action: Exclude<MemoryAction, "operation">,
    fields: Record<string, unknown>,
  ): Promise<MemoryOperationExecution> {
    if (this.store.load()) {
      throw new Error("已有一次 Memory 操作尚未确认；请先核对原操作。");
    }
    const operation = createPendingOperation(
      context,
      action,
      fields,
      this.createId(),
      this.now(),
    );
    this.store.save(operation);
    this.probe = null;
    return this.send(context, operation, true);
  }

  async check(context: MemoryOperationContext): Promise<MemoryOperationExecution> {
    const operation = this.store.load();
    if (!operation) return { kind: "none" };
    this.requireBinding(context, operation);
    try {
      const result = await this.gateway.invoke(
        context.serviceBaseUrl,
        context.assistantId,
        context.bearerToken,
        "operation",
        { operation_id: operation.operationId },
      );
      const status = result.body.status;
      if (status === "confirmed") {
        this.clear();
        return {
          kind: "confirmed",
          message: "服务器确认原操作已经提交。",
          receipt: result.body,
        };
      }
      if (status === "not_committed") {
        this.probe = {
          operationId: operation.operationId,
          status: "not_committed",
        };
        return {
          kind: "not_committed",
          message: "服务器确认原操作尚未提交，可以安全重试原标识。",
          receipt: result.body,
        };
      }
      this.probe = {
        operationId: operation.operationId,
        status: "unknown",
      };
      return {
        kind: "unknown",
        message: "服务器尚不能确认原操作结果；请勿创建新操作。",
        receipt: result.body,
      };
    } catch (error) {
      this.probe = {
        operationId: operation.operationId,
        status: "unknown",
      };
      return { kind: "unknown", message: actionErrorMessage(error) };
    }
  }

  async retry(context: MemoryOperationContext): Promise<MemoryOperationExecution> {
    const operation = this.store.load();
    if (!operation) return { kind: "none" };
    this.requireBinding(context, operation);
    if (!this.canRetry(operation.operationId)) {
      throw new Error("请先核对服务器回执；仅确认未提交后才能重试原操作。");
    }
    return this.send(context, operation, false);
  }

  discardUncommitted(): void {
    const operation = this.store.load();
    if (!operation) return;
    if (!this.canRetry(operation.operationId)) {
      throw new Error("服务器尚未确认该操作未提交，不能丢弃操作记录。");
    }
    this.clear();
  }

  private requireBinding(
    context: MemoryOperationContext,
    operation: PendingMemoryOperation,
  ): void {
    if (!operationMatchesBinding(operation, context)) {
      throw new Error(
        "未完成操作属于另一组服务地址或 Assistant ID；请恢复原配置后再核对。",
      );
    }
  }

  private async send(
    context: MemoryOperationContext,
    operation: PendingMemoryOperation,
    initialAttempt: boolean,
  ): Promise<MemoryOperationExecution> {
    this.probe = {
      operationId: operation.operationId,
      status: "unknown",
    };
    try {
      const result = await this.gateway.invoke(
        context.serviceBaseUrl,
        context.assistantId,
        context.bearerToken,
        operation.action,
        operation.body,
      );
      if (result.body.status === "confirmed") {
        this.clear();
        return {
          kind: "confirmed",
          message: "Memory 操作已确认并写入。",
          receipt: result.body,
        };
      }
      return {
        kind: "unknown",
        message:
          typeof result.body.error === "string"
            ? result.body.error
            : "服务器尚未确认操作结果；原操作已保留。",
        receipt: result.body,
      };
    } catch (error) {
      if (
        initialAttempt &&
        error instanceof MemoryActionError &&
        error.disposition === "rejected"
      ) {
        this.clear();
        return {
          kind: "rejected",
          message: actionErrorMessage(error),
          code: error.code,
          httpStatus: error.httpStatus,
        };
      }
      return { kind: "unknown", message: actionErrorMessage(error) };
    }
  }

  private clear(): void {
    this.store.clear();
    this.probe = null;
    this.onServerStateChanged();
  }
}

export function actionErrorMessage(error: unknown): string {
  if (error instanceof MemoryActionError) {
    switch (error.code) {
      case "stale_version":
        return "记忆已发生变化；已保留服务端最新内容，请重新查看后再操作。";
      case "fragment_not_unique":
        return "所选记忆内容已不唯一或不存在；请刷新后重新选择。";
      case "pending_correction":
        return "已有待处理的纠正候选，请先处理原候选。";
      case "correction_review_required":
        return "纠正候选必须重新核对后才能确认。";
    }
    if (error.httpStatus === 409) {
      return "服务器拒绝了本次操作，最新记忆未被覆盖。请刷新后重试。";
    }
    if (error.disposition === "unknown") {
      return "请求结果未知；原操作标识已保留，请先核对回执。";
    }
    return "服务器拒绝了本次操作；没有生成新的写入。";
  }
  if (error instanceof Error && error.message) return error.message;
  return "请求结果未知；原操作标识已保留。";
}

import type { MemoryAction } from "./actions.ts";

export const PENDING_OPERATION_SECRET_ID =
  "azhen-memory-pending-operation";

export interface MemoryBindingIdentity {
  serviceBaseUrl: string;
  assistantId: string;
}

export interface PendingMemoryOperation {
  version: 1;
  serviceBaseUrl: string;
  assistantId: string;
  action: MemoryAction;
  body: Record<string, unknown>;
  operationId: string;
  createdAt: number;
}

export interface SecretStoragePort {
  getSecret(id: string): string | null;
  setSecret(id: string, secret: string): void;
}

export class PendingOperationStore {
  constructor(
    private readonly secrets: SecretStoragePort,
    private readonly secretId = PENDING_OPERATION_SECRET_ID,
  ) {}

  load(): PendingMemoryOperation | null {
    const raw = this.secrets.getSecret(this.secretId);
    if (!raw) return null;
    try {
      return parsePendingOperation(JSON.parse(raw));
    } catch {
      throw new Error("未完成操作记录无法解析；为避免重复写入，已停止新的写入。");
    }
  }

  save(operation: PendingMemoryOperation): void {
    this.secrets.setSecret(this.secretId, JSON.stringify(operation));
  }

  clear(): void {
    this.secrets.setSecret(this.secretId, "");
  }
}

export function createPendingOperation(
  identity: MemoryBindingIdentity,
  action: MemoryAction,
  fields: Record<string, unknown>,
  operationId: string,
  now = Date.now(),
): PendingMemoryOperation {
  if (!isUuid(operationId)) {
    throw new Error("无法生成有效的操作标识；未发送写入。");
  }
  return {
    version: 1,
    serviceBaseUrl: identity.serviceBaseUrl,
    assistantId: identity.assistantId,
    action,
    body: { ...fields, operation_id: operationId },
    operationId,
    createdAt: now,
  };
}

export function operationMatchesBinding(
  operation: PendingMemoryOperation,
  identity: MemoryBindingIdentity,
): boolean {
  return (
    operation.serviceBaseUrl === identity.serviceBaseUrl &&
    operation.assistantId === identity.assistantId
  );
}

function parsePendingOperation(value: unknown): PendingMemoryOperation {
  if (!isRecord(value) || value.version !== 1) {
    throw new Error("invalid pending operation");
  }
  const action = value.action;
  if (!isAction(action)) throw new Error("invalid pending action");
  if (
    typeof value.serviceBaseUrl !== "string" ||
    typeof value.assistantId !== "string" ||
    typeof value.operationId !== "string" ||
    !isUuid(value.operationId) ||
    typeof value.createdAt !== "number" ||
    !isRecord(value.body) ||
    value.body.operation_id !== value.operationId
  ) {
    throw new Error("invalid pending operation fields");
  }
  return {
    version: 1,
    serviceBaseUrl: value.serviceBaseUrl,
    assistantId: value.assistantId,
    action,
    body: value.body,
    operationId: value.operationId,
    createdAt: value.createdAt,
  };
}

function isAction(value: unknown): value is MemoryAction {
  return (
    value === "operation" ||
    value === "confirm" ||
    value === "reject" ||
    value === "correct" ||
    value === "propose_correction" ||
    value === "forget" ||
    value === "undo"
  );
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

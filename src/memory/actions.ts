import { buildMemoryActionUrl } from "../security/url-policy.ts";

export type MemoryAction =
  | "operation"
  | "confirm"
  | "reject"
  | "correct"
  | "propose_correction"
  | "forget"
  | "undo";

export interface ActionRequest {
  url: string;
  assistantId: string;
  bearerToken: string;
  action: MemoryAction;
  body: Record<string, unknown>;
}

export interface ActionTransportResponse {
  status: number;
  headers: Record<string, string>;
  text: string;
}

export interface ActionTransport {
  postAction(request: ActionRequest): Promise<ActionTransportResponse>;
}

export interface MemoryActionResult {
  status: number;
  body: Record<string, unknown>;
}

export class MemoryActionError extends Error {
  constructor(
    readonly disposition: "rejected" | "unknown",
    message: string,
    readonly httpStatus?: number,
    readonly code?: string,
  ) {
    super(message);
    this.name = "MemoryActionError";
  }
}

export class MemoryActionGateway {
  constructor(private readonly transport: ActionTransport) {}

  async invoke(
    serviceBaseUrl: string,
    assistantId: string,
    bearerToken: string,
    action: MemoryAction,
    body: Record<string, unknown>,
  ): Promise<MemoryActionResult> {
    const response = await this.transport.postAction({
      url: buildMemoryActionUrl(serviceBaseUrl, action),
      assistantId,
      bearerToken,
      action,
      body,
    });
    let parsed: unknown;
    try {
      parsed = JSON.parse(response.text);
    } catch {
      throw new MemoryActionError(
        "unknown",
        "服务器返回了无法解析的结果；原操作标识已保留。",
        response.status,
      );
    }
    if (!isRecord(parsed)) {
      throw new MemoryActionError(
        "unknown",
        "服务器返回的结果结构异常；原操作标识已保留。",
        response.status,
      );
    }
    if (response.status < 200 || response.status >= 300) {
      const code =
        typeof parsed.code === "string" ? parsed.code : undefined;
      const serverMessage =
        typeof parsed.error === "string" ? parsed.error : undefined;
      throw new MemoryActionError(
        rejectionClass(response.status),
        serverMessage ?? `Memory 服务返回 HTTP ${response.status}。`,
        response.status,
        code,
      );
    }
    return { status: response.status, body: parsed };
  }
}

function rejectionClass(status: number): "rejected" | "unknown" {
  if (status === 408 || status === 425 || status === 429 || status >= 500) {
    return "unknown";
  }
  return "rejected";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

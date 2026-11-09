import {
  ProtocolError,
  summarizeReadResponse,
  validateReadResponse,
  type MemoryReadSummary,
  type MemoryFileV1,
  type MemoryProposalV1,
  type MemoryEventV1,
} from "./contract.ts";
import {
  buildMemoryReadUrl,
  UrlPolicyError,
} from "../security/url-policy.ts";

export interface ReadRequest {
  url: string;
  assistantId: string;
  bearerToken: string;
}

export interface ReadTransportResponse {
  status: number;
  headers: Record<string, string>;
  text: string;
}

export interface ReadTransport {
  postRead(request: ReadRequest): Promise<ReadTransportResponse>;
}

export type ConnectionCheck =
  | {
      kind: "not_configured";
      message: string;
    }
  | {
      kind: "blocked";
      message: string;
    }
  | {
      kind: "connected";
      message: string;
      summary: MemoryReadSummary;
      documents: MemoryFileV1[];
      pending: MemoryProposalV1[];
      events: MemoryEventV1[];
    }
  | {
      kind: "failed";
      category:
        | "https"
        | "configuration"
        | "authentication"
        | "network"
        | "redirect"
        | "server"
        | "protocol";
      message: string;
    };

export class MemoryReadOnlyGateway {
  constructor(private readonly transport: ReadTransport) {}

  async verify(
    serviceBaseUrl: string,
    assistantId: string,
    bearerToken: string,
  ): Promise<ConnectionCheck> {
    if (!serviceBaseUrl.trim() || !assistantId.trim() || !bearerToken) {
      return {
        kind: "not_configured",
        message: "请先配置 HTTPS 服务地址、assistant ID 和 Bearer Token。",
      };
    }

    let endpoint: string;
    try {
      endpoint = buildMemoryReadUrl(serviceBaseUrl);
    } catch (error) {
      if (error instanceof UrlPolicyError && error.code === "https_required") {
        return { kind: "failed", category: "https", message: error.message };
      }
      return {
        kind: "failed",
        category: "configuration",
        message: error instanceof Error ? error.message : "服务地址无效。",
      };
    }

    let response: ReadTransportResponse;
    try {
      response = await this.transport.postRead({
        url: endpoint,
        assistantId: assistantId.trim(),
        bearerToken,
      });
    } catch {
      return {
        kind: "failed",
        category: "network",
        message: "请求未完成。请检查 HTTPS 证书、网络、CORS 或服务是否发生重定向；Token 和记忆内容未写入日志。",
      };
    }

    if (response.status >= 300 && response.status < 400) {
      return {
        kind: "failed",
        category: "redirect",
        message: "服务返回重定向；认证请求已停止，未继续访问新地址。",
      };
    }
    if (response.status === 401 || response.status === 403) {
      return {
        kind: "failed",
        category: "authentication",
        message: "认证失败；请核对 Bearer Token 和 assistant 绑定。",
      };
    }
    if (response.status < 200 || response.status >= 300) {
      return {
        kind: "failed",
        category: "server",
        message: `Memory 服务返回 HTTP ${response.status}。`,
      };
    }

    try {
      const parsed: unknown = JSON.parse(response.text);
      const validated = validateReadResponse(parsed);
      return {
        kind: "connected",
        message: "连接成功；接口结构已通过本地校验。",
        summary: summarizeReadResponse(validated),
        documents: validated.files,
        pending: validated.pending,
        events: validated.events,
      };
    } catch (error) {
      return {
        kind: "failed",
        category: "protocol",
        message:
          error instanceof ProtocolError
            ? error.message
            : "Memory 服务返回了无法解析的 JSON。",
      };
    }
  }
}

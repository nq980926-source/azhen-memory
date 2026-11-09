export class UrlPolicyError extends Error {
  constructor(
    readonly code:
      | "invalid_url"
      | "https_required"
      | "userinfo_not_allowed"
      | "query_not_allowed"
      | "fragment_not_allowed",
    message: string,
  ) {
    super(message);
    this.name = "UrlPolicyError";
  }
}

export function buildMemoryReadUrl(serviceBaseUrl: string): string {
  return buildMemoryActionUrl(serviceBaseUrl, "read");
}

export function buildMemoryActionUrl(
  serviceBaseUrl: string,
  action: string,
): string {
  if (!/^[a-z_]+$/.test(action)) {
    throw new UrlPolicyError("invalid_url", "Memory 操作名称无效。");
  }
  const raw = serviceBaseUrl.trim();
  if (!raw) throw new UrlPolicyError("invalid_url", "尚未配置 Memory 服务地址。");

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new UrlPolicyError("invalid_url", "Memory 服务地址不是有效 URL。");
  }

  if (url.protocol !== "https:") {
    throw new UrlPolicyError("https_required", "Memory 服务只允许 HTTPS。");
  }
  if (url.username || url.password) {
    throw new UrlPolicyError("userinfo_not_allowed", "服务地址不能包含用户名或密码。");
  }
  if (url.search) {
    throw new UrlPolicyError("query_not_allowed", "服务地址不能包含查询参数。");
  }
  if (url.hash) {
    throw new UrlPolicyError("fragment_not_allowed", "服务地址不能包含片段。");
  }

  let path = url.pathname.replace(/\/+$/, "");
  path = path.replace(/\/(?:sse|mcp)$/i, "");
  path = path.replace(/\/operations\/azhen-memory\/v1$/i, "");
  path = `${path}/operations/azhen-memory/v1/${action}`.replace(/\/{2,}/g, "/");
  url.pathname = path;
  return url.toString();
}

export function safeOriginLabel(serviceBaseUrl: string): string {
  try {
    const url = new URL(serviceBaseUrl);
    if (url.protocol !== "https:") return "未配置安全服务";
    return `${url.protocol}//${url.host}`;
  } catch {
    return "未配置服务";
  }
}

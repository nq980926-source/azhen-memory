import type {
  ReadRequest,
  ReadTransport,
  ReadTransportResponse,
} from "./gateway.ts";
import type {
  ActionRequest,
  ActionTransport,
  ActionTransportResponse,
} from "./actions.ts";

const REQUEST_TIMEOUT_MS = 15_000;

/**
 * Use the renderer's standards-based fetch, not Obsidian requestUrl.
 * requestUrl follows redirects without a supported way to disable them;
 * redirect: "error" rejects the redirect before forwarding credentials.
 * HTTPS and the target endpoint are checked by buildMemoryReadUrl beforehand.
 */
export class SafeFetchReadTransport implements ReadTransport, ActionTransport {
  async postRead(request: ReadRequest): Promise<ReadTransportResponse> {
    return this.request(request.url, request.assistantId, request.bearerToken, {
      include_supplement: true,
      assistant_id: request.assistantId,
    });
  }

  async postAction(request: ActionRequest): Promise<ActionTransportResponse> {
    return this.request(request.url, request.assistantId, request.bearerToken, {
      ...request.body,
      assistant_id: request.assistantId,
    });
  }

  private async request(
    url: string,
    _assistantId: string,
    bearerToken: string,
    body: Record<string, unknown>,
  ): Promise<ReadTransportResponse> {
    const controller = new AbortController();
    const timeout = globalThis.setTimeout(
      () => controller.abort(),
      REQUEST_TIMEOUT_MS,
    );

    // Reading only the response text is sufficient to validate schema and
    // limits. Never log the URL, Authorization header or body.
    try {
      const response = await fetch(url, {
        method: "POST",
        mode: "cors",
        redirect: "error",
        credentials: "omit",
        cache: "no-store",
        referrerPolicy: "no-referrer",
        signal: controller.signal,
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          Authorization: `Bearer ${bearerToken}`,
        },
        body: JSON.stringify(body),
      });
      return {
        status: response.status,
        headers: {},
        text: await response.text(),
      };
    } finally {
      globalThis.clearTimeout(timeout);
    }
  }
}

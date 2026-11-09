import assert from "node:assert/strict";
import test from "node:test";
import {
  MemoryActionGateway,
  type ActionRequest,
  type ActionTransport,
  type ActionTransportResponse,
} from "../src/memory/actions.ts";
import {
  MemoryOperationController,
  type MemoryOperationContext,
} from "../src/memory/operation-controller.ts";
import { PendingOperationStore } from "../src/memory/pending-operation.ts";

class MemorySecrets {
  private values = new Map<string, string>();
  getSecret(id: string): string | null {
    return this.values.get(id) ?? null;
  }
  setSecret(id: string, secret: string): void {
    if (secret) this.values.set(id, secret);
    else this.values.delete(id);
  }
}

class SequenceTransport implements ActionTransport {
  requests: ActionRequest[] = [];
  constructor(private readonly responses: ActionTransportResponse[]) {}
  async postAction(request: ActionRequest): Promise<ActionTransportResponse> {
    this.requests.push(request);
    const response = this.responses.shift();
    if (!response) throw new Error("unexpected request");
    return response;
  }
}

const context: MemoryOperationContext = {
  serviceBaseUrl: "https://memory.example.com",
  assistantId: "synthetic-assistant",
  bearerToken: "synthetic-secret",
};
const operationId = "00000000-0000-4000-8000-000000000001";

function json(status: number, body: Record<string, unknown>): ActionTransportResponse {
  return { status, headers: {}, text: JSON.stringify(body) };
}

test("unknown result requires receipt check and reuses the original operation id", async () => {
  const transport = new SequenceTransport([
    json(503, { status: "unknown", error: "unconfirmed" }),
    json(200, { status: "not_committed" }),
    json(200, { status: "confirmed", event_id: "synthetic-event" }),
  ]);
  const store = new PendingOperationStore(new MemorySecrets());
  const controller = new MemoryOperationController(
    store,
    new MemoryActionGateway(transport),
    () => {},
    () => operationId,
    () => 1,
  );
  const fields = {
    target: "profile",
    before: "synthetic old",
    expected_hash: "a".repeat(64),
  };
  const first = await controller.begin(context, "forget", fields);
  assert.equal(first.kind, "unknown");
  assert.equal(store.load()?.operationId, operationId);

  const check = await controller.check(context);
  assert.equal(check.kind, "not_committed");
  assert.equal(controller.canRetry(operationId), true);

  const retry = await controller.retry(context);
  assert.equal(retry.kind, "confirmed");
  assert.equal(store.load(), null);
  assert.equal(transport.requests.length, 3);
  assert.equal(transport.requests[0]?.action, "forget");
  assert.equal(transport.requests[1]?.action, "operation");
  assert.equal(
    transport.requests[1]?.body.operation_id,
    operationId,
  );
  assert.deepEqual(transport.requests[2]?.body, transport.requests[0]?.body);
});

test("retry is blocked until the server explicitly reports not_committed", async () => {
  const transport = new SequenceTransport([
    json(503, { status: "unknown" }),
  ]);
  const controller = new MemoryOperationController(
    new PendingOperationStore(new MemorySecrets()),
    new MemoryActionGateway(transport),
    () => {},
    () => operationId,
  );
  await controller.begin(context, "undo", {
    event_id: "synthetic-event",
    expected_hash: "a".repeat(64),
  });
  await assert.rejects(() => controller.retry(context));
  assert.equal(transport.requests.length, 1);
});

test("explicit conflict clears the transient operation and reports rejection", async () => {
  const transport = new SequenceTransport([
    json(409, {
      status: "conflict",
      code: "stale_version",
      error: "changed",
    }),
  ]);
  const store = new PendingOperationStore(new MemorySecrets());
  const controller = new MemoryOperationController(
    store,
    new MemoryActionGateway(transport),
    () => {},
    () => operationId,
  );
  const result = await controller.begin(context, "correct", {
    target: "profile",
    before: "synthetic old",
    after: "synthetic new",
    expected_hash: "a".repeat(64),
  });
  assert.equal(result.kind, "rejected");
  assert.equal(result.kind === "rejected" ? result.code : null, "stale_version");
  assert.equal(store.load(), null);
});

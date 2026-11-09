import assert from "node:assert/strict";
import test from "node:test";
import {
  MemoryActionError,
  MemoryActionGateway,
  type ActionRequest,
  type ActionTransport,
  type ActionTransportResponse,
} from "../src/memory/actions.ts";

class FakeTransport implements ActionTransport {
  requests: ActionRequest[] = [];
  constructor(private readonly response: ActionTransportResponse) {}
  async postAction(request: ActionRequest): Promise<ActionTransportResponse> {
    this.requests.push(request);
    return this.response;
  }
}

test("confirm action uses the exact contract and version fields", async () => {
  const transport = new FakeTransport({
    status: 200,
    headers: {},
    text: JSON.stringify({ status: "confirmed", event_id: "synthetic-event" }),
  });
  const gateway = new MemoryActionGateway(transport);
  const body = {
    proposal_id: "synthetic-proposal",
    target: "profile",
    expected_hash: "a".repeat(64),
    review_hash: "b".repeat(64),
    operation_id: "00000000-0000-4000-8000-000000000001",
  };
  const result = await gateway.invoke(
    "https://memory.example.com",
    "assistant",
    "synthetic-secret",
    "confirm",
    body,
  );
  assert.equal(result.body.status, "confirmed");
  assert.equal(
    transport.requests[0]?.url,
    "https://memory.example.com/operations/azhen-memory/v1/confirm",
  );
  assert.deepEqual(transport.requests[0]?.body, body);
});

test("409 conflicts preserve the server reason code as a rejection", async () => {
  const transport = new FakeTransport({
    status: 409,
    headers: {},
    text: JSON.stringify({
      status: "conflict",
      code: "stale_version",
      error: "Memory changed",
    }),
  });
  await assert.rejects(
    () =>
      new MemoryActionGateway(transport).invoke(
        "https://memory.example.com",
        "assistant",
        "synthetic-secret",
        "correct",
        { operation_id: "00000000-0000-4000-8000-000000000001" },
      ),
    (error) =>
      error instanceof MemoryActionError &&
      error.disposition === "rejected" &&
      error.code === "stale_version" &&
      error.httpStatus === 409,
  );
});

test("503 and malformed success responses are treated as unknown", async () => {
  for (const response of [
    {
      status: 503,
      headers: {},
      text: JSON.stringify({ status: "unknown", error: "unconfirmed" }),
    },
    { status: 200, headers: {}, text: "not-json" },
  ]) {
    await assert.rejects(
      () =>
        new MemoryActionGateway(new FakeTransport(response)).invoke(
          "https://memory.example.com",
          "assistant",
          "synthetic-secret",
          "forget",
          { operation_id: "00000000-0000-4000-8000-000000000001" },
        ),
      (error) =>
        error instanceof MemoryActionError &&
        error.disposition === "unknown",
    );
  }
});

test("all management actions use their fixed routes and payloads", async () => {
  const cases = [
    ["reject", { proposal_id: "p", operation_id: "o" }],
    ["correct", { target: "profile", before: "a", after: "b" }],
    ["forget", { target: "profile", before: "a" }],
    ["undo", { event_id: "e" }],
    ["propose_correction", { target: "profile", before: "a", after: "b" }],
    ["operation", { operation_id: "o" }],
  ] as const;
  for (const [action, body] of cases) {
    const transport = new FakeTransport({
      status: 200,
      headers: {},
      text: JSON.stringify({ status: "confirmed" }),
    });
    await new MemoryActionGateway(transport).invoke(
      "https://memory.example.com",
      "assistant",
      "synthetic-secret",
      action,
      body,
    );
    assert.equal(
      transport.requests[0]?.url,
      `https://memory.example.com/operations/azhen-memory/v1/${action}`,
    );
    assert.deepEqual(transport.requests[0]?.body, body);
  }
});

import assert from "node:assert/strict";
import test from "node:test";
import {
  MemoryReadOnlyGateway,
  type ReadRequest,
  type ReadTransport,
  type ReadTransportResponse,
} from "../src/memory/gateway.ts";

class CountingTransport implements ReadTransport {
  calls: ReadRequest[] = [];
  constructor(private readonly outcome: ReadTransportResponse | Error) {}
  async postRead(request: ReadRequest): Promise<ReadTransportResponse> {
    this.calls.push(request);
    if (this.outcome instanceof Error) throw this.outcome;
    return this.outcome;
  }
}

const response = {
  schema: 1,
  files: [{ path: "/profile.md", content: "# Synthetic profile\nTest only", version: "a".repeat(64) }],
  pending: [],
  events: [],
  capabilities: { correction_proposals: 0 },
};

test("valid HTTPS URL connects and keeps memory in the returned in-memory result", async () => {
  const transport = new CountingTransport({ status: 200, headers: {}, text: JSON.stringify(response) });
  const gateway = new MemoryReadOnlyGateway(transport);
  const result = await gateway.verify("https://memory.example.com", "assistant-id", "synthetic-token");
  assert.equal(result.kind, "connected");
  if (result.kind === "connected") {
    assert.equal(result.summary.profileBytes > 0, true);
    assert.equal(result.documents[0]?.content, "# Synthetic profile\nTest only");
  }
  assert.equal(transport.calls.length, 1);
  assert.equal(transport.calls[0]?.url, "https://memory.example.com/operations/azhen-memory/v1/read");
});

test("rejects HTTP before sending the token", async () => {
  const transport = new CountingTransport({ status: 200, headers: {}, text: "{}" });
  const result = await new MemoryReadOnlyGateway(transport).verify("http://memory.example.com", "assistant-id", "synthetic-token");
  assert.equal(result.kind, "failed");
  assert.equal(result.kind === "failed" ? result.category : null, "https");
  assert.equal(transport.calls.length, 0);
});

test("401 and 403 return authentication failures", async () => {
  for (const status of [401, 403]) {
    const transport = new CountingTransport({ status, headers: {}, text: "" });
    const result = await new MemoryReadOnlyGateway(transport).verify("https://memory.example.com", "id", "synthetic-token");
    assert.equal(result.kind === "failed" ? result.category : null, "authentication");
  }
});

test("returns protocol failure for malformed JSON or missing profile", async () => {
  for (const payload of ["not-json", JSON.stringify({ ...response, files: [] })]) {
    const transport = new CountingTransport({ status: 200, headers: {}, text: payload });
    const result = await new MemoryReadOnlyGateway(transport).verify("https://memory.example.com", "id", "synthetic-token");
    assert.equal(result.kind === "failed" ? result.category : null, "protocol");
  }
});

test("network or CORS error gives a generic response without leaking credentials", async () => {
  const transport = new CountingTransport(new Error("Synthetic token must not appear in UI"));
  const result = await new MemoryReadOnlyGateway(transport).verify("https://memory.example.com", "id", "synthetic-token");
  assert.equal(result.kind === "failed" ? result.category : null, "network");
  assert.equal(JSON.stringify(result).includes("synthetic-token"), false);
});

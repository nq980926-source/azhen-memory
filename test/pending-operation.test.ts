import assert from "node:assert/strict";
import test from "node:test";
import {
  PendingOperationStore,
  createPendingOperation,
  operationMatchesBinding,
} from "../src/memory/pending-operation.ts";

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

const binding = {
  serviceBaseUrl: "https://memory.example.com",
  assistantId: "synthetic-assistant",
};
const operationId = "00000000-0000-4000-8000-000000000001";

test("pending write keeps the same operation id and body across reload", () => {
  const secrets = new MemorySecrets();
  const store = new PendingOperationStore(secrets);
  const operation = createPendingOperation(
    binding,
    "forget",
    {
      target: "profile",
      before: "synthetic old",
      expected_hash: "a".repeat(64),
    },
    operationId,
    1,
  );
  store.save(operation);
  const reloaded = new PendingOperationStore(secrets).load();
  assert.deepEqual(reloaded, operation);
  assert.equal(reloaded?.operationId, operationId);
  assert.equal(operationMatchesBinding(operation, binding), true);
});

test("pending write blocks reuse under a different binding", () => {
  const operation = createPendingOperation(
    binding,
    "correct",
    {
      target: "profile",
      before: "synthetic old",
      after: "synthetic new",
      expected_hash: "a".repeat(64),
    },
    operationId,
  );
  assert.equal(
    operationMatchesBinding(operation, {
      ...binding,
      assistantId: "another-assistant",
    }),
    false,
  );
});

test("clear removes the transient encrypted write record", () => {
  const secrets = new MemorySecrets();
  const store = new PendingOperationStore(secrets);
  store.save(
    createPendingOperation(
      binding,
      "undo",
      { event_id: "synthetic-event", expected_hash: "a".repeat(64) },
      operationId,
    ),
  );
  store.clear();
  assert.equal(store.load(), null);
});

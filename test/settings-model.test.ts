import assert from "node:assert/strict";
import test from "node:test";
import {
  containsPossiblePlaintextSecret,
  normalizeSettings,
} from "../src/settings-model.ts";

test("normalizes configuration to secret references only", () => {
  const stored = {
    serviceBaseUrl: "https://memory.example.com",
    assistantId: "synthetic-assistant",
    bearerSecretId: "untrusted-secret-id",
    token: "synthetic-token",
    authorization: "synthetic-header",
  };
  const settings = normalizeSettings(stored);
  assert.deepEqual(settings, {
    serviceBaseUrl: "https://memory.example.com",
    assistantId: "synthetic-assistant",
    bearerSecretId: "azhen-memory-bearer",
  });
  assert.doesNotMatch(JSON.stringify(settings), /synthetic-token|synthetic-header/);
  assert.equal(containsPossiblePlaintextSecret(stored), true);
});

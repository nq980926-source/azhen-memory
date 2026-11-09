import assert from "node:assert/strict";
import test from "node:test";
import { SafeFetchReadTransport } from "../src/memory/obsidian-read-transport.ts";

test("fetch transport hard-stops redirects and sends only the read payload", async () => {
  const priorFetch = globalThis.fetch;
  let receivedUrl = "";
  let init: RequestInit | undefined;
  try {
    globalThis.fetch = async (url, options) => {
      receivedUrl = String(url);
      init = options;
      return new Response('{"schema":1}', { status: 200, headers: { "Content-Type": "application/json" } });
    };
    const result = await new SafeFetchReadTransport().postRead({
      url: "https://memory.example.com/operations/azhen-memory/v1/read",
      assistantId: "fake-assistant-id",
      bearerToken: "synthetic-secret",
    });
    assert.equal(result.status, 200);
    assert.equal(receivedUrl, "https://memory.example.com/operations/azhen-memory/v1/read");
    assert.equal(init?.method, "POST");
    assert.equal(init?.mode, "cors");
    assert.equal(init?.redirect, "error");
    assert.equal(init?.credentials, "omit");
    assert.equal(init?.referrerPolicy, "no-referrer");
    assert.equal((init?.headers as Record<string, string>).Authorization, "Bearer synthetic-secret");
    assert.deepEqual(JSON.parse(String(init?.body)), {
      include_supplement: true,
      assistant_id: "fake-assistant-id",
    });
  } finally {
    globalThis.fetch = priorFetch;
  }
});

test("redirect-blocked fetch failure is propagated without following the redirect", async () => {
  const priorFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => { throw new TypeError("Failed to fetch"); };
    await assert.rejects(() => new SafeFetchReadTransport().postRead({
      url: "https://memory.example.com/operations/azhen-memory/v1/read",
      assistantId: "id",
      bearerToken: "synthetic-secret",
    }));
  } finally {
    globalThis.fetch = priorFetch;
  }
});

test("action transport sends the exact body and assistant identity", async () => {
  const priorFetch = globalThis.fetch;
  let init: RequestInit | undefined;
  try {
    globalThis.fetch = async (_url, options) => {
      init = options;
      return new Response('{"status":"confirmed"}', { status: 200 });
    };
    await new SafeFetchReadTransport().postAction({
      url: "https://memory.example.com/operations/azhen-memory/v1/correct",
      assistantId: "fake-assistant-id",
      bearerToken: "synthetic-secret",
      action: "correct",
      body: {
        target: "profile",
        before: "synthetic old",
        after: "synthetic new",
        expected_hash: "a".repeat(64),
        operation_id: "00000000-0000-4000-8000-000000000001",
      },
    });
    assert.deepEqual(JSON.parse(String(init?.body)), {
      target: "profile",
      before: "synthetic old",
      after: "synthetic new",
      expected_hash: "a".repeat(64),
      operation_id: "00000000-0000-4000-8000-000000000001",
      assistant_id: "fake-assistant-id",
    });
    assert.equal(init?.redirect, "error");
    assert.equal(init?.credentials, "omit");
  } finally {
    globalThis.fetch = priorFetch;
  }
});

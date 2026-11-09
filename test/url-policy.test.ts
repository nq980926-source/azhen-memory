import assert from "node:assert/strict";
import test from "node:test";
import {
  buildMemoryActionUrl,
  buildMemoryReadUrl,
  UrlPolicyError,
} from "../src/security/url-policy.ts";

test("builds the exact read endpoint and normalizes SSE/MCP suffixes", () => {
  assert.equal(
    buildMemoryReadUrl("https://memory.example.com/azhen/sse"),
    "https://memory.example.com/azhen/operations/azhen-memory/v1/read",
  );
  assert.equal(
    buildMemoryReadUrl("https://memory.example.com/azhen/mcp"),
    "https://memory.example.com/azhen/operations/azhen-memory/v1/read",
  );
  assert.equal(
    buildMemoryReadUrl("https://memory.example.com"),
    "https://memory.example.com/operations/azhen-memory/v1/read",
  );
});

test("rejects non-HTTPS and credential-bearing URLs", () => {
  assert.throws(
    () => buildMemoryReadUrl("http://memory.example.com"),
    (error) => error instanceof UrlPolicyError && error.code === "https_required",
  );
  assert.throws(
    () => buildMemoryReadUrl("https://user:pass@memory.example.com"),
    (error) =>
      error instanceof UrlPolicyError && error.code === "userinfo_not_allowed",
  );
});

test("builds only the fixed Memory action route", () => {
  assert.equal(
    buildMemoryActionUrl("https://memory.example.com/sse", "confirm"),
    "https://memory.example.com/operations/azhen-memory/v1/confirm",
  );
  assert.throws(() =>
    buildMemoryActionUrl("https://memory.example.com", "../read"),
  );
});

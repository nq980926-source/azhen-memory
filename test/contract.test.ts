import assert from "node:assert/strict";
import test from "node:test";
import {
  ProtocolError,
  summarizeReadResponse,
  validateReadResponse,
} from "../src/memory/contract.ts";

const version = "a".repeat(64);
const proposal = {
  id: "synthetic-proposal",
  kind: "preference",
  target: "profile",
  text: "synthetic candidate",
  quote: "synthetic quote",
  source_key: "conversation/source",
  source_hash: "b".repeat(64),
  created_at: 1,
  status: "pending",
};
const event = {
  id: "synthetic-event",
  action: "correct",
  target: "profile",
  before: "synthetic old",
  after: "synthetic new",
  time: 1,
  source: {
    source_key: "conversation/source",
    source_hash: "b".repeat(64),
    quote: "synthetic quote",
  },
};

test("validates the schema=1 read contract without exposing content in its summary", () => {
  const response = validateReadResponse({
    schema: 1,
    files: [
      { path: "/profile.md", content: "synthetic profile", version },
      {
        path: "/recent.md",
        content: "synthetic supplement",
        version: "b".repeat(64),
      },
    ],
    pending: [proposal],
    events: [event, { ...event, id: "synthetic-event-2" }],
    capabilities: { correction_proposals: 1 },
  });
  const summary = summarizeReadResponse(response);
  assert.equal(summary.schema, 1);
  assert.equal(summary.pendingCount, 1);
  assert.equal(summary.eventCount, 2);
  assert.equal(summary.correctionProposals, true);
  assert.doesNotMatch(JSON.stringify(summary), /synthetic/);
});

test("parses candidate and history evidence fields", () => {
  const response = validateReadResponse({
    schema: 1,
    files: [{ path: "/profile.md", content: "synthetic profile", version }],
    pending: [{
      ...proposal,
      action: "correct",
      before: "synthetic old",
      after: "synthetic new",
      review_hash: "c".repeat(64),
    }],
    events: [{
      ...event,
      operation_id: "synthetic-operation",
      proposal_id: "synthetic-proposal",
    }],
    capabilities: { correction_proposals: 1 },
  });
  assert.equal(response.pending[0]?.action, "correct");
  assert.equal(response.pending[0]?.reviewHash, "c".repeat(64));
  assert.equal(response.events[0]?.source.key, "conversation/source");
  assert.equal(response.events[0]?.operationId, "synthetic-operation");
});

test("rejects unsupported schema", () => {
  assert.throws(
    () => validateReadResponse({ schema: 2, files: [], pending: [], events: [] }),
    (error) =>
      error instanceof ProtocolError && error.code === "unsupported_schema",
  );
});

test("rejects missing profile, duplicate documents, and non-hash versions", () => {
  assert.throws(
    () =>
      validateReadResponse({
        schema: 1,
        files: [],
        pending: [],
        events: [],
      }),
    (error) => error instanceof ProtocolError && error.code === "missing_profile",
  );
  assert.throws(
    () =>
      validateReadResponse({
        schema: 1,
        files: [
          { path: "/profile.md", content: "", version },
          { path: "/profile.md", content: "", version },
        ],
        pending: [],
        events: [],
      }),
    (error) =>
      error instanceof ProtocolError && error.code === "duplicate_document",
  );
  assert.throws(
    () =>
      validateReadResponse({
        schema: 1,
        files: [{ path: "/profile.md", content: "", version: "short" }],
        pending: [],
        events: [],
      }),
    (error) => error instanceof ProtocolError && error.code === "invalid_document",
  );
});

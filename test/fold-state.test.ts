import assert from "node:assert/strict";
import test from "node:test";
import { SessionFoldState } from "../src/fold-state.ts";

test("top-level sections default to current memory only", () => {
  const folds = new SessionFoldState();
  assert.equal(folds.isTopLevelOpen("pending"), false);
  assert.equal(folds.isTopLevelOpen("current"), true);
  assert.equal(folds.isTopLevelOpen("history"), false);
});

test("top-level and detail sections toggle independently", () => {
  const folds = new SessionFoldState();
  folds.setTopLevelOpen("pending", true);
  folds.setTopLevelOpen("history", true);
  folds.setSectionOpen("doc:1", true);
  folds.setSectionOpen("doc:2", true);
  folds.setCandidateOpen("candidate", true);
  folds.setEventOpen("event", true);
  folds.setEntryOpen("entry", true);

  assert.equal(folds.isTopLevelOpen("current"), true);
  assert.equal(folds.isTopLevelOpen("pending"), true);
  assert.equal(folds.isTopLevelOpen("history"), true);
  assert.equal(folds.isSectionOpen("doc:1"), true);
  assert.equal(folds.isSectionOpen("doc:2"), true);
  assert.equal(folds.isCandidateOpen("candidate"), true);
  assert.equal(folds.isEventOpen("event"), true);
  assert.equal(folds.isEntryOpen("entry"), true);

  folds.setSectionOpen("doc:1", false);
  assert.equal(folds.isSectionOpen("doc:1"), false);
  assert.equal(folds.isSectionOpen("doc:2"), true);
});

test("a new session fold state restores defaults", () => {
  const first = new SessionFoldState();
  first.setTopLevelOpen("current", false);
  first.setTopLevelOpen("history", true);
  const reopened = new SessionFoldState();
  assert.equal(reopened.isTopLevelOpen("current"), true);
  assert.equal(reopened.isTopLevelOpen("history"), false);
});

test("folding does not mutate an independent edit draft", () => {
  const folds = new SessionFoldState();
  const draft = {
    sourceBefore: "- original",
    after: "uncommitted replacement",
  };
  folds.setEntryOpen("entry", true);
  folds.setSectionOpen("section", true);
  folds.setTopLevelOpen("current", false);
  assert.deepEqual(draft, {
    sourceBefore: "- original",
    after: "uncommitted replacement",
  });
});

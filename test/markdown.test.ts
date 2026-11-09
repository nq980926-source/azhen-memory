import assert from "node:assert/strict";
import test from "node:test";
import { parseMemoryDocument, summaryText } from "../src/memory/markdown.ts";

function document(path: "/profile.md" | "/recent.md", content: string) {
  return { path, content, version: "a".repeat(64) } as const;
}

test("keeps original Markdown heading order and hierarchy", () => {
  const parsed = parseMemoryDocument(document("/profile.md", [
    "# 档案",
    "标题前引言",
    "## 基本身份",
    "- 身份一",
    "### 详细说明",
    "- 下级内容",
    "## 沟通规则",
    "- 规则一",
  ].join("\n")));
  assert.deepEqual(
    parsed.sections.map((section) => [section.level, section.title]),
    [
      [1, "档案"],
      [2, "基本身份"],
      [3, "详细说明"],
      [2, "沟通规则"],
    ],
  );
  assert.equal(parsed.roots.length, 1);
  assert.equal(parsed.roots[0]?.children.length, 2);
  assert.equal(parsed.roots[0]?.children[0]?.children[0]?.title, "详细说明");
  assert.equal(parsed.roots[0]?.entries[0]?.before, "标题前引言");
});

test("same heading names in different files remain isolated by document path", () => {
  const profile = parseMemoryDocument(
    document("/profile.md", "## 沟通规则\n- 长期规则"),
  );
  const recent = parseMemoryDocument(
    document("/recent.md", "## 沟通规则\n- 近期规则"),
  );
  assert.equal(profile.sections[0]?.title, recent.sections[0]?.title);
  assert.notEqual(profile.sections[0]?.key, recent.sections[0]?.key);
  assert.match(profile.sections[0]?.key ?? "", /^\/profile\.md:/);
  assert.match(recent.sections[0]?.key ?? "", /^\/recent\.md:/);
});

test("content without a heading is retained in the orphan entry group", () => {
  const parsed = parseMemoryDocument(
    document("/profile.md", "无标题内容\n\n<!-- marker -->\n补充内容"),
  );
  assert.equal(parsed.sections.length, 0);
  assert.deepEqual(
    parsed.orphanEntries.map((entry) => entry.before),
    ["无标题内容", "补充内容"],
  );
});

test("summary is shortened without changing the exact before fragment", () => {
  const before = `- ${"很长的记忆内容".repeat(30)}`;
  const parsed = parseMemoryDocument(
    document("/profile.md", `## 长内容\n${before}`),
  );
  const entry = parsed.sections[0]?.entries[0];
  assert.equal(entry?.before, before);
  assert.notEqual(entry?.summary, before);
  assert.equal(entry?.summary.endsWith("…"), true);
});

test("headings inside fenced code are content, not categories", () => {
  const parsed = parseMemoryDocument(
    document("/profile.md", [
      "## 真实标题",
      "```",
      "## 不是标题",
      "```",
      "- 实际内容",
    ].join("\n")),
  );
  assert.deepEqual(
    parsed.sections.map((section) => section.title),
    ["真实标题"],
  );
  assert.equal(
    parsed.sections[0]?.entries.some(
      (entry) => entry.before === "## 不是标题" && !entry.actionable,
    ),
    true,
  );
});

test("duplicate exact lines are marked unsafe while both remain visible", () => {
  const parsed = parseMemoryDocument(
    document("/profile.md", "## 规则\n- 重复\n- 重复"),
  );
  const entries = parsed.sections[0]?.entries ?? [];
  assert.equal(entries.length, 2);
  assert.equal(entries.every((entry) => entry.before === "- 重复"), true);
  assert.equal(entries.every((entry) => entry.actionable === false), true);
});

test("summary helper does not mutate display text", () => {
  const value = "- 正常内容";
  assert.equal(summaryText(value), "正常内容");
  assert.equal(value, "- 正常内容");
});

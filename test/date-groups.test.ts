import assert from "node:assert/strict";
import test from "node:test";
import { parseMemoryDocument } from "../src/memory/markdown.ts";
import { groupAutomaticDateSections } from "../src/memory/date-groups.ts";

function parse(content: string) {
  return parseMemoryDocument({ path: "/profile.md", content, version: "a".repeat(64) });
}

test("same date merges for display and preserves every entry and its operation identity", () => {
  const parsed = parse("## 自动整理·2026-11-17\n- 第一条\n<!-- fact -->\n## 自动整理·2026-11-17\n- 第二条");
  const snapshot = JSON.stringify(parsed);
  const groups = groupAutomaticDateSections(parsed.sections);
  assert.equal(groups.length, 1);
  assert.equal(groups[0]?.entries.length, 2);
  assert.equal(groups[0]?.key, parsed.sections[0]?.key);
  assert.strictEqual(groups[0]?.entries[0], parsed.sections[0]?.entries[0]);
  assert.strictEqual(groups[0]?.entries[1], parsed.sections[1]?.entries[0]);
  assert.equal(JSON.stringify(parsed), snapshot);
});

test("different dates stay separate; equivalent date padding and spacing merge", () => {
  const groups = groupAutomaticDateSections(parse("## 自动整理·2026-1-7\n- 一\n## 自动整理 · 2026-01-07 ##\n- 二\n## 自动整理·2026-01-17\n- 三").sections);
  assert.deepEqual(groups.map(s => s.entries.length), [2, 1]);
});

test("mixed and repeated custom headings remain intact in first occurrence order", () => {
  const groups = groupAutomaticDateSections(parse("## 自动整理·2026-11-17\n- 一\n## 教学规则\n- 规则一\n## 自动整理·2026-11-17\n- 二\n## 教学规则\n- 规则二\n## 自动整理·2026-11-17 备注\n- 三").sections);
  assert.deepEqual(groups.map(s => s.title), ["自动整理·2026-11-17", "教学规则", "教学规则", "自动整理·2026-11-17 备注"]);
  assert.deepEqual(groups.map(s => s.entries.length), [2, 1, 1, 1]);
});

test("empty date groups merge with zero count, or with the nonempty group", () => {
  assert.deepEqual(groupAutomaticDateSections(parse("## 自动整理·2026-11-17\n## 自动整理·2026-11-17").sections).map(s => s.entries.length), [0]);
  assert.deepEqual(groupAutomaticDateSections(parse("## 自动整理·2026-11-17\n## 自动整理·2026-11-17\n- 一").sections).map(s => s.entries.length), [1]);
  assert.deepEqual(groupAutomaticDateSections([]), []);
});

test("invalid calendar dates and near matches are not merged", () => {
  for (const title of ["自动整理·2026-02-29", "自动整理·2026-13-01", "自动整理·2026-00-01", "自动整理·2026-11-31", "自动整理·2026-11-00", "自动整理·2026/11/17", "项目自动整理·2026-11-17"]) {
    assert.equal(groupAutomaticDateSections(parse(`## ${title}\n- 一\n## ${title}\n- 二`).sections).length, 2, title);
  }
  assert.equal(groupAutomaticDateSections(parse("## 自动整理·2028-02-29\n- 一\n## 自动整理·2028-02-29\n- 二").sections).length, 1);
});

test("different parents, heading levels and documents do not mix", () => {
  const parsed = parse("# 甲\n## 自动整理·2026-11-17\n- 一\n# 乙\n## 自动整理·2026-11-17\n- 二\n### 自动整理·2026-11-17\n- 三");
  assert.equal(groupAutomaticDateSections(parsed.sections).length, 5);
  const other = parseMemoryDocument({ path: "/recent.md", content: "## 自动整理·2026-11-17\n- 四", version: "b".repeat(64) });
  assert.equal(groupAutomaticDateSections([...parse("## 自动整理·2026-11-17\n- 一").sections, ...other.sections]).length, 2);
});

test("duplicate entries remain visible with their original unsafe operation flags", () => {
  const groups = groupAutomaticDateSections(parse("## 自动整理·2026-11-17\n- 重复\n## 自动整理·2026-11-17\n- 重复").sections);
  assert.equal(groups[0]?.entries.length, 2);
  assert.equal(groups[0]?.entries.every(e => !e.actionable), true);
  assert.notEqual(groups[0]?.entries[0]?.key, groups[0]?.entries[1]?.key);
});

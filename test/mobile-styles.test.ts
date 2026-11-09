import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const styles = fs.readFileSync(path.resolve("styles.css"), "utf8");

test("phone styles keep Memory compact without replacing content semantics", () => {
  assert.match(styles, /body\.is-phone \.azhen-memory-view\s*\{/);
  assert.match(styles, /body\.is-phone \.azhen-memory-view__title\s*\{[^}]*font-size:/s);
  assert.match(styles, /body\.is-phone \.azhen-memory-document__body\s*\{[^}]*line-height:/s);
  assert.match(styles, /body\.is-phone \.azhen-memory-category\s*\{[^}]*margin-left:/s);
  assert.match(styles, /body\.is-phone \.azhen-memory-actions button\s*\{[^}]*min-height:/s);
});

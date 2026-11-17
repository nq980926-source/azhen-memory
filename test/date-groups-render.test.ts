import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import test from "node:test";

class Element {
  children: Element[] = [];
  listeners: Record<string, () => void> = {};
  style = { setProperty() {} };
  open = false;
  tag: string;
  text: string;
  constructor(tag = "div", options: any = {}) {
    this.tag = tag;
    this.text = options.text ?? "";
  }
  createEl(tag: string, options: any = {}) {
    const child = new Element(tag, options);
    this.children.push(child);
    return child;
  }
  createDiv(options: any = {}) { return this.createEl("div", options); }
  createSpan(options: any = {}) { return this.createEl("span", options); }
  addEventListener(name: string, fn: () => void) { this.listeners[name] = fn; }
  all(): Element[] { return [this, ...this.children.flatMap(c => c.all())]; }
}

async function view(isMobile: boolean) {
  class Plugin {
    factory: any;
    registerView(_type: string, factory: any) { this.factory = factory; }
    addRibbonIcon() {}
    addCommand() {}
    addSettingTab() {}
    async loadData() { return null; }
  }
  class ItemView {}
  class Modal {}
  class PluginSettingTab {}
  const module: any = { exports: {} };
  const source = fs.readFileSync(new URL("../main.js", import.meta.url), "utf8");
  vm.runInThisContext(`(function(module,exports,require){${source}\n})`)(
    module, module.exports, (id: string) => {
      assert.equal(id, "obsidian");
      return { Plugin, ItemView, Modal, PluginSettingTab, Platform: { isMobile }, Notice: class {} };
    },
  );
  const PluginClass = module.exports.default ?? module.exports;
  const plugin = new PluginClass();
  plugin.app = { secretStorage: {} };
  await plugin.onload();
  return plugin.factory({});
}

for (const mobile of [false, true]) {
  test(`${mobile ? "Android" : "Windows"} rendering groups the date, counts entries and preserves action targets`, async () => {
    const v = await view(mobile);
    const container = new Element();
    const document = { path: "/profile.md", version: "a".repeat(64), content: "## 自动整理·2026-11-17\n- 一\n## 自动整理·2026-11-17\n- 二" };
    const actions: any[] = [];
    v.openEditMemory = (...args: any[]) => actions.push(["edit", ...args]);
    v.openForgetMemory = (...args: any[]) => actions.push(["forget", ...args]);
    v.renderParsedDocument(container, document);
    assert.equal(container.children.length, 1);
    const nodes = container.all();
    assert.equal(nodes.filter(n => n.text === "2 条").length, 1);
    assert.deepEqual(nodes.filter(n => n.tag === "pre").map(n => n.text), ["- 一", "- 二"]);
    const buttons = nodes.filter(n => n.tag === "button");
    assert.equal(buttons.length, 4);
    buttons.forEach(b => b.listeners.click!());
    assert.deepEqual(actions, [
      ["edit", document, "- 一", 1], ["forget", document, "- 一", 1],
      ["edit", document, "- 二", 3], ["forget", document, "- 二", 3],
    ]);
    const group = container.children[0]!;
    group.open = true;
    group.listeners.toggle!();
    const rerender = new Element();
    v.renderParsedDocument(rerender, document);
    assert.equal(rerender.children[0]?.open, true);
  });
}

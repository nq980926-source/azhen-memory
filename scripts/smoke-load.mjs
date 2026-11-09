import fs from "node:fs";
import vm from "node:vm";

class Plugin {
  constructor(app, manifest) {
    this.app = app;
    this.manifest = manifest;
    this.registeredViews = [];
    this.commands = [];
    this.ribbonIcons = [];
    this.settingTabs = [];
  }
  registerView(type, factory) {
    this.registeredViews.push({ type, factory });
  }
  addRibbonIcon(icon, title) {
    this.ribbonIcons.push({ icon, title });
  }
  addCommand(command) {
    this.commands.push(command);
  }
  addSettingTab(tab) {
    this.settingTabs.push(tab);
  }
  async loadData() {
    return null;
  }
  async saveData() {}
}
class ItemView {
  constructor(leaf) {
    this.leaf = leaf;
    this.contentEl = {};
  }
}
class PluginSettingTab {
  constructor(app, plugin) {
    this.app = app;
    this.plugin = plugin;
  }
}
class Modal {
  constructor(app) {
    this.app = app;
  }
}
class Setting {
  setName() { return this; }
  setDesc() { return this; }
  addText() { return this; }
  addButton() { return this; }
}
class Notice {}

const obsidian = { Plugin, ItemView, PluginSettingTab, Modal, Setting, Notice };
const module = { exports: {} };
const source = fs.readFileSync(new URL("../main.js", import.meta.url), "utf8");
const load = vm.runInThisContext(
  `(function(module, exports, require) {${source}\n})`,
  { filename: "main.js" },
);
load(module, module.exports, (id) => {
  if (id === "obsidian") return obsidian;
  throw new Error(`Unexpected external module: ${id}`);
});

const PluginClass = module.exports.default ?? module.exports;
const app = {
  secretStorage: {
    getSecret() { return null; },
    setSecret() {},
  },
  workspace: {
    getLeavesOfType() { return []; },
  },
};
const plugin = new PluginClass(app, { id: "azhen-memory" });
await plugin.onload();
if (plugin.registeredViews.length !== 1) {
  throw new Error("Expected exactly one registered view");
}
if (plugin.commands.length !== 1) {
  throw new Error("Expected exactly one command");
}
plugin.requestStatusRefresh({
  kind: "blocked",
  message: "synthetic connection state",
});
if (plugin.lastCheck == null) {
  throw new Error("Expected a synthetic connection state before invalidation");
}
plugin.invalidateConnectionState();
if (plugin.lastCheck !== null) {
  throw new Error("Connection state was not cleared after settings/auth changes");
}
console.log("Bundle load smoke passed.");

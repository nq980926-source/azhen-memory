import { PluginSettingTab, Setting, type App } from "obsidian";
import type AzhenMemoryPlugin from "./main.ts";

export class AzhenMemorySettingTab extends PluginSettingTab {
  private pendingToken = "";

  constructor(
    app: App,
    private readonly plugin: AzhenMemoryPlugin,
  ) {
    super(app, plugin);
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl("h2", { text: "阿斟 Memory" });
    containerEl.createEl("p", {
      text: "填写已有 Memory 服务地址和 assistant ID。Bearer Token 只保存在 Obsidian Secret Storage。",
    });

    new Setting(containerEl)
      .setName("HTTPS 服务地址")
      .setDesc("可填写服务根地址、MCP 的 /sse 地址或 /mcp 地址。")
      .addText((text) =>
        text
          .setPlaceholder("https://example.com/azhen")
          .setValue(this.plugin.settings.serviceBaseUrl)
          .onChange(async (value) => {
            this.plugin.settings.serviceBaseUrl = value.trim();
            this.plugin.invalidateConnectionState();
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName("Assistant ID")
      .setDesc("Knowledge Memory 绑定使用的 assistant_id。")
      .addText((text) =>
        text
          .setPlaceholder("assistant UUID")
          .setValue(this.plugin.settings.assistantId)
          .onChange(async (value) => {
            this.plugin.settings.assistantId = value.trim();
            this.plugin.invalidateConnectionState();
            await this.plugin.saveSettings();
          }),
      );

    const tokenSetting = new Setting(containerEl)
      .setName("Bearer Token")
      .setDesc(
        this.plugin.hasBearerToken()
          ? "已保存到 Obsidian Secret Storage。输入新值可替换。"
          : "尚未保存。Token 不会写入插件 data.json。",
      );

    tokenSetting.addText((text) => {
      text.inputEl.type = "password";
      text.inputEl.autocomplete = "off";
      text.setPlaceholder("输入后点击保存").onChange((value) => {
        this.pendingToken = value;
      });
    });
    tokenSetting.addButton((button) =>
      button.setButtonText("保存 Token").onClick(async () => {
        if (!this.pendingToken) return;
        this.plugin.setBearerToken(this.pendingToken);
        this.pendingToken = "";
        this.display();
      }),
    );
    tokenSetting.addButton((button) =>
      button.setButtonText("清除 Token").onClick(() => {
        this.plugin.clearBearerToken();
        this.pendingToken = "";
        this.display();
      }),
    );

    containerEl.createEl("p", {
      cls: "setting-item-description",
      text:
        "安全状态：使用原生 fetch 发送 Memory 请求，禁止 HTTP 重定向，不使用 requestUrl；Token 仅通过 HTTPS 发往所配置服务。需服务器允许 Obsidian 来源的 CORS。",
    });
  }
}

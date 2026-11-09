# 阿斟 Memory for Obsidian

**模块化 AI 长期记忆系统（Modular AI Long-Term Memory System）**

阿斟 Memory 是在 Obsidian 中管理 AI 长期记忆的前端插件，重点解决长期记忆的
人工审核、纠正与遗忘、来源追溯和可验证写入。它连接用户已有的 Memory HTTPS
服务，不包含、启动或出售云端 Memory 后端，也不创建第二套数据库或 MCP 服务。

当前版本：`0.2.1`

## 功能

- 在 Obsidian 内查看长期记忆和近期记忆。
- 按 Markdown 原文标题折叠分类，保留原始顺序和标题层级。
- 人工审核待确认候选，执行确认或拒绝。
- 按行纠正当前记忆，使用服务端 `expected_hash` 防止覆盖并发变化。
- 遗忘单条记忆，并从历史中撤销对应变化。
- 查看历史事件、变化前后内容、来源引用、版本哈希和操作标识。
- 从记忆条目追溯到对应来源引文、内容哈希和操作记录。
- 网络超时或结果未知时保留原 `operation_id`，先核对服务器回执。

适合希望为 AI 助手建立可审核、可纠正、可追溯的长期记忆，并直接在 Obsidian
中维护记忆内容的用户。

## 安全边界

- Bearer Token 只保存在 Obsidian SecretStorage，不写入插件 `data.json`。
- 使用 HTTPS 和原生 `fetch`，禁止 HTTP 重定向，不使用 `requestUrl`。
- 插件不记录 Token、请求头或记忆正文。
- 版本冲突不会覆盖服务器最新内容。
- 服务端仍负责最终认证、路径边界和写入保护。

## 安装

需要 Obsidian `1.11.4` 或更高版本。Windows、macOS 与 Android 使用同一组插件文件。

1. 从 Releases 下载 `azhen-memory-0.2.1.zip`。
2. 解压出 `main.js`、`manifest.json` 和 `styles.css`。
3. 放入 Obsidian 仓库目录：

   ```text
   <vault>/.obsidian/plugins/azhen-memory/
   ```

4. 在 Obsidian 的“第三方插件”设置中启用阿斟 Memory；如果已启用，重新加载插件。

插件目录结构应为：

```text
.obsidian/plugins/azhen-memory/
├── main.js
├── manifest.json
├── styles.css
└── data.json        # 启用后由 Obsidian 创建，升级时保留
```

不要删除 `data.json`。Android 与 Windows 更新时只替换前三个文件，现有设置和
SecretStorage 中的 Token 保持不变。

## 配置

在插件设置中填写：

- **HTTPS 服务地址**：你的阿斟 Memory 服务根地址，或该服务的 `/sse`、`/mcp` 地址。
- **Assistant ID**：你的 Knowledge Memory 服务绑定所使用的 ID。
- **Bearer Token**：写入 Obsidian SecretStorage。

本仓库不包含任何实际地址、Assistant ID、Token、API Key 或记忆正文。

## 开发检查

```sh
npm run build
```

构建包含 TypeScript 检查、自动化测试、移动端静态检查和 bundle 加载烟雾检查。

## 许可

MIT。详见 [LICENSE](LICENSE)。

# 阿斟 Memory 0.2.2

本版本只优化 Android 手机界面密度，`main.js` 业务实现与正式 0.2.1 完全相同。Windows、macOS 和 Android 使用相同插件文件。

## 更新内容

- 收紧手机端标题、正文、行高、卡片间距和 Markdown 分类缩进。
- 保留原文标题层级、独立折叠、来源证据、历史、候选审核、纠正、遗忘与撤销。
- 保留插件 ID `azhen-memory`、Memory HTTPS 协议、Assistant ID 绑定和 SecretStorage。
- 桌面端样式和现有配置保持兼容。

## 安装

下载 `azhen-memory-0.2.2.zip`，解压后将 `main.js`、`manifest.json` 和 `styles.css` 放入：

```text
<vault>/.obsidian/plugins/azhen-memory/
```

升级时保留 `data.json`。BRAT 添加 `nq980926-source/azhen-memory` 即可安装或更新。

## 安全

- Release 不包含真实 Token、API Key、Assistant ID、服务地址或 Memory 正文。
- Bearer Token 继续只保存在 Obsidian SecretStorage。

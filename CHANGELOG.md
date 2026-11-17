# Changelog

## 0.2.3 - 2026-11-17

- 将同一文档、同一父级和标题层级内，同日期的“自动整理”分组合并展示，准确累计条数并保留全部原始条目。
- 自定义标题、不同日期和不同文档保持隔离，单条查看及操作定位不变。
- 不修改云端 Markdown、Memory 服务或生产记忆数据。
- 与已验收的 0.2.3-date-ui-test.1 使用相同功能代码；用户已完成 Android 实机三项验收并全部通过。

## 0.2.2 - 2026-11-09

- 优化 Obsidian Android 端的 Memory 信息密度。
- 收紧标题、正文、行高、卡片间距和 Markdown 分类缩进。
- 保持分类折叠、来源、历史、候选审核和全部 Memory 写入流程不变。
- 桌面端样式、插件 ID `azhen-memory` 和现有配置保持兼容。

## 0.2.1 - 2026-11-09

- 发布阿斟 Memory 的首个统一 GitHub Release 构建。
- Windows、macOS 和 Android 使用相同插件文件。
- 保留 0.2.0 的 Memory 接口、路径边界和已验收写入流程。
- 增加待确认候选、原文记忆折叠、纠正、遗忘、撤销与历史来源展示。
- 使用 Obsidian SecretStorage 保存 Bearer Token。
- 网络结果未知时保留原 `operation_id`，先核对服务器回执再重试。

## 0.2.0

- 前序 Memory 管理版本。

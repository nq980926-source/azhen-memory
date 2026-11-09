import { ItemView, type WorkspaceLeaf } from "obsidian";
import type AzhenMemoryPlugin from "./main.ts";
import type { MemoryOperationExecution } from "./memory/operation-controller.ts";
import {
  MemoryActionModal,
} from "./action-modal.ts";
import type { ConnectionCheck } from "./memory/gateway.ts";
import type {
  MemoryEventV1,
  MemoryFileV1,
  MemoryProposalV1,
  MemoryTarget,
} from "./memory/contract.ts";
import type { PendingMemoryOperation } from "./memory/pending-operation.ts";
import { safeOriginLabel } from "./security/url-policy.ts";
import {
  SessionFoldState,
  type TopLevelMemorySection,
} from "./fold-state.ts";
import {
  parseMemoryDocument,
  summaryText,
  type MarkdownMemoryEntry,
  type MarkdownMemorySection,
} from "./memory/markdown.ts";

export const VIEW_TYPE_AZHEN_MEMORY = "azhen-memory-status";

type Feedback = {
  kind: "success" | "error" | "warning";
  message: string;
};

export class AzhenMemoryView extends ItemView {
  private check: ConnectionCheck | null = null;
  private feedback: Feedback | null = null;
  private pendingOperation: PendingMemoryOperation | null = null;
  private pendingLoadError: string | null = null;
  private folds = new SessionFoldState();

  constructor(
    leaf: WorkspaceLeaf,
    private readonly plugin: AzhenMemoryPlugin,
  ) {
    super(leaf);
  }

  getViewType(): string {
    return VIEW_TYPE_AZHEN_MEMORY;
  }

  getDisplayText(): string {
    return "阿斟 Memory";
  }

  getIcon(): string {
    return "brain";
  }

  async onOpen(): Promise<void> {
    this.folds = new SessionFoldState();
    this.check = this.plugin.getLastCheck();
    this.loadPendingOperation();
    this.render();
  }

  renderIdle(): void {
    this.check = null;
    this.render();
  }

  renderCheck(check: ConnectionCheck): void {
    this.check = check;
    this.loadPendingOperation();
    this.render();
  }

  private render(): void {
    const container = this.contentEl;
    container.empty();
    container.addClass("azhen-memory-view");

    const header = container.createDiv({ cls: "azhen-memory-view__header" });
    header.createEl("h2", {
      cls: "azhen-memory-view__title",
      text: "阿斟 Memory",
    });
    header.createEl("div", {
      cls: "azhen-memory-view__subtitle",
      text: "长期记忆管理、候选审核与历史变化",
    });
    const toolbar = header.createDiv({ cls: "azhen-memory-toolbar" });
    const refreshButton = toolbar.createEl("button", {
      text: this.check ? "刷新记忆" : "验证连接",
      attr: { type: "button" },
    });
    refreshButton.addEventListener("click", () => {
      void this.refreshWithButton(refreshButton);
    });

    this.renderStatus(container);
    this.renderFeedback(container);
    this.renderPendingOperation(container);

    if (this.check?.kind === "connected") {
      this.renderSummary(container, this.check);
      this.renderCandidates(container, this.check.pending);
      this.renderDocuments(container, this.check.documents);
      this.renderHistory(container, this.check.events);
    }

    container.createDiv({
      cls: "azhen-memory-security-note",
      text:
        "安全边界：所有写入均使用服务端版本校验和 UUID 幂等回执。当前内容只在本次界面显示；结果未知的操作会暂存于 Obsidian SecretStorage，并在核对或放弃后清除。",
    });
  }

  private renderStatus(container: HTMLElement): void {
    const check = this.check;
    const statusClass =
      check?.kind === "connected"
        ? "is-connected"
        : check?.kind === "failed"
          ? "is-error"
          : check?.kind === "blocked"
            ? "is-blocked"
            : "";
    const card = container.createDiv({
      cls: `azhen-memory-status ${statusClass}`.trim(),
    });
    card.createDiv({
      cls: "azhen-memory-status__label",
      text: check ? statusLabel(check) : "尚未验证连接",
    });
    card.createDiv({
      cls: "azhen-memory-status__detail",
      text: check?.message ?? "点击“验证连接”读取当前 Memory。",
    });
    const meta = card.createDiv({ cls: "azhen-memory-status__meta" });
    meta.createDiv({
      text: `服务：${safeOriginLabel(this.plugin.settings.serviceBaseUrl)}`,
    });
    meta.createDiv({
      text:
        check?.kind === "connected"
          ? `接口版本：schema ${check.summary.schema}；纠正候选能力：${
              check.summary.correctionProposals ? "可用" : "未声明"
            }`
          : "接口版本：尚未取得",
    });
    if (check?.kind === "failed") {
      meta.createDiv({ text: `错误类别：${check.category}` });
    }
  }

  private renderFeedback(container: HTMLElement): void {
    if (!this.feedback) return;
    container.createDiv({
      cls: `azhen-memory-feedback is-${this.feedback.kind}`,
      text: this.feedback.message,
    });
  }

  private renderPendingOperation(container: HTMLElement): void {
    if (this.pendingLoadError) {
      container.createDiv({
        cls: "azhen-memory-feedback is-error",
        text: this.pendingLoadError,
      });
      return;
    }
    const operation = this.pendingOperation;
    if (!operation) return;

    const section = container.createDiv({
      cls: "azhen-memory-pending-operation",
    });
    section.createEl("h3", { text: "有未确认的写入操作" });
    section.createDiv({
      text: `${actionLabel(operation.action)} · 创建于 ${formatTime(
        operation.createdAt,
      )}`,
    });
    if (!this.plugin.pendingOperationMatchesCurrentBinding(operation)) {
      section.createDiv({
        cls: "azhen-memory-warning",
        text:
          "该操作属于之前的服务地址或 Assistant ID。为避免写错对象，当前配置下不能核对、重试或丢弃。",
      });
      return;
    }
    section.createDiv({
      cls: "setting-item-description",
      text:
        "不要新建相同内容的操作。先核对服务端回执；只有服务器明确返回 not_committed 后，才允许使用原操作标识重试。",
    });
    const actions = section.createDiv({ cls: "azhen-memory-actions" });
    const checkButton = actions.createEl("button", {
      text: "核对服务器回执",
      attr: { type: "button" },
    });
    checkButton.addEventListener("click", () => {
      void this.checkPending(checkButton);
    });
    const retryButton = actions.createEl("button", {
      text: "重试原操作",
      attr: { type: "button" },
    });
    retryButton.disabled = !this.plugin.canRetryPendingOperation(
      operation.operationId,
    );
    retryButton.addEventListener("click", () => {
      void this.retryPending(retryButton);
    });
    const discardButton = actions.createEl("button", {
      text: "确认未提交并放弃",
      attr: { type: "button" },
    });
    discardButton.disabled = retryButton.disabled;
    discardButton.addClass("mod-warning");
    discardButton.addEventListener("click", () => {
      this.openDiscardModal();
    });
  }

  private renderSummary(
    container: HTMLElement,
    check: Extract<ConnectionCheck, { kind: "connected" }>,
  ): void {
    const summary = check.summary;
    const grid = container.createDiv({ cls: "azhen-memory-summary-grid" });
    this.summaryCard(grid, "待确认候选", String(summary.pendingCount));
    this.summaryCard(grid, "历史事件", String(summary.eventCount));
    this.summaryCard(
      grid,
      "长期记忆",
      `${summary.profileBytes.toLocaleString("zh-CN")} 字节`,
    );
    this.summaryCard(
      grid,
      "近期记忆",
      summary.supplementBytes === null
        ? "未提供"
        : `${summary.supplementBytes.toLocaleString("zh-CN")} 字节`,
    );
  }

  private renderCandidates(
    container: HTMLElement,
    candidates: MemoryProposalV1[],
  ): void {
    const section = this.createTopLevelSection(
      container,
      "pending",
      "待确认记忆",
      `${candidates.length} 条`,
    );
    section.createDiv({
      cls: "setting-item-description",
      text:
        "仅服务端当前仍为 pending 的候选会显示为可操作。确认或拒绝后候选会离开此列表；现有接口不返回已拒绝候选的长期列表，插件不会把它伪造成历史事实。",
    });
    if (candidates.length === 0) {
      section.createDiv({
        cls: "azhen-memory-empty",
        text: "当前没有待确认候选。",
      });
      return;
    }
    for (const candidate of candidates) {
      const details = section.createEl("details", {
        cls: "azhen-memory-card azhen-memory-collapse",
      });
      details.open = this.folds.isCandidateOpen(candidate.id);
      details.addEventListener("toggle", () => {
        this.folds.setCandidateOpen(candidate.id, details.open);
      });
      const summary = details.createEl("summary", {
        cls: "azhen-memory-collapse__summary",
      });
      summary.createSpan({
        cls: "azhen-memory-card__heading",
      }).createEl("strong", {
        text: candidate.action === "correct" ? "纠正候选" : "新增记忆候选",
      });
      summary.createSpan({
        cls: "azhen-memory-chip",
        text: targetLabel(candidate.target),
      });
      summary.createSpan({
        cls: "azhen-memory-collapse__preview",
        text: summaryText(candidate.text),
      });

      const body = details.createDiv({
        cls: "azhen-memory-collapse__body",
      });
      if (candidate.before !== undefined) {
        this.contentBlock(body, "当前内容", candidate.before);
      }
      this.contentBlock(body, "候选内容", candidate.text);
      this.renderSource(body, {
        quote: candidate.quote,
        key: candidate.sourceKey,
        hash: candidate.sourceHash,
        time: candidate.createdAt,
      });
      const actions = body.createDiv({ cls: "azhen-memory-actions" });
      const confirm = actions.createEl("button", {
        cls: "mod-cta",
        text: "确认保留",
        attr: { type: "button" },
      });
      confirm.addEventListener("click", () => {
        this.openCandidateConfirmation(candidate);
      });
      const reject = actions.createEl("button", {
        cls: "mod-warning",
        text: "拒绝",
        attr: { type: "button" },
      });
      reject.addEventListener("click", () => {
        this.openCandidateRejection(candidate);
      });
    }
  }

  private renderDocuments(
    container: HTMLElement,
    documents: MemoryFileV1[],
  ): void {
    const sectionCount = documents.reduce(
      (total, document) =>
        total + parseMemoryDocument(document).sections.length,
      0,
    );
    const section = this.createTopLevelSection(
      container,
      "current",
      "当前有效记忆",
      `${documents.length} 个文档 · ${sectionCount} 个原文分类`,
    );
    section.createDiv({
      cls: "setting-item-description",
      text:
        "分类直接取自已返回的 Markdown 标题。标题层级只通过缩进和折叠展示，不改写、合并或重命名原文。",
    });
    for (const document of documents) {
      const documentEl = section.createDiv({
        cls: "azhen-memory-document azhen-memory-document-group",
      });
      const title = documentEl.createDiv({
        cls: "azhen-memory-card__heading",
      });
      title.createEl("h4", {
        text:
          document.path === "/profile.md"
            ? "长期记忆 · profile.md"
            : "近期记忆 · recent.md",
      });
      title.createSpan({
        cls: "azhen-memory-document__version",
        text: `版本 ${document.version.slice(0, 12)}`,
      });
      this.renderParsedDocument(documentEl, document);
    }
  }

  private renderParsedDocument(
    container: HTMLElement,
    document: MemoryFileV1,
  ): void {
    const parsed = parseMemoryDocument(document);
    const minimumLevel =
      parsed.roots.length > 0
        ? Math.min(...parsed.roots.map((section) => section.level))
        : 1;
    for (const memorySection of parsed.sections) {
      this.renderMarkdownSection(
        container,
        document,
        memorySection,
        memorySection.level - minimumLevel,
      );
    }
    if (parsed.orphanEntries.length > 0) {
      this.renderOrphanEntries(container, document, parsed.orphanEntries);
    }
    if (parsed.sections.length === 0 && parsed.orphanEntries.length === 0) {
      container.createDiv({
        cls: "azhen-memory-empty",
        text: "该文档当前没有可展示内容。",
      });
    }
  }

  private renderMarkdownSection(
    container: HTMLElement,
    document: MemoryFileV1,
    memorySection: MarkdownMemorySection,
    depth: number,
  ): void {
    const details = container.createEl("details", {
      cls: "azhen-memory-category azhen-memory-collapse",
    });
    details.style.setProperty("--azhen-memory-depth", String(depth));
    details.open = this.folds.isSectionOpen(memorySection.key);
    details.addEventListener("toggle", () => {
      this.folds.setSectionOpen(memorySection.key, details.open);
    });
    const summary = details.createEl("summary", {
      cls: "azhen-memory-collapse__summary",
    });
    summary.createSpan({
      cls: "azhen-memory-category__title",
      text: memorySection.title,
    });
    summary.createSpan({
      cls: "azhen-memory-chip",
      text: `${memorySection.entries.length} 条`,
    });
    const body = details.createDiv({
      cls: "azhen-memory-collapse__body",
    });
    if (memorySection.entries.length === 0) {
      body.createDiv({
        cls: "azhen-memory-empty",
        text: "该标题下没有直接正文；下级原文标题仍按原顺序列在下方。",
      });
    }
    for (const entry of memorySection.entries) {
      this.renderMemoryEntry(body, document, entry);
    }
  }

  private renderOrphanEntries(
    container: HTMLElement,
    document: MemoryFileV1,
    entries: MarkdownMemoryEntry[],
  ): void {
    const key = `${document.path}:orphan`;
    const details = container.createEl("details", {
      cls: "azhen-memory-category azhen-memory-category--orphan azhen-memory-collapse",
    });
    details.open = this.folds.isSectionOpen(key);
    details.addEventListener("toggle", () => {
      this.folds.setSectionOpen(key, details.open);
    });
    const summary = details.createEl("summary", {
      cls: "azhen-memory-collapse__summary",
    });
    summary.createSpan({
      cls: "azhen-memory-category__title",
      text: "未归入原有标题的原文",
    });
    summary.createSpan({
      cls: "azhen-memory-chip",
      text: `${entries.length} 条`,
    });
    const body = details.createDiv({
      cls: "azhen-memory-collapse__body",
    });
    body.createDiv({
      cls: "setting-item-description",
      text: "这是原文完整性入口，不是新增的记忆分类。",
    });
    for (const entry of entries) {
      this.renderMemoryEntry(body, document, entry);
    }
  }

  private renderMemoryEntry(
    container: HTMLElement,
    document: MemoryFileV1,
    entry: MarkdownMemoryEntry,
  ): void {
    const details = container.createEl("details", {
      cls: "azhen-memory-fact azhen-memory-entry azhen-memory-collapse",
    });
    details.open = this.folds.isEntryOpen(entry.key);
    details.addEventListener("toggle", () => {
      this.folds.setEntryOpen(entry.key, details.open);
    });
    const summary = details.createEl("summary", {
      cls: "azhen-memory-collapse__summary",
    });
    summary.createSpan({
      cls: "azhen-memory-entry__preview",
      text: entry.summary,
    });
    const body = details.createDiv({
      cls: "azhen-memory-collapse__body",
    });
    body.createDiv({
      cls: "azhen-memory-content-block__label",
      text: "完整原文",
    });
    body.createEl("pre", {
      cls: "azhen-memory-entry__source",
      text: entry.before,
    });
    if (!entry.actionable) {
      body.createDiv({
        cls: "azhen-memory-warning",
        text:
          "该条内容在原文中无法唯一、安全定位，已禁止直接纠正或遗忘。",
      });
      return;
    }
    const actions = body.createDiv({ cls: "azhen-memory-actions" });
    const edit = actions.createEl("button", {
      text: "纠正",
      attr: { type: "button" },
    });
    edit.addEventListener("click", () => {
      this.openEditMemory(document, entry.before, entry.lineNumber - 1);
    });
    const forget = actions.createEl("button", {
      cls: "mod-warning",
      text: "遗忘",
      attr: { type: "button" },
    });
    forget.addEventListener("click", () => {
      this.openForgetMemory(document, entry.before, entry.lineNumber - 1);
    });
  }

  private renderHistory(
    container: HTMLElement,
    events: MemoryEventV1[],
  ): void {
    const section = this.createTopLevelSection(
      container,
      "history",
      "历史记录",
      `${events.length} 条`,
    );
    section.createDiv({
      cls: "setting-item-description",
      text:
        "历史条目用于追溯，不代表当前有效事实。原始聊天消息时间未由接口提供，因此只显示事件时间和已有来源标识。",
    });
    if (events.length === 0) {
      section.createDiv({
        cls: "azhen-memory-empty",
        text: "当前没有历史变化。",
      });
      return;
    }
    for (const event of [...events].reverse()) {
      const details = section.createEl("details", {
        cls: "azhen-memory-history azhen-memory-collapse",
      });
      details.open = this.folds.isEventOpen(event.id);
      details.addEventListener("toggle", () => {
        this.folds.setEventOpen(event.id, details.open);
      });
      const summary = details.createEl("summary", {
        cls: "azhen-memory-collapse__summary",
      });
      summary.createSpan({
        cls: "azhen-memory-chip",
        text: actionLabel(event.action),
      });
      summary.createSpan({
        text: `${formatTime(event.time)} · ${targetLabel(event.target)}`,
      });
      if (event.undoneBy) {
        summary.createSpan({
          cls: "azhen-memory-chip is-muted",
          text: "已撤销",
        });
      }
      summary.createSpan({
        cls: "azhen-memory-collapse__preview",
        text: summaryText(event.after || event.before || "无正文"),
      });
      if (event.before) this.contentBlock(details, "变化前", event.before);
      if (event.after) this.contentBlock(details, "变化后", event.after);
      this.renderSource(details, {
        quote: event.source.quote,
        key: event.source.key,
        hash: event.source.hash,
        operationId: event.operationId ?? event.source.operationId,
        proposalId: event.proposalId,
        time: event.time,
      });
      const actions = details.createDiv({ cls: "azhen-memory-actions" });
      if (!event.undoneBy && event.action !== "undo") {
        const undo = actions.createEl("button", {
          text: "撤销这次变化",
          attr: { type: "button" },
        });
        undo.addEventListener("click", () => {
          this.openUndoConfirmation(event);
        });
      }
    }
  }

  private openCandidateConfirmation(candidate: MemoryProposalV1): void {
    new MemoryActionModal(this.app, {
      title:
        candidate.action === "correct" ? "确认纠正候选" : "确认记忆候选",
      description: this.candidateDescription(candidate),
      confirmLabel: "确认并写入",
      onConfirm: async () => {
        const fresh = await this.plugin.verifyConnection();
        this.plugin.requestStatusRefresh(fresh);
        if (fresh.kind !== "connected") {
          this.check = fresh;
          this.render();
          throw new Error("无法重新读取最新记忆，本次没有确认候选。");
        }
        const current = fresh.pending.find(
          (item) => item.id === candidate.id,
        );
        if (!current || !sameProposal(current, candidate)) {
          this.check = fresh;
          this.render();
          throw new Error("候选或来源已经变化；已刷新，请重新核对。");
        }
        const document = targetDocument(fresh.documents, candidate.target);
        if (!document) {
          throw new Error("目标记忆文档不存在。");
        }
        const fields: Record<string, unknown> = {
          proposal_id: candidate.id,
          target: candidate.target,
          expected_hash: document.version,
        };
        if (candidate.action === "correct") {
          fields.review_hash = candidate.reviewHash;
        }
        this.check = fresh;
        const result = await this.plugin.beginMemoryAction("confirm", fields);
        await this.handleExecution(result, "候选已确认。");
      },
    }).open();
  }

  private openCandidateRejection(candidate: MemoryProposalV1): void {
    new MemoryActionModal(this.app, {
      title: "拒绝记忆候选",
      description: this.candidateDescription(candidate),
      confirmLabel: "拒绝候选",
      danger: true,
      onConfirm: async () => {
        const fresh = await this.plugin.verifyConnection();
        this.plugin.requestStatusRefresh(fresh);
        if (fresh.kind !== "connected") {
          this.check = fresh;
          this.render();
          throw new Error("无法重新读取候选，本次没有拒绝操作。");
        }
        const current = fresh.pending.find(
          (item) => item.id === candidate.id,
        );
        if (!current || !sameProposal(current, candidate)) {
          this.check = fresh;
          this.render();
          throw new Error("候选已经变化或不再存在；已刷新。");
        }
        this.check = fresh;
        const result = await this.plugin.beginMemoryAction("reject", {
          proposal_id: candidate.id,
          target: candidate.target,
        });
        await this.handleExecution(result, "候选已拒绝。");
      },
    }).open();
  }

  private openEditMemory(
    document: MemoryFileV1,
    before: string,
    index: number,
  ): void {
    const prefix = memoryLinePrefix(before);
    const editable = before.slice(prefix.length);
    new MemoryActionModal(this.app, {
      title: "纠正记忆",
      description:
        "只修改选中的这一行。服务器会核对当前版本和唯一原文；保存后旧内容会进入历史。",
      confirmLabel: "保存纠正",
      input: {
        label: "纠正后的内容",
        value: editable,
        placeholder: "输入纠正后的完整事实",
        multiline: true,
      },
      onConfirm: async (value) => {
        const normalized = value.trim();
        if (normalized.length < 2 || normalized.length > 500) {
          throw new Error("记忆内容需为 2–500 个字符。");
        }
        if (/[\r\n]/.test(normalized)) {
          throw new Error("每条记忆只能包含一行纯文本。");
        }
        const after = prefix + normalized;
        if (after.length > 500) {
          throw new Error("纠正后的完整 Markdown 行不能超过 500 个字符。");
        }
        if (after === before) {
          throw new Error("内容没有变化。");
        }
        const result = await this.plugin.beginMemoryAction("correct", {
          target: targetForDocument(document),
          before,
          after,
          expected_hash: document.version,
        });
        await this.handleExecution(result, `第 ${index + 1} 行记忆已更新。`);
      },
    }).open();
  }

  private openForgetMemory(
    document: MemoryFileV1,
    before: string,
    index: number,
  ): void {
    new MemoryActionModal(this.app, {
      title: "遗忘这条记忆",
      description: `此操作会把选中的第 ${index + 1} 行从当前记忆移除。旧内容和来源会保留在历史中，可在本页撤销。\n\n${before}`,
      confirmLabel: "确认遗忘",
      danger: true,
      onConfirm: async () => {
        const result = await this.plugin.beginMemoryAction("forget", {
          target: targetForDocument(document),
          before,
          expected_hash: document.version,
        });
        await this.handleExecution(result, "记忆已遗忘，可在历史中撤销。");
      },
    }).open();
  }

  private openUndoConfirmation(event: MemoryEventV1): void {
    const doc = this.connectedDocuments().find(
      (document) => targetForDocument(document) === event.target,
    );
    if (!doc) return;
    new MemoryActionModal(this.app, {
      title: "撤销历史变化",
      description: `将撤销 ${formatTime(event.time)} 的“${actionLabel(
        event.action,
      )}”。只恢复这次变化，不会覆盖之后的其他修改。`,
      confirmLabel: "确认撤销",
      danger: true,
      onConfirm: async () => {
        const result = await this.plugin.beginMemoryAction("undo", {
          event_id: event.id,
          expected_hash: doc.version,
        });
        await this.handleExecution(result, "历史变化已撤销。");
      },
    }).open();
  }

  private openDiscardModal(): void {
    new MemoryActionModal(this.app, {
      title: "放弃未提交操作",
      description:
        "仅在服务器已经明确返回 not_committed 时使用。放弃后该操作记录会被清除，不会修改云端记忆。",
      confirmLabel: "确认放弃",
      danger: true,
      onConfirm: async () => {
        this.plugin.discardUncommittedOperation();
        this.feedback = {
          kind: "warning",
          message: "已清除未提交操作记录；云端记忆未改变。",
        };
        this.loadPendingOperation();
        this.render();
      },
    }).open();
  }

  private async refreshWithButton(button: HTMLButtonElement): Promise<void> {
    button.disabled = true;
    button.textContent = "读取中…";
    await this.refreshConnection();
  }

  private async refreshConnection(): Promise<void> {
    const result = await this.plugin.verifyConnection();
    this.plugin.requestStatusRefresh(result);
    this.check = result;
    this.loadPendingOperation();
    this.render();
  }

  private async checkPending(button: HTMLButtonElement): Promise<void> {
    button.disabled = true;
    button.textContent = "核对中…";
    const result = await this.plugin.checkPendingOperation();
    this.feedback = executionFeedback(result);
    if (result.kind === "confirmed") {
      await this.refreshConnection();
    } else {
      this.loadPendingOperation();
      this.render();
    }
  }

  private async retryPending(button: HTMLButtonElement): Promise<void> {
    button.disabled = true;
    button.textContent = "提交原操作…";
    try {
      const result = await this.plugin.retryPendingOperation();
      await this.handleExecution(result, "原操作已确认提交。");
    } catch (error) {
      this.feedback = {
        kind: "error",
        message:
          error instanceof Error ? error.message : "未能重试原操作。",
      };
      this.render();
    }
  }

  private async handleExecution(
    result: MemoryOperationExecution,
    successMessage: string,
  ): Promise<void> {
    this.feedback = executionFeedback(result, successMessage);
    this.loadPendingOperation();
    if (result.kind === "confirmed") {
      await this.refreshConnection();
      return;
    }
    if (result.kind === "rejected") {
      await this.refreshConnection();
      return;
    }
    this.render();
  }

  private loadPendingOperation(): void {
    try {
      this.pendingOperation = this.plugin.getPendingOperation();
      this.pendingLoadError = null;
    } catch (error) {
      this.pendingOperation = null;
      this.pendingLoadError =
        error instanceof Error
          ? error.message
          : "未完成操作记录无法读取。";
    }
  }

  private connectedDocuments(): MemoryFileV1[] {
    return this.check?.kind === "connected" ? this.check.documents : [];
  }

  private createTopLevelSection(
    container: HTMLElement,
    key: TopLevelMemorySection,
    title: string,
    count: string,
  ): HTMLElement {
    const details = container.createEl("details", {
      cls: "azhen-memory-section azhen-memory-top-section azhen-memory-collapse",
    });
    details.open = this.folds.isTopLevelOpen(key);
    details.addEventListener("toggle", () => {
      this.folds.setTopLevelOpen(key, details.open);
    });
    const summary = details.createEl("summary", {
      cls: "azhen-memory-collapse__summary",
    });
    summary.createEl("h3", { text: title });
    summary.createSpan({ cls: "azhen-memory-chip", text: count });
    return details.createDiv({ cls: "azhen-memory-collapse__body" });
  }

  private summaryCard(
    grid: HTMLElement,
    label: string,
    value: string,
  ): void {
    const card = grid.createDiv({ cls: "azhen-memory-summary-card" });
    card.createDiv({ cls: "azhen-memory-summary-card__value", text: value });
    card.createDiv({ cls: "azhen-memory-summary-card__label", text: label });
  }

  private contentBlock(
    container: HTMLElement,
    label: string,
    value: string,
  ): void {
    const block = container.createDiv({ cls: "azhen-memory-content-block" });
    block.createDiv({
      cls: "azhen-memory-content-block__label",
      text: label,
    });
    block.createEl("pre", { text: value || "（空）" });
  }

  private renderSource(
    container: HTMLElement,
    source: {
      quote?: string;
      key?: string;
      hash?: string;
      operationId?: string;
      proposalId?: string;
      time?: number;
    },
  ): void {
    const hasSource = [
      source.quote,
      source.key,
      source.hash,
      source.operationId,
      source.proposalId,
      source.time,
    ].some((value) => value !== undefined && value !== "");
    if (!hasSource) return;
    const box = container.createDiv({ cls: "azhen-memory-source" });
    box.createEl("h5", { text: "来源证据" });
    if (source.quote) this.sourceMeta(box, "精确引文", source.quote);
    if (source.key) this.sourceMeta(box, "来源消息", source.key);
    if (source.hash) this.sourceMeta(box, "来源哈希", source.hash);
    if (source.time) {
      this.sourceMeta(box, "记录时间", formatTime(source.time));
    }
    if (source.proposalId) {
      this.sourceMeta(box, "候选 ID", source.proposalId);
    }
    if (source.operationId) {
      this.sourceMeta(box, "操作 ID", source.operationId);
    }
  }

  private sourceMeta(
    container: HTMLElement,
    label: string,
    value: string,
  ): void {
    const row = container.createDiv({ cls: "azhen-memory-source__row" });
    row.createSpan({ cls: "azhen-memory-source__label", text: label });
    row.createSpan({ text: value });
  }

  private candidateDescription(candidate: MemoryProposalV1): string {
    const lines = [
      candidate.action === "correct" ? "纠正候选" : "新增记忆候选",
      `目标：${targetLabel(candidate.target)}`,
    ];
    if (candidate.before !== undefined) {
      lines.push(`当前内容：${candidate.before}`);
    }
    lines.push(`候选内容：${candidate.text}`);
    if (candidate.quote) lines.push(`来源引文：${candidate.quote}`);
    return lines.join("\n");
  }
}

function statusLabel(check: ConnectionCheck): string {
  switch (check.kind) {
    case "connected":
      return "连接成功";
    case "failed":
      return "连接失败";
    case "blocked":
      return "安全阻断";
    case "not_configured":
      return "未就绪";
  }
}

function executionFeedback(
  result: MemoryOperationExecution,
  successMessage = "操作已完成。",
): Feedback {
  switch (result.kind) {
    case "confirmed":
      return { kind: "success", message: successMessage };
    case "not_committed":
      return { kind: "warning", message: result.message };
    case "rejected":
      return { kind: "error", message: result.message };
    case "unknown":
      return { kind: "warning", message: result.message };
    case "none":
      return { kind: "warning", message: "没有待核对的操作。" };
  }
}

function targetForDocument(document: MemoryFileV1): MemoryTarget {
  return document.path === "/recent.md" ? "supplement" : "profile";
}

function targetDocument(
  documents: MemoryFileV1[],
  target: MemoryTarget,
): MemoryFileV1 | undefined {
  const path = target === "supplement" ? "/recent.md" : "/profile.md";
  return documents.find((document) => document.path === path);
}

function targetLabel(target: MemoryTarget): string {
  return target === "supplement" ? "近期记忆" : "长期记忆";
}

function actionLabel(action: string): string {
  switch (action) {
    case "confirm":
      return "确认";
    case "reject":
      return "拒绝";
    case "correct":
      return "纠正";
    case "forget":
      return "遗忘";
    case "undo":
      return "撤销";
    case "propose_correction":
      return "创建纠正候选";
    default:
      return action;
  }
}

function formatTime(value: number | undefined): string {
  if (value === undefined) return "时间未提供";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "时间无效";
  return date.toLocaleString("zh-CN", { hour12: false });
}

function memoryLinePrefix(line: string): string {
  const listPrefix = line.match(/^(\s*(?:[-*+]|\d+\.)\s+)/);
  if (listPrefix?.[1]) return listPrefix[1];
  const leadingWhitespace = line.match(/^\s*/)?.[0] ?? "";
  return leadingWhitespace;
}

function sameProposal(
  left: MemoryProposalV1,
  right: MemoryProposalV1,
): boolean {
  const keys: Array<keyof MemoryProposalV1> = [
    "id",
    "text",
    "quote",
    "sourceKey",
    "sourceHash",
    "target",
    "action",
    "before",
    "after",
    "reviewHash",
  ];
  return keys.every((key) => left[key] === right[key]);
}

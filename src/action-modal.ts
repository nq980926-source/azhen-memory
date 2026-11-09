import { App, Modal } from "obsidian";

export interface MemoryActionModalOptions {
  title: string;
  description: string;
  confirmLabel: string;
  danger?: boolean;
  input?: {
    label: string;
    value: string;
    placeholder?: string;
    multiline?: boolean;
  };
  onConfirm: (value: string) => Promise<void>;
}

export class MemoryActionModal extends Modal {
  private inputEl: HTMLTextAreaElement | HTMLInputElement | null = null;
  private errorEl: HTMLElement | null = null;
  private confirmButton: HTMLButtonElement | null = null;

  constructor(
    app: App,
    private readonly options: MemoryActionModalOptions,
  ) {
    super(app);
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("h2", { text: this.options.title });
    const description = contentEl.createDiv({
      cls: "azhen-memory-modal__description",
    });
    description.setText(this.options.description);

    if (this.options.input) {
      const field = contentEl.createDiv({ cls: "azhen-memory-modal__field" });
      field.createEl("label", { text: this.options.input.label });
      const el = this.options.input.multiline
        ? field.createEl("textarea")
        : field.createEl("input", { type: "text" });
      el.value = this.options.input.value;
      if (this.options.input.placeholder) {
        el.placeholder = this.options.input.placeholder;
      }
      this.inputEl = el;
    }

    this.errorEl = contentEl.createDiv({
      cls: "azhen-memory-modal__error",
    });

    const actions = contentEl.createDiv({
      cls: "azhen-memory-modal__actions",
    });
    const cancel = actions.createEl("button", {
      text: "取消",
      attr: { type: "button" },
    });
    cancel.addEventListener("click", () => this.close());

    this.confirmButton = actions.createEl("button", {
      cls: this.options.danger ? "mod-warning" : "mod-cta",
      text: this.options.confirmLabel,
      attr: { type: "button" },
    });
    this.confirmButton.addEventListener("click", () => {
      void this.submit();
    });
    globalThis.setTimeout(() => {
      this.inputEl?.focus();
      if (this.inputEl instanceof HTMLInputElement ||
          this.inputEl instanceof HTMLTextAreaElement) {
        this.inputEl.select();
      }
    }, 0);
  }

  onClose(): void {
    this.contentEl.empty();
    this.inputEl = null;
    this.errorEl = null;
    this.confirmButton = null;
  }

  private async submit(): Promise<void> {
    if (!this.confirmButton || !this.errorEl) return;
    this.confirmButton.disabled = true;
    this.errorEl.setText("");
    try {
      await this.options.onConfirm(this.inputEl?.value ?? "");
      this.close();
    } catch (error) {
      this.errorEl.setText(
        error instanceof Error ? error.message : "操作未完成，请稍后重试。",
      );
      this.confirmButton.disabled = false;
    }
  }
}

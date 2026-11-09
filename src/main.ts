import { Notice, Plugin, type WorkspaceLeaf } from "obsidian";
import {
  MemoryReadOnlyGateway,
  type ConnectionCheck,
} from "./memory/gateway.ts";
import { SafeFetchReadTransport } from "./memory/obsidian-read-transport.ts";
import {
  MemoryActionGateway,
  type MemoryAction,
} from "./memory/actions.ts";
import {
  PendingOperationStore,
  operationMatchesBinding,
  type MemoryBindingIdentity,
  type PendingMemoryOperation,
} from "./memory/pending-operation.ts";
import {
  MemoryOperationController,
  type MemoryOperationContext,
  type MemoryOperationExecution,
} from "./memory/operation-controller.ts";
import { AzhenMemorySettingTab } from "./settings.ts";
import {
  containsPossiblePlaintextSecret,
  DEFAULT_SETTINGS,
  normalizeSettings,
  type AzhenMemorySettings,
} from "./settings-model.ts";
import { AzhenMemoryView, VIEW_TYPE_AZHEN_MEMORY } from "./view.ts";

export default class AzhenMemoryPlugin extends Plugin {
  settings: AzhenMemorySettings = { ...DEFAULT_SETTINGS };
  private readonly transport = new SafeFetchReadTransport();
  private readonly gateway = new MemoryReadOnlyGateway(this.transport);
  private readonly actionGateway = new MemoryActionGateway(this.transport);
  private operations!: MemoryOperationController;
  private lastCheck: ConnectionCheck | null = null;

  getLastCheck(): ConnectionCheck | null {
    return this.lastCheck;
  }

  async onload(): Promise<void> {
    await this.loadSettings();
    this.operations = new MemoryOperationController(
      new PendingOperationStore(this.app.secretStorage),
      this.actionGateway,
      () => this.invalidateConnectionState(),
    );

    this.registerView(
      VIEW_TYPE_AZHEN_MEMORY,
      (leaf: WorkspaceLeaf) => new AzhenMemoryView(leaf, this),
    );
    this.addRibbonIcon("brain", "打开阿斟 Memory", () => {
      void this.activateView();
    });
    this.addCommand({
      id: "open-azhen-memory-status",
      name: "打开 Memory 管理与历史",
      callback: () => {
        void this.activateView();
      },
    });
    this.addSettingTab(new AzhenMemorySettingTab(this.app, this));
  }

  async loadSettings(): Promise<void> {
    const stored: unknown = await this.loadData();
    this.settings = normalizeSettings(stored);
    if (containsPossiblePlaintextSecret(stored)) {
      await this.saveSettings();
    }
  }

  async saveSettings(): Promise<void> {
    await this.saveData({
      serviceBaseUrl: this.settings.serviceBaseUrl,
      assistantId: this.settings.assistantId,
      bearerSecretId: this.settings.bearerSecretId,
    });
  }

  hasBearerToken(): boolean {
    return this.readBearerToken().length > 0;
  }

  setBearerToken(token: string): void {
    const normalized = token.trim();
    if (!normalized) return;
    this.app.secretStorage.setSecret(this.settings.bearerSecretId, normalized);
    this.invalidateConnectionState();
    new Notice("Bearer Token 已保存到 Obsidian Secret Storage。");
  }

  clearBearerToken(): void {
    this.app.secretStorage.setSecret(this.settings.bearerSecretId, "");
    this.invalidateConnectionState();
    new Notice("Bearer Token 已清除。");
  }

  async verifyConnection(): Promise<ConnectionCheck> {
    this.lastCheck = await this.gateway.verify(
      this.settings.serviceBaseUrl,
      this.settings.assistantId,
      this.readBearerToken(),
    );
    return this.lastCheck;
  }

  getBindingIdentity(): MemoryBindingIdentity {
    return {
      serviceBaseUrl: this.settings.serviceBaseUrl,
      assistantId: this.settings.assistantId,
    };
  }

  getPendingOperation(): PendingMemoryOperation | null {
    return this.operations.getPendingOperation();
  }

  pendingOperationMatchesCurrentBinding(
    operation: PendingMemoryOperation,
  ): boolean {
    return operationMatchesBinding(operation, this.getBindingIdentity());
  }

  async beginMemoryAction(
    action: Exclude<MemoryAction, "operation">,
    fields: Record<string, unknown>,
  ): Promise<MemoryOperationExecution> {
    return this.operations.begin(this.operationContext(), action, fields);
  }

  async checkPendingOperation(): Promise<MemoryOperationExecution> {
    return this.operations.check(this.operationContext());
  }

  async retryPendingOperation(): Promise<MemoryOperationExecution> {
    return this.operations.retry(this.operationContext());
  }

  discardUncommittedOperation(): void {
    this.operations.discardUncommitted();
  }

  canRetryPendingOperation(operationId: string): boolean {
    return this.operations.canRetry(operationId);
  }

  requestStatusRefresh(check: ConnectionCheck | null): void {
    this.lastCheck = check;
  }

  invalidateConnectionState(): void {
    this.lastCheck = null;
    void this.refreshViews();
  }

  private readBearerToken(): string {
    return this.app.secretStorage.getSecret(this.settings.bearerSecretId) ?? "";
  }

  private operationContext(): MemoryOperationContext {
    return {
      ...this.getBindingIdentity(),
      bearerToken: this.readBearerToken(),
    };
  }

  private async refreshViews(): Promise<void> {
    for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE_AZHEN_MEMORY)) {
      const view = leaf.view;
      if (view instanceof AzhenMemoryView) {
        if (this.lastCheck) view.renderCheck(this.lastCheck);
        else view.renderIdle();
      }
    }
  }

  private async activateView(): Promise<void> {
    let leaf = this.app.workspace.getLeavesOfType(VIEW_TYPE_AZHEN_MEMORY)[0];
    if (!leaf) {
      leaf = this.app.workspace.getLeaf(true);
      await leaf.setViewState({
        type: VIEW_TYPE_AZHEN_MEMORY,
        active: true,
      });
    }
    await this.app.workspace.revealLeaf(leaf);
  }
}

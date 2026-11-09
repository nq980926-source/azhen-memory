export const MEMORY_API_SCHEMA = 1;
export const MAX_DOCUMENT_BYTES = 48 * 1024;

export type MemoryDocumentPath = "/profile.md" | "/recent.md";

export interface MemoryFileV1 {
  path: MemoryDocumentPath;
  content: string;
  version: string;
}

export type MemoryTarget = "profile" | "supplement";

export interface MemorySourceEvidenceV1 {
  kind?: string;
  key?: string;
  hash?: string;
  quote?: string;
  operationId?: string;
}

export interface MemoryProposalV1 {
  id: string;
  kind?: string;
  action?: "correct";
  target: MemoryTarget;
  text: string;
  quote: string;
  sourceKey: string;
  sourceHash: string;
  reviewHash?: string;
  before?: string;
  after?: string;
  createdAt?: number;
  status: string;
}

export interface MemoryEventV1 {
  id: string;
  action: string;
  target: MemoryTarget;
  before: string;
  after: string;
  time: number;
  operationId?: string;
  proposalId?: string;
  undoneBy?: string;
  undoes?: string;
  anchorBefore?: string;
  anchorAfter?: string;
  source: MemorySourceEvidenceV1;
}

export interface MemoryCapabilitiesV1 {
  correctionProposals: boolean;
}

export interface MemoryReadResponseV1 {
  schema: typeof MEMORY_API_SCHEMA;
  files: MemoryFileV1[];
  pending: MemoryProposalV1[];
  events: MemoryEventV1[];
  capabilities: MemoryCapabilitiesV1 | null;
  verifiedAt: number | null;
  unprocessedSources: number | null;
  supplementAvailable: boolean | null;
}

export interface MemoryReadSummary {
  schema: number;
  correctionProposals: boolean;
  profileBytes: number;
  supplementBytes: number | null;
  pendingCount: number;
  eventCount: number;
}

export type ProtocolErrorCode =
  | "invalid_response"
  | "unsupported_schema"
  | "missing_profile"
  | "duplicate_document"
  | "invalid_document"
  | "document_too_large"
  | "invalid_pending"
  | "invalid_event";

export class ProtocolError extends Error {
  constructor(
    readonly code: ProtocolErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "ProtocolError";
  }
}

export function validateReadResponse(value: unknown): MemoryReadResponseV1 {
  const body = record(value, "response");
  if (body.schema !== MEMORY_API_SCHEMA) {
    throw new ProtocolError(
      "unsupported_schema",
      "接口版本不受支持；本插件仅接受 schema=1。",
    );
  }

  const rawFiles = array(body.files, "files");
  const files: MemoryFileV1[] = [];
  const seenPaths = new Set<string>();
  for (const rawFile of rawFiles) {
    const file = record(rawFile, "files[]");
    const path = file.path;
    if (path !== "/profile.md" && path !== "/recent.md") {
      throw new ProtocolError("invalid_document", "响应包含未知记忆文档路径。");
    }
    if (seenPaths.has(path)) {
      throw new ProtocolError("duplicate_document", "响应包含重复记忆文档。");
    }
    if (typeof file.content !== "string" || typeof file.version !== "string") {
      throw new ProtocolError("invalid_document", "记忆文档字段类型无效。");
    }
    if (!/^[a-f0-9]{64}$/.test(file.version)) {
      throw new ProtocolError("invalid_document", "记忆文档版本不是 64 位十六进制哈希。");
    }
    const bytes = new TextEncoder().encode(file.content).byteLength;
    if (bytes > MAX_DOCUMENT_BYTES) {
      throw new ProtocolError("document_too_large", "记忆文档超过 48KB 接口上限。");
    }
    seenPaths.add(path);
    files.push({ path, content: file.content, version: file.version });
  }

  if (!seenPaths.has("/profile.md")) {
    throw new ProtocolError("missing_profile", "响应缺少 /profile.md。");
  }

  const pending = array(body.pending, "pending").map((item, index) =>
    parseProposal(item, index),
  );
  const events = array(body.events, "events").map((item, index) =>
    parseEvent(item, index),
  );
  const capabilities = parseCapabilities(body.capabilities);

  return {
    schema: MEMORY_API_SCHEMA,
    files,
    pending,
    events,
    capabilities,
    verifiedAt: finiteNumberOrNull(body.verified_at),
    unprocessedSources: finiteNumberOrNull(body.unprocessed_sources),
    supplementAvailable: booleanOrNull(body.supplement_available),
  };
}

export function summarizeReadResponse(response: MemoryReadResponseV1): MemoryReadSummary {
  const profile = response.files.find((file) => file.path === "/profile.md");
  const supplement = response.files.find((file) => file.path === "/recent.md");
  if (!profile) {
    throw new ProtocolError("missing_profile", "响应缺少 /profile.md。");
  }
  return {
    schema: response.schema,
    correctionProposals: response.capabilities?.correctionProposals ?? false,
    profileBytes: new TextEncoder().encode(profile.content).byteLength,
    supplementBytes: supplement
      ? new TextEncoder().encode(supplement.content).byteLength
      : null,
    pendingCount: response.pending.length,
    eventCount: response.events.length,
  };
}

function parseCapabilities(value: unknown): MemoryCapabilitiesV1 | null {
  if (value === undefined || value === null) return null;
  const capabilities = record(value, "capabilities");
  return {
    correctionProposals: capabilities.correction_proposals === 1,
  };
}

function parseProposal(value: unknown, index: number): MemoryProposalV1 {
  try {
    const item = record(value, `pending[${index}]`);
    const target = memoryTarget(item.target);
    return {
      id: requiredString(item.id),
      kind: optionalString(item.kind),
      action: item.action === "correct" ? "correct" : undefined,
      target,
      text: requiredString(item.text),
      quote: optionalString(item.quote) ?? "",
      sourceKey: optionalString(item.source_key) ?? "",
      sourceHash: optionalString(item.source_hash) ?? "",
      reviewHash: optionalString(item.review_hash),
      before: optionalString(item.before),
      after: optionalString(item.after),
      createdAt: optionalNumber(item.created_at),
      status: optionalString(item.status) ?? "pending",
    };
  } catch (error) {
    if (error instanceof ProtocolError) throw error;
    throw new ProtocolError(
      "invalid_pending",
      `pending[${index}] 字段结构无效。`,
    );
  }
}

function parseEvent(value: unknown, index: number): MemoryEventV1 {
  try {
    const item = record(value, `events[${index}]`);
    return {
      id: requiredString(item.id),
      action: requiredString(item.action),
      target: memoryTarget(item.target),
      before: optionalString(item.before) ?? "",
      after: optionalString(item.after) ?? "",
      time: requiredNumber(item.time),
      operationId: optionalString(item.operation_id),
      proposalId: optionalString(item.proposal_id),
      undoneBy: optionalString(item.undone_by),
      undoes: optionalString(item.undoes),
      anchorBefore: optionalString(item.anchor_before),
      anchorAfter: optionalString(item.anchor_after),
      source: parseSource(item.source),
    };
  } catch (error) {
    if (error instanceof ProtocolError) throw error;
    throw new ProtocolError(
      "invalid_event",
      `events[${index}] 字段结构无效。`,
    );
  }
}

function parseSource(value: unknown): MemorySourceEvidenceV1 {
  if (value === undefined || value === null) return {};
  const source = record(value, "event.source");
  return {
    kind: optionalString(source.kind),
    key: optionalString(source.source_key) ?? optionalString(source.key),
    hash: optionalString(source.source_hash) ?? optionalString(source.hash),
    quote: optionalString(source.quote),
    operationId: optionalString(source.operation_id),
  };
}

function memoryTarget(value: unknown): MemoryTarget {
  if (value === "profile" || value === "supplement") return value;
  throw new ProtocolError("invalid_response", "记忆目标不是 profile 或 supplement。");
}

function requiredString(value: unknown): string {
  if (typeof value !== "string" || !value) {
    throw new ProtocolError("invalid_response", "必需字符串字段无效。");
  }
  return value;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function requiredNumber(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new ProtocolError("invalid_response", "必需数字字段无效。");
  }
  return value;
}

function optionalNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function finiteNumberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function booleanOrNull(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function record(value: unknown, field: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new ProtocolError("invalid_response", `${field} 不是 JSON 对象。`);
  }
  return value as Record<string, unknown>;
}

function array(value: unknown, field: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new ProtocolError("invalid_response", `${field} 不是 JSON 数组。`);
  }
  return value;
}

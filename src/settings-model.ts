export interface AzhenMemorySettings {
  serviceBaseUrl: string;
  assistantId: string;
  bearerSecretId: string;
}

export const DEFAULT_SETTINGS: AzhenMemorySettings = {
  serviceBaseUrl: "",
  assistantId: "",
  bearerSecretId: "azhen-memory-bearer",
};

export function normalizeSettings(value: unknown): AzhenMemorySettings {
  const source =
    typeof value === "object" && value !== null
      ? (value as Record<string, unknown>)
      : {};
  return {
    serviceBaseUrl:
      typeof source.serviceBaseUrl === "string" ? source.serviceBaseUrl : "",
    assistantId:
      typeof source.assistantId === "string" ? source.assistantId : "",
    bearerSecretId: DEFAULT_SETTINGS.bearerSecretId,
  };
}

export function containsPossiblePlaintextSecret(value: unknown): boolean {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  return Object.keys(value).some((key) => {
    const normalized = key.toLowerCase();
    return (
      normalized.includes("token") ||
      normalized.includes("authorization") ||
      normalized.includes("password") ||
      normalized === "bearer"
    );
  });
}

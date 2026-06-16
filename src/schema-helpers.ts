export function assertTable(
  value: unknown,
  source: string,
): asserts value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${source} must be a TOML table`);
  }
}

export function assertString(
  value: unknown,
  source: string,
): asserts value is string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${source} must be a non-empty string`);
  }
}

export function assertBoolean(
  value: unknown,
  source: string,
): asserts value is boolean {
  if (typeof value !== "boolean") {
    throw new Error(`${source} must be true or false`);
  }
}

export function assertNumericId(value: string, source: string) {
  if (!/^\d{2,}$/.test(value)) {
    throw new Error(`${source} must be a quoted numeric ID like "01"`);
  }
}

export function assertNumericIdString(
  value: unknown,
  source: string,
): asserts value is string {
  assertString(value, source);
  assertNumericId(value, source);
}

export function assertKnownKeys(
  value: Record<string, unknown>,
  allowed: Set<string>,
  source: string,
) {
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) {
      throw new Error(`${source}.${key} is not a supported field`);
    }
  }
}

export function assertSection(
  value: unknown,
  source: string,
  allowedKeys: string[],
): asserts value is Record<string, unknown> {
  assertTable(value, source);
  assertKnownKeys(value, new Set(allowedKeys), source);
}

export function assertTable(value, source) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        throw new Error(`${source} must be a TOML table`);
    }
}
export function assertString(value, source) {
    if (typeof value !== "string" || value.length === 0) {
        throw new Error(`${source} must be a non-empty string`);
    }
}
export function assertNumericId(value, source) {
    if (!/^\d{2,}$/.test(value)) {
        throw new Error(`${source} must be a quoted numeric ID like "01"`);
    }
}
export function assertNumericIdString(value, source) {
    assertString(value, source);
    assertNumericId(value, source);
}
export function assertKnownKeys(value, allowed, source) {
    for (const key of Object.keys(value)) {
        if (!allowed.has(key)) {
            throw new Error(`${source}.${key} is not a supported field`);
        }
    }
}
export function assertSection(value, source, allowedKeys) {
    assertTable(value, source);
    assertKnownKeys(value, new Set(allowedKeys), source);
}

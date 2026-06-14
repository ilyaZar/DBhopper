import { parse } from "smol-toml";
import { errorMessage } from "./errors.js";
export function parseToml(text, source) {
    try {
        return parse(text);
    }
    catch (error) {
        throw new Error(`${source}: invalid TOML: ${errorMessage(error)}`);
    }
}
export function tryParseToml(text) {
    try {
        return parse(text);
    }
    catch {
        return undefined;
    }
}
export function normalizeTomlKeys(value, source, keyMapByPath, rejectMappedTargetKeys = false) {
    return normalizeTomlKeysAt(value, source, keyMapByPath, "", source, rejectMappedTargetKeys);
}
export function renameTomlKeys(value, keyNamesByPath) {
    return renameTomlKeysAt(value, keyNamesByPath, "");
}
function normalizeTomlKeysAt(value, source, keyMapByPath, path, displayPath, rejectMappedTargetKeys) {
    if (Array.isArray(value)) {
        return value.map((entry) => normalizeTomlKeysAt(entry, source, keyMapByPath, path, displayPath, rejectMappedTargetKeys));
    }
    if (!isPlainObject(value)) {
        return value;
    }
    const keyMap = keyMapByPath[path] ?? {};
    const canonicalByTarget = Object.fromEntries(Object.entries(keyMap).map(([canonicalKey, targetKey]) => [
        targetKey,
        canonicalKey,
    ]));
    const normalized = {};
    const originalPaths = {};
    for (const [key, child] of Object.entries(value)) {
        if (rejectMappedTargetKeys && canonicalByTarget[key] && canonicalByTarget[key] !== key) {
            throw new Error(`${displayPath}.${key} is not a supported field; use ` +
                `${canonicalByTarget[key]}`);
        }
        const normalizedKey = keyMap[key] ?? key;
        const childPath = path ? `${path}.${normalizedKey}` : normalizedKey;
        const childDisplayPath = `${displayPath}.${normalizedKey}`;
        const originalPath = `${displayPath}.${key}`;
        const normalizedChild = normalizeTomlKeysAt(child, source, keyMapByPath, childPath, childDisplayPath, rejectMappedTargetKeys);
        if (Object.prototype.hasOwnProperty.call(normalized, normalizedKey)) {
            if (!tomlValuesEqual(normalized[normalizedKey], normalizedChild)) {
                throw new Error(`${originalPaths[normalizedKey]} and ${originalPath} fields must ` +
                    "not disagree");
            }
            continue;
        }
        normalized[normalizedKey] = normalizedChild;
        originalPaths[normalizedKey] = originalPath;
    }
    return normalized;
}
function renameTomlKeysAt(value, keyNamesByPath, path) {
    if (Array.isArray(value)) {
        return value.map((entry) => renameTomlKeysAt(entry, keyNamesByPath, path));
    }
    if (!isPlainObject(value)) {
        return value;
    }
    const names = keyNamesByPath[path] ?? {};
    const renamed = {};
    for (const [key, child] of Object.entries(value)) {
        const renamedKey = names[key] ?? key;
        const childPath = path ? `${path}.${key}` : key;
        renamed[renamedKey] = renameTomlKeysAt(child, keyNamesByPath, childPath);
    }
    return renamed;
}
function tomlValuesEqual(left, right) {
    if (Array.isArray(left) || Array.isArray(right)) {
        return (Array.isArray(left) &&
            Array.isArray(right) &&
            left.length === right.length &&
            left.every((entry, index) => tomlValuesEqual(entry, right[index])));
    }
    if (isPlainObject(left) || isPlainObject(right)) {
        if (!isPlainObject(left) || !isPlainObject(right)) {
            return false;
        }
        const leftKeys = Object.keys(left);
        const rightKeys = Object.keys(right);
        return (leftKeys.length === rightKeys.length &&
            leftKeys.every((key) => Object.prototype.hasOwnProperty.call(right, key) &&
                tomlValuesEqual(left[key], right[key])));
    }
    return Object.is(left, right);
}
function isPlainObject(value) {
    return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

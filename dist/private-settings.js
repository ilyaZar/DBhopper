import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "smol-toml";
const PACKAGE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SETTINGS_RELATIVE_PATH = path.join("assets", "private", "settings.toml");
const DEFAULT_CREDENTIALS_PATH = path.join("assets", "private", "credentials");
const DEFAULT_PROFILES_PATH = path.join("assets", "private", "profiles");
const DEFAULT_ID = "01";
const SETTINGS_KEYS = new Set(["ID_CRED", "ID_PRF", "PATH_CRED", "PATH_PRF"]);
export function privateSettingsPath(config = {}) {
    return path.join(workspaceRoot(config), SETTINGS_RELATIVE_PATH);
}
export function defaultPrivateSettings() {
    return {
        ID_CRED: DEFAULT_ID,
        ID_PRF: DEFAULT_ID,
        PATH_CRED: DEFAULT_CREDENTIALS_PATH,
        PATH_PRF: DEFAULT_PROFILES_PATH,
    };
}
export async function readPrivateSettings(config = {}) {
    const settingsPath = privateSettingsPath(config);
    let exists = true;
    let settings = defaultPrivateSettings();
    try {
        settings = parsePrivateSettingsToml(await fs.readFile(settingsPath, "utf8"), settingsPath);
    }
    catch (error) {
        if (error.code === "ENOENT") {
            exists = false;
        }
        else {
            throw error;
        }
    }
    return {
        exists,
        settingsPath,
        settings,
        credentialsDir: resolveConfiguredPath(config, settings.PATH_CRED),
        profilesDir: resolveConfiguredPath(config, settings.PATH_PRF),
    };
}
export function parsePrivateSettingsToml(text, source = "settings.toml") {
    let parsed;
    try {
        parsed = parse(text);
    }
    catch (error) {
        throw new Error(`${source}: invalid TOML: ${errorMessage(error)}`);
    }
    assertPrivateSettingsShape(parsed, source);
    return parsed;
}
export function stringifyPrivateSettingsToml(settings) {
    return [
        `ID_CRED = ${tomlString(settings.ID_CRED)}`,
        `ID_PRF = ${tomlString(settings.ID_PRF)}`,
        `PATH_CRED = ${tomlString(settings.PATH_CRED)}`,
        `PATH_PRF = ${tomlString(settings.PATH_PRF)}`,
        "",
    ].join("\n");
}
export async function listCredentialIdFiles(config = {}) {
    const loaded = await readPrivateSettings(config);
    return {
        settings: loaded,
        ...(await listIdFiles(loaded.credentialsDir, "ID_CRED")),
    };
}
export async function listProfileIdFiles(config = {}) {
    const loaded = await readPrivateSettings(config);
    return {
        settings: loaded,
        ...(await listIdFiles(loaded.profilesDir, "ID_PRF")),
    };
}
export async function resolveSelectedCredentialFile(config = {}) {
    const loaded = await readPrivateSettings(config);
    if (!loaded.exists) {
        return undefined;
    }
    return {
        settings: loaded,
        file: await resolveIdFile(loaded.credentialsDir, "ID_CRED", loaded.settings.ID_CRED),
    };
}
export async function resolveSelectedProfileFile(config = {}) {
    const loaded = await readPrivateSettings(config);
    if (!loaded.exists) {
        return undefined;
    }
    return {
        settings: loaded,
        file: await resolveIdFile(loaded.profilesDir, "ID_PRF", loaded.settings.ID_PRF),
    };
}
export async function configuredCredentialsDir(config = {}) {
    return (await readPrivateSettings(config)).credentialsDir;
}
export async function configuredProfilesDir(config = {}) {
    return (await readPrivateSettings(config)).profilesDir;
}
export async function privateSettingsStatus(config = {}) {
    const settings = await readPrivateSettings(config);
    const credentials = await listIdFiles(settings.credentialsDir, "ID_CRED");
    const profiles = await listIdFiles(settings.profilesDir, "ID_PRF");
    const messages = [
        ...credentials.messages,
        ...profiles.messages,
    ];
    const credentialSelection = resolveIdFromList(credentials.items, "ID_CRED", settings.settings.ID_CRED, messages);
    const profileSelection = resolveIdFromList(profiles.items, "ID_PRF", settings.settings.ID_PRF, messages);
    return {
        ok: messages.every((message) => message.severity !== "error"),
        settings: {
            exists: settings.exists,
            settingsPath: settings.settingsPath,
            ID_CRED: settings.settings.ID_CRED,
            ID_PRF: settings.settings.ID_PRF,
            PATH_CRED: settings.settings.PATH_CRED,
            PATH_PRF: settings.settings.PATH_PRF,
            credentialsDir: settings.credentialsDir,
            profilesDir: settings.profilesDir,
        },
        credentials: {
            currentId: settings.settings.ID_CRED,
            selected: credentialSelection,
            availableIds: credentials.items.map((item) => item.id),
            files: credentials.items,
        },
        profiles: {
            currentId: settings.settings.ID_PRF,
            selected: profileSelection,
            availableIds: profiles.items.map((item) => item.id),
            files: profiles.items,
        },
        messages,
    };
}
export async function writePrivateSettingsIds(updates, config = {}) {
    const loaded = await readPrivateSettings(config);
    const updated = {
        ...loaded.settings,
        ID_CRED: updates.credentialId
            ? normalizePrivateId(updates.credentialId, "ID_CRED")
            : loaded.settings.ID_CRED,
        ID_PRF: updates.profileId
            ? normalizePrivateId(updates.profileId, "ID_PRF")
            : loaded.settings.ID_PRF,
    };
    await resolveIdFile(loaded.credentialsDir, "ID_CRED", updated.ID_CRED);
    await resolveIdFile(loaded.profilesDir, "ID_PRF", updated.ID_PRF);
    await fs.mkdir(path.dirname(loaded.settingsPath), { recursive: true });
    await fs.writeFile(`${loaded.settingsPath}.tmp`, stringifyPrivateSettingsToml(updated), "utf8");
    await fs.rename(`${loaded.settingsPath}.tmp`, loaded.settingsPath);
    return privateSettingsStatus(config);
}
export function normalizePrivateId(value, field) {
    const trimmed = value.trim();
    if (!/^\d{2,}$/.test(trimmed)) {
        throw new Error(`${field} must be a quoted numeric ID like "01"`);
    }
    return trimmed;
}
function workspaceRoot(config) {
    return path.resolve(config.workspaceRoot || PACKAGE_ROOT);
}
function resolveConfiguredPath(config, value) {
    return path.isAbsolute(value)
        ? path.resolve(value)
        : path.resolve(workspaceRoot(config), value);
}
function assertPrivateSettingsShape(value, source) {
    assertTable(value, source);
    for (const key of Object.keys(value)) {
        if (!SETTINGS_KEYS.has(key)) {
            throw new Error(`${source}.${key} is not a supported field`);
        }
    }
    for (const key of SETTINGS_KEYS) {
        if (!(key in value)) {
            throw new Error(`${source}.${key} is required`);
        }
    }
    assertString(value.ID_CRED, `${source}.ID_CRED`);
    assertString(value.ID_PRF, `${source}.ID_PRF`);
    assertString(value.PATH_CRED, `${source}.PATH_CRED`);
    assertString(value.PATH_PRF, `${source}.PATH_PRF`);
    normalizePrivateId(value.ID_CRED, "ID_CRED");
    normalizePrivateId(value.ID_PRF, "ID_PRF");
}
async function listIdFiles(dir, idField) {
    const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
    const messages = [];
    const items = [];
    for (const entry of entries) {
        if (!entry.isFile() || !entry.name.endsWith(".toml")) {
            continue;
        }
        const filePath = path.join(dir, entry.name);
        try {
            const parsed = parseIdDocument(await fs.readFile(filePath, "utf8"), filePath);
            if (!(idField in parsed)) {
                messages.push({
                    code: "unrouted_private_toml",
                    message: `${filePath}.${idField} is missing, so this file is not selectable by ID`,
                    severity: "info",
                });
                continue;
            }
            items.push({
                id: normalizePrivateId(String(parsed[idField]), idField),
                fileName: entry.name,
                filePath,
            });
        }
        catch (error) {
            messages.push({
                code: "invalid_private_id_file",
                message: error instanceof Error ? error.message : String(error),
                severity: "error",
            });
        }
    }
    items.sort((a, b) => a.id.localeCompare(b.id) || a.fileName.localeCompare(b.fileName));
    for (const item of duplicateIds(items)) {
        messages.push({
            code: "duplicate_private_id",
            message: `${idField} ${item.id} appears in more than one TOML file`,
            severity: "error",
        });
    }
    return { items, messages };
}
async function resolveIdFile(dir, idField, id) {
    const normalizedId = normalizePrivateId(id, idField);
    const { items, messages } = await listIdFiles(dir, idField);
    const errors = messages.filter((message) => message.severity === "error");
    if (errors.length > 0) {
        throw new Error(errors.map((message) => message.message).join("; "));
    }
    const matches = items.filter((item) => item.id === normalizedId);
    if (matches.length !== 1) {
        throw new Error(`${idField} ${normalizedId} does not exist in ${dir}`);
    }
    return matches[0];
}
function resolveIdFromList(items, idField, id, messages) {
    const matches = items.filter((item) => item.id === id);
    if (matches.length === 1) {
        return matches[0];
    }
    messages.push({
        code: "missing_selected_private_id",
        message: `${idField} ${id} does not exist`,
        severity: "error",
    });
    return undefined;
}
function duplicateIds(items) {
    const seen = new Set();
    const duplicates = new Map();
    for (const item of items) {
        if (seen.has(item.id)) {
            duplicates.set(item.id, item);
        }
        seen.add(item.id);
    }
    return [...duplicates.values()];
}
function parseIdDocument(text, source) {
    let parsed;
    try {
        parsed = parse(text);
    }
    catch (error) {
        throw new Error(`${source}: invalid TOML: ${errorMessage(error)}`);
    }
    assertTable(parsed, source);
    return parsed;
}
function assertTable(value, source) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        throw new Error(`${source} must be a TOML table`);
    }
}
function assertString(value, source) {
    if (typeof value !== "string" || value.length === 0) {
        throw new Error(`${source} must be a non-empty string`);
    }
}
function tomlString(value) {
    return JSON.stringify(value);
}
function errorMessage(error) {
    return error instanceof Error ? error.message : String(error);
}

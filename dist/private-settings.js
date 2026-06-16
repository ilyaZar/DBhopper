import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { normalizeTomlKeys, parseToml } from "./toml.js";
import { assertKnownKeys, assertBoolean, assertNumericId, assertString, assertTable, } from "./schema-helpers.js";
import { DELAY_FALLBACKS, DELAY_PROVIDERS, } from "./delay-provider-options.js";
import { validationError, validationErrorFromException, } from "./validation-messages.js";
const PACKAGE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SETTINGS_RELATIVE_PATH = path.join("assets", "private", "settings.toml");
const DEFAULT_EXTERNAL_PRIVATE_ROOT = path.join("..", "dbhopper-private");
const DEFAULT_USER_CREDENTIALS_PATH = path.join(DEFAULT_EXTERNAL_PRIVATE_ROOT, "credentials");
const DEFAULT_CLAIM_PROFILES_PATH = path.join(DEFAULT_EXTERNAL_PRIVATE_ROOT, "profiles");
const DEFAULT_BUYING_PROFILES_PATH = path.join(DEFAULT_EXTERNAL_PRIVATE_ROOT, "profiles");
const DEFAULT_PAYMENT_PROFILES_PATH = path.join(DEFAULT_EXTERNAL_PRIVATE_ROOT, "credentials");
const DEFAULT_ID = "01";
const SETTINGS_KEYS = new Set([
    "USE_DELAY_RETRIEVAL",
    "USE_CLAIM_REQUESTS",
    "USE_TICKET_PURCHASE",
    "ID_USR",
    "ID_CLM",
    "ID_BUY",
    "ID_PYM",
    "PURCHASE_MODE",
    "PATH_USR",
    "PATH_CLM",
    "PATH_BUY",
    "PATH_PYM",
    "DELAY_PROVIDER",
    "DELAY_FALLBACK",
]);
const PRIVATE_ID_ALIASES = {};
const PRIVATE_SLOT_BY_ID_FIELD = {
    ID_USR: {
        directoryField: "userCredentialsDir",
        pathSettingName: "path_usr",
    },
    ID_CLM: {
        directoryField: "claimProfilesDir",
        pathSettingName: "path_clm",
    },
    ID_BUY: {
        directoryField: "buyingProfilesDir",
        pathSettingName: "path_buy",
    },
    ID_PYM: {
        directoryField: "paymentProfilesDir",
        pathSettingName: "path_pym",
    },
};
const PRIVATE_ID_FIELDS = Object.keys(PRIVATE_SLOT_BY_ID_FIELD);
const PRIVATE_SETTINGS_ALIASES = {
    "": {
        use_delay_retrieval: "USE_DELAY_RETRIEVAL",
        use_claim_requests: "USE_CLAIM_REQUESTS",
        use_ticket_purchase: "USE_TICKET_PURCHASE",
        purchase_mode: "PURCHASE_MODE",
        path_usr: "PATH_USR",
        path_clm: "PATH_CLM",
        path_buy: "PATH_BUY",
        path_pym: "PATH_PYM",
        delay_provider: "DELAY_PROVIDER",
        delay_fallback: "DELAY_FALLBACK",
    },
};
const DELAY_PROVIDER_VALUES = new Set(DELAY_PROVIDERS);
const DELAY_FALLBACK_VALUES = new Set(DELAY_FALLBACKS);
const PURCHASE_MODE_VALUES = new Set(["review", "auto"]);
export function privateSettingsPath(config = {}) {
    return path.join(workspaceRoot(config), SETTINGS_RELATIVE_PATH);
}
export function defaultPrivateSettings() {
    return {
        USE_DELAY_RETRIEVAL: true,
        USE_CLAIM_REQUESTS: false,
        USE_TICKET_PURCHASE: false,
        ID_USR: DEFAULT_ID,
        ID_CLM: DEFAULT_ID,
        ID_BUY: DEFAULT_ID,
        ID_PYM: DEFAULT_ID,
        PURCHASE_MODE: "review",
        PATH_USR: DEFAULT_USER_CREDENTIALS_PATH,
        PATH_CLM: DEFAULT_CLAIM_PROFILES_PATH,
        PATH_BUY: DEFAULT_BUYING_PROFILES_PATH,
        PATH_PYM: DEFAULT_PAYMENT_PROFILES_PATH,
        DELAY_PROVIDER: "bahn-web",
        DELAY_FALLBACK: "none",
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
        userCredentialsDir: resolveConfiguredPath(config, settings.PATH_USR),
        claimProfilesDir: resolveConfiguredPath(config, settings.PATH_CLM),
        buyingProfilesDir: resolveConfiguredPath(config, settings.PATH_BUY),
        paymentProfilesDir: resolveConfiguredPath(config, settings.PATH_PYM),
    };
}
export function parsePrivateSettingsToml(text, source = "settings.toml") {
    const parsed = parseToml(text, source);
    return normalizePrivateSettings(parsed, source);
}
export function stringifyPrivateSettingsToml(settings) {
    return [
        `use_delay_retrieval = ${tomlBoolean(settings.USE_DELAY_RETRIEVAL)}`,
        `use_claim_requests = ${tomlBoolean(settings.USE_CLAIM_REQUESTS)}`,
        `use_ticket_purchase = ${tomlBoolean(settings.USE_TICKET_PURCHASE)}`,
        "",
        `ID_USR = ${tomlString(settings.ID_USR)}`,
        `ID_CLM = ${tomlString(settings.ID_CLM)}`,
        `ID_BUY = ${tomlString(settings.ID_BUY)}`,
        `ID_PYM = ${tomlString(settings.ID_PYM)}`,
        `purchase_mode = ${tomlString(settings.PURCHASE_MODE)}`,
        `path_usr = ${tomlString(settings.PATH_USR)}`,
        `path_clm = ${tomlString(settings.PATH_CLM)}`,
        `path_buy = ${tomlString(settings.PATH_BUY)}`,
        `path_pym = ${tomlString(settings.PATH_PYM)}`,
        `delay_provider = ${tomlString(settings.DELAY_PROVIDER)}`,
        `delay_fallback = ${tomlString(settings.DELAY_FALLBACK)}`,
        "",
    ].join("\n");
}
export async function listCredentialIdFiles(config = {}) {
    return listConfiguredIdFiles(config, "ID_USR");
}
export async function listPaymentProfileIdFiles(config = {}) {
    return listConfiguredIdFiles(config, "ID_PYM");
}
export async function listClaimProfileIdFiles(config = {}) {
    return listConfiguredIdFiles(config, "ID_CLM");
}
export async function listBuyingProfileIdFiles(config = {}) {
    return listConfiguredIdFiles(config, "ID_BUY");
}
export async function resolveSelectedCredentialFile(config = {}) {
    return resolveConfiguredIdFile(config, "ID_USR");
}
export async function resolveSelectedPaymentProfileFile(config = {}) {
    return resolveConfiguredIdFile(config, "ID_PYM");
}
export async function resolveSelectedClaimProfileFile(config = {}) {
    return resolveConfiguredIdFile(config, "ID_CLM");
}
export async function resolveSelectedBuyingProfileFile(config = {}) {
    return resolveConfiguredIdFile(config, "ID_BUY");
}
async function listConfiguredIdFiles(config, idField) {
    const loaded = await readPrivateSettings(config);
    const slot = privateSlotForIdField(idField);
    return {
        settings: loaded,
        ...(await listIdFiles(loaded[slot.directoryField], idField, workspaceRoot(config))),
    };
}
async function resolveConfiguredIdFile(config, idField) {
    const loaded = await readPrivateSettings(config);
    if (!loaded.exists) {
        return undefined;
    }
    const slot = privateSlotForIdField(idField);
    return {
        settings: loaded,
        file: await resolveIdFile(loaded[slot.directoryField], idField, loaded.settings[idField], workspaceRoot(config)),
    };
}
export async function configuredUserCredentialsDir(config = {}) {
    return (await readPrivateSettings(config)).userCredentialsDir;
}
export async function configuredClaimProfilesDir(config = {}) {
    return (await readPrivateSettings(config)).claimProfilesDir;
}
export async function configuredBuyingProfilesDir(config = {}) {
    return (await readPrivateSettings(config)).buyingProfilesDir;
}
export async function configuredPaymentProfilesDir(config = {}) {
    return (await readPrivateSettings(config)).paymentProfilesDir;
}
export async function privateSettingsStatus(config = {}) {
    const settings = await readPrivateSettings(config);
    const root = workspaceRoot(config);
    const credentials = await listConfiguredStatusFiles(settings, "ID_USR", root);
    const paymentProfiles = await listConfiguredStatusFiles(settings, "ID_PYM", root);
    const claimProfiles = await listConfiguredStatusFiles(settings, "ID_CLM", root);
    const buyingProfiles = await listConfiguredStatusFiles(settings, "ID_BUY", root);
    const messages = [
        ...credentials.messages,
        ...paymentProfiles.messages,
        ...claimProfiles.messages,
        ...buyingProfiles.messages,
    ];
    const credentialSelection = credentials.directoryOk
        ? resolveIdFromList(credentials.items, "ID_USR", settings.settings.ID_USR, messages)
        : undefined;
    const paymentProfileSelection = paymentProfiles.directoryOk
        ? resolveIdFromList(paymentProfiles.items, "ID_PYM", settings.settings.ID_PYM, messages)
        : undefined;
    const claimProfileSelection = claimProfiles.directoryOk
        ? resolveIdFromList(claimProfiles.items, "ID_CLM", settings.settings.ID_CLM, messages)
        : undefined;
    const buyingProfileSelection = buyingProfiles.directoryOk
        ? resolveIdFromList(buyingProfiles.items, "ID_BUY", settings.settings.ID_BUY, messages)
        : undefined;
    return {
        ok: messages.every((message) => message.severity !== "error"),
        settings: {
            exists: settings.exists,
            settingsPath: settings.settingsPath,
            USE_DELAY_RETRIEVAL: settings.settings.USE_DELAY_RETRIEVAL,
            USE_CLAIM_REQUESTS: settings.settings.USE_CLAIM_REQUESTS,
            USE_TICKET_PURCHASE: settings.settings.USE_TICKET_PURCHASE,
            ID_USR: settings.settings.ID_USR,
            ID_CLM: settings.settings.ID_CLM,
            ID_BUY: settings.settings.ID_BUY,
            ID_PYM: settings.settings.ID_PYM,
            PURCHASE_MODE: settings.settings.PURCHASE_MODE,
            PATH_USR: settings.settings.PATH_USR,
            PATH_CLM: settings.settings.PATH_CLM,
            PATH_BUY: settings.settings.PATH_BUY,
            PATH_PYM: settings.settings.PATH_PYM,
            DELAY_PROVIDER: settings.settings.DELAY_PROVIDER,
            DELAY_FALLBACK: settings.settings.DELAY_FALLBACK,
            userCredentialsDir: settings.userCredentialsDir,
            claimProfilesDir: settings.claimProfilesDir,
            buyingProfilesDir: settings.buyingProfilesDir,
            paymentProfilesDir: settings.paymentProfilesDir,
        },
        credentials: {
            currentId: settings.settings.ID_USR,
            selected: credentialSelection,
            availableIds: credentials.items.map((item) => item.id),
            files: credentials.items,
        },
        paymentProfiles: {
            currentId: settings.settings.ID_PYM,
            selected: paymentProfileSelection,
            availableIds: paymentProfiles.items.map((item) => item.id),
            files: paymentProfiles.items,
        },
        claimProfiles: {
            currentId: settings.settings.ID_CLM,
            selected: claimProfileSelection,
            availableIds: claimProfiles.items.map((item) => item.id),
            files: claimProfiles.items,
        },
        buyingProfiles: {
            currentId: settings.settings.ID_BUY,
            selected: buyingProfileSelection,
            availableIds: buyingProfiles.items.map((item) => item.id),
            files: buyingProfiles.items,
        },
        messages,
    };
}
export async function writePrivateSettingsIds(updates, config = {}) {
    const loaded = await readPrivateSettings(config);
    const userId = updates.userId ?? updates.credentialId;
    const updated = {
        ...loaded.settings,
        ID_USR: userId
            ? normalizePrivateId(userId, "ID_USR")
            : loaded.settings.ID_USR,
        ID_CLM: updates.claimProfileId
            ? normalizePrivateId(updates.claimProfileId, "ID_CLM")
            : loaded.settings.ID_CLM,
        ID_BUY: updates.buyingProfileId
            ? normalizePrivateId(updates.buyingProfileId, "ID_BUY")
            : loaded.settings.ID_BUY,
        ID_PYM: updates.paymentProfileId
            ? normalizePrivateId(updates.paymentProfileId, "ID_PYM")
            : loaded.settings.ID_PYM,
        PURCHASE_MODE: updates.purchaseMode
            ? normalizePurchaseMode(updates.purchaseMode, "purchase_mode")
            : loaded.settings.PURCHASE_MODE,
    };
    const root = workspaceRoot(config);
    for (const idField of PRIVATE_ID_FIELDS) {
        const slot = privateSlotForIdField(idField);
        await resolveIdFile(loaded[slot.directoryField], idField, updated[idField], root);
    }
    await fs.mkdir(path.dirname(loaded.settingsPath), { recursive: true });
    await fs.writeFile(`${loaded.settingsPath}.tmp`, stringifyPrivateSettingsToml(updated), "utf8");
    await fs.rename(`${loaded.settingsPath}.tmp`, loaded.settingsPath);
    return privateSettingsStatus(config);
}
export function normalizePrivateId(value, field) {
    const trimmed = value.trim();
    assertNumericId(trimmed, field);
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
function normalizePrivateSettings(value, source) {
    const normalizedValue = normalizeTomlKeys(value, source, PRIVATE_SETTINGS_ALIASES, true);
    assertTable(normalizedValue, source);
    const table = normalizedValue;
    assertKnownKeys(table, SETTINGS_KEYS, source);
    assertPrivateSettingsShape(table, source);
    return table;
}
function assertPrivateSettingsShape(value, source) {
    assertTable(value, source);
    for (const key of SETTINGS_KEYS) {
        if (!(key in value)) {
            throw new Error(`${source}.${key} is required`);
        }
    }
    assertBoolean(value.USE_DELAY_RETRIEVAL, `${source}.use_delay_retrieval`);
    assertBoolean(value.USE_CLAIM_REQUESTS, `${source}.use_claim_requests`);
    assertBoolean(value.USE_TICKET_PURCHASE, `${source}.use_ticket_purchase`);
    assertString(value.ID_USR, `${source}.ID_USR`);
    assertString(value.ID_CLM, `${source}.ID_CLM`);
    assertString(value.ID_BUY, `${source}.ID_BUY`);
    assertString(value.ID_PYM, `${source}.ID_PYM`);
    assertString(value.PATH_USR, `${source}.path_usr`);
    assertString(value.PATH_CLM, `${source}.path_clm`);
    assertString(value.PATH_BUY, `${source}.path_buy`);
    assertString(value.PATH_PYM, `${source}.path_pym`);
    assertString(value.PURCHASE_MODE, `${source}.purchase_mode`);
    assertString(value.DELAY_PROVIDER, `${source}.DELAY_PROVIDER`);
    assertString(value.DELAY_FALLBACK, `${source}.DELAY_FALLBACK`);
    normalizePrivateId(value.ID_USR, "ID_USR");
    normalizePrivateId(value.ID_CLM, "ID_CLM");
    normalizePrivateId(value.ID_BUY, "ID_BUY");
    normalizePrivateId(value.ID_PYM, "ID_PYM");
    assertOneOf(value.PURCHASE_MODE, PURCHASE_MODE_VALUES, `${source}.purchase_mode`);
    assertOneOf(value.DELAY_PROVIDER, DELAY_PROVIDER_VALUES, `${source}.DELAY_PROVIDER`);
    assertOneOf(value.DELAY_FALLBACK, DELAY_FALLBACK_VALUES, `${source}.DELAY_FALLBACK`);
}
function normalizePurchaseMode(value, source) {
    assertOneOf(value, PURCHASE_MODE_VALUES, source);
    return value;
}
async function listIdFiles(dir, idField, root) {
    const messages = [];
    const items = [];
    const pathField = pathSettingNameForIdField(idField);
    const locationError = await privateDirectoryLocationError(dir, idField, root);
    if (locationError) {
        messages.push(locationError);
        return { items, messages, directoryOk: false };
    }
    const stat = await fs.stat(dir).catch((error) => {
        messages.push(validationError("invalid_private_directory", `${pathField} ${dir} is not readable: ${error.code ?? error.message}`));
        return undefined;
    });
    if (!stat) {
        return { items, messages, directoryOk: false };
    }
    if (!stat.isDirectory()) {
        messages.push(validationError("invalid_private_directory", `${pathField} ${dir} must point to a directory`));
        return { items, messages, directoryOk: false };
    }
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
        if (!entry.isFile() || !entry.name.endsWith(".toml")) {
            continue;
        }
        const filePath = path.join(dir, entry.name);
        try {
            const parsed = parseIdDocument(await fs.readFile(filePath, "utf8"), filePath);
            if (!(idField in parsed)) {
                if (isOtherPrivateIdFile(parsed, idField)) {
                    continue;
                }
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
            messages.push(validationErrorFromException("invalid_private_id_file", error));
        }
    }
    items.sort((a, b) => a.id.localeCompare(b.id) || a.fileName.localeCompare(b.fileName));
    for (const item of duplicateIds(items)) {
        messages.push(validationError("duplicate_private_id", `${idField} ${item.id} appears in more than one TOML file`));
    }
    return { items, messages, directoryOk: true };
}
async function listConfiguredStatusFiles(settings, idField, root) {
    const slot = privateSlotForIdField(idField);
    return listIdFiles(settings[slot.directoryField], idField, root);
}
async function resolveIdFile(dir, idField, id, root) {
    const normalizedId = normalizePrivateId(id, idField);
    const { items, messages } = await listIdFiles(dir, idField, root);
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
    messages.push(validationError("missing_selected_private_id", `${idField} ${id} does not exist`));
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
    const parsed = normalizeTomlKeys(parseToml(text, source), source, PRIVATE_ID_ALIASES, true);
    assertTable(parsed, source);
    return parsed;
}
function isOtherPrivateIdFile(parsed, idField) {
    return PRIVATE_ID_FIELDS.some((field) => field !== idField && field in parsed);
}
export async function privateDirectoryLocationError(dir, idField, root) {
    const pathField = pathSettingNameForIdField(idField);
    const resolvedRoot = path.resolve(root);
    const resolvedDir = path.resolve(dir);
    if (isPathInsideOrEqual(resolvedDir, resolvedRoot)) {
        return validationError("private_directory_inside_workspace", `${pathField} ${resolvedDir} must point to a directory outside the plugin workspace ${resolvedRoot}`);
    }
    const [realRoot, realDir] = await Promise.all([
        fs.realpath(resolvedRoot).catch(() => resolvedRoot),
        fs.realpath(resolvedDir).catch(() => undefined),
    ]);
    if (realDir && isPathInsideOrEqual(realDir, realRoot)) {
        return validationError("private_directory_inside_workspace", `${pathField} ${resolvedDir} resolves inside the plugin workspace ${realRoot}`);
    }
    return undefined;
}
function isPathInsideOrEqual(candidate, parent) {
    const relative = path.relative(parent, candidate);
    return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}
function privateSlotForIdField(idField) {
    return PRIVATE_SLOT_BY_ID_FIELD[idField];
}
function assertOneOf(value, allowed, source) {
    if (typeof value !== "string" || !allowed.has(value)) {
        throw new Error(`${source} must be one of: ${[...allowed].join(", ")}`);
    }
}
function pathSettingNameForIdField(idField) {
    return privateSlotForIdField(idField).pathSettingName;
}
function tomlString(value) {
    return JSON.stringify(value);
}
function tomlBoolean(value) {
    return value ? "true" : "false";
}

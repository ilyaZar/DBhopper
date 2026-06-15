import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type { DBhopperConfig, ValidationMessage } from "./types.js";
import { normalizeTomlKeys, parseToml, type TomlKeyMapByPath } from "./toml.js";
import {
  assertKnownKeys,
  assertNumericId,
  assertString,
  assertTable,
} from "./schema-helpers.js";
import {
  DELAY_FALLBACKS,
  DELAY_PROVIDERS,
  type DBhopperDelayFallbackSetting,
  type DBhopperDelayProviderSetting,
} from "./delay-provider-options.js";
import {
  validationError,
  validationErrorFromException,
} from "./validation-messages.js";

export type DBhopperTicketBuyingMode = "review" | "auto";
export type {
  DBhopperDelayFallbackSetting,
  DBhopperDelayProviderSetting,
} from "./delay-provider-options.js";

export interface DBhopperPrivateSettings {
  ID_USR: string;
  ID_CLM: string;
  ID_BUY: string;
  ID_PYM: string;
  TICKET_BUYING_MODE: DBhopperTicketBuyingMode;
  PATH_CRED: string;
  PATH_PRF: string;
  DELAY_PROVIDER: DBhopperDelayProviderSetting;
  DELAY_FALLBACK: DBhopperDelayFallbackSetting;
}

export interface LoadedPrivateSettings {
  exists: boolean;
  settingsPath: string;
  settings: DBhopperPrivateSettings;
  credentialsDir: string;
  profilesDir: string;
}

export interface PrivateIdFile {
  id: string;
  fileName: string;
  filePath: string;
}

type PrivateIdField = "ID_USR" | "ID_CLM" | "ID_BUY" | "ID_PYM";
type PrivateDirectoryField = "credentialsDir" | "profilesDir";

const PACKAGE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SETTINGS_RELATIVE_PATH = path.join("assets", "private", "settings.toml");
const DEFAULT_CREDENTIALS_PATH = path.join("assets", "private", "credentials");
const DEFAULT_PROFILES_PATH = path.join("assets", "private", "profiles");
const DEFAULT_ID = "01";
const SETTINGS_KEYS = new Set([
  "ID_USR",
  "ID_CLM",
  "ID_BUY",
  "ID_PYM",
  "TICKET_BUYING_MODE",
  "PATH_CRED",
  "PATH_PRF",
  "DELAY_PROVIDER",
  "DELAY_FALLBACK",
]);
const PRIVATE_ID_ALIASES: TomlKeyMapByPath = {};
const SIBLING_PRIVATE_ID_FIELDS: Record<PrivateIdField, PrivateIdField> = {
  ID_USR: "ID_PYM",
  ID_PYM: "ID_USR",
  ID_CLM: "ID_BUY",
  ID_BUY: "ID_CLM",
};
const PRIVATE_SETTINGS_ALIASES: TomlKeyMapByPath = {
  "": {
    ticket_buying_mode: "TICKET_BUYING_MODE",
    path_cred: "PATH_CRED",
    path_prf: "PATH_PRF",
    delay_provider: "DELAY_PROVIDER",
    delay_fallback: "DELAY_FALLBACK",
  },
};
const DELAY_PROVIDER_VALUES = new Set<string>(DELAY_PROVIDERS);
const DELAY_FALLBACK_VALUES = new Set<string>(DELAY_FALLBACKS);
const TICKET_BUYING_MODE_VALUES = new Set(["review", "auto"]);

export function privateSettingsPath(config: DBhopperConfig = {}) {
  return path.join(workspaceRoot(config), SETTINGS_RELATIVE_PATH);
}

export function defaultPrivateSettings(): DBhopperPrivateSettings {
  return {
    ID_USR: DEFAULT_ID,
    ID_CLM: DEFAULT_ID,
    ID_BUY: DEFAULT_ID,
    ID_PYM: DEFAULT_ID,
    TICKET_BUYING_MODE: "review",
    PATH_CRED: DEFAULT_CREDENTIALS_PATH,
    PATH_PRF: DEFAULT_PROFILES_PATH,
    DELAY_PROVIDER: "bahn-web",
    DELAY_FALLBACK: "none",
  };
}

export async function readPrivateSettings(
  config: DBhopperConfig = {},
): Promise<LoadedPrivateSettings> {
  const settingsPath = privateSettingsPath(config);
  let exists = true;
  let settings = defaultPrivateSettings();

  try {
    settings = parsePrivateSettingsToml(await fs.readFile(settingsPath, "utf8"), settingsPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      exists = false;
    } else {
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

export function parsePrivateSettingsToml(
  text: string,
  source = "settings.toml",
): DBhopperPrivateSettings {
  const parsed = parseToml(text, source);
  return normalizePrivateSettings(parsed, source);
}

export function stringifyPrivateSettingsToml(settings: DBhopperPrivateSettings) {
  return [
    `ID_USR = ${tomlString(settings.ID_USR)}`,
    `ID_CLM = ${tomlString(settings.ID_CLM)}`,
    `ID_BUY = ${tomlString(settings.ID_BUY)}`,
    `ID_PYM = ${tomlString(settings.ID_PYM)}`,
    `ticket_buying_mode = ${tomlString(settings.TICKET_BUYING_MODE)}`,
    `path_cred = ${tomlString(settings.PATH_CRED)}`,
    `path_prf = ${tomlString(settings.PATH_PRF)}`,
    `delay_provider = ${tomlString(settings.DELAY_PROVIDER)}`,
    `delay_fallback = ${tomlString(settings.DELAY_FALLBACK)}`,
    "",
  ].join("\n");
}

export async function listCredentialIdFiles(config: DBhopperConfig = {}) {
  return listConfiguredIdFiles(config, "credentialsDir", "ID_USR");
}

export async function listPaymentProfileIdFiles(config: DBhopperConfig = {}) {
  return listConfiguredIdFiles(config, "credentialsDir", "ID_PYM");
}

export async function listClaimProfileIdFiles(config: DBhopperConfig = {}) {
  return listConfiguredIdFiles(config, "profilesDir", "ID_CLM");
}

export async function listBuyingProfileIdFiles(config: DBhopperConfig = {}) {
  return listConfiguredIdFiles(config, "profilesDir", "ID_BUY");
}

export async function resolveSelectedCredentialFile(config: DBhopperConfig = {}) {
  return resolveConfiguredIdFile(config, "credentialsDir", "ID_USR");
}

export async function resolveSelectedPaymentProfileFile(config: DBhopperConfig = {}) {
  return resolveConfiguredIdFile(config, "credentialsDir", "ID_PYM");
}

export async function resolveSelectedClaimProfileFile(config: DBhopperConfig = {}) {
  return resolveConfiguredIdFile(config, "profilesDir", "ID_CLM");
}

export async function resolveSelectedBuyingProfileFile(config: DBhopperConfig = {}) {
  return resolveConfiguredIdFile(config, "profilesDir", "ID_BUY");
}

async function listConfiguredIdFiles(
  config: DBhopperConfig,
  directoryField: PrivateDirectoryField,
  idField: PrivateIdField,
) {
  const loaded = await readPrivateSettings(config);
  return {
    settings: loaded,
    ...(await listIdFiles(loaded[directoryField], idField)),
  };
}

async function resolveConfiguredIdFile(
  config: DBhopperConfig,
  directoryField: PrivateDirectoryField,
  idField: PrivateIdField,
) {
  const loaded = await readPrivateSettings(config);
  if (!loaded.exists) {
    return undefined;
  }
  return {
    settings: loaded,
    file: await resolveIdFile(
      loaded[directoryField],
      idField,
      loaded.settings[idField],
    ),
  };
}

export async function configuredCredentialsDir(config: DBhopperConfig = {}) {
  return (await readPrivateSettings(config)).credentialsDir;
}

export async function configuredProfilesDir(config: DBhopperConfig = {}) {
  return (await readPrivateSettings(config)).profilesDir;
}

export async function privateSettingsStatus(config: DBhopperConfig = {}) {
  const settings = await readPrivateSettings(config);
  const credentials = await listIdFiles(settings.credentialsDir, "ID_USR");
  const paymentProfiles = await listIdFiles(settings.credentialsDir, "ID_PYM");
  const claimProfiles = await listIdFiles(settings.profilesDir, "ID_CLM");
  const buyingProfiles = await listIdFiles(settings.profilesDir, "ID_BUY");
  const messages: ValidationMessage[] = [
    ...credentials.messages,
    ...paymentProfiles.messages,
    ...claimProfiles.messages,
    ...buyingProfiles.messages,
  ];
  const credentialSelection = credentials.directoryOk
    ? resolveIdFromList(
        credentials.items,
        "ID_USR",
        settings.settings.ID_USR,
        messages,
      )
    : undefined;
  const paymentProfileSelection = paymentProfiles.directoryOk
    ? resolveIdFromList(
        paymentProfiles.items,
        "ID_PYM",
        settings.settings.ID_PYM,
        messages,
      )
    : undefined;
  const claimProfileSelection = claimProfiles.directoryOk
    ? resolveIdFromList(
        claimProfiles.items,
        "ID_CLM",
        settings.settings.ID_CLM,
        messages,
      )
    : undefined;
  const buyingProfileSelection = buyingProfiles.directoryOk
    ? resolveIdFromList(
        buyingProfiles.items,
        "ID_BUY",
        settings.settings.ID_BUY,
        messages,
      )
    : undefined;

  return {
    ok: messages.every((message) => message.severity !== "error"),
    settings: {
      exists: settings.exists,
      settingsPath: settings.settingsPath,
      ID_USR: settings.settings.ID_USR,
      ID_CLM: settings.settings.ID_CLM,
      ID_BUY: settings.settings.ID_BUY,
      ID_PYM: settings.settings.ID_PYM,
      TICKET_BUYING_MODE: settings.settings.TICKET_BUYING_MODE,
      PATH_CRED: settings.settings.PATH_CRED,
      PATH_PRF: settings.settings.PATH_PRF,
      DELAY_PROVIDER: settings.settings.DELAY_PROVIDER,
      DELAY_FALLBACK: settings.settings.DELAY_FALLBACK,
      credentialsDir: settings.credentialsDir,
      profilesDir: settings.profilesDir,
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

export async function writePrivateSettingsIds(
  updates: {
    userId?: string;
    credentialId?: string;
    claimProfileId?: string;
    buyingProfileId?: string;
    paymentProfileId?: string;
    ticketBuyingMode?: DBhopperTicketBuyingMode;
  },
  config: DBhopperConfig = {},
) {
  const loaded = await readPrivateSettings(config);
  const userId = updates.userId ?? updates.credentialId;
  const updated: DBhopperPrivateSettings = {
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
    TICKET_BUYING_MODE: updates.ticketBuyingMode
      ? normalizeTicketBuyingMode(
          updates.ticketBuyingMode,
          "TICKET_BUYING_MODE",
        )
      : loaded.settings.TICKET_BUYING_MODE,
  };

  await resolveIdFile(loaded.credentialsDir, "ID_USR", updated.ID_USR);
  await resolveIdFile(loaded.credentialsDir, "ID_PYM", updated.ID_PYM);
  await resolveIdFile(loaded.profilesDir, "ID_CLM", updated.ID_CLM);
  await resolveIdFile(loaded.profilesDir, "ID_BUY", updated.ID_BUY);
  await fs.mkdir(path.dirname(loaded.settingsPath), { recursive: true });
  await fs.writeFile(
    `${loaded.settingsPath}.tmp`,
    stringifyPrivateSettingsToml(updated),
    "utf8",
  );
  await fs.rename(`${loaded.settingsPath}.tmp`, loaded.settingsPath);
  return privateSettingsStatus(config);
}

export function normalizePrivateId(
  value: string,
  field: PrivateIdField,
) {
  const trimmed = value.trim();
  assertNumericId(trimmed, field);
  return trimmed;
}

function workspaceRoot(config: DBhopperConfig) {
  return path.resolve(config.workspaceRoot || PACKAGE_ROOT);
}

function resolveConfiguredPath(config: DBhopperConfig, value: string) {
  return path.isAbsolute(value)
    ? path.resolve(value)
    : path.resolve(workspaceRoot(config), value);
}

function normalizePrivateSettings(
  value: unknown,
  source: string,
): DBhopperPrivateSettings {
  const normalizedValue = normalizeTomlKeys(
    value,
    source,
    PRIVATE_SETTINGS_ALIASES,
    true,
  );
  assertTable(normalizedValue, source);
  const table = normalizedValue as Record<string, unknown>;
  assertKnownKeys(table, SETTINGS_KEYS, source);
  const normalized: Record<string, unknown> = {
    ...table,
    TICKET_BUYING_MODE: table.TICKET_BUYING_MODE ?? "review",
  };
  assertPrivateSettingsShape(normalized, source);
  return normalized as unknown as DBhopperPrivateSettings;
}

function assertPrivateSettingsShape(
  value: unknown,
  source: string,
): asserts value is DBhopperPrivateSettings {
  assertTable(value, source);
  for (const key of SETTINGS_KEYS) {
    if (key === "TICKET_BUYING_MODE") {
      continue;
    }
    if (!(key in value)) {
      throw new Error(`${source}.${key} is required`);
    }
  }
  assertString(value.ID_USR, `${source}.ID_USR`);
  assertString(value.ID_CLM, `${source}.ID_CLM`);
  assertString(value.ID_BUY, `${source}.ID_BUY`);
  assertString(value.ID_PYM, `${source}.ID_PYM`);
  assertString(value.PATH_CRED, `${source}.PATH_CRED`);
  assertString(value.PATH_PRF, `${source}.PATH_PRF`);
  assertString(value.TICKET_BUYING_MODE, `${source}.TICKET_BUYING_MODE`);
  assertString(value.DELAY_PROVIDER, `${source}.DELAY_PROVIDER`);
  assertString(value.DELAY_FALLBACK, `${source}.DELAY_FALLBACK`);
  normalizePrivateId(value.ID_USR as string, "ID_USR");
  normalizePrivateId(value.ID_CLM as string, "ID_CLM");
  normalizePrivateId(value.ID_BUY as string, "ID_BUY");
  normalizePrivateId(value.ID_PYM as string, "ID_PYM");
  assertOneOf(
    value.TICKET_BUYING_MODE,
    TICKET_BUYING_MODE_VALUES,
    `${source}.TICKET_BUYING_MODE`,
  );
  assertOneOf(
    value.DELAY_PROVIDER,
    DELAY_PROVIDER_VALUES,
    `${source}.DELAY_PROVIDER`,
  );
  assertOneOf(
    value.DELAY_FALLBACK,
    DELAY_FALLBACK_VALUES,
    `${source}.DELAY_FALLBACK`,
  );
}

function normalizeTicketBuyingMode(
  value: string,
  source: string,
): DBhopperTicketBuyingMode {
  assertOneOf(value, TICKET_BUYING_MODE_VALUES, source);
  return value as DBhopperTicketBuyingMode;
}

async function listIdFiles(
  dir: string,
  idField: PrivateIdField,
) {
  const messages: ValidationMessage[] = [];
  const items: PrivateIdFile[] = [];
  const pathField =
    idField === "ID_USR" || idField === "ID_PYM" ? "PATH_CRED" : "PATH_PRF";
  const stat = await fs.stat(dir).catch((error: NodeJS.ErrnoException) => {
    messages.push(validationError(
      "invalid_private_directory",
      `${pathField} ${dir} is not readable: ${error.code ?? error.message}`,
    ));
    return undefined;
  });

  if (!stat) {
    return { items, messages, directoryOk: false };
  }
  if (!stat.isDirectory()) {
    messages.push(validationError(
      "invalid_private_directory",
      `${pathField} ${dir} must point to a directory`,
    ));
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
        if (isSiblingProfileFile(parsed, idField)) {
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
    } catch (error) {
      messages.push(validationErrorFromException("invalid_private_id_file", error));
    }
  }

  items.sort((a, b) => a.id.localeCompare(b.id) || a.fileName.localeCompare(b.fileName));
  for (const item of duplicateIds(items)) {
    messages.push(validationError(
      "duplicate_private_id",
      `${idField} ${item.id} appears in more than one TOML file`,
    ));
  }
  return { items, messages, directoryOk: true };
}

async function resolveIdFile(
  dir: string,
  idField: PrivateIdField,
  id: string,
) {
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

function resolveIdFromList(
  items: PrivateIdFile[],
  idField: PrivateIdField,
  id: string,
  messages: ValidationMessage[],
) {
  const matches = items.filter((item) => item.id === id);
  if (matches.length === 1) {
    return matches[0];
  }
  messages.push(validationError(
    "missing_selected_private_id",
    `${idField} ${id} does not exist`,
  ));
  return undefined;
}

function duplicateIds(items: PrivateIdFile[]) {
  const seen = new Set<string>();
  const duplicates = new Map<string, PrivateIdFile>();
  for (const item of items) {
    if (seen.has(item.id)) {
      duplicates.set(item.id, item);
    }
    seen.add(item.id);
  }
  return [...duplicates.values()];
}

function parseIdDocument(text: string, source: string) {
  const parsed = normalizeTomlKeys(
    parseToml(text, source),
    source,
    PRIVATE_ID_ALIASES,
    true,
  );
  assertTable(parsed, source);
  return parsed;
}

function isSiblingProfileFile(
  parsed: Record<string, unknown>,
  idField: PrivateIdField,
) {
  return SIBLING_PRIVATE_ID_FIELDS[idField] in parsed;
}

function assertOneOf(value: unknown, allowed: Set<string>, source: string) {
  if (typeof value !== "string" || !allowed.has(value)) {
    throw new Error(`${source} must be one of: ${[...allowed].join(", ")}`);
  }
}

function tomlString(value: string) {
  return JSON.stringify(value);
}

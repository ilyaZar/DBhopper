import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { parse } from "smol-toml";

import type { DBhopperConfig, ValidationMessage } from "./types.js";

export type DBhopperDelayProviderSetting = "auto" | "db-timetables" | "bahn-web";
export type DBhopperDelayFallbackSetting = "none" | "db-timetables" | "bahn-web";
export type DBhopperTicketBuyingMode = "review" | "auto";

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
const SETTINGS_KEY_ALIASES = new Set([
  ...SETTINGS_KEYS,
  "ticket_buying_mode",
  "buying_mode",
]);
const DELAY_PROVIDER_VALUES = new Set(["auto", "db-timetables", "bahn-web"]);
const DELAY_FALLBACK_VALUES = new Set(["none", "db-timetables", "bahn-web"]);
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
  let parsed: unknown;
  try {
    parsed = parse(text);
  } catch (error) {
    throw new Error(`${source}: invalid TOML: ${errorMessage(error)}`);
  }
  return normalizePrivateSettings(parsed, source);
}

export function stringifyPrivateSettingsToml(settings: DBhopperPrivateSettings) {
  return [
    `ID_USR = ${tomlString(settings.ID_USR)}`,
    `ID_CLM = ${tomlString(settings.ID_CLM)}`,
    `ID_BUY = ${tomlString(settings.ID_BUY)}`,
    `ID_PYM = ${tomlString(settings.ID_PYM)}`,
    `TICKET_BUYING_MODE = ${tomlString(settings.TICKET_BUYING_MODE)}`,
    `PATH_CRED = ${tomlString(settings.PATH_CRED)}`,
    `PATH_PRF = ${tomlString(settings.PATH_PRF)}`,
    `DELAY_PROVIDER = ${tomlString(settings.DELAY_PROVIDER)}`,
    `DELAY_FALLBACK = ${tomlString(settings.DELAY_FALLBACK)}`,
    "",
  ].join("\n");
}

export async function listCredentialIdFiles(config: DBhopperConfig = {}) {
  const loaded = await readPrivateSettings(config);
  return {
    settings: loaded,
    ...(await listIdFiles(loaded.credentialsDir, "ID_USR")),
  };
}

export async function listPaymentProfileIdFiles(config: DBhopperConfig = {}) {
  const loaded = await readPrivateSettings(config);
  return {
    settings: loaded,
    ...(await listIdFiles(loaded.credentialsDir, "ID_PYM")),
  };
}

export async function listProfileIdFiles(config: DBhopperConfig = {}) {
  return listClaimProfileIdFiles(config);
}

export async function listClaimProfileIdFiles(config: DBhopperConfig = {}) {
  const loaded = await readPrivateSettings(config);
  return {
    settings: loaded,
    ...(await listIdFiles(loaded.profilesDir, "ID_CLM")),
  };
}

export async function listBuyingProfileIdFiles(config: DBhopperConfig = {}) {
  const loaded = await readPrivateSettings(config);
  return {
    settings: loaded,
    ...(await listIdFiles(loaded.profilesDir, "ID_BUY")),
  };
}

export async function resolveSelectedCredentialFile(config: DBhopperConfig = {}) {
  const loaded = await readPrivateSettings(config);
  if (!loaded.exists) {
    return undefined;
  }
  return {
    settings: loaded,
    file: await resolveIdFile(loaded.credentialsDir, "ID_USR", loaded.settings.ID_USR),
  };
}

export async function resolveSelectedPaymentProfileFile(config: DBhopperConfig = {}) {
  const loaded = await readPrivateSettings(config);
  if (!loaded.exists) {
    return undefined;
  }
  return {
    settings: loaded,
    file: await resolveIdFile(loaded.credentialsDir, "ID_PYM", loaded.settings.ID_PYM),
  };
}

export async function resolveSelectedProfileFile(config: DBhopperConfig = {}) {
  return resolveSelectedClaimProfileFile(config);
}

export async function resolveSelectedClaimProfileFile(config: DBhopperConfig = {}) {
  const loaded = await readPrivateSettings(config);
  if (!loaded.exists) {
    return undefined;
  }
  return {
    settings: loaded,
    file: await resolveIdFile(loaded.profilesDir, "ID_CLM", loaded.settings.ID_CLM),
  };
}

export async function resolveSelectedBuyingProfileFile(config: DBhopperConfig = {}) {
  const loaded = await readPrivateSettings(config);
  if (!loaded.exists) {
    return undefined;
  }
  return {
    settings: loaded,
    file: await resolveIdFile(loaded.profilesDir, "ID_BUY", loaded.settings.ID_BUY),
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
  field: "ID_USR" | "ID_CLM" | "ID_BUY" | "ID_PYM",
) {
  const trimmed = value.trim();
  if (!/^\d{2,}$/.test(trimmed)) {
    throw new Error(`${field} must be a quoted numeric ID like "01"`);
  }
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
  assertTable(value, source);
  const table = value as Record<string, unknown>;
  for (const key of Object.keys(table)) {
    if (!SETTINGS_KEY_ALIASES.has(key)) {
      throw new Error(`${source}.${key} is not a supported field`);
    }
  }
  const ticketBuyingMode = ticketBuyingModeFromSettings(table, source);
  const normalized: Record<string, unknown> = {
    ...table,
    TICKET_BUYING_MODE: ticketBuyingMode,
  };
  delete normalized.ticket_buying_mode;
  delete normalized.buying_mode;
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

function ticketBuyingModeFromSettings(
  value: Record<string, unknown>,
  source: string,
) {
  const entries = [
    ["TICKET_BUYING_MODE", value.TICKET_BUYING_MODE],
    ["ticket_buying_mode", value.ticket_buying_mode],
    ["buying_mode", value.buying_mode],
  ].filter((entry): entry is [string, unknown] => entry[1] !== undefined);
  if (entries.length === 0) {
    return "review";
  }
  for (const [key, entry] of entries) {
    assertString(entry, `${source}.${key}`);
    normalizeTicketBuyingMode(entry as string, `${source}.${key}`);
  }
  const normalized = entries.map(([, entry]) => entry as string);
  const first = normalized[0];
  if (normalized.some((entry) => entry !== first)) {
    throw new Error(
      `${source}.TICKET_BUYING_MODE aliases must not disagree`,
    );
  }
  return first as DBhopperTicketBuyingMode;
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
  idField: "ID_USR" | "ID_CLM" | "ID_BUY" | "ID_PYM",
) {
  const messages: ValidationMessage[] = [];
  const items: PrivateIdFile[] = [];
  const pathField =
    idField === "ID_USR" || idField === "ID_PYM" ? "PATH_CRED" : "PATH_PRF";
  const stat = await fs.stat(dir).catch((error: NodeJS.ErrnoException) => {
    messages.push({
      code: "invalid_private_directory",
      message: `${pathField} ${dir} is not readable: ${error.code ?? error.message}`,
      severity: "error",
    });
    return undefined;
  });

  if (!stat) {
    return { items, messages, directoryOk: false };
  }
  if (!stat.isDirectory()) {
    messages.push({
      code: "invalid_private_directory",
      message: `${pathField} ${dir} must point to a directory`,
      severity: "error",
    });
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
  return { items, messages, directoryOk: true };
}

async function resolveIdFile(
  dir: string,
  idField: "ID_USR" | "ID_CLM" | "ID_BUY" | "ID_PYM",
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
  idField: "ID_USR" | "ID_CLM" | "ID_BUY" | "ID_PYM",
  id: string,
  messages: ValidationMessage[],
) {
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
  let parsed: unknown;
  try {
    parsed = parse(text);
  } catch (error) {
    throw new Error(`${source}: invalid TOML: ${errorMessage(error)}`);
  }
  assertTable(parsed, source);
  return parsed;
}

function isSiblingProfileFile(
  parsed: Record<string, unknown>,
  idField: "ID_USR" | "ID_CLM" | "ID_BUY" | "ID_PYM",
) {
  if (idField === "ID_USR") {
    return "ID_PYM" in parsed;
  }
  if (idField === "ID_PYM") {
    return "ID_USR" in parsed;
  }
  if (idField === "ID_CLM") {
    return "ID_BUY" in parsed;
  }
  if (idField === "ID_BUY") {
    return "ID_CLM" in parsed;
  }
  return false;
}

function assertTable(value: unknown, source: string): asserts value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${source} must be a TOML table`);
  }
}

function assertString(value: unknown, source: string) {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${source} must be a non-empty string`);
  }
}

function assertOneOf(value: unknown, allowed: Set<string>, source: string) {
  if (typeof value !== "string" || !allowed.has(value)) {
    throw new Error(`${source} must be one of: ${[...allowed].join(", ")}`);
  }
}

function tomlString(value: string) {
  return JSON.stringify(value);
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

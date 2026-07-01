import fs from "node:fs/promises";
import type { Dirent } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type { DBhopperConfig, ValidationMessage } from "./types.js";
import { normalizeTomlKeys, parseToml, type TomlKeyMapByPath } from "./toml.js";
import {
  assertKnownKeys,
  assertBoolean,
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

export type DBhopperPurchaseMode = "review" | "auto";
export type {
  DBhopperDelayFallbackSetting,
  DBhopperDelayProviderSetting,
} from "./delay-provider-options.js";

export interface DBhopperPrivateSettings {
  USE_DELAY_RETRIEVAL: boolean;
  USE_CLAIM_REQUESTS: boolean;
  USE_TICKET_PURCHASE: boolean;
  ID_USR: string;
  ID_CLM: string;
  ID_BUY: string;
  ID_PYM: string;
  PURCHASE_MODE: DBhopperPurchaseMode;
  PATH_USR: string;
  PATH_CLM: string;
  PATH_BUY: string;
  PATH_PYM: string;
  PATH_PRC: string;
  DELAY_PROVIDER: DBhopperDelayProviderSetting;
  DELAY_FALLBACK: DBhopperDelayFallbackSetting;
}

export interface LoadedPrivateSettings {
  exists: boolean;
  settingsPath: string;
  settings: DBhopperPrivateSettings;
  userCredentialsDir: string;
  claimProfilesDir: string;
  buyingProfilesDir: string;
  paymentProfilesDir: string;
  purchaseArtifactsDir: string;
}

export interface DBhopperRuntimeConfigUpdates {
  use_delay_retrieval?: boolean;
  use_claim_requests?: boolean;
  use_ticket_purchase?: boolean;
  delay_provider?: DBhopperDelayProviderSetting;
  delay_fallback?: DBhopperDelayFallbackSetting;
  purchase_mode?: DBhopperPurchaseMode;
}

export interface DBhopperRuntimeConfigChange {
  field: keyof DBhopperRuntimeConfigUpdates;
  from: boolean | string;
  to: boolean | string;
  meaning: string;
}

export interface DBhopperRuntimeConfigPreview {
  current: Required<DBhopperRuntimeConfigUpdates>;
  requested: Partial<DBhopperRuntimeConfigUpdates>;
  changes: DBhopperRuntimeConfigChange[];
  needsUserAction: boolean;
  message: string;
}

export interface PrivateIdFile {
  id: string;
  fileName: string;
  filePath: string;
}

type PrivateIdField = "ID_USR" | "ID_CLM" | "ID_BUY" | "ID_PYM";
type PrivateDirectoryField =
  | "userCredentialsDir"
  | "claimProfilesDir"
  | "buyingProfilesDir"
  | "paymentProfilesDir";
type PrivatePathSettingName = "path_usr" | "path_clm" | "path_buy" | "path_pym";

const PACKAGE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SETTINGS_RELATIVE_PATH = path.join("assets", "private", "settings.toml");
const DEFAULT_EXTERNAL_PRIVATE_ROOT = path.join("..", "dbhopper-private");
const DEFAULT_USER_CREDENTIALS_PATH = path.join(DEFAULT_EXTERNAL_PRIVATE_ROOT, "credentials");
const DEFAULT_CLAIM_PROFILES_PATH = path.join(DEFAULT_EXTERNAL_PRIVATE_ROOT, "profiles");
const DEFAULT_BUYING_PROFILES_PATH = path.join(DEFAULT_EXTERNAL_PRIVATE_ROOT, "profiles");
const DEFAULT_PAYMENT_PROFILES_PATH = path.join(DEFAULT_EXTERNAL_PRIVATE_ROOT, "credentials");
const DEFAULT_PURCHASE_ARTIFACTS_PATH = path.join(DEFAULT_EXTERNAL_PRIVATE_ROOT, "purchases");
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
  "PATH_PRC",
  "DELAY_PROVIDER",
  "DELAY_FALLBACK",
]);
const PRIVATE_ID_ALIASES: TomlKeyMapByPath = {};
const PRIVATE_SLOT_BY_ID_FIELD: Record<
  PrivateIdField,
  {
    directoryField: PrivateDirectoryField;
    pathSettingName: PrivatePathSettingName;
  }
> = {
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
const PRIVATE_ID_FIELDS = Object.keys(PRIVATE_SLOT_BY_ID_FIELD) as PrivateIdField[];
const PRIVATE_SETTINGS_ALIASES: TomlKeyMapByPath = {
  "": {
    use_delay_retrieval: "USE_DELAY_RETRIEVAL",
    use_claim_requests: "USE_CLAIM_REQUESTS",
    use_ticket_purchase: "USE_TICKET_PURCHASE",
    purchase_mode: "PURCHASE_MODE",
    path_usr: "PATH_USR",
    path_clm: "PATH_CLM",
    path_buy: "PATH_BUY",
    path_pym: "PATH_PYM",
    path_prc: "PATH_PRC",
    delay_provider: "DELAY_PROVIDER",
    delay_fallback: "DELAY_FALLBACK",
  },
};
const DELAY_PROVIDER_VALUES = new Set<string>(DELAY_PROVIDERS);
const DELAY_FALLBACK_VALUES = new Set<string>(DELAY_FALLBACKS);
const PURCHASE_MODE_VALUES = new Set(["review", "auto"]);

export function privateSettingsPath(config: DBhopperConfig = {}) {
  return path.resolve(config.settingsPath || path.join(PACKAGE_ROOT, SETTINGS_RELATIVE_PATH));
}

export function privateSettingsRoot(config: DBhopperConfig = {}) {
  return settingsRootFromPath(privateSettingsPath(config));
}

export function defaultPrivateSettings(): DBhopperPrivateSettings {
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
    PATH_PRC: DEFAULT_PURCHASE_ARTIFACTS_PATH,
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
    userCredentialsDir: resolveConfiguredPath(settingsPath, settings.PATH_USR),
    claimProfilesDir: resolveConfiguredPath(settingsPath, settings.PATH_CLM),
    buyingProfilesDir: resolveConfiguredPath(settingsPath, settings.PATH_BUY),
    paymentProfilesDir: resolveConfiguredPath(settingsPath, settings.PATH_PYM),
    purchaseArtifactsDir: resolveConfiguredPath(settingsPath, settings.PATH_PRC),
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
    `path_prc = ${tomlString(settings.PATH_PRC)}`,
    `delay_provider = ${tomlString(settings.DELAY_PROVIDER)}`,
    `delay_fallback = ${tomlString(settings.DELAY_FALLBACK)}`,
    "",
  ].join("\n");
}

export async function listCredentialIdFiles(config: DBhopperConfig = {}) {
  return listConfiguredIdFiles(config, "ID_USR");
}

export async function listPaymentProfileIdFiles(config: DBhopperConfig = {}) {
  return listConfiguredIdFiles(config, "ID_PYM");
}

export async function listClaimProfileIdFiles(config: DBhopperConfig = {}) {
  return listConfiguredIdFiles(config, "ID_CLM");
}

export async function listBuyingProfileIdFiles(config: DBhopperConfig = {}) {
  return listConfiguredIdFiles(config, "ID_BUY");
}

export async function resolveSelectedCredentialFile(config: DBhopperConfig = {}) {
  return resolveConfiguredIdFile(config, "ID_USR");
}

export async function resolveSelectedPaymentProfileFile(config: DBhopperConfig = {}) {
  return resolveConfiguredIdFile(config, "ID_PYM");
}

export async function resolveSelectedClaimProfileFile(config: DBhopperConfig = {}) {
  return resolveConfiguredIdFile(config, "ID_CLM");
}

export async function resolveSelectedBuyingProfileFile(config: DBhopperConfig = {}) {
  return resolveConfiguredIdFile(config, "ID_BUY");
}

async function listConfiguredIdFiles(
  config: DBhopperConfig,
  idField: PrivateIdField,
) {
  const loaded = await readPrivateSettings(config);
  const slot = privateSlotForIdField(idField);
  return {
    settings: loaded,
    ...(await listIdFiles(loaded[slot.directoryField], idField, privateSettingsRoot(config))),
  };
}

async function resolveConfiguredIdFile(
  config: DBhopperConfig,
  idField: PrivateIdField,
) {
  const loaded = await readPrivateSettings(config);
  if (!loaded.exists) {
    return undefined;
  }
  const slot = privateSlotForIdField(idField);
  return {
    settings: loaded,
    file: await resolveIdFile(
      loaded[slot.directoryField],
      idField,
      loaded.settings[idField],
      privateSettingsRoot(config),
    ),
  };
}

export async function configuredUserCredentialsDir(config: DBhopperConfig = {}) {
  return (await readPrivateSettings(config)).userCredentialsDir;
}

export async function configuredClaimProfilesDir(config: DBhopperConfig = {}) {
  return (await readPrivateSettings(config)).claimProfilesDir;
}

export async function configuredBuyingProfilesDir(config: DBhopperConfig = {}) {
  return (await readPrivateSettings(config)).buyingProfilesDir;
}

export async function configuredPaymentProfilesDir(config: DBhopperConfig = {}) {
  return (await readPrivateSettings(config)).paymentProfilesDir;
}

export async function configuredPurchaseArtifactsDir(config: DBhopperConfig = {}) {
  const settings = await readPrivateSettings(config);
  let locationError = await privatePathLocationError(
    settings.purchaseArtifactsDir,
    "path_prc",
    privateSettingsRoot(config),
  );
  if (locationError) {
    throw new Error(locationError.message);
  }
  await fs.mkdir(settings.purchaseArtifactsDir, { recursive: true });
  locationError = await privatePathLocationError(
    settings.purchaseArtifactsDir,
    "path_prc",
    privateSettingsRoot(config),
  );
  if (locationError) {
    throw new Error(locationError.message);
  }
  return settings.purchaseArtifactsDir;
}

export async function privateSettingsStatus(config: DBhopperConfig = {}) {
  const settings = await readPrivateSettings(config);
  const root = privateSettingsRoot(config);
  const credentials = await listConfiguredStatusFiles(settings, "ID_USR", root);
  const paymentProfiles = await listConfiguredStatusFiles(settings, "ID_PYM", root);
  const claimProfiles = await listConfiguredStatusFiles(settings, "ID_CLM", root);
  const buyingProfiles = await listConfiguredStatusFiles(settings, "ID_BUY", root);
  const purchaseArtifactsLocationError = await privatePathLocationError(
    settings.purchaseArtifactsDir,
    "path_prc",
    root,
  );
  const messages: ValidationMessage[] = [
    ...credentials.messages,
    ...paymentProfiles.messages,
    ...claimProfiles.messages,
    ...buyingProfiles.messages,
    ...(purchaseArtifactsLocationError ? [purchaseArtifactsLocationError] : []),
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
      PATH_PRC: settings.settings.PATH_PRC,
      DELAY_PROVIDER: settings.settings.DELAY_PROVIDER,
      DELAY_FALLBACK: settings.settings.DELAY_FALLBACK,
      userCredentialsDir: settings.userCredentialsDir,
      claimProfilesDir: settings.claimProfilesDir,
      buyingProfilesDir: settings.buyingProfilesDir,
      paymentProfilesDir: settings.paymentProfilesDir,
      purchaseArtifactsDir: settings.purchaseArtifactsDir,
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
  };

  const root = privateSettingsRoot(config);
  for (const idField of PRIVATE_ID_FIELDS) {
    const slot = privateSlotForIdField(idField);
    await resolveIdFile(loaded[slot.directoryField], idField, updated[idField], root);
  }
  await fs.mkdir(path.dirname(loaded.settingsPath), { recursive: true });
  await fs.writeFile(
    `${loaded.settingsPath}.tmp`,
    stringifyPrivateSettingsToml(updated),
    "utf8",
  );
  await fs.rename(`${loaded.settingsPath}.tmp`, loaded.settingsPath);
  return privateSettingsStatus(config);
}

export async function previewPrivateSettingsRuntimeConfig(
  updates: DBhopperRuntimeConfigUpdates,
  config: DBhopperConfig = {},
): Promise<DBhopperRuntimeConfigPreview> {
  const loaded = await readPrivateSettings(config);
  return runtimeConfigPreview(loaded.settings, normalizeRuntimeConfigUpdates(updates));
}

export async function writePrivateSettingsRuntimeConfig(
  updates: DBhopperRuntimeConfigUpdates,
  config: DBhopperConfig = {},
) {
  const loaded = await readPrivateSettings(config);
  const normalized = normalizeRuntimeConfigUpdates(updates);
  const preview = runtimeConfigPreview(loaded.settings, normalized);
  if (preview.changes.length === 0) {
    return {
      preview,
      status: await privateSettingsStatus(config),
    };
  }

  const updated: DBhopperPrivateSettings = {
    ...loaded.settings,
    USE_DELAY_RETRIEVAL:
      normalized.use_delay_retrieval ?? loaded.settings.USE_DELAY_RETRIEVAL,
    USE_CLAIM_REQUESTS:
      normalized.use_claim_requests ?? loaded.settings.USE_CLAIM_REQUESTS,
    USE_TICKET_PURCHASE:
      normalized.use_ticket_purchase ?? loaded.settings.USE_TICKET_PURCHASE,
    DELAY_PROVIDER: normalized.delay_provider ?? loaded.settings.DELAY_PROVIDER,
    DELAY_FALLBACK: normalized.delay_fallback ?? loaded.settings.DELAY_FALLBACK,
    PURCHASE_MODE: normalized.purchase_mode ?? loaded.settings.PURCHASE_MODE,
  };

  await fs.mkdir(path.dirname(loaded.settingsPath), { recursive: true });
  await fs.writeFile(
    `${loaded.settingsPath}.tmp`,
    stringifyPrivateSettingsToml(updated),
    "utf8",
  );
  await fs.rename(`${loaded.settingsPath}.tmp`, loaded.settingsPath);
  return {
    preview,
    status: await privateSettingsStatus(config),
  };
}

export function normalizePrivateId(
  value: string,
  field: PrivateIdField,
) {
  const trimmed = value.trim();
  assertNumericId(trimmed, field);
  return trimmed;
}

function resolveConfiguredPath(settingsPath: string, value: string) {
  return path.isAbsolute(value)
    ? path.resolve(value)
    : path.resolve(settingsRootFromPath(settingsPath), value);
}

function settingsRootFromPath(settingsPath: string) {
  const resolved = path.resolve(settingsPath);
  const privateDir = path.dirname(resolved);
  const assetsDir = path.dirname(privateDir);
  if (
    path.basename(resolved) === "settings.toml" &&
    path.basename(privateDir) === "private" &&
    path.basename(assetsDir) === "assets"
  ) {
    return path.dirname(assetsDir);
  }
  return privateDir;
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
  table.PATH_PRC ??= defaultPrivateSettings().PATH_PRC;
  assertPrivateSettingsShape(table, source);
  return table as unknown as DBhopperPrivateSettings;
}

function assertPrivateSettingsShape(
  value: unknown,
  source: string,
): asserts value is DBhopperPrivateSettings {
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
  assertString(value.PATH_PRC, `${source}.path_prc`);
  assertString(value.PURCHASE_MODE, `${source}.purchase_mode`);
  assertString(value.DELAY_PROVIDER, `${source}.DELAY_PROVIDER`);
  assertString(value.DELAY_FALLBACK, `${source}.DELAY_FALLBACK`);
  normalizePrivateId(value.ID_USR as string, "ID_USR");
  normalizePrivateId(value.ID_CLM as string, "ID_CLM");
  normalizePrivateId(value.ID_BUY as string, "ID_BUY");
  normalizePrivateId(value.ID_PYM as string, "ID_PYM");
  assertOneOf(
    value.PURCHASE_MODE,
    PURCHASE_MODE_VALUES,
    `${source}.purchase_mode`,
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

function normalizePurchaseMode(
  value: string,
  source: string,
): DBhopperPurchaseMode {
  assertOneOf(value, PURCHASE_MODE_VALUES, source);
  return value as DBhopperPurchaseMode;
}

function normalizeRuntimeConfigUpdates(
  updates: DBhopperRuntimeConfigUpdates,
): DBhopperRuntimeConfigUpdates {
  const normalized: DBhopperRuntimeConfigUpdates = {};
  if ("use_delay_retrieval" in updates) {
    assertBoolean(
      updates.use_delay_retrieval,
      "use_delay_retrieval",
    );
    normalized.use_delay_retrieval = updates.use_delay_retrieval;
  }
  if ("use_claim_requests" in updates) {
    assertBoolean(updates.use_claim_requests, "use_claim_requests");
    normalized.use_claim_requests = updates.use_claim_requests;
  }
  if ("use_ticket_purchase" in updates) {
    assertBoolean(updates.use_ticket_purchase, "use_ticket_purchase");
    normalized.use_ticket_purchase = updates.use_ticket_purchase;
  }
  if ("delay_provider" in updates) {
    assertOneOf(updates.delay_provider, DELAY_PROVIDER_VALUES, "delay_provider");
    normalized.delay_provider = updates.delay_provider;
  }
  if ("delay_fallback" in updates) {
    assertOneOf(updates.delay_fallback, DELAY_FALLBACK_VALUES, "delay_fallback");
    normalized.delay_fallback = updates.delay_fallback;
  }
  if ("purchase_mode" in updates) {
    normalized.purchase_mode = normalizePurchaseMode(
      updates.purchase_mode as string,
      "purchase_mode",
    );
  }
  return normalized;
}

function runtimeConfigPreview(
  currentSettings: DBhopperPrivateSettings,
  requested: DBhopperRuntimeConfigUpdates,
): DBhopperRuntimeConfigPreview {
  const current = runtimeConfigSettings(currentSettings);
  const changes = Object.entries(requested).flatMap(([field, to]) => {
    const key = field as keyof DBhopperRuntimeConfigUpdates;
    if (to === undefined || current[key] === to) {
      return [];
    }
    return [{
      field: key,
      from: current[key],
      to,
      meaning: runtimeConfigMeaning(key, to),
    }];
  });
  const needsUserAction = changes.length > 0;
  return {
    current,
    requested,
    changes,
    needsUserAction,
    message: needsUserAction
      ? "Review these DBhopper settings changes, then call again with confirm: true to write settings.toml."
      : "No DBhopper settings changes were requested.",
  };
}

function runtimeConfigSettings(
  settings: DBhopperPrivateSettings,
): Required<DBhopperRuntimeConfigUpdates> {
  return {
    use_delay_retrieval: settings.USE_DELAY_RETRIEVAL,
    use_claim_requests: settings.USE_CLAIM_REQUESTS,
    use_ticket_purchase: settings.USE_TICKET_PURCHASE,
    delay_provider: settings.DELAY_PROVIDER,
    delay_fallback: settings.DELAY_FALLBACK,
    purchase_mode: settings.PURCHASE_MODE,
  };
}

function runtimeConfigMeaning(
  field: keyof DBhopperRuntimeConfigUpdates,
  value: boolean | string,
) {
  switch (field) {
    case "use_delay_retrieval":
      return value
        ? "Enable DB delay-query tools."
        : "Disable DB delay-query tools.";
    case "use_claim_requests":
      return value
        ? "Enable claim preparation and browser filing tools."
        : "Disable claim preparation and browser filing tools.";
    case "use_ticket_purchase":
      return value
        ? "Enable ticket search and checkout dry-run tools."
        : "Disable ticket search and checkout dry-run tools.";
    case "delay_provider":
      return delayProviderMeaning(value);
    case "delay_fallback":
      return delayFallbackMeaning(value);
    case "purchase_mode":
      return purchaseModeMeaning(value);
  }
}

function delayProviderMeaning(value: boolean | string) {
  switch (value) {
    case "bahn-web":
      return "Use DB passenger website retrieval; no DB API credentials are needed.";
    case "db-timetables":
      return "Use official DB Timetables API calls with DB API Marketplace credentials.";
    case "auto":
      return "Use automatic delay provider selection according to the configured fallback policy.";
    default:
      return "Unknown delay provider.";
  }
}

function delayFallbackMeaning(value: boolean | string) {
  switch (value) {
    case "none":
      return "Do not automatically retry with another delay backend.";
    case "bahn-web":
      return "Retry delay retrieval with DB passenger website retrieval if the primary provider fails.";
    case "db-timetables":
      return "Retry delay retrieval with official DB Timetables API calls if the primary provider fails.";
    default:
      return "Unknown delay fallback.";
  }
}

function purchaseModeMeaning(value: boolean | string) {
  switch (value) {
    case "review":
      return "Fill checkout to DB's final Check page, save a review screenshot, and stop.";
    case "auto":
      return "Request automatic purchase mode; current code still stops with auto_unavailable before final buying.";
    default:
      return "Unknown purchase mode.";
  }
}

async function listIdFiles(
  dir: string,
  idField: PrivateIdField,
  root: string,
) {
  const messages: ValidationMessage[] = [];
  const items: PrivateIdFile[] = [];
  const pathField = pathSettingNameForIdField(idField);
  const locationError = await privateDirectoryLocationError(dir, idField, root);
  if (locationError) {
    messages.push(locationError);
    return { items, messages, directoryOk: false };
  }
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
    const claimPath = idField === "ID_CLM"
      ? privateClaimCandidatePath(dir, entry)
      : undefined;
    if (claimPath) {
      if (await fileExists(claimPath)) {
        try {
          const parsed = parseIdDocument(await fs.readFile(claimPath, "utf8"), claimPath);
          if (!parsed.ID_CLM) {
            continue;
          }
          const id = normalizePrivateId(String(parsed.ID_CLM), idField);
          items.push({
            id,
            fileName: entry.isDirectory()
              ? path.join(entry.name, "claim.toml")
              : entry.name,
            filePath: claimPath,
          });
        } catch (error) {
          messages.push(validationErrorFromException("invalid_private_id_file", error));
        }
      }
      continue;
    }
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

function privateClaimCandidatePath(dir: string, entry: Dirent) {
  if (entry.isDirectory()) {
    return path.join(dir, entry.name, "claim.toml");
  }
  if (entry.isFile() && entry.name.endsWith(".toml")) {
    return path.join(dir, entry.name);
  }
  return undefined;
}

async function fileExists(filePath: string) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function listConfiguredStatusFiles(
  settings: LoadedPrivateSettings,
  idField: PrivateIdField,
  root: string,
) {
  const slot = privateSlotForIdField(idField);
  return listIdFiles(settings[slot.directoryField], idField, root);
}

async function resolveIdFile(
  dir: string,
  idField: PrivateIdField,
  id: string,
  root: string,
) {
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

function isOtherPrivateIdFile(
  parsed: Record<string, unknown>,
  idField: PrivateIdField,
) {
  return PRIVATE_ID_FIELDS.some((field) => field !== idField && field in parsed);
}

export async function privateDirectoryLocationError(
  dir: string,
  idField: PrivateIdField,
  root: string,
) {
  return privatePathLocationError(
    dir,
    pathSettingNameForIdField(idField),
    root,
  );
}

async function privatePathLocationError(
  dir: string,
  pathField: string,
  root: string,
) {
  const resolvedRoot = path.resolve(root);
  const resolvedDir = path.resolve(dir);
  if (isPathInsideOrEqual(resolvedDir, resolvedRoot)) {
    return validationError(
      "private_directory_inside_workspace",
      `${pathField} ${resolvedDir} must point to a directory outside the plugin workspace ${resolvedRoot}`,
    );
  }

  const [realRoot, realDir] = await Promise.all([
    fs.realpath(resolvedRoot).catch(() => resolvedRoot),
    fs.realpath(resolvedDir).catch(() => undefined),
  ]);
  if (realDir && isPathInsideOrEqual(realDir, realRoot)) {
    return validationError(
      "private_directory_inside_workspace",
      `${pathField} ${resolvedDir} resolves inside the plugin workspace ${realRoot}`,
    );
  }
  const realAncestorCandidate = await realpathExistingAncestorCandidate(
    resolvedDir,
  );
  if (
    realAncestorCandidate &&
    isPathInsideOrEqual(realAncestorCandidate, realRoot)
  ) {
    return validationError(
      "private_directory_inside_workspace",
      `${pathField} ${resolvedDir} resolves inside the plugin workspace ${realRoot}`,
    );
  }
  return undefined;
}

async function realpathExistingAncestorCandidate(candidate: string) {
  let current = path.resolve(candidate);
  while (true) {
    const realCurrent = await fs.realpath(current).catch(() => undefined);
    if (realCurrent) {
      return path.resolve(realCurrent, path.relative(current, candidate));
    }
    const parent = path.dirname(current);
    if (parent === current) {
      return undefined;
    }
    current = parent;
  }
}

function isPathInsideOrEqual(candidate: string, parent: string) {
  const relative = path.relative(parent, candidate);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function privateSlotForIdField(idField: PrivateIdField) {
  return PRIVATE_SLOT_BY_ID_FIELD[idField];
}

function assertOneOf(value: unknown, allowed: Set<string>, source: string) {
  if (typeof value !== "string" || !allowed.has(value)) {
    throw new Error(`${source} must be one of: ${[...allowed].join(", ")}`);
  }
}

function pathSettingNameForIdField(idField: PrivateIdField) {
  return privateSlotForIdField(idField).pathSettingName;
}

function tomlString(value: string) {
  return JSON.stringify(value);
}

function tomlBoolean(value: boolean) {
  return value ? "true" : "false";
}

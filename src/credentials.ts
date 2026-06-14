import fs from "node:fs/promises";
import path from "node:path";

import type { DBhopperConfig, ValidationMessage } from "./types.js";
import {
  configuredCredentialsDir,
  readPrivateSettings,
  resolveSelectedCredentialFile,
} from "./private-settings.js";
import { parsePaymentProfileToml } from "./payment-profile.js";
import {
  normalizeTomlKeys,
  parseToml,
  tryParseToml,
  type TomlKeyMapByPath,
} from "./toml.js";
import {
  validationError,
  validationErrorFromException,
} from "./validation-messages.js";
import { resolveWorkspace } from "./workspace.js";

export interface DBhopperCredentials {
  ID_USR: string;
  version?: 1;
  bahnAPI?: {
    clientId?: string;
    apiKey?: string;
  };
  bahnAccount?: {
    username?: string;
    password?: string;
  };
  bahnAccountAPI?: {
    username?: string;
    password?: string;
  };
  browser?: {
    userDataDir?: string;
  };
}

export interface LoadedCredentialsProfile {
  credentialsName: string;
  credentialsPath: string;
  credentialsId?: string;
  credentials: DBhopperCredentials;
}

const CREDENTIALS_DIR = path.join("assets", "private", "credentials");
const CREDENTIALS_TOML_ALIASES: TomlKeyMapByPath = {
  "": {
    id_usr: "ID_USR",
    bahn_api: "bahnAPI",
    bahn_account: "bahnAccount",
    bahn_account_api: "bahnAccountAPI",
  },
  bahnAPI: {
    client_id: "clientId",
    api_key: "apiKey",
  },
  browser: {
    user_data_dir: "userDataDir",
  },
};
const PAYMENT_PROFILE_ID_ALIASES: TomlKeyMapByPath = {
  "": {
    id_pym: "ID_PYM",
  },
};

export function credentialsDir(config: DBhopperConfig = {}) {
  return path.join(resolveWorkspace(config).root, CREDENTIALS_DIR);
}

export async function readSelectedCredentialsProfile(config: DBhopperConfig = {}) {
  const resolved = await resolveSelectedCredentialFile(config);
  if (!resolved) {
    return undefined;
  }
  const raw = await fs.readFile(resolved.file.filePath, "utf8");
  const credentials = parseCredentialsToml(raw, resolved.file.filePath);
  return {
    credentialsName: resolved.file.fileName,
    credentialsPath: resolved.file.filePath,
    credentialsId: resolved.file.id,
    credentials,
  };
}

export async function validateCredentialsFiles(config: DBhopperConfig = {}) {
  const settings = await readPrivateSettings(config);
  if (!settings.exists) {
    await fs.mkdir(credentialsDir(config), { recursive: true });
  }
  const dir = settings.credentialsDir;
  const messages: ValidationMessage[] = [];
  const stat = await fs.stat(dir).catch((error: NodeJS.ErrnoException) => {
    messages.push(validationError(
      "invalid_credentials_directory",
      `PATH_CRED ${dir} is not readable: ${error.code ?? error.message}`,
    ));
    return undefined;
  });

  if (!stat) {
    return {
      ok: false,
      messages,
    };
  }
  if (!stat.isDirectory()) {
    messages.push(validationError(
      "invalid_credentials_directory",
      `PATH_CRED ${dir} must point to a directory`,
    ));
    return {
      ok: false,
      messages,
    };
  }

  const entries = await fs.readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".toml")) {
      continue;
    }
    const filePath = path.join(dir, entry.name);
    try {
      const raw = await fs.readFile(filePath, "utf8");
      if (isPaymentProfileToml(raw)) {
        parsePaymentProfileToml(raw, filePath);
      } else {
        parseCredentialsToml(raw, filePath);
      }
    } catch (error) {
      messages.push(validationErrorFromException("invalid_credentials_toml", error));
    }
  }

  return {
    ok: messages.every((message) => message.severity !== "error"),
    messages,
  };
}

function isPaymentProfileToml(text: string) {
  const parsedValue = tryParseToml(text);
  const parsed = normalizeTomlKeys(
    parsedValue,
    "credentials.toml",
    PAYMENT_PROFILE_ID_ALIASES,
  );
  return Boolean(
    parsed &&
      typeof parsed === "object" &&
      !Array.isArray(parsed) &&
      "ID_PYM" in parsed,
  );
}

export function applyCredentialsToConfig(
  config: DBhopperConfig,
  loaded?: LoadedCredentialsProfile,
): DBhopperConfig {
  const { dbClientId: _dbClientId, dbApiKey: _dbApiKey, ...baseConfig } = config;
  if (!loaded?.credentials.bahnAPI) {
    return baseConfig;
  }
  return {
    ...baseConfig,
    dbClientId: loaded.credentials.bahnAPI.clientId,
    dbApiKey: loaded.credentials.bahnAPI.apiKey,
  };
}

export function credentialsSummary(loaded?: LoadedCredentialsProfile) {
  if (!loaded) {
    return {
      configured: false,
      credentialsName: undefined,
      hasBahnAPICredentials: false,
      hasBahnAccountCredentials: false,
      hasBahnAccountAPICredentials: false,
      hasBrowserUserDataDir: false,
    };
  }
  return {
    configured: true,
    credentialsName: loaded.credentialsName,
    credentialsId: loaded.credentialsId,
    hasBahnAPICredentials: Boolean(
      loaded.credentials.bahnAPI?.clientId && loaded.credentials.bahnAPI?.apiKey,
    ),
    hasBahnAccountCredentials: Boolean(
      loaded.credentials.bahnAccount?.username &&
        loaded.credentials.bahnAccount?.password,
    ),
    hasBahnAccountAPICredentials: Boolean(
      loaded.credentials.bahnAccountAPI?.username &&
        loaded.credentials.bahnAccountAPI?.password,
    ),
    hasBrowserUserDataDir: Boolean(loaded.credentials.browser?.userDataDir),
  };
}

export function parseCredentialsToml(text: string, source = "credentials.toml") {
  const parsed = normalizeTomlKeys(
    parseToml(text, source),
    source,
    CREDENTIALS_TOML_ALIASES,
  );
  assertCredentialsShape(parsed, source);
  return normalizeCredentials(parsed as DBhopperCredentials);
}

function normalizeCredentials(credentials: DBhopperCredentials): DBhopperCredentials {
  return {
    ...credentials,
    ...(credentials.ID_USR ? { ID_USR: credentials.ID_USR.trim() } : {}),
    ...(credentials.bahnAPI
      ? {
          bahnAPI: {
            clientId: credentials.bahnAPI.clientId?.trim(),
            apiKey: credentials.bahnAPI.apiKey?.trim(),
          },
        }
      : {}),
    ...(credentials.bahnAccount
      ? {
          bahnAccount: {
            username: credentials.bahnAccount.username?.trim(),
            password: credentials.bahnAccount.password,
          },
        }
      : {}),
    ...(credentials.bahnAccountAPI
      ? {
          bahnAccountAPI: {
            username: credentials.bahnAccountAPI.username?.trim(),
            password: credentials.bahnAccountAPI.password,
          },
        }
      : {}),
    ...(credentials.browser
      ? {
          browser: {
            userDataDir: credentials.browser.userDataDir?.trim(),
          },
        }
      : {}),
  };
}

function assertCredentialsShape(value: unknown, source: string) {
  assertTable(value, source);
  const allowed = new Set([
    "ID_USR",
    "version",
    "bahnAPI",
    "bahnAccount",
    "bahnAccountAPI",
    "browser",
  ]);
  assertKnownKeys(value, allowed, source);

  if (!("ID_USR" in value)) {
    throw new Error(`${source}.ID_USR is required`);
  }
  const id = value.ID_USR;
  assertString(id, `${source}.ID_USR`);
  if (!/^\d{2,}$/.test(id)) {
    throw new Error(`${source}.ID_USR must be a quoted numeric ID like "01"`);
  }
  if ("version" in value && value.version !== 1) {
    throw new Error(`${source}.version must be 1`);
  }
  if ("bahnAPI" in value) {
    assertSection(value.bahnAPI, `${source}.bahnAPI`, [
      "clientId",
      "apiKey",
    ]);
    if ("clientId" in value.bahnAPI || "apiKey" in value.bahnAPI) {
      assertString(value.bahnAPI.clientId, `${source}.bahnAPI.clientId`);
      assertString(value.bahnAPI.apiKey, `${source}.bahnAPI.apiKey`);
    }
  }
  if ("bahnAccount" in value) {
    assertSection(value.bahnAccount, `${source}.bahnAccount`, [
      "username",
      "password",
    ]);
    assertString(value.bahnAccount.username, `${source}.bahnAccount.username`);
    assertString(value.bahnAccount.password, `${source}.bahnAccount.password`);
  }
  if ("bahnAccountAPI" in value) {
    assertSection(value.bahnAccountAPI, `${source}.bahnAccountAPI`, [
      "username",
      "password",
    ]);
    assertString(
      value.bahnAccountAPI.username,
      `${source}.bahnAccountAPI.username`,
    );
    assertString(
      value.bahnAccountAPI.password,
      `${source}.bahnAccountAPI.password`,
    );
  }
  if ("browser" in value) {
    assertSection(value.browser, `${source}.browser`, ["userDataDir"]);
    if ("userDataDir" in value.browser) {
      assertString(value.browser.userDataDir, `${source}.browser.userDataDir`);
    }
  }
}

function assertSection(
  value: unknown,
  source: string,
  allowedKeys: string[],
): asserts value is Record<string, unknown> {
  assertTable(value, source);
  assertKnownKeys(value, new Set(allowedKeys), source);
}

function assertTable(value: unknown, source: string): asserts value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${source} must be a TOML table`);
  }
}

function assertKnownKeys(
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

function assertString(value: unknown, source: string): asserts value is string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${source} must be a non-empty string`);
  }
}

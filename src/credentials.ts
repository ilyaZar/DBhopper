import fs from "node:fs/promises";
import path from "node:path";

import { parse } from "smol-toml";

import type { DBhopperConfig, ValidationMessage } from "./types.js";
import {
  configuredCredentialsDir,
  readPrivateSettings,
  resolveSelectedCredentialFile,
} from "./private-settings.js";
import { resolveWorkspace } from "./workspace.js";

export interface DBhopperCredentials {
  ID_CRED?: string;
  version?: 1;
  dbApi?: {
    clientId?: string;
    apiKey?: string;
    accountUsername?: string;
    accountPassword?: string;
  };
  bahnAccount?: {
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

export function credentialsDir(config: DBhopperConfig = {}) {
  return path.join(resolveWorkspace(config).root, CREDENTIALS_DIR);
}

export function normalizeCredentialsName(value: string) {
  const raw = value.trim();
  const withExtension = raw.endsWith(".toml") ? raw : `${raw}.toml`;
  const baseName = path.basename(withExtension);
  if (baseName !== withExtension || !/^[a-zA-Z0-9._-]+\.toml$/.test(baseName)) {
    throw new Error("credentialsProfile must be a safe TOML file name");
  }
  return baseName;
}

export async function readCredentialsProfile(
  credentialsProfile: string,
  config: DBhopperConfig = {},
): Promise<LoadedCredentialsProfile> {
  const credentialsName = normalizeCredentialsName(credentialsProfile);
  const credentialsPath = path.join(await configuredCredentialsDir(config), credentialsName);
  const raw = await fs.readFile(credentialsPath, "utf8");
  const credentials = parseCredentialsToml(raw, credentialsPath);
  return { credentialsName, credentialsPath, credentialsId: credentials.ID_CRED, credentials };
}

export async function readSelectedCredentialsProfile(
  config: DBhopperConfig = {},
  credentialsProfile?: string,
) {
  const selected = credentialsProfile ?? config.activeCredentialsName;
  if (selected) {
    return readCredentialsProfile(selected, config);
  }
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
  const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
  const messages: ValidationMessage[] = [];

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".toml")) {
      continue;
    }
    const filePath = path.join(dir, entry.name);
    try {
      parseCredentialsToml(await fs.readFile(filePath, "utf8"), filePath);
    } catch (error) {
      messages.push({
        code: "invalid_credentials_toml",
        message: error instanceof Error ? error.message : String(error),
        severity: "error",
      });
    }
  }

  return {
    ok: messages.every((message) => message.severity !== "error"),
    messages,
  };
}

export function applyCredentialsToConfig(
  config: DBhopperConfig,
  loaded?: LoadedCredentialsProfile,
): DBhopperConfig {
  if (!loaded?.credentials.dbApi) {
    return config;
  }
  return {
    ...config,
    dbClientId: loaded.credentials.dbApi.clientId ?? config.dbClientId,
    dbApiKey: loaded.credentials.dbApi.apiKey ?? config.dbApiKey,
  };
}

export function credentialsSummary(loaded?: LoadedCredentialsProfile) {
  if (!loaded) {
    return {
      configured: false,
      credentialsName: undefined,
      hasDbApiCredentials: false,
      hasDbApiAccountCredentials: false,
      hasBahnAccountCredentials: false,
      hasBrowserUserDataDir: false,
    };
  }
  return {
    configured: true,
    credentialsName: loaded.credentialsName,
    credentialsId: loaded.credentialsId,
    hasDbApiCredentials: Boolean(
      loaded.credentials.dbApi?.clientId && loaded.credentials.dbApi?.apiKey,
    ),
    hasDbApiAccountCredentials: Boolean(
      loaded.credentials.dbApi?.accountUsername &&
        loaded.credentials.dbApi?.accountPassword,
    ),
    hasBahnAccountCredentials: Boolean(
      loaded.credentials.bahnAccount?.username &&
        loaded.credentials.bahnAccount?.password,
    ),
    hasBrowserUserDataDir: Boolean(loaded.credentials.browser?.userDataDir),
  };
}

export function parseCredentialsToml(text: string, source = "credentials.toml") {
  let parsed: unknown;
  try {
    parsed = parse(text);
  } catch (error) {
    throw new Error(`${source}: invalid TOML: ${errorMessage(error)}`);
  }
  assertCredentialsShape(parsed, source);
  return normalizeCredentials(parsed as DBhopperCredentials);
}

function normalizeCredentials(credentials: DBhopperCredentials): DBhopperCredentials {
  return {
    ...credentials,
    ...(credentials.ID_CRED ? { ID_CRED: credentials.ID_CRED.trim() } : {}),
    ...(credentials.dbApi
      ? {
          dbApi: {
            clientId: credentials.dbApi.clientId?.trim(),
            apiKey: credentials.dbApi.apiKey?.trim(),
            accountUsername: credentials.dbApi.accountUsername?.trim(),
            accountPassword: credentials.dbApi.accountPassword,
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
  const allowed = new Set(["ID_CRED", "version", "dbApi", "bahnAccount", "browser"]);
  assertKnownKeys(value, allowed, source);

  if ("ID_CRED" in value) {
    const id = value.ID_CRED;
    assertString(id, `${source}.ID_CRED`);
    if (!/^\d{2,}$/.test(id)) {
      throw new Error(`${source}.ID_CRED must be a quoted numeric ID like "01"`);
    }
  }
  if ("version" in value && value.version !== 1) {
    throw new Error(`${source}.version must be 1`);
  }
  if ("dbApi" in value) {
    assertSection(value.dbApi, `${source}.dbApi`, [
      "clientId",
      "apiKey",
      "accountUsername",
      "accountPassword",
    ]);
    if ("clientId" in value.dbApi || "apiKey" in value.dbApi) {
      assertString(value.dbApi.clientId, `${source}.dbApi.clientId`);
      assertString(value.dbApi.apiKey, `${source}.dbApi.apiKey`);
    }
    if ("accountUsername" in value.dbApi || "accountPassword" in value.dbApi) {
      assertString(value.dbApi.accountUsername, `${source}.dbApi.accountUsername`);
      assertString(value.dbApi.accountPassword, `${source}.dbApi.accountPassword`);
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

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

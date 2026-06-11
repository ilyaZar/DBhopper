import fs from "node:fs/promises";
import path from "node:path";
import { parse } from "smol-toml";
import { configuredCredentialsDir, readPrivateSettings, resolveSelectedCredentialFile, } from "./private-settings.js";
import { resolveWorkspace } from "./workspace.js";
const CREDENTIALS_DIR = path.join("assets", "private", "credentials");
export function credentialsDir(config = {}) {
    return path.join(resolveWorkspace(config).root, CREDENTIALS_DIR);
}
export function normalizeCredentialsName(value) {
    const raw = value.trim();
    const withExtension = raw.endsWith(".toml") ? raw : `${raw}.toml`;
    const baseName = path.basename(withExtension);
    if (baseName !== withExtension || !/^[a-zA-Z0-9._-]+\.toml$/.test(baseName)) {
        throw new Error("credentialsProfile must be a safe TOML file name");
    }
    return baseName;
}
export async function readCredentialsProfile(credentialsProfile, config = {}) {
    const credentialsName = normalizeCredentialsName(credentialsProfile);
    const credentialsPath = path.join(await configuredCredentialsDir(config), credentialsName);
    const raw = await fs.readFile(credentialsPath, "utf8");
    const credentials = parseCredentialsToml(raw, credentialsPath);
    return { credentialsName, credentialsPath, credentialsId: credentials.ID_CRED, credentials };
}
export async function readSelectedCredentialsProfile(config = {}, credentialsProfile) {
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
export async function validateCredentialsFiles(config = {}) {
    const settings = await readPrivateSettings(config);
    if (!settings.exists) {
        await fs.mkdir(credentialsDir(config), { recursive: true });
    }
    const dir = settings.credentialsDir;
    const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
    const messages = [];
    for (const entry of entries) {
        if (!entry.isFile() || !entry.name.endsWith(".toml")) {
            continue;
        }
        const filePath = path.join(dir, entry.name);
        try {
            parseCredentialsToml(await fs.readFile(filePath, "utf8"), filePath);
        }
        catch (error) {
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
export function applyCredentialsToConfig(config, loaded) {
    if (!loaded?.credentials.dbApi) {
        return config;
    }
    return {
        ...config,
        dbClientId: loaded.credentials.dbApi.clientId ?? config.dbClientId,
        dbApiKey: loaded.credentials.dbApi.apiKey ?? config.dbApiKey,
    };
}
export function credentialsSummary(loaded) {
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
        hasDbApiCredentials: Boolean(loaded.credentials.dbApi?.clientId && loaded.credentials.dbApi?.apiKey),
        hasDbApiAccountCredentials: Boolean(loaded.credentials.dbApi?.accountUsername &&
            loaded.credentials.dbApi?.accountPassword),
        hasBahnAccountCredentials: Boolean(loaded.credentials.bahnAccount?.username &&
            loaded.credentials.bahnAccount?.password),
        hasBrowserUserDataDir: Boolean(loaded.credentials.browser?.userDataDir),
    };
}
export function parseCredentialsToml(text, source = "credentials.toml") {
    let parsed;
    try {
        parsed = parse(text);
    }
    catch (error) {
        throw new Error(`${source}: invalid TOML: ${errorMessage(error)}`);
    }
    assertCredentialsShape(parsed, source);
    return normalizeCredentials(parsed);
}
function normalizeCredentials(credentials) {
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
function assertCredentialsShape(value, source) {
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
function assertSection(value, source, allowedKeys) {
    assertTable(value, source);
    assertKnownKeys(value, new Set(allowedKeys), source);
}
function assertTable(value, source) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        throw new Error(`${source} must be a TOML table`);
    }
}
function assertKnownKeys(value, allowed, source) {
    for (const key of Object.keys(value)) {
        if (!allowed.has(key)) {
            throw new Error(`${source}.${key} is not a supported field`);
        }
    }
}
function assertString(value, source) {
    if (typeof value !== "string" || value.length === 0) {
        throw new Error(`${source} must be a non-empty string`);
    }
}
function errorMessage(error) {
    return error instanceof Error ? error.message : String(error);
}

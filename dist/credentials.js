import fs from "node:fs/promises";
import path from "node:path";
import { parse } from "smol-toml";
import { readPrivateSettings, resolveSelectedCredentialFile, } from "./private-settings.js";
import { resolveWorkspace } from "./workspace.js";
const CREDENTIALS_DIR = path.join("assets", "private", "credentials");
export function credentialsDir(config = {}) {
    return path.join(resolveWorkspace(config).root, CREDENTIALS_DIR);
}
export async function readSelectedCredentialsProfile(config = {}) {
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
    const messages = [];
    const stat = await fs.stat(dir).catch((error) => {
        messages.push({
            code: "invalid_credentials_directory",
            message: `PATH_CRED ${dir} is not readable: ${error.code ?? error.message}`,
            severity: "error",
        });
        return undefined;
    });
    if (!stat) {
        return {
            ok: false,
            messages,
        };
    }
    if (!stat.isDirectory()) {
        messages.push({
            code: "invalid_credentials_directory",
            message: `PATH_CRED ${dir} must point to a directory`,
            severity: "error",
        });
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
export function credentialsSummary(loaded) {
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
        hasBahnAPICredentials: Boolean(loaded.credentials.bahnAPI?.clientId && loaded.credentials.bahnAPI?.apiKey),
        hasBahnAccountCredentials: Boolean(loaded.credentials.bahnAccount?.username &&
            loaded.credentials.bahnAccount?.password),
        hasBahnAccountAPICredentials: Boolean(loaded.credentials.bahnAccountAPI?.username &&
            loaded.credentials.bahnAccountAPI?.password),
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
function assertCredentialsShape(value, source) {
    assertTable(value, source);
    const allowed = new Set([
        "ID_CRED",
        "version",
        "bahnAPI",
        "bahnAccount",
        "bahnAccountAPI",
        "browser",
    ]);
    assertKnownKeys(value, allowed, source);
    if (!("ID_CRED" in value)) {
        throw new Error(`${source}.ID_CRED is required`);
    }
    const id = value.ID_CRED;
    assertString(id, `${source}.ID_CRED`);
    if (!/^\d{2,}$/.test(id)) {
        throw new Error(`${source}.ID_CRED must be a quoted numeric ID like "01"`);
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
        assertString(value.bahnAccountAPI.username, `${source}.bahnAccountAPI.username`);
        assertString(value.bahnAccountAPI.password, `${source}.bahnAccountAPI.password`);
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

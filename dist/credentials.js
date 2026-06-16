import fs from "node:fs/promises";
import path from "node:path";
import { privateDirectoryLocationError, readPrivateSettings, resolveSelectedCredentialFile, } from "./private-settings.js";
import { readSelectedPrivateToml } from "./private-profile-loader.js";
import { assertKnownKeys, assertNumericIdString, assertSection, assertString, assertTable, } from "./schema-helpers.js";
import { normalizeTomlKeys, parseToml, } from "./toml.js";
import { validationError, validationErrorFromException, } from "./validation-messages.js";
import { resolveWorkspace } from "./workspace.js";
const CREDENTIALS_TOML_ALIASES = {
    "": {
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
export async function readSelectedCredentialsProfile(config = {}) {
    const selected = await readSelectedPrivateToml(config, resolveSelectedCredentialFile, parseCredentialsToml);
    if (!selected) {
        return undefined;
    }
    return {
        credentialsName: selected.file.fileName,
        credentialsPath: selected.file.filePath,
        credentialsId: selected.file.id,
        credentials: selected.parsed,
    };
}
export async function validateCredentialsFiles(config = {}) {
    const settings = await readPrivateSettings(config);
    const dir = settings.userCredentialsDir;
    const messages = [];
    const locationError = await privateDirectoryLocationError(dir, "ID_USR", resolveWorkspace(config).root);
    if (locationError) {
        return {
            ok: false,
            messages: [locationError],
        };
    }
    const stat = await fs.stat(dir).catch((error) => {
        messages.push(validationError("invalid_credentials_directory", `path_usr ${dir} is not readable: ${error.code ?? error.message}`));
        return undefined;
    });
    if (!stat) {
        return {
            ok: false,
            messages,
        };
    }
    if (!stat.isDirectory()) {
        messages.push(validationError("invalid_credentials_directory", `path_usr ${dir} must point to a directory`));
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
            if (!isCredentialToml(raw)) {
                continue;
            }
            parseCredentialsToml(raw, filePath);
        }
        catch (error) {
            messages.push(validationErrorFromException("invalid_credentials_toml", error));
        }
    }
    return {
        ok: messages.every((message) => message.severity !== "error"),
        messages,
    };
}
function isCredentialToml(text) {
    const parsed = parseToml(text, "credentials.toml");
    return Boolean(parsed &&
        typeof parsed === "object" &&
        !Array.isArray(parsed) &&
        "ID_USR" in parsed);
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
    const parsed = normalizeTomlKeys(parseToml(text, source), source, CREDENTIALS_TOML_ALIASES, true);
    assertCredentialsShape(parsed, source);
    return normalizeCredentials(parsed);
}
function normalizeCredentials(credentials) {
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
function assertCredentialsShape(value, source) {
    assertTable(value, source);
    const allowed = new Set([
        "ID_USR",
        "bahnAPI",
        "bahnAccount",
        "bahnAccountAPI",
        "browser",
    ]);
    assertKnownKeys(value, allowed, source);
    if (!("ID_USR" in value)) {
        throw new Error(`${source}.ID_USR is required`);
    }
    assertNumericIdString(value.ID_USR, `${source}.ID_USR`);
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

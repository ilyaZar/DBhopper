import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
export const DEFAULT_FEATURE_SETTINGS = {
    use_delay_retrieval: true,
    use_claim_requests: false,
    use_ticket_buying: false,
};
export const CLAIM_TOOL_NAMES = [
    "dbhopper_claim_schema",
    "dbhopper_list_claims",
    "dbhopper_prepare_claim",
    "dbhopper_validate_claim",
    "dbhopper_browser_probe",
    "dbhopper_run_claim",
];
export const DELAY_RETRIEVAL_TOOL_NAMES = [
    "dbhopper_db_marketplace_access_check",
    "dbhopper_db_api_credential_probe",
    "dbhopper_db_delay_research",
    "dbhopper_query_db_delay",
];
export const TICKET_BUYING_TOOL_NAMES = [
    "dbhopper_db_standard_login_check",
    "dbhopper_ticket_buying_research",
    "dbhopper_ticket_buying_dry_run",
    "dbhopper_ticket_checkout_dry_run",
];
const PACKAGE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SETTINGS_FILE = "settings.yaml";
const SETTINGS_KEYS = new Set(Object.keys(DEFAULT_FEATURE_SETTINGS));
export function readTopLevelSettings(packageRoot = PACKAGE_ROOT) {
    const settingsPath = path.join(packageRoot, SETTINGS_FILE);
    if (!fs.existsSync(settingsPath)) {
        return { ...DEFAULT_FEATURE_SETTINGS };
    }
    return parseTopLevelSettings(fs.readFileSync(settingsPath, "utf8"), settingsPath);
}
export function parseTopLevelSettings(source, sourceName = SETTINGS_FILE) {
    const settings = { ...DEFAULT_FEATURE_SETTINGS };
    for (const [index, rawLine] of source.split(/\r?\n/).entries()) {
        const line = rawLine.replace(/\s+#.*$/, "").trim();
        if (!line || line.startsWith("#")) {
            continue;
        }
        const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*:\s*(true|false)$/i);
        if (!match) {
            throw new Error(`${sourceName}:${index + 1}: expected key: true|false`);
        }
        const key = match[1];
        if (!SETTINGS_KEYS.has(key)) {
            throw new Error(`${sourceName}:${index + 1}: unknown setting ${key}`);
        }
        settings[key] =
            match[2].toLowerCase() === "true";
    }
    return settings;
}
export function enabledToolNames(settings) {
    const names = new Set([
        "dbhopper_private_settings_status",
        "dbhopper_private_settings_select",
        "dbhopper_credentials_validate",
    ]);
    if (settings.use_delay_retrieval) {
        for (const name of DELAY_RETRIEVAL_TOOL_NAMES) {
            names.add(name);
        }
    }
    if (settings.use_claim_requests) {
        for (const name of CLAIM_TOOL_NAMES) {
            names.add(name);
        }
    }
    if (settings.use_ticket_buying) {
        for (const name of TICKET_BUYING_TOOL_NAMES) {
            names.add(name);
        }
    }
    return names;
}
export function featureSettingsSummary(settings) {
    return {
        delay_retrieval: settings.use_delay_retrieval,
        autonomous_claims: settings.use_claim_requests,
        autonomous_ticket_buying: settings.use_ticket_buying,
    };
}

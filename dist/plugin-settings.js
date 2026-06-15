import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ALWAYS_ENABLED_TOOL_NAMES, AUTONOMOUS_TICKET_BUYING_TOOL_NAMES, CLAIM_TOOL_NAMES, DELAY_RETRIEVAL_TOOL_NAMES, } from "./tool-contracts.js";
export const DEFAULT_FEATURE_SETTINGS = {
    use_delay_retrieval: true,
    use_claim_requests: false,
    use_ticket_buying: false,
};
const PACKAGE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SETTINGS_FILE = "settings.yaml";
const SETTINGS_KEYS = new Set(Object.keys(DEFAULT_FEATURE_SETTINGS));
const TOOL_FEATURE_SETTINGS = new Map([
    ...CLAIM_TOOL_NAMES.map((name) => [name, "use_claim_requests"]),
    ...DELAY_RETRIEVAL_TOOL_NAMES.map((name) => [name, "use_delay_retrieval"]),
    ...AUTONOMOUS_TICKET_BUYING_TOOL_NAMES.map((name) => [name, "use_ticket_buying"]),
]);
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
    const names = new Set(ALWAYS_ENABLED_TOOL_NAMES);
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
        for (const name of AUTONOMOUS_TICKET_BUYING_TOOL_NAMES) {
            names.add(name);
        }
    }
    return names;
}
export function featureSettingForToolName(toolName) {
    return TOOL_FEATURE_SETTINGS.get(toolName);
}
export function featureSettingLabel(setting) {
    switch (setting) {
        case "use_claim_requests":
            return "autonomous claims";
        case "use_delay_retrieval":
            return "delay retrieval";
        case "use_ticket_buying":
            return "autonomous ticket buying";
    }
}
export function featureSettingsSummary(settings) {
    return {
        delay_retrieval: settings.use_delay_retrieval,
        autonomous_claims: settings.use_claim_requests,
        autonomous_ticket_buying: settings.use_ticket_buying,
    };
}

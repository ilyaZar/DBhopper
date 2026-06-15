import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  ALWAYS_ENABLED_TOOL_NAMES,
  AUTONOMOUS_TICKET_BUYING_TOOL_NAMES,
  CLAIM_TOOL_NAMES,
  DELAY_RETRIEVAL_TOOL_NAMES,
} from "./tool-contracts.js";

export interface DBhopperFeatureSettings {
  use_delay_retrieval: boolean;
  use_claim_requests: boolean;
  use_ticket_buying: boolean;
}

export type DBhopperFeatureSettingName = keyof DBhopperFeatureSettings;

export const DEFAULT_FEATURE_SETTINGS: DBhopperFeatureSettings = {
  use_delay_retrieval: true,
  use_claim_requests: false,
  use_ticket_buying: false,
};

const PACKAGE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SETTINGS_FILE = "settings.yaml";
const SETTINGS_KEYS = new Set(Object.keys(DEFAULT_FEATURE_SETTINGS));
const TOOL_FEATURE_SETTINGS = new Map<string, DBhopperFeatureSettingName>([
  ...CLAIM_TOOL_NAMES.map((name) => [name, "use_claim_requests"] as const),
  ...DELAY_RETRIEVAL_TOOL_NAMES.map(
    (name) => [name, "use_delay_retrieval"] as const,
  ),
  ...AUTONOMOUS_TICKET_BUYING_TOOL_NAMES.map(
    (name) => [name, "use_ticket_buying"] as const,
  ),
]);

export function readTopLevelSettings(
  packageRoot = PACKAGE_ROOT,
): DBhopperFeatureSettings {
  const settingsPath = path.join(packageRoot, SETTINGS_FILE);
  if (!fs.existsSync(settingsPath)) {
    return { ...DEFAULT_FEATURE_SETTINGS };
  }
  return parseTopLevelSettings(fs.readFileSync(settingsPath, "utf8"), settingsPath);
}

export function parseTopLevelSettings(
  source: string,
  sourceName = SETTINGS_FILE,
): DBhopperFeatureSettings {
  const settings: DBhopperFeatureSettings = { ...DEFAULT_FEATURE_SETTINGS };

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
    settings[key as keyof DBhopperFeatureSettings] =
      match[2].toLowerCase() === "true";
  }

  return settings;
}

export function enabledToolNames(settings: DBhopperFeatureSettings) {
  const names = new Set<string>(ALWAYS_ENABLED_TOOL_NAMES);

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

export function featureSettingForToolName(toolName: string) {
  return TOOL_FEATURE_SETTINGS.get(toolName);
}

export function featureSettingLabel(setting: DBhopperFeatureSettingName) {
  switch (setting) {
    case "use_claim_requests":
      return "autonomous claims";
    case "use_delay_retrieval":
      return "delay retrieval";
    case "use_ticket_buying":
      return "autonomous ticket buying";
  }
}

export function featureSettingsSummary(settings: DBhopperFeatureSettings) {
  return {
    delay_retrieval: settings.use_delay_retrieval,
    autonomous_claims: settings.use_claim_requests,
    autonomous_ticket_buying: settings.use_ticket_buying,
  };
}

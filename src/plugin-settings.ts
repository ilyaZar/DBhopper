import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  ALWAYS_ENABLED_TOOL_NAMES,
  AUTONOMOUS_TICKET_BUYING_TOOL_NAMES,
  CLAIM_TOOL_NAMES,
  DELAY_RETRIEVAL_TOOL_NAMES,
  PRIVATE_SETTINGS_CONFIGURE_TOOL_NAME,
} from "./tool-contracts.js";
import {
  defaultPrivateSettings,
  parsePrivateSettingsToml,
  privateSettingsPath,
} from "./private-settings.js";

export interface DBhopperFeatureSettings {
  use_delay_retrieval: boolean;
  use_claim_requests: boolean;
  use_ticket_purchase: boolean;
}

export type DBhopperFeatureSettingName = keyof DBhopperFeatureSettings;

export const DEFAULT_FEATURE_SETTINGS: DBhopperFeatureSettings = {
  use_delay_retrieval: defaultPrivateSettings().USE_DELAY_RETRIEVAL,
  use_claim_requests: defaultPrivateSettings().USE_CLAIM_REQUESTS,
  use_ticket_purchase: defaultPrivateSettings().USE_TICKET_PURCHASE,
};

const PACKAGE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SETTINGS_FILE = path.join("assets", "private", "settings.toml");
const TOOL_FEATURE_SETTINGS = new Map<string, DBhopperFeatureSettingName>([
  ...CLAIM_TOOL_NAMES.map((name) => [name, "use_claim_requests"] as const),
  ...DELAY_RETRIEVAL_TOOL_NAMES.map(
    (name) => [name, "use_delay_retrieval"] as const,
  ),
  ...AUTONOMOUS_TICKET_BUYING_TOOL_NAMES.map(
    (name) => [name, "use_ticket_purchase"] as const,
  ),
]);

export function readTopLevelSettings(
  packageRoot = PACKAGE_ROOT,
): DBhopperFeatureSettings {
  const settingsPath = privateSettingsPath({ workspaceRoot: packageRoot });
  if (!fs.existsSync(settingsPath)) {
    return { ...DEFAULT_FEATURE_SETTINGS };
  }
  return parseTopLevelSettings(fs.readFileSync(settingsPath, "utf8"), settingsPath);
}

export function parseTopLevelSettings(
  source: string,
  sourceName = SETTINGS_FILE,
): DBhopperFeatureSettings {
  const settings = parsePrivateSettingsToml(source, sourceName);
  return {
    use_delay_retrieval: settings.USE_DELAY_RETRIEVAL,
    use_claim_requests: settings.USE_CLAIM_REQUESTS,
    use_ticket_purchase: settings.USE_TICKET_PURCHASE,
  };
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
  if (settings.use_ticket_purchase) {
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
    case "use_ticket_purchase":
      return "autonomous ticket purchase";
  }
}

export function featureSettingsSummary(settings: DBhopperFeatureSettings) {
  return {
    delay_retrieval: settings.use_delay_retrieval,
    autonomous_claims: settings.use_claim_requests,
    autonomous_ticket_purchase: settings.use_ticket_purchase,
  };
}

export function featureSettingEnableSuggestion(
  setting: DBhopperFeatureSettingName,
) {
  return {
    suggestedTool: PRIVATE_SETTINGS_CONFIGURE_TOOL_NAME,
    suggestedChange: {
      [setting]: true,
    },
  };
}

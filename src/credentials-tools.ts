import { Type } from "typebox";

import {
  validateCredentialsFiles,
} from "./credentials.js";
import { configuredCredentialsDir } from "./private-settings.js";
import type { DBhopperConfig } from "./types.js";

export const CREDENTIALS_TOOL_NAMES = ["dbhopper_credentials_validate"] as const;

export function createCredentialsToolDefinitions(tool: any) {
  return [
    tool({
      name: "dbhopper_credentials_validate",
      label: "DBhopper Credentials Validate",
      description:
        "Validate DBhopper private credentials TOML files without returning secrets.",
      optional: true,
      parameters: Type.Object({}, { additionalProperties: false }),
      execute: async (_params: unknown, config: DBhopperConfig = {}) => {
        const result = await validateCredentialsFiles(config);
        return {
          ok: result.ok,
          operation: "credentials_validate",
          credentialsDir: await configuredCredentialsDir(config),
          messages: result.messages,
        };
      },
    }),
  ];
}

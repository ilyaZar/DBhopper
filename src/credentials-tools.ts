import { Type } from "typebox";

import {
  validateCredentialsFiles,
} from "./credentials.js";
import { configuredUserCredentialsDir } from "./private-settings.js";
import { CREDENTIALS_VALIDATE_TOOL_NAME } from "./tool-contracts.js";
import type { DBhopperConfig } from "./types.js";

export function createCredentialsToolDefinitions(tool: any) {
  return [
    tool({
      name: CREDENTIALS_VALIDATE_TOOL_NAME,
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
          userCredentialsDir: await configuredUserCredentialsDir(config),
          messages: result.messages,
        };
      },
    }),
  ];
}

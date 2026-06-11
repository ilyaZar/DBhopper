import { Type } from "typebox";
import { validateCredentialsFiles, } from "./credentials.js";
import { configuredCredentialsDir } from "./private-settings.js";
export const CREDENTIALS_TOOL_NAMES = ["dbhopper_credentials_validate"];
export function createCredentialsToolDefinitions(tool) {
    return [
        tool({
            name: "dbhopper_credentials_validate",
            label: "DBhopper Credentials Validate",
            description: "Validate DBhopper private credentials TOML files without returning secrets.",
            optional: true,
            parameters: Type.Object({}, { additionalProperties: false }),
            execute: async (_params, config = {}) => {
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

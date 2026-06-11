import { Type } from "typebox";
import { privateSettingsStatus, writePrivateSettingsIds, } from "./private-settings.js";
export const PRIVATE_SETTINGS_TOOL_NAMES = [
    "dbhopper_private_settings_status",
    "dbhopper_private_settings_select",
];
export function createPrivateSettingsToolDefinitions(tool) {
    return [
        tool({
            name: "dbhopper_private_settings_status",
            label: "DBhopper Private Settings Status",
            description: "List current DBhopper private profile/credential IDs and validate them.",
            optional: true,
            parameters: Type.Object({}, { additionalProperties: false }),
            execute: async (_params, config = {}) => ({
                ok: true,
                operation: "private_settings_status",
                status: await privateSettingsStatus(config),
            }),
        }),
        tool({
            name: "dbhopper_private_settings_select",
            label: "DBhopper Private Settings Select",
            description: "Update only ID_CRED and/or ID_PRF in assets/private/settings.toml.",
            optional: true,
            parameters: Type.Object({
                credential_id: Type.Optional(Type.String({
                    description: 'Credential ID_CRED to select, for example "01".',
                })),
                profile_id: Type.Optional(Type.String({
                    description: 'Profile ID_PRF to select, for example "03".',
                })),
            }, { additionalProperties: false }),
            execute: async (params, config = {}) => {
                try {
                    return {
                        ok: true,
                        operation: "private_settings_select",
                        status: await writePrivateSettingsIds({
                            credentialId: params.credential_id,
                            profileId: params.profile_id,
                        }, config),
                    };
                }
                catch (error) {
                    return {
                        ok: false,
                        operation: "private_settings_select",
                        error: error instanceof Error ? error.message : String(error),
                        status: await privateSettingsStatus(config).catch(() => undefined),
                    };
                }
            },
        }),
    ];
}

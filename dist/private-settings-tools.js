import { Type } from "typebox";
import { privateSettingsStatus, writePrivateSettingsIds, } from "./private-settings.js";
import { PRIVATE_SETTINGS_SELECT_TOOL_NAME, PRIVATE_SETTINGS_STATUS_TOOL_NAME, } from "./tool-contracts.js";
import { errorMessage } from "./errors.js";
export function createPrivateSettingsToolDefinitions(tool) {
    return [
        tool({
            name: PRIVATE_SETTINGS_STATUS_TOOL_NAME,
            label: "DBhopper Private Settings Status",
            description: [
                "List current DBhopper private user, claim, buying, and payment IDs.",
                "Returns file metadata and presence only, never secret values.",
            ].join(" "),
            optional: true,
            parameters: Type.Object({}, { additionalProperties: false }),
            execute: async (_params, config = {}) => ({
                ok: true,
                operation: "private_settings_status",
                status: await privateSettingsStatus(config),
            }),
        }),
        tool({
            name: PRIVATE_SETTINGS_SELECT_TOOL_NAME,
            label: "DBhopper Private Settings Select",
            description: [
                "Update ID_USR, ID_CLM, ID_BUY, ID_PYM, and/or",
                "TICKET_BUYING_MODE in assets/private/settings.toml.",
            ].join(" "),
            optional: true,
            parameters: Type.Object({
                user_id: Type.Optional(Type.String({
                    description: 'User credential ID_USR to select, for example "01".',
                })),
                claim_profile_id: Type.Optional(Type.String({
                    description: 'Claim profile ID_CLM to select, for example "03".',
                })),
                buying_profile_id: Type.Optional(Type.String({
                    description: 'Buying profile ID_BUY to select, for example "01".',
                })),
                payment_profile_id: Type.Optional(Type.String({
                    description: 'Payment profile ID_PYM to select, for example "01".',
                })),
                ticket_buying_mode: Type.Optional(Type.Union([Type.Literal("review"), Type.Literal("auto")], {
                    description: "Final Check-page gate mode. Default is review; auto is not purchase-enabled yet.",
                })),
            }, { additionalProperties: false }),
            execute: async (params, config = {}) => {
                try {
                    return {
                        ok: true,
                        operation: "private_settings_select",
                        status: await writePrivateSettingsIds({
                            userId: params.user_id,
                            claimProfileId: params.claim_profile_id,
                            buyingProfileId: params.buying_profile_id,
                            paymentProfileId: params.payment_profile_id,
                            ticketBuyingMode: params.ticket_buying_mode,
                        }, config),
                    };
                }
                catch (error) {
                    return {
                        ok: false,
                        operation: "private_settings_select",
                        error: errorMessage(error),
                        status: await privateSettingsStatus(config).catch(() => undefined),
                    };
                }
            },
        }),
    ];
}

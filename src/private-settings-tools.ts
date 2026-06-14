import { Type } from "typebox";

import {
  privateSettingsStatus,
  writePrivateSettingsIds,
  type DBhopperTicketBuyingMode,
} from "./private-settings.js";
import { errorMessage } from "./errors.js";
import type { DBhopperConfig } from "./types.js";

export const PRIVATE_SETTINGS_TOOL_NAMES = [
  "dbhopper_private_settings_status",
  "dbhopper_private_settings_select",
] as const;

export function createPrivateSettingsToolDefinitions(tool: any) {
  return [
    tool({
      name: "dbhopper_private_settings_status",
      label: "DBhopper Private Settings Status",
      description:
        [
          "List current DBhopper private user, claim, buying, and payment IDs.",
          "Returns file metadata and presence only, never secret values.",
        ].join(" "),
      optional: true,
      parameters: Type.Object({}, { additionalProperties: false }),
      execute: async (_params: unknown, config: DBhopperConfig = {}) => ({
        ok: true,
        operation: "private_settings_status",
        status: await privateSettingsStatus(config),
      }),
    }),
    tool({
      name: "dbhopper_private_settings_select",
      label: "DBhopper Private Settings Select",
      description:
        [
          "Update ID_USR, ID_CLM, ID_BUY, ID_PYM, and/or",
          "TICKET_BUYING_MODE in assets/private/settings.toml.",
        ].join(" "),
      optional: true,
      parameters: Type.Object(
        {
          user_id: Type.Optional(
            Type.String({
              description: 'User credential ID_USR to select, for example "01".',
            }),
          ),
          profile_id: Type.Optional(
            Type.String({
              description:
                'Deprecated alias for claim_profile_id; selects ID_CLM.',
            }),
          ),
          claim_profile_id: Type.Optional(
            Type.String({
              description: 'Claim profile ID_CLM to select, for example "03".',
            }),
          ),
          buying_profile_id: Type.Optional(
            Type.String({
              description: 'Buying profile ID_BUY to select, for example "01".',
            }),
          ),
          payment_profile_id: Type.Optional(
            Type.String({
              description: 'Payment profile ID_PYM to select, for example "01".',
            }),
          ),
          ticket_buying_mode: Type.Optional(
            Type.Union([Type.Literal("review"), Type.Literal("auto")], {
              description:
                "Final Check-page gate mode. Default is review; auto is not purchase-enabled yet.",
            }),
          ),
        },
        { additionalProperties: false },
      ),
      execute: async (
        params: {
          user_id?: string;
          profile_id?: string;
          claim_profile_id?: string;
          buying_profile_id?: string;
          payment_profile_id?: string;
          ticket_buying_mode?: DBhopperTicketBuyingMode;
        },
        config: DBhopperConfig = {},
      ) => {
        try {
          return {
            ok: true,
            operation: "private_settings_select",
            status: await writePrivateSettingsIds(
              {
                userId: params.user_id,
                claimProfileId: params.claim_profile_id ?? params.profile_id,
                buyingProfileId: params.buying_profile_id,
                paymentProfileId: params.payment_profile_id,
                ticketBuyingMode: params.ticket_buying_mode,
              },
              config,
            ),
          };
        } catch (error) {
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

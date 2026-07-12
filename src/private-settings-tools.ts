import { Type } from "typebox";

import {
  DELAY_FALLBACKS,
  DELAY_PROVIDERS,
} from "./delay-provider-options.js";
import {
  privateSettingsStatus,
  previewPrivateSettingsRuntimeConfig,
  writePrivateSettingsRuntimeConfig,
  type DBhopperClaimRequestMode,
  type DBhopperDelayFallbackSetting,
  type DBhopperDelayProviderSetting,
  writePrivateSettingsIds,
  type DBhopperPurchaseMode,
} from "./private-settings.js";
import {
  PRIVATE_SETTINGS_CONFIGURE_TOOL_NAME,
  PRIVATE_SETTINGS_SELECT_TOOL_NAME,
  PRIVATE_SETTINGS_STATUS_TOOL_NAME,
} from "./tool-contracts.js";
import { errorMessage } from "./errors.js";
import type { DBhopperConfig } from "./types.js";

export function createPrivateSettingsToolDefinitions(tool: any) {
  return [
    tool({
      name: PRIVATE_SETTINGS_STATUS_TOOL_NAME,
      label: "DBhopper Private Settings Status",
      description:
        [
          "List current DBhopper private user, claim, buying, and payment IDs.",
          "Returns file metadata and presence only, never secret values.",
        ].join(" "),
      parameters: Type.Object({}, { additionalProperties: false }),
      execute: async (_params: unknown, config: DBhopperConfig = {}) => ({
        ok: true,
        operation: "private_settings_status",
        status: await privateSettingsStatus(config),
      }),
    }),
    tool({
      name: PRIVATE_SETTINGS_SELECT_TOOL_NAME,
      label: "DBhopper Private Settings Select",
      description:
        [
          "Update ID_USR, ID_CLM, ID_BUY, and/or ID_PYM",
          "in assets/private/settings.toml.",
        ].join(" "),
      parameters: Type.Object(
        {
          user_id: Type.Optional(
            Type.String({
              description: 'User credential ID_USR to select, for example "01".',
            }),
          ),
          claim_profile_id: Type.Optional(
            Type.String({
              description: 'Claim ID_CLM to select, for example "essen-koeln-re1".',
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
        },
        { additionalProperties: false },
      ),
      execute: async (
        params: {
          user_id?: string;
          claim_profile_id?: string;
          buying_profile_id?: string;
          payment_profile_id?: string;
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
                claimProfileId: params.claim_profile_id,
                buyingProfileId: params.buying_profile_id,
                paymentProfileId: params.payment_profile_id,
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
    tool({
      name: PRIVATE_SETTINGS_CONFIGURE_TOOL_NAME,
      label: "DBhopper Private Settings Configure",
      description:
        [
          "Preview or confirm important DBhopper settings changes.",
          "Controls workflow gates, delay backend mode, fallback mode,",
          "claim review mode, and purchase review mode in assets/private/settings.toml.",
        ].join(" "),
      parameters: Type.Object(
        {
          use_delay_retrieval: Type.Optional(
            Type.Boolean({
              description: "Enable or disable DB delay-query tools.",
            }),
          ),
          use_claim_requests: Type.Optional(
            Type.Boolean({
              description:
                "Enable or disable claim preparation and browser filing tools.",
            }),
          ),
          use_ticket_purchase: Type.Optional(
            Type.Boolean({
              description:
                "Enable or disable ticket search and checkout dry-run tools.",
            }),
          ),
          test_run_claim_request: Type.Optional(
            Type.Boolean({
              description:
                "When true, save page-by-page claim browser text and screenshots externally.",
            }),
          ),
          test_run_purchase: Type.Optional(
            Type.Boolean({
              description:
                "When true, save numbered purchase browser text and screenshots externally.",
            }),
          ),
          claim_request_mode: Type.Optional(
            Type.Union([Type.Literal("review"), Type.Literal("auto")], {
              description:
                "Final claim filing mode. review stops for summary screenshot inspection; auto allows confirmed submit mode.",
            }),
          ),
          delay_provider: Type.Optional(
            Type.Union(DELAY_PROVIDERS.map((provider) => Type.Literal(provider)), {
              description:
                "Delay backend mode: bahn-web, db-timetables, or auto.",
            }),
          ),
          delay_fallback: Type.Optional(
            Type.Union(DELAY_FALLBACKS.map((fallback) => Type.Literal(fallback)), {
              description:
                "Delay fallback backend after provider failure, or none.",
            }),
          ),
          purchase_mode: Type.Optional(
            Type.Union([Type.Literal("review"), Type.Literal("auto")], {
              description:
                "Final ticket checkout mode. review stops for screenshot inspection; auto is not purchase-enabled yet.",
            }),
          ),
          confirm: Type.Optional(
            Type.Boolean({
              description:
                "Must be true only after the user explicitly confirms the previewed settings changes.",
            }),
          ),
        },
        { additionalProperties: false },
      ),
      execute: async (
        params: {
          use_delay_retrieval?: boolean;
          use_claim_requests?: boolean;
          use_ticket_purchase?: boolean;
          test_run_claim_request?: boolean;
          test_run_purchase?: boolean;
          claim_request_mode?: DBhopperClaimRequestMode;
          delay_provider?: DBhopperDelayProviderSetting;
          delay_fallback?: DBhopperDelayFallbackSetting;
          purchase_mode?: DBhopperPurchaseMode;
          confirm?: boolean;
        } = {},
        config: DBhopperConfig = {},
      ) => {
        const updates = Object.fromEntries(
          Object.entries({
            use_delay_retrieval: params.use_delay_retrieval,
            use_claim_requests: params.use_claim_requests,
            use_ticket_purchase: params.use_ticket_purchase,
            test_run_claim_request: params.test_run_claim_request,
            test_run_purchase: params.test_run_purchase,
            claim_request_mode: params.claim_request_mode,
            delay_provider: params.delay_provider,
            delay_fallback: params.delay_fallback,
            purchase_mode: params.purchase_mode,
          }).filter(([, value]) => value !== undefined),
        );
        try {
          if (params.confirm !== true) {
            return {
              ok: true,
              operation: "private_settings_configure",
              mode: "preview",
              preview: await previewPrivateSettingsRuntimeConfig(updates, config),
            };
          }
          const result = await writePrivateSettingsRuntimeConfig(updates, config);
          return {
            ok: true,
            operation: "private_settings_configure",
            mode: "confirmed",
            preview: result.preview,
            status: result.status,
          };
        } catch (error) {
          return {
            ok: false,
            operation: "private_settings_configure",
            error: errorMessage(error),
            status: await privateSettingsStatus(config).catch(() => undefined),
          };
        }
      },
    }),
  ];
}

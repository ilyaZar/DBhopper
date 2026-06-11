import { Type } from "typebox";

import { runDbApiCredentialProbe } from "./db-api-access.js";
import { runDbMarketplaceAccessCheck } from "./db-marketplace-access.js";
import { runDbStandardLoginCheck } from "./db-standard-access.js";
import type { DBhopperConfig } from "./types.js";

export const ACCESS_TOOL_NAMES = [
  "dbhopper_db_standard_login_check",
  "dbhopper_db_marketplace_access_check",
  "dbhopper_db_api_credential_probe",
] as const;

export function createAccessToolDefinitions(tool: any) {
  return [
    tool({
      name: "dbhopper_db_standard_login_check",
      label: "DBhopper DB Standard Login Check",
      description:
        "One-time diagnostic for selected Bahn account credentials and browser profile.",
      optional: true,
      parameters: Type.Object(
        {
          credentials_profile: Type.Optional(
            Type.String({
              description:
                "Optional TOML credentials file under assets/private/credentials/.",
            }),
          ),
          stay_logged_in: Type.Optional(
            Type.Boolean({
              default: true,
              description:
                "Check DB's stay-logged-in box when the login page exposes it.",
            }),
          ),
          screenshots: Type.Optional(
            Type.Boolean({
              default: false,
              description:
                "Save local screenshots under tmp/. Screenshots may contain account identity.",
            }),
          ),
          headless: Type.Optional(Type.Boolean()),
          slow_mo_ms: Type.Optional(Type.Number({ minimum: 0, maximum: 5000 })),
        },
        { additionalProperties: false },
      ),
      execute: async (
        params: Parameters<typeof runDbStandardLoginCheck>[0],
        config: DBhopperConfig,
        context: { signal?: AbortSignal },
      ) => runDbStandardLoginCheck(params, config, context.signal),
    }),
    tool({
      name: "dbhopper_db_marketplace_access_check",
      label: "DBhopper DB Marketplace Access Check",
      description:
        "One-time diagnostic for DB API Marketplace browser reachability and login proof.",
      optional: true,
      parameters: Type.Object(
        {
          credentials_profile: Type.Optional(Type.String()),
          stay_logged_in: Type.Optional(Type.Boolean({ default: true })),
          allow_bahn_account_fallback: Type.Optional(
            Type.Boolean({
              default: false,
              description:
                "Permit [bahnAccount] fallback only after accepting that it is not [dbApi] proof.",
            }),
          ),
          screenshots: Type.Optional(
            Type.Boolean({
              default: false,
              description:
                "Save local screenshots under tmp/. Screenshots may contain account identity.",
            }),
          ),
          headless: Type.Optional(Type.Boolean()),
          slow_mo_ms: Type.Optional(Type.Number({ minimum: 0, maximum: 5000 })),
        },
        { additionalProperties: false },
      ),
      execute: async (
        params: Parameters<typeof runDbMarketplaceAccessCheck>[0],
        config: DBhopperConfig,
        context: { signal?: AbortSignal },
      ) => runDbMarketplaceAccessCheck(params, config, context.signal),
    }),
    tool({
      name: "dbhopper_db_api_credential_probe",
      label: "DBhopper DB API Credential Probe",
      description:
        "Probe official DB Timetables API credentials without returning secrets.",
      optional: true,
      parameters: Type.Object(
        {
          credentials_profile: Type.Optional(Type.String()),
          station_pattern: Type.Optional(
            Type.String({
              default: "Hamm",
              description: "Station lookup pattern used for the harmless probe.",
            }),
          ),
        },
        { additionalProperties: false },
      ),
      execute: async (
        params: Parameters<typeof runDbApiCredentialProbe>[0],
        config: DBhopperConfig,
      ) => runDbApiCredentialProbe(params, config),
    }),
  ];
}

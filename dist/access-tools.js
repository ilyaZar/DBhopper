import { Type } from "typebox";
import { runDbApiCredentialProbe } from "./db-api-access.js";
import { runDbMarketplaceAccessCheck } from "./db-marketplace-access.js";
import { runDbStandardLoginCheck } from "./db-standard-access.js";
export const ACCESS_TOOL_NAMES = [
    "dbhopper_db_standard_login_check",
    "dbhopper_db_marketplace_access_check",
    "dbhopper_db_api_credential_probe",
];
export function createAccessToolDefinitions(tool) {
    return [
        tool({
            name: "dbhopper_db_standard_login_check",
            label: "DBhopper DB Standard Login Check",
            description: "One-time diagnostic for selected Bahn account credentials and browser profile.",
            optional: true,
            parameters: Type.Object({
                stay_logged_in: Type.Optional(Type.Boolean({
                    default: true,
                    description: "Check DB's stay-logged-in box when the login page exposes it.",
                })),
                screenshots: Type.Optional(Type.Boolean({
                    default: false,
                    description: "Save local screenshots under tmp/. Screenshots may contain account identity.",
                })),
                headless: Type.Optional(Type.Boolean()),
                slow_mo_ms: Type.Optional(Type.Number({ minimum: 0, maximum: 5000 })),
            }, { additionalProperties: false }),
            execute: async (params, config, context) => runDbStandardLoginCheck(params, config, context.signal),
        }),
        tool({
            name: "dbhopper_db_marketplace_access_check",
            label: "DBhopper DB Marketplace Access Check",
            description: "One-time diagnostic for DB API Marketplace browser reachability and login proof.",
            optional: true,
            parameters: Type.Object({
                stay_logged_in: Type.Optional(Type.Boolean({ default: true })),
                screenshots: Type.Optional(Type.Boolean({
                    default: false,
                    description: "Save local screenshots under tmp/. Screenshots may contain account identity.",
                })),
                headless: Type.Optional(Type.Boolean()),
                slow_mo_ms: Type.Optional(Type.Number({ minimum: 0, maximum: 5000 })),
            }, { additionalProperties: false }),
            execute: async (params, config, context) => runDbMarketplaceAccessCheck(params, config, context.signal),
        }),
        tool({
            name: "dbhopper_db_api_credential_probe",
            label: "DBhopper DB API Credential Probe",
            description: "Probe official DB Timetables API credentials without returning secrets.",
            optional: true,
            parameters: Type.Object({
                station_pattern: Type.Optional(Type.String({
                    default: "Hamm",
                    description: "Station lookup pattern used for the harmless probe.",
                })),
            }, { additionalProperties: false }),
            execute: async (params, config) => runDbApiCredentialProbe(params, config),
        }),
    ];
}

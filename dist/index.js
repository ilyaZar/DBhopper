import { Type } from "typebox";
import { defineToolPlugin } from "openclaw/plugin-sdk/tool-plugin";
import { createAccessToolDefinitions } from "./access-tools.js";
import { createCredentialsToolDefinitions } from "./credentials-tools.js";
import { createDbDelayToolDefinitions } from "./db-delay-tools.js";
import { createPrivateSettingsToolDefinitions } from "./private-settings-tools.js";
import { createTicketBuyingToolDefinitions } from "./ticket-buying.js";
import { buildDBhopperApprovalDescription, createDBhopperTools, resolveApprovalToolNames, } from "./tools.js";
const configSchema = Type.Object({
    workspaceRoot: Type.Optional(Type.String({
        description: "Top-level directory containing claims/ and assets/. Defaults to the plugin package directory.",
    })),
    browserExecutablePath: Type.Optional(Type.String({
        description: "Optional Chromium or Chrome executable path for browser filing.",
    })),
    artifactRoot: Type.Optional(Type.String({
        description: "Optional directory for browser-run artifacts. Defaults to workspaceRoot/tmp.",
    })),
    headless: Type.Optional(Type.Boolean({
        default: true,
        description: "Whether browser filing runs headless by default.",
    })),
    timeoutMs: Type.Optional(Type.Number({
        minimum: 10000,
        maximum: 600000,
        description: "Maximum runtime for one browser filing operation.",
    })),
    approvalMode: Type.Optional(Type.Union([
        Type.Literal("all"),
        Type.Literal("mutating"),
        Type.Literal("none"),
    ], {
        default: "all",
        description: "Approval behavior. Defaults to all claim tools; use mutating for read-only claim tools without approval.",
    })),
    activeProfileName: Type.Optional(Type.String({
        description: "Default TOML profile under assets/private/profiles/ for claim operations.",
    })),
    activeCredentialsName: Type.Optional(Type.String({
        description: "Default TOML credentials file under assets/private/credentials/.",
    })),
    dbClientId: Type.Optional(Type.String({
        description: "DB API Marketplace Client ID. Can also be supplied as DB_CLIENT_ID.",
    })),
    dbApiKey: Type.Optional(Type.String({
        description: "DB API Marketplace Client Secret/API key. Can also be supplied as DB_API_KEY.",
    })),
    timetableBaseUrl: Type.Optional(Type.String({
        description: "Optional DB Timetables API base URL override.",
    })),
    delayProvider: Type.Optional(Type.Union([
        Type.Literal("auto"),
        Type.Literal("db-timetables"),
        Type.Literal("bahn-web"),
    ], {
        default: "auto",
        description: "Delay provider. auto uses DB Timetables when credentials exist, otherwise bahn-web.",
    })),
    bahnWebBaseUrl: Type.Optional(Type.String({
        description: "Optional bahn-web base URL override, restricted to https://int.bahn.de/web/api or https://www.bahn.de/web/api.",
    })),
    bahnWebTransport: Type.Optional(Type.Union([
        Type.Literal("auto"),
        Type.Literal("fetch"),
        Type.Literal("curl"),
        Type.Literal("browser"),
    ], {
        default: "auto",
        description: "bahn-web transport. auto tries native fetch, curl, then browser fetch.",
    })),
    requestTimeoutMs: Type.Optional(Type.Number({
        minimum: 1000,
        maximum: 120000,
        description: "Maximum runtime for one DB delay HTTP request.",
    })),
    delayLookbackMinutes: Type.Optional(Type.Number({
        minimum: 0,
        maximum: 720,
        description: "Extra planned-board lookback used to catch delayed trains scheduled before the lower bound.",
    })),
    timeZone: Type.Optional(Type.String({
        default: "Europe/Berlin",
        description: "Default IANA timezone for local delay-query times.",
    })),
}, { additionalProperties: false });
const plugin = defineToolPlugin({
    id: "dbhopper",
    name: "DBhopper",
    description: "NRW Mobilitätsgarantie claim tools and Deutsche Bahn delay-query tools.",
    configSchema,
    tools: (tool) => [
        claimToolDefinition(tool, {
            name: "dbhopper_claim_schema",
            label: "DBhopper Claim Schema",
            description: "Return NRW Mobilitätsgarantie claim facts, required evidence, and the DBhopper claim TOML shape.",
            parameters: Type.Object({}, { additionalProperties: false }),
        }),
        claimToolDefinition(tool, {
            name: "dbhopper_list_claims",
            label: "DBhopper List Claims",
            description: "List local DBhopper claims with personal fields redacted.",
            parameters: Type.Object({}, { additionalProperties: false }),
        }),
        claimToolDefinition(tool, {
            name: "dbhopper_prepare_claim",
            label: "DBhopper Prepare Claim",
            description: "Create or replace a local claim folder, copy evidence files into it, and write claim.toml.",
            parameters: prepareClaimParameters(),
        }),
        claimToolDefinition(tool, {
            name: "dbhopper_validate_claim",
            label: "DBhopper Validate Claim",
            description: "Validate deterministic NRW Mobilitätsgarantie eligibility checks for a claim object or claim folder.",
            parameters: Type.Object({
                claimId: Type.Optional(Type.String()),
                claim: Type.Optional(Type.Object({}, { additionalProperties: true })),
                now: Type.Optional(Type.String({
                    description: "Optional ISO timestamp for tests. Defaults to current time.",
                })),
            }, { additionalProperties: false }),
        }),
        claimToolDefinition(tool, {
            name: "dbhopper_browser_probe",
            label: "DBhopper Browser Probe",
            description: "Open the NRW Mobilitätsgarantie form and report whether the browser automation surface is reachable.",
            parameters: Type.Object({}, { additionalProperties: false }),
        }),
        claimToolDefinition(tool, {
            name: "dbhopper_run_claim",
            label: "DBhopper Run Claim",
            description: [
                "Drive the NRW Mobilitätsgarantie browser form for a prepared claim.",
                "Dry run stops at summary; submit requires confirmSubmit.",
            ].join(" "),
            parameters: Type.Object({
                confirm: Type.Boolean({
                    description: "Must be true only after the user explicitly confirms this operation.",
                }),
                claimId: Type.String(),
                mode: Type.Optional(Type.Union([Type.Literal("dry_run"), Type.Literal("submit")], {
                    default: "dry_run",
                })),
                confirmSubmit: Type.Optional(Type.Boolean({
                    description: "Must be true only after the user explicitly confirms final submission.",
                })),
                headless: Type.Optional(Type.Boolean()),
            }, { additionalProperties: false }),
        }),
        ...createPrivateSettingsToolDefinitions(tool),
        ...createCredentialsToolDefinitions(tool),
        ...createAccessToolDefinitions(tool),
        ...createDbDelayToolDefinitions(tool),
        ...createTicketBuyingToolDefinitions(tool),
    ],
});
const registerToolPlugin = plugin.register.bind(plugin);
plugin.register = (api) => {
    registerToolPlugin(api);
    registerClaimApprovalHook(api);
};
export default plugin;
function claimToolDefinition(tool, definition) {
    return tool({
        ...definition,
        optional: true,
        factory: ({ config }) => createDBhopperTools(config).find((entry) => entry.name === definition.name) ?? null,
    });
}
function registerClaimApprovalHook(api) {
    const approvalToolNames = resolveApprovalToolNames(api.pluginConfig ?? {});
    api.on?.("before_tool_call", (event) => {
        if (!approvalToolNames.has(event.toolName)) {
            return;
        }
        return {
            requireApproval: {
                title: "Run DBhopper claim operation",
                description: buildDBhopperApprovalDescription({
                    toolName: event.toolName,
                    params: event.params,
                }),
                severity: event.params?.mode === "submit" ? "danger" : "warning",
                timeoutMs: 120000,
                timeoutBehavior: "deny",
            },
        };
    }, { priority: 80, timeoutMs: 5000 });
}
function prepareClaimParameters() {
    return Type.Object({
        confirm: Type.Boolean({
            description: "Must be true only after the user explicitly confirms this operation.",
        }),
        claimId: Type.Optional(Type.String()),
        overwrite: Type.Optional(Type.Boolean()),
        profileName: Type.Optional(Type.String({
            description: "Optional TOML profile under assets/private/profiles/ merged in memory only.",
        })),
        claim: Type.Object({}, { additionalProperties: true }),
        files: Type.Optional(Type.Array(Type.Object({
            role: Type.Union([
                Type.Literal("base_ticket"),
                Type.Literal("substitute_receipt"),
                Type.Literal("delay_evidence"),
                Type.Literal("submission_pdf"),
                Type.Literal("screenshot"),
                Type.Literal("other"),
            ]),
            sourcePath: Type.Optional(Type.String()),
            assetName: Type.Optional(Type.String()),
            targetName: Type.Optional(Type.String()),
            description: Type.Optional(Type.String()),
        }, { additionalProperties: false }))),
    }, { additionalProperties: false });
}

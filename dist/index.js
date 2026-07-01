import { Type } from "typebox";
import { defineToolPlugin } from "openclaw/plugin-sdk/tool-plugin";
import { createAccessToolDefinitions } from "./access-tools.js";
import { CLAIM_FILE_ROLES, CLAIM_TOOL_CONTRACTS, RUN_CLAIM_MODES, } from "./claim-tool-contracts.js";
import { createCredentialsToolDefinitions } from "./credentials-tools.js";
import { createDbDelayToolDefinitions } from "./db-delay-tools.js";
import { BAHN_WEB_TRANSPORTS, DELAY_PROVIDERS, } from "./delay-provider-options.js";
import { createPrivateSettingsToolDefinitions } from "./private-settings-tools.js";
import { PRIVATE_SETTINGS_CONFIGURE_TOOL_NAME } from "./tool-contracts.js";
import { createTicketBuyingToolDefinitions } from "./ticket-buying.js";
import { BAHNHOF_SUFFIX_CHECKS } from "./browser.js";
import { featureSettingEnableSuggestion, featureSettingForToolName, featureSettingLabel, featureSettingsSummary, readTopLevelSettings, } from "./plugin-settings.js";
import { buildDBhopperApprovalDescription, createDBhopperTools, resolveApprovalToolNames, } from "./tools.js";
const configSchema = Type.Object({
    workspaceRoot: Type.Optional(Type.String({
        description: "Top-level directory containing claims/ and assets/. Defaults to the plugin package directory.",
    })),
    settingsPath: Type.Optional(Type.String({
        description: "Optional explicit path to settings.toml. Defaults to the plugin package assets/private/settings.toml.",
    })),
    browserExecutablePath: Type.Optional(Type.String({
        description: "Optional Chromium or Chrome executable path for browser filing.",
    })),
    artifactRoot: Type.Optional(Type.String({
        description: "Optional directory for ignored local browser-run artifacts.",
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
    timetableBaseUrl: Type.Optional(Type.String({
        description: "Optional DB Timetables API base URL override.",
    })),
    delayProvider: Type.Optional(Type.Union(DELAY_PROVIDERS.map((provider) => Type.Literal(provider)), {
        description: "Optional delay provider override. Omit to use settings.toml DELAY_PROVIDER.",
    })),
    bahnWebBaseUrl: Type.Optional(Type.String({
        description: "Optional bahn-web base URL override, restricted to https://int.bahn.de/web/api or https://www.bahn.de/web/api.",
    })),
    bahnWebTransport: Type.Optional(Type.Union(BAHN_WEB_TRANSPORTS.map((transport) => Type.Literal(transport)), {
        description: "Optional bahn-web transport override. The settings default uses browser.",
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
    tools: (tool) => createDBhopperToolDefinitions(tool),
});
const registerToolPlugin = plugin.register.bind(plugin);
plugin.register = (api) => {
    registerToolPlugin(api);
    registerClaimApprovalHook(api);
};
export default plugin;
export function createDBhopperToolDefinitions(tool, settings) {
    const readFeatureSettings = settings
        ? () => settings
        : () => readTopLevelSettings();
    const gatedTool = featureGatedTool(tool, readFeatureSettings);
    return [
        ...createClaimToolDefinitions(gatedTool),
        ...createPrivateSettingsToolDefinitions(gatedTool),
        ...createCredentialsToolDefinitions(gatedTool),
        ...createAccessToolDefinitions(gatedTool),
        ...createDbDelayToolDefinitions(gatedTool),
        ...createTicketBuyingToolDefinitions(gatedTool),
    ];
}
function featureGatedTool(tool, readFeatureSettings) {
    return (definition) => {
        const setting = featureSettingForToolName(definition.name);
        if (!setting) {
            return tool(definition);
        }
        return tool(withFeatureGate(definition, setting, readFeatureSettings));
    };
}
function withFeatureGate(definition, setting, readFeatureSettings) {
    const gated = { ...definition };
    const originalExecute = definition.execute;
    const originalFactory = definition.factory;
    if (typeof originalExecute === "function") {
        gated.execute = function (...args) {
            const currentSettings = readFeatureSettings();
            if (!currentSettings[setting]) {
                return featureDisabledResult(definition.name, setting, currentSettings);
            }
            return originalExecute.apply(this, args);
        };
    }
    if (typeof originalFactory === "function") {
        gated.factory = function (...args) {
            const currentSettings = readFeatureSettings();
            if (!currentSettings[setting]) {
                return disabledFactoryTool(definition, setting, currentSettings);
            }
            return originalFactory.apply(this, args);
        };
    }
    return gated;
}
function disabledFactoryTool(definition, setting, settings) {
    return {
        name: definition.name,
        label: definition.label,
        description: definition.description,
        parameters: definition.parameters,
        async execute() {
            return featureDisabledResult(definition.name, setting, settings);
        },
    };
}
function featureDisabledResult(toolName, setting, settings) {
    return {
        ok: false,
        operation: "feature_disabled",
        toolName,
        disabledFeature: featureSettingLabel(setting),
        requiredSetting: setting,
        needs_configuration: true,
        settings: featureSettingsSummary(settings),
        ...featureSettingEnableSuggestion(setting),
        message: [
            `${featureSettingLabel(setting)} is disabled in assets/private/settings.toml.`,
            `Ask to set ${setting} = true with ${PRIVATE_SETTINGS_CONFIGURE_TOOL_NAME} to enable ${toolName}.`,
        ].join(" "),
    };
}
function createClaimToolDefinitions(tool) {
    return [
        claimToolDefinition(tool, {
            ...CLAIM_TOOL_CONTRACTS.dbhopper_claim_schema,
            parameters: Type.Object({}, { additionalProperties: false }),
        }),
        claimToolDefinition(tool, {
            ...CLAIM_TOOL_CONTRACTS.dbhopper_list_claims,
            parameters: Type.Object({}, { additionalProperties: false }),
        }),
        claimToolDefinition(tool, {
            ...CLAIM_TOOL_CONTRACTS.dbhopper_prepare_claim,
            parameters: prepareClaimParameters(),
        }),
        claimToolDefinition(tool, {
            ...CLAIM_TOOL_CONTRACTS.dbhopper_validate_claim,
            parameters: Type.Object({
                claimId: Type.Optional(Type.String()),
                claim: Type.Optional(Type.Object({}, { additionalProperties: true })),
                now: Type.Optional(Type.String({
                    description: "Optional ISO timestamp for tests. Defaults to current time.",
                })),
            }, { additionalProperties: false }),
        }),
        claimToolDefinition(tool, {
            ...CLAIM_TOOL_CONTRACTS.dbhopper_browser_probe,
            parameters: Type.Object({}, { additionalProperties: false }),
        }),
        claimToolDefinition(tool, {
            ...CLAIM_TOOL_CONTRACTS.dbhopper_run_claim,
            parameters: Type.Object({
                confirm: Type.Boolean({
                    description: "Must be true only after the user explicitly confirms this operation.",
                }),
                claimId: Type.String(),
                mode: Type.Optional(Type.Union(RUN_CLAIM_MODES.map((mode) => Type.Literal(mode)), {
                    default: "dry_run",
                })),
                confirmSubmit: Type.Optional(Type.Boolean({
                    description: "Must be true only after the user explicitly confirms final submission.",
                })),
                stop_after_station_resolution: Type.Optional(Type.Boolean({
                    description: [
                        "Stop after filling and selecting station autocomplete fields.",
                        "Use this for LLM station probing before a full dry run.",
                    ].join(" "),
                })),
                check_bahnhof_suffix: Type.Optional(bahnhofSuffixType([
                    "Default station suffix probe strategy for browser station fields.",
                    "Use both to gather Hbf and Bf dropdown choices, then rerun or",
                    "ask the user when choices are ambiguous.",
                ].join(" "))),
                start_check_bahnhof_suffix: Type.Optional(bahnhofSuffixType("Optional suffix probe strategy for the departure station field.")),
                end_check_bahnhof_suffix: Type.Optional(bahnhofSuffixType("Optional suffix probe strategy for the destination station field.")),
                exact_station_departure: Type.Optional(exactStationType("Optional exact live dropdown label for the departure station.")),
                exact_station_arrival: Type.Optional(exactStationType("Optional exact live dropdown label for the arrival station.")),
                headless: Type.Optional(Type.Boolean()),
            }, { additionalProperties: false }),
        }),
    ];
}
function bahnhofSuffixType(description) {
    return Type.Union(BAHNHOF_SUFFIX_CHECKS.map((mode) => Type.Literal(mode)), { default: "both", description });
}
function exactStationType(description) {
    return Type.String({
        description: [
            description,
            "Leave empty or omit to probe dropdown choices; pass a returned live",
            "label to force and verify that exact station on a rerun.",
        ].join(" "),
    });
}
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
        const featureSetting = featureSettingForToolName(event.toolName);
        if (featureSetting && !readTopLevelSettings()[featureSetting]) {
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
        claim: Type.Object({}, { additionalProperties: true }),
        files: Type.Optional(Type.Array(Type.Object({
            role: Type.Union([
                ...CLAIM_FILE_ROLES.map((role) => Type.Literal(role)),
            ]),
            sourcePath: Type.Optional(Type.String()),
            assetName: Type.Optional(Type.String()),
            targetName: Type.Optional(Type.String()),
        }, { additionalProperties: false }))),
    }, { additionalProperties: false });
}

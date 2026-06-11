import { probeBrowser, runBrowserClaim } from "./browser.js";
import { claimSchemaReference, validateClaim } from "./validation.js";
import { claimPaths, listClaims, prepareClaim, readClaim, redactEmail, validateWorkspaceTomlFiles, writeSubmittedRecipe, } from "./workspace.js";
const SIDE_EFFECT_TOOL_NAMES = new Set([
    "dbhopper_prepare_claim",
    "dbhopper_run_claim",
]);
const CLAIM_TOOL_NAMES = new Set([
    "dbhopper_claim_schema",
    "dbhopper_list_claims",
    "dbhopper_prepare_claim",
    "dbhopper_validate_claim",
    "dbhopper_browser_probe",
    "dbhopper_run_claim",
]);
export function resolveApprovalToolNames(config = {}) {
    const mode = config.approvalMode || "all";
    if (mode === "none") {
        return new Set();
    }
    if (mode === "mutating") {
        return new Set(SIDE_EFFECT_TOOL_NAMES);
    }
    return new Set(CLAIM_TOOL_NAMES);
}
export function buildDBhopperApprovalDescription({ toolName, params = {}, }) {
    const lines = [
        "Allow this DBhopper operation for local NRW claim files or browser filing.",
        `Operation: ${toolName.replace(/^dbhopper_/, "")}`,
    ];
    const claimId = typeof params.claimId === "string" ? params.claimId : undefined;
    if (claimId) {
        lines.push(`Claim: ${claimId}`);
    }
    const mode = typeof params.mode === "string" ? params.mode : undefined;
    if (mode) {
        lines.push(`Mode: ${mode}`);
    }
    if (params.confirmSubmit === true) {
        lines.push("Submit: explicitly confirmed");
    }
    const claim = params.claim;
    if (claim?.claimant?.email) {
        lines.push(`Email: ${redactEmail(claim.claimant.email)}`);
    }
    if (claim?.journey?.startStation || claim?.journey?.endStation) {
        lines.push(`Route: ${claim.journey.startStation || "?"} -> ${claim.journey.endStation || "?"}`);
    }
    if (claim?.journey?.date) {
        lines.push(`Date: ${claim.journey.date}`);
    }
    return lines.join("\n");
}
export function createDBhopperTools(config = {}) {
    return [
        bindToolConfig(schemaTool(), config),
        bindToolConfig(listClaimsTool(), config),
        bindToolConfig(prepareClaimTool(), config),
        bindToolConfig(validateClaimTool(), config),
        bindToolConfig(browserProbeTool(), config),
        bindToolConfig(runClaimTool(), config),
    ];
}
function schemaTool() {
    return {
        name: "dbhopper_claim_schema",
        label: "DBhopper Claim Schema",
        description: "Return NRW Mobilitätsgarantie claim facts, required evidence, and the DBhopper claim TOML shape.",
        parameters: objectSchema({}),
        async execute() {
            return textResult({
                ok: true,
                operation: "claim_schema",
                research: {
                    formUrl: "https://www.mobil.nrw/fahren/mobigarantie/einreichen.html",
                    embeddedAppUrl: "https://mg.kcm-nrw.de/elmapublic/",
                    automationChoice: [
                        "No public CLI or documented stable API was found.",
                        "The live form is a React app behind a token/session handshake,",
                        "so DBhopper drives the rendered browser form.",
                    ].join(" "),
                },
                schema: claimSchemaReference(),
            });
        },
    };
}
function listClaimsTool() {
    return {
        name: "dbhopper_list_claims",
        label: "DBhopper List Claims",
        description: "List local DBhopper claims with personal fields redacted.",
        parameters: objectSchema({}),
        async execute() {
            return textResult({
                ok: true,
                operation: "list_claims",
                claims: await listClaims(this.config),
            });
        },
    };
}
function prepareClaimTool() {
    return {
        name: "dbhopper_prepare_claim",
        label: "DBhopper Prepare Claim",
        description: "Create or replace a local claim folder, copy evidence files into it, and write claim.toml.",
        parameters: objectSchema({
            confirm: confirmSchema,
            claimId: { type: "string" },
            overwrite: { type: "boolean" },
            profileName: {
                type: "string",
                description: "Optional TOML profile under assets/private/profiles/ merged in memory only.",
            },
            claim: { type: "object", additionalProperties: true },
            files: {
                type: "array",
                items: {
                    type: "object",
                    additionalProperties: false,
                    properties: {
                        role: {
                            type: "string",
                            enum: [
                                "base_ticket",
                                "substitute_receipt",
                                "delay_evidence",
                                "submission_pdf",
                                "screenshot",
                                "other",
                            ],
                        },
                        sourcePath: { type: "string" },
                        assetName: { type: "string" },
                        targetName: { type: "string" },
                        description: { type: "string" },
                    },
                    required: ["role"],
                },
            },
        }, ["confirm", "claim"]),
        async execute(_toolCallId, params) {
            try {
                const prepared = await prepareClaim(params || {}, this.config);
                return textResult({
                    ok: true,
                    operation: "prepare_claim",
                    claimId: prepared.claimId,
                    claimDir: prepared.claimDir,
                    claimPath: prepared.claimPath,
                    profileName: prepared.profileName,
                    copiedFiles: prepared.copiedFiles,
                    validation: validateClaim(prepared.claim),
                });
            }
            catch (error) {
                return errorResult("prepare_claim", error);
            }
        },
    };
}
function validateClaimTool() {
    return {
        name: "dbhopper_validate_claim",
        label: "DBhopper Validate Claim",
        description: "Validate deterministic NRW Mobilitätsgarantie eligibility checks for a claim object or claim folder.",
        parameters: objectSchema({
            claimId: { type: "string" },
            claim: { type: "object", additionalProperties: true },
            now: {
                type: "string",
                description: "Optional ISO timestamp for tests. Defaults to current time.",
            },
        }),
        async execute(_toolCallId, params) {
            try {
                if (!params?.claimId && !params?.claim) {
                    const stored = await validateWorkspaceTomlFiles(this.config);
                    return textResult({
                        ok: stored.ok,
                        operation: "validate_claim",
                        storedToml: stored,
                    });
                }
                const claim = params.claimId
                    ? (await readClaim(params.claimId, this.config)).claim
                    : params.claim || {};
                return textResult({
                    ok: true,
                    operation: "validate_claim",
                    validation: validateClaim(claim, {
                        now: params?.now ? new Date(params.now) : undefined,
                    }),
                });
            }
            catch (error) {
                return errorResult("validate_claim", error);
            }
        },
    };
}
function browserProbeTool() {
    return {
        name: "dbhopper_browser_probe",
        label: "DBhopper Browser Probe",
        description: "Open the NRW Mobilitätsgarantie form and report whether the browser automation surface is reachable.",
        parameters: objectSchema({}),
        async execute() {
            try {
                return textResult({
                    ok: true,
                    operation: "browser_probe",
                    probe: await probeBrowser(this.config),
                });
            }
            catch (error) {
                return errorResult("browser_probe", error, true);
            }
        },
    };
}
function runClaimTool() {
    return {
        name: "dbhopper_run_claim",
        label: "DBhopper Run Claim",
        description: [
            "Drive the NRW Mobilitätsgarantie browser form for a prepared claim.",
            "Dry run stops at summary; submit requires confirmSubmit.",
        ].join(" "),
        parameters: objectSchema({
            confirm: confirmSchema,
            claimId: { type: "string" },
            mode: {
                type: "string",
                enum: ["dry_run", "submit"],
                default: "dry_run",
            },
            confirmSubmit: {
                type: "boolean",
                description: "Must be true only after the user explicitly confirms final submission.",
            },
            headless: { type: "boolean" },
        }, ["confirm", "claimId"]),
        async execute(_toolCallId, params) {
            try {
                if (params?.confirm !== true) {
                    throw new Error("confirm must be true before driving the browser");
                }
                if (!params.claimId) {
                    throw new Error("claimId is required");
                }
                const prepared = await readClaim(params.claimId, this.config);
                const validation = validateClaim(prepared.claim);
                if (!validation.readyForBrowser) {
                    return textResult({
                        ok: false,
                        operation: "run_claim",
                        claimId: prepared.claimId,
                        validation,
                        needsUserAction: true,
                        message: "claim is not ready for browser filing",
                    });
                }
                if (params.mode === "submit" && !validation.readyForSubmit) {
                    return textResult({
                        ok: false,
                        operation: "run_claim",
                        claimId: prepared.claimId,
                        validation,
                        needsUserAction: true,
                        message: "claim has warnings; resolve them before submit mode",
                    });
                }
                const paths = claimPaths(prepared.claimId, this.config);
                const result = await runBrowserClaim({
                    claim: prepared.claim,
                    claimDir: paths.claimDir,
                    mode: params.mode || "dry_run",
                    confirmSubmit: params.confirmSubmit,
                    headless: params.headless ?? this.config.headless,
                    browserExecutablePath: this.config.browserExecutablePath,
                    artifactRoot: this.config.artifactRoot,
                    timeoutMs: this.config.timeoutMs,
                });
                const recipePath = result.submitted && result.ok ? await writeSubmittedRecipe(prepared) : undefined;
                return textResult({
                    ok: result.ok,
                    operation: "run_claim",
                    claimId: prepared.claimId,
                    recipePath,
                    validation,
                    result,
                    needsUserAction: result.needsUserAction,
                });
            }
            catch (error) {
                return errorResult("run_claim", error, true);
            }
        },
    };
}
function bindToolConfig(tool, config) {
    return {
        ...tool,
        config,
    };
}
function textResult(payload) {
    return {
        content: [
            {
                type: "text",
                text: JSON.stringify(payload, null, 2),
            },
        ],
        details: {
            ok: payload.ok,
            operation: payload.operation,
            needsUserAction: payload.needsUserAction ?? false,
        },
    };
}
function errorResult(operation, error, needsUserAction = false) {
    return textResult({
        ok: false,
        operation,
        error: error instanceof Error ? error.message : String(error),
        needsUserAction,
    });
}
function objectSchema(properties, required = []) {
    return {
        type: "object",
        additionalProperties: false,
        properties,
        ...(required.length ? { required } : {}),
    };
}
const confirmSchema = {
    type: "boolean",
    const: true,
    description: "Must be true only after the user explicitly confirms this operation.",
};

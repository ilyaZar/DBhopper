import type { DBhopperConfig, DBhopperClaim } from "./types.js";
import {
  CLAIM_FILE_ROLES,
  CLAIM_TOOL_CONTRACTS,
  CLAIM_TOOL_NAMES,
  RUN_CLAIM_MODES,
  SIDE_EFFECT_CLAIM_TOOL_NAMES,
} from "./claim-tool-contracts.js";
import { PRIVATE_SETTINGS_CONFIGURE_TOOL_NAME } from "./tool-contracts.js";
import {
  BAHNHOF_SUFFIX_CHECKS,
  probeBrowser,
  runBrowserClaim,
  type BahnhofSuffixCheck,
} from "./browser.js";
import { claimSchemaReference, validateClaim } from "./validation.js";
import { errorMessage } from "./errors.js";
import {
  claimPaths,
  listClaims,
  prepareClaim,
  readClaim,
  redactEmail,
  validateWorkspaceTomlFiles,
  writeSubmittedRecipe,
  type PrepareClaimParams,
} from "./workspace.js";

const SIDE_EFFECT_TOOL_NAMES = new Set<string>([
  ...SIDE_EFFECT_CLAIM_TOOL_NAMES,
  PRIVATE_SETTINGS_CONFIGURE_TOOL_NAME,
]);
const CLAIM_TOOL_NAME_SET = new Set<string>([
  ...CLAIM_TOOL_NAMES,
  PRIVATE_SETTINGS_CONFIGURE_TOOL_NAME,
]);

export function resolveApprovalToolNames(config: DBhopperConfig = {}) {
  const mode = config.approvalMode || "all";
  if (mode === "none") {
    return new Set<string>();
  }
  if (mode === "mutating") {
    return new Set(SIDE_EFFECT_TOOL_NAMES);
  }
  return new Set(CLAIM_TOOL_NAME_SET);
}

export function buildDBhopperApprovalDescription({
  toolName,
  params = {},
}: {
  toolName: string;
  params?: Record<string, unknown>;
}) {
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
  if (typeof params.check_bahnhof_suffix === "string") {
    lines.push(`Station suffix check: ${params.check_bahnhof_suffix}`);
  }
  if (params.confirm === true) {
    lines.push("Settings change: explicitly confirmed");
  }

  const claim = params.claim as DBhopperClaim | undefined;
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

export function createDBhopperTools(config: DBhopperConfig = {}) {
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
    ...CLAIM_TOOL_CONTRACTS.dbhopper_claim_schema,
    parameters: objectSchema({}),
    async execute(this: { config: DBhopperConfig }) {
      return textResult({
        ok: true,
        operation: "claim_schema",
        research: {
          formUrl: "https://www.mobil.nrw/fahren/mobigarantie/einreichen.html",
          automationChoice:
            [
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
    ...CLAIM_TOOL_CONTRACTS.dbhopper_list_claims,
    parameters: objectSchema({}),
    async execute(this: { config: DBhopperConfig }) {
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
    ...CLAIM_TOOL_CONTRACTS.dbhopper_prepare_claim,
    parameters: objectSchema(
      {
        confirm: confirmSchema,
        claimId: { type: "string" },
        overwrite: { type: "boolean" },
        claim: { type: "object", additionalProperties: true },
        files: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              role: {
                type: "string",
                enum: [...CLAIM_FILE_ROLES],
              },
              sourcePath: { type: "string" },
              assetName: { type: "string" },
              targetName: { type: "string" },
            },
            required: ["role"],
          },
        },
      },
      ["confirm", "claim"],
    ),
    async execute(
      this: { config: DBhopperConfig },
      _toolCallId: string,
      params: PrepareClaimParams,
    ) {
      try {
        const prepared = await prepareClaim(params || {}, this.config);
        return textResult({
          ok: true,
          operation: "prepare_claim",
          claimId: prepared.claimId,
          claimDir: prepared.claimDir,
          claimPath: prepared.claimPath,
          profileId: prepared.profileId,
          profileFile: prepared.profileFile,
          copiedFiles: prepared.copiedFiles,
          validation: validateClaim(prepared.claim),
        });
      } catch (error) {
        return errorResult("prepare_claim", error);
      }
    },
  };
}

function validateClaimTool() {
  return {
    ...CLAIM_TOOL_CONTRACTS.dbhopper_validate_claim,
    parameters: objectSchema({
      claimId: { type: "string" },
      claim: { type: "object", additionalProperties: true },
      now: {
        type: "string",
        description: "Optional ISO timestamp for tests. Defaults to current time.",
      },
    }),
    async execute(
      this: { config: DBhopperConfig },
      _toolCallId: string,
      params: { claimId?: string; claim?: DBhopperClaim; now?: string },
    ) {
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
      } catch (error) {
        return errorResult("validate_claim", error);
      }
    },
  };
}

function browserProbeTool() {
  return {
    ...CLAIM_TOOL_CONTRACTS.dbhopper_browser_probe,
    parameters: objectSchema({}),
    async execute(this: { config: DBhopperConfig }) {
      try {
        return textResult({
          ok: true,
          operation: "browser_probe",
          probe: await probeBrowser(this.config),
        });
      } catch (error) {
        return errorResult("browser_probe", error, true);
      }
    },
  };
}

function runClaimTool() {
  return {
    ...CLAIM_TOOL_CONTRACTS.dbhopper_run_claim,
    parameters: objectSchema(
      {
        confirm: confirmSchema,
        claimId: { type: "string" },
        mode: {
          type: "string",
          enum: [...RUN_CLAIM_MODES],
          default: "dry_run",
        },
        confirmSubmit: {
          type: "boolean",
          description: "Must be true only after the user explicitly confirms final submission.",
        },
        stop_after_station_resolution: {
          type: "boolean",
          description:
            [
              "Stop after filling and selecting station autocomplete fields.",
              "Use this for LLM station probing before a full dry run.",
            ].join(" "),
        },
        check_bahnhof_suffix: bahnhofSuffixSchema(
          [
            "Default station suffix probe strategy for browser station fields.",
            "Use both to gather Hbf and Bf dropdown choices, then rerun or ask",
            "the user when choices are ambiguous.",
          ].join(" "),
        ),
        start_check_bahnhof_suffix: bahnhofSuffixSchema(
          "Optional suffix probe strategy for the departure station field.",
        ),
        end_check_bahnhof_suffix: bahnhofSuffixSchema(
          "Optional suffix probe strategy for the destination station field.",
        ),
        exact_station_departure: exactStationSchema(
          "Optional exact live dropdown label for the departure station.",
        ),
        exact_station_arrival: exactStationSchema(
          "Optional exact live dropdown label for the arrival station.",
        ),
        headless: { type: "boolean" },
      },
      ["confirm", "claimId"],
    ),
    async execute(
      this: { config: DBhopperConfig },
      _toolCallId: string,
      params: {
        confirm?: boolean;
        claimId?: string;
        mode?: "dry_run" | "submit";
        confirmSubmit?: boolean;
        stop_after_station_resolution?: boolean;
        check_bahnhof_suffix?: BahnhofSuffixCheck;
        start_check_bahnhof_suffix?: BahnhofSuffixCheck;
        end_check_bahnhof_suffix?: BahnhofSuffixCheck;
        exact_station_departure?: string;
        exact_station_arrival?: string;
        headless?: boolean;
      },
    ) {
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

        const result = await runBrowserClaim({
          claim: prepared.claim,
          claimDir: prepared.claimDir,
          mode: params.mode || "dry_run",
          confirmSubmit: params.confirmSubmit,
          stopAfterStationResolution: params.stop_after_station_resolution,
          checkBahnhofSuffix: params.check_bahnhof_suffix,
          startCheckBahnhofSuffix: params.start_check_bahnhof_suffix,
          endCheckBahnhofSuffix: params.end_check_bahnhof_suffix,
          exactStationDeparture: params.exact_station_departure,
          exactStationArrival: params.exact_station_arrival,
          headless: params.headless ?? this.config.headless,
          browserExecutablePath: this.config.browserExecutablePath,
          artifactRoot: this.config.artifactRoot,
          timeoutMs: this.config.timeoutMs,
        });
        const recipePath =
          result.submitted && result.ok ? await writeSubmittedRecipe(prepared) : undefined;
        return textResult({
          ok: result.ok,
          operation: "run_claim",
          claimId: prepared.claimId,
          recipePath,
          validation,
          result,
          needsUserAction: result.needsUserAction,
        });
      } catch (error) {
        return errorResult("run_claim", error, true);
      }
    },
  };
}

function exactStationSchema(description: string) {
  return {
    type: "string",
    description:
      [
        description,
        "Leave empty or omit to probe dropdown choices; pass a returned live",
        "label to force and verify that exact station on a rerun.",
      ].join(" "),
  };
}

function bahnhofSuffixSchema(description: string) {
  return {
    type: "string",
    enum: [...BAHNHOF_SUFFIX_CHECKS],
    default: "both",
    description,
  };
}

function bindToolConfig(tool: any, config: DBhopperConfig) {
  return {
    ...tool,
    config,
  };
}

function textResult(payload: Record<string, unknown>) {
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

function errorResult(operation: string, error: unknown, needsUserAction = false) {
  return textResult({
    ok: false,
    operation,
    error: errorMessage(error),
    needsUserAction,
  });
}

function objectSchema(properties: Record<string, unknown>, required: string[] = []) {
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

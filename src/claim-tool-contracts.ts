export const CLAIM_FILE_ROLES = [
  "base_ticket",
  "substitute_receipt",
  "delay_evidence",
  "submission_pdf",
  "screenshot",
  "other",
] as const;

export const RUN_CLAIM_MODES = ["dry_run", "submit"] as const;

export const CLAIM_TOOL_NAMES = [
  "dbhopper_claim_schema",
  "dbhopper_list_claims",
  "dbhopper_prepare_claim",
  "dbhopper_validate_claim",
  "dbhopper_browser_probe",
  "dbhopper_run_claim",
] as const;

export const SIDE_EFFECT_CLAIM_TOOL_NAMES = [
  "dbhopper_prepare_claim",
  "dbhopper_run_claim",
] as const;

export const CLAIM_TOOL_CONTRACTS = {
  dbhopper_claim_schema: {
    name: "dbhopper_claim_schema",
    label: "DBhopper Claim Schema",
    description:
      "Return NRW Mobilitätsgarantie claim facts, required evidence, and the DBhopper claim TOML shape.",
  },
  dbhopper_list_claims: {
    name: "dbhopper_list_claims",
    label: "DBhopper List Claims",
    description: "List local DBhopper claims with personal fields redacted.",
  },
  dbhopper_prepare_claim: {
    name: "dbhopper_prepare_claim",
    label: "DBhopper Prepare Claim",
    description:
      "Create or replace a local claim folder, copy evidence files into it, and write claim.toml.",
  },
  dbhopper_validate_claim: {
    name: "dbhopper_validate_claim",
    label: "DBhopper Validate Claim",
    description:
      "Validate deterministic NRW Mobilitätsgarantie eligibility checks for a claim object or claim folder.",
  },
  dbhopper_browser_probe: {
    name: "dbhopper_browser_probe",
    label: "DBhopper Browser Probe",
    description:
      "Open the NRW Mobilitätsgarantie form and report whether the browser automation surface is reachable.",
  },
  dbhopper_run_claim: {
    name: "dbhopper_run_claim",
    label: "DBhopper Run Claim",
    description:
      [
        "Drive the NRW Mobilitätsgarantie browser form for a prepared claim.",
        "Dry run stops at summary; submit requires confirmSubmit.",
      ].join(" "),
  },
} as const;

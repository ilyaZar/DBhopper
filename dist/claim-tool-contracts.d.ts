export declare const CLAIM_FILE_ROLES: readonly ["base_ticket", "substitute_receipt", "delay_evidence", "submission_pdf", "screenshot", "other"];
export declare const RUN_CLAIM_MODES: readonly ["dry_run", "submit"];
export declare const CLAIM_TOOL_NAMES: readonly ["dbhopper_claim_schema", "dbhopper_list_claims", "dbhopper_prepare_claim", "dbhopper_validate_claim", "dbhopper_browser_probe", "dbhopper_run_claim"];
export declare const SIDE_EFFECT_CLAIM_TOOL_NAMES: readonly ["dbhopper_prepare_claim", "dbhopper_run_claim"];
export declare const CLAIM_TOOL_CONTRACTS: {
    readonly dbhopper_claim_schema: {
        readonly name: "dbhopper_claim_schema";
        readonly label: "DBhopper Claim Schema";
        readonly description: "Return NRW Mobilitätsgarantie claim facts, required evidence, and the DBhopper claim TOML shape.";
    };
    readonly dbhopper_list_claims: {
        readonly name: "dbhopper_list_claims";
        readonly label: "DBhopper List Claims";
        readonly description: "List local DBhopper claims with personal fields redacted.";
    };
    readonly dbhopper_prepare_claim: {
        readonly name: "dbhopper_prepare_claim";
        readonly label: "DBhopper Prepare Claim";
        readonly description: "Create or replace a local claim folder, copy evidence files into it, and write claim.toml.";
    };
    readonly dbhopper_validate_claim: {
        readonly name: "dbhopper_validate_claim";
        readonly label: "DBhopper Validate Claim";
        readonly description: "Validate deterministic NRW Mobilitätsgarantie eligibility checks for a claim object or claim folder.";
    };
    readonly dbhopper_browser_probe: {
        readonly name: "dbhopper_browser_probe";
        readonly label: "DBhopper Browser Probe";
        readonly description: "Open the NRW Mobilitätsgarantie form and report whether the browser automation surface is reachable.";
    };
    readonly dbhopper_run_claim: {
        readonly name: "dbhopper_run_claim";
        readonly label: "DBhopper Run Claim";
        readonly description: string;
    };
};

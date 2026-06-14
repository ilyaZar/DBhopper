export interface DBhopperFeatureSettings {
    use_delay_retrieval: boolean;
    use_claim_requests: boolean;
    use_ticket_buying: boolean;
}
export type DBhopperFeatureSettingName = keyof DBhopperFeatureSettings;
export declare const DEFAULT_FEATURE_SETTINGS: DBhopperFeatureSettings;
export declare const CLAIM_TOOL_NAMES: readonly ["dbhopper_claim_schema", "dbhopper_list_claims", "dbhopper_prepare_claim", "dbhopper_validate_claim", "dbhopper_browser_probe", "dbhopper_run_claim"];
export declare const DELAY_RETRIEVAL_TOOL_NAMES: readonly ["dbhopper_db_marketplace_access_check", "dbhopper_db_api_credential_probe", "dbhopper_db_delay_research", "dbhopper_query_db_delay"];
export declare const TICKET_BUYING_TOOL_NAMES: readonly ["dbhopper_db_standard_login_check", "dbhopper_ticket_buying_research", "dbhopper_ticket_buying_dry_run", "dbhopper_ticket_checkout_dry_run"];
export declare function readTopLevelSettings(packageRoot?: string): DBhopperFeatureSettings;
export declare function parseTopLevelSettings(source: string, sourceName?: string): DBhopperFeatureSettings;
export declare function enabledToolNames(settings: DBhopperFeatureSettings): Set<string>;
export declare function featureSettingForToolName(toolName: string): keyof DBhopperFeatureSettings | undefined;
export declare function featureSettingLabel(setting: DBhopperFeatureSettingName): "autonomous claims" | "delay retrieval" | "autonomous ticket buying";
export declare function featureSettingsSummary(settings: DBhopperFeatureSettings): {
    delay_retrieval: boolean;
    autonomous_claims: boolean;
    autonomous_ticket_buying: boolean;
};

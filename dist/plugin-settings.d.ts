export interface DBhopperFeatureSettings {
    use_delay_retrieval: boolean;
    use_claim_requests: boolean;
    use_ticket_purchase: boolean;
}
export type DBhopperFeatureSettingName = keyof DBhopperFeatureSettings;
export declare const DEFAULT_FEATURE_SETTINGS: DBhopperFeatureSettings;
export declare function readTopLevelSettings(packageRoot?: string): DBhopperFeatureSettings;
export declare function parseTopLevelSettings(source: string, sourceName?: string): DBhopperFeatureSettings;
export declare function enabledToolNames(settings: DBhopperFeatureSettings): Set<string>;
export declare function featureSettingForToolName(toolName: string): keyof DBhopperFeatureSettings | undefined;
export declare function featureSettingLabel(setting: DBhopperFeatureSettingName): "autonomous claims" | "delay retrieval" | "autonomous ticket purchase";
export declare function featureSettingsSummary(settings: DBhopperFeatureSettings): {
    delay_retrieval: boolean;
    autonomous_claims: boolean;
    autonomous_ticket_purchase: boolean;
};

export declare const DELAY_PROVIDERS: readonly ["auto", "db-timetables", "bahn-web"];
export declare const SELECTED_DELAY_PROVIDERS: readonly ["db-timetables", "bahn-web"];
export declare const DELAY_FALLBACKS: readonly ["none", "db-timetables", "bahn-web"];
export declare const BAHN_WEB_TRANSPORTS: readonly ["auto", "fetch", "curl", "browser"];
export type DBhopperDelayProviderSetting = (typeof DELAY_PROVIDERS)[number];
export type DBhopperSelectedDelayProvider = (typeof SELECTED_DELAY_PROVIDERS)[number];
export type DBhopperDelayFallbackSetting = (typeof DELAY_FALLBACKS)[number];
export type BahnWebTransport = (typeof BAHN_WEB_TRANSPORTS)[number];

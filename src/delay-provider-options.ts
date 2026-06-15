export const DELAY_PROVIDERS = ["auto", "db-timetables", "bahn-web"] as const;
export const SELECTED_DELAY_PROVIDERS = ["db-timetables", "bahn-web"] as const;
export const DELAY_FALLBACKS = ["none", ...SELECTED_DELAY_PROVIDERS] as const;
export const BAHN_WEB_TRANSPORTS = ["auto", "fetch", "curl", "browser"] as const;

export type DBhopperDelayProviderSetting = (typeof DELAY_PROVIDERS)[number];
export type DBhopperSelectedDelayProvider =
  (typeof SELECTED_DELAY_PROVIDERS)[number];
export type DBhopperDelayFallbackSetting = (typeof DELAY_FALLBACKS)[number];
export type BahnWebTransport = (typeof BAHN_WEB_TRANSPORTS)[number];

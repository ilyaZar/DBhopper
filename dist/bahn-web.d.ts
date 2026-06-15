import type { DBhopperConfig } from "./types.js";
import { type ApiProvider, type Journey, type StationEvent, type StationRef, type TimeWindow } from "./db-delay.js";
export declare const BAHN_WEB_SOURCE_API = "bahn-web";
export declare const DEFAULT_BAHN_WEB_BASE_URL = "https://int.bahn.de/web/api";
export declare const BAHN_WEB_FALLBACK_BASE_URL = "https://www.bahn.de/web/api";
export declare const DEFAULT_BAHN_WEB_TRANSPORT = "auto";
export declare const DEFAULT_BAHN_WEB_REQUEST_TIMEOUT_MS = 20000;
export type { BahnWebTransport } from "./delay-provider-options.js";
export interface BahnWebProviderOptions extends DBhopperConfig {
    signal?: AbortSignal;
    fetchImpl?: typeof fetch;
    curlPath?: string;
}
export declare const BAHN_WEB_RESEARCH_SUMMARY: {
    source: string;
    endpoints: string[];
    defaultBaseUrl: string;
    fallbackBaseUrl: string;
    limitations: string[];
};
export declare function createBahnWebProvider(options?: BahnWebProviderOptions): ApiProvider;
export declare function resolveBahnWebStation(name: string, options?: BahnWebProviderOptions): Promise<StationRef[]>;
export declare function queryBahnWebStationBoard(station: StationRef, timeWindow: TimeWindow, options?: BahnWebProviderOptions): Promise<StationEvent[]>;
export declare function fetchBahnWebJourneyDetails(event: StationEvent): Promise<Journey>;
export declare function parseBahnWebStations(raw: unknown): StationRef[];
export declare function parseBahnWebDepartures(raw: unknown, boardStation: StationRef, timeZone?: string): StationEvent[];

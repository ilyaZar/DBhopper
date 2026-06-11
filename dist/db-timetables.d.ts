import type { DBhopperConfig } from "./types.js";
import { type ApiProvider, type Journey, type StationEvent, type StationRef, type TimeWindow } from "./db-delay.js";
export declare const DEFAULT_TIMETABLE_BASE_URL = "https://apis.deutschebahn.com/db-api-marketplace/apis/timetables/v1";
export declare const DEFAULT_DELAY_LOOKBACK_MINUTES = 180;
export declare const DEFAULT_REQUEST_TIMEOUT_MS = 20000;
export interface TimetablesProviderOptions extends DBhopperConfig {
    signal?: AbortSignal;
}
export declare const DB_DELAY_RESEARCH_SUMMARY: {
    recommendedStack: string[];
    officialDocs: string[];
    timetableEndpoints: string[];
    limitations: string[];
};
export declare function createTimetablesProvider(options?: TimetablesProviderOptions): ApiProvider;
export declare function resolveStation(name: string, options?: TimetablesProviderOptions): Promise<StationRef[]>;
export declare function queryStationBoard(station: StationRef, timeWindow: TimeWindow, options?: TimetablesProviderOptions): Promise<StationEvent[]>;
export declare function fetchJourneyDetails(event: StationEvent): Promise<Journey>;
export declare function timetablesConfigStatus(options?: TimetablesProviderOptions): {
    configured: boolean;
    hasClientId: boolean;
    hasApiKey: boolean;
    baseUrl: string;
};

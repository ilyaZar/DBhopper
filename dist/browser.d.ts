import type { Browser } from "playwright-core";
import type { DBhopperClaim, DBhopperConfig } from "./types.js";
export interface BrowserRunParams {
    claim: DBhopperClaim;
    claimDir: string;
    mode?: "dry_run" | "submit";
    confirmSubmit?: boolean;
    stopAfterStationResolution?: boolean;
    checkBahnhofSuffix?: BahnhofSuffixCheck;
    startCheckBahnhofSuffix?: BahnhofSuffixCheck;
    endCheckBahnhofSuffix?: BahnhofSuffixCheck;
    exactStationDeparture?: string;
    exactStationArrival?: string;
    headless?: boolean;
    browserExecutablePath?: string;
    artifactRoot?: string;
    timeoutMs?: number;
}
export interface BrowserRunResult {
    ok: boolean;
    mode: "dry_run" | "submit";
    stage: string;
    claimDir: string;
    artifactDir: string;
    artifacts: string[];
    entryFlow: BrowserEntryFlow;
    stationSelections: StationSelection[];
    summaryScreenshot?: string;
    submitted: boolean;
    needsUserAction: boolean;
    message: string;
}
export interface BrowserEntryFlow {
    entryUrl: string;
    formPageUrl: string;
    startedAtPublicEntry: boolean;
    storedEntryCookieServices: boolean;
    acceptedFormConsent: boolean;
}
export interface StationSelection {
    field: "startStation" | "endStation";
    input: string;
    checkBahnhofSuffix: BahnhofSuffixCheck;
    candidatesTried: string[];
    dropdownChoices: string[];
    probeChoices?: Array<{
        candidate: string;
        choices: string[];
    }>;
    selected?: string;
    matched: boolean;
}
export declare const BAHNHOF_SUFFIX_CHECKS: readonly ["both", "hbf_only", "bf_only"];
export type BahnhofSuffixCheck = typeof BAHNHOF_SUFFIX_CHECKS[number];
export declare function probeBrowser(config?: DBhopperConfig): Promise<{
    ok: boolean;
    url: string;
    title: string;
    controls: {
        tag: string;
        id: string | undefined;
        name: string | undefined;
        type: string | undefined;
        text: string;
        visible: boolean;
    }[];
}>;
export declare function runBrowserClaim(params: BrowserRunParams): Promise<BrowserRunResult>;
export declare function launchBrowser(config: DBhopperConfig | BrowserRunParams): Promise<Browser>;
export declare function resolveBrowserExecutablePath(config: DBhopperConfig | BrowserRunParams): Promise<string>;
export declare function normalizePhoneForBrowser(value?: string): string | undefined;
export declare function normalizeIbanForBrowser(value?: string): string | undefined;
export declare function stationAutocompleteCandidates(value: string, checkBahnhofSuffix?: BahnhofSuffixCheck): string[];

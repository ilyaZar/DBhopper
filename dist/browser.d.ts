import type { DBhopperClaim, DBhopperConfig } from "./types.js";
export interface BrowserRunParams {
    claim: DBhopperClaim;
    claimDir: string;
    mode?: "dry_run" | "submit";
    confirmSubmit?: boolean;
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
    submitted: boolean;
    needsUserAction: boolean;
    message: string;
}
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

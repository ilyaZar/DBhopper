import type { BrowserContext, Page } from "playwright-core";
import type { LoadedCredentialsProfile } from "./credentials.js";
import type { DBhopperConfig } from "./types.js";
export interface BrowserAccessParams {
    headless?: boolean;
    screenshots?: boolean;
    slow_mo_ms?: number;
}
export interface BrowserAccessSession {
    context: BrowserContext;
    page: Page;
    executablePath: string;
    userDataDir: string;
    artifactDir?: string;
}
export declare const DB_STANDARD_HOME_URL = "https://int.bahn.de/en";
export declare const DB_MARKETPLACE_LOGIN_URL = "https://developers.deutschebahn.com/db-api-marketplace/apis/user/login";
export declare const DB_MARKETPLACE_TIMETABLES_URL = "https://developers.deutschebahn.com/db-api-marketplace/apis/product/timetables";
export declare function openCredentialBrowserSession(params: BrowserAccessParams, config: DBhopperConfig, loadedCredentials: LoadedCredentialsProfile, artifactPrefix: string): Promise<BrowserAccessSession>;
export declare function resolveCredentialUserDataDir(config: DBhopperConfig, loadedCredentials: LoadedCredentialsProfile | undefined): string | undefined;
export declare function captureAccessStage(page: Page, artifactDir: string | undefined, label: string, artifacts: string[]): Promise<void>;
export declare function pageAccessState(page: Page): Promise<{
    title: string;
    url: {
        origin: string;
        pathname: string;
    };
    flags: {
        hasLoginText: boolean;
        hasLogoutText: boolean;
        hasAccountText: boolean;
        hasMarketplaceText: boolean;
        hasPasswordField: boolean;
        hasUserActionText: boolean;
        hasErrorText: boolean;
    };
}>;

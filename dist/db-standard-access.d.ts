import { type BrowserAccessParams } from "./access-browser.js";
import type { DBhopperConfig } from "./types.js";
export interface DbStandardLoginCheckParams extends BrowserAccessParams {
    credentials_profile?: string;
    stay_logged_in?: boolean;
}
export declare function runDbStandardLoginCheck(params: DbStandardLoginCheckParams, config?: DBhopperConfig, signal?: AbortSignal): Promise<{
    ok: boolean;
    operation: string;
    needsUserAction: boolean;
    message: string;
    credentials: {
        configured: boolean;
        credentialsName: undefined;
        hasDbApiCredentials: boolean;
        hasDbApiAccountCredentials: boolean;
        hasBahnAccountCredentials: boolean;
        hasBrowserUserDataDir: boolean;
        credentialsId?: undefined;
    } | {
        configured: boolean;
        credentialsName: string;
        credentialsId: string | undefined;
        hasDbApiCredentials: boolean;
        hasDbApiAccountCredentials: boolean;
        hasBahnAccountCredentials: boolean;
        hasBrowserUserDataDir: boolean;
    };
    purchaseSubmitted: boolean;
    registrationSubmitted: boolean;
    accessPath?: undefined;
    startUrl?: undefined;
    credentialSubmission?: undefined;
    login?: undefined;
    pageState?: undefined;
    browser?: undefined;
    artifactDir?: undefined;
    artifacts?: undefined;
} | {
    ok: boolean;
    operation: string;
    accessPath: string;
    startUrl: string;
    credentials: {
        configured: boolean;
        credentialsName: undefined;
        hasDbApiCredentials: boolean;
        hasDbApiAccountCredentials: boolean;
        hasBahnAccountCredentials: boolean;
        hasBrowserUserDataDir: boolean;
        credentialsId?: undefined;
    } | {
        configured: boolean;
        credentialsName: string;
        credentialsId: string | undefined;
        hasDbApiCredentials: boolean;
        hasDbApiAccountCredentials: boolean;
        hasBahnAccountCredentials: boolean;
        hasBrowserUserDataDir: boolean;
    };
    credentialSubmission: {
        selectedCredentialsSubmitted: boolean;
        usernameSubmitted: boolean;
        passwordSubmitted: boolean;
        proof: "selected_credentials_submitted" | "not_proven_existing_session" | "not_proven_missing_login_form" | "not_proven_blocked_by_user_action";
    };
    login: import("./db-login.js").DBAccountLoginResult;
    pageState: {
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
    };
    browser: {
        executablePath: string;
        userDataDir: string;
    };
    artifactDir: string | undefined;
    artifacts: string[];
    needsUserAction: boolean;
    purchaseSubmitted: boolean;
    registrationSubmitted: boolean;
    message?: undefined;
} | {
    ok: boolean;
    operation: string;
    accessPath: string;
    credentials: {
        configured: boolean;
        credentialsName: undefined;
        hasDbApiCredentials: boolean;
        hasDbApiAccountCredentials: boolean;
        hasBahnAccountCredentials: boolean;
        hasBrowserUserDataDir: boolean;
        credentialsId?: undefined;
    } | {
        configured: boolean;
        credentialsName: string;
        credentialsId: string | undefined;
        hasDbApiCredentials: boolean;
        hasDbApiAccountCredentials: boolean;
        hasBahnAccountCredentials: boolean;
        hasBrowserUserDataDir: boolean;
    };
    message: string;
    artifactDir: string | undefined;
    artifacts: string[];
    needsUserAction: boolean;
    purchaseSubmitted: boolean;
    registrationSubmitted: boolean;
    startUrl?: undefined;
    credentialSubmission?: undefined;
    login?: undefined;
    pageState?: undefined;
    browser?: undefined;
}>;

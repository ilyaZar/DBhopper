import { type BrowserAccessParams } from "./access-browser.js";
import type { DBhopperConfig } from "./types.js";
export interface DbMarketplaceAccessCheckParams extends BrowserAccessParams {
    stay_logged_in?: boolean;
}
export declare function runDbMarketplaceAccessCheck(params: DbMarketplaceAccessCheckParams, config?: DBhopperConfig, signal?: AbortSignal): Promise<{
    ok: boolean;
    operation: string;
    needsUserAction: boolean;
    message: string;
    credentials: {
        configured: boolean;
        credentialsName: undefined;
        hasBahnAPICredentials: boolean;
        hasBahnAccountCredentials: boolean;
        hasBahnAccountAPICredentials: boolean;
        hasBrowserUserDataDir: boolean;
        credentialsId?: undefined;
    } | {
        configured: boolean;
        credentialsName: string;
        credentialsId: string | undefined;
        hasBahnAPICredentials: boolean;
        hasBahnAccountCredentials: boolean;
        hasBahnAccountAPICredentials: boolean;
        hasBrowserUserDataDir: boolean;
    };
    appCreated: boolean;
    subscriptionChanged: boolean;
    accessPath?: undefined;
    startUrl?: undefined;
    productUrl?: undefined;
    credentialModel?: undefined;
    credentialSubmission?: undefined;
    login?: undefined;
    loginPageState?: undefined;
    productPageState?: undefined;
    reachable?: undefined;
    accountGateClicked?: undefined;
    browser?: undefined;
    artifactDir?: undefined;
    artifacts?: undefined;
    termsAccepted?: undefined;
} | {
    ok: boolean;
    operation: string;
    accessPath: string;
    startUrl: string;
    productUrl: string;
    credentials: {
        configured: boolean;
        credentialsName: undefined;
        hasBahnAPICredentials: boolean;
        hasBahnAccountCredentials: boolean;
        hasBahnAccountAPICredentials: boolean;
        hasBrowserUserDataDir: boolean;
        credentialsId?: undefined;
    } | {
        configured: boolean;
        credentialsName: string;
        credentialsId: string | undefined;
        hasBahnAPICredentials: boolean;
        hasBahnAccountCredentials: boolean;
        hasBahnAccountAPICredentials: boolean;
        hasBrowserUserDataDir: boolean;
    };
    credentialModel: {
        apiKeyCredentialsPresent: boolean;
        schemaSufficientForBrowserLogin: boolean;
        browserLoginCredentialSource: string;
        schemaRecommendation: string | undefined;
    };
    credentialSubmission: {
        selectedCredentialsSubmitted: boolean;
        proof: string;
        credentialRejected: boolean | undefined;
        credentialRejectionStage: import("./db-login.js").CredentialRejectionStage | undefined;
        credentialRejectionReason: import("./db-login.js").CredentialRejectionReason | undefined;
        usernameRejected: boolean | undefined;
        usernameRejectionReason: import("./db-login.js").UsernameRejectionReason | undefined;
        passwordRejected: boolean | undefined;
        passwordRejectionReason: import("./db-login.js").PasswordRejectionReason | undefined;
        credentialCombinationRejected: boolean | undefined;
    };
    login: import("./db-login.js").DBAccountLoginResult | {
        requested: false;
        message: string;
    };
    loginPageState: {
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
    productPageState: {
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
    reachable: {
        loginPage: boolean;
        timetablesProductPage: boolean;
    };
    accountGateClicked: boolean;
    browser: {
        executablePath: string;
        userDataDir: string;
    };
    artifactDir: string | undefined;
    artifacts: string[];
    needsUserAction: boolean;
    appCreated: boolean;
    subscriptionChanged: boolean;
    termsAccepted: boolean;
    message?: undefined;
} | {
    ok: boolean;
    operation: string;
    accessPath: string;
    credentials: {
        configured: boolean;
        credentialsName: undefined;
        hasBahnAPICredentials: boolean;
        hasBahnAccountCredentials: boolean;
        hasBahnAccountAPICredentials: boolean;
        hasBrowserUserDataDir: boolean;
        credentialsId?: undefined;
    } | {
        configured: boolean;
        credentialsName: string;
        credentialsId: string | undefined;
        hasBahnAPICredentials: boolean;
        hasBahnAccountCredentials: boolean;
        hasBahnAccountAPICredentials: boolean;
        hasBrowserUserDataDir: boolean;
    };
    message: string;
    artifactDir: string | undefined;
    artifacts: string[];
    needsUserAction: boolean;
    appCreated: boolean;
    subscriptionChanged: boolean;
    termsAccepted: boolean;
    startUrl?: undefined;
    productUrl?: undefined;
    credentialModel?: undefined;
    credentialSubmission?: undefined;
    login?: undefined;
    loginPageState?: undefined;
    productPageState?: undefined;
    reachable?: undefined;
    accountGateClicked?: undefined;
    browser?: undefined;
}>;

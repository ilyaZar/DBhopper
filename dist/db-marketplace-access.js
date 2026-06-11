import path from "node:path";
import { DB_MARKETPLACE_LOGIN_URL, DB_MARKETPLACE_TIMETABLES_URL, captureAccessStage, openCredentialBrowserSession, pageAccessState, } from "./access-browser.js";
import { credentialsSummary, readSelectedCredentialsProfile, } from "./credentials.js";
import { performDbAccountLogin } from "./db-login.js";
import { resolveWorkspace } from "./workspace.js";
export async function runDbMarketplaceAccessCheck(params, config = {}, signal) {
    const artifacts = [];
    const loadedCredentials = await readSelectedCredentialsProfile(config, params.credentials_profile);
    if (!loadedCredentials) {
        return {
            ok: false,
            operation: "db_marketplace_access_check",
            needsUserAction: true,
            message: "no selected credentials profile is configured",
            credentials: credentialsSummary(loadedCredentials),
            appCreated: false,
            subscriptionChanged: false,
        };
    }
    let session;
    try {
        session = await openCredentialBrowserSession(params, config, loadedCredentials, "db-marketplace-access-check");
        session.page.setDefaultTimeout(25000);
        session.page.setDefaultNavigationTimeout(45000);
        if (signal?.aborted) {
            throw new Error("DB API Marketplace access check was aborted");
        }
        const credentialModel = marketplaceCredentialModel(loadedCredentials.credentials, params.allow_bahn_account_fallback === true);
        await session.page.goto(DB_MARKETPLACE_LOGIN_URL, {
            waitUntil: "domcontentloaded",
        });
        await session.page.waitForTimeout(2500);
        await captureAccessStage(session.page, session.artifactDir, "marketplace-login", artifacts);
        const loginPageState = await pageAccessState(session.page);
        let login;
        if (new URL(session.page.url()).hostname === "accounts.bahn.de") {
            login = await performDbAccountLogin(session.page, credentialModel.credentialsForSubmission, {
                stayLoggedIn: params.stay_logged_in !== false,
                requireCredentialEntry: true,
            });
            await captureAccessStage(session.page, session.artifactDir, "after-login", artifacts);
        }
        else {
            login = {
                requested: false,
                message: "Marketplace login page did not expose DB account credential fields without an additional legal/account gate",
            };
        }
        await session.page.goto(DB_MARKETPLACE_TIMETABLES_URL, {
            waitUntil: "domcontentloaded",
        });
        await session.page.waitForTimeout(2500);
        await captureAccessStage(session.page, session.artifactDir, "timetables-product", artifacts);
        const productPageState = await pageAccessState(session.page);
        const loginSubmitted = "selectedCredentialsSubmitted" in login && login.selectedCredentialsSubmitted;
        return {
            ok: productPageState.flags.hasMarketplaceText,
            operation: "db_marketplace_access_check",
            accessPath: "db_api_marketplace_browser",
            startUrl: DB_MARKETPLACE_LOGIN_URL,
            productUrl: DB_MARKETPLACE_TIMETABLES_URL,
            credentials: credentialsSummary(loadedCredentials),
            credentialModel,
            credentialSubmission: {
                selectedCredentialsSubmitted: loginSubmitted,
                proof: loginSubmitted
                    ? "marketplace_account_credentials_submitted"
                    : "not_proven",
            },
            login,
            loginPageState,
            productPageState,
            reachable: {
                loginPage: loginPageState.flags.hasMarketplaceText || loginPageState.flags.hasLoginText,
                timetablesProductPage: productPageState.flags.hasMarketplaceText,
            },
            browser: {
                executablePath: session.executablePath,
                userDataDir: path.relative(resolveWorkspace(config).root, session.userDataDir),
            },
            artifactDir: session.artifactDir,
            artifacts,
            needsUserAction: !loginSubmitted && credentialModel.schemaSufficientForBrowserLogin,
            appCreated: false,
            subscriptionChanged: false,
            termsAccepted: false,
        };
    }
    catch (error) {
        if (session?.page) {
            await captureAccessStage(session.page, session.artifactDir, "blocked", artifacts)
                .catch(() => undefined);
        }
        return {
            ok: false,
            operation: "db_marketplace_access_check",
            accessPath: "db_api_marketplace_browser",
            credentials: credentialsSummary(loadedCredentials),
            message: error instanceof Error ? error.message : String(error),
            artifactDir: session?.artifactDir,
            artifacts,
            needsUserAction: true,
            appCreated: false,
            subscriptionChanged: false,
            termsAccepted: false,
        };
    }
    finally {
        await session?.context.close().catch(() => undefined);
    }
}
function marketplaceCredentialModel(credentials, allowBahnAccountFallback) {
    const hasDbApiBrowserCredentials = Boolean(credentials.dbApi?.accountUsername && credentials.dbApi?.accountPassword);
    const fallbackAvailable = Boolean(credentials.bahnAccount?.username && credentials.bahnAccount?.password);
    return {
        apiKeyCredentialsPresent: Boolean(credentials.dbApi?.clientId && credentials.dbApi?.apiKey),
        schemaSufficientForBrowserLogin: hasDbApiBrowserCredentials,
        browserLoginCredentialSource: hasDbApiBrowserCredentials
            ? "dbApi.accountUsername/accountPassword"
            : allowBahnAccountFallback && fallbackAvailable
                ? "bahnAccount fallback"
                : "none",
        fallbackAllowed: allowBahnAccountFallback,
        fallbackAvailable,
        fallbackUsed: !hasDbApiBrowserCredentials &&
            allowBahnAccountFallback &&
            fallbackAvailable,
        schemaRecommendation: hasDbApiBrowserCredentials
            ? undefined
            : "Add dbApi.accountUsername and dbApi.accountPassword for Marketplace browser-login proof; clientId/apiKey alone cannot be typed into the Marketplace login page.",
        credentialsForSubmission: hasDbApiBrowserCredentials
            ? {
                username: credentials.dbApi?.accountUsername,
                password: credentials.dbApi?.accountPassword,
            }
            : allowBahnAccountFallback
                ? credentials.bahnAccount ?? {}
                : {},
    };
}

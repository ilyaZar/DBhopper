import path from "node:path";
import { DB_MARKETPLACE_LOGIN_URL, DB_MARKETPLACE_TIMETABLES_URL, captureAccessStage, openCredentialBrowserSession, pageAccessState, } from "./access-browser.js";
import { credentialsSummary, readSelectedCredentialsProfile, } from "./credentials.js";
import { errorMessage } from "./errors.js";
import { performDbAccountLogin } from "./db-login.js";
import { resolveWorkspace } from "./workspace.js";
const MARKETPLACE_DB_ACCOUNT_CONTINUE_SELECTORS = [
    'button:has-text("Weiter mit DB Kundenkonto")',
    'a:has-text("Weiter mit DB Kundenkonto")',
    'button:has-text("Mit DB Kundenkonto")',
    'a:has-text("Mit DB Kundenkonto")',
    'button:has-text("Continue with DB customer account")',
    'a:has-text("Continue with DB customer account")',
    'button:has-text("DB customer account")',
    'a:has-text("DB customer account")',
];
export async function runDbMarketplaceAccessCheck(params, config = {}, signal) {
    const artifacts = [];
    let loadedCredentials = undefined;
    let session;
    try {
        loadedCredentials = await readSelectedCredentialsProfile(config);
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
        session = await openCredentialBrowserSession(params, config, loadedCredentials, "db-marketplace-access-check");
        session.page.setDefaultTimeout(25000);
        session.page.setDefaultNavigationTimeout(45000);
        if (signal?.aborted) {
            throw new Error("DB API Marketplace access check was aborted");
        }
        const credentialModel = marketplaceCredentialModel(loadedCredentials.credentials);
        await session.page.goto(DB_MARKETPLACE_LOGIN_URL, {
            waitUntil: "domcontentloaded",
        });
        await session.page.waitForTimeout(2500);
        await captureAccessStage(session.page, session.artifactDir, "marketplace-login", artifacts);
        const accountGateClicked = await continueToDbAccountLogin(session.page);
        if (accountGateClicked) {
            await captureAccessStage(session.page, session.artifactDir, "after-account-gate", artifacts);
        }
        const loginPageState = await pageAccessState(session.page);
        let login;
        if (isDbIdentityHost(new URL(session.page.url()).hostname)) {
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
        const loginOk = "ok" in login && login.ok === true;
        const loginProof = "credentialProof" in login ? login.credentialProof : "not_proven";
        const usernameRejected = "usernameRejected" in login ? login.usernameRejected : undefined;
        const usernameRejectionReason = "usernameRejectionReason" in login
            ? login.usernameRejectionReason
            : undefined;
        const credentialRejected = "credentialRejected" in login ? login.credentialRejected : undefined;
        const credentialRejectionStage = "credentialRejectionStage" in login
            ? login.credentialRejectionStage
            : undefined;
        const credentialRejectionReason = "credentialRejectionReason" in login
            ? login.credentialRejectionReason
            : undefined;
        const passwordRejected = "passwordRejected" in login ? login.passwordRejected : undefined;
        const passwordRejectionReason = "passwordRejectionReason" in login
            ? login.passwordRejectionReason
            : undefined;
        const credentialCombinationRejected = "credentialCombinationRejected" in login
            ? login.credentialCombinationRejected
            : undefined;
        return {
            ok: productPageState.flags.hasMarketplaceText && loginOk,
            operation: "db_marketplace_access_check",
            accessPath: "db_api_marketplace_browser",
            startUrl: DB_MARKETPLACE_LOGIN_URL,
            productUrl: DB_MARKETPLACE_TIMETABLES_URL,
            credentials: credentialsSummary(loadedCredentials),
            credentialModel,
            credentialSubmission: {
                selectedCredentialsSubmitted: loginSubmitted,
                proof: loginOk && loginSubmitted
                    ? "marketplace_account_credentials_submitted"
                    : loginProof,
                credentialRejected,
                credentialRejectionStage,
                credentialRejectionReason,
                usernameRejected,
                usernameRejectionReason,
                passwordRejected,
                passwordRejectionReason,
                credentialCombinationRejected,
            },
            login,
            loginPageState,
            productPageState,
            reachable: {
                loginPage: loginPageState.flags.hasMarketplaceText || loginPageState.flags.hasLoginText,
                timetablesProductPage: productPageState.flags.hasMarketplaceText,
            },
            accountGateClicked,
            browser: {
                executablePath: session.executablePath,
                userDataDir: path.relative(resolveWorkspace(config).root, session.userDataDir),
            },
            artifactDir: session.artifactDir,
            artifacts,
            needsUserAction: !loginOk && credentialModel.schemaSufficientForBrowserLogin,
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
            message: errorMessage(error),
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
function marketplaceCredentialModel(credentials) {
    const hasBahnAccountApiCredentials = Boolean(credentials.bahnAccountAPI?.username && credentials.bahnAccountAPI?.password);
    return {
        apiKeyCredentialsPresent: Boolean(credentials.bahnAPI?.clientId && credentials.bahnAPI?.apiKey),
        schemaSufficientForBrowserLogin: hasBahnAccountApiCredentials,
        browserLoginCredentialSource: hasBahnAccountApiCredentials
            ? "bahnAccountAPI.username/password"
            : "none",
        schemaRecommendation: hasBahnAccountApiCredentials
            ? undefined
            : "Add bahnAccountAPI.username and bahnAccountAPI.password for Marketplace browser-login proof; bahnAPI clientId/apiKey cannot be typed into the Marketplace login page.",
        credentialsForSubmission: hasBahnAccountApiCredentials
            ? {
                username: credentials.bahnAccountAPI?.username,
                password: credentials.bahnAccountAPI?.password,
            }
            : {},
    };
}
function isDbIdentityHost(hostname) {
    return hostname === "accounts.bahn.de" || hostname === "id.bahn.de";
}
async function continueToDbAccountLogin(page) {
    for (const selector of MARKETPLACE_DB_ACCOUNT_CONTINUE_SELECTORS) {
        const locator = page.locator(selector).first();
        try {
            if ((await locator.count()) > 0 && await locator.isVisible({ timeout: 1000 })) {
                await locator.click({ timeout: 10000 });
                await page.waitForLoadState("domcontentloaded", { timeout: 10000 })
                    .catch(() => undefined);
                await page.waitForTimeout(2500);
                return true;
            }
        }
        catch { }
    }
    return false;
}

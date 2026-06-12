import path from "node:path";

import {
  DB_MARKETPLACE_LOGIN_URL,
  DB_MARKETPLACE_TIMETABLES_URL,
  captureAccessStage,
  openCredentialBrowserSession,
  pageAccessState,
  type BrowserAccessParams,
} from "./access-browser.js";
import {
  credentialsSummary,
  readSelectedCredentialsProfile,
} from "./credentials.js";
import { performDbAccountLogin } from "./db-login.js";
import type { DBhopperConfig } from "./types.js";
import { resolveWorkspace } from "./workspace.js";

export interface DbMarketplaceAccessCheckParams extends BrowserAccessParams {
  stay_logged_in?: boolean;
}

export async function runDbMarketplaceAccessCheck(
  params: DbMarketplaceAccessCheckParams,
  config: DBhopperConfig = {},
  signal?: AbortSignal,
) {
  const artifacts: string[] = [];
  let loadedCredentials: Awaited<ReturnType<typeof readSelectedCredentialsProfile>> =
    undefined;
  let session: Awaited<ReturnType<typeof openCredentialBrowserSession>> | undefined;
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

    session = await openCredentialBrowserSession(
      params,
      config,
      loadedCredentials,
      "db-marketplace-access-check",
    );
    session.page.setDefaultTimeout(25000);
    session.page.setDefaultNavigationTimeout(45000);

    if (signal?.aborted) {
      throw new Error("DB API Marketplace access check was aborted");
    }

    const credentialModel = marketplaceCredentialModel(
      loadedCredentials.credentials,
    );
    await session.page.goto(DB_MARKETPLACE_LOGIN_URL, {
      waitUntil: "domcontentloaded",
    });
    await session.page.waitForTimeout(2500);
    await captureAccessStage(session.page, session.artifactDir, "marketplace-login", artifacts);
    const loginPageState = await pageAccessState(session.page);

    let login:
      | Awaited<ReturnType<typeof performDbAccountLogin>>
      | { requested: false; message: string };
    if (new URL(session.page.url()).hostname === "accounts.bahn.de") {
      login = await performDbAccountLogin(
        session.page,
        credentialModel.credentialsForSubmission,
        {
          stayLoggedIn: params.stay_logged_in !== false,
          requireCredentialEntry: true,
        },
      );
      await captureAccessStage(session.page, session.artifactDir, "after-login", artifacts);
    } else {
      login = {
        requested: false,
        message:
          "Marketplace login page did not expose DB account credential fields without an additional legal/account gate",
      };
    }

    await session.page.goto(DB_MARKETPLACE_TIMETABLES_URL, {
      waitUntil: "domcontentloaded",
    });
    await session.page.waitForTimeout(2500);
    await captureAccessStage(session.page, session.artifactDir, "timetables-product", artifacts);
    const productPageState = await pageAccessState(session.page);
    const loginSubmitted =
      "selectedCredentialsSubmitted" in login && login.selectedCredentialsSubmitted;

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
  } catch (error) {
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
  } finally {
    await session?.context.close().catch(() => undefined);
  }
}

function marketplaceCredentialModel(
  credentials: NonNullable<
    Awaited<ReturnType<typeof readSelectedCredentialsProfile>>
  >["credentials"],
) {
  const hasBahnAccountApiCredentials = Boolean(
    credentials.bahnAccountAPI?.username && credentials.bahnAccountAPI?.password,
  );
  return {
    apiKeyCredentialsPresent: Boolean(
      credentials.bahnAPI?.clientId && credentials.bahnAPI?.apiKey,
    ),
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

import path from "node:path";

import {
  DB_STANDARD_HOME_URL,
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

export interface DbStandardLoginCheckParams extends BrowserAccessParams {
  stay_logged_in?: boolean;
}

export async function runDbStandardLoginCheck(
  params: DbStandardLoginCheckParams,
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
        operation: "db_standard_login_check",
        needsUserAction: true,
        message: "no selected credentials profile is configured",
        credentials: credentialsSummary(loadedCredentials),
        purchaseSubmitted: false,
        registrationSubmitted: false,
      };
    }

    session = await openCredentialBrowserSession(
      params,
      config,
      loadedCredentials,
      "db-standard-login-check",
    );
    session.page.setDefaultTimeout(25000);
    session.page.setDefaultNavigationTimeout(45000);

    if (signal?.aborted) {
      throw new Error("DB standard login check was aborted");
    }

    await session.page.goto(DB_STANDARD_HOME_URL, { waitUntil: "domcontentloaded" });
    await session.page.waitForTimeout(2500);
    await captureAccessStage(session.page, session.artifactDir, "home", artifacts);

    const login = await performDbAccountLogin(
      session.page,
      loadedCredentials.credentials.bahnAccount ?? {},
      {
        stayLoggedIn: params.stay_logged_in !== false,
        requireCredentialEntry: true,
      },
    );
    await captureAccessStage(session.page, session.artifactDir, "after-login", artifacts);
    const pageState = await pageAccessState(session.page);

    return {
      ok: login.ok && login.selectedCredentialsSubmitted,
      operation: "db_standard_login_check",
      accessPath: "db_standard_website",
      startUrl: DB_STANDARD_HOME_URL,
      credentials: credentialsSummary(loadedCredentials),
      credentialSubmission: {
        selectedCredentialsSubmitted: login.selectedCredentialsSubmitted,
        usernameSubmitted: login.usernameSubmitted,
        passwordSubmitted: login.passwordSubmitted,
        proof: login.credentialProof,
      },
      login,
      pageState,
      browser: {
        executablePath: session.executablePath,
        userDataDir: path.relative(resolveWorkspace(config).root, session.userDataDir),
      },
      artifactDir: session.artifactDir,
      artifacts,
      needsUserAction: login.needsUserAction,
      purchaseSubmitted: false,
      registrationSubmitted: false,
    };
  } catch (error) {
    if (session?.page) {
      await captureAccessStage(session.page, session.artifactDir, "blocked", artifacts)
        .catch(() => undefined);
    }
    return {
      ok: false,
      operation: "db_standard_login_check",
      accessPath: "db_standard_website",
      credentials: credentialsSummary(loadedCredentials),
      message: error instanceof Error ? error.message : String(error),
      artifactDir: session?.artifactDir,
      artifacts,
      needsUserAction: true,
      purchaseSubmitted: false,
      registrationSubmitted: false,
    };
  } finally {
    await session?.context.close().catch(() => undefined);
  }
}

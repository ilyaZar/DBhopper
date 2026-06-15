import fs from "node:fs/promises";
import path from "node:path";

import type { BrowserContext, Page } from "playwright-core";

import {
  createTimestampedArtifactDir,
  safeArtifactSegment,
} from "./artifacts.js";
import { resolveBrowserExecutablePath } from "./browser.js";
import type { LoadedCredentialsProfile } from "./credentials.js";
import type { DBhopperConfig } from "./types.js";
import { resolveWorkspace } from "./workspace.js";

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

export const DB_STANDARD_HOME_URL = "https://int.bahn.de/en";
export const DB_MARKETPLACE_LOGIN_URL =
  "https://developers.deutschebahn.com/db-api-marketplace/apis/user/login";
export const DB_MARKETPLACE_TIMETABLES_URL =
  "https://developers.deutschebahn.com/db-api-marketplace/apis/product/timetables";

export async function openCredentialBrowserSession(
  params: BrowserAccessParams,
  config: DBhopperConfig,
  loadedCredentials: LoadedCredentialsProfile,
  artifactPrefix: string,
): Promise<BrowserAccessSession> {
  const userDataDir = resolveCredentialUserDataDir(config, loadedCredentials);
  if (!userDataDir) {
    throw new Error("selected credentials need browser.userDataDir");
  }

  await fs.mkdir(userDataDir, { recursive: true });
  const executablePath = await resolveBrowserExecutablePath(config);
  const artifactDir = params.screenshots === true
    ? await createAccessArtifactDir(config, artifactPrefix)
    : undefined;
  const { chromium } = await import("playwright-core");
  const context = await chromium.launchPersistentContext(userDataDir, {
    executablePath,
    headless: params.headless !== false,
    slowMo: params.slow_mo_ms,
    args: ["--disable-dev-shm-usage"],
    viewport: { width: 1320, height: 980 },
    locale: "en-US",
  });
  const page = context.pages()[0] ?? (await context.newPage());
  return { context, page, executablePath, userDataDir, artifactDir };
}

export function resolveCredentialUserDataDir(
  config: DBhopperConfig,
  loadedCredentials: LoadedCredentialsProfile | undefined,
) {
  const configured = loadedCredentials?.credentials.browser?.userDataDir?.trim();
  if (!configured) {
    return undefined;
  }
  if (path.isAbsolute(configured)) {
    return configured;
  }
  return path.join(resolveWorkspace(config).root, configured);
}

export async function captureAccessStage(
  page: Page,
  artifactDir: string | undefined,
  label: string,
  artifacts: string[],
) {
  if (!artifactDir) {
    return;
  }
  const target = path.join(artifactDir, `${safeArtifactSegment(label)}.png`);
  await page.screenshot({ path: target, fullPage: true });
  artifacts.push(target);
}

export async function pageAccessState(page: Page) {
  const url = new URL(page.url());
  const body = await page.locator("body").innerText({ timeout: 5000 }).catch(() => "");
  return {
    title: await page.title().catch(() => ""),
    url: {
      origin: url.origin,
      pathname: url.pathname,
    },
    flags: {
      hasLoginText: /login|log in|anmelden|einloggen/i.test(body),
      hasLogoutText: /logout|log out|abmelden/i.test(body),
      hasAccountText: /my bahn|meine bahn|account|konto|profile|profil|dashboard|applications|anwendungen/i.test(
        body,
      ),
      hasMarketplaceText: /api marketplace|db api marketplace|timetables|katalog|produkte/i.test(
        body,
      ),
      hasPasswordField: await page
        .locator('input[type="password"]')
        .first()
        .isVisible({ timeout: 500 })
        .catch(() => false),
      hasUserActionText: /captcha|passkey|verification code|security code|two-factor|2fa|mfa|sicherheitscode|authenticator/i.test(
        body,
      ),
      hasErrorText: /invalid|incorrect|unauthorized|fehler|ungültig|falsch|nicht korrekt|error/i.test(
        body,
      ),
    },
  };
}

async function createAccessArtifactDir(config: DBhopperConfig, prefix: string) {
  const workspace = resolveWorkspace(config);
  const artifactRoot = config.artifactRoot || path.join(workspace.root, "tmp");
  return createTimestampedArtifactDir(artifactRoot, prefix);
}

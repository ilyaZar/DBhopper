import fs from "node:fs/promises";
import path from "node:path";
import { resolveBrowserExecutablePath } from "./browser.js";
import { resolveWorkspace } from "./workspace.js";
export const DB_STANDARD_HOME_URL = "https://int.bahn.de/en";
export const DB_MARKETPLACE_LOGIN_URL = "https://developers.deutschebahn.com/db-api-marketplace/apis/user/login";
export const DB_MARKETPLACE_TIMETABLES_URL = "https://developers.deutschebahn.com/db-api-marketplace/apis/product/timetables";
export async function openCredentialBrowserSession(params, config, loadedCredentials, artifactPrefix) {
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
export function resolveCredentialUserDataDir(config, loadedCredentials) {
    const configured = loadedCredentials?.credentials.browser?.userDataDir?.trim();
    if (!configured) {
        return undefined;
    }
    if (path.isAbsolute(configured)) {
        return configured;
    }
    return path.join(resolveWorkspace(config).root, configured);
}
export async function captureAccessStage(page, artifactDir, label, artifacts) {
    if (!artifactDir) {
        return;
    }
    const target = path.join(artifactDir, `${safeArtifactLabel(label)}.png`);
    await page.screenshot({ path: target, fullPage: true });
    artifacts.push(target);
}
export async function pageAccessState(page) {
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
            hasAccountText: /my bahn|meine bahn|account|konto|profile|profil|dashboard|applications|anwendungen/i.test(body),
            hasMarketplaceText: /api marketplace|db api marketplace|timetables|katalog|produkte/i.test(body),
            hasPasswordField: await page
                .locator('input[type="password"]')
                .first()
                .isVisible({ timeout: 500 })
                .catch(() => false),
            hasUserActionText: /captcha|passkey|verification code|security code|two-factor|2fa|mfa|sicherheitscode|authenticator/i.test(body),
            hasErrorText: /invalid|incorrect|unauthorized|fehler|ungültig|falsch|nicht korrekt|error/i.test(body),
        },
    };
}
async function createAccessArtifactDir(config, prefix) {
    const workspace = resolveWorkspace(config);
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const artifactRoot = config.artifactRoot || path.join(workspace.root, "tmp");
    const artifactDir = path.join(artifactRoot, `${prefix}-${timestamp}`);
    await fs.mkdir(artifactDir, { recursive: true });
    return artifactDir;
}
function safeArtifactLabel(value) {
    return value.replace(/[^a-z0-9._-]+/gi, "-").replace(/-+/g, "-").toLowerCase();
}

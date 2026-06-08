import fs from "node:fs/promises";
import path from "node:path";

import type { Browser, Page } from "playwright-core";

import type { DBhopperClaim, DBhopperConfig } from "./types.js";
import { resolveClaimFilePath } from "./workspace.js";

export interface BrowserRunParams {
  claim: DBhopperClaim;
  claimDir: string;
  mode?: "dry_run" | "submit";
  confirmSubmit?: boolean;
  headless?: boolean;
  browserExecutablePath?: string;
  timeoutMs?: number;
}

export interface BrowserRunResult {
  ok: boolean;
  mode: "dry_run" | "submit";
  stage: string;
  claimDir: string;
  artifacts: string[];
  submitted: boolean;
  needsUserAction: boolean;
  message: string;
}

const FORM_URL = "https://mg.kcm-nrw.de/elmapublic/";
const DEFAULT_TIMEOUT_MS = 180000;

export async function probeBrowser(config: DBhopperConfig = {}) {
  const browser = await launchBrowser(config);
  const page = await browser.newPage({
    viewport: { width: 1280, height: 1400 },
    locale: "de-DE",
  });

  try {
    await page.goto(FORM_URL, { waitUntil: "domcontentloaded", timeout: 45000 });
    await page.waitForSelector("#formCreator", { timeout: 45000 });
    await page.waitForTimeout(1000);
    const controls = await visibleControls(page);
    return {
      ok: true,
      url: FORM_URL,
      title: await page.title(),
      controls,
    };
  } finally {
    await browser.close();
  }
}

export async function runBrowserClaim(params: BrowserRunParams): Promise<BrowserRunResult> {
  const mode = params.mode || "dry_run";
  if (mode === "submit" && params.confirmSubmit !== true) {
    throw new Error("confirmSubmit must be true for submit mode");
  }

  const timeoutMs = params.timeoutMs || DEFAULT_TIMEOUT_MS;
  const started = Date.now();
  const artifacts: string[] = [];
  let browser: Browser | undefined;
  let page: Page | undefined;
  let stage = "start";

  try {
    browser = await launchBrowser(params);
    page = await browser.newPage({
      viewport: { width: 1280, height: 1400 },
      locale: "de-DE",
      acceptDownloads: true,
    });
    page.setDefaultTimeout(Math.min(30000, timeoutMs));
    page.setDefaultNavigationTimeout(Math.min(45000, timeoutMs));

    stage = "open_form";
    await page.goto(FORM_URL, { waitUntil: "domcontentloaded" });
    await page.waitForSelector("#formCreator");

    stage = "legal";
    await clickText(page, /Ich habe die Regeln/i);
    await clickVisibleSave(page);

    stage = "claimant";
    await fillClaimant(page, params.claim);
    await clickVisibleSave(page);

    stage = "journey";
    await fillJourney(page, params.claim);
    await clickVisibleSave(page);

    stage = "ticket";
    await fillTicket(page, params.claim, params.claimDir);
    await clickVisibleSave(page);

    stage = "bank";
    await fillBank(page, params.claim);
    await clickVisibleSave(page);

    stage = "summary";
    artifacts.push(await savePageText(page, params.claimDir, "summary"));
    artifacts.push(await saveScreenshot(page, params.claimDir, "summary"));

    if (Date.now() - started > timeoutMs) {
      throw new Error("browser run timed out");
    }

    if (mode === "dry_run") {
      return {
        ok: true,
        mode,
        stage,
        claimDir: params.claimDir,
        artifacts,
        submitted: false,
        needsUserAction: false,
        message: "stopped at summary page; no claim was submitted",
      };
    }

    stage = "submit";
    const download = await submitAndDownload(page, params.claimDir);
    if (download) {
      artifacts.push(download);
    }
    artifacts.push(await savePageText(page, params.claimDir, "submitted"));
    artifacts.push(await saveScreenshot(page, params.claimDir, "submitted"));

    return {
      ok: true,
      mode,
      stage,
      claimDir: params.claimDir,
      artifacts,
      submitted: true,
      needsUserAction: false,
      message: "claim submitted and available artifacts were saved",
    };
  } catch (error) {
    if (page) {
      try {
        artifacts.push(await savePageText(page, params.claimDir, `blocked-${stage}`));
        artifacts.push(await saveScreenshot(page, params.claimDir, `blocked-${stage}`));
      } catch {
        // Keep the original browser failure.
      }
    }
    return {
      ok: false,
      mode,
      stage,
      claimDir: params.claimDir,
      artifacts,
      submitted: false,
      needsUserAction: true,
      message: error instanceof Error ? error.message : String(error),
    };
  } finally {
    await browser?.close();
  }
}

async function launchBrowser(config: DBhopperConfig | BrowserRunParams): Promise<Browser> {
  const { chromium } = await import("playwright-core");
  const executablePath =
    config.browserExecutablePath || process.env.DBHOPPER_BROWSER_EXECUTABLE || (await findChromium());
  if (!executablePath) {
    throw new Error("browserExecutablePath is required when Playwright has no bundled browser");
  }
  return chromium.launch({
    executablePath,
    headless: config.headless !== false,
    args: ["--disable-dev-shm-usage"],
  });
}

async function findChromium() {
  const candidates = [
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
  ];
  for (const candidate of candidates) {
    try {
      await fs.access(candidate);
      return candidate;
    } catch {
      // Try the next common path.
    }
  }
  return undefined;
}

async function fillClaimant(page: Page, claim: DBhopperClaim) {
  const claimant = claim.claimant || {};
  const salutation = claimant.salutation || "FAMILY";
  const labelBySalutation: Record<string, RegExp> = {
    MR: /^Herr$/,
    MS: /^Frau$/,
    DIVERS: /^Divers$/,
    FAMILY: /^Keine Angabe$/,
  };
  await clickText(page, labelBySalutation[salutation] || /^Keine Angabe$/);
  await fill(page, "#email", claimant.email);
  await fill(page, "#firstName", claimant.firstName);
  await fill(page, "#lastName", claimant.lastName);
  await fill(page, "#phoneNo", claimant.phone);
  await fill(page, "#streetNumber", claimant.address?.streetNumber);
  await fill(page, "#zip", claimant.address?.zip);
  await fill(page, "#city", claimant.address?.city);
  await fill(page, "#country", claimant.address?.country || "Deutschland");
}

async function fillJourney(page: Page, claim: DBhopperClaim) {
  const journey = claim.journey || {};
  await fill(page, "#dateOfEvent", journey.date);
  await fill(page, "#complaintTime", journey.scheduledDepartureTime);
  await chooseAutocomplete(page, "#startStation", journey.startStation);
  await chooseAutocomplete(page, "#endStation", journey.endStation);
  await page.getByRole("button", { name: /Verbindung suchen/i }).first().click();
  await page.waitForTimeout(4000);

  const line = journey.plannedLine || journey.plannedTrainLabel;
  let selected = false;
  if (line) {
    const rowButton = page
      .locator("tr")
      .filter({ hasText: new RegExp(escapeRegExp(line), "i") })
      .getByRole("button", { name: /Ausw/i })
      .first();
    if ((await rowButton.count()) > 0) {
      await rowButton.click();
      selected = true;
    }
  }
  if (!selected) {
    const first = page.getByRole("button", { name: /Ausw/i }).first();
    if ((await first.count()) > 0) {
      await first.click();
      selected = true;
    }
  }
  if (!selected) {
    await page.getByRole("button", { name: /Fahrt nicht/i }).first().click();
    await fill(
      page,
      "#tripNotFoundDescription",
      [
        journey.plannedLine || journey.plannedTrainLabel || "planned local service",
        `${journey.delayMinutes || "unknown"} minutes delay`,
        journey.disruptionType || "delay",
      ].join("; "),
    );
  }
}

async function fillTicket(page: Page, claim: DBhopperClaim, claimDir: string) {
  const ticket = claim.ticket || {};
  await fill(page, "#ticketName", ticket.baseTicketName);
  await selectLabel(page, "#ticketType", ticket.baseTicketCategory || "Ticket im Abo");
  await selectLabel(page, "#tariffArea", ticket.tariffArea || "NRW-Tarif");

  const refundLabelByType = {
    long_distance: /Fernverkehrszug/i,
    taxi: /^Taxi$/i,
    sharing: /Sharing-Angebote/i,
    alternative_local: /Alternatives Nahverkehrsmittel/i,
  };
  await clickText(page, refundLabelByType[ticket.substituteType || "long_distance"]);
  await selectLabel(page, "#companions", String(ticket.companions ?? 0), false);
  await fill(page, "#refundAmount", formatEuro(ticket.substituteCost));
  await fill(page, "#complaintDescription", ticket.description);

  const uploadPaths = [];
  for (const file of claim.files || []) {
    if (["base_ticket", "substitute_receipt", "delay_evidence", "other"].includes(file.role)) {
      uploadPaths.push(await resolveClaimFilePath(claimDir, file.path));
    }
  }
  if (uploadPaths.length > 0) {
    await page.locator('input[type="file"]').first().setInputFiles(uploadPaths);
    await page.waitForTimeout(3000);
  }
}

async function fillBank(page: Page, claim: DBhopperClaim) {
  await fill(page, "#accountOwner", claim.bank?.accountOwner);
  await fill(page, "#iban", claim.bank?.iban);
  await page.waitForTimeout(1500);
}

async function submitAndDownload(page: Page, claimDir: string) {
  const downloadPromise = page.waitForEvent("download", { timeout: 60000 }).catch(() => null);
  await page.getByRole("button", { name: /Angaben absenden/i }).click();
  await page.waitForTimeout(3000);
  const downloadButton = page.getByRole("button", { name: /download|pdf|herunterladen/i }).first();
  if ((await downloadButton.count()) > 0) {
    await downloadButton.click().catch(() => undefined);
  }
  const download = await downloadPromise;
  if (!download) {
    return undefined;
  }
  const target = path.join(claimDir, "submission-confirmation.pdf");
  await download.saveAs(target);
  return path.relative(claimDir, target);
}

async function chooseAutocomplete(page: Page, selector: string, value?: string) {
  await fill(page, selector, value);
  await page.waitForTimeout(1200);
  await page.keyboard.press("ArrowDown").catch(() => undefined);
  await page.keyboard.press("Enter").catch(() => undefined);
}

async function clickVisibleSave(page: Page) {
  await page.getByRole("button", { name: /Speichern.*weiter/i }).filter({ visible: true }).first().click();
}

async function fill(page: Page, selector: string, value?: string | number) {
  if (value === undefined || value === null || value === "") {
    return;
  }
  await (await visibleOrFirst(page, selector)).fill(String(value));
}

async function clickText(page: Page, text: RegExp) {
  await page.getByText(text).first().click();
}

async function selectLabel(page: Page, selector: string, label: string, required = true) {
  try {
    await (await visibleOrFirst(page, selector)).selectOption({ label });
    return;
  } catch (error) {
    if (required) {
      throw error;
    }
  }
}

async function visibleOrFirst(page: Page, selector: string) {
  const visible = page.locator(selector).filter({ visible: true }).first();
  if ((await visible.count()) > 0) {
    return visible;
  }
  return page.locator(selector).first();
}

async function visibleControls(page: Page) {
  return page.locator("input, select, textarea, button, label").evaluateAll((nodes) =>
    nodes
      .map((el) => ({
        tag: el.tagName.toLowerCase(),
        id: (el as HTMLElement).id || undefined,
        name: el.getAttribute("name") || undefined,
        type: el.getAttribute("type") || undefined,
        text: ((el as HTMLElement).innerText || el.textContent || "").trim().replace(/\s+/g, " "),
        visible: Boolean(
          (el as HTMLElement).offsetWidth ||
            (el as HTMLElement).offsetHeight ||
            el.getClientRects().length,
        ),
      }))
      .filter((entry) => entry.visible || entry.id)
      .slice(0, 120),
  );
}

async function savePageText(page: Page, claimDir: string, label: string) {
  const target = path.join(claimDir, `${safeArtifactLabel(label)}.txt`);
  const text = await page.locator("body").innerText().catch(() => "");
  await fs.writeFile(target, `${text}\n`, "utf8");
  return path.relative(claimDir, target);
}

async function saveScreenshot(page: Page, claimDir: string, label: string) {
  const target = path.join(claimDir, `${safeArtifactLabel(label)}.png`);
  await page.screenshot({ path: target, fullPage: true });
  return path.relative(claimDir, target);
}

function safeArtifactLabel(value: string) {
  return `browser-${value}`.replace(/[^a-z0-9._-]+/gi, "-").toLowerCase();
}

function formatEuro(value?: number) {
  if (value === undefined || value === null) {
    return undefined;
  }
  return value.toFixed(2).replace(".", ",");
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

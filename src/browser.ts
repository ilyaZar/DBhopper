import fs from "node:fs/promises";
import path from "node:path";

import type { Browser, Locator, Page } from "playwright-core";

import {
  createTimestampedArtifactDir,
  safeArtifactSegment,
} from "./artifacts.js";
import type { DBhopperClaim, DBhopperConfig } from "./types.js";
import { errorMessage } from "./errors.js";
import { resolveClaimFilePath } from "./workspace.js";
import { fillSensitiveTextControl } from "./sensitive-input.js";

export interface BrowserRunParams {
  claim: DBhopperClaim;
  claimDir: string;
  mode?: "dry_run" | "submit";
  confirmSubmit?: boolean;
  headless?: boolean;
  browserExecutablePath?: string;
  artifactRoot?: string;
  timeoutMs?: number;
}

export interface BrowserRunResult {
  ok: boolean;
  mode: "dry_run" | "submit";
  stage: string;
  claimDir: string;
  artifactDir: string;
  artifacts: string[];
  stationSelections: StationSelection[];
  summaryScreenshot?: string;
  submitted: boolean;
  needsUserAction: boolean;
  message: string;
}

export interface StationSelection {
  field: "startStation" | "endStation";
  input: string;
  candidatesTried: string[];
  dropdownChoices: string[];
  selected?: string;
  matched: boolean;
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
  const stationSelections: StationSelection[] = [];
  const artifactDir = await createArtifactDir(params);
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
    await captureStage(page, artifactDir, "open-form", artifacts);

    stage = "legal";
    await clickText(page, /Ich habe die Regeln/i);
    await clickVisibleSave(page);
    await captureStage(page, artifactDir, "legal", artifacts);

    stage = "claimant";
    await fillClaimant(page, params.claim);
    await clickVisibleSave(page);
    await captureStage(page, artifactDir, "claimant", artifacts);

    stage = "journey";
    stationSelections.push(...await fillJourney(page, params.claim));
    await clickVisibleSave(page);
    await captureStage(page, artifactDir, "journey", artifacts);

    stage = "ticket";
    await fillTicket(page, params.claim, params.claimDir);
    await clickVisibleSave(page);
    await captureStage(page, artifactDir, "ticket", artifacts);

    stage = "bank";
    await fillBank(page, params.claim);
    await clickVisibleSave(page);
    await captureStage(page, artifactDir, "bank", artifacts);

    stage = "summary";
    await captureStage(page, artifactDir, "summary", artifacts);
    const summaryScreenshot = artifacts.find((artifact) =>
      artifact.endsWith("browser-summary.png")
    );

    if (Date.now() - started > timeoutMs) {
      throw new Error("browser run timed out");
    }

    if (mode === "dry_run") {
      return {
        ok: true,
        mode,
        stage,
        claimDir: params.claimDir,
        artifactDir,
        artifacts,
        stationSelections,
        summaryScreenshot,
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
    await captureStage(page, artifactDir, "submitted", artifacts);

    return {
      ok: true,
      mode,
      stage,
      claimDir: params.claimDir,
      artifactDir,
      artifacts,
      stationSelections,
      summaryScreenshot,
      submitted: true,
      needsUserAction: false,
      message: "claim submitted and available artifacts were saved",
    };
  } catch (error) {
    if (page) {
      try {
        await captureStage(page, artifactDir, `blocked-${stage}`, artifacts);
      } catch {
        // Keep the original browser failure.
      }
    }
    return {
      ok: false,
      mode,
      stage,
      claimDir: params.claimDir,
      artifactDir,
      artifacts,
      stationSelections,
      submitted: false,
      needsUserAction: true,
      message: errorMessage(error),
    };
  } finally {
    await browser?.close();
  }
}

export async function launchBrowser(config: DBhopperConfig | BrowserRunParams): Promise<Browser> {
  const { chromium } = await import("playwright-core");
  const executablePath = await resolveBrowserExecutablePath(config);
  return chromium.launch({
    executablePath,
    headless: config.headless !== false,
    args: ["--disable-dev-shm-usage"],
  });
}

export async function resolveBrowserExecutablePath(
  config: DBhopperConfig | BrowserRunParams,
) {
  const executablePath =
    config.browserExecutablePath ||
    process.env.DBHOPPER_BROWSER_EXECUTABLE ||
    (await findChromium());
  if (!executablePath) {
    throw new Error("browserExecutablePath is required when Playwright has no bundled browser");
  }
  return executablePath;
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
  await fill(page, "#phoneNo", normalizePhoneForBrowser(claimant.phone));
  await fill(page, "#streetNumber", claimant.address?.streetNumber);
  await fill(page, "#zip", claimant.address?.zip);
  await fill(page, "#city", claimant.address?.city);
  await fill(page, "#country", claimant.address?.country || "Deutschland");
}

async function fillJourney(page: Page, claim: DBhopperClaim) {
  const journey = claim.journey || {};
  const stationSelections: StationSelection[] = [];
  await fillDate(page, "#dateOfEvent", journey.date);
  await fillTime(page, "#complaintTime", journey.scheduledDepartureTime);
  const startSelection = await chooseAutocomplete(
    page,
    "#startStation",
    journey.startStation,
    "startStation",
  );
  const endSelection = await chooseAutocomplete(
    page,
    "#endStation",
    journey.endStation,
    "endStation",
  );
  if (startSelection) {
    stationSelections.push(startSelection);
  }
  if (endSelection) {
    stationSelections.push(endSelection);
  }
  await clickSearchRoutes(page);
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
        journey.delayMinutes ? `${journey.delayMinutes} minutes delay` : undefined,
        journey.disruptionType || "delay",
      ].filter(Boolean).join("; "),
    );
  }
  return stationSelections;
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
      for (const filePath of claimFilePaths(file)) {
        uploadPaths.push(await resolveClaimFilePath(claimDir, filePath));
      }
    }
  }
  if (uploadPaths.length > 0) {
    await page.locator('input[type="file"]').first().setInputFiles(uploadPaths);
    await page.waitForTimeout(3000);
  }
}

function claimFilePaths(file: { path?: string; paths?: string[] }) {
  return [
    ...(file.path ? [file.path] : []),
    ...(Array.isArray(file.paths) ? file.paths : []),
  ];
}

async function fillBank(page: Page, claim: DBhopperClaim) {
  await fill(page, "#accountOwner", claim.claimant?.bank?.accountOwner);
  await fill(page, "#iban", normalizeIbanForBrowser(claim.claimant?.bank?.iban));
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
  return target;
}

async function chooseAutocomplete(
  page: Page,
  selector: string,
  value: string | undefined,
  field: StationSelection["field"],
) {
  if (!value) {
    return undefined;
  }
  const control = await visibleOrFirst(page, selector);
  const candidatesTried = autocompleteCandidates(value);
  const dropdownChoices: string[] = [];
  for (const candidate of candidatesTried) {
    await fillPlainControl(control, candidate, { tab: false });
    await waitForAutocompleteOptions(page, selector);
    dropdownChoices.push(...await readAutocompleteOptions(page, selector));
    const selected = await clickMatchingAutocompleteOption(page, selector, value);
    if (selected) {
      await page.waitForTimeout(500);
      await page.keyboard.press("Escape").catch(() => undefined);
      return {
        field,
        input: value,
        candidatesTried,
        dropdownChoices: uniqueStrings([...dropdownChoices, selected]),
        selected,
        matched: true,
      };
    }
  }
  await fillPlainControl(control, value, { tab: false });
  dropdownChoices.push(...await readAutocompleteOptions(page, selector));
  await page.keyboard.press("ArrowDown").catch(() => undefined);
  await page.keyboard.press("Enter").catch(() => undefined);
  await page.keyboard.press("Escape").catch(() => undefined);
  await page.waitForTimeout(500);
  return {
    field,
    input: value,
    candidatesTried,
    dropdownChoices: uniqueStrings(dropdownChoices),
    selected: await controlInputValue(control),
    matched: false,
  };
}

async function clickMatchingAutocompleteOption(
  page: Page,
  selector: string,
  value?: string,
) {
  if (!value) {
    return undefined;
  }
  const candidates = autocompleteCandidates(value).map(normalizeStationMatchText);
  return autocompleteOptions(page, selector).evaluateAll(
    (nodes, payload) => {
      const normalize = (text: string) => text
        .normalize("NFKD")
        .replace(/\p{Diacritic}/gu, "")
        .replace(/\b(?:hauptbahnhof|hbf)\b/gi, " hbf ")
        .replace(/[()\\/,-]/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .toLowerCase();
      const tokens = (text: string) => normalize(text)
        .split(" ")
        .filter((token) => token && !["bf", "bahnhof", "station"].includes(token));
      const scoreOption = (input: string, option: string) => {
        const inputTokens = tokens(input);
        const optionTokens = tokens(option);
        if (inputTokens.length === 0 || optionTokens.length === 0) {
          return 0;
        }
        let score = 0;
        for (const token of new Set(inputTokens)) {
          if (optionTokens.includes(token)) {
            score += token === "hbf" ? 2 : 3;
          } else if (optionTokens.some((optionToken) =>
            optionToken.startsWith(token) || token.startsWith(optionToken)
          )) {
            score += 1;
          }
        }
        return score / Math.max(1, new Set(inputTokens).size);
      };
      const isHbfMatch = (input: string, option: string) => {
        const inputText = normalize(input);
        const optionText = normalize(option);
        const hbfPattern = /\b(?:hbf|hauptbahnhof)\b/g;
        if (!hbfPattern.test(inputText)) {
          return false;
        }
        const city = inputText
          .replace(/\bhbf\b/g, "")
          .replace(/\bhauptbahnhof\b/g, "")
          .replace(/[(),]/g, " ")
          .trim();
        return Boolean(city) &&
          optionText.includes(city) &&
          (optionText.includes("hbf") || optionText.includes("hauptbahnhof"));
      };
      let best: { node: Element; text: string; score: number } | undefined;
      for (const node of nodes) {
        const text = node.textContent || "";
        const normalizedOption = normalize(text);
        const exactScore = payload.candidates.some((candidate) =>
          normalizedOption.includes(candidate)
        )
          ? 100
          : 0;
        const hbfScore = isHbfMatch(payload.value, text) ? 50 : 0;
        const overlapScore = scoreOption(payload.value, text);
        const score = Math.max(exactScore, hbfScore, overlapScore);
        if (score >= 2 && (!best || score > best.score)) {
          best = { node, text: text.trim().replace(/\s+/g, " "), score };
        }
      }
      if (!best) {
        return undefined;
      }
      best.node.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
      best.node.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
      (best.node as HTMLElement).click();
      return best.text;
    },
    { candidates, value },
  );
}

async function readAutocompleteOptions(page: Page, selector: string) {
  await waitForAutocompleteOptions(page, selector);
  return autocompleteOptions(page, selector).evaluateAll((nodes) =>
    nodes
      .map((node) => (node.textContent || "").trim().replace(/\s+/g, " "))
      .filter(Boolean)
      .slice(0, 20),
  );
}

async function controlInputValue(control: Locator) {
  return control.inputValue().catch(() => undefined);
}

function autocompleteOptions(page: Page, selector: string) {
  const id = selector.replace(/^#/, "");
  return page.locator(
    [
      `button[role="option"][id^="${id}_"]`,
      `[role="option"][id^="${id}_"]`,
      `li[id^="${id}_"]`,
      ".MuiAutocomplete-option",
      "[role='option']",
    ].join(", "),
  );
}

async function waitForAutocompleteOptions(page: Page, selector: string) {
  await autocompleteOptions(page, selector)
    .first()
    .waitFor({ state: "visible", timeout: 2500 })
    .catch(() => undefined);
}

async function clickVisibleSave(page: Page) {
  await page.getByRole("button", { name: /Speichern.*weiter/i }).filter({ visible: true }).first().click();
}

async function clickSearchRoutes(page: Page) {
  await page.keyboard.press("Escape").catch(() => undefined);
  await page.waitForTimeout(300);
  const button = page.getByRole("button", { name: /Verbindung suchen/i }).first();
  await button.evaluate((element) => {
    (element as HTMLElement).click();
  });
}

async function fill(page: Page, selector: string, value?: string | number) {
  if (value === undefined || value === null || value === "") {
    return;
  }
  await fillSensitiveTextControl(await visibleOrFirst(page, selector), String(value));
}

async function fillDate(page: Page, selector: string, value?: string) {
  if (!value) {
    return;
  }
  const control = await visibleOrFirst(page, selector);
  await control.fill(value);
}

async function fillTime(page: Page, selector: string, value?: string) {
  if (!value) {
    return;
  }
  const control = await visibleOrFirst(page, selector);
  await control.fill(value);
}

async function fillPlainControl(
  control: Awaited<ReturnType<typeof visibleOrFirst>>,
  value: string,
  options: { tab?: boolean } = {},
) {
  await control.waitFor({ state: "visible" });
  await control.click();
  await control.press(process.platform === "darwin" ? "Meta+A" : "Control+A");
  await control.press("Backspace");
  await control.pressSequentially(value, { delay: 25 });
  if (options.tab !== false) {
    await control.press("Tab");
  }
}

async function clickText(page: Page, text: RegExp) {
  await page.getByText(text).filter({ visible: true }).first().click();
}

async function selectLabel(page: Page, selector: string, label: string, required = true) {
  const control = await visibleOrFirst(page, selector);
  try {
    await control.selectOption({ label });
    return;
  } catch (error) {
    const fallback = await matchingSelectOptionLabel(control, label);
    if (fallback) {
      await control.selectOption({ label: fallback });
      return;
    }
    if (!required) {
      return;
    }
    throw error;
  }
}

async function matchingSelectOptionLabel(control: Awaited<ReturnType<typeof visibleOrFirst>>, label: string) {
  const normalizedLabel = normalizeOptionText(label);
  const options = await control.locator("option").evaluateAll((nodes) =>
    nodes.map((node) => node.textContent?.trim() || "").filter(Boolean),
  );
  const matches = options.filter((option) => {
    const normalizedOption = normalizeOptionText(option);
    return (
      normalizedOption === normalizedLabel ||
      normalizedOption.startsWith(normalizedLabel) ||
      normalizedOption.includes(normalizedLabel)
    );
  });
  return matches.length === 1 ? matches[0] : undefined;
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

async function captureStage(
  page: Page,
  artifactDir: string,
  label: string,
  artifacts: string[],
) {
  artifacts.push(await savePageText(page, artifactDir, label));
  artifacts.push(await saveScreenshot(page, artifactDir, label));
}

async function createArtifactDir(params: BrowserRunParams) {
  const claimId = safeArtifactSegment(path.basename(params.claimDir));
  const artifactRoot =
    params.artifactRoot || path.join(path.dirname(path.dirname(params.claimDir)), "tmp");
  return createTimestampedArtifactDir(artifactRoot, claimId);
}

async function savePageText(page: Page, artifactDir: string, label: string) {
  const target = path.join(artifactDir, `${safeArtifactLabel(label)}.txt`);
  const text = await page.locator("body").innerText().catch(() => "");
  await fs.writeFile(target, `${text}\n`, "utf8");
  return target;
}

async function saveScreenshot(page: Page, artifactDir: string, label: string) {
  const target = path.join(artifactDir, `${safeArtifactLabel(label)}.png`);
  await page.screenshot({ path: target, fullPage: true });
  return target;
}

function safeArtifactLabel(value: string) {
  return `browser-${safeArtifactSegment(value)}`;
}

function formatEuro(value?: number) {
  if (value === undefined || value === null) {
    return undefined;
  }
  return value.toFixed(2).replace(".", ",");
}

export function normalizePhoneForBrowser(value?: string) {
  return normalizeWhitespaceSeparatedNumber(value);
}

export function normalizeIbanForBrowser(value?: string) {
  return normalizeWhitespaceSeparatedNumber(value)?.toUpperCase();
}

function normalizeWhitespaceSeparatedNumber(value?: string) {
  return value?.replace(/\s+/g, "").trim();
}

function autocompleteCandidates(value: string) {
  const normalized = value.replace(/\bHBF\b/gi, "Hbf").trim();
  const queue = [normalized];
  const candidates = new Set<string>();
  for (const candidate of queue) {
    for (const expanded of stationCandidateVariants(candidate)) {
      const trimmed = expanded.trim();
      if (trimmed && !candidates.has(trimmed)) {
        candidates.add(trimmed);
        queue.push(trimmed);
      }
    }
  }
  return [...candidates];
}

function stationCandidateVariants(value: string) {
  const cityOnly = value
    .replace(/\b(?:Hbf|Hauptbahnhof)\b.*$/i, "")
    .replace(/\s+/g, " ")
    .trim();
  const hbfReordered = value.replace(
    /^(.+?)\s+(Hbf|HBF|Hauptbahnhof)$/i,
    "$2 $1",
  );
  return [
    value,
    cityOnly,
    hbfReordered,
    value.replace(/\bHbf\b/gi, "Hauptbahnhof"),
  ];
}

function normalizeStationMatchText(value: string) {
  return value
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/\b(?:hauptbahnhof|hbf)\b/gi, " hbf ")
    .replace(/[()\\/,-]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export function scoreStationOption(input: string, option: string) {
  const inputTokens = stationTokens(input);
  const optionTokens = stationTokens(option);
  if (inputTokens.length === 0 || optionTokens.length === 0) {
    return 0;
  }
  let score = 0;
  for (const token of new Set(inputTokens)) {
    if (optionTokens.includes(token)) {
      score += token === "hbf" ? 2 : 3;
    } else if (optionTokens.some((optionToken) =>
      optionToken.startsWith(token) || token.startsWith(optionToken)
    )) {
      score += 1;
    }
  }
  return score / Math.max(1, new Set(inputTokens).size);
}

function stationTokens(value: string) {
  return normalizeStationMatchText(value)
    .split(" ")
    .filter((token) => token && !["bf", "bahnhof", "station"].includes(token));
}

function uniqueStrings(values: string[]) {
  return [...new Set(values.filter(Boolean))];
}

function normalizeOptionText(value: string) {
  return value
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

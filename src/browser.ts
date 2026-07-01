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
  stopAfterStationResolution?: boolean;
  checkBahnhofSuffix?: BahnhofSuffixCheck;
  startCheckBahnhofSuffix?: BahnhofSuffixCheck;
  endCheckBahnhofSuffix?: BahnhofSuffixCheck;
  exactStationDeparture?: string;
  exactStationArrival?: string;
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
  entryFlow: BrowserEntryFlow;
  stationSelections: StationSelection[];
  summaryScreenshot?: string;
  submitted: boolean;
  needsUserAction: boolean;
  message: string;
}

export interface BrowserEntryFlow {
  entryUrl: string;
  formPageUrl: string;
  formUrl: string;
  startedAtPublicEntry: boolean;
  storedEntryCookieServices: boolean;
  acceptedFormConsent: boolean;
  usedFormPageFallback: boolean;
  usedDirectFormFallback: boolean;
}

export interface StationSelection {
  field: "startStation" | "endStation";
  input: string;
  checkBahnhofSuffix: BahnhofSuffixCheck;
  candidatesTried: string[];
  dropdownChoices: string[];
  selected?: string;
  matched: boolean;
}

export const BAHNHOF_SUFFIX_CHECKS = ["both", "hbf_only", "bf_only"] as const;
export type BahnhofSuffixCheck = typeof BAHNHOF_SUFFIX_CHECKS[number];

const ENTRY_URL = "https://www.mobil.nrw/fahren/mobigarantie.html";
const FORM_PAGE_URL = "https://www.mobil.nrw/fahren/mobigarantie/einreichen.html";
const FORM_URL = "https://mg.kcm-nrw.de/elmapublic/";
const DEFAULT_TIMEOUT_MS = 180000;
const LIVE_FORM_SETTLE_MS = 5000;

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
  let entryFlow = defaultEntryFlow();
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

    stage = "entry";
    entryFlow = await openClaimForm(page, artifactDir, artifacts);
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
    const defaultBahnhofSuffixCheck = params.checkBahnhofSuffix || "both";
    const journeyResult = await fillJourney(page, params.claim, {
      startStation: params.startCheckBahnhofSuffix || defaultBahnhofSuffixCheck,
      endStation: params.endCheckBahnhofSuffix || defaultBahnhofSuffixCheck,
      exactDeparture: params.exactStationDeparture,
      exactArrival: params.exactStationArrival,
    }, params.stopAfterStationResolution === true);
    stationSelections.push(...journeyResult.stationSelections);
    if (journeyResult.stoppedAfterStationResolution) {
      await captureStage(page, artifactDir, "station-resolution", artifacts);
      return {
        ok: true,
        mode,
        stage: "station_resolution",
        claimDir: params.claimDir,
        artifactDir,
        artifacts,
        entryFlow,
        stationSelections,
        submitted: false,
        needsUserAction: false,
        message: "stopped after station resolution; no claim was submitted",
      };
    }
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
        entryFlow,
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
      entryFlow,
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
      entryFlow,
      stationSelections,
      submitted: false,
      needsUserAction: true,
      message: errorMessage(error),
    };
  } finally {
    await browser?.close();
  }
}

function defaultEntryFlow(): BrowserEntryFlow {
  return {
    entryUrl: ENTRY_URL,
    formPageUrl: FORM_PAGE_URL,
    formUrl: FORM_URL,
    startedAtPublicEntry: false,
    storedEntryCookieServices: false,
    acceptedFormConsent: false,
    usedFormPageFallback: false,
    usedDirectFormFallback: false,
  };
}

async function openClaimForm(
  page: Page,
  artifactDir: string,
  artifacts: string[],
) {
  const entryFlow = defaultEntryFlow();
  try {
    await page.goto(ENTRY_URL, { waitUntil: "domcontentloaded" });
    entryFlow.startedAtPublicEntry = true;
    await page.waitForLoadState("networkidle", { timeout: 5000 }).catch(() => undefined);

    entryFlow.storedEntryCookieServices = await storeDefaultCookieServicesIfVisible(page);
    if (entryFlow.storedEntryCookieServices) {
      await page.waitForTimeout(1000);
    }
    await captureStage(page, artifactDir, "entry", artifacts);
    const openedFormPage = await openPublicFormPage(page);
    entryFlow.usedFormPageFallback = !openedFormPage;
    await page.waitForLoadState("domcontentloaded", { timeout: 10000 }).catch(() => undefined);
    entryFlow.storedEntryCookieServices =
      await storeDefaultCookieServicesIfVisible(page) ||
      entryFlow.storedEntryCookieServices;
    await captureStage(page, artifactDir, "consent", artifacts);

    entryFlow.acceptedFormConsent = await acceptConsentUntilFormVisible(page);
    await waitForFormCreator(page);
    return entryFlow;
  } catch {
    entryFlow.usedDirectFormFallback = true;
    await page.goto(FORM_URL, { waitUntil: "domcontentloaded" });
    entryFlow.storedEntryCookieServices =
      await storeDefaultCookieServicesIfVisible(page) ||
      entryFlow.storedEntryCookieServices;
    await waitForFormCreator(page);
    return entryFlow;
  }
}

async function storeDefaultCookieServicesIfVisible(page: Page) {
  const cookieDialogVisible = await page
    .getByText(/Cookie-Einstellungen|Wir schätzen Ihre Privatsphäre/i)
    .first()
    .isVisible({ timeout: 1000 })
    .catch(() => false);
  if (!cookieDialogVisible) {
    return false;
  }
  const button =
    await visibleButtonByName(page, /^Services speichern$/i) ||
    await visibleButtonByName(page, /^Alles akzeptieren$/i);
  if (!button) {
    return false;
  }
  await button
    .evaluate((element) => {
      (element as HTMLElement).click();
    })
    .catch(async () => {
      await button.click({ force: true });
    });
  await page
    .getByText(/Cookie-Einstellungen|Wir schätzen Ihre Privatsphäre/i)
    .first()
    .waitFor({ state: "hidden", timeout: 5000 })
    .catch(() => undefined);
  return true;
}

async function visibleButtonByName(page: Page, name: RegExp) {
  const button = page.getByRole("button", { name }).filter({ visible: true }).first();
  if ((await button.count()) === 0) {
    return undefined;
  }
  return button;
}

async function openPublicFormPage(page: Page) {
  const formPagePattern = /\/fahren\/mobigarantie\/einreichen\.html(?:$|[?#])/;
  const link = page
    .locator('a[href*="/fahren/mobigarantie/einreichen.html"]')
    .filter({ visible: true })
    .first();
  if ((await link.count()) > 0) {
    const href = await link.getAttribute("href");
    await link.click({ force: true }).catch(() => undefined);
    await page.waitForURL(formPagePattern, { timeout: 5000 }).catch(() => undefined);
    if (formPagePattern.test(page.url())) {
      return true;
    }
    if (href) {
      await page.goto(new URL(href, ENTRY_URL).href, { waitUntil: "domcontentloaded" });
      return false;
    }
  }
  await page.goto(FORM_PAGE_URL, { waitUntil: "domcontentloaded" });
  return false;
}

async function acceptConsentUntilFormVisible(page: Page) {
  let accepted = false;
  for (let index = 0; index < 3; index += 1) {
    await storeDefaultCookieServicesIfVisible(page);
    if ((await page.locator("#formCreator").count()) > 0) {
      return accepted;
    }
    const clicked = await clickVisibleAccept(page);
    if (!clicked) {
      break;
    }
    accepted = true;
    await page.waitForTimeout(2500);
  }
  return accepted;
}

async function clickVisibleAccept(page: Page) {
  const buttons = page
    .getByRole("button", { name: /^Akzeptieren$/i })
    .filter({ visible: true });
  const count = await buttons.count();
  if (count === 0) {
    return false;
  }
  await buttons.nth(count - 1).click({ force: true });
  return true;
}

async function waitForFormCreator(page: Page) {
  await page.waitForSelector("#formCreator", { timeout: 45000 });
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

async function fillJourney(
  page: Page,
  claim: DBhopperClaim,
  checkBahnhofSuffix: {
    startStation: BahnhofSuffixCheck;
    endStation: BahnhofSuffixCheck;
    exactDeparture?: string;
    exactArrival?: string;
  },
  stopAfterStationResolution = false,
) {
  const journey = claim.journey || {};
  const stationSelections: StationSelection[] = [];
  await fillDate(page, "#dateOfEvent", journey.date);
  await fillTime(page, "#complaintTime", journey.scheduledDepartureTime);
  const startSelection = await chooseAutocomplete(
    page,
    "#startStation",
    journey.startStation,
    "startStation",
    checkBahnhofSuffix.startStation,
    checkBahnhofSuffix.exactDeparture,
    stopAfterStationResolution && !checkBahnhofSuffix.exactDeparture,
  );
  if (startSelection) {
    stationSelections.push(startSelection);
  }
  const endSelection = await chooseAutocomplete(
    page,
    "#endStation",
    journey.endStation,
    "endStation",
    checkBahnhofSuffix.endStation,
    checkBahnhofSuffix.exactArrival,
    stopAfterStationResolution && !checkBahnhofSuffix.exactArrival,
  );
  if (endSelection) {
    stationSelections.push(endSelection);
  }
  if (stopAfterStationResolution) {
    return { stationSelections, stoppedAfterStationResolution: true };
  }
  await clickSearchRoutes(page);
  await page.waitForTimeout(LIVE_FORM_SETTLE_MS);

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
  return { stationSelections, stoppedAfterStationResolution: false };
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
    await page.waitForTimeout(LIVE_FORM_SETTLE_MS);
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
  checkBahnhofSuffix: BahnhofSuffixCheck,
  exactStation?: string,
  probeOnly = false,
) {
  if (!value) {
    return undefined;
  }
  const control = await visibleOrFirst(page, selector);
  if (exactStation?.trim()) {
    return forceExactAutocompleteSelection(
      page,
      selector,
      control,
      value,
      field,
      checkBahnhofSuffix,
      exactStation.trim(),
    );
  }
  const candidatesTried = stationAutocompleteCandidates(value, checkBahnhofSuffix);
  const dropdownChoices: string[] = [];
  const observedChoices: Array<{ candidate: string; choices: string[] }> = [];
  for (const candidate of candidatesTried) {
    await fillPlainControl(control, candidate, { tab: false });
    await waitForAutocompleteOptions(page, selector);
    const choices = await readAutocompleteOptions(page, selector);
    dropdownChoices.push(...choices);
    observedChoices.push({ candidate, choices });
  }
  if (probeOnly) {
    await closeAutocompleteFlyout(page, selector, control);
    return {
      field,
      input: value,
      checkBahnhofSuffix,
      candidatesTried,
      dropdownChoices: uniqueStrings(dropdownChoices),
      matched: false,
    };
  }
  const bestChoice = bestAutocompleteChoice(value, dropdownChoices);
  if (bestChoice) {
    const observed = observedChoices.find((entry) => entry.choices.includes(bestChoice));
    if (observed) {
      await fillPlainControl(control, observed.candidate, { tab: false });
      await waitForAutocompleteOptions(page, selector);
    }
    const selected =
      await clickAutocompleteOptionByText(page, selector, bestChoice) ||
      await clickMatchingAutocompleteOption(page, selector, value, checkBahnhofSuffix);
    if (selected) {
      const committed = await commitAutocompleteSelection(page, selector, control);
      const verified = stationValuesMatch(committed, selected)
        ? committed
        : await retryAutocompleteSelection(page, selector, control, selected);
      if (!stationValuesMatch(verified, selected)) {
        return {
          field,
          input: value,
          checkBahnhofSuffix,
          candidatesTried,
          dropdownChoices: uniqueStrings([...dropdownChoices, selected, verified || ""]),
          selected: verified,
          matched: false,
        };
      }
      return {
        field,
        input: value,
        checkBahnhofSuffix,
        candidatesTried,
        dropdownChoices: uniqueStrings([...dropdownChoices, verified || selected]),
        selected: verified || selected,
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
    checkBahnhofSuffix,
    candidatesTried,
    dropdownChoices: uniqueStrings(dropdownChoices),
    selected: await controlInputValue(control),
    matched: false,
  };
}

async function forceExactAutocompleteSelection(
  page: Page,
  selector: string,
  control: Locator,
  input: string,
  field: StationSelection["field"],
  checkBahnhofSuffix: BahnhofSuffixCheck,
  exactStation: string,
) {
  await fillPlainControl(control, exactStation, { tab: false });
  await waitForAutocompleteOptions(page, selector);
  const dropdownChoices = await readAutocompleteOptions(page, selector);
  const exactChoice = dropdownChoices.find((choice) =>
    stationValuesMatch(choice, exactStation)
  );
  if (!exactChoice) {
    await closeAutocompleteFlyout(page, selector, control);
    return {
      field,
      input,
      checkBahnhofSuffix,
      candidatesTried: [exactStation],
      dropdownChoices: uniqueStrings(dropdownChoices),
      selected: await controlInputValue(control),
      matched: false,
    };
  }
  const selected = await clickAutocompleteOptionByText(page, selector, exactChoice);
  const committed = selected
    ? await commitAutocompleteSelection(page, selector, control)
    : await controlInputValue(control);
  return {
    field,
    input,
    checkBahnhofSuffix,
    candidatesTried: [exactStation],
    dropdownChoices: uniqueStrings([...dropdownChoices, exactChoice]),
    selected: committed,
    matched: stationValuesMatch(committed, exactChoice),
  };
}

async function commitAutocompleteSelection(
  page: Page,
  selector: string,
  control: Locator,
) {
  await page.waitForTimeout(500);
  await closeAutocompleteFlyout(page, selector, control);
  return controlInputValue(control);
}

async function closeAutocompleteFlyout(
  page: Page,
  selector: string,
  control: Locator,
) {
  await page.keyboard.press("Escape").catch(() => undefined);
  await control.evaluate((element) => {
    (element as HTMLElement).blur();
  }).catch(() => undefined);
  await page.mouse.click(10, 10).catch(() => undefined);
  await page.keyboard.press("Escape").catch(() => undefined);
  await activeAutocompleteFlyout(page, selector)
    .first()
    .waitFor({ state: "hidden", timeout: 1500 })
    .catch(() => undefined);
}

async function retryAutocompleteSelection(
  page: Page,
  selector: string,
  control: Locator,
  selected: string,
) {
  await fillPlainControl(control, selected, { tab: false });
  await waitForAutocompleteOptions(page, selector);
  await clickAutocompleteOptionByText(page, selector, selected);
  return commitAutocompleteSelection(page, selector, control);
}

function stationValuesMatch(left?: string, right?: string) {
  if (!left || !right) {
    return false;
  }
  const normalizedLeft = normalizeStationMatchText(left);
  const normalizedRight = normalizeStationMatchText(right);
  return normalizedLeft === normalizedRight ||
    normalizedLeft.includes(normalizedRight) ||
    normalizedRight.includes(normalizedLeft);
}

async function clickAutocompleteOptionByText(
  page: Page,
  selector: string,
  value: string,
) {
  const normalizedValue = normalizeStationMatchText(value);
  const options = autocompleteOptions(page, selector);
  const match = await options.evaluateAll((nodes, target) => {
    const normalize = (text: string) => text
      .normalize("NFKD")
      .replace(/\p{Diacritic}/gu, "")
      .replace(/\b(?:hauptbahnhof|hbf)\b/gi, " hbf ")
      .replace(/[()\\/,-]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();
    for (const [index, node] of nodes.entries()) {
      const text = (node.textContent || "").trim().replace(/\s+/g, " ");
      if (normalize(text) === target) {
        return { index, text };
      }
    }
    return undefined;
  }, normalizedValue);
  if (!match) {
    return undefined;
  }
  await options.nth(match.index).click({ force: true });
  return match.text;
}

export function bestAutocompleteChoice(input: string, choices: string[]) {
  let best: { choice: string; score: number } | undefined;
  for (const choice of uniqueStrings(choices)) {
    if (expectsMainStation(input) && !looksLikeMainStationChoice(input, choice)) {
      continue;
    }
    const score = scoreStationOption(input, choice);
    if (score >= 2 && (!best || score > best.score)) {
      best = { choice, score };
    }
  }
  return best?.choice;
}

function expectsMainStation(input: string) {
  return /\b(?:hbf|hauptbahnhof)\b/i.test(input);
}

function looksLikeMainStationChoice(input: string, choice: string) {
  const inputTokens = stationTokens(input);
  const choiceTokens = stationTokens(choice);
  if (!inputTokens.includes("hbf")) {
    return true;
  }
  const cityTokens = inputTokens.filter((token) => token !== "hbf");
  return choiceTokens.includes("hbf") &&
    cityTokens.some((token) => choiceTokens.includes(token));
}

async function clickMatchingAutocompleteOption(
  page: Page,
  selector: string,
  value?: string,
  checkBahnhofSuffix: BahnhofSuffixCheck = "both",
) {
  if (!value) {
    return undefined;
  }
  const candidates = stationAutocompleteCandidates(value, checkBahnhofSuffix)
    .map(normalizeStationMatchText);
  const match = await autocompleteOptions(page, selector).evaluateAll(
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
        const inputSet = new Set(inputTokens);
        const extraTokens = [...new Set(optionTokens)]
          .filter((token) => !inputSet.has(token));
        const extraPenalty = Math.min(1.5, extraTokens.length * 0.75);
        return (score / Math.max(1, inputSet.size)) - extraPenalty;
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
      const isHbfExpected = (input: string, option: string) => {
        const inputTokens = tokens(input);
        if (!inputTokens.includes("hbf")) {
          return true;
        }
        const optionTokens = tokens(option);
        const cityTokens = inputTokens.filter((token) => token !== "hbf");
        return optionTokens.includes("hbf") &&
          cityTokens.some((token) => optionTokens.includes(token));
      };
      let best: { index: number; text: string; score: number } | undefined;
      for (const [index, node] of nodes.entries()) {
        const text = node.textContent || "";
        if (!isHbfExpected(payload.value, text)) {
          continue;
        }
        const normalizedOption = normalize(text);
        const exactScore = payload.candidates.some((candidate) =>
          normalizedOption.includes(candidate)
        )
          ? 100
          : 0;
        const hbfScore = isHbfMatch(payload.value, text) ? 50 : 0;
        const overlapScore = scoreOption(payload.value, text);
        const specificityScore = scoreOption(payload.value, text);
        const score = Math.max(exactScore, hbfScore, overlapScore) + specificityScore;
        if (score >= 2 && (!best || score > best.score)) {
          best = { index, text: text.trim().replace(/\s+/g, " "), score };
        }
      }
      if (!best) {
        return undefined;
      }
      return { index: best.index, text: best.text };
    },
    { candidates, value },
  );
  if (!match) {
    return undefined;
  }
  await autocompleteOptions(page, selector).nth(match.index).click({ force: true });
  return match.text;
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

function activeAutocompleteFlyout(page: Page, selector: string) {
  const id = selector.replace(/^#/, "");
  return page.locator(`#wrapper${id}.flyout-active, #wrapper${id} .flyout-active`);
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

export function stationAutocompleteCandidates(
  value: string,
  checkBahnhofSuffix: BahnhofSuffixCheck = "both",
) {
  const normalized = value.replace(/\bHBF\b/gi, "Hbf").trim();
  const candidates = new Set<string>();
  for (const expanded of stationCandidateVariants(normalized, checkBahnhofSuffix)) {
    const trimmed = expanded.trim();
    if (trimmed) {
      candidates.add(trimmed);
    }
  }
  return [...candidates];
}

function stationCandidateVariants(
  value: string,
  checkBahnhofSuffix: BahnhofSuffixCheck,
) {
  const cityOnly = value
    .replace(/\b(?:Hbf|HBF|Hauptbahnhof|Bf|BF|Bahnhof)\b/gi, "")
    .replace(/[()\\/,-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (checkBahnhofSuffix === "hbf_only") {
    return stationProbeVectors(cityOnly || value, ["city", "hb"]);
  }
  if (checkBahnhofSuffix === "bf_only") {
    return stationProbeVectors(cityOnly || value, ["city", "b"]);
  }
  return stationProbeVectors(cityOnly || value, ["city", "b", "hb"]);
}

function stationProbeVectors(
  city: string,
  suffixes: Array<"city" | "b" | "hb">,
) {
  const trimmedCity = city.trim();
  return suffixes.map((suffix) => {
    if (suffix === "b") {
      return `${trimmedCity} B`;
    }
    if (suffix === "hb") {
      return `${trimmedCity} Hb`;
    }
    return trimmedCity;
  });
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
  const inputSet = new Set(inputTokens);
  const extraTokens = [...new Set(optionTokens)].filter((token) => !inputSet.has(token));
  const extraPenalty = Math.min(1.5, extraTokens.length * 0.75);
  return (score / Math.max(1, inputSet.size)) - extraPenalty;
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

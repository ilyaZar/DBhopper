import fs from "node:fs/promises";
import path from "node:path";
import { createTimestampedArtifactDir, safeArtifactSegment, } from "./artifacts.js";
import { errorMessage } from "./errors.js";
import { resolveClaimFilePath } from "./workspace.js";
import { fillSensitiveTextControl } from "./sensitive-input.js";
export const BAHNHOF_SUFFIX_CHECKS = ["both", "hbf_only", "bf_only"];
const ENTRY_URL = "https://www.mobil.nrw/fahren/mobigarantie.html";
const FORM_PAGE_URL = "https://www.mobil.nrw/fahren/mobigarantie/einreichen.html";
const DEFAULT_TIMEOUT_MS = 180000;
const LIVE_FORM_SETTLE_MS = 5000;
export async function probeBrowser(config = {}) {
    const browser = await launchBrowser(config);
    const page = await browser.newPage({
        viewport: { width: 1280, height: 1400 },
        locale: "de-DE",
    });
    try {
        await page.goto(FORM_PAGE_URL, { waitUntil: "domcontentloaded", timeout: 45000 });
        await storeDefaultCookieServicesIfVisible(page);
        await acceptConsentUntilFormVisible(page);
        await page.waitForSelector("#formCreator", { timeout: 45000 });
        await page.waitForTimeout(1000);
        const controls = await visibleControls(page);
        return {
            ok: true,
            url: FORM_PAGE_URL,
            title: await page.title(),
            controls,
        };
    }
    finally {
        await browser.close();
    }
}
export async function runBrowserClaim(params) {
    const mode = params.mode || "dry_run";
    if (mode === "submit" && params.confirmSubmit !== true) {
        throw new Error("confirmSubmit must be true for submit mode");
    }
    const timeoutMs = params.timeoutMs || DEFAULT_TIMEOUT_MS;
    const started = Date.now();
    const artifacts = [];
    const stationSelections = [];
    const testRunClaimRequest = params.testRunClaimRequest === true;
    let entryFlow = defaultEntryFlow();
    const artifactDir = await createArtifactDir(params);
    let browser;
    let page;
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
        entryFlow = await openClaimForm(page, artifactDir, artifacts, testRunClaimRequest);
        await captureDebugStage(page, artifactDir, "open-form", artifacts, testRunClaimRequest);
        stage = "legal";
        await checkRequiredLegalQuestion(page);
        await clickVisibleSave(page);
        await captureDebugStage(page, artifactDir, "legal", artifacts, testRunClaimRequest);
        stage = "claimant";
        await fillClaimant(page, params.claim);
        await clickVisibleSave(page);
        await captureDebugStage(page, artifactDir, "claimant", artifacts, testRunClaimRequest);
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
            await captureDebugStage(page, artifactDir, "station-resolution", artifacts, testRunClaimRequest);
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
        await captureDebugStage(page, artifactDir, "journey", artifacts, testRunClaimRequest);
        stage = "ticket";
        await fillTicket(page, params.claim, params.claimDir);
        await clickVisibleSave(page);
        await captureDebugStage(page, artifactDir, "ticket", artifacts, testRunClaimRequest);
        stage = "bank";
        await fillBank(page, params.claim);
        await clickVisibleSave(page);
        await captureDebugStage(page, artifactDir, "bank", artifacts, testRunClaimRequest);
        stage = "summary";
        const summaryScreenshot = await saveScreenshot(page, artifactDir, "summary");
        artifacts.push(summaryScreenshot);
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
        const proof = await submitAndCollectProof(page, params.claimDir, artifactDir);
        if (proof.submittedScreenshot) {
            artifacts.push(proof.submittedScreenshot);
        }
        if (proof.submissionPdf) {
            artifacts.push(proof.submissionPdf);
        }
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
            submittedScreenshot: proof.submittedScreenshot,
            submissionPdf: proof.submissionPdf,
            submitted: true,
            needsUserAction: false,
            message: "claim submitted and available artifacts were saved",
        };
    }
    catch (error) {
        if (page) {
            try {
                await captureDebugStage(page, artifactDir, `blocked-${stage}`, artifacts, testRunClaimRequest);
            }
            catch {
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
    }
    finally {
        await browser?.close();
    }
}
function defaultEntryFlow() {
    return {
        entryUrl: ENTRY_URL,
        formPageUrl: FORM_PAGE_URL,
        startedAtPublicEntry: false,
        storedEntryCookieServices: false,
        acceptedFormConsent: false,
    };
}
async function openClaimForm(page, artifactDir, artifacts, testRunClaimRequest) {
    const entryFlow = defaultEntryFlow();
    await page.goto(ENTRY_URL, { waitUntil: "domcontentloaded" });
    entryFlow.startedAtPublicEntry = true;
    await page.waitForLoadState("networkidle", { timeout: 5000 }).catch(() => undefined);
    entryFlow.storedEntryCookieServices = await storeDefaultCookieServicesIfVisible(page);
    if (entryFlow.storedEntryCookieServices) {
        await page.waitForTimeout(1000);
    }
    await captureDebugStage(page, artifactDir, "entry", artifacts, testRunClaimRequest);
    await openPublicFormPage(page);
    await page.waitForLoadState("domcontentloaded", { timeout: 10000 }).catch(() => undefined);
    entryFlow.storedEntryCookieServices =
        await storeDefaultCookieServicesIfVisible(page) ||
            entryFlow.storedEntryCookieServices;
    await captureDebugStage(page, artifactDir, "consent", artifacts, testRunClaimRequest);
    entryFlow.acceptedFormConsent = await acceptConsentUntilFormVisible(page);
    await waitForFormCreator(page);
    return entryFlow;
}
async function storeDefaultCookieServicesIfVisible(page) {
    const cookieDialogVisible = await page
        .getByText(/Cookie-Einstellungen|Wir schätzen Ihre Privatsphäre/i)
        .first()
        .isVisible({ timeout: 1000 })
        .catch(() => false);
    if (!cookieDialogVisible) {
        return false;
    }
    const button = await visibleButtonByName(page, /^Services speichern$/i) ||
        await visibleButtonByName(page, /^Alles akzeptieren$/i);
    if (!button) {
        return false;
    }
    await button
        .evaluate((element) => {
        element.click();
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
async function visibleButtonByName(page, name) {
    const button = page.getByRole("button", { name }).filter({ visible: true }).first();
    if ((await button.count()) === 0) {
        return undefined;
    }
    return button;
}
async function openPublicFormPage(page) {
    const formPagePattern = /\/fahren\/mobigarantie\/einreichen\.html(?:$|[?#])/;
    const link = page
        .locator('a[href*="/fahren/mobigarantie/einreichen.html"]')
        .filter({ visible: true })
        .first();
    if ((await link.count()) === 0) {
        await page.goto(FORM_PAGE_URL, { waitUntil: "domcontentloaded" });
        await page.waitForURL(formPagePattern, { timeout: 10000 });
        return;
    }
    await link.click({ force: true }).catch(async () => {
        await link.evaluate((element) => {
            element.click();
        });
    });
    if (!formPagePattern.test(page.url())) {
        await page.goto(FORM_PAGE_URL, { waitUntil: "domcontentloaded" });
    }
    await page.waitForURL(formPagePattern, { timeout: 10000 });
}
async function acceptConsentUntilFormVisible(page) {
    let accepted = false;
    for (let index = 0; index < 3; index += 1) {
        await storeDefaultCookieServicesIfVisible(page);
        const clicked = await clickVisibleAccept(page);
        if (clicked) {
            accepted = true;
            await page.waitForTimeout(2500);
        }
        if (await legalQuestionVisible(page)) {
            return accepted;
        }
        if (!clicked) {
            await page.waitForTimeout(1000);
        }
    }
    return accepted;
}
async function clickVisibleAccept(page) {
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
async function waitForFormCreator(page) {
    await page.waitForSelector("#formCreator", { timeout: 45000 });
    await page.getByText(/Ich habe die Regeln/i)
        .filter({ visible: true })
        .first()
        .waitFor({ state: "visible", timeout: 45000 });
}
async function legalQuestionVisible(page) {
    return page.getByText(/Ich habe die Regeln/i)
        .filter({ visible: true })
        .first()
        .isVisible({ timeout: 1000 })
        .catch(() => false);
}
export async function launchBrowser(config) {
    const { chromium } = await import("playwright-core");
    const executablePath = await resolveBrowserExecutablePath(config);
    return chromium.launch({
        executablePath,
        headless: config.headless === true,
        args: ["--disable-dev-shm-usage"],
    });
}
export async function resolveBrowserExecutablePath(config) {
    const executablePath = config.browserExecutablePath ||
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
        }
        catch {
            // Try the next common path.
        }
    }
    return undefined;
}
async function fillClaimant(page, claim) {
    const claimant = claim.claimant || {};
    const salutation = claimant.salutation || "FAMILY";
    const labelBySalutation = {
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
async function fillJourney(page, claim, checkBahnhofSuffix, stopAfterStationResolution = false) {
    const journey = claim.journey || {};
    const stationSelections = [];
    await fillDate(page, "#dateOfEvent", journey.date);
    await fillTime(page, "#complaintTime", journey.scheduledDepartureTime);
    const startSelection = await chooseAutocomplete(page, "#startStation", journey.startStation, "startStation", checkBahnhofSuffix.startStation, checkBahnhofSuffix.exactDeparture);
    if (startSelection) {
        stationSelections.push(startSelection);
    }
    const endSelection = await chooseAutocomplete(page, "#endStation", journey.endStation, "endStation", checkBahnhofSuffix.endStation, checkBahnhofSuffix.exactArrival);
    if (endSelection) {
        stationSelections.push(endSelection);
    }
    if (stopAfterStationResolution) {
        return { stationSelections, stoppedAfterStationResolution: true };
    }
    const failedStation = stationSelections.find((entry) => !entry.matched);
    if (failedStation) {
        throw new Error(`${failedStation.field} requires exact_station_departure or exact_station_arrival from a live dropdown choice`);
    }
    await clickSearchRoutes(page);
    await page.waitForTimeout(LIVE_FORM_SETTLE_MS);
    await page.locator("#descriptionControl").click();
    await fill(page, "#tripNotFoundDescription", [
        journey.plannedLine || journey.plannedTrainLabel || "planned local service",
        typeof journey.delayMinutes === "number"
            ? `${journey.delayMinutes} minutes delay`
            : undefined,
        journey.disruptionType || "delay",
    ].filter(Boolean).join("; "));
    return { stationSelections, stoppedAfterStationResolution: false };
}
async function fillTicket(page, claim, claimDir) {
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
function claimFilePaths(file) {
    return [
        ...(file.path ? [file.path] : []),
        ...(Array.isArray(file.paths) ? file.paths : []),
    ];
}
async function fillBank(page, claim) {
    await fill(page, "#accountOwner", claim.claimant?.bank?.accountOwner);
    await fill(page, "#iban", normalizeIbanForBrowser(claim.claimant?.bank?.iban));
    await page.waitForTimeout(1500);
}
async function submitAndCollectProof(page, claimDir, artifactDir) {
    const downloadPromise = page.waitForEvent("download", { timeout: 60000 }).catch(() => null);
    await page.getByRole("button", { name: /Angaben absenden/i }).click();
    await page.waitForTimeout(3000);
    const submittedScreenshot = await saveScreenshot(page, artifactDir, "submitted").catch(() => undefined);
    const downloadButton = page
        .getByRole("button", { name: /download|pdf|herunterladen|bestätigung/i })
        .or(page.getByRole("link", { name: /download|pdf|herunterladen|bestätigung/i }))
        .first();
    if (await downloadButton.isVisible().catch(() => false)) {
        await downloadButton.click().catch(() => undefined);
    }
    const download = await downloadPromise;
    if (!download) {
        return { submittedScreenshot };
    }
    const target = path.join(claimDir, "submission-confirmation.pdf");
    const submissionPdf = await download.saveAs(target).then(() => target, () => undefined);
    return { submittedScreenshot, submissionPdf };
}
async function chooseAutocomplete(page, selector, value, field, checkBahnhofSuffix, exactStation) {
    if (!value) {
        return undefined;
    }
    const control = await visibleOrFirst(page, selector);
    if (exactStation?.trim()) {
        return forceExactAutocompleteSelection(page, selector, control, value, field, checkBahnhofSuffix, exactStation.trim());
    }
    const candidatesTried = stationAutocompleteCandidates(value, checkBahnhofSuffix);
    const dropdownChoices = [];
    const probeChoices = [];
    for (const candidate of candidatesTried) {
        await fillPlainControl(control, candidate, { tab: false });
        await page.waitForTimeout(750);
        await waitForAutocompleteOptions(page, selector);
        const choices = await readAutocompleteOptions(page, selector);
        probeChoices.push({ candidate, choices });
        dropdownChoices.push(...choices);
        await closeAutocompleteFlyout(page, selector, control);
    }
    await hideAutocompleteFlyout(page, selector);
    return {
        field,
        input: value,
        checkBahnhofSuffix,
        candidatesTried,
        dropdownChoices: uniqueStrings(dropdownChoices),
        probeChoices,
        matched: false,
    };
}
async function forceExactAutocompleteSelection(page, selector, control, input, field, checkBahnhofSuffix, exactStation) {
    await fillPlainControl(control, exactStation, { tab: false });
    const dropdownChoices = await readAutocompleteOptionsForExact(page, selector, exactStation);
    const exactChoice = dropdownChoices.find((choice) => exactOptionLabelMatch(choice, exactStation));
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
    await hideAutocompleteFlyout(page, selector);
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
async function readAutocompleteOptionsForExact(page, selector, exactStation) {
    const started = Date.now();
    let choices = [];
    while (Date.now() - started < LIVE_FORM_SETTLE_MS) {
        await waitForAutocompleteOptions(page, selector);
        choices = await readAutocompleteOptions(page, selector);
        if (choices.some((choice) => exactOptionLabelMatch(choice, exactStation))) {
            return choices;
        }
        await page.waitForTimeout(500);
    }
    return choices;
}
async function commitAutocompleteSelection(page, selector, control) {
    await page.waitForTimeout(500);
    await closeAutocompleteFlyout(page, selector, control);
    return controlInputValue(control);
}
async function closeAutocompleteFlyout(page, selector, control) {
    await page.keyboard.press("Escape").catch(() => undefined);
    await control.evaluate((element) => {
        element.blur();
    }).catch(() => undefined);
    await page.mouse.click(10, 10).catch(() => undefined);
    await page.keyboard.press("Escape").catch(() => undefined);
    await activeAutocompleteFlyout(page, selector)
        .first()
        .waitFor({ state: "hidden", timeout: 1500 })
        .catch(() => undefined);
    await deactivateAutocompleteFlyout(page, selector);
}
async function deactivateAutocompleteFlyout(page, selector) {
    const id = selector.replace(/^#/, "");
    await page.evaluate((controlId) => {
        for (const wrapperId of [`wrapper${controlId}`, `wrapper_${controlId}`]) {
            const wrapper = document.getElementById(wrapperId);
            wrapper?.classList.remove("flyout-active");
            wrapper?.setAttribute("aria-hidden", "true");
        }
        const control = document.getElementById(controlId);
        control?.setAttribute("aria-expanded", "false");
    }, id);
}
async function hideAutocompleteFlyout(page, selector) {
    const id = selector.replace(/^#/, "");
    await page.evaluate((controlId) => {
        for (const wrapperId of [`wrapper${controlId}`, `wrapper_${controlId}`]) {
            const wrapper = document.getElementById(wrapperId);
            if (wrapper instanceof HTMLElement) {
                wrapper.classList.remove("flyout-active");
                wrapper.setAttribute("aria-hidden", "true");
                wrapper.style.display = "none";
                wrapper.style.pointerEvents = "none";
            }
        }
        const control = document.getElementById(controlId);
        control?.setAttribute("aria-expanded", "false");
    }, id);
}
function stationValuesMatch(left, right) {
    if (!left || !right) {
        return false;
    }
    const normalizedLeft = normalizeStationMatchText(left);
    const normalizedRight = normalizeStationMatchText(right);
    return normalizedLeft === normalizedRight ||
        normalizedLeft.includes(normalizedRight) ||
        normalizedRight.includes(normalizedLeft);
}
function exactOptionLabelMatch(left, right) {
    if (!left || !right) {
        return false;
    }
    return normalizeStationMatchText(left) === normalizeStationMatchText(right);
}
async function clickAutocompleteOptionByText(page, selector, value) {
    const normalizedValue = normalizeStationMatchText(value);
    const options = autocompleteOptions(page, selector);
    const match = await options.evaluateAll((nodes, target) => {
        const normalize = (text) => text
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
                node.click();
                return { index, text };
            }
        }
        return undefined;
    }, normalizedValue);
    if (!match) {
        return undefined;
    }
    return match.text;
}
async function readAutocompleteOptions(page, selector) {
    await waitForAutocompleteOptions(page, selector);
    return autocompleteOptions(page, selector).evaluateAll((nodes) => {
        const labels = nodes
            .map((node) => (node.textContent || "").trim().replace(/\s+/g, " "))
            .filter(Boolean);
        return [...new Set(labels)].slice(0, 30);
    });
}
async function controlInputValue(control) {
    return control.inputValue().catch(() => undefined);
}
function autocompleteOptions(page, selector) {
    const id = selector.replace(/^#/, "");
    return page.locator([
        `#wrapper${id} button[role="option"]`,
        `#wrapper_${id} button[role="option"]`,
        `button[role="option"][id^="${id}_"]`,
    ].join(", ")).filter({ visible: true });
}
function activeAutocompleteFlyout(page, selector) {
    const id = selector.replace(/^#/, "");
    return page.locator(`#wrapper${id}.flyout-active, #wrapper${id} .flyout-active, ` +
        `#wrapper_${id}.flyout-active, #wrapper_${id} .flyout-active`);
}
async function waitForAutocompleteOptions(page, selector) {
    await autocompleteOptions(page, selector)
        .first()
        .waitFor({ state: "visible", timeout: 2500 })
        .catch(() => undefined);
}
async function clickVisibleSave(page) {
    await page.getByRole("button", { name: /Speichern.*weiter/i }).filter({ visible: true }).first().click();
}
async function clickSearchRoutes(page) {
    await page.keyboard.press("Escape").catch(() => undefined);
    await page.waitForTimeout(300);
    const button = page.getByRole("button", { name: /Verbindung suchen/i }).first();
    await button.evaluate((element) => {
        element.click();
    });
}
async function fill(page, selector, value) {
    if (value === undefined || value === null || value === "") {
        return;
    }
    await fillSensitiveTextControl(await visibleOrFirst(page, selector), String(value));
}
async function fillDate(page, selector, value) {
    if (!value) {
        return;
    }
    const control = await visibleOrFirst(page, selector);
    await control.fill(value);
}
async function fillTime(page, selector, value) {
    if (!value) {
        return;
    }
    const control = await visibleOrFirst(page, selector);
    await control.fill(value);
}
async function fillPlainControl(control, value, options = {}) {
    await control.waitFor({ state: "visible" });
    await control.click();
    await control.press(process.platform === "darwin" ? "Meta+A" : "Control+A");
    await control.press("Backspace");
    await control.pressSequentially(value, { delay: 25 });
    if (options.tab !== false) {
        await control.press("Tab");
    }
}
async function clickText(page, text) {
    await page.getByText(text).filter({ visible: true }).first().click();
}
async function checkRequiredLegalQuestion(page) {
    const checkbox = page
        .getByRole("checkbox", { name: /Ich habe die Regeln/i })
        .filter({ visible: true })
        .first();
    if ((await checkbox.count()) > 0) {
        await checkbox.check({ force: true });
        return;
    }
    await clickText(page, /Ich habe die Regeln/i);
}
async function selectLabel(page, selector, label, required = true) {
    const control = await visibleOrFirst(page, selector);
    const optionLabel = await matchingSelectOptionLabel(control, label);
    if (optionLabel) {
        await control.selectOption({ label: optionLabel });
        return;
    }
    if (!required) {
        return;
    }
    throw new Error(`${selector} option not found for ${label}`);
}
async function matchingSelectOptionLabel(control, label) {
    const normalizedLabel = normalizeOptionText(label);
    const options = await control.locator("option").evaluateAll((nodes) => nodes.map((node) => node.textContent?.trim() || "").filter(Boolean));
    const matches = options.filter((option) => {
        const normalizedOption = normalizeOptionText(option);
        return (normalizedOption === normalizedLabel ||
            normalizedOption.startsWith(normalizedLabel) ||
            normalizedOption.includes(normalizedLabel));
    });
    return matches.length === 1 ? matches[0] : undefined;
}
async function visibleOrFirst(page, selector) {
    const visible = page.locator(selector).filter({ visible: true }).first();
    if ((await visible.count()) > 0) {
        return visible;
    }
    return page.locator(selector).first();
}
async function visibleControls(page) {
    return page.locator("input, select, textarea, button, label").evaluateAll((nodes) => nodes
        .map((el) => ({
        tag: el.tagName.toLowerCase(),
        id: el.id || undefined,
        name: el.getAttribute("name") || undefined,
        type: el.getAttribute("type") || undefined,
        text: (el.innerText || el.textContent || "").trim().replace(/\s+/g, " "),
        visible: Boolean(el.offsetWidth ||
            el.offsetHeight ||
            el.getClientRects().length),
    }))
        .filter((entry) => entry.visible || entry.id)
        .slice(0, 120));
}
async function captureStage(page, artifactDir, label, artifacts) {
    artifacts.push(await savePageText(page, artifactDir, label));
    artifacts.push(await saveScreenshot(page, artifactDir, label));
}
async function captureDebugStage(page, artifactDir, label, artifacts, enabled) {
    if (!enabled) {
        return;
    }
    await captureStage(page, artifactDir, label, artifacts);
}
async function createArtifactDir(params) {
    const root = params.testRunClaimRequest === true
        ? path.join(params.claimDir, "test-runs")
        : path.join(params.claimDir, "review");
    const prefix = params.testRunClaimRequest === true
        ? "claim-browser-test-run"
        : "claim-review";
    return createTimestampedArtifactDir(root, prefix);
}
async function savePageText(page, artifactDir, label) {
    const target = path.join(artifactDir, `${safeArtifactLabel(label)}.txt`);
    const text = await page.locator("body").innerText().catch(() => "");
    await fs.writeFile(target, `${text}\n`, "utf8");
    return target;
}
async function saveScreenshot(page, artifactDir, label) {
    const target = path.join(artifactDir, `${safeArtifactLabel(label)}.png`);
    await page.screenshot({ path: target, fullPage: true });
    return target;
}
function safeArtifactLabel(value) {
    return `browser-${safeArtifactSegment(value)}`;
}
function formatEuro(value) {
    if (value === undefined || value === null) {
        return undefined;
    }
    return value.toFixed(2).replace(".", ",");
}
export function normalizePhoneForBrowser(value) {
    return normalizeWhitespaceSeparatedNumber(value);
}
export function normalizeIbanForBrowser(value) {
    return normalizeWhitespaceSeparatedNumber(value)?.toUpperCase();
}
function normalizeWhitespaceSeparatedNumber(value) {
    return value?.replace(/\s+/g, "").trim();
}
export function stationAutocompleteCandidates(value, checkBahnhofSuffix = "both") {
    const normalized = value.replace(/\bHBF\b/gi, "Hbf").trim();
    const candidates = new Set();
    for (const expanded of stationCandidateVariants(normalized, checkBahnhofSuffix)) {
        const trimmed = expanded.trim();
        if (trimmed) {
            candidates.add(trimmed);
        }
    }
    return [...candidates];
}
function stationCandidateVariants(value, checkBahnhofSuffix) {
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
    return stationProbeVectors(cityOnly || value, ["city", "hb", "b"]);
}
function stationProbeVectors(city, suffixes) {
    const trimmedCity = city.trim();
    return suffixes.map((suffix) => {
        if (suffix === "b") {
            return `${trimmedCity} Bf`;
        }
        if (suffix === "hb") {
            return `${trimmedCity} Hbf`;
        }
        return trimmedCity;
    });
}
function normalizeStationMatchText(value) {
    return value
        .normalize("NFKD")
        .replace(/\p{Diacritic}/gu, "")
        .replace(/\b(?:hauptbahnhof|hbf)\b/gi, " hbf ")
        .replace(/[()\\/,-]/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .toLowerCase();
}
function uniqueStrings(values) {
    return [...new Set(values.filter(Boolean))];
}
function normalizeOptionText(value) {
    return value
        .normalize("NFKD")
        .replace(/\p{Diacritic}/gu, "")
        .replace(/\s+/g, " ")
        .trim()
        .toLowerCase();
}
function escapeRegExp(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

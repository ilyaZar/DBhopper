import fs from "node:fs/promises";
import path from "node:path";
import { createTimestampedArtifactDir, safeArtifactSegment, } from "./artifacts.js";
import { errorMessage } from "./errors.js";
import { resolveClaimFilePath } from "./workspace.js";
const FORM_URL = "https://mg.kcm-nrw.de/elmapublic/";
const DEFAULT_TIMEOUT_MS = 180000;
export async function probeBrowser(config = {}) {
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
        await fillJourney(page, params.claim);
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
            submitted: true,
            needsUserAction: false,
            message: "claim submitted and available artifacts were saved",
        };
    }
    catch (error) {
        if (page) {
            try {
                await captureStage(page, artifactDir, `blocked-${stage}`, artifacts);
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
            submitted: false,
            needsUserAction: true,
            message: errorMessage(error),
        };
    }
    finally {
        await browser?.close();
    }
}
export async function launchBrowser(config) {
    const { chromium } = await import("playwright-core");
    const executablePath = await resolveBrowserExecutablePath(config);
    return chromium.launch({
        executablePath,
        headless: config.headless !== false,
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
    await fill(page, "#phoneNo", claimant.phone);
    await fill(page, "#streetNumber", claimant.address?.streetNumber);
    await fill(page, "#zip", claimant.address?.zip);
    await fill(page, "#city", claimant.address?.city);
    await fill(page, "#country", claimant.address?.country || "Deutschland");
}
async function fillJourney(page, claim) {
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
        await fill(page, "#tripNotFoundDescription", [
            journey.plannedLine || journey.plannedTrainLabel || "planned local service",
            `${journey.delayMinutes || "unknown"} minutes delay`,
            journey.disruptionType || "delay",
        ].join("; "));
    }
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
            uploadPaths.push(await resolveClaimFilePath(claimDir, file.path));
        }
    }
    if (uploadPaths.length > 0) {
        await page.locator('input[type="file"]').first().setInputFiles(uploadPaths);
        await page.waitForTimeout(3000);
    }
}
async function fillBank(page, claim) {
    await fill(page, "#accountOwner", claim.claimant?.bank?.accountOwner);
    await fill(page, "#iban", claim.claimant?.bank?.iban);
    await page.waitForTimeout(1500);
}
async function submitAndDownload(page, claimDir) {
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
async function chooseAutocomplete(page, selector, value) {
    await fill(page, selector, value);
    await page.waitForTimeout(1200);
    await page.keyboard.press("ArrowDown").catch(() => undefined);
    await page.keyboard.press("Enter").catch(() => undefined);
}
async function clickVisibleSave(page) {
    await page.getByRole("button", { name: /Speichern.*weiter/i }).filter({ visible: true }).first().click();
}
async function fill(page, selector, value) {
    if (value === undefined || value === null || value === "") {
        return;
    }
    await (await visibleOrFirst(page, selector)).fill(String(value));
}
async function clickText(page, text) {
    await page.getByText(text).filter({ visible: true }).first().click();
}
async function selectLabel(page, selector, label, required = true) {
    try {
        await (await visibleOrFirst(page, selector)).selectOption({ label });
        return;
    }
    catch (error) {
        if (required) {
            throw error;
        }
    }
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
async function createArtifactDir(params) {
    const claimId = safeArtifactSegment(path.basename(params.claimDir));
    const artifactRoot = params.artifactRoot || path.join(path.dirname(path.dirname(params.claimDir)), "tmp");
    return createTimestampedArtifactDir(artifactRoot, claimId);
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
function escapeRegExp(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

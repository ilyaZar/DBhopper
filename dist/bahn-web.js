import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { resolveBrowserExecutablePath } from "./browser.js";
import { DEFAULT_TIME_ZONE, derivePublicCategory, localDateTimeToUtc, normalizeStationName, stationMatches, } from "./db-delay.js";
export const BAHN_WEB_SOURCE_API = "bahn-web";
export const DEFAULT_BAHN_WEB_BASE_URL = "https://int.bahn.de/web/api";
export const BAHN_WEB_FALLBACK_BASE_URL = "https://www.bahn.de/web/api";
export const DEFAULT_BAHN_WEB_TRANSPORT = "auto";
export const DEFAULT_BAHN_WEB_REQUEST_TIMEOUT_MS = 20000;
const execFileAsync = promisify(execFile);
const BAHN_WEB_HEADERS = {
    accept: "application/json",
    "accept-language": "de-DE,de;q=0.9,en;q=0.8",
    "user-agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 " +
        "(KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
};
const RAIL_PRODUCTS = ["ICE", "EC_IC", "IR", "REGIONAL", "SBAHN"];
const ALLOWED_HOSTS = new Set(["int.bahn.de", "www.bahn.de"]);
export const BAHN_WEB_RESEARCH_SUMMARY = {
    source: "DB passenger website JSON endpoint",
    endpoints: [
        "GET /reiseloesung/orte",
        "GET /reiseloesung/abfahrten",
    ],
    defaultBaseUrl: DEFAULT_BAHN_WEB_BASE_URL,
    fallbackBaseUrl: BAHN_WEB_FALLBACK_BASE_URL,
    limitations: [
        "The endpoint is not the DB API Marketplace product and can change without notice.",
        "DB's edge may block direct HTTP clients with OPS_BLOCKED; DBhopper can fall back to curl and Playwright page-context JSON fetch.",
        "If direct HTTP transports are blocked, browser transport uses Playwright page-context fetch and still parses JSON deterministically.",
        "The station-board path is used as route evidence, so stop-level realtime data beyond the boarding station is limited.",
    ],
};
export function createBahnWebProvider(options = {}) {
    return {
        resolveStation: (name) => resolveBahnWebStation(name, options),
        queryStationBoard: (station, timeWindow) => queryBahnWebStationBoard(station, timeWindow, options),
        fetchJourneyDetails: fetchBahnWebJourneyDetails,
    };
}
export async function resolveBahnWebStation(name, options = {}) {
    const raw = await fetchBahnWebJson("/reiseloesung/orte", [["suchbegriff", name]], options);
    return parseBahnWebStations(raw)
        .sort((left, right) => rankStationMatch(left, name) - rankStationMatch(right, name));
}
export async function queryBahnWebStationBoard(station, timeWindow, options = {}) {
    if (!station.evaNo) {
        throw new Error(`station ${station.name} has no EVA number`);
    }
    const timeZone = options.timeZone ?? DEFAULT_TIME_ZONE;
    const anchors = uniqueAnchors([
        timeWindow.lowerBound,
        timeWindow.queryTime,
        timeWindow.upperBound,
    ], timeZone);
    const responses = await Promise.all(anchors.map((anchor) => fetchBahnWebJson("/reiseloesung/abfahrten", buildDepartureParams(station.evaNo ?? "", anchor.date, anchor.time), options)));
    return dedupeStationEvents(responses.flatMap((response) => parseBahnWebDepartures(response, station, timeZone)));
}
export async function fetchBahnWebJourneyDetails(event) {
    if (!event.journey) {
        throw new Error(`Bahn web event ${event.journeyId ?? event.label ?? "unknown"} has no journey details`);
    }
    return event.journey;
}
export function parseBahnWebStations(raw) {
    return toArray(raw)
        .map((entry) => stationRefFromBahnWeb(entry))
        .filter((station) => Boolean(station));
}
export function parseBahnWebDepartures(raw, boardStation, timeZone = DEFAULT_TIME_ZONE) {
    const rawEntries = fieldAttr(raw, "entries");
    const entries = Array.isArray(rawEntries)
        ? rawEntries
        : toArray(raw);
    return entries
        .map((entry) => stationEventFromBahnWebEntry(entry, boardStation, timeZone))
        .filter((event) => Boolean(event));
}
async function fetchBahnWebJson(path, params, options) {
    const errors = [];
    for (const baseUrl of resolveBahnWebBaseUrls(options)) {
        const requestOptions = { ...options, baseUrl };
        const url = buildBahnWebUrl(baseUrl, path, params);
        for (const transport of resolveTransports(options.bahnWebTransport)) {
            try {
                return await fetchJsonByTransport(url, transport, requestOptions);
            }
            catch (error) {
                errors.push(`${transport} ${new URL(baseUrl).host}: ${errorMessage(error)}`);
            }
        }
    }
    throw new Error(`Bahn web request failed: ${errors.join("; ")}`);
}
async function fetchJsonByTransport(url, transport, options) {
    const result = transport === "curl"
        ? await fetchTextWithCurl(url, options)
        : transport === "browser"
            ? await fetchTextWithBrowser(url, options)
            : await fetchTextWithFetch(url, options);
    if (result.status < 200 || result.status >= 300) {
        throw new Error(`HTTP ${result.status}: ${result.body.slice(0, 200).replace(/\s+/g, " ")}`);
    }
    try {
        return JSON.parse(result.body);
    }
    catch (error) {
        throw new Error(`invalid JSON response: ${errorMessage(error)}`);
    }
}
async function fetchTextWithFetch(url, options) {
    const timeoutMs = options.requestTimeoutMs ?? DEFAULT_BAHN_WEB_REQUEST_TIMEOUT_MS;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    const signal = options.signal
        ? AbortSignal.any([options.signal, controller.signal])
        : controller.signal;
    try {
        const response = await (options.fetchImpl ?? fetch)(url, {
            headers: requestHeaders(options.baseUrl),
            signal,
        });
        return {
            status: response.status,
            body: await response.text(),
        };
    }
    finally {
        clearTimeout(timeout);
    }
}
async function fetchTextWithCurl(url, options) {
    const timeoutMs = options.requestTimeoutMs ?? DEFAULT_BAHN_WEB_REQUEST_TIMEOUT_MS;
    const timeoutSeconds = Math.max(1, Math.ceil(timeoutMs / 1000));
    const statusMarker = "\n__DBHOPPER_HTTP_STATUS__:";
    const args = [
        "--silent",
        "--show-error",
        "--location",
        "--globoff",
        "--compressed",
        "--max-time",
        String(timeoutSeconds),
        "--connect-timeout",
        String(Math.min(10, timeoutSeconds)),
        "-H",
        `accept: ${BAHN_WEB_HEADERS.accept}`,
        "-H",
        `accept-language: ${BAHN_WEB_HEADERS["accept-language"]}`,
        "-H",
        `referer: ${new URL(options.baseUrl).origin}/`,
        "-A",
        BAHN_WEB_HEADERS["user-agent"],
        "--write-out",
        `${statusMarker}%{http_code}\n`,
        url,
    ];
    const { stdout } = await execFileAsync(options.curlPath ?? "curl", args, {
        maxBuffer: 5 * 1024 * 1024,
        timeout: timeoutMs + 1000,
        signal: options.signal,
    });
    const markerIndex = stdout.lastIndexOf(statusMarker);
    if (markerIndex < 0) {
        throw new Error("curl response did not include HTTP status marker");
    }
    const body = stdout.slice(0, markerIndex);
    const status = Number(stdout.slice(markerIndex + statusMarker.length).trim());
    if (!Number.isFinite(status)) {
        throw new Error("curl response included invalid HTTP status");
    }
    return { status, body };
}
async function fetchTextWithBrowser(url, options) {
    const timeoutMs = options.requestTimeoutMs ?? DEFAULT_BAHN_WEB_REQUEST_TIMEOUT_MS;
    const { chromium } = await import("playwright-core");
    const browser = await chromium.launch({
        executablePath: await resolveBrowserExecutablePath(options),
        headless: options.headless !== false,
        args: ["--disable-dev-shm-usage"],
    });
    const page = await browser.newPage({ locale: "de-DE" });
    try {
        const origin = new URL(options.baseUrl).origin;
        await page.goto(origin, {
            waitUntil: "domcontentloaded",
            timeout: timeoutMs,
        });
        return await page.evaluate(async ({ targetUrl }) => {
            const response = await fetch(targetUrl, {
                headers: { accept: "application/json" },
            });
            return {
                status: response.status,
                body: await response.text(),
            };
        }, { targetUrl: url });
    }
    finally {
        await browser.close().catch(() => undefined);
    }
}
function requestHeaders(baseUrl) {
    return {
        ...BAHN_WEB_HEADERS,
        referer: `${new URL(baseUrl).origin}/`,
    };
}
function resolveTransports(transport) {
    const selected = transport ?? DEFAULT_BAHN_WEB_TRANSPORT;
    if (selected === "fetch") {
        return ["fetch"];
    }
    if (selected === "curl") {
        return ["curl"];
    }
    if (selected === "browser") {
        return ["browser"];
    }
    return ["fetch", "curl", "browser"];
}
function resolveBahnWebBaseUrls(options) {
    const configured = options.bahnWebBaseUrl?.trim();
    const urls = configured
        ? [configured]
        : [DEFAULT_BAHN_WEB_BASE_URL, BAHN_WEB_FALLBACK_BASE_URL];
    return urls.map(normalizeAllowedBahnWebBaseUrl);
}
function normalizeAllowedBahnWebBaseUrl(value) {
    const url = new URL(value);
    if (url.protocol !== "https:" || !ALLOWED_HOSTS.has(url.hostname)) {
        throw new Error("bahnWebBaseUrl must use https://int.bahn.de or https://www.bahn.de");
    }
    url.pathname = url.pathname.replace(/\/+$/, "");
    if (!url.pathname.endsWith("/web/api")) {
        throw new Error("bahnWebBaseUrl must end with /web/api");
    }
    url.search = "";
    url.hash = "";
    return url.toString().replace(/\/+$/, "");
}
function buildBahnWebUrl(baseUrl, path, params) {
    const url = new URL(`${baseUrl}${path}`);
    for (const [key, value] of params) {
        url.searchParams.append(key, value);
    }
    return url.toString();
}
function buildDepartureParams(evaNo, date, time) {
    const params = [
        ["datum", date],
        ["zeit", time],
        ["ortExtId", evaNo],
        ["mitVias", "true"],
        ["maxVias", "30"],
    ];
    for (const product of RAIL_PRODUCTS) {
        params.push(["verkehrsmittel[]", product]);
    }
    return params;
}
function stationRefFromBahnWeb(raw) {
    const station = objectAttr(raw);
    const name = stringAttr(station, "name");
    const evaNo = stringAttr(station, "extId");
    if (!name || !evaNo) {
        return null;
    }
    return {
        name,
        evaNo,
        id: stringAttr(station, "id") ?? evaNo,
        aliases: [stringAttr(station, "type"), ...stringArrayAttr(station, "products")]
            .filter((alias) => Boolean(alias)),
        source: BAHN_WEB_SOURCE_API,
        raw,
    };
}
function stationEventFromBahnWebEntry(raw, boardStation, timeZone) {
    const entry = objectAttr(raw);
    if (!entry) {
        return null;
    }
    const product = objectField(entry, "verkehrmittel");
    const plannedDeparture = parseBahnWebTimestamp(stringAttr(entry, "zeit"), timeZone);
    const realtimeDeparture = parseBahnWebTimestamp(stringAttr(entry, "ezZeit"), timeZone);
    const category = categoryFromProduct(product);
    const lineNumber = stringAttr(product, "linienNummer") ?? lineFromProduct(product);
    const publicCategory = derivePublicCategory(lineNumber, category);
    const technicalCategory = technicalCategoryFromProduct(product, publicCategory);
    const label = labelFromProduct(product, category);
    const trainNumber = trainNumberFromProduct(product, category, lineNumber);
    const journeyId = stringAttr(entry, "journeyId") ??
        [label, plannedDeparture, stringAttr(entry, "bahnhofsId")].filter(Boolean).join("-");
    const cancelled = isCancelled(entry);
    const boardingStop = {
        station: boardStation,
        journeyId,
        trainCategory: category,
        trainNumber,
        lineNumber,
        label,
        displayLabel: label,
        publicLine: lineNumber,
        publicCategory,
        technicalCategory,
        operator: technicalCategory,
        plannedDeparture,
        realtimeDeparture,
        platform: stringAttr(entry, "gleis"),
        cancelled,
        raw,
    };
    const stops = buildStops(boardingStop, pathNamesFromEntry(entry));
    const journey = {
        id: journeyId,
        category,
        number: trainNumber,
        lineNumber,
        label,
        displayLabel: label,
        publicLine: lineNumber,
        publicCategory,
        technicalCategory,
        operator: technicalCategory,
        stops,
        cancelled,
        source: BAHN_WEB_SOURCE_API,
        routeConfidence: "station_board_path",
        raw,
    };
    return {
        ...boardingStop,
        journey,
    };
}
function buildStops(boardingStop, pathNames) {
    const pathStops = pathNames.map((name, index) => ({
        station: stationMatches({ name }, boardingStop.station)
            ? boardingStop.station
            : { name },
        journeyId: boardingStop.journeyId,
        trainCategory: boardingStop.trainCategory,
        trainNumber: boardingStop.trainNumber,
        lineNumber: boardingStop.lineNumber,
        label: boardingStop.label,
        displayLabel: boardingStop.displayLabel,
        publicLine: boardingStop.publicLine,
        publicCategory: boardingStop.publicCategory,
        technicalCategory: boardingStop.technicalCategory,
        operator: boardingStop.operator,
        cancelled: boardingStop.cancelled,
        stopIndex: index,
    }));
    const boardingIndex = pathStops.findIndex((stop) => stationMatches(stop.station, boardingStop.station));
    if (boardingIndex < 0) {
        return [
            { ...boardingStop, stopIndex: 0 },
            ...pathStops.map((stop, index) => ({ ...stop, stopIndex: index + 1 })),
        ];
    }
    pathStops[boardingIndex] = {
        ...pathStops[boardingIndex],
        ...boardingStop,
        stopIndex: boardingIndex,
    };
    return pathStops.map((stop, index) => ({ ...stop, stopIndex: index }));
}
function pathNamesFromEntry(entry) {
    const names = [
        ...stringArrayAttr(entry, "ueber"),
        stringAttr(entry, "terminus"),
    ].filter((name) => Boolean(name));
    const seen = new Set();
    const unique = [];
    for (const name of names) {
        const key = normalizeStationName(name);
        if (seen.has(key)) {
            continue;
        }
        seen.add(key);
        unique.push(name);
    }
    return unique;
}
function parseBahnWebTimestamp(value, timeZone) {
    if (!value) {
        return undefined;
    }
    const match = value.match(/^(\d{4})-(\d{2})-(\d{2})[T\s](\d{2}):(\d{2})(?::(\d{2}))?/);
    if (!match) {
        return undefined;
    }
    return localDateTimeToUtc({
        year: Number(match[1]),
        month: Number(match[2]),
        day: Number(match[3]),
        hour: Number(match[4]),
        minute: Number(match[5]),
        second: Number(match[6] ?? 0),
    }, timeZone).toISOString();
}
function uniqueAnchors(dates, timeZone) {
    const anchors = new Map();
    for (const date of dates) {
        const anchor = formatBahnWebLocalDateTime(date, timeZone);
        anchors.set(`${anchor.date}T${anchor.time}`, anchor);
    }
    return [...anchors.values()];
}
function formatBahnWebLocalDateTime(date, timeZone) {
    const parts = new Intl.DateTimeFormat("sv-SE", {
        timeZone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hourCycle: "h23",
    }).format(date);
    return {
        date: parts.slice(0, 10),
        time: parts.slice(11),
    };
}
function categoryFromProduct(product) {
    const productClass = stringAttr(product, "produktGattung")?.toUpperCase();
    const fields = [
        stringAttr(product, "mittelText"),
        stringAttr(product, "kurzText"),
        stringAttr(product, "name"),
        stringAttr(product, "linienNummer"),
    ];
    const extracted = extractCategory(fields);
    if (productClass === "ICE") {
        return "ICE";
    }
    if (productClass === "EC_IC") {
        return extracted === "EC" || extracted === "IC" ? extracted : "IC";
    }
    if (productClass === "SBAHN") {
        return "S";
    }
    if (productClass === "REGIONAL") {
        return extracted ?? "RE";
    }
    return extracted ?? productClass ?? "";
}
function labelFromProduct(product, category) {
    return (stringAttr(product, "mittelText") ??
        stringAttr(product, "name") ??
        stringAttr(product, "linienNummer") ??
        (category || "unknown"));
}
function lineFromProduct(product) {
    const text = stringAttr(product, "mittelText") ?? stringAttr(product, "name");
    return text?.match(/\b(?:RE|RB|S|IRE|MEX|FEX)\s*\d+\b/i)?.[0].replace(/\s+/g, "");
}
function technicalCategoryFromProduct(product, publicCategory) {
    const shortText = stringAttr(product, "kurzText")?.trim().toUpperCase();
    return shortText || publicCategory;
}
function trainNumberFromProduct(product, category, lineNumber) {
    const name = stringAttr(product, "name");
    const langText = stringAttr(product, "langText");
    const label = stringAttr(product, "mittelText");
    if (name && /^\d+$/.test(name)) {
        return name;
    }
    const prefixed = [name, langText, label]
        .filter((value) => Boolean(value))
        .map((value) => value.match(new RegExp(`\\b${category}\\s*(\\d+)\\b`, "i"))?.[1])
        .find(Boolean);
    return prefixed ?? (lineNumber && lineNumber !== label ? lineNumber : undefined);
}
function extractCategory(values) {
    const joined = values.filter(Boolean).join(" ").toUpperCase();
    return joined.match(/\b(ICE|ECE|EC|IC|IRE|RE|RB|S|MEX|FEX|NJ|FLX)\s*\d*/)?.[1];
}
function isCancelled(entry) {
    const flags = [
        boolAttr(entry, "cancelled"),
        boolAttr(entry, "ausfall"),
        boolAttr(entry, "istAusfall"),
    ];
    return flags.some(Boolean);
}
function dedupeStationEvents(events) {
    const deduped = [];
    for (const event of events) {
        const existingIndex = deduped.findIndex((existing) => sameStationEvent(existing, event));
        if (existingIndex >= 0) {
            deduped[existingIndex] = event;
            continue;
        }
        deduped.push(event);
    }
    return deduped.sort(compareEventsByPlannedTime);
}
function sameStationEvent(left, right) {
    if (left.journeyId && right.journeyId && left.journeyId === right.journeyId) {
        return true;
    }
    return (left.label === right.label &&
        left.plannedDeparture === right.plannedDeparture &&
        left.station.evaNo === right.station.evaNo &&
        (left.platform ?? "") === (right.platform ?? ""));
}
function compareEventsByPlannedTime(left, right) {
    return (Date.parse(left.plannedDeparture ?? left.realtimeDeparture ?? "") -
        Date.parse(right.plannedDeparture ?? right.realtimeDeparture ?? ""));
}
function rankStationMatch(station, search) {
    const expected = normalizeStationName(search);
    const actual = normalizeStationName(station.name);
    if (actual === expected) {
        return 0;
    }
    if (actual.includes(expected) || expected.includes(actual)) {
        return 1;
    }
    return 2;
}
function objectAttr(value) {
    return value && typeof value === "object" && !Array.isArray(value)
        ? value
        : undefined;
}
function objectField(value, key) {
    return objectAttr(value[key]);
}
function fieldAttr(value, key) {
    return objectAttr(value)?.[key];
}
function stringAttr(value, key) {
    const attr = value?.[key];
    if (attr === undefined || attr === null) {
        return undefined;
    }
    return String(attr);
}
function stringArrayAttr(value, key) {
    const attr = value?.[key];
    return Array.isArray(attr)
        ? attr.map((entry) => String(entry)).filter(Boolean)
        : [];
}
function boolAttr(value, key) {
    const attr = value[key];
    return attr === true || attr === "true" || attr === "1";
}
function toArray(value) {
    return Array.isArray(value) ? value : value === undefined || value === null ? [] : [value];
}
function errorMessage(error) {
    return error instanceof Error ? error.message : String(error);
}

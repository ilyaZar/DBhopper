import { XMLParser } from "fast-xml-parser";
import { DEFAULT_TIME_ZONE, addMinutes, derivePublicCategory, localDateTimeToUtc, normalizeStationName, stationMatches, } from "./db-delay.js";
import { extractDbErrorMessage } from "./db-api-errors.js";
export const DEFAULT_TIMETABLE_BASE_URL = "https://apis.deutschebahn.com/db-api-marketplace/apis/timetables/v1";
export const DEFAULT_DELAY_LOOKBACK_MINUTES = 180;
export const DEFAULT_REQUEST_TIMEOUT_MS = 20000;
const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "",
    allowBooleanAttributes: true,
});
export const DB_DELAY_RESEARCH_SUMMARY = {
    recommendedStack: [
        "Use Timetables for practical live station-board lookup when DB Marketplace credentials are available.",
        "Use RIS::Boards plus RIS::Journeys when access is approved and full stop-level details are required.",
    ],
    officialDocs: [
        "https://developers.deutschebahn.com/db-api-marketplace/apis/product/timetables",
        "https://developers.deutschebahn.com/db-api-marketplace/apis/start",
        "https://developers.deutschebahn.com/db-api-marketplace/apis/product/ris-boards-netz",
        "https://developers.deutschebahn.com/db-api-marketplace/apis/product/ris-journeys-transporteure/api/ris-journeys-transporteure",
    ],
    timetableEndpoints: [
        "GET /station/{pattern}",
        "GET /plan/{evaNo}/{date}/{hour}",
        "GET /fchg/{evaNo}",
        "GET /rchg/{evaNo}",
    ],
    limitations: [
        "Timetables is station-board oriented. It exposes planned rows and changes, but route matching depends on path fields.",
        "RIS::Boards advertises richer via-stop, cancelled-stop, added-stop, disruption, replacement, and board-window data.",
        "RIS products may require DB access approval and contract terms; this plugin does not assume that access.",
    ],
};
export function createTimetablesProvider(options = {}) {
    return {
        resolveStation: (name) => resolveStation(name, options),
        queryStationBoard: (station, timeWindow) => queryStationBoard(station, timeWindow, options),
        fetchJourneyDetails,
    };
}
export async function resolveStation(name, options = {}) {
    let stationObjects = await fetchStationObjects(name, options);
    for (const alternativeName of stationSearchAlternatives(name)) {
        if (stationObjects.length) {
            break;
        }
        stationObjects = await fetchStationObjects(alternativeName, options);
    }
    return stationObjects
        .map((station) => stationRefFromDbStation(station))
        .filter((station) => Boolean(station))
        .sort((left, right) => rankStationMatch(left, name) - rankStationMatch(right, name));
}
export async function queryStationBoard(station, timeWindow, options = {}) {
    if (!station.evaNo) {
        throw new Error(`station ${station.name} has no EVA number`);
    }
    const lookbackMinutes = options.delayLookbackMinutes ?? DEFAULT_DELAY_LOOKBACK_MINUTES;
    const plannedSliceStart = addMinutes(timeWindow.lowerBound, -lookbackMinutes);
    const slices = stationBoardSlices(plannedSliceStart, timeWindow.upperBound, options.timeZone ?? DEFAULT_TIME_ZONE);
    const planTexts = await Promise.all(slices.map((slice) => fetchTimetablesText(`/plan/${station.evaNo}/${slice.date}/${slice.hour}`, options, { allowNotFound: true })));
    const changeTexts = await Promise.all([
        fetchTimetablesText(`/fchg/${station.evaNo}`, options, { allowNotFound: true }),
        fetchTimetablesText(`/rchg/${station.evaNo}`, options, { allowNotFound: true }),
    ]);
    const plannedRows = planTexts.flatMap(parseTimetableRows);
    const changeRows = changeTexts.flatMap(parseTimetableRows);
    const rows = mergeTimetableRows(plannedRows, changeRows);
    return rows
        .map((row) => stationEventFromTimetableRow(row, station, options.timeZone ?? DEFAULT_TIME_ZONE))
        .filter((event) => Boolean(event));
}
export async function fetchJourneyDetails(event) {
    if (!event.journey) {
        throw new Error(`station event ${event.journeyId ?? event.label ?? "unknown"} has no journey details`);
    }
    return event.journey;
}
export function timetablesConfigStatus(options = {}) {
    const clientId = options.dbClientId;
    const apiKey = options.dbApiKey;
    return {
        configured: Boolean(clientId && apiKey),
        hasClientId: Boolean(clientId),
        hasApiKey: Boolean(apiKey),
        baseUrl: normalizeBaseUrl(options.timetableBaseUrl),
    };
}
async function fetchTimetablesText(path, options, requestOptions = {}) {
    const credentials = resolveCredentials(options);
    const baseUrl = normalizeBaseUrl(options.timetableBaseUrl);
    const timeoutMs = options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    const signal = options.signal
        ? AbortSignal.any([options.signal, controller.signal])
        : controller.signal;
    try {
        const response = await (options.fetchImpl ?? fetch)(`${baseUrl}${path}`, {
            headers: {
                Accept: "application/xml",
                "DB-Client-Id": credentials.clientId,
                "DB-Api-Key": credentials.apiKey,
            },
            signal,
        });
        if (requestOptions.allowNotFound && response.status === 404) {
            return "";
        }
        const body = await response.text();
        if (!response.ok) {
            const dbMessage = extractDbErrorMessage(body);
            const suffix = dbMessage ? `: ${dbMessage}` : "";
            throw new Error(`DB Timetables request failed with HTTP ${response.status}${suffix}`);
        }
        return body;
    }
    finally {
        clearTimeout(timeout);
    }
}
function resolveCredentials(options) {
    const clientId = options.dbClientId;
    const apiKey = options.dbApiKey;
    if (!clientId || !apiKey) {
        throw new Error("DB Timetables credentials are required in the selected [bahnAPI] credentials file");
    }
    return { clientId, apiKey };
}
function normalizeBaseUrl(baseUrl) {
    return (baseUrl || DEFAULT_TIMETABLE_BASE_URL).replace(/\/+$/, "");
}
async function fetchStationObjects(name, options) {
    const xml = await fetchTimetablesText(`/station/${encodeURIComponent(name)}`, options);
    const parsed = parseXml(xml);
    return collectObjectsByKey(parsed, "station");
}
function parseTimetableRows(xml) {
    if (!xml.trim()) {
        return [];
    }
    const parsed = parseXml(xml);
    return collectObjectsByKey(parsed, "s")
        .map((row) => timetableRowFromObject(row))
        .filter((row) => Boolean(row));
}
function parseXml(xml) {
    try {
        return parser.parse(xml);
    }
    catch (error) {
        throw new Error(`failed to parse DB Timetables XML: ${errorMessage(error)}`);
    }
}
function timetableRowFromObject(value) {
    const id = stringAttr(value, "id");
    if (!id) {
        return null;
    }
    return {
        id,
        tl: objectAttr(value, "tl"),
        ar: objectAttr(value, "ar"),
        dp: objectAttr(value, "dp"),
        raw: value,
    };
}
function mergeTimetableRows(plannedRows, changeRows) {
    const merged = new Map();
    for (const row of plannedRows) {
        merged.set(row.id, { ...row });
    }
    for (const change of changeRows) {
        const existing = merged.get(change.id);
        if (!existing) {
            merged.set(change.id, { ...change });
            continue;
        }
        merged.set(change.id, {
            id: existing.id,
            tl: mergeObject(existing.tl, change.tl),
            ar: mergeObject(existing.ar, change.ar),
            dp: mergeObject(existing.dp, change.dp),
            raw: { planned: existing.raw, change: change.raw },
        });
    }
    return [...merged.values()];
}
function stationEventFromTimetableRow(row, boardStation, timeZone) {
    const departureNode = row.dp;
    const arrivalNode = row.ar;
    const eventNode = departureNode ?? arrivalNode;
    if (!eventNode) {
        return null;
    }
    const technicalCategory = stringAttr(row.tl, "c") ?? "";
    const trainNumber = stringAttr(row.tl, "n");
    const operator = stringAttr(row.tl, "o");
    const publicLine = choosePublicLine(firstString(stringAttr(departureNode, "l"), stringAttr(arrivalNode, "l")), firstString(stringAttr(departureNode, "fb"), stringAttr(arrivalNode, "fb")), stringAttr(row.tl, "l"), technicalCategory);
    const publicCategory = derivePublicCategory(publicLine, technicalCategory);
    const category = publicCategory ?? technicalCategory;
    const label = buildTrainLabel(category, trainNumber, publicLine);
    const plannedArrival = parseDbTimestamp(stringAttr(arrivalNode, "pt"), timeZone);
    const plannedDeparture = parseDbTimestamp(stringAttr(departureNode, "pt"), timeZone);
    const realtimeArrival = parseDbTimestamp(stringAttr(arrivalNode, "ct"), timeZone);
    const realtimeDeparture = parseDbTimestamp(stringAttr(departureNode, "ct"), timeZone);
    const cancelled = isCancelled(arrivalNode) || isCancelled(departureNode);
    const pathNames = extractPathNames(departureNode ?? arrivalNode);
    const boardingStop = {
        station: boardStation,
        journeyId: row.id,
        trainCategory: category,
        trainNumber,
        lineNumber: publicLine,
        label,
        displayLabel: label,
        publicLine,
        publicCategory,
        technicalCategory,
        operator,
        plannedArrival,
        plannedDeparture,
        realtimeArrival,
        realtimeDeparture,
        platform: stringAttr(departureNode, "pp") ?? stringAttr(arrivalNode, "pp"),
        realtimePlatform: stringAttr(departureNode, "cp") ?? stringAttr(arrivalNode, "cp"),
        cancelled,
        stopIndex: 0,
        raw: row.raw,
    };
    const stops = buildStopsFromPath(boardingStop, pathNames);
    const journey = {
        id: row.id,
        category,
        number: trainNumber,
        lineNumber: publicLine,
        label,
        displayLabel: label,
        publicLine,
        publicCategory,
        technicalCategory,
        operator,
        stops,
        cancelled,
        source: "db-timetables",
        routeConfidence: "station_board_path",
        raw: row.raw,
    };
    return {
        ...boardingStop,
        journey,
    };
}
function buildStopsFromPath(boardingStop, pathNames) {
    const pathStops = pathNames.map((name, index) => ({
        station: { name },
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
        stopIndex: index,
    }));
    const boardingIndex = pathStops.findIndex((stop) => stationMatches(stop.station, boardingStop.station));
    if (boardingIndex < 0) {
        return [boardingStop, ...pathStops.map((stop, index) => ({ ...stop, stopIndex: index + 1 }))];
    }
    pathStops[boardingIndex] = {
        ...pathStops[boardingIndex],
        ...boardingStop,
        stopIndex: boardingIndex,
    };
    return pathStops.map((stop, index) => ({ ...stop, stopIndex: index }));
}
function extractPathNames(node) {
    const path = stringAttr(node, "cpth") ?? stringAttr(node, "ppth") ?? "";
    return path
        .split("|")
        .map((name) => name.trim())
        .filter(Boolean);
}
function parseDbTimestamp(value, timeZone) {
    if (!value) {
        return undefined;
    }
    const digits = value.replace(/\D/g, "");
    const match = digits.match(/^(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/);
    if (!match) {
        return undefined;
    }
    const date = localDateTimeToUtc({
        year: 2000 + Number(match[1]),
        month: Number(match[2]),
        day: Number(match[3]),
        hour: Number(match[4]),
        minute: Number(match[5]),
    }, timeZone);
    return date.toISOString();
}
function stationBoardSlices(start, end, timeZone) {
    const slices = new Map();
    let cursor = startOfHour(start);
    const stop = startOfHour(end);
    while (cursor.getTime() <= stop.getTime()) {
        const slice = formatTimetableSlice(cursor, timeZone);
        slices.set(`${slice.date}-${slice.hour}`, slice);
        cursor = addMinutes(cursor, 60);
    }
    return [...slices.values()];
}
function formatTimetableSlice(date, timeZone) {
    const parts = new Intl.DateTimeFormat("en-GB", {
        timeZone,
        year: "2-digit",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        hourCycle: "h23",
    }).formatToParts(date);
    const value = (type) => {
        const part = parts.find((entry) => entry.type === type)?.value;
        if (!part) {
            throw new Error(`missing ${type} while formatting Timetables slice`);
        }
        return part;
    };
    return {
        date: `${value("year")}${value("month")}${value("day")}`,
        hour: value("hour"),
    };
}
function startOfHour(date) {
    const copy = new Date(date);
    copy.setUTCMinutes(0, 0, 0);
    return copy;
}
function stationRefFromDbStation(station) {
    const name = stringAttr(station, "name");
    const evaNo = stringAttr(station, "eva");
    if (!name || !evaNo) {
        return null;
    }
    return {
        name,
        evaNo,
        id: evaNo,
        aliases: [stringAttr(station, "ds100"), stringAttr(station, "meta")]
            .filter((value) => Boolean(value)),
        source: "db-timetables",
        raw: station,
    };
}
function stationSearchAlternatives(name) {
    const alternatives = new Set();
    const replacements = [
        [/\bkoeln\b/gi, "Köln"],
        [/\bkoln\b/gi, "Köln"],
    ];
    for (const [pattern, replacement] of replacements) {
        const alternative = name.replace(pattern, replacement);
        if (alternative !== name) {
            alternatives.add(alternative);
        }
    }
    return [...alternatives];
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
function buildTrainLabel(category, number, lineNumber) {
    if (lineNumber && /^(?:IRE|RE|RB|S|MEX|FEX)\s*\d+/i.test(lineNumber)) {
        return lineNumber;
    }
    if (category && number) {
        return `${category} ${number}`;
    }
    if (lineNumber) {
        return lineNumber;
    }
    return category || number || "unknown";
}
function choosePublicLine(stopLine, fallbackLine, timetableLine, technicalCategory) {
    if (isRegionalPublicLine(stopLine)) {
        return stopLine;
    }
    if (isRegionalPublicLine(fallbackLine)) {
        return fallbackLine;
    }
    if (timetableLine?.trim()) {
        return timetableLine.trim();
    }
    if (!isLongDistanceCategory(technicalCategory)) {
        return firstString(stopLine, fallbackLine);
    }
    return undefined;
}
function isRegionalPublicLine(value) {
    return /^(?:IRE|RE|RB|S|MEX|FEX)\s*\d+/i.test(value?.trim() ?? "");
}
function isLongDistanceCategory(value) {
    return /^(?:ICE|ECE|EC|IC|FLX|NJ)$/i.test(value?.trim() ?? "");
}
function firstString(...values) {
    return values.find((value) => value && value.trim())?.trim();
}
function isCancelled(...nodes) {
    return nodes.some((node) => {
        const status = [
            stringAttr(node, "cs"),
            stringAttr(node, "ds"),
            stringAttr(node, "rs"),
            stringAttr(node, "s"),
        ]
            .filter(Boolean)
            .join(" ")
            .toLowerCase();
        return status === "c" || status.includes("cancel") || status.includes("ausfall");
    });
}
function collectObjectsByKey(value, key) {
    const results = [];
    const visit = (node) => {
        if (Array.isArray(node)) {
            for (const entry of node) {
                visit(entry);
            }
            return;
        }
        if (!node || typeof node !== "object") {
            return;
        }
        for (const [entryKey, entryValue] of Object.entries(node)) {
            if (entryKey === key) {
                for (const item of toArray(entryValue)) {
                    if (item && typeof item === "object" && !Array.isArray(item)) {
                        results.push(item);
                    }
                }
            }
            visit(entryValue);
        }
    };
    visit(value);
    return results;
}
function mergeObject(left, right) {
    if (!left && !right) {
        return undefined;
    }
    return {
        ...(left ?? {}),
        ...(right ?? {}),
    };
}
function objectAttr(value, key) {
    const attr = value?.[key];
    return attr && typeof attr === "object" && !Array.isArray(attr)
        ? attr
        : undefined;
}
function stringAttr(value, key) {
    const attr = value?.[key];
    if (attr === undefined || attr === null) {
        return undefined;
    }
    return String(attr);
}
function toArray(value) {
    return Array.isArray(value) ? value : value === undefined || value === null ? [] : [value];
}
function errorMessage(error) {
    return error instanceof Error ? error.message : String(error);
}

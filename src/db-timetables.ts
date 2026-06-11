import { XMLParser } from "fast-xml-parser";

import type { DBhopperConfig } from "./types.js";
import {
  DEFAULT_TIME_ZONE,
  addMinutes,
  localDateTimeToUtc,
  normalizeStationName,
  stationMatches,
  type ApiProvider,
  type Journey,
  type JourneyStop,
  type StationEvent,
  type StationRef,
  type TimeWindow,
} from "./db-delay.js";

export const DEFAULT_TIMETABLE_BASE_URL =
  "https://apis.deutschebahn.com/db-api-marketplace/apis/timetables/v1";
export const DEFAULT_DELAY_LOOKBACK_MINUTES = 180;
export const DEFAULT_REQUEST_TIMEOUT_MS = 20000;

export interface TimetablesProviderOptions extends DBhopperConfig {
  signal?: AbortSignal;
}

interface TimetableRow {
  id: string;
  tl?: Record<string, unknown>;
  ar?: Record<string, unknown>;
  dp?: Record<string, unknown>;
  raw: unknown;
}

interface TimetablesCredentials {
  clientId: string;
  apiKey: string;
}

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

export function createTimetablesProvider(
  options: TimetablesProviderOptions = {},
): ApiProvider {
  return {
    resolveStation: (name) => resolveStation(name, options),
    queryStationBoard: (station, timeWindow) =>
      queryStationBoard(station, timeWindow, options),
    fetchJourneyDetails,
  };
}

export async function resolveStation(
  name: string,
  options: TimetablesProviderOptions = {},
) {
  const xml = await fetchTimetablesText(
    `/station/${encodeURIComponent(name)}`,
    options,
  );
  const parsed = parseXml(xml);
  const stationObjects = collectObjectsByKey(parsed, "station");

  return stationObjects
    .map((station) => stationRefFromDbStation(station))
    .filter((station): station is StationRef => Boolean(station))
    .sort((left, right) => rankStationMatch(left, name) - rankStationMatch(right, name));
}

export async function queryStationBoard(
  station: StationRef,
  timeWindow: TimeWindow,
  options: TimetablesProviderOptions = {},
) {
  if (!station.evaNo) {
    throw new Error(`station ${station.name} has no EVA number`);
  }

  const lookbackMinutes = options.delayLookbackMinutes ?? DEFAULT_DELAY_LOOKBACK_MINUTES;
  const plannedSliceStart = addMinutes(timeWindow.lowerBound, -lookbackMinutes);
  const slices = stationBoardSlices(
    plannedSliceStart,
    timeWindow.upperBound,
    options.timeZone ?? DEFAULT_TIME_ZONE,
  );

  const planTexts = await Promise.all(
    slices.map((slice) =>
      fetchTimetablesText(
        `/plan/${station.evaNo}/${slice.date}/${slice.hour}`,
        options,
        { allowNotFound: true },
      ),
    ),
  );
  const changeTexts = await Promise.all([
    fetchTimetablesText(`/fchg/${station.evaNo}`, options, { allowNotFound: true }),
    fetchTimetablesText(`/rchg/${station.evaNo}`, options, { allowNotFound: true }),
  ]);

  const plannedRows = planTexts.flatMap(parseTimetableRows);
  const changeRows = changeTexts.flatMap(parseTimetableRows);
  const rows = mergeTimetableRows(plannedRows, changeRows);

  return rows
    .map((row) => stationEventFromTimetableRow(row, station, options.timeZone ?? DEFAULT_TIME_ZONE))
    .filter((event): event is StationEvent => Boolean(event));
}

export async function fetchJourneyDetails(event: StationEvent) {
  if (!event.journey) {
    throw new Error(`station event ${event.journeyId ?? event.label ?? "unknown"} has no journey details`);
  }
  return event.journey;
}

export function timetablesConfigStatus(options: TimetablesProviderOptions = {}) {
  const clientId = options.dbClientId || process.env.DB_CLIENT_ID;
  const apiKey = options.dbApiKey || process.env.DB_API_KEY;
  return {
    configured: Boolean(clientId && apiKey),
    hasClientId: Boolean(clientId),
    hasApiKey: Boolean(apiKey),
    baseUrl: normalizeBaseUrl(options.timetableBaseUrl),
  };
}

async function fetchTimetablesText(
  path: string,
  options: TimetablesProviderOptions,
  requestOptions: { allowNotFound?: boolean } = {},
) {
  const credentials = resolveCredentials(options);
  const baseUrl = normalizeBaseUrl(options.timetableBaseUrl);
  const timeoutMs = options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const signal = options.signal
    ? AbortSignal.any([options.signal, controller.signal])
    : controller.signal;

  try {
    const response = await fetch(`${baseUrl}${path}`, {
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
    if (!response.ok) {
      throw new Error(`DB Timetables request failed with HTTP ${response.status}`);
    }
    return await response.text();
  } finally {
    clearTimeout(timeout);
  }
}

function resolveCredentials(options: TimetablesProviderOptions): TimetablesCredentials {
  const clientId = options.dbClientId || process.env.DB_CLIENT_ID;
  const apiKey = options.dbApiKey || process.env.DB_API_KEY;
  if (!clientId || !apiKey) {
    throw new Error(
      "DB Timetables credentials are required: set dbClientId/dbApiKey or DB_CLIENT_ID/DB_API_KEY",
    );
  }
  return { clientId, apiKey };
}

function normalizeBaseUrl(baseUrl?: string) {
  return (baseUrl || DEFAULT_TIMETABLE_BASE_URL).replace(/\/+$/, "");
}

function parseTimetableRows(xml: string) {
  if (!xml.trim()) {
    return [];
  }
  const parsed = parseXml(xml);
  return collectObjectsByKey(parsed, "s")
    .map((row) => timetableRowFromObject(row))
    .filter((row): row is TimetableRow => Boolean(row));
}

function parseXml(xml: string) {
  try {
    return parser.parse(xml);
  } catch (error) {
    throw new Error(`failed to parse DB Timetables XML: ${errorMessage(error)}`);
  }
}

function timetableRowFromObject(value: Record<string, unknown>): TimetableRow | null {
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

function mergeTimetableRows(plannedRows: TimetableRow[], changeRows: TimetableRow[]) {
  const merged = new Map<string, TimetableRow>();
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

function stationEventFromTimetableRow(
  row: TimetableRow,
  boardStation: StationRef,
  timeZone: string,
): StationEvent | null {
  const departureNode = row.dp;
  const arrivalNode = row.ar;
  const eventNode = departureNode ?? arrivalNode;
  if (!eventNode) {
    return null;
  }

  const trainCategory = stringAttr(row.tl, "c") ?? "";
  const trainNumber = stringAttr(row.tl, "n");
  const lineNumber = stringAttr(row.tl, "l");
  const label = buildTrainLabel(trainCategory, trainNumber, lineNumber);
  const plannedArrival = parseDbTimestamp(stringAttr(arrivalNode, "pt"), timeZone);
  const plannedDeparture = parseDbTimestamp(stringAttr(departureNode, "pt"), timeZone);
  const realtimeArrival = parseDbTimestamp(stringAttr(arrivalNode, "ct"), timeZone);
  const realtimeDeparture = parseDbTimestamp(stringAttr(departureNode, "ct"), timeZone);
  const cancelled = isCancelled(arrivalNode) || isCancelled(departureNode);
  const pathNames = extractPathNames(departureNode ?? arrivalNode);

  const boardingStop: JourneyStop = {
    station: boardStation,
    journeyId: row.id,
    trainCategory,
    trainNumber,
    lineNumber,
    label,
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
  const journey: Journey = {
    id: row.id,
    category: trainCategory,
    number: trainNumber,
    lineNumber,
    label,
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

function buildStopsFromPath(boardingStop: JourneyStop, pathNames: string[]) {
  const pathStops = pathNames.map<JourneyStop>((name, index) => ({
    station: { name },
    journeyId: boardingStop.journeyId,
    trainCategory: boardingStop.trainCategory,
    trainNumber: boardingStop.trainNumber,
    lineNumber: boardingStop.lineNumber,
    label: boardingStop.label,
    stopIndex: index,
  }));
  const boardingIndex = pathStops.findIndex((stop) =>
    stationMatches(stop.station, boardingStop.station),
  );

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

function extractPathNames(node?: Record<string, unknown>) {
  const path = stringAttr(node, "cpth") ?? stringAttr(node, "ppth") ?? "";
  return path
    .split("|")
    .map((name) => name.trim())
    .filter(Boolean);
}

function parseDbTimestamp(value: string | undefined, timeZone: string) {
  if (!value) {
    return undefined;
  }
  const digits = value.replace(/\D/g, "");
  const match = digits.match(/^(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/);
  if (!match) {
    return undefined;
  }
  const date = localDateTimeToUtc(
    {
      year: 2000 + Number(match[1]),
      month: Number(match[2]),
      day: Number(match[3]),
      hour: Number(match[4]),
      minute: Number(match[5]),
    },
    timeZone,
  );
  return date.toISOString();
}

function stationBoardSlices(start: Date, end: Date, timeZone: string) {
  const slices = new Map<string, { date: string; hour: string }>();
  let cursor = startOfHour(start);
  const stop = startOfHour(end);

  while (cursor.getTime() <= stop.getTime()) {
    const slice = formatTimetableSlice(cursor, timeZone);
    slices.set(`${slice.date}-${slice.hour}`, slice);
    cursor = addMinutes(cursor, 60);
  }

  return [...slices.values()];
}

function formatTimetableSlice(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    year: "2-digit",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const value = (type: string) => {
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

function startOfHour(date: Date) {
  const copy = new Date(date);
  copy.setUTCMinutes(0, 0, 0);
  return copy;
}

function stationRefFromDbStation(station: Record<string, unknown>): StationRef | null {
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
      .filter((value): value is string => Boolean(value)),
    source: "db-timetables",
    raw: station,
  };
}

function rankStationMatch(station: StationRef, search: string) {
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

function buildTrainLabel(category: string, number?: string, lineNumber?: string) {
  if (category && number) {
    return `${category} ${number}`;
  }
  if (lineNumber) {
    return lineNumber;
  }
  return category || number || "unknown";
}

function isCancelled(...nodes: Array<Record<string, unknown> | undefined>) {
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

function collectObjectsByKey(value: unknown, key: string): Array<Record<string, unknown>> {
  const results: Array<Record<string, unknown>> = [];

  const visit = (node: unknown) => {
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
            results.push(item as Record<string, unknown>);
          }
        }
      }
      visit(entryValue);
    }
  };

  visit(value);
  return results;
}

function mergeObject(
  left?: Record<string, unknown>,
  right?: Record<string, unknown>,
) {
  if (!left && !right) {
    return undefined;
  }
  return {
    ...(left ?? {}),
    ...(right ?? {}),
  };
}

function objectAttr(value: Record<string, unknown> | undefined, key: string) {
  const attr = value?.[key];
  return attr && typeof attr === "object" && !Array.isArray(attr)
    ? (attr as Record<string, unknown>)
    : undefined;
}

function stringAttr(value: Record<string, unknown> | undefined, key: string) {
  const attr = value?.[key];
  if (attr === undefined || attr === null) {
    return undefined;
  }
  return String(attr);
}

function toArray(value: unknown) {
  return Array.isArray(value) ? value : value === undefined || value === null ? [] : [value];
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export const DEFAULT_TIME_ZONE = "Europe/Berlin";
export const DEFAULT_WINDOW_WIDTH_MINUTES = 45;
export const DEFAULT_DELAY_THRESHOLD_MINUTES = 20;
export const DEFAULT_REGIONAL_TYPES = ["RE"];
export const DEFAULT_LONG_DISTANCE_REPLACEMENT_TYPES = ["ICE", "IC", "EC"];

const LONG_DISTANCE_TYPES = new Set(["ICE", "IC", "EC", "ECE", "FLX", "NJ"]);

export interface StationRef {
  name: string;
  evaNo?: string;
  id?: string;
  aliases?: string[];
  source?: string;
  raw?: unknown;
}

export interface StationEvent {
  station: StationRef;
  journeyId?: string;
  trainCategory?: string;
  trainNumber?: string;
  lineNumber?: string;
  label?: string;
  plannedArrival?: string;
  plannedDeparture?: string;
  realtimeArrival?: string;
  realtimeDeparture?: string;
  platform?: string;
  realtimePlatform?: string;
  cancelled?: boolean;
  journey?: Journey;
  raw?: unknown;
}

export interface JourneyStop extends StationEvent {
  stopIndex?: number;
}

export interface Journey {
  id: string;
  category: string;
  number?: string;
  lineNumber?: string;
  label?: string;
  operator?: string;
  stops: JourneyStop[];
  cancelled?: boolean;
  source?: string;
  routeConfidence?: "full_stop_list" | "station_board_path" | "unknown";
  raw?: unknown;
}

export interface CandidateQuery {
  departureStation: string | StationRef;
  arrivalStation: string | StationRef;
  queryTime: string | Date;
  serviceDate?: string;
  timeZone?: string;
  windowWidthMinutes?: number;
  delayThresholdMinutes?: number;
  forceQueryDepartureTime?: boolean;
  regionalTypes?: string[];
  longDistanceReplacementTypes?: string[];
}

export interface NormalizedCandidateQuery {
  departureStation: StationRef;
  arrivalStation: StationRef;
  queryTime: Date;
  timeZone: string;
  windowWidthMinutes: number;
  delayThresholdMinutes: number;
  forceQueryDepartureTime: boolean;
  regionalTypes: string[];
  longDistanceReplacementTypes: string[];
  lowerBound: Date;
  upperBound: Date;
}

export interface CandidateResult {
  journey: Journey;
  boardingStop: JourneyStop;
  destinationStop: JourneyStop;
  boardingDelayMinutes: number | null;
  plannedBoardingTime?: string;
  realtimeBoardingTime?: string;
  matchedBy: string[];
}

export interface ReplacementResult {
  journey: Journey;
  boardingStop: JourneyStop;
  destinationStop: JourneyStop;
  plannedBoardingTime?: string;
  realtimeBoardingTime?: string;
  reachable: boolean;
  matchedBy: string[];
}

export interface DiscardedJourney {
  journey: Journey;
  reasons: string[];
}

export interface TimeWindow {
  lowerBound: Date;
  queryTime: Date;
  upperBound: Date;
}

export interface ApiProvider {
  resolveStation(name: string): Promise<StationRef[]>;
  queryStationBoard(station: StationRef, timeWindow: TimeWindow): Promise<StationEvent[]>;
  fetchJourneyDetails(event: StationEvent): Promise<Journey>;
}

export function normalizeCandidateQuery(query: CandidateQuery): NormalizedCandidateQuery {
  const timeZone = query.timeZone || DEFAULT_TIME_ZONE;
  const queryTime = parseQueryDateTime(query.queryTime, {
    serviceDate: query.serviceDate,
    timeZone,
  });
  const windowWidthMinutes = query.windowWidthMinutes ?? DEFAULT_WINDOW_WIDTH_MINUTES;
  const delayThresholdMinutes = query.delayThresholdMinutes ?? DEFAULT_DELAY_THRESHOLD_MINUTES;

  if (!Number.isFinite(windowWidthMinutes) || windowWidthMinutes < 0) {
    throw new Error("windowWidthMinutes must be a non-negative number");
  }
  if (!Number.isFinite(delayThresholdMinutes) || delayThresholdMinutes < 0) {
    throw new Error("delayThresholdMinutes must be a non-negative number");
  }

  return {
    departureStation: toStationRef(query.departureStation),
    arrivalStation: toStationRef(query.arrivalStation),
    queryTime,
    timeZone,
    windowWidthMinutes,
    delayThresholdMinutes,
    forceQueryDepartureTime: query.forceQueryDepartureTime === true,
    regionalTypes: normalizeTypeList(query.regionalTypes ?? DEFAULT_REGIONAL_TYPES),
    longDistanceReplacementTypes: normalizeTypeList(
      query.longDistanceReplacementTypes ?? DEFAULT_LONG_DISTANCE_REPLACEMENT_TYPES,
    ),
    lowerBound: addMinutes(queryTime, -windowWidthMinutes),
    upperBound: addMinutes(queryTime, windowWidthMinutes),
  };
}

export function isWithinInclusiveWindow(
  event: StationEvent,
  query: CandidateQuery | NormalizedCandidateQuery,
) {
  const normalized = isNormalizedQuery(query) ? query : normalizeCandidateQuery(query);
  const planned = getPlannedEventDate(event);
  const realtime = getRealtimeEventDate(event);
  return (
    (planned ? isDateWithinInclusive(planned, normalized.lowerBound, normalized.upperBound) : false) ||
    (realtime ? isDateWithinInclusive(realtime, normalized.lowerBound, normalized.upperBound) : false)
  );
}

export function isReachableAtQueryTime(
  event: StationEvent,
  query: CandidateQuery | NormalizedCandidateQuery,
) {
  const normalized = isNormalizedQuery(query) ? query : normalizeCandidateQuery(query);
  const realtime = getRealtimeEventDate(event);
  return realtime ? realtime.getTime() >= normalized.queryTime.getTime() : false;
}

export function trainServesRouteInOrder(
  journey: Journey,
  departure: string | StationRef,
  arrival: string | StationRef,
) {
  const departureIndex = findStopIndex(journey, departure);
  if (departureIndex < 0) {
    return false;
  }
  return findStopIndex(journey, arrival, departureIndex + 1) > departureIndex;
}

export function delayAtBoardingStation(journey: Journey, departure: string | StationRef) {
  const stop = getBoardingStop(journey, departure);
  if (!stop) {
    return null;
  }
  const planned = getPlannedEventDate(stop);
  if (!planned) {
    return null;
  }
  const realtime = getRealtimeEventDate(stop);
  if (!realtime) {
    return 0;
  }
  return Math.round((realtime.getTime() - planned.getTime()) / 60000);
}

export async function findRegionalDelayedCandidates(
  query: CandidateQuery,
  provider: ApiProvider,
) {
  const normalized = normalizeCandidateQuery(query);
  const events = await provider.queryStationBoard(normalized.departureStation, {
    lowerBound: normalized.lowerBound,
    queryTime: normalized.queryTime,
    upperBound: normalized.upperBound,
  });
  const journeys = await Promise.all(events.map((event) => provider.fetchJourneyDetails(event)));
  return filterRegionalDelayedCandidates(journeys, normalized).candidates;
}

export async function findLongDistanceReplacements(
  query: CandidateQuery,
  _delayedCandidate: CandidateResult | null,
  provider: ApiProvider,
) {
  const normalized = normalizeCandidateQuery(query);
  const events = await provider.queryStationBoard(normalized.departureStation, {
    lowerBound: normalized.lowerBound,
    queryTime: normalized.queryTime,
    upperBound: normalized.upperBound,
  });
  const journeys = await Promise.all(events.map((event) => provider.fetchJourneyDetails(event)));
  return filterLongDistanceReplacements(journeys, normalized).replacements;
}

export function filterRegionalDelayedCandidates(
  journeys: Journey[],
  query: CandidateQuery | NormalizedCandidateQuery,
) {
  const normalized = isNormalizedQuery(query) ? query : normalizeCandidateQuery(query);
  const candidates: CandidateResult[] = [];
  const discarded: DiscardedJourney[] = [];

  for (const journey of journeys) {
    const evaluation = evaluateRegionalJourney(journey, normalized);
    if (evaluation.result) {
      candidates.push(evaluation.result);
    } else {
      discarded.push({ journey, reasons: evaluation.reasons });
    }
  }

  return { candidates, discarded };
}

export function filterLongDistanceReplacements(
  journeys: Journey[],
  query: CandidateQuery | NormalizedCandidateQuery,
) {
  const normalized = isNormalizedQuery(query) ? query : normalizeCandidateQuery(query);
  const replacements: ReplacementResult[] = [];
  const discarded: DiscardedJourney[] = [];

  for (const journey of journeys) {
    const evaluation = evaluateLongDistanceJourney(journey, normalized);
    if (evaluation.result) {
      replacements.push(evaluation.result);
    } else {
      discarded.push({ journey, reasons: evaluation.reasons });
    }
  }

  return { replacements, discarded };
}

export function buildQueryWindow(query: CandidateQuery | NormalizedCandidateQuery) {
  const normalized = isNormalizedQuery(query) ? query : normalizeCandidateQuery(query);
  return {
    lowerBound: normalized.lowerBound,
    queryTime: normalized.queryTime,
    upperBound: normalized.upperBound,
    inclusive: true,
  };
}

export function findStopIndex(
  journey: Journey,
  station: string | StationRef,
  startIndex = 0,
) {
  const stationRef = toStationRef(station);
  for (let index = Math.max(0, startIndex); index < journey.stops.length; index += 1) {
    if (stationMatches(journey.stops[index].station, stationRef)) {
      return index;
    }
  }
  return -1;
}

export function getBoardingStop(journey: Journey, departure: string | StationRef) {
  const index = findStopIndex(journey, departure);
  return index >= 0 ? journey.stops[index] : null;
}

export function getDestinationStop(
  journey: Journey,
  arrival: string | StationRef,
  startIndex = 0,
) {
  const index = findStopIndex(journey, arrival, startIndex);
  return index >= 0 ? journey.stops[index] : null;
}

export function getPlannedEventDate(event: StationEvent) {
  return parseOptionalDate(event.plannedDeparture ?? event.plannedArrival);
}

export function getRealtimeEventDate(event: StationEvent) {
  return parseOptionalDate(
    event.realtimeDeparture ??
      event.realtimeArrival ??
      event.plannedDeparture ??
      event.plannedArrival,
  );
}

export function getPlannedEventIso(event: StationEvent) {
  return getPlannedEventDate(event)?.toISOString();
}

export function getRealtimeEventIso(event: StationEvent) {
  return getRealtimeEventDate(event)?.toISOString();
}

export function normalizeStationName(name: string) {
  return name
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/\bhauptbahnhof\b/g, "hbf")
    .replace(/\bcentral station\b/g, "hbf")
    .replace(/\bkoeln\b/g, "koln")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function stationMatches(candidate: StationRef, expected: StationRef) {
  if (candidate.evaNo && expected.evaNo && candidate.evaNo === expected.evaNo) {
    return true;
  }
  const expectedNames = [expected.name, ...(expected.aliases ?? [])].map(normalizeStationName);
  const candidateNames = [candidate.name, ...(candidate.aliases ?? [])].map(normalizeStationName);
  return candidateNames.some((candidateName) => expectedNames.includes(candidateName));
}

export function categoryMatches(journey: Journey, allowedTypes: string[]) {
  const allowed = normalizeTypeList(allowedTypes);
  const tokens = getCategoryTokens(journey);
  return allowed.some((allowedType) => tokens.has(allowedType));
}

export function getCategoryTokens(journey: Journey) {
  const fields = [journey.category, journey.lineNumber, journey.label, journey.operator].filter(
    (value): value is string => Boolean(value),
  );
  const tokens = new Set<string>();

  for (const field of fields) {
    const normalized = field.toUpperCase().replace(/[^A-Z0-9]+/g, " ");
    for (const token of normalized.split(/\s+/)) {
      if (!token) {
        continue;
      }
      tokens.add(token);
      const typePrefix = token.match(/^[A-Z]+/)?.[0];
      if (typePrefix) {
        tokens.add(typePrefix);
      }
    }
    for (const type of [
      "ICE",
      "IC",
      "EC",
      "ECE",
      "FLX",
      "NJ",
      "IRE",
      "RE",
      "RB",
      "S",
      "MEX",
      "FEX",
      "BUS",
    ]) {
      if (new RegExp(`\\b${type}\\s*\\d*\\b`).test(normalized)) {
        tokens.add(type);
      }
    }
  }

  return tokens;
}

export function parseQueryDateTime(
  value: string | Date,
  options: { serviceDate?: string; timeZone?: string } = {},
) {
  if (value instanceof Date) {
    return assertValidDate(value);
  }

  const timeZone = options.timeZone || DEFAULT_TIME_ZONE;
  const trimmed = value.trim();
  const timeOnly = trimmed.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (timeOnly) {
    if (!options.serviceDate) {
      throw new Error("serviceDate is required when queryTime only contains a clock time");
    }
    return parseQueryDateTime(`${options.serviceDate}T${trimmed}`, { timeZone });
  }

  if (/[zZ]$|[+-]\d{2}:?\d{2}$/.test(trimmed)) {
    return assertValidDate(new Date(trimmed));
  }

  const local = trimmed.match(
    /^(\d{4})-(\d{2})-(\d{2})(?:[T\s](\d{1,2}):(\d{2})(?::(\d{2}))?)$/,
  );
  if (!local) {
    return assertValidDate(new Date(trimmed));
  }

  return localDateTimeToUtc(
    {
      year: Number(local[1]),
      month: Number(local[2]),
      day: Number(local[3]),
      hour: Number(local[4]),
      minute: Number(local[5]),
      second: Number(local[6] ?? 0),
    },
    timeZone,
  );
}

export function localDateTimeToUtc(
  parts: {
    year: number;
    month: number;
    day: number;
    hour: number;
    minute: number;
    second?: number;
  },
  timeZone = DEFAULT_TIME_ZONE,
) {
  const utcGuess = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second ?? 0,
  );
  const firstPass = new Date(utcGuess - getTimeZoneOffsetMs(new Date(utcGuess), timeZone));
  const secondPass = new Date(
    utcGuess - getTimeZoneOffsetMs(firstPass, timeZone),
  );
  return assertValidDate(secondPass);
}

export function addMinutes(date: Date, minutes: number) {
  return new Date(date.getTime() + minutes * 60000);
}

function evaluateRegionalJourney(
  journey: Journey,
  query: NormalizedCandidateQuery,
): { result?: CandidateResult; reasons: string[] } {
  const common = evaluateCommonJourney(journey, query);
  const reasons = [...common.reasons];

  if (!categoryMatches(journey, query.regionalTypes)) {
    reasons.push(`category is not in regionalTypes: ${query.regionalTypes.join(",")}`);
  }
  if (hasLongDistanceCategory(journey) && !categoryMatches(journey, query.regionalTypes)) {
    reasons.push("journey has a long-distance category");
  }

  const delay = common.boardingStop ? delayAtBoardingStation(journey, query.departureStation) : null;
  if (delay === null) {
    reasons.push("delay at boarding station is unavailable");
  } else if (delay < query.delayThresholdMinutes) {
    reasons.push(`delay ${delay} is below threshold ${query.delayThresholdMinutes}`);
  }

  if (reasons.length || !common.boardingStop || !common.destinationStop) {
    return { reasons };
  }

  return {
    reasons: [],
    result: {
      journey,
      boardingStop: common.boardingStop,
      destinationStop: common.destinationStop,
      boardingDelayMinutes: delay,
      plannedBoardingTime: getPlannedEventIso(common.boardingStop),
      realtimeBoardingTime: getRealtimeEventIso(common.boardingStop),
      matchedBy: common.matchedBy,
    },
  };
}

function evaluateLongDistanceJourney(
  journey: Journey,
  query: NormalizedCandidateQuery,
): { result?: ReplacementResult; reasons: string[] } {
  const common = evaluateCommonJourney(journey, query);
  const reasons = [...common.reasons];

  if (!categoryMatches(journey, query.longDistanceReplacementTypes)) {
    reasons.push(
      `category is not in longDistanceReplacementTypes: ${query.longDistanceReplacementTypes.join(
        ",",
      )}`,
    );
  }
  if (common.boardingStop && !isReachableAtQueryTime(common.boardingStop, query)) {
    reasons.push("replacement is not reachable at query time");
  }

  if (reasons.length || !common.boardingStop || !common.destinationStop) {
    return { reasons };
  }

  return {
    reasons: [],
    result: {
      journey,
      boardingStop: common.boardingStop,
      destinationStop: common.destinationStop,
      plannedBoardingTime: getPlannedEventIso(common.boardingStop),
      realtimeBoardingTime: getRealtimeEventIso(common.boardingStop),
      reachable: true,
      matchedBy: common.matchedBy,
    },
  };
}

function evaluateCommonJourney(journey: Journey, query: NormalizedCandidateQuery) {
  const reasons: string[] = [];
  const departureIndex = findStopIndex(journey, query.departureStation);
  const boardingStop = departureIndex >= 0 ? journey.stops[departureIndex] : null;
  const destinationStop =
    departureIndex >= 0 ? getDestinationStop(journey, query.arrivalStation, departureIndex + 1) : null;

  if (journey.cancelled || boardingStop?.cancelled) {
    reasons.push("journey or boarding stop is cancelled");
  }
  if (!boardingStop) {
    reasons.push("departure station is not served");
  }
  if (!destinationStop) {
    reasons.push("arrival station is not served after departure station");
  }
  if (boardingStop && !isWithinInclusiveWindow(boardingStop, query)) {
    reasons.push("boarding event is outside inclusive query window");
  }
  if (
    boardingStop &&
    query.forceQueryDepartureTime &&
    !isReachableAtQueryTime(boardingStop, query)
  ) {
    reasons.push("boarding event is not reachable at query time");
  }

  const matchedBy: string[] = [];
  if (boardingStop) {
    matchedBy.push("departure_station");
  }
  if (destinationStop) {
    matchedBy.push("arrival_station_order");
  }
  if (boardingStop && isWithinInclusiveWindow(boardingStop, query)) {
    matchedBy.push("inclusive_window");
  }
  if (!query.forceQueryDepartureTime || (boardingStop && isReachableAtQueryTime(boardingStop, query))) {
    matchedBy.push("reachability");
  }

  return { boardingStop, destinationStop, reasons, matchedBy };
}

function hasLongDistanceCategory(journey: Journey) {
  const tokens = getCategoryTokens(journey);
  return [...LONG_DISTANCE_TYPES].some((type) => tokens.has(type));
}

function normalizeTypeList(types: string[]) {
  return [...new Set(types.map((type) => type.trim().toUpperCase()).filter(Boolean))];
}

function toStationRef(value: string | StationRef): StationRef {
  return typeof value === "string" ? { name: value } : value;
}

function isNormalizedQuery(query: CandidateQuery | NormalizedCandidateQuery): query is NormalizedCandidateQuery {
  return queryTimeIsDate(query.queryTime) && "lowerBound" in query && "upperBound" in query;
}

function queryTimeIsDate(value: string | Date): value is Date {
  return value instanceof Date;
}

function isDateWithinInclusive(date: Date, lower: Date, upper: Date) {
  const value = date.getTime();
  return value >= lower.getTime() && value <= upper.getTime();
}

function parseOptionalDate(value?: string) {
  if (!value) {
    return null;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function assertValidDate(date: Date) {
  if (Number.isNaN(date.getTime())) {
    throw new Error("invalid date/time");
  }
  return date;
}

function getTimeZoneOffsetMs(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const value = (type: string) => {
    const part = parts.find((entry) => entry.type === type)?.value;
    if (!part) {
      throw new Error(`missing ${type} in timezone conversion`);
    }
    return Number(part);
  };
  const asUtc = Date.UTC(
    value("year"),
    value("month") - 1,
    value("day"),
    value("hour"),
    value("minute"),
    value("second"),
  );
  return asUtc - date.getTime();
}

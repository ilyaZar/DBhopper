export const DEFAULT_TIME_ZONE = "Europe/Berlin";
export const DEFAULT_WINDOW_WIDTH_MINUTES = 45;
export const DEFAULT_DELAY_THRESHOLD_MINUTES = 20;
export const DEFAULT_REGIONAL_TYPES = ["RE"];
export const DEFAULT_LONG_DISTANCE_REPLACEMENT_TYPES = ["ICE", "IC", "EC"];
const LONG_DISTANCE_TYPES = new Set(["ICE", "IC", "EC", "ECE", "FLX", "NJ"]);
export function normalizeCandidateQuery(query) {
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
        longDistanceReplacementTypes: normalizeTypeList(query.longDistanceReplacementTypes ?? DEFAULT_LONG_DISTANCE_REPLACEMENT_TYPES),
        lowerBound: addMinutes(queryTime, -windowWidthMinutes),
        upperBound: addMinutes(queryTime, windowWidthMinutes),
    };
}
export function isWithinInclusiveWindow(event, query) {
    const normalized = isNormalizedQuery(query) ? query : normalizeCandidateQuery(query);
    const planned = getPlannedEventDate(event);
    const realtime = getRealtimeEventDate(event);
    return ((planned ? isDateWithinInclusive(planned, normalized.lowerBound, normalized.upperBound) : false) ||
        (realtime ? isDateWithinInclusive(realtime, normalized.lowerBound, normalized.upperBound) : false));
}
export function isReachableAtQueryTime(event, query) {
    const normalized = isNormalizedQuery(query) ? query : normalizeCandidateQuery(query);
    const realtime = getRealtimeEventDate(event);
    return realtime ? realtime.getTime() >= normalized.queryTime.getTime() : false;
}
export function trainServesRouteInOrder(journey, departure, arrival) {
    const departureIndex = findStopIndex(journey, departure);
    if (departureIndex < 0) {
        return false;
    }
    return findStopIndex(journey, arrival, departureIndex + 1) > departureIndex;
}
export function delayAtBoardingStation(journey, departure) {
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
export async function findRegionalDelayedCandidates(query, provider) {
    const normalized = normalizeCandidateQuery(query);
    const { journeys } = await collectProviderJourneys(provider, normalized.departureStation, {
        lowerBound: normalized.lowerBound,
        queryTime: normalized.queryTime,
        upperBound: normalized.upperBound,
    });
    return filterRegionalDelayedCandidates(journeys, normalized).candidates;
}
export async function findLongDistanceReplacements(query, _delayedCandidate, provider) {
    const normalized = normalizeCandidateQuery(query);
    const { journeys } = await collectProviderJourneys(provider, normalized.departureStation, {
        lowerBound: normalized.lowerBound,
        queryTime: normalized.queryTime,
        upperBound: normalized.upperBound,
    });
    return filterLongDistanceReplacements(journeys, normalized).replacements;
}
export async function collectProviderJourneys(provider, station, timeWindow) {
    const events = await provider.queryStationBoard(station, timeWindow);
    const journeys = dedupeJourneys(await Promise.all(events.map((event) => provider.fetchJourneyDetails(event))));
    return { events, journeys };
}
export function dedupeJourneys(journeys) {
    return [...new Map(journeys.map((journey) => [journey.id, journey])).values()];
}
export function filterRegionalDelayedCandidates(journeys, query) {
    const normalized = isNormalizedQuery(query) ? query : normalizeCandidateQuery(query);
    const candidates = [];
    const discarded = [];
    for (const journey of journeys) {
        const evaluation = evaluateRegionalJourney(journey, normalized);
        if (evaluation.result) {
            candidates.push(evaluation.result);
        }
        else {
            discarded.push({ journey, reasons: evaluation.reasons });
        }
    }
    return { candidates, discarded };
}
export function filterLongDistanceReplacements(journeys, query) {
    const normalized = isNormalizedQuery(query) ? query : normalizeCandidateQuery(query);
    const replacements = [];
    const discarded = [];
    for (const journey of journeys) {
        const evaluation = evaluateLongDistanceJourney(journey, normalized);
        if (evaluation.result) {
            replacements.push(evaluation.result);
        }
        else {
            discarded.push({ journey, reasons: evaluation.reasons });
        }
    }
    return { replacements, discarded };
}
export function buildQueryWindow(query) {
    const normalized = isNormalizedQuery(query) ? query : normalizeCandidateQuery(query);
    return {
        lowerBound: normalized.lowerBound,
        queryTime: normalized.queryTime,
        upperBound: normalized.upperBound,
        inclusive: true,
    };
}
export function findStopIndex(journey, station, startIndex = 0) {
    const stationRef = toStationRef(station);
    for (let index = Math.max(0, startIndex); index < journey.stops.length; index += 1) {
        if (stationMatches(journey.stops[index].station, stationRef)) {
            return index;
        }
    }
    return -1;
}
export function getBoardingStop(journey, departure) {
    const index = findStopIndex(journey, departure);
    return index >= 0 ? journey.stops[index] : null;
}
export function getDestinationStop(journey, arrival, startIndex = 0) {
    const index = findStopIndex(journey, arrival, startIndex);
    return index >= 0 ? journey.stops[index] : null;
}
export function getPlannedEventDate(event) {
    return parseOptionalDate(event.plannedDeparture ?? event.plannedArrival);
}
export function getRealtimeEventDate(event) {
    return parseOptionalDate(event.realtimeDeparture ??
        event.realtimeArrival ??
        event.plannedDeparture ??
        event.plannedArrival);
}
export function getPlannedEventIso(event) {
    return getPlannedEventDate(event)?.toISOString();
}
export function getRealtimeEventIso(event) {
    return getRealtimeEventDate(event)?.toISOString();
}
export function normalizeStationName(name) {
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
export function stationMatches(candidate, expected) {
    if (candidate.evaNo && expected.evaNo && candidate.evaNo === expected.evaNo) {
        return true;
    }
    const expectedNames = [expected.name, ...(expected.aliases ?? [])].map(normalizeStationName);
    const candidateNames = [candidate.name, ...(candidate.aliases ?? [])].map(normalizeStationName);
    return candidateNames.some((candidateName) => expectedNames.includes(candidateName));
}
export function buildPathStops(boardingStop, pathNames, buildPathStop) {
    const pathStops = pathNames.map(buildPathStop);
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
export function categoryMatches(journey, allowedTypes) {
    const allowed = normalizeTypeList(allowedTypes);
    const tokens = getCategoryTokens(journey);
    return allowed.some((allowedType) => tokens.has(allowedType));
}
export function getCategoryTokens(journey) {
    const publicFields = [
        journey.publicCategory,
        journey.publicLine,
        journey.lineNumber,
        journey.displayLabel,
        journey.label,
    ].filter((value) => Boolean(value));
    const fallbackFields = [
        journey.category,
        journey.technicalCategory,
        journey.operator,
    ].filter((value) => Boolean(value));
    const fields = publicFields.length ? publicFields : fallbackFields;
    const tokens = new Set();
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
export function derivePublicCategory(publicLine, fallbackCategory) {
    const category = publicLine
        ?.trim()
        .toUpperCase()
        .match(/^(ICE|ECE|EC|IC|IRE|RE|RB|S|MEX|FEX|NJ|FLX|BUS)\s*\d*/)?.[1];
    return category ?? fallbackCategory?.trim().toUpperCase();
}
export function parseQueryDateTime(value, options = {}) {
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
    const local = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T\s](\d{1,2}):(\d{2})(?::(\d{2}))?)$/);
    if (!local) {
        return assertValidDate(new Date(trimmed));
    }
    return localDateTimeToUtc({
        year: Number(local[1]),
        month: Number(local[2]),
        day: Number(local[3]),
        hour: Number(local[4]),
        minute: Number(local[5]),
        second: Number(local[6] ?? 0),
    }, timeZone);
}
export function localDateTimeToUtc(parts, timeZone = DEFAULT_TIME_ZONE) {
    const utcGuess = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second ?? 0);
    const firstPass = new Date(utcGuess - getTimeZoneOffsetMs(new Date(utcGuess), timeZone));
    const secondPass = new Date(utcGuess - getTimeZoneOffsetMs(firstPass, timeZone));
    return assertValidDate(secondPass);
}
export function addMinutes(date, minutes) {
    return new Date(date.getTime() + minutes * 60000);
}
function evaluateRegionalJourney(journey, query) {
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
    }
    else if (delay < query.delayThresholdMinutes) {
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
function evaluateLongDistanceJourney(journey, query) {
    const common = evaluateCommonJourney(journey, query);
    const reasons = [...common.reasons];
    if (!categoryMatches(journey, query.longDistanceReplacementTypes)) {
        reasons.push(`category is not in longDistanceReplacementTypes: ${query.longDistanceReplacementTypes.join(",")}`);
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
function evaluateCommonJourney(journey, query) {
    const reasons = [];
    const departureIndex = findStopIndex(journey, query.departureStation);
    const boardingStop = departureIndex >= 0 ? journey.stops[departureIndex] : null;
    const destinationStop = departureIndex >= 0 ? getDestinationStop(journey, query.arrivalStation, departureIndex + 1) : null;
    if (journey.cancelled || boardingStop?.cancelled) {
        reasons.push("journey or boarding stop is cancelled");
    }
    if (!boardingStop) {
        reasons.push("departure station is not served");
    }
    if (boardingStop && !hasDepartureEvent(boardingStop)) {
        reasons.push("boarding station has no departure event");
    }
    if (!destinationStop) {
        reasons.push("arrival station is not served after departure station");
    }
    if (boardingStop && !isWithinInclusiveWindow(boardingStop, query)) {
        reasons.push("boarding event is outside inclusive query window");
    }
    if (boardingStop &&
        query.forceQueryDepartureTime &&
        !isReachableAtQueryTime(boardingStop, query)) {
        reasons.push("boarding event is not reachable at query time");
    }
    const matchedBy = [];
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
function hasDepartureEvent(event) {
    return Boolean(event.plannedDeparture || event.realtimeDeparture);
}
function hasLongDistanceCategory(journey) {
    const tokens = getCategoryTokens(journey);
    return [...LONG_DISTANCE_TYPES].some((type) => tokens.has(type));
}
function normalizeTypeList(types) {
    return [...new Set(types.map((type) => type.trim().toUpperCase()).filter(Boolean))];
}
function toStationRef(value) {
    return typeof value === "string" ? { name: value } : value;
}
function isNormalizedQuery(query) {
    return queryTimeIsDate(query.queryTime) && "lowerBound" in query && "upperBound" in query;
}
function queryTimeIsDate(value) {
    return value instanceof Date;
}
function isDateWithinInclusive(date, lower, upper) {
    const value = date.getTime();
    return value >= lower.getTime() && value <= upper.getTime();
}
function parseOptionalDate(value) {
    if (!value) {
        return null;
    }
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
}
function assertValidDate(date) {
    if (Number.isNaN(date.getTime())) {
        throw new Error("invalid date/time");
    }
    return date;
}
function getTimeZoneOffsetMs(date, timeZone) {
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
    const value = (type) => {
        const part = parts.find((entry) => entry.type === type)?.value;
        if (!part) {
            throw new Error(`missing ${type} in timezone conversion`);
        }
        return Number(part);
    };
    const asUtc = Date.UTC(value("year"), value("month") - 1, value("day"), value("hour"), value("minute"), value("second"));
    return asUtc - date.getTime();
}

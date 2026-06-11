import { Type } from "typebox";
import { applyCredentialsToConfig, credentialsSummary, readSelectedCredentialsProfile, } from "./credentials.js";
import { BAHN_WEB_RESEARCH_SUMMARY, BAHN_WEB_SOURCE_API, createBahnWebProvider, } from "./bahn-web.js";
import { DB_DELAY_RESEARCH_SUMMARY, createTimetablesProvider, timetablesConfigStatus, } from "./db-timetables.js";
import { DEFAULT_DELAY_THRESHOLD_MINUTES, DEFAULT_LONG_DISTANCE_REPLACEMENT_TYPES, DEFAULT_REGIONAL_TYPES, DEFAULT_TIME_ZONE, DEFAULT_WINDOW_WIDTH_MINUTES, buildQueryWindow, filterLongDistanceReplacements, filterRegionalDelayedCandidates, normalizeCandidateQuery, normalizeStationName, } from "./db-delay.js";
export const DB_DELAY_TOOL_NAMES = [
    "dbhopper_db_delay_research",
    "dbhopper_query_db_delay",
];
export function createDbDelayToolDefinitions(tool) {
    return [
        tool({
            name: "dbhopper_db_delay_research",
            label: "DBhopper DB Delay Research",
            description: "Return the documented API stack and deterministic semantics used by DBhopper delay queries.",
            optional: true,
            parameters: Type.Object({}, { additionalProperties: false }),
            execute: () => dbDelayResearchResult(),
        }),
        tool({
            name: "dbhopper_query_db_delay",
            label: "DBhopper Query DB Delay",
            description: [
                "Find delayed direct regional train candidates and reachable direct",
                "ICE/IC/EC replacement candidates for a Deutsche Bahn route/time window.",
            ].join(" "),
            optional: true,
            parameters: Type.Object({
                provider: Type.Optional(Type.Union([
                    Type.Literal("auto"),
                    Type.Literal("db-timetables"),
                    Type.Literal("bahn-web"),
                ], {
                    default: "auto",
                    description: "Delay data provider. auto uses Timetables when credentials exist, otherwise bahn-web.",
                })),
                departure_station: Type.String({
                    description: "Boarding station name, for example Hamm(Westf)Hbf.",
                }),
                credentials_profile: Type.Optional(Type.String({
                    description: "Optional TOML credentials file under assets/private/credentials/.",
                })),
                arrival_station: Type.String({
                    description: "Destination station name, for example Koeln Hbf.",
                }),
                query_time: Type.String({
                    description: "Query time T. Use ISO with offset, or HH:mm together with service_date.",
                }),
                service_date: Type.Optional(Type.String({
                    description: "YYYY-MM-DD date used when query_time is only HH:mm.",
                })),
                time_zone: Type.Optional(Type.String({
                    default: DEFAULT_TIME_ZONE,
                    description: "IANA timezone for local query_time values.",
                })),
                window_width_minutes: Type.Optional(Type.Number({
                    default: DEFAULT_WINDOW_WIDTH_MINUTES,
                    minimum: 0,
                    description: "Minutes before and after query_time. Bounds are inclusive.",
                })),
                delay_threshold_minutes: Type.Optional(Type.Number({
                    default: DEFAULT_DELAY_THRESHOLD_MINUTES,
                    minimum: 0,
                    description: "Minimum live delay at the boarding station.",
                })),
                force_query_departure_time: Type.Optional(Type.Boolean({
                    default: false,
                    description: "If true, delayed regional trains must still be reachable at query_time.",
                })),
                regional_types: Type.Optional(Type.Array(Type.String(), {
                    default: DEFAULT_REGIONAL_TYPES,
                    description: "Regional train categories to include.",
                })),
                long_distance_replacement_types: Type.Optional(Type.Array(Type.String(), {
                    default: DEFAULT_LONG_DISTANCE_REPLACEMENT_TYPES,
                    description: "Direct replacement train categories to include.",
                })),
                include_discarded: Type.Optional(Type.Boolean({
                    default: true,
                    description: "Include near-miss candidates with deterministic discard reasons.",
                })),
                include_raw: Type.Optional(Type.Boolean({
                    default: false,
                    description: "Include raw provider rows for audit/debugging.",
                })),
            }, { additionalProperties: false }),
            execute: async (params, config, context) => runDbDelayQuery(params, config, context.signal),
        }),
    ];
}
export async function runDbDelayQuery(params, config = {}, signal) {
    let loadedCredentials = undefined;
    let providerChoice;
    let effectiveConfig;
    try {
        loadedCredentials = await readSelectedCredentialsProfile(config, params.credentials_profile);
        effectiveConfig = applyCredentialsToConfig(config, loadedCredentials);
        const status = timetablesConfigStatus(effectiveConfig);
        providerChoice = selectDelayProvider(params.provider, effectiveConfig, status.configured);
        if (providerChoice.selected === "db-timetables" && !status.configured) {
            return {
                ok: false,
                operation: "db_delay_query",
                needs_configuration: true,
                message: "DB Timetables credentials are required before live delay lookup can run.",
                required_configuration: [
                    "dbClientId or DB_CLIENT_ID",
                    "dbApiKey or DB_API_KEY",
                ],
                config_status: status,
                credentials: credentialsSummary(loadedCredentials),
                provider_selection: providerChoice,
                research: combinedResearchSummary(),
            };
        }
        return await runDbDelayQueryWithProvider(params, effectiveConfig, loadedCredentials, providerChoice, signal);
    }
    catch (error) {
        if (effectiveConfig &&
            providerChoice &&
            shouldFallbackToBahnWeb(params.provider, providerChoice, error)) {
            const fallbackChoice = {
                requested: providerChoice.requested,
                selected: BAHN_WEB_SOURCE_API,
                reason: "DB Timetables failed with a credential/authentication error; using bahn-web fallback",
                fallbackFrom: providerChoice.selected,
            };
            try {
                const result = await runDbDelayQueryWithProvider(params, effectiveConfig, loadedCredentials, fallbackChoice, signal);
                return {
                    ...result,
                    provider_selection: fallbackChoice,
                    official_provider_error: sanitizedProviderError(error),
                };
            }
            catch (fallbackError) {
                return {
                    ok: false,
                    operation: "db_delay_query",
                    error: errorMessage(fallbackError),
                    primary_provider_error: sanitizedProviderError(error),
                    needs_configuration: false,
                    credentials: credentialsSummary(loadedCredentials),
                    provider_selection: fallbackChoice,
                    research: combinedResearchSummary(),
                };
            }
        }
        return {
            ok: false,
            operation: "db_delay_query",
            error: errorMessage(error),
            needs_configuration: /credentials/i.test(errorMessage(error)),
            credentials: credentialsSummary(loadedCredentials),
            provider_selection: providerChoice,
            research: combinedResearchSummary(),
        };
    }
}
async function runDbDelayQueryWithProvider(params, effectiveConfig, loadedCredentials, providerChoice, signal) {
    const provider = providerChoice.selected === BAHN_WEB_SOURCE_API
        ? createBahnWebProvider({
            ...effectiveConfig,
            signal,
            timeZone: params.time_zone ?? effectiveConfig.timeZone,
        })
        : createTimetablesProvider({
            ...effectiveConfig,
            signal,
            timeZone: params.time_zone ?? effectiveConfig.timeZone,
        });
    const [departureMatches, arrivalMatches] = await Promise.all([
        provider.resolveStation(params.departure_station),
        provider.resolveStation(params.arrival_station),
    ]);
    const departure = chooseStation(departureMatches, params.departure_station);
    const arrival = chooseStation(arrivalMatches, params.arrival_station);
    if (!departure || !arrival) {
        return {
            ok: false,
            operation: "db_delay_query",
            message: "could not resolve one or both input stations",
            station_matches: {
                departure: departureMatches,
                arrival: arrivalMatches,
            },
        };
    }
    const query = normalizeCandidateQuery(toCandidateQuery(params, departure, arrival));
    const window = buildQueryWindow(query);
    const events = await provider.queryStationBoard(departure, {
        lowerBound: window.lowerBound,
        queryTime: window.queryTime,
        upperBound: window.upperBound,
    });
    const journeys = dedupeJourneys(await Promise.all(events.map((event) => provider.fetchJourneyDetails(event))));
    const regional = filterRegionalDelayedCandidates(journeys, query);
    const longDistance = filterLongDistanceReplacements(journeys, query);
    return {
        ok: true,
        operation: "db_delay_query",
        source_api: providerChoice.selected,
        source_api_notes: sourceApiNotes(providerChoice.selected),
        credentials: credentialsSummary(loadedCredentials),
        provider_selection: providerChoice,
        input: {
            provider: params.provider,
            departure_station: params.departure_station,
            arrival_station: params.arrival_station,
            query_time: params.query_time,
            service_date: params.service_date,
        },
        normalized_input: {
            departure_station: stationRefOutput(departure),
            arrival_station: stationRefOutput(arrival),
            query_time: query.queryTime.toISOString(),
            time_zone: query.timeZone,
            window_width_minutes: query.windowWidthMinutes,
            delay_threshold_minutes: query.delayThresholdMinutes,
            force_query_departure_time: query.forceQueryDepartureTime,
            regional_types: query.regionalTypes,
            long_distance_replacement_types: query.longDistanceReplacementTypes,
        },
        window: {
            lower_bound: query.lowerBound.toISOString(),
            query_time: query.queryTime.toISOString(),
            upper_bound: query.upperBound.toISOString(),
            inclusive: true,
        },
        delayed_regional_candidates: regional.candidates.map((candidate) => candidateOutput(candidate, longDistance.replacements, params.include_raw === true)),
        replacement_candidates: longDistance.replacements.map((replacement) => replacementOutput(replacement, params.include_raw === true)),
        table_rows: cleanedTableRows(regional.candidates, longDistance.replacements),
        cleaned_summary: {
            delayed_regional_count: regional.candidates.length,
            replacement_count: longDistance.replacements.length,
            has_delayed_regional_candidates: regional.candidates.length > 0,
            has_reachable_replacements: longDistance.replacements.length > 0,
        },
        discarded_near_misses: params.include_discarded === false
            ? undefined
            : {
                regional: regional.discarded
                    .slice(0, 50)
                    .map((entry) => discardedOutput(entry, params.include_raw === true)),
                replacements: longDistance.discarded
                    .slice(0, 50)
                    .map((entry) => discardedOutput(entry, params.include_raw === true)),
            },
        station_matches: {
            departure: departureMatches.slice(0, 10).map(stationRefOutput),
            arrival: arrivalMatches.slice(0, 10).map(stationRefOutput),
        },
        research: combinedResearchSummary(),
    };
}
function dbDelayResearchResult() {
    return {
        ok: true,
        operation: "db_delay_research",
        semantics: {
            bounds: "inclusive",
            lower_bound: "query_time - window_width_minutes",
            upper_bound: "query_time + window_width_minutes",
            boarding_station: "input departure station",
            delay_measurement: "live delay at the boarding station",
            route_matching: "departure and arrival stations must occur in order",
            regional_window: "planned or realtime boarding event must be inside the inclusive window",
            force_query_departure_time: "when true, realtime boarding event must be >= query_time",
            replacements: "direct only, same route/window, category defaults to ICE/IC/EC, reachable if realtime boarding event >= query_time",
            output_cleaning: "the tool returns deterministic normalized candidates and table_rows; no LLM cleanup of raw API payloads is required",
        },
        field_mapping: {
            timetables: {
                station_id: "Timetables station eva attribute",
                train_category: "tl.c",
                train_number: "tl.n",
                line_number: "tl.l",
                journey_id: "s.id",
                planned_arrival: "ar.pt",
                planned_departure: "dp.pt",
                realtime_arrival: "ar.ct from fchg/rchg merge",
                realtime_departure: "dp.ct from fchg/rchg merge",
                cancellation_flags: "ar/dp status fields from fchg/rchg merge",
                platform: "ar.pp/dp.pp and ar.cp/dp.cp",
                station_sequence: "ar/dp ppth or cpth path fields, if supplied",
            },
            bahn_web: {
                station_id: "orte[].extId",
                train_category: "verkehrmittel.produktGattung plus mittelText category",
                train_number: "verkehrmittel.name/langText/mittelText",
                line_number: "verkehrmittel.linienNummer",
                journey_id: "journeyId",
                planned_departure: "zeit",
                realtime_departure: "ezZeit",
                platform: "gleis",
                station_sequence: "ueber plus terminus",
            },
        },
        research: combinedResearchSummary(),
    };
}
function toCandidateQuery(params, departure, arrival) {
    return {
        departureStation: departure,
        arrivalStation: arrival,
        queryTime: params.query_time,
        serviceDate: params.service_date,
        timeZone: params.time_zone,
        windowWidthMinutes: params.window_width_minutes,
        delayThresholdMinutes: params.delay_threshold_minutes,
        forceQueryDepartureTime: params.force_query_departure_time,
        regionalTypes: params.regional_types,
        longDistanceReplacementTypes: params.long_distance_replacement_types,
    };
}
function chooseStation(stations, input) {
    const normalized = normalizeStationName(input);
    return (stations.find((station) => normalizeStationName(station.name) === normalized) ??
        stations[0] ??
        null);
}
function dedupeJourneys(journeys) {
    return [...new Map(journeys.map((journey) => [journey.id, journey])).values()];
}
export function selectDelayProvider(requested, config, timetablesConfigured) {
    const requestedProvider = requested ?? config.delayProvider ?? "auto";
    if (requestedProvider === "auto") {
        return {
            requested: requestedProvider,
            selected: timetablesConfigured ? "db-timetables" : BAHN_WEB_SOURCE_API,
            reason: timetablesConfigured
                ? "DB Timetables credentials are configured"
                : "DB Timetables credentials are missing, using bahn-web fallback",
        };
    }
    return {
        requested: requestedProvider,
        selected: requestedProvider,
        reason: "provider was explicitly selected",
    };
}
export function shouldFallbackToBahnWeb(requested, providerChoice, error) {
    return ((requested ?? providerChoice.requested) === "auto" &&
        providerChoice.selected === "db-timetables" &&
        isTimetablesCredentialError(error));
}
export function isTimetablesCredentialError(error) {
    const message = errorMessage(error);
    return /DB Timetables request failed with HTTP 401|HTTP 401|Unauthorized|Invalid client id or secret/i.test(message);
}
function sanitizedProviderError(error) {
    return {
        message: errorMessage(error),
        credentialRelated: isTimetablesCredentialError(error),
    };
}
function sourceApiNotes(provider) {
    return provider === BAHN_WEB_SOURCE_API
        ? BAHN_WEB_RESEARCH_SUMMARY.limitations
        : DB_DELAY_RESEARCH_SUMMARY.limitations;
}
function errorMessage(error) {
    return error instanceof Error ? error.message : String(error);
}
function combinedResearchSummary() {
    return {
        official: DB_DELAY_RESEARCH_SUMMARY,
        bahn_web: BAHN_WEB_RESEARCH_SUMMARY,
    };
}
function cleanedTableRows(regionalCandidates, replacements) {
    return [
        ...regionalCandidates.map((candidate) => ({
            role: "delayed_regional",
            label: candidate.journey.label,
            category: candidate.journey.category,
            train_number: candidate.journey.number,
            line_number: candidate.journey.lineNumber,
            delay_minutes: candidate.boardingDelayMinutes,
            reachable: null,
            planned_boarding_time: candidate.plannedBoardingTime,
            realtime_boarding_time: candidate.realtimeBoardingTime,
            boarding_station: candidate.boardingStop.station.name,
            destination_station: candidate.destinationStop.station.name,
            platform: candidate.boardingStop.realtimePlatform ?? candidate.boardingStop.platform,
            source: candidate.journey.source,
            route_confidence: candidate.journey.routeConfidence,
            route: candidate.journey.stops.map((stop) => stop.station.name),
            matched_by: candidate.matchedBy,
        })),
        ...replacements.map((replacement) => ({
            role: "reachable_replacement",
            label: replacement.journey.label,
            category: replacement.journey.category,
            train_number: replacement.journey.number,
            line_number: replacement.journey.lineNumber,
            delay_minutes: null,
            reachable: replacement.reachable,
            planned_boarding_time: replacement.plannedBoardingTime,
            realtime_boarding_time: replacement.realtimeBoardingTime,
            boarding_station: replacement.boardingStop.station.name,
            destination_station: replacement.destinationStop.station.name,
            platform: replacement.boardingStop.realtimePlatform ?? replacement.boardingStop.platform,
            source: replacement.journey.source,
            route_confidence: replacement.journey.routeConfidence,
            route: replacement.journey.stops.map((stop) => stop.station.name),
            matched_by: replacement.matchedBy,
        })),
    ];
}
function candidateOutput(candidate, replacements, includeRaw) {
    return {
        journey: journeyOutput(candidate.journey, includeRaw),
        boarding_delay_minutes: candidate.boardingDelayMinutes,
        planned_boarding_time: candidate.plannedBoardingTime,
        realtime_boarding_time: candidate.realtimeBoardingTime,
        boarding_station: stopOutput(candidate.boardingStop, includeRaw),
        destination_station: stopOutput(candidate.destinationStop, includeRaw),
        matched_by: candidate.matchedBy,
        replacement_candidates: replacements.map((replacement) => replacementOutput(replacement, includeRaw)),
    };
}
function replacementOutput(replacement, includeRaw) {
    return {
        journey: journeyOutput(replacement.journey, includeRaw),
        reachable: replacement.reachable,
        planned_boarding_time: replacement.plannedBoardingTime,
        realtime_boarding_time: replacement.realtimeBoardingTime,
        boarding_station: stopOutput(replacement.boardingStop, includeRaw),
        destination_station: stopOutput(replacement.destinationStop, includeRaw),
        matched_by: replacement.matchedBy,
    };
}
function discardedOutput(discarded, includeRaw) {
    return {
        journey: journeyOutput(discarded.journey, includeRaw, true),
        reasons: discarded.reasons,
    };
}
function journeyOutput(journey, includeRaw, compact = false) {
    return {
        id: journey.id,
        label: journey.label,
        category: journey.category,
        number: journey.number,
        line_number: journey.lineNumber,
        operator: journey.operator,
        cancelled: journey.cancelled === true,
        source: journey.source,
        route_confidence: journey.routeConfidence,
        stops: compact
            ? journey.stops.map((stop) => stop.station.name)
            : journey.stops.map((stop) => stopOutput(stop, includeRaw)),
        ...(includeRaw ? { raw: journey.raw } : {}),
    };
}
function stopOutput(stop, includeRaw) {
    return {
        station: stationRefOutput(stop.station),
        planned_arrival: stop.plannedArrival,
        planned_departure: stop.plannedDeparture,
        realtime_arrival: stop.realtimeArrival,
        realtime_departure: stop.realtimeDeparture,
        platform: stop.platform,
        realtime_platform: stop.realtimePlatform,
        cancelled: stop.cancelled === true,
        ...(includeRaw ? { raw: stop.raw } : {}),
    };
}
function stationRefOutput(station) {
    return {
        name: station.name,
        eva_no: station.evaNo,
        id: station.id,
        aliases: station.aliases,
        source: station.source,
    };
}

import { Type } from "typebox";

import type { DBhopperConfig } from "./types.js";
import {
  applyCredentialsToConfig,
  credentialsSummary,
  readSelectedCredentialsProfile,
} from "./credentials.js";
import { errorMessage } from "./errors.js";
import {
  BAHN_WEB_RESEARCH_SUMMARY,
  BAHN_WEB_SOURCE_API,
  createBahnWebProvider,
} from "./bahn-web.js";
import {
  DB_DELAY_RESEARCH_SUMMARY,
  createTimetablesProvider,
  timetablesConfigStatus,
} from "./db-timetables.js";
import { diagnoseDbApiCredentialErrorMessage } from "./db-api-errors.js";
import {
  DELAY_PROVIDERS,
  type DBhopperDelayFallbackSetting,
  type DBhopperDelayProviderSetting,
  type DBhopperSelectedDelayProvider,
} from "./delay-provider-options.js";
import {
  DB_DELAY_RESEARCH_TOOL_NAME,
  QUERY_DB_DELAY_TOOL_NAME,
} from "./tool-contracts.js";
import {
  DEFAULT_DELAY_THRESHOLD_MINUTES,
  DEFAULT_LONG_DISTANCE_REPLACEMENT_TYPES,
  DEFAULT_REGIONAL_TYPES,
  DEFAULT_TIME_ZONE,
  DEFAULT_WINDOW_WIDTH_MINUTES,
  buildQueryWindow,
  collectProviderJourneys,
  filterLongDistanceReplacements,
  filterRegionalDelayedCandidates,
  normalizeCandidateQuery,
  normalizeStationName,
  type CandidateQuery,
  type CandidateResult,
  type DiscardedJourney,
  type Journey,
  type JourneyStop,
  type ReplacementResult,
  type StationEvent,
  type StationRef,
} from "./db-delay.js";
import { readPrivateSettings } from "./private-settings.js";

export type DbDelayProviderName = DBhopperDelayProviderSetting;
export type SelectedDelayProviderName = DBhopperSelectedDelayProvider;

export interface DelayProviderRuntimeConfig extends DBhopperConfig {
  fetchImpl?: typeof fetch;
  curlPath?: string;
}

export interface DelayProviderChoice {
  requested: DbDelayProviderName;
  selected: SelectedDelayProviderName;
  reason: string;
  fallbackFrom?: SelectedDelayProviderName;
}

export interface DbDelayQueryToolParams {
  provider?: DbDelayProviderName;
  departure_station: string;
  arrival_station: string;
  query_time: string;
  service_date?: string;
  time_zone?: string;
  window_width_minutes?: number;
  delay_threshold_minutes?: number;
  force_query_departure_time?: boolean;
  regional_types?: string[];
  long_distance_replacement_types?: string[];
  include_discarded?: boolean;
  include_raw?: boolean;
}

export interface DbDelayProviderParityProbeParams extends DbDelayQueryToolParams {
  include_table_rows?: boolean;
}

export interface CleanedDelayTableRow {
  role: "delayed_regional" | "reachable_replacement";
  label?: string;
  display_label?: string;
  category: string;
  public_line?: string;
  public_category?: string;
  technical_category?: string;
  train_number?: string;
  line_number?: string;
  operator?: string;
  delay_minutes: number | null;
  reachable: boolean | null;
  planned_boarding_time?: string;
  planned_boarding_time_local?: string;
  realtime_boarding_time?: string;
  realtime_boarding_time_local?: string;
  local_time_zone: string;
  boarding_station: string;
  destination_station: string;
  platform?: string;
  source?: string;
  route_confidence?: Journey["routeConfidence"];
  route: string[];
  matched_by: string[];
}

export interface CleanedProviderComparison {
  same: boolean;
  same_identity: boolean;
  official_row_count: number;
  web_row_count: number;
  only_official: string[];
  only_web: string[];
  only_official_identity: string[];
  only_web_identity: string[];
}

export interface ProviderParitySide {
  ok: boolean;
  source_api?: string;
  error?: string;
  needs_configuration?: boolean;
  credentials?: unknown;
  provider_selection?: DelayProviderChoice;
  provider_error?: unknown;
  cleaned_summary?: unknown;
  table_rows?: CleanedDelayTableRow[];
}

export interface DbDelayProviderParityProbeResult {
  ok: boolean;
  operation: "db_delay_provider_parity_probe";
  api_ready: boolean;
  web_ready: boolean;
  official: ProviderParitySide;
  web: ProviderParitySide;
  comparison?: CleanedProviderComparison;
}

export function createDbDelayToolDefinitions(tool: any) {
  return [
    tool({
      name: DB_DELAY_RESEARCH_TOOL_NAME,
      label: "DBhopper DB Delay Research",
      description:
        "Return the documented API stack and deterministic semantics used by DBhopper delay queries.",
      parameters: Type.Object({}, { additionalProperties: false }),
      execute: () => dbDelayResearchResult(),
    }),
    tool({
      name: QUERY_DB_DELAY_TOOL_NAME,
      label: "DBhopper Query DB Delay",
      description:
        [
          "Find delayed direct regional train candidates and reachable direct",
          "ICE/IC/EC replacement candidates for a Deutsche Bahn route/time window.",
        ].join(" "),
      parameters: Type.Object(
        {
          provider: Type.Optional(
            Type.Union(DELAY_PROVIDERS.map((provider) => Type.Literal(provider)), {
              description:
                "Delay data provider. Omit to use DELAY_PROVIDER from settings.toml.",
            }),
          ),
          departure_station: Type.String({
            description: "Boarding station name, for example Hamm(Westf)Hbf.",
          }),
          arrival_station: Type.String({
            description: "Destination station name, for example Koeln Hbf.",
          }),
          query_time: Type.String({
            description:
              "Query time T. Use ISO with offset, or HH:mm together with service_date.",
          }),
          service_date: Type.Optional(
            Type.String({
              description: "YYYY-MM-DD date used when query_time is only HH:mm.",
            }),
          ),
          time_zone: Type.Optional(
            Type.String({
              default: DEFAULT_TIME_ZONE,
              description: "IANA timezone for local query_time values.",
            }),
          ),
          window_width_minutes: Type.Optional(
            Type.Number({
              default: DEFAULT_WINDOW_WIDTH_MINUTES,
              minimum: 0,
              description: "Minutes before and after query_time. Bounds are inclusive.",
            }),
          ),
          delay_threshold_minutes: Type.Optional(
            Type.Number({
              default: DEFAULT_DELAY_THRESHOLD_MINUTES,
              minimum: 0,
              description: "Minimum live delay at the boarding station.",
            }),
          ),
          force_query_departure_time: Type.Optional(
            Type.Boolean({
              default: false,
              description:
                "If true, delayed regional trains must still be reachable at query_time.",
            }),
          ),
          regional_types: Type.Optional(
            Type.Array(Type.String(), {
              default: DEFAULT_REGIONAL_TYPES,
              description: "Regional train categories to include.",
            }),
          ),
          long_distance_replacement_types: Type.Optional(
            Type.Array(Type.String(), {
              default: DEFAULT_LONG_DISTANCE_REPLACEMENT_TYPES,
              description: "Direct replacement train categories to include.",
            }),
          ),
          include_discarded: Type.Optional(
            Type.Boolean({
              default: true,
              description: "Include near-miss candidates with deterministic discard reasons.",
            }),
          ),
          include_raw: Type.Optional(
            Type.Boolean({
              default: false,
              description: "Include raw provider rows for audit/debugging.",
            }),
          ),
        },
        { additionalProperties: false },
      ),
      execute: async (
        params: DbDelayQueryToolParams,
        config: DBhopperConfig,
        context: { signal?: AbortSignal },
      ) => runDbDelayQuery(params, config, context.signal),
    }),
  ];
}

export async function runDbDelayQuery(
  params: DbDelayQueryToolParams,
  config: DelayProviderRuntimeConfig = {},
  signal?: AbortSignal,
) {
  let loadedCredentials: Awaited<ReturnType<typeof readSelectedCredentialsProfile>> =
    undefined;
  let providerChoice: DelayProviderChoice | undefined;
  let effectiveConfig: DelayProviderRuntimeConfig | undefined;
  let credentialLoadError: string | undefined;
  let delaySettings: {
    provider: DBhopperDelayProviderSetting;
    fallback: DBhopperDelayFallbackSetting;
  } = {
    provider: "bahn-web",
    fallback: "none",
  };
  try {
    const privateSettings = await readPrivateSettings(config);
    delaySettings = {
      provider: privateSettings.settings.DELAY_PROVIDER,
      fallback: privateSettings.settings.DELAY_FALLBACK,
    };
    const requestedProvider = params.provider ?? delaySettings.provider;
    try {
      loadedCredentials = await readSelectedCredentialsProfile(config);
    } catch (error) {
      credentialLoadError = errorMessage(error);
    }
    effectiveConfig = applyCredentialsToConfig(
      applyDelaySettingsToConfig(config, delaySettings.provider),
      loadedCredentials,
    ) as DelayProviderRuntimeConfig;
    const status = timetablesConfigStatus(effectiveConfig);
    providerChoice = selectDelayProvider(
      requestedProvider,
      effectiveConfig,
      status.configured,
    );

    if (providerChoice.selected === "db-timetables" && !status.configured) {
      return {
        ok: false,
        operation: "db_delay_query",
        needs_configuration: true,
        message:
          "DB Timetables credentials are required before live delay lookup can run.",
        required_configuration: [
          "selected credentials TOML [bahnAPI].clientId",
          "selected credentials TOML [bahnAPI].apiKey",
        ],
        config_status: status,
        credentials: credentialsSummary(loadedCredentials),
        credential_load_error: credentialLoadError,
        provider_selection: providerChoice,
        delay_settings: delaySettings,
        research: combinedResearchSummary(),
      };
    }

    return await runDbDelayQueryWithProvider(
      params,
      effectiveConfig,
      loadedCredentials,
      providerChoice,
      credentialLoadError,
      signal,
    );
  } catch (error) {
    if (
      effectiveConfig &&
      providerChoice &&
      shouldFallbackToProvider(delaySettings.fallback, providerChoice, error)
    ) {
      const fallbackChoice: DelayProviderChoice = {
        requested: providerChoice.requested,
        selected: delaySettings.fallback as SelectedDelayProviderName,
        reason: `${providerChoice.selected} failed; using configured ${delaySettings.fallback} fallback`,
        fallbackFrom: providerChoice.selected,
      };
      try {
        const result = await runDbDelayQueryWithProvider(
          params,
          effectiveConfig,
          loadedCredentials,
          fallbackChoice,
          credentialLoadError,
          signal,
        );
        return {
          ...result,
          provider_selection: fallbackChoice,
          official_provider_error: sanitizedProviderError(error),
        };
      } catch (fallbackError) {
        return {
          ok: false,
          operation: "db_delay_query",
          error: errorMessage(fallbackError),
          primary_provider_error: sanitizedProviderError(error),
          needs_configuration: false,
          credentials: credentialsSummary(loadedCredentials),
          credential_load_error: credentialLoadError,
          provider_selection: fallbackChoice,
          delay_settings: delaySettings,
          research: combinedResearchSummary(),
        };
      }
    }

    return {
      ok: false,
      operation: "db_delay_query",
      error: errorMessage(error),
      provider_error: sanitizedProviderError(error),
      needs_configuration: /credentials/i.test(errorMessage(error)),
      credentials: credentialsSummary(loadedCredentials),
      credential_load_error: credentialLoadError,
      provider_selection: providerChoice,
      delay_settings: delaySettings,
      research: combinedResearchSummary(),
    };
  }
}

export async function runDbDelayProviderParityProbe(
  params: DbDelayProviderParityProbeParams,
  config: DelayProviderRuntimeConfig = {},
  signal?: AbortSignal,
): Promise<DbDelayProviderParityProbeResult> {
  const baseParams = {
    ...params,
    provider: undefined,
    include_discarded: false,
    include_raw: false,
  };
  const [official, web] = await Promise.all([
    runDbDelayQuery({ ...baseParams, provider: "db-timetables" }, config, signal),
    runDbDelayQuery({ ...baseParams, provider: BAHN_WEB_SOURCE_API }, config, signal),
  ]);
  const officialRows = extractTableRows(official);
  const webRows = extractTableRows(web);
  const comparison =
    official.ok && web.ok
      ? compareCleanedRows(officialRows, webRows)
      : undefined;

  return {
    ok: official.ok === true && web.ok === true && comparison?.same_identity === true,
    operation: "db_delay_provider_parity_probe",
    api_ready: official.ok === true,
    web_ready: web.ok === true,
    official: paritySideOutput(official, params.include_table_rows === true),
    web: paritySideOutput(web, params.include_table_rows === true),
    comparison,
  };
}

async function runDbDelayQueryWithProvider(
  params: DbDelayQueryToolParams,
  effectiveConfig: DelayProviderRuntimeConfig,
  loadedCredentials: Awaited<ReturnType<typeof readSelectedCredentialsProfile>>,
  providerChoice: DelayProviderChoice,
  credentialLoadError?: string,
  signal?: AbortSignal,
) {
  const provider =
    providerChoice.selected === BAHN_WEB_SOURCE_API
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
  const { journeys } = await collectProviderJourneys(provider, departure, {
    lowerBound: window.lowerBound,
    queryTime: window.queryTime,
    upperBound: window.upperBound,
  });
  const regional = filterRegionalDelayedCandidates(journeys, query);
  const longDistance = filterLongDistanceReplacements(journeys, query);

  return {
    ok: true,
    operation: "db_delay_query",
    source_api: providerChoice.selected,
    source_api_notes: sourceApiNotes(providerChoice.selected),
    credentials: credentialsSummary(loadedCredentials),
    credential_load_error: credentialLoadError,
    provider_selection: providerChoice,
    delay_settings: {
      default_provider: effectiveConfig.delayProvider,
      fallback:
        providerChoice.fallbackFrom === undefined ? undefined : providerChoice.selected,
      web_transport: effectiveConfig.bahnWebTransport,
    },
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
      query_time_local: localDateTime(query.queryTime, query.timeZone),
      time_zone: query.timeZone,
      window_width_minutes: query.windowWidthMinutes,
      delay_threshold_minutes: query.delayThresholdMinutes,
      force_query_departure_time: query.forceQueryDepartureTime,
      regional_types: query.regionalTypes,
      long_distance_replacement_types: query.longDistanceReplacementTypes,
    },
    window: {
      lower_bound: query.lowerBound.toISOString(),
      lower_bound_local: localDateTime(query.lowerBound, query.timeZone),
      query_time: query.queryTime.toISOString(),
      query_time_local: localDateTime(query.queryTime, query.timeZone),
      upper_bound: query.upperBound.toISOString(),
      upper_bound_local: localDateTime(query.upperBound, query.timeZone),
      local_time_zone: query.timeZone,
      inclusive: true,
    },
    local_time: {
      time_zone: query.timeZone,
      query_time: localDateTime(query.queryTime, query.timeZone),
      window_lower_bound: localDateTime(query.lowerBound, query.timeZone),
      window_upper_bound: localDateTime(query.upperBound, query.timeZone),
      note:
        "UTC fields are canonical; *_local fields are the user-facing clock times in time_zone.",
    },
    delayed_regional_candidates: regional.candidates.map((candidate) =>
      candidateOutput(
        candidate,
        longDistance.replacements,
        params.include_raw === true,
        query.timeZone,
      ),
    ),
    replacement_candidates: longDistance.replacements.map((replacement) =>
      replacementOutput(replacement, params.include_raw === true, query.timeZone),
    ),
    table_rows: cleanedTableRows(regional.candidates, longDistance.replacements, query.timeZone),
    cleaned_summary: {
      delayed_regional_count: regional.candidates.length,
      replacement_count: longDistance.replacements.length,
      has_delayed_regional_candidates: regional.candidates.length > 0,
      has_reachable_replacements: longDistance.replacements.length > 0,
      candidate_roles: {
        delayed_regional:
          "regional/local delayed services that meet route, window, and delay filters",
        reachable_replacement:
          "direct ICE/IC/EC replacement candidates that meet route, window, and reachability filters",
      },
      replacements_without_delayed_regional:
        regional.candidates.length === 0 && longDistance.replacements.length > 0,
    },
    discarded_near_misses:
      params.include_discarded === false
        ? undefined
        : {
            regional: regional.discarded
              .slice(0, 50)
              .map((entry) =>
                discardedOutput(entry, params.include_raw === true, query.timeZone),
              ),
            replacements: longDistance.discarded
              .slice(0, 50)
              .map((entry) =>
                discardedOutput(entry, params.include_raw === true, query.timeZone),
              ),
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
      regional_window:
        "planned or realtime boarding event must be inside the inclusive window",
      force_query_departure_time:
        "when true, realtime boarding event must be >= query_time",
      replacements:
        "direct only, same route/window, category defaults to ICE/IC/EC, reachable if realtime boarding event >= query_time",
      output_cleaning:
        "the tool returns deterministic normalized candidates and table_rows; no LLM cleanup of raw API payloads is required",
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

function toCandidateQuery(
  params: DbDelayQueryToolParams,
  departure: StationRef,
  arrival: StationRef,
): CandidateQuery {
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

function chooseStation(stations: StationRef[], input: string) {
  const normalized = normalizeStationName(input);
  return (
    stations.find((station) => normalizeStationName(station.name) === normalized) ??
    stations[0] ??
    null
  );
}

export function selectDelayProvider(
  requested: DbDelayProviderName | undefined,
  config: DelayProviderRuntimeConfig,
  timetablesConfigured: boolean,
): DelayProviderChoice {
  const requestedProvider = requested ?? config.delayProvider ?? "auto";
  if (requestedProvider === "auto") {
    return {
      requested: requestedProvider,
      selected: timetablesConfigured ? "db-timetables" : BAHN_WEB_SOURCE_API,
      reason: timetablesConfigured
        ? "DB Timetables credentials are configured"
        : "DB Timetables credentials are missing, selecting bahn-web",
    };
  }
  return {
    requested: requestedProvider,
    selected: requestedProvider,
    reason: "provider was explicitly selected",
  };
}

export function shouldFallbackToProvider(
  fallback: DBhopperDelayFallbackSetting,
  providerChoice: DelayProviderChoice,
  error: unknown,
) {
  if (fallback === "none" || fallback === providerChoice.selected) {
    return false;
  }
  if (providerChoice.selected === "db-timetables") {
    return isTimetablesCredentialError(error);
  }
  return true;
}

function applyDelaySettingsToConfig(
  config: DelayProviderRuntimeConfig,
  provider: DBhopperDelayProviderSetting,
): DelayProviderRuntimeConfig {
  return {
    ...config,
    delayProvider: provider,
    bahnWebTransport:
      provider === BAHN_WEB_SOURCE_API
        ? config.bahnWebTransport ?? "browser"
        : config.bahnWebTransport,
  };
}

export function isTimetablesCredentialError(error: unknown) {
  const message = errorMessage(error);
  return /DB Timetables request failed with HTTP 401|HTTP 401|Unauthorized|Invalid client id or secret/i.test(
    message,
  );
}

function sanitizedProviderError(error: unknown) {
  const message = errorMessage(error);
  return {
    message,
    credentialRelated: isTimetablesCredentialError(error),
    credentialDiagnosis: diagnoseDbApiCredentialErrorMessage(message),
  };
}

function sourceApiNotes(provider: string) {
  return provider === BAHN_WEB_SOURCE_API
    ? BAHN_WEB_RESEARCH_SUMMARY.limitations
    : DB_DELAY_RESEARCH_SUMMARY.limitations;
}

function combinedResearchSummary() {
  return {
    official: DB_DELAY_RESEARCH_SUMMARY,
    bahn_web: BAHN_WEB_RESEARCH_SUMMARY,
  };
}

type DbDelayQueryResult = Awaited<ReturnType<typeof runDbDelayQuery>>;

function extractTableRows(result: DbDelayQueryResult): CleanedDelayTableRow[] {
  return "table_rows" in result && Array.isArray(result.table_rows)
    ? result.table_rows
    : [];
}

function compareCleanedRows(
  officialRows: CleanedDelayTableRow[],
  webRows: CleanedDelayTableRow[],
): CleanedProviderComparison {
  const officialKeys = officialRows.map(cleanedRowKey).sort();
  const webKeys = webRows.map(cleanedRowKey).sort();
  const officialIdentityKeys = officialRows.map(cleanedRowIdentityKey).sort();
  const webIdentityKeys = webRows.map(cleanedRowIdentityKey).sort();
  const officialSet = new Set(officialKeys);
  const webSet = new Set(webKeys);
  const officialIdentitySet = new Set(officialIdentityKeys);
  const webIdentitySet = new Set(webIdentityKeys);
  return {
    same: JSON.stringify(officialKeys) === JSON.stringify(webKeys),
    same_identity: JSON.stringify(officialIdentityKeys) === JSON.stringify(webIdentityKeys),
    official_row_count: officialRows.length,
    web_row_count: webRows.length,
    only_official: officialKeys.filter((key) => !webSet.has(key)),
    only_web: webKeys.filter((key) => !officialSet.has(key)),
    only_official_identity: officialIdentityKeys.filter(
      (key) => !webIdentitySet.has(key),
    ),
    only_web_identity: webIdentityKeys.filter(
      (key) => !officialIdentitySet.has(key),
    ),
  };
}

function cleanedRowKey(row: CleanedDelayTableRow) {
  return keyFromParts([
    ...cleanedRowIdentityParts(row),
    row.planned_boarding_time,
    row.realtime_boarding_time,
    row.delay_minutes,
    row.reachable,
    row.boarding_station,
    row.destination_station,
  ]);
}

function cleanedRowIdentityKey(row: CleanedDelayTableRow) {
  return keyFromParts([
    ...cleanedRowIdentityParts(row),
    row.boarding_station,
    row.destination_station,
  ]);
}

function keyFromParts(parts: unknown[]) {
  return parts
    .map((value) => String(value ?? ""))
    .join("|");
}

function cleanedRowIdentityParts(row: CleanedDelayTableRow) {
  const userFacingLine =
    row.role === "reachable_replacement"
      ? row.display_label ?? row.label
      : row.public_line ?? row.line_number;
  return [
    row.role,
    row.display_label ?? row.label,
    row.public_category ?? row.category,
    userFacingLine,
    row.train_number,
  ];
}

function paritySideOutput(
  result: DbDelayQueryResult,
  includeRows: boolean,
): ProviderParitySide {
  return {
    ok: result.ok === true,
    source_api: "source_api" in result ? result.source_api : undefined,
    error: "error" in result ? result.error : undefined,
    needs_configuration:
      "needs_configuration" in result ? result.needs_configuration : undefined,
    credentials: "credentials" in result ? result.credentials : undefined,
    provider_selection:
      "provider_selection" in result ? result.provider_selection : undefined,
    provider_error: "provider_error" in result ? result.provider_error : undefined,
    cleaned_summary: "cleaned_summary" in result ? result.cleaned_summary : undefined,
    table_rows: includeRows ? extractTableRows(result) : undefined,
  };
}

function cleanedTableRows(
  regionalCandidates: CandidateResult[],
  replacements: ReplacementResult[],
  timeZone: string,
): CleanedDelayTableRow[] {
  return [
    ...regionalCandidates.map((candidate) => ({
      role: "delayed_regional" as const,
      label: candidate.journey.label,
      display_label: candidate.journey.displayLabel ?? candidate.journey.label,
      category: candidate.journey.category,
      public_line: candidate.journey.publicLine,
      public_category: candidate.journey.publicCategory,
      technical_category: candidate.journey.technicalCategory,
      train_number: candidate.journey.number,
      line_number: candidate.journey.lineNumber,
      operator: candidate.journey.operator,
      delay_minutes: candidate.boardingDelayMinutes,
      reachable: null,
      planned_boarding_time: candidate.plannedBoardingTime,
      planned_boarding_time_local: localDateTime(candidate.plannedBoardingTime, timeZone),
      realtime_boarding_time: candidate.realtimeBoardingTime,
      realtime_boarding_time_local: localDateTime(candidate.realtimeBoardingTime, timeZone),
      local_time_zone: timeZone,
      boarding_station: candidate.boardingStop.station.name,
      destination_station: candidate.destinationStop.station.name,
      platform: candidate.boardingStop.realtimePlatform ?? candidate.boardingStop.platform,
      source: candidate.journey.source,
      route_confidence: candidate.journey.routeConfidence,
      route: candidate.journey.stops.map((stop) => stop.station.name),
      matched_by: candidate.matchedBy,
    })),
    ...replacements.map((replacement) => ({
      role: "reachable_replacement" as const,
      label: replacement.journey.label,
      display_label: replacement.journey.displayLabel ?? replacement.journey.label,
      category: replacement.journey.category,
      public_line: replacement.journey.publicLine,
      public_category: replacement.journey.publicCategory,
      technical_category: replacement.journey.technicalCategory,
      train_number: replacement.journey.number,
      line_number: replacement.journey.lineNumber,
      operator: replacement.journey.operator,
      delay_minutes: null,
      reachable: replacement.reachable,
      planned_boarding_time: replacement.plannedBoardingTime,
      planned_boarding_time_local: localDateTime(replacement.plannedBoardingTime, timeZone),
      realtime_boarding_time: replacement.realtimeBoardingTime,
      realtime_boarding_time_local: localDateTime(replacement.realtimeBoardingTime, timeZone),
      local_time_zone: timeZone,
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

function candidateOutput(
  candidate: CandidateResult,
  replacements: ReplacementResult[],
  includeRaw: boolean,
  timeZone: string,
) {
  return {
    journey: journeyOutput(candidate.journey, includeRaw, timeZone),
    boarding_delay_minutes: candidate.boardingDelayMinutes,
    planned_boarding_time: candidate.plannedBoardingTime,
    planned_boarding_time_local: localDateTime(candidate.plannedBoardingTime, timeZone),
    realtime_boarding_time: candidate.realtimeBoardingTime,
    realtime_boarding_time_local: localDateTime(candidate.realtimeBoardingTime, timeZone),
    local_time_zone: timeZone,
    boarding_station: stopOutput(candidate.boardingStop, includeRaw, timeZone),
    destination_station: stopOutput(candidate.destinationStop, includeRaw, timeZone),
    matched_by: candidate.matchedBy,
    replacement_candidates: replacements.map((replacement) =>
      replacementOutput(replacement, includeRaw, timeZone),
    ),
  };
}

function replacementOutput(
  replacement: ReplacementResult,
  includeRaw: boolean,
  timeZone: string,
) {
  return {
    journey: journeyOutput(replacement.journey, includeRaw, timeZone),
    reachable: replacement.reachable,
    planned_boarding_time: replacement.plannedBoardingTime,
    planned_boarding_time_local: localDateTime(replacement.plannedBoardingTime, timeZone),
    realtime_boarding_time: replacement.realtimeBoardingTime,
    realtime_boarding_time_local: localDateTime(replacement.realtimeBoardingTime, timeZone),
    local_time_zone: timeZone,
    boarding_station: stopOutput(replacement.boardingStop, includeRaw, timeZone),
    destination_station: stopOutput(replacement.destinationStop, includeRaw, timeZone),
    matched_by: replacement.matchedBy,
  };
}

function discardedOutput(
  discarded: DiscardedJourney,
  includeRaw: boolean,
  timeZone: string,
) {
  return {
    journey: journeyOutput(discarded.journey, includeRaw, timeZone, true),
    reasons: discarded.reasons,
  };
}

function journeyOutput(
  journey: Journey,
  includeRaw: boolean,
  timeZone: string,
  compact = false,
) {
  return {
    id: journey.id,
    label: journey.label,
    display_label: journey.displayLabel ?? journey.label,
    category: journey.category,
    public_line: journey.publicLine,
    public_category: journey.publicCategory,
    technical_category: journey.technicalCategory,
    number: journey.number,
    line_number: journey.lineNumber,
    operator: journey.operator,
    cancelled: journey.cancelled === true,
    source: journey.source,
    route_confidence: journey.routeConfidence,
    stops: compact
      ? journey.stops.map((stop) => stop.station.name)
      : journey.stops.map((stop) => stopOutput(stop, includeRaw, timeZone)),
    ...(includeRaw ? { raw: journey.raw } : {}),
  };
}

function stopOutput(
  stop: JourneyStop | StationEvent,
  includeRaw: boolean,
  timeZone: string,
) {
  return {
    station: stationRefOutput(stop.station),
    planned_arrival: stop.plannedArrival,
    planned_arrival_local: localDateTime(stop.plannedArrival, timeZone),
    planned_departure: stop.plannedDeparture,
    planned_departure_local: localDateTime(stop.plannedDeparture, timeZone),
    realtime_arrival: stop.realtimeArrival,
    realtime_arrival_local: localDateTime(stop.realtimeArrival, timeZone),
    realtime_departure: stop.realtimeDeparture,
    realtime_departure_local: localDateTime(stop.realtimeDeparture, timeZone),
    local_time_zone: timeZone,
    platform: stop.platform,
    realtime_platform: stop.realtimePlatform,
    display_label: stop.displayLabel ?? stop.label,
    public_line: stop.publicLine,
    public_category: stop.publicCategory,
    technical_category: stop.technicalCategory,
    train_number: stop.trainNumber,
    line_number: stop.lineNumber,
    operator: stop.operator,
    cancelled: stop.cancelled === true,
    ...(includeRaw ? { raw: stop.raw } : {}),
  };
}

function localDateTime(value: string | Date | undefined, timeZone: string) {
  if (!value) {
    return undefined;
  }
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return undefined;
  }
  return formatLocalIsoWithOffset(date, timeZone);
}

function formatLocalIsoWithOffset(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-GB", {
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
      throw new Error(`missing ${type} in local time conversion`);
    }
    return part;
  };
  const asUtc = Date.UTC(
    Number(value("year")),
    Number(value("month")) - 1,
    Number(value("day")),
    Number(value("hour")),
    Number(value("minute")),
    Number(value("second")),
  );
  const offsetMinutes = Math.round((asUtc - date.getTime()) / 60000);
  const sign = offsetMinutes >= 0 ? "+" : "-";
  const abs = Math.abs(offsetMinutes);
  const offsetHours = String(Math.floor(abs / 60)).padStart(2, "0");
  const offsetRemainder = String(abs % 60).padStart(2, "0");
  return [
    `${value("year")}-${value("month")}-${value("day")}`,
    `${value("hour")}:${value("minute")}:${value("second")}${sign}${offsetHours}:${offsetRemainder}`,
  ].join("T");
}

function stationRefOutput(station: StationRef) {
  return {
    name: station.name,
    eva_no: station.evaNo,
    id: station.id,
    aliases: station.aliases,
    source: station.source,
  };
}

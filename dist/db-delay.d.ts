export declare const DEFAULT_TIME_ZONE = "Europe/Berlin";
export declare const DEFAULT_WINDOW_WIDTH_MINUTES = 45;
export declare const DEFAULT_DELAY_THRESHOLD_MINUTES = 20;
export declare const DEFAULT_REGIONAL_TYPES: string[];
export declare const DEFAULT_LONG_DISTANCE_REPLACEMENT_TYPES: string[];
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
    displayLabel?: string;
    publicLine?: string;
    publicCategory?: string;
    technicalCategory?: string;
    operator?: string;
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
    displayLabel?: string;
    publicLine?: string;
    publicCategory?: string;
    technicalCategory?: string;
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
export interface ProviderJourneyCollection {
    events: StationEvent[];
    journeys: Journey[];
}
export declare function normalizeCandidateQuery(query: CandidateQuery): NormalizedCandidateQuery;
export declare function isWithinInclusiveWindow(event: StationEvent, query: CandidateQuery | NormalizedCandidateQuery): boolean;
export declare function isReachableAtQueryTime(event: StationEvent, query: CandidateQuery | NormalizedCandidateQuery): boolean;
export declare function trainServesRouteInOrder(journey: Journey, departure: string | StationRef, arrival: string | StationRef): boolean;
export declare function delayAtBoardingStation(journey: Journey, departure: string | StationRef): number | null;
export declare function findRegionalDelayedCandidates(query: CandidateQuery, provider: ApiProvider): Promise<CandidateResult[]>;
export declare function findLongDistanceReplacements(query: CandidateQuery, _delayedCandidate: CandidateResult | null, provider: ApiProvider): Promise<ReplacementResult[]>;
export declare function collectProviderJourneys(provider: ApiProvider, station: StationRef, timeWindow: TimeWindow): Promise<ProviderJourneyCollection>;
export declare function dedupeJourneys(journeys: Journey[]): Journey[];
export declare function filterRegionalDelayedCandidates(journeys: Journey[], query: CandidateQuery | NormalizedCandidateQuery): {
    candidates: CandidateResult[];
    discarded: DiscardedJourney[];
};
export declare function filterLongDistanceReplacements(journeys: Journey[], query: CandidateQuery | NormalizedCandidateQuery): {
    replacements: ReplacementResult[];
    discarded: DiscardedJourney[];
};
export declare function buildQueryWindow(query: CandidateQuery | NormalizedCandidateQuery): {
    lowerBound: Date;
    queryTime: Date;
    upperBound: Date;
    inclusive: boolean;
};
export declare function findStopIndex(journey: Journey, station: string | StationRef, startIndex?: number): number;
export declare function getBoardingStop(journey: Journey, departure: string | StationRef): JourneyStop | null;
export declare function getDestinationStop(journey: Journey, arrival: string | StationRef, startIndex?: number): JourneyStop | null;
export declare function getPlannedEventDate(event: StationEvent): Date | null;
export declare function getRealtimeEventDate(event: StationEvent): Date | null;
export declare function getPlannedEventIso(event: StationEvent): string | undefined;
export declare function getRealtimeEventIso(event: StationEvent): string | undefined;
export declare function normalizeStationName(name: string): string;
export declare function stationMatches(candidate: StationRef, expected: StationRef): boolean;
export declare function categoryMatches(journey: Journey, allowedTypes: string[]): boolean;
export declare function getCategoryTokens(journey: Journey): Set<string>;
export declare function derivePublicCategory(publicLine?: string, fallbackCategory?: string): string | undefined;
export declare function parseQueryDateTime(value: string | Date, options?: {
    serviceDate?: string;
    timeZone?: string;
}): Date;
export declare function localDateTimeToUtc(parts: {
    year: number;
    month: number;
    day: number;
    hour: number;
    minute: number;
    second?: number;
}, timeZone?: string): Date;
export declare function addMinutes(date: Date, minutes: number): Date;

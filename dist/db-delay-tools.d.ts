import type { DBhopperConfig } from "./types.js";
import { type Journey, type StationRef } from "./db-delay.js";
import { type DBhopperDelayFallbackSetting, type DBhopperDelayProviderSetting } from "./private-settings.js";
export type DbDelayProviderName = "auto" | "db-timetables" | "bahn-web";
export type SelectedDelayProviderName = "db-timetables" | "bahn-web";
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
export declare const DB_DELAY_TOOL_NAMES: readonly ["dbhopper_db_delay_research", "dbhopper_query_db_delay"];
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
    realtime_boarding_time?: string;
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
export declare function createDbDelayToolDefinitions(tool: any): any[];
export declare function runDbDelayQuery(params: DbDelayQueryToolParams, config?: DelayProviderRuntimeConfig, signal?: AbortSignal): Promise<{
    ok: boolean;
    operation: string;
    message: string;
    station_matches: {
        departure: StationRef[];
        arrival: StationRef[];
    };
    source_api?: undefined;
    source_api_notes?: undefined;
    credentials?: undefined;
    credential_load_error?: undefined;
    provider_selection?: undefined;
    delay_settings?: undefined;
    input?: undefined;
    normalized_input?: undefined;
    window?: undefined;
    delayed_regional_candidates?: undefined;
    replacement_candidates?: undefined;
    table_rows?: undefined;
    cleaned_summary?: undefined;
    discarded_near_misses?: undefined;
    research?: undefined;
} | {
    ok: boolean;
    operation: string;
    source_api: SelectedDelayProviderName;
    source_api_notes: string[];
    credentials: {
        configured: boolean;
        credentialsName: undefined;
        hasBahnAPICredentials: boolean;
        hasBahnAccountCredentials: boolean;
        hasBahnAccountAPICredentials: boolean;
        hasBrowserUserDataDir: boolean;
        credentialsId?: undefined;
    } | {
        configured: boolean;
        credentialsName: string;
        credentialsId: string | undefined;
        hasBahnAPICredentials: boolean;
        hasBahnAccountCredentials: boolean;
        hasBahnAccountAPICredentials: boolean;
        hasBrowserUserDataDir: boolean;
    };
    credential_load_error: string | undefined;
    provider_selection: DelayProviderChoice;
    delay_settings: {
        default_provider: "auto" | "db-timetables" | "bahn-web" | undefined;
        fallback: SelectedDelayProviderName | undefined;
        web_transport: "auto" | "fetch" | "curl" | "browser" | undefined;
    };
    input: {
        provider: DbDelayProviderName | undefined;
        departure_station: string;
        arrival_station: string;
        query_time: string;
        service_date: string | undefined;
    };
    normalized_input: {
        departure_station: {
            name: string;
            eva_no: string | undefined;
            id: string | undefined;
            aliases: string[] | undefined;
            source: string | undefined;
        };
        arrival_station: {
            name: string;
            eva_no: string | undefined;
            id: string | undefined;
            aliases: string[] | undefined;
            source: string | undefined;
        };
        query_time: string;
        time_zone: string;
        window_width_minutes: number;
        delay_threshold_minutes: number;
        force_query_departure_time: boolean;
        regional_types: string[];
        long_distance_replacement_types: string[];
    };
    window: {
        lower_bound: string;
        query_time: string;
        upper_bound: string;
        inclusive: boolean;
    };
    delayed_regional_candidates: {
        journey: {
            raw?: unknown;
            id: string;
            label: string | undefined;
            display_label: string | undefined;
            category: string;
            public_line: string | undefined;
            public_category: string | undefined;
            technical_category: string | undefined;
            number: string | undefined;
            line_number: string | undefined;
            operator: string | undefined;
            cancelled: boolean;
            source: string | undefined;
            route_confidence: "unknown" | "full_stop_list" | "station_board_path" | undefined;
            stops: string[] | {
                raw?: unknown;
                station: {
                    name: string;
                    eva_no: string | undefined;
                    id: string | undefined;
                    aliases: string[] | undefined;
                    source: string | undefined;
                };
                planned_arrival: string | undefined;
                planned_departure: string | undefined;
                realtime_arrival: string | undefined;
                realtime_departure: string | undefined;
                platform: string | undefined;
                realtime_platform: string | undefined;
                display_label: string | undefined;
                public_line: string | undefined;
                public_category: string | undefined;
                technical_category: string | undefined;
                train_number: string | undefined;
                line_number: string | undefined;
                operator: string | undefined;
                cancelled: boolean;
            }[];
        };
        boarding_delay_minutes: number | null;
        planned_boarding_time: string | undefined;
        realtime_boarding_time: string | undefined;
        boarding_station: {
            raw?: unknown;
            station: {
                name: string;
                eva_no: string | undefined;
                id: string | undefined;
                aliases: string[] | undefined;
                source: string | undefined;
            };
            planned_arrival: string | undefined;
            planned_departure: string | undefined;
            realtime_arrival: string | undefined;
            realtime_departure: string | undefined;
            platform: string | undefined;
            realtime_platform: string | undefined;
            display_label: string | undefined;
            public_line: string | undefined;
            public_category: string | undefined;
            technical_category: string | undefined;
            train_number: string | undefined;
            line_number: string | undefined;
            operator: string | undefined;
            cancelled: boolean;
        };
        destination_station: {
            raw?: unknown;
            station: {
                name: string;
                eva_no: string | undefined;
                id: string | undefined;
                aliases: string[] | undefined;
                source: string | undefined;
            };
            planned_arrival: string | undefined;
            planned_departure: string | undefined;
            realtime_arrival: string | undefined;
            realtime_departure: string | undefined;
            platform: string | undefined;
            realtime_platform: string | undefined;
            display_label: string | undefined;
            public_line: string | undefined;
            public_category: string | undefined;
            technical_category: string | undefined;
            train_number: string | undefined;
            line_number: string | undefined;
            operator: string | undefined;
            cancelled: boolean;
        };
        matched_by: string[];
        replacement_candidates: {
            journey: {
                raw?: unknown;
                id: string;
                label: string | undefined;
                display_label: string | undefined;
                category: string;
                public_line: string | undefined;
                public_category: string | undefined;
                technical_category: string | undefined;
                number: string | undefined;
                line_number: string | undefined;
                operator: string | undefined;
                cancelled: boolean;
                source: string | undefined;
                route_confidence: "unknown" | "full_stop_list" | "station_board_path" | undefined;
                stops: string[] | {
                    raw?: unknown;
                    station: {
                        name: string;
                        eva_no: string | undefined;
                        id: string | undefined;
                        aliases: string[] | undefined;
                        source: string | undefined;
                    };
                    planned_arrival: string | undefined;
                    planned_departure: string | undefined;
                    realtime_arrival: string | undefined;
                    realtime_departure: string | undefined;
                    platform: string | undefined;
                    realtime_platform: string | undefined;
                    display_label: string | undefined;
                    public_line: string | undefined;
                    public_category: string | undefined;
                    technical_category: string | undefined;
                    train_number: string | undefined;
                    line_number: string | undefined;
                    operator: string | undefined;
                    cancelled: boolean;
                }[];
            };
            reachable: boolean;
            planned_boarding_time: string | undefined;
            realtime_boarding_time: string | undefined;
            boarding_station: {
                raw?: unknown;
                station: {
                    name: string;
                    eva_no: string | undefined;
                    id: string | undefined;
                    aliases: string[] | undefined;
                    source: string | undefined;
                };
                planned_arrival: string | undefined;
                planned_departure: string | undefined;
                realtime_arrival: string | undefined;
                realtime_departure: string | undefined;
                platform: string | undefined;
                realtime_platform: string | undefined;
                display_label: string | undefined;
                public_line: string | undefined;
                public_category: string | undefined;
                technical_category: string | undefined;
                train_number: string | undefined;
                line_number: string | undefined;
                operator: string | undefined;
                cancelled: boolean;
            };
            destination_station: {
                raw?: unknown;
                station: {
                    name: string;
                    eva_no: string | undefined;
                    id: string | undefined;
                    aliases: string[] | undefined;
                    source: string | undefined;
                };
                planned_arrival: string | undefined;
                planned_departure: string | undefined;
                realtime_arrival: string | undefined;
                realtime_departure: string | undefined;
                platform: string | undefined;
                realtime_platform: string | undefined;
                display_label: string | undefined;
                public_line: string | undefined;
                public_category: string | undefined;
                technical_category: string | undefined;
                train_number: string | undefined;
                line_number: string | undefined;
                operator: string | undefined;
                cancelled: boolean;
            };
            matched_by: string[];
        }[];
    }[];
    replacement_candidates: {
        journey: {
            raw?: unknown;
            id: string;
            label: string | undefined;
            display_label: string | undefined;
            category: string;
            public_line: string | undefined;
            public_category: string | undefined;
            technical_category: string | undefined;
            number: string | undefined;
            line_number: string | undefined;
            operator: string | undefined;
            cancelled: boolean;
            source: string | undefined;
            route_confidence: "unknown" | "full_stop_list" | "station_board_path" | undefined;
            stops: string[] | {
                raw?: unknown;
                station: {
                    name: string;
                    eva_no: string | undefined;
                    id: string | undefined;
                    aliases: string[] | undefined;
                    source: string | undefined;
                };
                planned_arrival: string | undefined;
                planned_departure: string | undefined;
                realtime_arrival: string | undefined;
                realtime_departure: string | undefined;
                platform: string | undefined;
                realtime_platform: string | undefined;
                display_label: string | undefined;
                public_line: string | undefined;
                public_category: string | undefined;
                technical_category: string | undefined;
                train_number: string | undefined;
                line_number: string | undefined;
                operator: string | undefined;
                cancelled: boolean;
            }[];
        };
        reachable: boolean;
        planned_boarding_time: string | undefined;
        realtime_boarding_time: string | undefined;
        boarding_station: {
            raw?: unknown;
            station: {
                name: string;
                eva_no: string | undefined;
                id: string | undefined;
                aliases: string[] | undefined;
                source: string | undefined;
            };
            planned_arrival: string | undefined;
            planned_departure: string | undefined;
            realtime_arrival: string | undefined;
            realtime_departure: string | undefined;
            platform: string | undefined;
            realtime_platform: string | undefined;
            display_label: string | undefined;
            public_line: string | undefined;
            public_category: string | undefined;
            technical_category: string | undefined;
            train_number: string | undefined;
            line_number: string | undefined;
            operator: string | undefined;
            cancelled: boolean;
        };
        destination_station: {
            raw?: unknown;
            station: {
                name: string;
                eva_no: string | undefined;
                id: string | undefined;
                aliases: string[] | undefined;
                source: string | undefined;
            };
            planned_arrival: string | undefined;
            planned_departure: string | undefined;
            realtime_arrival: string | undefined;
            realtime_departure: string | undefined;
            platform: string | undefined;
            realtime_platform: string | undefined;
            display_label: string | undefined;
            public_line: string | undefined;
            public_category: string | undefined;
            technical_category: string | undefined;
            train_number: string | undefined;
            line_number: string | undefined;
            operator: string | undefined;
            cancelled: boolean;
        };
        matched_by: string[];
    }[];
    table_rows: CleanedDelayTableRow[];
    cleaned_summary: {
        delayed_regional_count: number;
        replacement_count: number;
        has_delayed_regional_candidates: boolean;
        has_reachable_replacements: boolean;
    };
    discarded_near_misses: {
        regional: {
            journey: {
                raw?: unknown;
                id: string;
                label: string | undefined;
                display_label: string | undefined;
                category: string;
                public_line: string | undefined;
                public_category: string | undefined;
                technical_category: string | undefined;
                number: string | undefined;
                line_number: string | undefined;
                operator: string | undefined;
                cancelled: boolean;
                source: string | undefined;
                route_confidence: "unknown" | "full_stop_list" | "station_board_path" | undefined;
                stops: string[] | {
                    raw?: unknown;
                    station: {
                        name: string;
                        eva_no: string | undefined;
                        id: string | undefined;
                        aliases: string[] | undefined;
                        source: string | undefined;
                    };
                    planned_arrival: string | undefined;
                    planned_departure: string | undefined;
                    realtime_arrival: string | undefined;
                    realtime_departure: string | undefined;
                    platform: string | undefined;
                    realtime_platform: string | undefined;
                    display_label: string | undefined;
                    public_line: string | undefined;
                    public_category: string | undefined;
                    technical_category: string | undefined;
                    train_number: string | undefined;
                    line_number: string | undefined;
                    operator: string | undefined;
                    cancelled: boolean;
                }[];
            };
            reasons: string[];
        }[];
        replacements: {
            journey: {
                raw?: unknown;
                id: string;
                label: string | undefined;
                display_label: string | undefined;
                category: string;
                public_line: string | undefined;
                public_category: string | undefined;
                technical_category: string | undefined;
                number: string | undefined;
                line_number: string | undefined;
                operator: string | undefined;
                cancelled: boolean;
                source: string | undefined;
                route_confidence: "unknown" | "full_stop_list" | "station_board_path" | undefined;
                stops: string[] | {
                    raw?: unknown;
                    station: {
                        name: string;
                        eva_no: string | undefined;
                        id: string | undefined;
                        aliases: string[] | undefined;
                        source: string | undefined;
                    };
                    planned_arrival: string | undefined;
                    planned_departure: string | undefined;
                    realtime_arrival: string | undefined;
                    realtime_departure: string | undefined;
                    platform: string | undefined;
                    realtime_platform: string | undefined;
                    display_label: string | undefined;
                    public_line: string | undefined;
                    public_category: string | undefined;
                    technical_category: string | undefined;
                    train_number: string | undefined;
                    line_number: string | undefined;
                    operator: string | undefined;
                    cancelled: boolean;
                }[];
            };
            reasons: string[];
        }[];
    } | undefined;
    station_matches: {
        departure: {
            name: string;
            eva_no: string | undefined;
            id: string | undefined;
            aliases: string[] | undefined;
            source: string | undefined;
        }[];
        arrival: {
            name: string;
            eva_no: string | undefined;
            id: string | undefined;
            aliases: string[] | undefined;
            source: string | undefined;
        }[];
    };
    research: {
        official: {
            recommendedStack: string[];
            officialDocs: string[];
            timetableEndpoints: string[];
            limitations: string[];
        };
        bahn_web: {
            source: string;
            endpoints: string[];
            defaultBaseUrl: string;
            fallbackBaseUrl: string;
            limitations: string[];
        };
    };
    message?: undefined;
} | {
    ok: boolean;
    operation: string;
    needs_configuration: boolean;
    message: string;
    required_configuration: string[];
    config_status: {
        configured: boolean;
        hasClientId: boolean;
        hasApiKey: boolean;
        baseUrl: string;
    };
    credentials: {
        configured: boolean;
        credentialsName: undefined;
        hasBahnAPICredentials: boolean;
        hasBahnAccountCredentials: boolean;
        hasBahnAccountAPICredentials: boolean;
        hasBrowserUserDataDir: boolean;
        credentialsId?: undefined;
    } | {
        configured: boolean;
        credentialsName: string;
        credentialsId: string | undefined;
        hasBahnAPICredentials: boolean;
        hasBahnAccountCredentials: boolean;
        hasBahnAccountAPICredentials: boolean;
        hasBrowserUserDataDir: boolean;
    };
    credential_load_error: string | undefined;
    provider_selection: DelayProviderChoice;
    delay_settings: {
        provider: DBhopperDelayProviderSetting;
        fallback: DBhopperDelayFallbackSetting;
    };
    research: {
        official: {
            recommendedStack: string[];
            officialDocs: string[];
            timetableEndpoints: string[];
            limitations: string[];
        };
        bahn_web: {
            source: string;
            endpoints: string[];
            defaultBaseUrl: string;
            fallbackBaseUrl: string;
            limitations: string[];
        };
    };
    error?: undefined;
    primary_provider_error?: undefined;
    provider_error?: undefined;
} | {
    provider_selection: DelayProviderChoice;
    official_provider_error: {
        message: string;
        credentialRelated: boolean;
        credentialDiagnosis: {
            status: string;
            reason: string;
            next_steps: string[];
        };
    };
    ok: boolean;
    operation: string;
    message: string;
    station_matches: {
        departure: StationRef[];
        arrival: StationRef[];
    };
    source_api?: undefined;
    source_api_notes?: undefined;
    credentials?: undefined;
    credential_load_error?: undefined;
    delay_settings?: undefined;
    input?: undefined;
    normalized_input?: undefined;
    window?: undefined;
    delayed_regional_candidates?: undefined;
    replacement_candidates?: undefined;
    table_rows?: undefined;
    cleaned_summary?: undefined;
    discarded_near_misses?: undefined;
    research?: undefined;
    needs_configuration?: undefined;
    required_configuration?: undefined;
    config_status?: undefined;
    error?: undefined;
    primary_provider_error?: undefined;
    provider_error?: undefined;
} | {
    provider_selection: DelayProviderChoice;
    official_provider_error: {
        message: string;
        credentialRelated: boolean;
        credentialDiagnosis: {
            status: string;
            reason: string;
            next_steps: string[];
        };
    };
    ok: boolean;
    operation: string;
    source_api: SelectedDelayProviderName;
    source_api_notes: string[];
    credentials: {
        configured: boolean;
        credentialsName: undefined;
        hasBahnAPICredentials: boolean;
        hasBahnAccountCredentials: boolean;
        hasBahnAccountAPICredentials: boolean;
        hasBrowserUserDataDir: boolean;
        credentialsId?: undefined;
    } | {
        configured: boolean;
        credentialsName: string;
        credentialsId: string | undefined;
        hasBahnAPICredentials: boolean;
        hasBahnAccountCredentials: boolean;
        hasBahnAccountAPICredentials: boolean;
        hasBrowserUserDataDir: boolean;
    };
    credential_load_error: string | undefined;
    delay_settings: {
        default_provider: "auto" | "db-timetables" | "bahn-web" | undefined;
        fallback: SelectedDelayProviderName | undefined;
        web_transport: "auto" | "fetch" | "curl" | "browser" | undefined;
    };
    input: {
        provider: DbDelayProviderName | undefined;
        departure_station: string;
        arrival_station: string;
        query_time: string;
        service_date: string | undefined;
    };
    normalized_input: {
        departure_station: {
            name: string;
            eva_no: string | undefined;
            id: string | undefined;
            aliases: string[] | undefined;
            source: string | undefined;
        };
        arrival_station: {
            name: string;
            eva_no: string | undefined;
            id: string | undefined;
            aliases: string[] | undefined;
            source: string | undefined;
        };
        query_time: string;
        time_zone: string;
        window_width_minutes: number;
        delay_threshold_minutes: number;
        force_query_departure_time: boolean;
        regional_types: string[];
        long_distance_replacement_types: string[];
    };
    window: {
        lower_bound: string;
        query_time: string;
        upper_bound: string;
        inclusive: boolean;
    };
    delayed_regional_candidates: {
        journey: {
            raw?: unknown;
            id: string;
            label: string | undefined;
            display_label: string | undefined;
            category: string;
            public_line: string | undefined;
            public_category: string | undefined;
            technical_category: string | undefined;
            number: string | undefined;
            line_number: string | undefined;
            operator: string | undefined;
            cancelled: boolean;
            source: string | undefined;
            route_confidence: "unknown" | "full_stop_list" | "station_board_path" | undefined;
            stops: string[] | {
                raw?: unknown;
                station: {
                    name: string;
                    eva_no: string | undefined;
                    id: string | undefined;
                    aliases: string[] | undefined;
                    source: string | undefined;
                };
                planned_arrival: string | undefined;
                planned_departure: string | undefined;
                realtime_arrival: string | undefined;
                realtime_departure: string | undefined;
                platform: string | undefined;
                realtime_platform: string | undefined;
                display_label: string | undefined;
                public_line: string | undefined;
                public_category: string | undefined;
                technical_category: string | undefined;
                train_number: string | undefined;
                line_number: string | undefined;
                operator: string | undefined;
                cancelled: boolean;
            }[];
        };
        boarding_delay_minutes: number | null;
        planned_boarding_time: string | undefined;
        realtime_boarding_time: string | undefined;
        boarding_station: {
            raw?: unknown;
            station: {
                name: string;
                eva_no: string | undefined;
                id: string | undefined;
                aliases: string[] | undefined;
                source: string | undefined;
            };
            planned_arrival: string | undefined;
            planned_departure: string | undefined;
            realtime_arrival: string | undefined;
            realtime_departure: string | undefined;
            platform: string | undefined;
            realtime_platform: string | undefined;
            display_label: string | undefined;
            public_line: string | undefined;
            public_category: string | undefined;
            technical_category: string | undefined;
            train_number: string | undefined;
            line_number: string | undefined;
            operator: string | undefined;
            cancelled: boolean;
        };
        destination_station: {
            raw?: unknown;
            station: {
                name: string;
                eva_no: string | undefined;
                id: string | undefined;
                aliases: string[] | undefined;
                source: string | undefined;
            };
            planned_arrival: string | undefined;
            planned_departure: string | undefined;
            realtime_arrival: string | undefined;
            realtime_departure: string | undefined;
            platform: string | undefined;
            realtime_platform: string | undefined;
            display_label: string | undefined;
            public_line: string | undefined;
            public_category: string | undefined;
            technical_category: string | undefined;
            train_number: string | undefined;
            line_number: string | undefined;
            operator: string | undefined;
            cancelled: boolean;
        };
        matched_by: string[];
        replacement_candidates: {
            journey: {
                raw?: unknown;
                id: string;
                label: string | undefined;
                display_label: string | undefined;
                category: string;
                public_line: string | undefined;
                public_category: string | undefined;
                technical_category: string | undefined;
                number: string | undefined;
                line_number: string | undefined;
                operator: string | undefined;
                cancelled: boolean;
                source: string | undefined;
                route_confidence: "unknown" | "full_stop_list" | "station_board_path" | undefined;
                stops: string[] | {
                    raw?: unknown;
                    station: {
                        name: string;
                        eva_no: string | undefined;
                        id: string | undefined;
                        aliases: string[] | undefined;
                        source: string | undefined;
                    };
                    planned_arrival: string | undefined;
                    planned_departure: string | undefined;
                    realtime_arrival: string | undefined;
                    realtime_departure: string | undefined;
                    platform: string | undefined;
                    realtime_platform: string | undefined;
                    display_label: string | undefined;
                    public_line: string | undefined;
                    public_category: string | undefined;
                    technical_category: string | undefined;
                    train_number: string | undefined;
                    line_number: string | undefined;
                    operator: string | undefined;
                    cancelled: boolean;
                }[];
            };
            reachable: boolean;
            planned_boarding_time: string | undefined;
            realtime_boarding_time: string | undefined;
            boarding_station: {
                raw?: unknown;
                station: {
                    name: string;
                    eva_no: string | undefined;
                    id: string | undefined;
                    aliases: string[] | undefined;
                    source: string | undefined;
                };
                planned_arrival: string | undefined;
                planned_departure: string | undefined;
                realtime_arrival: string | undefined;
                realtime_departure: string | undefined;
                platform: string | undefined;
                realtime_platform: string | undefined;
                display_label: string | undefined;
                public_line: string | undefined;
                public_category: string | undefined;
                technical_category: string | undefined;
                train_number: string | undefined;
                line_number: string | undefined;
                operator: string | undefined;
                cancelled: boolean;
            };
            destination_station: {
                raw?: unknown;
                station: {
                    name: string;
                    eva_no: string | undefined;
                    id: string | undefined;
                    aliases: string[] | undefined;
                    source: string | undefined;
                };
                planned_arrival: string | undefined;
                planned_departure: string | undefined;
                realtime_arrival: string | undefined;
                realtime_departure: string | undefined;
                platform: string | undefined;
                realtime_platform: string | undefined;
                display_label: string | undefined;
                public_line: string | undefined;
                public_category: string | undefined;
                technical_category: string | undefined;
                train_number: string | undefined;
                line_number: string | undefined;
                operator: string | undefined;
                cancelled: boolean;
            };
            matched_by: string[];
        }[];
    }[];
    replacement_candidates: {
        journey: {
            raw?: unknown;
            id: string;
            label: string | undefined;
            display_label: string | undefined;
            category: string;
            public_line: string | undefined;
            public_category: string | undefined;
            technical_category: string | undefined;
            number: string | undefined;
            line_number: string | undefined;
            operator: string | undefined;
            cancelled: boolean;
            source: string | undefined;
            route_confidence: "unknown" | "full_stop_list" | "station_board_path" | undefined;
            stops: string[] | {
                raw?: unknown;
                station: {
                    name: string;
                    eva_no: string | undefined;
                    id: string | undefined;
                    aliases: string[] | undefined;
                    source: string | undefined;
                };
                planned_arrival: string | undefined;
                planned_departure: string | undefined;
                realtime_arrival: string | undefined;
                realtime_departure: string | undefined;
                platform: string | undefined;
                realtime_platform: string | undefined;
                display_label: string | undefined;
                public_line: string | undefined;
                public_category: string | undefined;
                technical_category: string | undefined;
                train_number: string | undefined;
                line_number: string | undefined;
                operator: string | undefined;
                cancelled: boolean;
            }[];
        };
        reachable: boolean;
        planned_boarding_time: string | undefined;
        realtime_boarding_time: string | undefined;
        boarding_station: {
            raw?: unknown;
            station: {
                name: string;
                eva_no: string | undefined;
                id: string | undefined;
                aliases: string[] | undefined;
                source: string | undefined;
            };
            planned_arrival: string | undefined;
            planned_departure: string | undefined;
            realtime_arrival: string | undefined;
            realtime_departure: string | undefined;
            platform: string | undefined;
            realtime_platform: string | undefined;
            display_label: string | undefined;
            public_line: string | undefined;
            public_category: string | undefined;
            technical_category: string | undefined;
            train_number: string | undefined;
            line_number: string | undefined;
            operator: string | undefined;
            cancelled: boolean;
        };
        destination_station: {
            raw?: unknown;
            station: {
                name: string;
                eva_no: string | undefined;
                id: string | undefined;
                aliases: string[] | undefined;
                source: string | undefined;
            };
            planned_arrival: string | undefined;
            planned_departure: string | undefined;
            realtime_arrival: string | undefined;
            realtime_departure: string | undefined;
            platform: string | undefined;
            realtime_platform: string | undefined;
            display_label: string | undefined;
            public_line: string | undefined;
            public_category: string | undefined;
            technical_category: string | undefined;
            train_number: string | undefined;
            line_number: string | undefined;
            operator: string | undefined;
            cancelled: boolean;
        };
        matched_by: string[];
    }[];
    table_rows: CleanedDelayTableRow[];
    cleaned_summary: {
        delayed_regional_count: number;
        replacement_count: number;
        has_delayed_regional_candidates: boolean;
        has_reachable_replacements: boolean;
    };
    discarded_near_misses: {
        regional: {
            journey: {
                raw?: unknown;
                id: string;
                label: string | undefined;
                display_label: string | undefined;
                category: string;
                public_line: string | undefined;
                public_category: string | undefined;
                technical_category: string | undefined;
                number: string | undefined;
                line_number: string | undefined;
                operator: string | undefined;
                cancelled: boolean;
                source: string | undefined;
                route_confidence: "unknown" | "full_stop_list" | "station_board_path" | undefined;
                stops: string[] | {
                    raw?: unknown;
                    station: {
                        name: string;
                        eva_no: string | undefined;
                        id: string | undefined;
                        aliases: string[] | undefined;
                        source: string | undefined;
                    };
                    planned_arrival: string | undefined;
                    planned_departure: string | undefined;
                    realtime_arrival: string | undefined;
                    realtime_departure: string | undefined;
                    platform: string | undefined;
                    realtime_platform: string | undefined;
                    display_label: string | undefined;
                    public_line: string | undefined;
                    public_category: string | undefined;
                    technical_category: string | undefined;
                    train_number: string | undefined;
                    line_number: string | undefined;
                    operator: string | undefined;
                    cancelled: boolean;
                }[];
            };
            reasons: string[];
        }[];
        replacements: {
            journey: {
                raw?: unknown;
                id: string;
                label: string | undefined;
                display_label: string | undefined;
                category: string;
                public_line: string | undefined;
                public_category: string | undefined;
                technical_category: string | undefined;
                number: string | undefined;
                line_number: string | undefined;
                operator: string | undefined;
                cancelled: boolean;
                source: string | undefined;
                route_confidence: "unknown" | "full_stop_list" | "station_board_path" | undefined;
                stops: string[] | {
                    raw?: unknown;
                    station: {
                        name: string;
                        eva_no: string | undefined;
                        id: string | undefined;
                        aliases: string[] | undefined;
                        source: string | undefined;
                    };
                    planned_arrival: string | undefined;
                    planned_departure: string | undefined;
                    realtime_arrival: string | undefined;
                    realtime_departure: string | undefined;
                    platform: string | undefined;
                    realtime_platform: string | undefined;
                    display_label: string | undefined;
                    public_line: string | undefined;
                    public_category: string | undefined;
                    technical_category: string | undefined;
                    train_number: string | undefined;
                    line_number: string | undefined;
                    operator: string | undefined;
                    cancelled: boolean;
                }[];
            };
            reasons: string[];
        }[];
    } | undefined;
    station_matches: {
        departure: {
            name: string;
            eva_no: string | undefined;
            id: string | undefined;
            aliases: string[] | undefined;
            source: string | undefined;
        }[];
        arrival: {
            name: string;
            eva_no: string | undefined;
            id: string | undefined;
            aliases: string[] | undefined;
            source: string | undefined;
        }[];
    };
    research: {
        official: {
            recommendedStack: string[];
            officialDocs: string[];
            timetableEndpoints: string[];
            limitations: string[];
        };
        bahn_web: {
            source: string;
            endpoints: string[];
            defaultBaseUrl: string;
            fallbackBaseUrl: string;
            limitations: string[];
        };
    };
    message?: undefined;
    needs_configuration?: undefined;
    required_configuration?: undefined;
    config_status?: undefined;
    error?: undefined;
    primary_provider_error?: undefined;
    provider_error?: undefined;
} | {
    ok: boolean;
    operation: string;
    error: string;
    primary_provider_error: {
        message: string;
        credentialRelated: boolean;
        credentialDiagnosis: {
            status: string;
            reason: string;
            next_steps: string[];
        };
    };
    needs_configuration: boolean;
    credentials: {
        configured: boolean;
        credentialsName: undefined;
        hasBahnAPICredentials: boolean;
        hasBahnAccountCredentials: boolean;
        hasBahnAccountAPICredentials: boolean;
        hasBrowserUserDataDir: boolean;
        credentialsId?: undefined;
    } | {
        configured: boolean;
        credentialsName: string;
        credentialsId: string | undefined;
        hasBahnAPICredentials: boolean;
        hasBahnAccountCredentials: boolean;
        hasBahnAccountAPICredentials: boolean;
        hasBrowserUserDataDir: boolean;
    };
    credential_load_error: string | undefined;
    provider_selection: DelayProviderChoice;
    delay_settings: {
        provider: DBhopperDelayProviderSetting;
        fallback: DBhopperDelayFallbackSetting;
    };
    research: {
        official: {
            recommendedStack: string[];
            officialDocs: string[];
            timetableEndpoints: string[];
            limitations: string[];
        };
        bahn_web: {
            source: string;
            endpoints: string[];
            defaultBaseUrl: string;
            fallbackBaseUrl: string;
            limitations: string[];
        };
    };
    message?: undefined;
    required_configuration?: undefined;
    config_status?: undefined;
    provider_error?: undefined;
} | {
    ok: boolean;
    operation: string;
    error: string;
    provider_error: {
        message: string;
        credentialRelated: boolean;
        credentialDiagnosis: {
            status: string;
            reason: string;
            next_steps: string[];
        };
    };
    needs_configuration: boolean;
    credentials: {
        configured: boolean;
        credentialsName: undefined;
        hasBahnAPICredentials: boolean;
        hasBahnAccountCredentials: boolean;
        hasBahnAccountAPICredentials: boolean;
        hasBrowserUserDataDir: boolean;
        credentialsId?: undefined;
    } | {
        configured: boolean;
        credentialsName: string;
        credentialsId: string | undefined;
        hasBahnAPICredentials: boolean;
        hasBahnAccountCredentials: boolean;
        hasBahnAccountAPICredentials: boolean;
        hasBrowserUserDataDir: boolean;
    };
    credential_load_error: string | undefined;
    provider_selection: DelayProviderChoice | undefined;
    delay_settings: {
        provider: DBhopperDelayProviderSetting;
        fallback: DBhopperDelayFallbackSetting;
    };
    research: {
        official: {
            recommendedStack: string[];
            officialDocs: string[];
            timetableEndpoints: string[];
            limitations: string[];
        };
        bahn_web: {
            source: string;
            endpoints: string[];
            defaultBaseUrl: string;
            fallbackBaseUrl: string;
            limitations: string[];
        };
    };
    message?: undefined;
    required_configuration?: undefined;
    config_status?: undefined;
    primary_provider_error?: undefined;
}>;
export declare function runDbDelayProviderParityProbe(params: DbDelayProviderParityProbeParams, config?: DelayProviderRuntimeConfig, signal?: AbortSignal): Promise<DbDelayProviderParityProbeResult>;
export declare function selectDelayProvider(requested: DbDelayProviderName | undefined, config: DelayProviderRuntimeConfig, timetablesConfigured: boolean): DelayProviderChoice;
export declare function shouldFallbackToProvider(fallback: DBhopperDelayFallbackSetting, providerChoice: DelayProviderChoice, error: unknown): boolean;
export declare function isTimetablesCredentialError(error: unknown): boolean;

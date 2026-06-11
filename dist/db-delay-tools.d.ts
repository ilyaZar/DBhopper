import type { DBhopperConfig } from "./types.js";
import { type StationRef } from "./db-delay.js";
export type DbDelayProviderName = "auto" | "db-timetables" | "bahn-web";
export type SelectedDelayProviderName = "db-timetables" | "bahn-web";
export interface DelayProviderChoice {
    requested: DbDelayProviderName;
    selected: SelectedDelayProviderName;
    reason: string;
    fallbackFrom?: SelectedDelayProviderName;
}
export declare const DB_DELAY_TOOL_NAMES: readonly ["dbhopper_db_delay_research", "dbhopper_query_db_delay"];
export interface DbDelayQueryToolParams {
    provider?: DbDelayProviderName;
    credentials_profile?: string;
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
export declare function createDbDelayToolDefinitions(tool: any): any[];
export declare function runDbDelayQuery(params: DbDelayQueryToolParams, config?: DBhopperConfig, signal?: AbortSignal): Promise<{
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
    provider_selection?: undefined;
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
        hasDbApiCredentials: boolean;
        hasDbApiAccountCredentials: boolean;
        hasBahnAccountCredentials: boolean;
        hasBrowserUserDataDir: boolean;
        credentialsId?: undefined;
    } | {
        configured: boolean;
        credentialsName: string;
        credentialsId: string | undefined;
        hasDbApiCredentials: boolean;
        hasDbApiAccountCredentials: boolean;
        hasBahnAccountCredentials: boolean;
        hasBrowserUserDataDir: boolean;
    };
    provider_selection: DelayProviderChoice;
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
            category: string;
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
            cancelled: boolean;
        };
        matched_by: string[];
        replacement_candidates: {
            journey: {
                raw?: unknown;
                id: string;
                label: string | undefined;
                category: string;
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
            category: string;
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
            cancelled: boolean;
        };
        matched_by: string[];
    }[];
    table_rows: ({
        role: string;
        label: string | undefined;
        category: string;
        train_number: string | undefined;
        line_number: string | undefined;
        delay_minutes: number | null;
        reachable: null;
        planned_boarding_time: string | undefined;
        realtime_boarding_time: string | undefined;
        boarding_station: string;
        destination_station: string;
        platform: string | undefined;
        source: string | undefined;
        route_confidence: "unknown" | "full_stop_list" | "station_board_path" | undefined;
        route: string[];
        matched_by: string[];
    } | {
        role: string;
        label: string | undefined;
        category: string;
        train_number: string | undefined;
        line_number: string | undefined;
        delay_minutes: null;
        reachable: boolean;
        planned_boarding_time: string | undefined;
        realtime_boarding_time: string | undefined;
        boarding_station: string;
        destination_station: string;
        platform: string | undefined;
        source: string | undefined;
        route_confidence: "unknown" | "full_stop_list" | "station_board_path" | undefined;
        route: string[];
        matched_by: string[];
    })[];
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
                category: string;
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
                category: string;
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
        hasDbApiCredentials: boolean;
        hasDbApiAccountCredentials: boolean;
        hasBahnAccountCredentials: boolean;
        hasBrowserUserDataDir: boolean;
        credentialsId?: undefined;
    } | {
        configured: boolean;
        credentialsName: string;
        credentialsId: string | undefined;
        hasDbApiCredentials: boolean;
        hasDbApiAccountCredentials: boolean;
        hasBahnAccountCredentials: boolean;
        hasBrowserUserDataDir: boolean;
    };
    provider_selection: DelayProviderChoice;
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
} | {
    provider_selection: DelayProviderChoice;
    official_provider_error: {
        message: string;
        credentialRelated: boolean;
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
} | {
    provider_selection: DelayProviderChoice;
    official_provider_error: {
        message: string;
        credentialRelated: boolean;
    };
    ok: boolean;
    operation: string;
    source_api: SelectedDelayProviderName;
    source_api_notes: string[];
    credentials: {
        configured: boolean;
        credentialsName: undefined;
        hasDbApiCredentials: boolean;
        hasDbApiAccountCredentials: boolean;
        hasBahnAccountCredentials: boolean;
        hasBrowserUserDataDir: boolean;
        credentialsId?: undefined;
    } | {
        configured: boolean;
        credentialsName: string;
        credentialsId: string | undefined;
        hasDbApiCredentials: boolean;
        hasDbApiAccountCredentials: boolean;
        hasBahnAccountCredentials: boolean;
        hasBrowserUserDataDir: boolean;
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
            category: string;
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
            cancelled: boolean;
        };
        matched_by: string[];
        replacement_candidates: {
            journey: {
                raw?: unknown;
                id: string;
                label: string | undefined;
                category: string;
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
            category: string;
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
            cancelled: boolean;
        };
        matched_by: string[];
    }[];
    table_rows: ({
        role: string;
        label: string | undefined;
        category: string;
        train_number: string | undefined;
        line_number: string | undefined;
        delay_minutes: number | null;
        reachable: null;
        planned_boarding_time: string | undefined;
        realtime_boarding_time: string | undefined;
        boarding_station: string;
        destination_station: string;
        platform: string | undefined;
        source: string | undefined;
        route_confidence: "unknown" | "full_stop_list" | "station_board_path" | undefined;
        route: string[];
        matched_by: string[];
    } | {
        role: string;
        label: string | undefined;
        category: string;
        train_number: string | undefined;
        line_number: string | undefined;
        delay_minutes: null;
        reachable: boolean;
        planned_boarding_time: string | undefined;
        realtime_boarding_time: string | undefined;
        boarding_station: string;
        destination_station: string;
        platform: string | undefined;
        source: string | undefined;
        route_confidence: "unknown" | "full_stop_list" | "station_board_path" | undefined;
        route: string[];
        matched_by: string[];
    })[];
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
                category: string;
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
                category: string;
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
} | {
    ok: boolean;
    operation: string;
    error: string;
    primary_provider_error: {
        message: string;
        credentialRelated: boolean;
    };
    needs_configuration: boolean;
    credentials: {
        configured: boolean;
        credentialsName: undefined;
        hasDbApiCredentials: boolean;
        hasDbApiAccountCredentials: boolean;
        hasBahnAccountCredentials: boolean;
        hasBrowserUserDataDir: boolean;
        credentialsId?: undefined;
    } | {
        configured: boolean;
        credentialsName: string;
        credentialsId: string | undefined;
        hasDbApiCredentials: boolean;
        hasDbApiAccountCredentials: boolean;
        hasBahnAccountCredentials: boolean;
        hasBrowserUserDataDir: boolean;
    };
    provider_selection: DelayProviderChoice;
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
} | {
    ok: boolean;
    operation: string;
    error: string;
    needs_configuration: boolean;
    credentials: {
        configured: boolean;
        credentialsName: undefined;
        hasDbApiCredentials: boolean;
        hasDbApiAccountCredentials: boolean;
        hasBahnAccountCredentials: boolean;
        hasBrowserUserDataDir: boolean;
        credentialsId?: undefined;
    } | {
        configured: boolean;
        credentialsName: string;
        credentialsId: string | undefined;
        hasDbApiCredentials: boolean;
        hasDbApiAccountCredentials: boolean;
        hasBahnAccountCredentials: boolean;
        hasBrowserUserDataDir: boolean;
    };
    provider_selection: DelayProviderChoice | undefined;
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
export declare function selectDelayProvider(requested: DbDelayProviderName | undefined, config: DBhopperConfig, timetablesConfigured: boolean): DelayProviderChoice;
export declare function shouldFallbackToBahnWeb(requested: DbDelayProviderName | undefined, providerChoice: DelayProviderChoice, error: unknown): boolean;
export declare function isTimetablesCredentialError(error: unknown): boolean;

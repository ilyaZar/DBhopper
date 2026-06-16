import type { DBhopperConfig } from "./types.js";
export interface DbApiCredentialProbeParams {
    station_pattern?: string;
}
export interface DbApiCredentialProbeOptions {
    fetchImpl?: typeof fetch;
}
export declare function runDbApiCredentialProbe(params: DbApiCredentialProbeParams, config?: DBhopperConfig, options?: DbApiCredentialProbeOptions): Promise<{
    ok: boolean;
    operation: string;
    source_api: string;
    needsConfiguration: boolean;
    message: string;
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
    credentialSignals: {
        hasClientId: boolean;
        hasApiKey: boolean;
    };
    configStatus: {
        configured: boolean;
        hasClientId: boolean;
        hasApiKey: boolean;
        baseUrl: string;
    };
    browserLoginDoesNotProveApiKeyValidity: boolean;
    request?: undefined;
    response?: undefined;
    credentialDiagnosis?: undefined;
    error?: undefined;
} | {
    ok: boolean;
    operation: string;
    source_api: string;
    needsConfiguration: boolean;
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
    credentialSignals: {
        hasClientId: boolean;
        hasApiKey: boolean;
    };
    configStatus: {
        configured: boolean;
        hasClientId: boolean;
        hasApiKey: boolean;
        baseUrl: string;
    };
    request: {
        endpoint: string;
        headersSent: string[];
    };
    response: {
        ok: boolean;
        status: number;
        statusText: string;
        contentType: string | null;
        dbErrorMessage: string;
    };
    credentialDiagnosis: {
        status: string;
        reason: string;
        next_steps: string[];
    };
    browserLoginDoesNotProveApiKeyValidity: boolean;
    message?: undefined;
    error?: undefined;
} | {
    ok: boolean;
    operation: string;
    source_api: string;
    needsConfiguration: boolean;
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
    credentialSignals: {
        hasClientId: boolean;
        hasApiKey: boolean;
    };
    configStatus: {
        configured: boolean;
        hasClientId: boolean;
        hasApiKey: boolean;
        baseUrl: string;
    };
    error: string;
    browserLoginDoesNotProveApiKeyValidity: boolean;
    message?: undefined;
    request?: undefined;
    response?: undefined;
    credentialDiagnosis?: undefined;
}>;
export declare function bahnAPICredentialSignals(config: DBhopperConfig): {
    hasClientId: boolean;
    hasApiKey: boolean;
};

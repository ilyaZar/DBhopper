import type { DBhopperConfig } from "./types.js";
export interface DbApiCredentialProbeParams {
    credentials_profile?: string;
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
    credentialSignals: {
        hasClientId: boolean;
        hasApiKey: boolean;
        clientIdLength: number;
        apiKeyLength: number;
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
    error?: undefined;
} | {
    ok: boolean;
    operation: string;
    source_api: string;
    needsConfiguration: boolean;
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
    credentialSignals: {
        hasClientId: boolean;
        hasApiKey: boolean;
        clientIdLength: number;
        apiKeyLength: number;
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
    credentialSignals: {
        hasClientId: boolean;
        hasApiKey: boolean;
        clientIdLength: number;
        apiKeyLength: number;
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
}>;
export declare function dbApiCredentialSignals(config: DBhopperConfig): {
    hasClientId: boolean;
    hasApiKey: boolean;
    clientIdLength: number;
    apiKeyLength: number;
};

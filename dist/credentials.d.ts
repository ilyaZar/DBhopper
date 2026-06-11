import type { DBhopperConfig, ValidationMessage } from "./types.js";
export interface DBhopperCredentials {
    ID_CRED?: string;
    version?: 1;
    dbApi?: {
        clientId?: string;
        apiKey?: string;
        accountUsername?: string;
        accountPassword?: string;
    };
    bahnAccount?: {
        username?: string;
        password?: string;
    };
    browser?: {
        userDataDir?: string;
    };
}
export interface LoadedCredentialsProfile {
    credentialsName: string;
    credentialsPath: string;
    credentialsId?: string;
    credentials: DBhopperCredentials;
}
export declare function credentialsDir(config?: DBhopperConfig): string;
export declare function normalizeCredentialsName(value: string): string;
export declare function readCredentialsProfile(credentialsProfile: string, config?: DBhopperConfig): Promise<LoadedCredentialsProfile>;
export declare function readSelectedCredentialsProfile(config?: DBhopperConfig, credentialsProfile?: string): Promise<LoadedCredentialsProfile | undefined>;
export declare function validateCredentialsFiles(config?: DBhopperConfig): Promise<{
    ok: boolean;
    messages: ValidationMessage[];
}>;
export declare function applyCredentialsToConfig(config: DBhopperConfig, loaded?: LoadedCredentialsProfile): DBhopperConfig;
export declare function credentialsSummary(loaded?: LoadedCredentialsProfile): {
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
export declare function parseCredentialsToml(text: string, source?: string): DBhopperCredentials;

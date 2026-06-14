import type { DBhopperConfig, ValidationMessage } from "./types.js";
export interface DBhopperCredentials {
    ID_USR: string;
    version?: 1;
    bahnAPI?: {
        clientId?: string;
        apiKey?: string;
    };
    bahnAccount?: {
        username?: string;
        password?: string;
    };
    bahnAccountAPI?: {
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
export declare function readSelectedCredentialsProfile(config?: DBhopperConfig): Promise<{
    credentialsName: string;
    credentialsPath: string;
    credentialsId: string;
    credentials: DBhopperCredentials;
} | undefined>;
export declare function validateCredentialsFiles(config?: DBhopperConfig): Promise<{
    ok: boolean;
    messages: ValidationMessage[];
}>;
export declare function applyCredentialsToConfig(config: DBhopperConfig, loaded?: LoadedCredentialsProfile): DBhopperConfig;
export declare function credentialsSummary(loaded?: LoadedCredentialsProfile): {
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
export declare function parseCredentialsToml(text: string, source?: string): DBhopperCredentials;

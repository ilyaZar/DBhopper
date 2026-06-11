import type { DBhopperConfig, ValidationMessage } from "./types.js";
export interface DBhopperPrivateSettings {
    ID_CRED: string;
    ID_PRF: string;
    PATH_CRED: string;
    PATH_PRF: string;
}
export interface LoadedPrivateSettings {
    exists: boolean;
    settingsPath: string;
    settings: DBhopperPrivateSettings;
    credentialsDir: string;
    profilesDir: string;
}
export interface PrivateIdFile {
    id: string;
    fileName: string;
    filePath: string;
    implicitId?: boolean;
}
export declare function privateSettingsPath(config?: DBhopperConfig): string;
export declare function defaultPrivateSettings(): DBhopperPrivateSettings;
export declare function readPrivateSettings(config?: DBhopperConfig): Promise<LoadedPrivateSettings>;
export declare function parsePrivateSettingsToml(text: string, source?: string): DBhopperPrivateSettings;
export declare function stringifyPrivateSettingsToml(settings: DBhopperPrivateSettings): string;
export declare function listCredentialIdFiles(config?: DBhopperConfig): Promise<{
    items: PrivateIdFile[];
    messages: ValidationMessage[];
    settings: LoadedPrivateSettings;
}>;
export declare function listProfileIdFiles(config?: DBhopperConfig): Promise<{
    items: PrivateIdFile[];
    messages: ValidationMessage[];
    settings: LoadedPrivateSettings;
}>;
export declare function resolveSelectedCredentialFile(config?: DBhopperConfig): Promise<{
    settings: LoadedPrivateSettings;
    file: PrivateIdFile;
} | undefined>;
export declare function resolveSelectedProfileFile(config?: DBhopperConfig): Promise<{
    settings: LoadedPrivateSettings;
    file: PrivateIdFile;
} | undefined>;
export declare function configuredCredentialsDir(config?: DBhopperConfig): Promise<string>;
export declare function configuredProfilesDir(config?: DBhopperConfig): Promise<string>;
export declare function privateSettingsStatus(config?: DBhopperConfig): Promise<{
    ok: boolean;
    settings: {
        exists: boolean;
        settingsPath: string;
        ID_CRED: string;
        ID_PRF: string;
        PATH_CRED: string;
        PATH_PRF: string;
        credentialsDir: string;
        profilesDir: string;
    };
    credentials: {
        currentId: string;
        selected: PrivateIdFile | undefined;
        availableIds: string[];
        files: PrivateIdFile[];
    };
    profiles: {
        currentId: string;
        selected: PrivateIdFile | undefined;
        availableIds: string[];
        files: PrivateIdFile[];
    };
    messages: ValidationMessage[];
}>;
export declare function writePrivateSettingsIds(updates: {
    credentialId?: string;
    profileId?: string;
}, config?: DBhopperConfig): Promise<{
    ok: boolean;
    settings: {
        exists: boolean;
        settingsPath: string;
        ID_CRED: string;
        ID_PRF: string;
        PATH_CRED: string;
        PATH_PRF: string;
        credentialsDir: string;
        profilesDir: string;
    };
    credentials: {
        currentId: string;
        selected: PrivateIdFile | undefined;
        availableIds: string[];
        files: PrivateIdFile[];
    };
    profiles: {
        currentId: string;
        selected: PrivateIdFile | undefined;
        availableIds: string[];
        files: PrivateIdFile[];
    };
    messages: ValidationMessage[];
}>;
export declare function normalizePrivateId(value: string, field: "ID_CRED" | "ID_PRF"): string;

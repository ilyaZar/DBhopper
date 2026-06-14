import type { DBhopperConfig, ValidationMessage } from "./types.js";
export type DBhopperDelayProviderSetting = "auto" | "db-timetables" | "bahn-web";
export type DBhopperDelayFallbackSetting = "none" | "db-timetables" | "bahn-web";
export type DBhopperTicketBuyingMode = "review" | "auto";
export interface DBhopperPrivateSettings {
    ID_USR: string;
    ID_CLM: string;
    ID_BUY: string;
    ID_PYM: string;
    TICKET_BUYING_MODE: DBhopperTicketBuyingMode;
    PATH_CRED: string;
    PATH_PRF: string;
    DELAY_PROVIDER: DBhopperDelayProviderSetting;
    DELAY_FALLBACK: DBhopperDelayFallbackSetting;
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
}
type PrivateIdField = "ID_USR" | "ID_CLM" | "ID_BUY" | "ID_PYM";
export declare function privateSettingsPath(config?: DBhopperConfig): string;
export declare function defaultPrivateSettings(): DBhopperPrivateSettings;
export declare function readPrivateSettings(config?: DBhopperConfig): Promise<LoadedPrivateSettings>;
export declare function parsePrivateSettingsToml(text: string, source?: string): DBhopperPrivateSettings;
export declare function stringifyPrivateSettingsToml(settings: DBhopperPrivateSettings): string;
export declare function listCredentialIdFiles(config?: DBhopperConfig): Promise<{
    items: PrivateIdFile[];
    messages: ValidationMessage[];
    directoryOk: boolean;
    settings: LoadedPrivateSettings;
}>;
export declare function listPaymentProfileIdFiles(config?: DBhopperConfig): Promise<{
    items: PrivateIdFile[];
    messages: ValidationMessage[];
    directoryOk: boolean;
    settings: LoadedPrivateSettings;
}>;
export declare function listProfileIdFiles(config?: DBhopperConfig): Promise<{
    items: PrivateIdFile[];
    messages: ValidationMessage[];
    directoryOk: boolean;
    settings: LoadedPrivateSettings;
}>;
export declare function listClaimProfileIdFiles(config?: DBhopperConfig): Promise<{
    items: PrivateIdFile[];
    messages: ValidationMessage[];
    directoryOk: boolean;
    settings: LoadedPrivateSettings;
}>;
export declare function listBuyingProfileIdFiles(config?: DBhopperConfig): Promise<{
    items: PrivateIdFile[];
    messages: ValidationMessage[];
    directoryOk: boolean;
    settings: LoadedPrivateSettings;
}>;
export declare function resolveSelectedCredentialFile(config?: DBhopperConfig): Promise<{
    settings: LoadedPrivateSettings;
    file: PrivateIdFile;
} | undefined>;
export declare function resolveSelectedPaymentProfileFile(config?: DBhopperConfig): Promise<{
    settings: LoadedPrivateSettings;
    file: PrivateIdFile;
} | undefined>;
export declare function resolveSelectedProfileFile(config?: DBhopperConfig): Promise<{
    settings: LoadedPrivateSettings;
    file: PrivateIdFile;
} | undefined>;
export declare function resolveSelectedClaimProfileFile(config?: DBhopperConfig): Promise<{
    settings: LoadedPrivateSettings;
    file: PrivateIdFile;
} | undefined>;
export declare function resolveSelectedBuyingProfileFile(config?: DBhopperConfig): Promise<{
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
        ID_USR: string;
        ID_CLM: string;
        ID_BUY: string;
        ID_PYM: string;
        TICKET_BUYING_MODE: DBhopperTicketBuyingMode;
        PATH_CRED: string;
        PATH_PRF: string;
        DELAY_PROVIDER: DBhopperDelayProviderSetting;
        DELAY_FALLBACK: DBhopperDelayFallbackSetting;
        credentialsDir: string;
        profilesDir: string;
    };
    credentials: {
        currentId: string;
        selected: PrivateIdFile | undefined;
        availableIds: string[];
        files: PrivateIdFile[];
    };
    paymentProfiles: {
        currentId: string;
        selected: PrivateIdFile | undefined;
        availableIds: string[];
        files: PrivateIdFile[];
    };
    claimProfiles: {
        currentId: string;
        selected: PrivateIdFile | undefined;
        availableIds: string[];
        files: PrivateIdFile[];
    };
    buyingProfiles: {
        currentId: string;
        selected: PrivateIdFile | undefined;
        availableIds: string[];
        files: PrivateIdFile[];
    };
    messages: ValidationMessage[];
}>;
export declare function writePrivateSettingsIds(updates: {
    userId?: string;
    credentialId?: string;
    claimProfileId?: string;
    buyingProfileId?: string;
    paymentProfileId?: string;
    ticketBuyingMode?: DBhopperTicketBuyingMode;
}, config?: DBhopperConfig): Promise<{
    ok: boolean;
    settings: {
        exists: boolean;
        settingsPath: string;
        ID_USR: string;
        ID_CLM: string;
        ID_BUY: string;
        ID_PYM: string;
        TICKET_BUYING_MODE: DBhopperTicketBuyingMode;
        PATH_CRED: string;
        PATH_PRF: string;
        DELAY_PROVIDER: DBhopperDelayProviderSetting;
        DELAY_FALLBACK: DBhopperDelayFallbackSetting;
        credentialsDir: string;
        profilesDir: string;
    };
    credentials: {
        currentId: string;
        selected: PrivateIdFile | undefined;
        availableIds: string[];
        files: PrivateIdFile[];
    };
    paymentProfiles: {
        currentId: string;
        selected: PrivateIdFile | undefined;
        availableIds: string[];
        files: PrivateIdFile[];
    };
    claimProfiles: {
        currentId: string;
        selected: PrivateIdFile | undefined;
        availableIds: string[];
        files: PrivateIdFile[];
    };
    buyingProfiles: {
        currentId: string;
        selected: PrivateIdFile | undefined;
        availableIds: string[];
        files: PrivateIdFile[];
    };
    messages: ValidationMessage[];
}>;
export declare function normalizePrivateId(value: string, field: PrivateIdField): string;
export {};

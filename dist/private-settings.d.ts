import type { DBhopperConfig, ValidationMessage } from "./types.js";
import { type DBhopperDelayFallbackSetting, type DBhopperDelayProviderSetting } from "./delay-provider-options.js";
export type DBhopperPurchaseMode = "review" | "auto";
export type { DBhopperDelayFallbackSetting, DBhopperDelayProviderSetting, } from "./delay-provider-options.js";
export interface DBhopperPrivateSettings {
    USE_DELAY_RETRIEVAL: boolean;
    USE_CLAIM_REQUESTS: boolean;
    USE_TICKET_PURCHASE: boolean;
    ID_USR: string;
    ID_CLM: string;
    ID_BUY: string;
    ID_PYM: string;
    PURCHASE_MODE: DBhopperPurchaseMode;
    PATH_USR: string;
    PATH_CLM: string;
    PATH_BUY: string;
    PATH_PYM: string;
    PATH_PRC: string;
    DELAY_PROVIDER: DBhopperDelayProviderSetting;
    DELAY_FALLBACK: DBhopperDelayFallbackSetting;
}
export interface LoadedPrivateSettings {
    exists: boolean;
    settingsPath: string;
    settings: DBhopperPrivateSettings;
    userCredentialsDir: string;
    claimProfilesDir: string;
    buyingProfilesDir: string;
    paymentProfilesDir: string;
    purchaseArtifactsDir: string;
}
export interface DBhopperRuntimeConfigUpdates {
    use_delay_retrieval?: boolean;
    use_claim_requests?: boolean;
    use_ticket_purchase?: boolean;
    delay_provider?: DBhopperDelayProviderSetting;
    delay_fallback?: DBhopperDelayFallbackSetting;
    purchase_mode?: DBhopperPurchaseMode;
}
export interface DBhopperRuntimeConfigChange {
    field: keyof DBhopperRuntimeConfigUpdates;
    from: boolean | string;
    to: boolean | string;
    meaning: string;
}
export interface DBhopperRuntimeConfigPreview {
    current: Required<DBhopperRuntimeConfigUpdates>;
    requested: Partial<DBhopperRuntimeConfigUpdates>;
    changes: DBhopperRuntimeConfigChange[];
    needsUserAction: boolean;
    message: string;
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
export declare function resolveSelectedClaimProfileFile(config?: DBhopperConfig): Promise<{
    settings: LoadedPrivateSettings;
    file: PrivateIdFile;
} | undefined>;
export declare function resolveSelectedBuyingProfileFile(config?: DBhopperConfig): Promise<{
    settings: LoadedPrivateSettings;
    file: PrivateIdFile;
} | undefined>;
export declare function configuredUserCredentialsDir(config?: DBhopperConfig): Promise<string>;
export declare function configuredClaimProfilesDir(config?: DBhopperConfig): Promise<string>;
export declare function configuredBuyingProfilesDir(config?: DBhopperConfig): Promise<string>;
export declare function configuredPaymentProfilesDir(config?: DBhopperConfig): Promise<string>;
export declare function configuredPurchaseArtifactsDir(config?: DBhopperConfig): Promise<string>;
export declare function privateSettingsStatus(config?: DBhopperConfig): Promise<{
    ok: boolean;
    settings: {
        exists: boolean;
        settingsPath: string;
        USE_DELAY_RETRIEVAL: boolean;
        USE_CLAIM_REQUESTS: boolean;
        USE_TICKET_PURCHASE: boolean;
        ID_USR: string;
        ID_CLM: string;
        ID_BUY: string;
        ID_PYM: string;
        PURCHASE_MODE: DBhopperPurchaseMode;
        PATH_USR: string;
        PATH_CLM: string;
        PATH_BUY: string;
        PATH_PYM: string;
        PATH_PRC: string;
        DELAY_PROVIDER: "auto" | "db-timetables" | "bahn-web";
        DELAY_FALLBACK: "db-timetables" | "bahn-web" | "none";
        userCredentialsDir: string;
        claimProfilesDir: string;
        buyingProfilesDir: string;
        paymentProfilesDir: string;
        purchaseArtifactsDir: string;
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
}, config?: DBhopperConfig): Promise<{
    ok: boolean;
    settings: {
        exists: boolean;
        settingsPath: string;
        USE_DELAY_RETRIEVAL: boolean;
        USE_CLAIM_REQUESTS: boolean;
        USE_TICKET_PURCHASE: boolean;
        ID_USR: string;
        ID_CLM: string;
        ID_BUY: string;
        ID_PYM: string;
        PURCHASE_MODE: DBhopperPurchaseMode;
        PATH_USR: string;
        PATH_CLM: string;
        PATH_BUY: string;
        PATH_PYM: string;
        PATH_PRC: string;
        DELAY_PROVIDER: "auto" | "db-timetables" | "bahn-web";
        DELAY_FALLBACK: "db-timetables" | "bahn-web" | "none";
        userCredentialsDir: string;
        claimProfilesDir: string;
        buyingProfilesDir: string;
        paymentProfilesDir: string;
        purchaseArtifactsDir: string;
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
export declare function previewPrivateSettingsRuntimeConfig(updates: DBhopperRuntimeConfigUpdates, config?: DBhopperConfig): Promise<DBhopperRuntimeConfigPreview>;
export declare function writePrivateSettingsRuntimeConfig(updates: DBhopperRuntimeConfigUpdates, config?: DBhopperConfig): Promise<{
    preview: DBhopperRuntimeConfigPreview;
    status: {
        ok: boolean;
        settings: {
            exists: boolean;
            settingsPath: string;
            USE_DELAY_RETRIEVAL: boolean;
            USE_CLAIM_REQUESTS: boolean;
            USE_TICKET_PURCHASE: boolean;
            ID_USR: string;
            ID_CLM: string;
            ID_BUY: string;
            ID_PYM: string;
            PURCHASE_MODE: DBhopperPurchaseMode;
            PATH_USR: string;
            PATH_CLM: string;
            PATH_BUY: string;
            PATH_PYM: string;
            PATH_PRC: string;
            DELAY_PROVIDER: "auto" | "db-timetables" | "bahn-web";
            DELAY_FALLBACK: "db-timetables" | "bahn-web" | "none";
            userCredentialsDir: string;
            claimProfilesDir: string;
            buyingProfilesDir: string;
            paymentProfilesDir: string;
            purchaseArtifactsDir: string;
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
    };
}>;
export declare function normalizePrivateId(value: string, field: PrivateIdField): string;
export declare function privateDirectoryLocationError(dir: string, idField: PrivateIdField, root: string): Promise<ValidationMessage | undefined>;

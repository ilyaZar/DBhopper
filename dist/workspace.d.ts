import type { ClaimFile, ClaimFileRole, DBhopperClaim, DBhopperConfig, PreparedClaim } from "./types.js";
export interface FileInput {
    role: ClaimFileRole;
    sourcePath?: string;
    assetName?: string;
    targetName?: string;
    description?: string;
}
export interface PrepareClaimParams {
    confirm?: boolean;
    claimId?: string;
    claim?: DBhopperClaim;
    profileName?: string;
    profileAssetName?: string;
    files?: FileInput[];
    overwrite?: boolean;
}
export interface WorkspacePaths {
    root: string;
    claimsDir: string;
    assetsDir: string;
    profilesDir: string;
}
export declare function resolveWorkspace(config?: DBhopperConfig): WorkspacePaths;
export declare function ensureWorkspace(config?: DBhopperConfig): Promise<WorkspacePaths>;
export declare function normalizeClaimId(value?: string): string;
export declare function claimPaths(claimId: string, config?: DBhopperConfig): {
    workspace: WorkspacePaths;
    claimId: string;
    claimDir: string;
    claimPath: string;
    recipePath: string;
};
export declare function readClaim(claimId: string, config?: DBhopperConfig): Promise<PreparedClaim>;
export declare function listClaims(config?: DBhopperConfig): Promise<({
    claimId: string;
    status: string;
    profileName: string | undefined;
    journey: {
        date?: string;
        scheduledDepartureTime?: string;
        startStation?: string;
        endStation?: string;
        plannedLine?: string;
        plannedTrainLabel?: string;
        delayMinutes?: number;
        disruptionType?: import("./types.js").DisruptionType;
        replacementStartedAt?: string;
        usedDelayedVehicle?: boolean;
        usedIdenticalLocalAlternative?: boolean;
        excludedReasons?: string[];
    } | undefined;
    claimant: {
        salutation: "MR" | "MS" | "DIVERS" | "FAMILY" | undefined;
        firstName: string | undefined;
        lastName: string | undefined;
        email: string | undefined;
    } | undefined;
    fileCount: number;
} | {
    claimId: string;
    status: string;
    fileCount: number;
    profileName?: undefined;
    journey?: undefined;
    claimant?: undefined;
})[]>;
export declare function prepareClaim(params: PrepareClaimParams, config?: DBhopperConfig): Promise<PreparedClaim>;
export declare function recordClaimArtifact(claimId: string, file: ClaimFile, config?: DBhopperConfig): Promise<DBhopperClaim>;
export declare function writeSubmittedRecipe(prepared: PreparedClaim): Promise<string>;
export declare function validateWorkspaceTomlFiles(config?: DBhopperConfig): Promise<{
    ok: boolean;
    messages: import("./types.js").ValidationMessage[];
}>;
export declare function resolveClaimFilePath(claimDir: string, value: string): Promise<string>;
export declare function redactEmail(value: string): string;

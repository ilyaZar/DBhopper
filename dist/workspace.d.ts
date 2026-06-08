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
    profileAssetName?: string;
    files?: FileInput[];
    overwrite?: boolean;
}
export interface WorkspacePaths {
    root: string;
    claimsDir: string;
    assetsDir: string;
}
export declare function resolveWorkspace(config?: DBhopperConfig): WorkspacePaths;
export declare function ensureWorkspace(config?: DBhopperConfig): Promise<WorkspacePaths>;
export declare function normalizeClaimId(value?: string): string;
export declare function claimPaths(claimId: string, config?: DBhopperConfig): {
    workspace: WorkspacePaths;
    claimId: string;
    claimDir: string;
    claimPath: string;
};
export declare function readClaim(claimId: string, config?: DBhopperConfig): Promise<PreparedClaim>;
export declare function listClaims(config?: DBhopperConfig): Promise<any[]>;
export declare function prepareClaim(params: PrepareClaimParams, config?: DBhopperConfig): Promise<PreparedClaim>;
export declare function recordClaimArtifact(claimId: string, file: ClaimFile, config?: DBhopperConfig): Promise<DBhopperClaim>;
export declare function resolveClaimFilePath(claimDir: string, value: string): Promise<string>;
export declare function redactEmail(value: string): string;

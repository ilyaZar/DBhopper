import type { DBhopperConfig } from "./types.js";
import { type DBhopperFeatureSettings } from "./plugin-settings.js";
export declare function resolveApprovalToolNames(config?: DBhopperConfig): Set<string>;
export declare function requiresMandatoryHumanApproval({ toolName, params, }: {
    toolName: string;
    params?: Record<string, unknown>;
}): boolean;
export declare function registerClaimApprovalHook(api: any, readFeatureSettings?: () => DBhopperFeatureSettings): void;
export declare function buildDBhopperApprovalDescription({ toolName, params, }: {
    toolName: string;
    params?: Record<string, unknown>;
}): string;
export declare function createDBhopperTools(config?: DBhopperConfig): any[];

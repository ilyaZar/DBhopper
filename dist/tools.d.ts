import type { DBhopperConfig } from "./types.js";
export declare function resolveApprovalToolNames(config?: DBhopperConfig): Set<string>;
export declare function buildDBhopperApprovalDescription({ toolName, params, }: {
    toolName: string;
    params?: Record<string, unknown>;
}): string;
export declare function createDBhopperTools(config?: DBhopperConfig): any[];

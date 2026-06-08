import type { DBhopperConfig } from "./types.js";
export declare const SIDE_EFFECT_TOOL_NAMES: Set<string>;
export declare const OPTIONAL_TOOL_NAMES: Set<string>;
export declare const APPROVAL_TOOL_NAMES: Set<string>;
export declare function resolveApprovalToolNames(config?: DBhopperConfig): Set<string>;
export declare function buildDBhopperApprovalDescription({ toolName, params, }: {
    toolName: string;
    params?: Record<string, unknown>;
}): string;
export declare function createDBhopperTools(config?: DBhopperConfig): any[];

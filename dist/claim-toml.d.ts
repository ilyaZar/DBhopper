import type { DBhopperClaim, ValidationMessage } from "./types.js";
export declare function parseClaimToml(text: string, source?: string): DBhopperClaim;
export declare function parsePrivateProfileToml(text: string, source?: string): DBhopperClaim;
export declare function stringifyClaimToml(claim: DBhopperClaim): string;
export declare function assertClaimTomlShape(claim: DBhopperClaim, source?: string): void;
export declare function mergeClaims(base: DBhopperClaim, override: DBhopperClaim): DBhopperClaim;
export declare function profileFieldsInClaim(claim: DBhopperClaim): string[];
export declare function schemaValidationMessages(value: unknown, kind: "claim" | "profile", source: string): ValidationMessage[];

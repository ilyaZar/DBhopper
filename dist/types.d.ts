export type SubstituteType = "long_distance" | "taxi" | "sharing" | "alternative_local";
export type DisruptionType = "delay" | "cancellation";
export type ClaimFileRole = "base_ticket" | "substitute_receipt" | "delay_evidence" | "submission_pdf" | "screenshot" | "other";
export interface ClaimFile {
    role: ClaimFileRole;
    path: string;
    description?: string;
    reusableAsset?: boolean;
}
export interface DBhopperClaim {
    version?: 1;
    claimId?: string;
    status?: string;
    claimant?: {
        salutation?: "MR" | "MS" | "DIVERS" | "FAMILY";
        firstName?: string;
        lastName?: string;
        email?: string;
        phone?: string;
        address?: {
            streetNumber?: string;
            zip?: string;
            city?: string;
            country?: string;
        };
    };
    journey?: {
        date?: string;
        scheduledDepartureTime?: string;
        startStation?: string;
        endStation?: string;
        plannedLine?: string;
        plannedTrainLabel?: string;
        delayMinutes?: number;
        disruptionType?: DisruptionType;
        replacementStartedAt?: string;
        usedDelayedVehicle?: boolean;
        usedIdenticalLocalAlternative?: boolean;
        excludedReasons?: string[];
    };
    ticket?: {
        baseTicketName?: string;
        baseTicketCategory?: string;
        tariffArea?: string;
        substituteType?: SubstituteType;
        substituteCost?: number;
        companions?: number;
        description?: string;
    };
    bank?: {
        accountOwner?: string;
        iban?: string;
    };
    files?: ClaimFile[];
    metadata?: Record<string, unknown>;
}
export interface PreparedClaim {
    claimId: string;
    claimDir: string;
    claimPath: string;
    claim: DBhopperClaim;
    copiedFiles: ClaimFile[];
}
export interface ValidationMessage {
    code: string;
    message: string;
    severity: "error" | "warning" | "info";
}
export interface ValidationResult {
    ok: boolean;
    readyForBrowser: boolean;
    readyForSubmit: boolean;
    messages: ValidationMessage[];
}
export interface DBhopperConfig {
    workspaceRoot?: string;
    browserExecutablePath?: string;
    headless?: boolean;
    timeoutMs?: number;
    approvalMode?: "all" | "mutating" | "none";
}

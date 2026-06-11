import type { DBhopperClaim, ValidationResult } from "./types.js";
export declare function validateClaim(claim: DBhopperClaim, options?: {
    now?: Date;
    submit?: boolean;
}): ValidationResult;
export declare function claimSchemaReference(): {
    requiredFacts: {
        privateProfile: string;
        privateProfileShape: {
            version: number;
            claimant: {
                salutation: string;
                firstName: string;
                lastName: string;
                email: string;
                phone: string;
                address: {
                    streetNumber: string;
                    zip: string;
                    city: string;
                    country: string;
                };
            };
            bank: {
                accountOwner: string;
                iban: string;
            };
        };
        eligibility: string[];
        evidence: string[];
        formData: string[];
    };
    editableClaimTomlShape: {
        version: number;
        claimId: string;
        profileName: string;
        journey: {
            date: string;
            scheduledDepartureTime: string;
            startStation: string;
            endStation: string;
            plannedLine: string;
            delayMinutes: number;
            disruptionType: string;
            replacementStartedAt: string;
            usedDelayedVehicle: boolean;
            usedIdenticalLocalAlternative: boolean;
            excludedReasons: never[];
        };
        ticket: {
            baseTicketName: string;
            baseTicketCategory: string;
            tariffArea: string;
            substituteType: string;
            substituteCost: number;
            companions: number;
            description: string;
        };
        files: {
            role: string;
            path: string;
        }[];
    };
    submittedRecipeShape: string;
};

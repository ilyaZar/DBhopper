import type { DBhopperClaim, ValidationResult } from "./types.js";
export declare function validateClaim(claim: DBhopperClaim, options?: {
    now?: Date;
    submit?: boolean;
}): ValidationResult;
export declare function claimSchemaReference(): {
    requiredFacts: {
        privateProfile: string;
        privateProfileShape: {
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
                bank: {
                    accountOwner: string;
                    iban: string;
                };
            };
        };
        eligibility: string[];
        evidence: string[];
        formData: string[];
    };
    editableClaimTomlShape: {
        ID_CLM: string;
        journey: {
            date: string;
            scheduledDepartureTime: string;
            startStation: string;
            endStation: string;
            plannedLine: string;
            disruptionType: string;
            replacementStartedAt: string;
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

import type { DBhopperConfig, DBhopperPaymentMethod, DBhopperPaymentProfile, ValidationMessage } from "./types.js";
export interface LoadedPaymentProfile {
    paymentProfileName: string;
    paymentProfilePath: string;
    paymentProfileId?: string;
    paymentProfile: DBhopperPaymentProfile;
}
export declare function readSelectedPaymentProfile(config?: DBhopperConfig): Promise<{
    paymentProfileName: string;
    paymentProfilePath: string;
    paymentProfileId: string;
    paymentProfile: {
        ID_PYM: string;
        method: DBhopperPaymentMethod;
        payment: {
            paypal?: {
                saveAsPreferred: boolean;
            } | undefined;
            card?: {
                cardholderName: string | undefined;
                cardNumber: string | undefined;
                expiryMonth: string | undefined;
                expiryYear: string | undefined;
                saveAsPreferred: boolean;
            } | undefined;
            sepa?: {
                accountOwner: string | undefined;
                iban: string | undefined;
                birthdate: string | undefined;
                address: {
                    streetNumber: string | undefined;
                    additionalInfo: string | undefined;
                    zip: string | undefined;
                    city: string | undefined;
                    country: string | undefined;
                } | undefined;
                mandateAccepted: boolean;
                saveAsPreferred: boolean;
            } | undefined;
        };
        version?: 1;
    };
} | undefined>;
export declare function parsePaymentProfileToml(text: string, source?: string): {
    ID_PYM: string;
    method: DBhopperPaymentMethod;
    payment: {
        paypal?: {
            saveAsPreferred: boolean;
        } | undefined;
        card?: {
            cardholderName: string | undefined;
            cardNumber: string | undefined;
            expiryMonth: string | undefined;
            expiryYear: string | undefined;
            saveAsPreferred: boolean;
        } | undefined;
        sepa?: {
            accountOwner: string | undefined;
            iban: string | undefined;
            birthdate: string | undefined;
            address: {
                streetNumber: string | undefined;
                additionalInfo: string | undefined;
                zip: string | undefined;
                city: string | undefined;
                country: string | undefined;
            } | undefined;
            mandateAccepted: boolean;
            saveAsPreferred: boolean;
        } | undefined;
    };
    version?: 1;
};
export declare function schemaValidationMessagesForPaymentProfile(value: unknown, source: string): ValidationMessage[];
export declare function paymentProfileSummary(loaded?: LoadedPaymentProfile): {
    configured: boolean;
    paymentProfileName: undefined;
    paymentProfileId: undefined;
    method: undefined;
    hasSepaAccountOwner: boolean;
    hasSepaIban: boolean;
    hasSepaBirthdate: boolean;
    hasSepaAddress: boolean;
    hasSepaAddressStreetNumber: boolean;
    hasSepaAddressAdditionalInfo: boolean;
    hasSepaAddressZip: boolean;
    hasSepaAddressCity: boolean;
    hasSepaAddressCountry: boolean;
    sepaMandateAccepted: boolean;
    hasCardholderName: boolean;
    hasCardNumber: boolean;
    hasCardExpiry: boolean;
    hasCvc: boolean;
} | {
    configured: boolean;
    paymentProfileName: string;
    paymentProfileId: string | undefined;
    method: DBhopperPaymentMethod;
    hasSepaAccountOwner: boolean;
    hasSepaIban: boolean;
    hasSepaBirthdate: boolean;
    hasSepaAddress: boolean;
    hasSepaAddressStreetNumber: boolean;
    hasSepaAddressAdditionalInfo: boolean;
    hasSepaAddressZip: boolean;
    hasSepaAddressCity: boolean;
    hasSepaAddressCountry: boolean;
    sepaMandateAccepted: boolean;
    hasCardholderName: boolean;
    hasCardNumber: boolean;
    hasCardExpiry: boolean;
    hasCvc: boolean;
};
export declare function normalizePaymentBirthdate(value: string, source?: string): string;
export declare function formatPaymentBirthdateForDbUi(value: string): string;

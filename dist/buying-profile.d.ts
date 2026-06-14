import type { DBhopperBuyingProfile, DBhopperBookingFor, DBhopperConfig, DBhopperFareProduct, DBhopperTravelClass, ValidationMessage } from "./types.js";
export interface LoadedBuyingProfile {
    buyingProfileName: string;
    buyingProfilePath: string;
    buyingProfileId?: string;
    buyingProfile: DBhopperBuyingProfile;
}
export interface BuyingFarePreference {
    defaultFare: DBhopperFareProduct;
    fallbackFares: DBhopperFareProduct[];
    preferenceOrder: DBhopperFareProduct[];
    travelClass: DBhopperTravelClass;
    continueToCustomerData: boolean;
    bookingFor: DBhopperBookingFor;
    continueToPaymentBoundary: boolean;
}
export declare const BUYING_FARE_PRODUCT_ORDER: readonly ["super_sparpreis", "sparpreis", "flexpreis", "cheapest_available"];
export declare const BUYING_FARE_PRODUCT_LABELS: Record<DBhopperFareProduct, string>;
export declare const BUYING_TRAVEL_CLASS_LABELS: Record<DBhopperTravelClass, string>;
export declare function readSelectedBuyingProfile(config?: DBhopperConfig): Promise<{
    buyingProfileName: string;
    buyingProfilePath: string;
    buyingProfileId: string;
    buyingProfile: {
        ID_BUY: string;
        defaultFare: DBhopperFareProduct;
        fallbackFares: DBhopperFareProduct[];
        travelClass: DBhopperTravelClass;
        continueToCustomerData: boolean;
        bookingFor: DBhopperBookingFor;
        continueToPaymentBoundary: boolean;
    };
} | undefined>;
export declare function parseBuyingProfileToml(text: string, source?: string): {
    ID_BUY: string;
    defaultFare: DBhopperFareProduct;
    fallbackFares: DBhopperFareProduct[];
    travelClass: DBhopperTravelClass;
    continueToCustomerData: boolean;
    bookingFor: DBhopperBookingFor;
    continueToPaymentBoundary: boolean;
};
export declare function schemaValidationMessagesForBuyingProfile(value: unknown, source: string): ValidationMessage[];
export declare function buyingProfileSummary(loaded?: LoadedBuyingProfile): {
    configured: boolean;
    buyingProfileName: undefined;
    buyingProfileId: undefined;
    farePreference: BuyingFarePreference;
} | {
    configured: boolean;
    buyingProfileName: string;
    buyingProfileId: string | undefined;
    farePreference: BuyingFarePreference;
};
export declare function resolveBuyingFarePreference(profile?: Partial<DBhopperBuyingProfile>): BuyingFarePreference;
export declare function fareProductLabel(value: DBhopperFareProduct): string;
export declare function travelClassLabel(value: DBhopperTravelClass): string;

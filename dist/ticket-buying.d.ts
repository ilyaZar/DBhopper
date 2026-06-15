import type { Page } from "playwright-core";
import { type BuyingFarePreference } from "./buying-profile.js";
import { type DBhopperTicketBuyingMode } from "./private-settings.js";
import type { DBhopperBookingFor, DBhopperConfig, DBhopperFareProduct, DBhopperPaymentProfile } from "./types.js";
export interface TicketBuyingDryRunParams {
    departure_station: string;
    arrival_station: string;
    service_date?: string;
    departure_time?: string;
    train_label?: string;
    open_browser?: boolean;
    login_before_search?: boolean;
    stay_logged_in?: boolean;
    headless?: boolean;
    include_controls?: boolean;
    review_pause_ms?: number;
}
export interface TicketCheckoutDryRunParams {
    departure_station?: string;
    arrival_station?: string;
    service_date?: string;
    departure_time?: string;
    train_label?: string;
    login_before_search?: boolean;
    stay_logged_in?: boolean;
    open_browser?: boolean;
    headless?: boolean;
    include_controls?: boolean;
    review_pause_ms?: number;
    continue_after_payment_profile?: boolean;
}
export declare const TICKET_BUYING_RESEARCH_SUMMARY: {
    status: string;
    safety: string;
    purchaseCandidates: {
        name: string;
        status: string;
        notes: string;
    }[];
};
export declare function createTicketBuyingToolDefinitions(tool: any): any[];
export declare function runTicketBuyingDryRun(params: TicketBuyingDryRunParams, config?: DBhopperConfig, signal?: AbortSignal): Promise<{
    ok: boolean;
    operation: string;
    testing: boolean;
    stage: string;
    purchaseSubmitted: boolean;
    needsUserAction: boolean;
    message: string;
    credentials: {
        configured: boolean;
        credentialsName: undefined;
        hasBahnAPICredentials: boolean;
        hasBahnAccountCredentials: boolean;
        hasBahnAccountAPICredentials: boolean;
        hasBrowserUserDataDir: boolean;
        credentialsId?: undefined;
    } | {
        configured: boolean;
        credentialsName: string;
        credentialsId: string | undefined;
        hasBahnAPICredentials: boolean;
        hasBahnAccountCredentials: boolean;
        hasBahnAccountAPICredentials: boolean;
        hasBrowserUserDataDir: boolean;
    };
    plan: {
        startUrl: string;
        target: {
            departureStation: string;
            arrivalStation: string;
            serviceDate: string | undefined;
            departureTime: string | undefined;
            trainLabel: string | undefined;
        };
        browser: {
            canUsePersistentProfile: boolean;
            userDataDir: string | undefined;
        };
        accountLogin: {
            loginBeforeSearch: boolean;
            stayLoggedIn: boolean;
        };
        safetyStops: string[];
        currentStop: string;
        maySubmitPayment: boolean;
    };
    browserResult: {
        url: string;
        title: string;
        artifactDir: string;
        artifacts: string[];
        login: import("./db-login.js").DBAccountLoginResult | {
            requested: boolean;
        };
        applied: {
            outboundDateTime: {
                requested: boolean;
                applied: boolean;
                serviceDate?: undefined;
                departureTime?: undefined;
            } | {
                requested: boolean;
                applied: boolean;
                serviceDate: string | undefined;
                departureTime: string | undefined;
            };
        };
        controls: {
            text: string;
            tag: string;
            id: string | undefined;
            name: string | undefined;
            type: string | undefined;
            visible: boolean;
        }[] | undefined;
    };
    research: {
        status: string;
        safety: string;
        purchaseCandidates: {
            name: string;
            status: string;
            notes: string;
        }[];
    };
} | {
    ok: boolean;
    operation: string;
    testing: boolean;
    stage: string;
    purchaseSubmitted: boolean;
    needsUserAction: boolean;
    message: string;
    credentials: {
        configured: boolean;
        credentialsName: undefined;
        hasBahnAPICredentials: boolean;
        hasBahnAccountCredentials: boolean;
        hasBahnAccountAPICredentials: boolean;
        hasBrowserUserDataDir: boolean;
        credentialsId?: undefined;
    } | {
        configured: boolean;
        credentialsName: string;
        credentialsId: string | undefined;
        hasBahnAPICredentials: boolean;
        hasBahnAccountCredentials: boolean;
        hasBahnAccountAPICredentials: boolean;
        hasBrowserUserDataDir: boolean;
    };
    plan: {
        startUrl: string;
        target: {
            departureStation: string;
            arrivalStation: string;
            serviceDate: string | undefined;
            departureTime: string | undefined;
            trainLabel: string | undefined;
        };
        browser: {
            canUsePersistentProfile: boolean;
            userDataDir: string | undefined;
        };
        accountLogin: {
            loginBeforeSearch: boolean;
            stayLoggedIn: boolean;
        };
        safetyStops: string[];
        currentStop: string;
        maySubmitPayment: boolean;
    };
    browserResult: {
        artifactDir: string;
        artifacts: string[];
        url?: undefined;
        title?: undefined;
        login?: undefined;
        applied?: undefined;
        controls?: undefined;
    };
    research: {
        status: string;
        safety: string;
        purchaseCandidates: {
            name: string;
            status: string;
            notes: string;
        }[];
    };
} | {
    ok: boolean;
    operation: string;
    testing: boolean;
    stage: string;
    purchaseSubmitted: boolean;
    needsUserAction: boolean;
    credentials: {
        configured: boolean;
        credentialsName: undefined;
        hasBahnAPICredentials: boolean;
        hasBahnAccountCredentials: boolean;
        hasBahnAccountAPICredentials: boolean;
        hasBrowserUserDataDir: boolean;
        credentialsId?: undefined;
    } | {
        configured: boolean;
        credentialsName: string;
        credentialsId: string | undefined;
        hasBahnAPICredentials: boolean;
        hasBahnAccountCredentials: boolean;
        hasBahnAccountAPICredentials: boolean;
        hasBrowserUserDataDir: boolean;
    };
    plan: {
        startUrl: string;
        target: {
            departureStation: string;
            arrivalStation: string;
            serviceDate: string | undefined;
            departureTime: string | undefined;
            trainLabel: string | undefined;
        };
        browser: {
            canUsePersistentProfile: boolean;
            userDataDir: string | undefined;
        };
        accountLogin: {
            loginBeforeSearch: boolean;
            stayLoggedIn: boolean;
        };
        safetyStops: string[];
        currentStop: string;
        maySubmitPayment: boolean;
    };
    research: {
        status: string;
        safety: string;
        purchaseCandidates: {
            name: string;
            status: string;
            notes: string;
        }[];
    };
    message?: undefined;
} | {
    ok: boolean;
    operation: string;
    testing: boolean;
    stage: string;
    purchaseSubmitted: boolean;
    needsUserAction: boolean;
    message: string;
    credentials: {
        configured: boolean;
        credentialsName: undefined;
        hasBahnAPICredentials: boolean;
        hasBahnAccountCredentials: boolean;
        hasBahnAccountAPICredentials: boolean;
        hasBrowserUserDataDir: boolean;
        credentialsId?: undefined;
    } | {
        configured: boolean;
        credentialsName: string;
        credentialsId: string | undefined;
        hasBahnAPICredentials: boolean;
        hasBahnAccountCredentials: boolean;
        hasBahnAccountAPICredentials: boolean;
        hasBrowserUserDataDir: boolean;
    };
    research: {
        status: string;
        safety: string;
        purchaseCandidates: {
            name: string;
            status: string;
            notes: string;
        }[];
    };
    plan?: undefined;
}>;
export declare function runTicketCheckoutDryRun(params: TicketCheckoutDryRunParams, config?: DBhopperConfig, signal?: AbortSignal): Promise<{
    ok: boolean;
    operation: string;
    testing: boolean;
    stage: string;
    purchaseSubmitted: boolean;
    finalSafetyStop: string;
    needsUserAction: boolean;
    message: string;
    warnings: PaymentFieldWarning[];
    ticketBuyingMode: DBhopperTicketBuyingMode;
    reviewGate: {
        status: string;
        ticketBuyingMode: DBhopperTicketBuyingMode;
        stage: string;
        finalSafetyStop: string;
        needsUserAction: boolean;
        message: string;
        reviewScreenshot: undefined;
    } | {
        status: string;
        ticketBuyingMode: "review";
        stage: string;
        finalSafetyStop: string;
        needsUserAction: boolean;
        message: string;
        reviewScreenshot: {
            captured: boolean;
            path: string;
            mimeType: string;
            sensitive: boolean;
            purpose: string;
        };
    };
    reviewScreenshot: {
        captured: boolean;
        path: string;
        mimeType: string;
        sensitive: boolean;
        purpose: string;
    } | undefined;
    credentials: {
        configured: boolean;
        credentialsName: undefined;
        hasBahnAPICredentials: boolean;
        hasBahnAccountCredentials: boolean;
        hasBahnAccountAPICredentials: boolean;
        hasBrowserUserDataDir: boolean;
        credentialsId?: undefined;
    } | {
        configured: boolean;
        credentialsName: string;
        credentialsId: string | undefined;
        hasBahnAPICredentials: boolean;
        hasBahnAccountCredentials: boolean;
        hasBahnAccountAPICredentials: boolean;
        hasBrowserUserDataDir: boolean;
    };
    buyingProfile: {
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
    paymentProfile: {
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
        method: import("./types.js").DBhopperPaymentMethod;
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
    plan: {
        startUrl: string;
        target: {
            departureStation: string;
            arrivalStation: string;
            serviceDate: string;
            departureTime: string;
            trainLabel: string | undefined;
        };
        browser: {
            canUsePersistentProfile: boolean;
            userDataDir: string | undefined;
        };
        accountLogin: {
            loginBeforeSearch: boolean;
            stayLoggedIn: boolean;
        };
        fareSelection: {
            defaultFare: DBhopperFareProduct;
            fallbackFares: DBhopperFareProduct[];
            preferenceOrder: DBhopperFareProduct[];
            labels: Record<DBhopperFareProduct, string>;
            travelClass: import("./types.js").DBhopperTravelClass;
            travelClassLabel: string;
            continueToCustomerData: boolean;
            bookingFor: DBhopperBookingFor;
            continueToPaymentBoundary: boolean;
        };
        ticketBuyingMode: DBhopperTicketBuyingMode;
        finalBuying: {
            requested: boolean;
            enabled: boolean;
        };
        safety: {
            mayEnterPaymentProfileData: boolean;
            mayClickPaymentPageContinue: boolean;
            mayReviewCheckPage: boolean;
            maySubmitPayment: boolean;
            mayClickFinalOrder: boolean;
            finalUnsafeButtonPatterns: string[];
        };
        plannedStages: string[];
    };
    browserResult: {
        url: string;
        title: string;
        artifactDir: string;
        artifacts: string[];
        login: import("./db-login.js").DBAccountLoginResult | {
            requested: boolean;
        };
        applied: {
            outboundDateTime: {
                requested: boolean;
                applied: boolean;
                serviceDate?: undefined;
                departureTime?: undefined;
            } | {
                requested: boolean;
                applied: boolean;
                serviceDate: string | undefined;
                departureTime: string | undefined;
            };
        };
        checkout: {
            stage: string;
            finalSafetyStop: string;
            needsUserAction: boolean;
            message: string;
            reviewGate: {
                status: string;
                ticketBuyingMode: DBhopperTicketBuyingMode;
                stage: string;
                finalSafetyStop: string;
                needsUserAction: boolean;
                message: string;
                reviewScreenshot: undefined;
            } | {
                status: string;
                ticketBuyingMode: "review";
                stage: string;
                finalSafetyStop: string;
                needsUserAction: boolean;
                message: string;
                reviewScreenshot: {
                    captured: boolean;
                    path: string;
                    mimeType: string;
                    sensitive: boolean;
                    purpose: string;
                };
            };
            steps: ({
                stage: string;
                action: string;
                requestedTrainLabel: string | undefined;
                selectedIndex: number;
                trainLabels: string[];
                price: string | undefined;
            } | {
                stage: string;
                action: string;
                requestedDefaultFare: string | undefined;
                selectedFare: DBhopperFareProduct;
                selectedFareLabel: string | undefined;
                fallbackUsed: boolean;
                travelClass: string | undefined;
                travelClassLabel: string | undefined;
                selectedIndex: number;
                price: string | undefined;
            } | {
                stage: string;
                action: string;
                clickedText: string | undefined;
            } | {
                stage: string;
                action: string;
                method: import("./types.js").DBhopperPaymentMethod | undefined;
                methodAction: string | undefined;
                filledFields: string[];
                matchedFields: string[];
                mismatchedFields: string[];
                missingFields: string[];
                warnings: PaymentFieldWarning[] | undefined;
                artifactCaptureSkipped: boolean;
            })[];
            boundary: {
                stage: string;
                paymentBoundaryVisible: boolean;
                finalOrderButtonVisible: boolean;
                finalOrderButtonText: string | undefined;
            };
            selectedJourney: JourneySelectionResult;
            selectedFare: FareSelectionResult;
            offerContinue: CheckoutStepResult | undefined;
            customerDataContinue: CustomerDataContinueResult | undefined;
            paymentFill: PaymentFillSummary | undefined;
            paymentContinue: CheckoutStepResult | undefined;
        };
        controls: {
            text: string;
            tag: string;
            id: string | undefined;
            name: string | undefined;
            type: string | undefined;
            visible: boolean;
        }[] | undefined;
        reviewPauseMs: number;
        reviewScreenshot: {
            captured: boolean;
            path: string;
            mimeType: string;
            sensitive: boolean;
            purpose: string;
        } | undefined;
    };
    research: {
        status: string;
        safety: string;
        purchaseCandidates: {
            name: string;
            status: string;
            notes: string;
        }[];
    };
} | {
    ok: boolean;
    operation: string;
    testing: boolean;
    stage: string;
    purchaseSubmitted: boolean;
    finalSafetyStop: string;
    needsUserAction: boolean;
    message: string;
    credentials: {
        configured: boolean;
        credentialsName: undefined;
        hasBahnAPICredentials: boolean;
        hasBahnAccountCredentials: boolean;
        hasBahnAccountAPICredentials: boolean;
        hasBrowserUserDataDir: boolean;
        credentialsId?: undefined;
    } | {
        configured: boolean;
        credentialsName: string;
        credentialsId: string | undefined;
        hasBahnAPICredentials: boolean;
        hasBahnAccountCredentials: boolean;
        hasBahnAccountAPICredentials: boolean;
        hasBrowserUserDataDir: boolean;
    };
    buyingProfile: {
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
    paymentProfile: {
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
        method: import("./types.js").DBhopperPaymentMethod;
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
    plan: {
        startUrl: string;
        target: {
            departureStation: string;
            arrivalStation: string;
            serviceDate: string;
            departureTime: string;
            trainLabel: string | undefined;
        };
        browser: {
            canUsePersistentProfile: boolean;
            userDataDir: string | undefined;
        };
        accountLogin: {
            loginBeforeSearch: boolean;
            stayLoggedIn: boolean;
        };
        fareSelection: {
            defaultFare: DBhopperFareProduct;
            fallbackFares: DBhopperFareProduct[];
            preferenceOrder: DBhopperFareProduct[];
            labels: Record<DBhopperFareProduct, string>;
            travelClass: import("./types.js").DBhopperTravelClass;
            travelClassLabel: string;
            continueToCustomerData: boolean;
            bookingFor: DBhopperBookingFor;
            continueToPaymentBoundary: boolean;
        };
        ticketBuyingMode: DBhopperTicketBuyingMode;
        finalBuying: {
            requested: boolean;
            enabled: boolean;
        };
        safety: {
            mayEnterPaymentProfileData: boolean;
            mayClickPaymentPageContinue: boolean;
            mayReviewCheckPage: boolean;
            maySubmitPayment: boolean;
            mayClickFinalOrder: boolean;
            finalUnsafeButtonPatterns: string[];
        };
        plannedStages: string[];
    };
    browserResult: {
        artifactDir: string;
        artifacts: string[];
        url?: undefined;
        title?: undefined;
        login?: undefined;
        applied?: undefined;
        checkout?: undefined;
        controls?: undefined;
        reviewPauseMs?: undefined;
        reviewScreenshot?: undefined;
    };
    research: {
        status: string;
        safety: string;
        purchaseCandidates: {
            name: string;
            status: string;
            notes: string;
        }[];
    };
    warnings?: undefined;
    ticketBuyingMode?: undefined;
    reviewGate?: undefined;
    reviewScreenshot?: undefined;
} | {
    ok: boolean;
    operation: string;
    testing: boolean;
    stage: string;
    purchaseSubmitted: boolean;
    finalSafetyStop: string;
    needsUserAction: boolean;
    credentials: {
        configured: boolean;
        credentialsName: undefined;
        hasBahnAPICredentials: boolean;
        hasBahnAccountCredentials: boolean;
        hasBahnAccountAPICredentials: boolean;
        hasBrowserUserDataDir: boolean;
        credentialsId?: undefined;
    } | {
        configured: boolean;
        credentialsName: string;
        credentialsId: string | undefined;
        hasBahnAPICredentials: boolean;
        hasBahnAccountCredentials: boolean;
        hasBahnAccountAPICredentials: boolean;
        hasBrowserUserDataDir: boolean;
    };
    buyingProfile: {
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
    paymentProfile: {
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
        method: import("./types.js").DBhopperPaymentMethod;
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
    ticketBuyingMode: DBhopperTicketBuyingMode;
    plan: {
        startUrl: string;
        target: {
            departureStation: string;
            arrivalStation: string;
            serviceDate: string;
            departureTime: string;
            trainLabel: string | undefined;
        };
        browser: {
            canUsePersistentProfile: boolean;
            userDataDir: string | undefined;
        };
        accountLogin: {
            loginBeforeSearch: boolean;
            stayLoggedIn: boolean;
        };
        fareSelection: {
            defaultFare: DBhopperFareProduct;
            fallbackFares: DBhopperFareProduct[];
            preferenceOrder: DBhopperFareProduct[];
            labels: Record<DBhopperFareProduct, string>;
            travelClass: import("./types.js").DBhopperTravelClass;
            travelClassLabel: string;
            continueToCustomerData: boolean;
            bookingFor: DBhopperBookingFor;
            continueToPaymentBoundary: boolean;
        };
        ticketBuyingMode: DBhopperTicketBuyingMode;
        finalBuying: {
            requested: boolean;
            enabled: boolean;
        };
        safety: {
            mayEnterPaymentProfileData: boolean;
            mayClickPaymentPageContinue: boolean;
            mayReviewCheckPage: boolean;
            maySubmitPayment: boolean;
            mayClickFinalOrder: boolean;
            finalUnsafeButtonPatterns: string[];
        };
        plannedStages: string[];
    };
    research: {
        status: string;
        safety: string;
        purchaseCandidates: {
            name: string;
            status: string;
            notes: string;
        }[];
    };
    message?: undefined;
} | {
    ok: boolean;
    operation: string;
    testing: boolean;
    stage: string;
    purchaseSubmitted: boolean;
    finalSafetyStop: string;
    needsUserAction: boolean;
    message: string;
    credentials: {
        configured: boolean;
        credentialsName: undefined;
        hasBahnAPICredentials: boolean;
        hasBahnAccountCredentials: boolean;
        hasBahnAccountAPICredentials: boolean;
        hasBrowserUserDataDir: boolean;
        credentialsId?: undefined;
    } | {
        configured: boolean;
        credentialsName: string;
        credentialsId: string | undefined;
        hasBahnAPICredentials: boolean;
        hasBahnAccountCredentials: boolean;
        hasBahnAccountAPICredentials: boolean;
        hasBrowserUserDataDir: boolean;
    };
    buyingProfile: {
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
    paymentProfile: {
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
        method: import("./types.js").DBhopperPaymentMethod;
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
    ticketBuyingMode: DBhopperTicketBuyingMode;
    research: {
        status: string;
        safety: string;
        purchaseCandidates: {
            name: string;
            status: string;
            notes: string;
        }[];
    };
    plan?: undefined;
}>;
export declare function ticketBuyingPlan(params: TicketBuyingDryRunParams, userDataDir?: string): {
    startUrl: string;
    target: {
        departureStation: string;
        arrivalStation: string;
        serviceDate: string | undefined;
        departureTime: string | undefined;
        trainLabel: string | undefined;
    };
    browser: {
        canUsePersistentProfile: boolean;
        userDataDir: string | undefined;
    };
    accountLogin: {
        loginBeforeSearch: boolean;
        stayLoggedIn: boolean;
    };
    safetyStops: string[];
    currentStop: string;
    maySubmitPayment: boolean;
};
export declare function ticketCheckoutPlan(params: TicketCheckoutDryRunParams, userDataDir?: string, now?: Date, farePreference?: BuyingFarePreference, ticketBuyingMode?: DBhopperTicketBuyingMode): {
    startUrl: string;
    target: {
        departureStation: string;
        arrivalStation: string;
        serviceDate: string;
        departureTime: string;
        trainLabel: string | undefined;
    };
    browser: {
        canUsePersistentProfile: boolean;
        userDataDir: string | undefined;
    };
    accountLogin: {
        loginBeforeSearch: boolean;
        stayLoggedIn: boolean;
    };
    fareSelection: {
        defaultFare: DBhopperFareProduct;
        fallbackFares: DBhopperFareProduct[];
        preferenceOrder: DBhopperFareProduct[];
        labels: Record<DBhopperFareProduct, string>;
        travelClass: import("./types.js").DBhopperTravelClass;
        travelClassLabel: string;
        continueToCustomerData: boolean;
        bookingFor: DBhopperBookingFor;
        continueToPaymentBoundary: boolean;
    };
    ticketBuyingMode: DBhopperTicketBuyingMode;
    finalBuying: {
        requested: boolean;
        enabled: boolean;
    };
    safety: {
        mayEnterPaymentProfileData: boolean;
        mayClickPaymentPageContinue: boolean;
        mayReviewCheckPage: boolean;
        maySubmitPayment: boolean;
        mayClickFinalOrder: boolean;
        finalUnsafeButtonPatterns: string[];
    };
    plannedStages: string[];
};
interface PaymentFieldWarning {
    code: "db_account_identity_mismatch";
    field: string;
    message: string;
}
type CheckoutBoundary = Awaited<ReturnType<typeof detectCheckoutBoundary>>;
interface JourneySelectionResult {
    requestedTrainLabel?: string;
    selectedIndex: number;
    trainLabels: string[];
    price?: string;
    summary: string;
    alreadySelected?: boolean;
}
interface FareSelectionResult {
    requestedDefaultFare?: string;
    selectedFare: DBhopperFareProduct;
    selectedFareLabel?: string;
    fallbackUsed?: boolean;
    travelClass?: string;
    travelClassLabel?: string;
    selectedIndex: number;
    price?: string;
    alreadySelected?: boolean;
}
interface CheckoutStepResult {
    stage: string;
    action: string;
    clickedText?: string;
}
interface CustomerDataContinueResult extends CheckoutStepResult {
    bookingFor: DBhopperBookingFor;
    bookingForAction?: string;
    boundaryBefore: CheckoutBoundary;
    boundaryAfter: CheckoutBoundary;
}
interface PaymentFillSummary {
    stage: string;
    action: string;
    method?: DBhopperPaymentProfile["method"];
    methodAction?: string;
    filledFields: string[];
    matchedFields: string[];
    mismatchedFields: string[];
    missingFields: string[];
    artifactCaptureSkipped: boolean;
    warnings?: PaymentFieldWarning[];
}
declare function detectCheckoutBoundary(page: Page): Promise<{
    stage: string;
    paymentBoundaryVisible: boolean;
    finalOrderButtonVisible: boolean;
    finalOrderButtonText: string | undefined;
}>;
export declare function isFinalOrderText(value: string): boolean;
export declare function defaultCheckoutServiceDate(now?: Date): string;
export {};

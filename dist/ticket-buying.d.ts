import type { DBhopperConfig } from "./types.js";
export declare const TICKET_BUYING_TOOL_NAMES: readonly ["dbhopper_ticket_buying_research", "dbhopper_ticket_buying_dry_run", "dbhopper_ticket_checkout_dry_run"];
export interface TicketBuyingDryRunParams {
    credentials_profile?: string;
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
}
export interface TicketCheckoutDryRunParams {
    credentials_profile?: string;
    departure_station?: string;
    arrival_station?: string;
    service_date?: string;
    departure_time?: string;
    login_before_search?: boolean;
    stay_logged_in?: boolean;
    open_browser?: boolean;
    headless?: boolean;
    include_controls?: boolean;
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
        hasDbApiCredentials: boolean;
        hasDbApiAccountCredentials: boolean;
        hasBahnAccountCredentials: boolean;
        hasBrowserUserDataDir: boolean;
        credentialsId?: undefined;
    } | {
        configured: boolean;
        credentialsName: string;
        credentialsId: string | undefined;
        hasDbApiCredentials: boolean;
        hasDbApiAccountCredentials: boolean;
        hasBahnAccountCredentials: boolean;
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
        hasDbApiCredentials: boolean;
        hasDbApiAccountCredentials: boolean;
        hasBahnAccountCredentials: boolean;
        hasBrowserUserDataDir: boolean;
        credentialsId?: undefined;
    } | {
        configured: boolean;
        credentialsName: string;
        credentialsId: string | undefined;
        hasDbApiCredentials: boolean;
        hasDbApiAccountCredentials: boolean;
        hasBahnAccountCredentials: boolean;
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
        hasDbApiCredentials: boolean;
        hasDbApiAccountCredentials: boolean;
        hasBahnAccountCredentials: boolean;
        hasBrowserUserDataDir: boolean;
        credentialsId?: undefined;
    } | {
        configured: boolean;
        credentialsName: string;
        credentialsId: string | undefined;
        hasDbApiCredentials: boolean;
        hasDbApiAccountCredentials: boolean;
        hasBahnAccountCredentials: boolean;
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
        hasDbApiCredentials: boolean;
        hasDbApiAccountCredentials: boolean;
        hasBahnAccountCredentials: boolean;
        hasBrowserUserDataDir: boolean;
        credentialsId?: undefined;
    } | {
        configured: boolean;
        credentialsName: string;
        credentialsId: string | undefined;
        hasDbApiCredentials: boolean;
        hasDbApiAccountCredentials: boolean;
        hasBahnAccountCredentials: boolean;
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
    credentials: {
        configured: boolean;
        credentialsName: undefined;
        hasDbApiCredentials: boolean;
        hasDbApiAccountCredentials: boolean;
        hasBahnAccountCredentials: boolean;
        hasBrowserUserDataDir: boolean;
        credentialsId?: undefined;
    } | {
        configured: boolean;
        credentialsName: string;
        credentialsId: string | undefined;
        hasDbApiCredentials: boolean;
        hasDbApiAccountCredentials: boolean;
        hasBahnAccountCredentials: boolean;
        hasBrowserUserDataDir: boolean;
    };
    plan: {
        startUrl: string;
        target: {
            departureStation: string;
            arrivalStation: string;
            serviceDate: string;
            departureTime: string;
        };
        browser: {
            canUsePersistentProfile: boolean;
            userDataDir: string | undefined;
        };
        accountLogin: {
            loginBeforeSearch: boolean;
            stayLoggedIn: boolean;
        };
        safety: {
            mayEnterPaymentData: boolean;
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
            steps: {
                stage: string;
                action: string;
                clickedText?: string;
                boundary?: string;
            }[];
            boundary: {
                stage: string;
                paymentBoundaryVisible: boolean;
                finalOrderButtonVisible: boolean;
                finalOrderButtonText: string | undefined;
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
    finalSafetyStop: string;
    needsUserAction: boolean;
    message: string;
    credentials: {
        configured: boolean;
        credentialsName: undefined;
        hasDbApiCredentials: boolean;
        hasDbApiAccountCredentials: boolean;
        hasBahnAccountCredentials: boolean;
        hasBrowserUserDataDir: boolean;
        credentialsId?: undefined;
    } | {
        configured: boolean;
        credentialsName: string;
        credentialsId: string | undefined;
        hasDbApiCredentials: boolean;
        hasDbApiAccountCredentials: boolean;
        hasBahnAccountCredentials: boolean;
        hasBrowserUserDataDir: boolean;
    };
    plan: {
        startUrl: string;
        target: {
            departureStation: string;
            arrivalStation: string;
            serviceDate: string;
            departureTime: string;
        };
        browser: {
            canUsePersistentProfile: boolean;
            userDataDir: string | undefined;
        };
        accountLogin: {
            loginBeforeSearch: boolean;
            stayLoggedIn: boolean;
        };
        safety: {
            mayEnterPaymentData: boolean;
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
    credentials: {
        configured: boolean;
        credentialsName: undefined;
        hasDbApiCredentials: boolean;
        hasDbApiAccountCredentials: boolean;
        hasBahnAccountCredentials: boolean;
        hasBrowserUserDataDir: boolean;
        credentialsId?: undefined;
    } | {
        configured: boolean;
        credentialsName: string;
        credentialsId: string | undefined;
        hasDbApiCredentials: boolean;
        hasDbApiAccountCredentials: boolean;
        hasBahnAccountCredentials: boolean;
        hasBrowserUserDataDir: boolean;
    };
    plan: {
        startUrl: string;
        target: {
            departureStation: string;
            arrivalStation: string;
            serviceDate: string;
            departureTime: string;
        };
        browser: {
            canUsePersistentProfile: boolean;
            userDataDir: string | undefined;
        };
        accountLogin: {
            loginBeforeSearch: boolean;
            stayLoggedIn: boolean;
        };
        safety: {
            mayEnterPaymentData: boolean;
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
        hasDbApiCredentials: boolean;
        hasDbApiAccountCredentials: boolean;
        hasBahnAccountCredentials: boolean;
        hasBrowserUserDataDir: boolean;
        credentialsId?: undefined;
    } | {
        configured: boolean;
        credentialsName: string;
        credentialsId: string | undefined;
        hasDbApiCredentials: boolean;
        hasDbApiAccountCredentials: boolean;
        hasBahnAccountCredentials: boolean;
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
export declare function ticketCheckoutPlan(params: TicketCheckoutDryRunParams, userDataDir?: string, now?: Date): {
    startUrl: string;
    target: {
        departureStation: string;
        arrivalStation: string;
        serviceDate: string;
        departureTime: string;
    };
    browser: {
        canUsePersistentProfile: boolean;
        userDataDir: string | undefined;
    };
    accountLogin: {
        loginBeforeSearch: boolean;
        stayLoggedIn: boolean;
    };
    safety: {
        mayEnterPaymentData: boolean;
        maySubmitPayment: boolean;
        mayClickFinalOrder: boolean;
        finalUnsafeButtonPatterns: string[];
    };
    plannedStages: string[];
};
export declare function isFinalOrderText(value: string): boolean;
export declare function defaultCheckoutServiceDate(now?: Date): string;

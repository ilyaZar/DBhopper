import fs from "node:fs/promises";
import path from "node:path";
import { Type } from "typebox";
import { createTimestampedArtifactDir, safeArtifactSegment, } from "./artifacts.js";
import { launchBrowser, resolveBrowserExecutablePath } from "./browser.js";
import { credentialsSummary, readSelectedCredentialsProfile, } from "./credentials.js";
import { buyingProfileSummary, fareProductLabel, readSelectedBuyingProfile, resolveBuyingFarePreference, travelClassLabel, } from "./buying-profile.js";
import { formatPaymentBirthdateForDbUi, paymentProfileSummary, readSelectedPaymentProfile, } from "./payment-profile.js";
import { compactUiText, normalizeCardNumber, normalizeCountry, normalizeIban, normalizeOption, normalizeUiDateComparable, normalizeUiText, } from "./normalization.js";
import { errorMessage } from "./errors.js";
import { configuredPurchaseArtifactsDir, readPrivateSettings, } from "./private-settings.js";
import { resolveCredentialUserDataDir } from "./access-browser.js";
import { performDbAccountLogin } from "./db-login.js";
import { TICKET_BUYING_DRY_RUN_TOOL_NAME, TICKET_BUYING_RESEARCH_TOOL_NAME, TICKET_CHECKOUT_DRY_RUN_TOOL_NAME, } from "./tool-contracts.js";
import { resolveWorkspace } from "./workspace.js";
import { fillSensitiveTextControl } from "./sensitive-input.js";
const DB_HOME_URL = "https://int.bahn.de/en";
const DEFAULT_BROWSER_TIMEOUT_MS = 60000;
const DEFAULT_CHECKOUT_DEPARTURE = "Hamm(Westf)Hbf";
const DEFAULT_CHECKOUT_ARRIVAL = "Köln Hbf";
const DEFAULT_CHECKOUT_TIME = "10:00";
const STATION_ALIASES = new Map([
    ["cologne hbf", "Köln Hbf"],
    ["koeln hbf", "Köln Hbf"],
    ["koln hbf", "Köln Hbf"],
    ["hamm westf hbf", "Hamm(Westf)Hbf"],
    ["hamm westf. hbf", "Hamm(Westf)Hbf"],
    ["hamm (westf) hbf", "Hamm(Westf)Hbf"],
]);
const FINAL_ORDER_PATTERNS = [
    /zahlungspflichtig/i,
    /jetzt\s+kaufen/i,
    /buy\s+now/i,
    /purchase/i,
    /place\s+order/i,
    /kostenpflichtig/i,
    /pay\s+now/i,
];
const SAFE_CHECKOUT_NEXT_PATTERNS = [
    /show\s+fastest\s+connections/i,
    /show\s+offers/i,
    /offer\s+selection/i,
    /select\s+offer/i,
    /^select$/i,
    /^book$/i,
    /continue/i,
    /^next$/i,
    /weiter/i,
    /zur\s+buchung/i,
    /angebot\s+auswählen/i,
    /^auswählen$/i,
    /^buchen$/i,
];
export const TICKET_BUYING_RESEARCH_SUMMARY = {
    status: "wip",
    safety: "DBhopper may drive DB checkout to the final Check page. It never clicks legally binding final order controls; review mode returns a screenshot artifact, and auto mode is not purchase-enabled yet.",
    purchaseCandidates: [
        {
            name: "bahn.de/int.bahn.de browser flow",
            status: "best initial path",
            notes: "Official consumer path. Works with or without DB account; automation must stop before any legally binding final order control.",
        },
        {
            name: "DB Navigator app",
            status: "manual or device-driven future path",
            notes: "Official app can book tickets shortly before departure, but app automation needs a real device/emulator and stronger safety gates.",
        },
        {
            name: "DB partner/PST interface",
            status: "partner-only research candidate",
            notes: "Public evidence indicates a partner booking interface exists, but it is not a self-service public DB API Marketplace product.",
        },
        {
            name: "bahn web JSON endpoints",
            status: "search/offers only",
            notes: "Useful for route and offer reconnaissance. Do not use private website APIs to finalize purchases without documented terms.",
        },
    ],
};
export function createTicketBuyingToolDefinitions(tool) {
    return [
        tool({
            name: TICKET_BUYING_RESEARCH_TOOL_NAME,
            label: "DBhopper Ticket Buying Research",
            description: "Return WIP ticket-buying interface candidates and safety constraints.",
            optional: true,
            parameters: Type.Object({}, { additionalProperties: false }),
            execute: () => ({
                ok: true,
                operation: "ticket_buying_research",
                research: TICKET_BUYING_RESEARCH_SUMMARY,
            }),
        }),
        tool({
            name: TICKET_BUYING_DRY_RUN_TOOL_NAME,
            label: "DBhopper Ticket Buying Dry Run",
            description: [
                "Test DB ticket-buying navigation for a replacement train.",
                "This is dry-run only and never submits payment.",
            ].join(" "),
            optional: true,
            parameters: Type.Object({
                departure_station: Type.String(),
                arrival_station: Type.String(),
                service_date: Type.Optional(Type.String()),
                departure_time: Type.Optional(Type.String()),
                train_label: Type.Optional(Type.String()),
                open_browser: Type.Optional(Type.Boolean({
                    default: false,
                    description: "When true, open int.bahn.de and stop after search/results.",
                })),
                login_before_search: Type.Optional(Type.Boolean({
                    default: false,
                    description: "When true, log into the configured Bahn account before searching.",
                })),
                stay_logged_in: Type.Optional(Type.Boolean({
                    default: true,
                    description: "When logging in, check the stay-logged-in box if DB exposes it.",
                })),
                headless: Type.Optional(Type.Boolean()),
                include_controls: Type.Optional(Type.Boolean()),
                review_pause_ms: Type.Optional(Type.Number({
                    description: "Optional Abnahme/review pause before closing the browser, in milliseconds.",
                })),
                test_drive_purchase: Type.Optional(Type.Boolean({
                    default: false,
                    description: [
                        "When true, save numbered per-stage ticket-purchase text",
                        "and screenshot artifacts under the ignored tmp/",
                        "test-drive directory.",
                    ].join(" "),
                })),
            }, { additionalProperties: false }),
            execute: async (params, config, context) => runTicketBuyingDryRun(params, config, context.signal),
        }),
        tool({
            name: TICKET_CHECKOUT_DRY_RUN_TOOL_NAME,
            label: "DBhopper Ticket Checkout Dry Run",
            description: [
                "Explore DB ticket checkout as far as safely possible.",
                "Never submits payment or clicks a legally binding order button.",
            ].join(" "),
            optional: true,
            parameters: Type.Object({
                departure_station: Type.Optional(Type.String({
                    default: DEFAULT_CHECKOUT_DEPARTURE,
                })),
                arrival_station: Type.Optional(Type.String({
                    default: DEFAULT_CHECKOUT_ARRIVAL,
                })),
                service_date: Type.Optional(Type.String({
                    description: "YYYY-MM-DD. Defaults to about one week after the run date.",
                })),
                departure_time: Type.Optional(Type.String({
                    default: DEFAULT_CHECKOUT_TIME,
                })),
                train_label: Type.Optional(Type.String({
                    description: "Preferred train label to select from the outbound journey list.",
                })),
                login_before_search: Type.Optional(Type.Boolean({ default: true })),
                stay_logged_in: Type.Optional(Type.Boolean({ default: true })),
                open_browser: Type.Optional(Type.Boolean({
                    default: false,
                    description: "When false, return a deterministic plan without opening a browser.",
                })),
                headless: Type.Optional(Type.Boolean()),
                include_controls: Type.Optional(Type.Boolean()),
                review_pause_ms: Type.Optional(Type.Number({
                    description: "Optional Abnahme/review pause before closing the browser, in milliseconds.",
                })),
                continue_after_payment_profile: Type.Optional(Type.Boolean({
                    default: true,
                    description: [
                        "When true, click the payment-page Continue button after",
                        "payment-profile fields are handled, then stop on the Check",
                        "page before any final order button.",
                    ].join(" "),
                })),
                test_drive_purchase: Type.Optional(Type.Boolean({
                    default: false,
                    description: [
                        "When true, save numbered per-stage ticket-purchase text",
                        "and screenshot artifacts under the ignored tmp/",
                        "test-drive directory.",
                    ].join(" "),
                })),
            }, { additionalProperties: false }),
            execute: async (params, config, context) => runTicketCheckoutDryRun(params, config, context.signal),
        }),
    ];
}
export async function runTicketBuyingDryRun(params, config = {}, signal) {
    let loadedCredentials = undefined;
    let stage = "credentials";
    try {
        loadedCredentials = await readCredentialsForTicketDryRun(params, config);
        stage = "plan";
        const plan = ticketBuyingPlan(params, loadedCredentials?.credentials.browser?.userDataDir);
        if (params.open_browser !== true) {
            return {
                ok: true,
                operation: "ticket_buying_dry_run",
                testing: true,
                stage: "planned",
                purchaseSubmitted: false,
                needsUserAction: false,
                credentials: credentialsSummary(loadedCredentials),
                plan,
                research: TICKET_BUYING_RESEARCH_SUMMARY,
            };
        }
        return runBrowserTicketSearch(params, config, plan, loadedCredentials, signal);
    }
    catch (error) {
        return {
            ok: false,
            operation: "ticket_buying_dry_run",
            testing: true,
            stage,
            purchaseSubmitted: false,
            needsUserAction: true,
            message: errorMessage(error),
            credentials: credentialsSummary(loadedCredentials),
            research: TICKET_BUYING_RESEARCH_SUMMARY,
        };
    }
}
export async function runTicketCheckoutDryRun(params, config = {}, signal) {
    let loadedCredentials = undefined;
    let loadedBuyingProfile = undefined;
    let loadedPaymentProfile = undefined;
    let purchaseMode = "review";
    let stage = "credentials";
    try {
        loadedCredentials = await readCredentialsForTicketDryRun(params, config);
        purchaseMode = (await readPrivateSettings(config)).settings.PURCHASE_MODE;
        loadedBuyingProfile = await readBuyingProfileForTicketCheckout(params, config);
        loadedPaymentProfile = await readPaymentProfileForTicketCheckout(params, config);
        stage = "plan";
        const plan = ticketCheckoutPlan(params, loadedCredentials?.credentials.browser?.userDataDir, undefined, resolveBuyingFarePreference(loadedBuyingProfile?.buyingProfile), purchaseMode);
        if (params.open_browser !== true) {
            return {
                ok: true,
                operation: "ticket_checkout_dry_run",
                testing: true,
                stage: "planned",
                purchaseSubmitted: false,
                finalSafetyStop: "not_started",
                needsUserAction: false,
                credentials: credentialsSummary(loadedCredentials),
                buyingProfile: buyingProfileSummary(loadedBuyingProfile),
                paymentProfile: paymentProfileSummary(loadedPaymentProfile),
                purchaseMode,
                plan,
                research: TICKET_BUYING_RESEARCH_SUMMARY,
            };
        }
        return runBrowserTicketCheckout(params, config, plan, loadedCredentials, loadedBuyingProfile, loadedPaymentProfile, purchaseMode, signal);
    }
    catch (error) {
        return {
            ok: false,
            operation: "ticket_checkout_dry_run",
            testing: true,
            stage,
            purchaseSubmitted: false,
            finalSafetyStop: "blocked",
            needsUserAction: true,
            message: errorMessage(error),
            credentials: credentialsSummary(loadedCredentials),
            buyingProfile: buyingProfileSummary(loadedBuyingProfile),
            paymentProfile: paymentProfileSummary(loadedPaymentProfile),
            purchaseMode,
            research: TICKET_BUYING_RESEARCH_SUMMARY,
        };
    }
}
async function readProfileWhenBrowserOpens(params, config, readProfile) {
    if (params.open_browser !== true) {
        return undefined;
    }
    return readProfile(config);
}
async function readCredentialsForTicketDryRun(params, config) {
    return readProfileWhenBrowserOpens(params, config, readSelectedCredentialsProfile);
}
async function readBuyingProfileForTicketCheckout(params, config) {
    return readProfileWhenBrowserOpens(params, config, readSelectedBuyingProfile);
}
async function readPaymentProfileForTicketCheckout(params, config) {
    return readProfileWhenBrowserOpens(params, config, readSelectedPaymentProfile);
}
export function ticketBuyingPlan(params, userDataDir) {
    const departure = normalizeBookingStationName(requiredString(params.departure_station, "departure_station"));
    const arrival = normalizeBookingStationName(requiredString(params.arrival_station, "arrival_station"));
    return {
        startUrl: DB_HOME_URL,
        target: {
            departureStation: departure,
            arrivalStation: arrival,
            serviceDate: params.service_date,
            departureTime: params.departure_time,
            trainLabel: params.train_label,
        },
        browser: {
            canUsePersistentProfile: Boolean(userDataDir),
            userDataDir,
        },
        accountLogin: {
            loginBeforeSearch: params.login_before_search === true,
            stayLoggedIn: params.stay_logged_in !== false,
        },
        safetyStops: [
            "account_login",
            "search_results",
            "offer_selection",
            "customer_data",
            "payment",
        ],
        currentStop: "search_results",
        maySubmitPayment: false,
    };
}
export function ticketCheckoutPlan(params, userDataDir, now = new Date(), farePreference = resolveBuyingFarePreference(), purchaseMode = "review") {
    const serviceDate = params.service_date || defaultCheckoutServiceDate(now);
    const departure = normalizeBookingStationName(params.departure_station?.trim() || DEFAULT_CHECKOUT_DEPARTURE);
    const arrival = normalizeBookingStationName(params.arrival_station?.trim() || DEFAULT_CHECKOUT_ARRIVAL);
    const departureTime = params.departure_time?.trim() || DEFAULT_CHECKOUT_TIME;
    const trainLabel = params.train_label?.trim() || undefined;
    const fareSelection = ticketFareSelectionPlan(farePreference);
    return {
        startUrl: DB_HOME_URL,
        target: {
            departureStation: departure,
            arrivalStation: arrival,
            serviceDate,
            departureTime,
            trainLabel,
        },
        browser: {
            canUsePersistentProfile: Boolean(userDataDir),
            userDataDir,
        },
        accountLogin: {
            loginBeforeSearch: params.login_before_search !== false,
            stayLoggedIn: params.stay_logged_in !== false,
        },
        fareSelection,
        purchaseMode,
        finalBuying: {
            requested: purchaseMode === "auto",
            enabled: false,
        },
        safety: {
            mayEnterPaymentProfileData: true,
            mayClickPaymentPageContinue: params.continue_after_payment_profile !== false,
            mayReviewCheckPage: params.continue_after_payment_profile !== false,
            maySubmitPayment: false,
            mayClickFinalOrder: false,
            finalUnsafeButtonPatterns: FINAL_ORDER_PATTERNS.map((pattern) => pattern.source),
        },
        plannedStages: [
            "account_login",
            "search_results",
            "offer_selection",
            "fare_selected",
            "customer_data",
            "payment_boundary",
            "check_page_review",
            "final_order_boundary",
        ],
    };
}
function ticketFareSelectionPlan(farePreference) {
    return {
        defaultFare: farePreference.defaultFare,
        fallbackFares: farePreference.fallbackFares,
        preferenceOrder: farePreference.preferenceOrder,
        labels: Object.fromEntries(farePreference.preferenceOrder.map((fare) => [fare, fareProductLabel(fare)])),
        travelClass: farePreference.travelClass,
        travelClassLabel: travelClassLabel(farePreference.travelClass),
        continueToCustomerData: farePreference.continueToCustomerData,
        bookingFor: farePreference.bookingFor,
        continueToPaymentBoundary: farePreference.continueToPaymentBoundary,
    };
}
async function runBrowserTicketSearch(params, config, plan, loadedCredentials, signal) {
    const artifactCapture = createTicketArtifactCapture(params);
    let browser;
    let context;
    let page;
    let stage = "open_home";
    try {
        const browserSession = await openTicketBrowserSession(params, config, loadedCredentials);
        browser = browserSession.browser;
        context = browserSession.context;
        page = browserSession.page;
        page.setDefaultTimeout(DEFAULT_BROWSER_TIMEOUT_MS);
        page.setDefaultNavigationTimeout(DEFAULT_BROWSER_TIMEOUT_MS);
        if (signal?.aborted) {
            throw new Error("ticket buying dry run was aborted");
        }
        await page.goto(DB_HOME_URL, { waitUntil: "domcontentloaded" });
        await page.waitForTimeout(3000);
        await captureTicketStage(page, config, artifactCapture, "home");
        const login = params.login_before_search === true
            ? await performDbAccountLogin(page, loadedCredentials?.credentials.bahnAccount ?? {}, {
                stayLoggedIn: params.stay_logged_in !== false,
                requireCredentialEntry: false,
            })
            : { requested: false };
        if (params.login_before_search === true) {
            await captureTicketStage(page, config, artifactCapture, "login");
        }
        stage = "search_form";
        await fillStation(page, 'input[name="quickFinderBasic-von"]', plan.target.departureStation);
        await fillStation(page, 'input[name="quickFinderBasic-nach"]', plan.target.arrivalStation);
        const applied = {
            outboundDateTime: await applyOutboundDateTime(page, params),
        };
        await captureTicketStage(page, config, artifactCapture, "search-form");
        stage = "search_results";
        await page.getByRole("button", { name: /^Search$/i }).first().click();
        await page.waitForTimeout(8000);
        await captureTicketStage(page, config, artifactCapture, "search-results");
        const controls = params.include_controls === true ? await visibleTicketControls(page) : undefined;
        return {
            ok: true,
            operation: "ticket_buying_dry_run",
            testing: true,
            stage,
            purchaseSubmitted: false,
            needsUserAction: false,
            message: "opened DB booking flow and stopped at search/results; no ticket was bought",
            credentials: credentialsSummary(loadedCredentials),
            plan,
            browserResult: {
                url: page.url(),
                title: await page.title(),
                artifactDir: artifactCapture.artifactDir,
                artifacts: artifactCapture.artifacts,
                testDrivePurchase: artifactCapture.testDrivePurchase,
                login,
                applied,
                controls,
            },
            research: TICKET_BUYING_RESEARCH_SUMMARY,
        };
    }
    catch (error) {
        if (page) {
            try {
                await captureTicketStage(page, config, artifactCapture, `blocked-${stage}`);
            }
            catch {
                // Keep the original browser failure.
            }
        }
        return {
            ok: false,
            operation: "ticket_buying_dry_run",
            testing: true,
            stage,
            purchaseSubmitted: false,
            needsUserAction: true,
            message: errorMessage(error),
            credentials: credentialsSummary(loadedCredentials),
            plan,
            browserResult: {
                ...ticketArtifactResult(artifactCapture),
            },
            research: TICKET_BUYING_RESEARCH_SUMMARY,
        };
    }
    finally {
        await context?.close();
        await browser?.close();
    }
}
async function runBrowserTicketCheckout(params, config, plan, loadedCredentials, loadedBuyingProfile, loadedPaymentProfile, purchaseMode, signal) {
    const artifactCapture = createTicketArtifactCapture(params);
    let browser;
    let context;
    let page;
    let stage = "open_home";
    let paymentProfileTouched = false;
    try {
        const browserSession = await openTicketBrowserSession({
            departure_station: plan.target.departureStation,
            arrival_station: plan.target.arrivalStation,
            headless: params.headless,
        }, config, loadedCredentials);
        browser = browserSession.browser;
        context = browserSession.context;
        page = browserSession.page;
        page.setDefaultTimeout(DEFAULT_BROWSER_TIMEOUT_MS);
        page.setDefaultNavigationTimeout(DEFAULT_BROWSER_TIMEOUT_MS);
        if (signal?.aborted) {
            throw new Error("ticket checkout dry run was aborted");
        }
        await page.goto(DB_HOME_URL, { waitUntil: "domcontentloaded" });
        await page.waitForTimeout(3000);
        await captureTicketStage(page, config, artifactCapture, "checkout-home");
        const login = params.login_before_search !== false
            ? await performDbAccountLogin(page, loadedCredentials?.credentials.bahnAccount ?? {}, {
                stayLoggedIn: params.stay_logged_in !== false,
                requireCredentialEntry: false,
            })
            : { requested: false };
        if (params.login_before_search !== false) {
            await captureTicketStage(page, config, artifactCapture, "checkout-login");
        }
        stage = "search_form";
        await fillStation(page, 'input[name="quickFinderBasic-von"]', plan.target.departureStation);
        await fillStation(page, 'input[name="quickFinderBasic-nach"]', plan.target.arrivalStation);
        const applied = {
            outboundDateTime: await applyOutboundDateTime(page, {
                departure_station: plan.target.departureStation,
                arrival_station: plan.target.arrivalStation,
                service_date: plan.target.serviceDate,
                departure_time: plan.target.departureTime,
            }),
        };
        await captureTicketStage(page, config, artifactCapture, "checkout-search-form");
        stage = "search_results";
        await page.getByRole("button", { name: /^Search$/i }).first().click();
        await waitForJourneyResults(page, plan.target.trainLabel);
        await captureTicketStage(page, config, artifactCapture, "checkout-search-results");
        const selectedJourney = await selectCheckoutJourney(page, {
            trainLabel: plan.target.trainLabel,
        });
        await page.waitForLoadState("domcontentloaded").catch(() => undefined);
        await waitForCheckoutProgress(page);
        await captureTicketStage(page, config, artifactCapture, "checkout-selected-journey");
        stage = "offer_selection";
        const selectedFare = await selectFareOffer(page, plan.fareSelection);
        await page.waitForTimeout(1000);
        await captureTicketStage(page, config, artifactCapture, "checkout-selected-fare");
        const offerContinue = plan.fareSelection.continueToCustomerData
            ? await continueFromOfferSelection(page, config, artifactCapture)
            : undefined;
        let customerDataContinue;
        if (offerContinue && plan.fareSelection.continueToPaymentBoundary) {
            customerDataContinue = await continueFromCustomerData(page, config, artifactCapture, plan.fareSelection.bookingFor);
        }
        let paymentFill;
        if (customerDataContinue) {
            paymentFill = await fillPaymentProfileAtBoundary(page, loadedPaymentProfile?.paymentProfile);
            paymentProfileTouched = true;
        }
        const paymentContinue = paymentFill && params.continue_after_payment_profile !== false
            ? await continueFromPaymentPage(page, paymentFill)
            : undefined;
        const checkout = await stopAfterFareSelection(page, selectedJourney, selectedFare, offerContinue, customerDataContinue, paymentFill, paymentContinue);
        const warnings = checkoutWarnings(checkout);
        const checkPageReached = paymentContinue?.action === "clicked_payment_continue" &&
            await isCheckPageReview(page);
        const reviewGate = await finalTicketBuyingGate(page, config, artifactCapture, purchaseMode, checkPageReached);
        const checkoutWithGate = checkPageReached
            ? {
                ...checkout,
                stage: reviewGate.stage,
                finalSafetyStop: reviewGate.finalSafetyStop,
                needsUserAction: reviewGate.needsUserAction,
                message: reviewGate.message,
                reviewGate,
            }
            : {
                ...checkout,
                reviewGate,
            };
        stage = checkoutWithGate.stage;
        const controls = params.include_controls === true && !paymentProfileTouched
            ? await visibleTicketControls(page)
            : undefined;
        const reviewPauseMs = normalizedReviewPauseMs(params.review_pause_ms);
        await waitForReviewPause(page, reviewPauseMs);
        return {
            ok: true,
            operation: "ticket_checkout_dry_run",
            testing: true,
            stage,
            purchaseSubmitted: false,
            finalSafetyStop: checkoutWithGate.finalSafetyStop,
            needsUserAction: checkoutWithGate.needsUserAction,
            message: checkoutWithGate.message,
            warnings,
            purchaseMode,
            reviewGate,
            reviewScreenshot: reviewGate.reviewScreenshot,
            credentials: credentialsSummary(loadedCredentials),
            buyingProfile: buyingProfileSummary(loadedBuyingProfile),
            paymentProfile: paymentProfileSummary(loadedPaymentProfile),
            plan,
            browserResult: {
                url: page.url(),
                title: await page.title(),
                artifactDir: artifactCapture.artifactDir,
                artifacts: artifactCapture.artifacts,
                testDrivePurchase: artifactCapture.testDrivePurchase,
                login,
                applied,
                checkout: checkoutWithGate,
                controls,
                reviewPauseMs,
                reviewScreenshot: reviewGate.reviewScreenshot,
            },
            research: TICKET_BUYING_RESEARCH_SUMMARY,
        };
    }
    catch (error) {
        if (page && !paymentProfileTouched) {
            try {
                await captureTicketStage(page, config, artifactCapture, `blocked-${stage}`);
            }
            catch { }
        }
        return {
            ok: false,
            operation: "ticket_checkout_dry_run",
            testing: true,
            stage,
            purchaseSubmitted: false,
            finalSafetyStop: "blocked",
            needsUserAction: true,
            message: errorMessage(error),
            credentials: credentialsSummary(loadedCredentials),
            buyingProfile: buyingProfileSummary(loadedBuyingProfile),
            paymentProfile: paymentProfileSummary(loadedPaymentProfile),
            plan,
            browserResult: {
                ...ticketArtifactResult(artifactCapture),
            },
            research: TICKET_BUYING_RESEARCH_SUMMARY,
        };
    }
    finally {
        await context?.close();
        await browser?.close();
    }
}
function checkoutWarnings(checkout) {
    return checkout.paymentFill?.warnings ?? [];
}
async function finalTicketBuyingGate(page, config, artifactCapture, purchaseMode, checkPageReached) {
    if (!checkPageReached) {
        return {
            status: "not_run",
            purchaseMode,
            stage: "not_on_check_page",
            finalSafetyStop: "not_on_check_page",
            needsUserAction: false,
            message: "DB Check page was not reached; no final review gate ran.",
            reviewScreenshot: undefined,
        };
    }
    if (purchaseMode === "auto") {
        return {
            status: "auto_unavailable",
            purchaseMode,
            stage: "auto_unavailable",
            finalSafetyStop: "auto_unavailable",
            needsUserAction: false,
            message: '"auto" is currently not available; stopped before the final order button.',
            reviewScreenshot: undefined,
        };
    }
    const reviewScreenshot = await saveTicketReviewScreenshot(page, config, artifactCapture, "checkout-review");
    return {
        status: "awaiting_user_review",
        purchaseMode,
        stage: "check_page_review",
        finalSafetyStop: "check_page_review",
        needsUserAction: true,
        message: "Stopped on DB Check page for user review; no final order button was clicked.",
        reviewScreenshot,
        confirmationRequest: {
            required: true,
            channel: "chat",
            screenshotPath: reviewScreenshot.path,
            message: "Review the checkout screenshot and confirm in chat before any purchase-capable mode is used.",
        },
    };
}
async function isCheckPageReview(page) {
    const url = page.url();
    if (/\/(?:pruefen-buchen|prüfen-buchen|check)(?:[/?#]|$)/i.test(url)) {
        return true;
    }
    const title = await page.title().catch(() => "");
    if (/^check$/i.test(title.trim())) {
        return true;
    }
    const body = await page.locator("body").innerText().catch(() => "");
    return /check\s+(?:and\s+)?book|check\s+your\s+booking|prüfen\s+und\s+buchen|pruefen\s+und\s+buchen/i.test(body);
}
function normalizedReviewPauseMs(value) {
    if (value === undefined) {
        return 0;
    }
    if (!Number.isFinite(value) || value < 0) {
        throw new Error("review_pause_ms must be a non-negative finite number");
    }
    return Math.min(Math.round(value), 120000);
}
async function waitForReviewPause(page, reviewPauseMs) {
    if (reviewPauseMs <= 0) {
        return;
    }
    await page.waitForTimeout(reviewPauseMs);
}
async function openTicketBrowserSession(params, config, loadedCredentials) {
    const userDataDir = resolveCredentialUserDataDir(config, loadedCredentials);
    const headless = params.headless ?? config.headless;
    if (userDataDir) {
        await fs.mkdir(userDataDir, { recursive: true });
        const { chromium } = await import("playwright-core");
        const context = await chromium.launchPersistentContext(userDataDir, {
            executablePath: await resolveBrowserExecutablePath(config),
            headless: headless !== false,
            args: ["--disable-dev-shm-usage"],
            viewport: { width: 1280, height: 1200 },
            locale: "en-US",
        });
        const page = context.pages()[0] ?? (await context.newPage());
        return { context, page, browser: undefined };
    }
    const browser = await launchBrowser({
        ...config,
        headless,
    });
    const page = await browser.newPage({
        viewport: { width: 1280, height: 1200 },
        locale: "en-US",
    });
    return { browser, page, context: undefined };
}
async function waitForJourneyResults(page, trainLabel) {
    await page.waitForFunction((expectedTrainLabel) => {
        const text = document.body?.innerText ?? "";
        const hasContinue = /Continue/i.test(text);
        if (!expectedTrainLabel) {
            return hasContinue && /\b(?:ICE|IC|EC|RE|RB|S)\s*\d+\b/i.test(text);
        }
        return hasContinue &&
            text.toLowerCase().includes(String(expectedTrainLabel).toLowerCase());
    }, trainLabel, { timeout: DEFAULT_BROWSER_TIMEOUT_MS });
}
async function selectCheckoutJourney(page, target) {
    const body = await page.locator("body").innerText().catch(() => "");
    if (isOfferSelectionPage(body)) {
        return {
            requestedTrainLabel: target.trainLabel,
            selectedIndex: -1,
            trainLabels: extractTrainLabels(body),
            price: extractPrice(body),
            summary: "DB booking flow is already on the offer selection page.",
            alreadySelected: true,
        };
    }
    const requestedTrainLabel = target.trainLabel;
    const selected = await page.evaluate((trainLabel) => {
        const compact = (value) => value.replace(/\s+/g, " ").trim();
        const visible = (element) => {
            const htmlElement = element;
            const rect = htmlElement.getBoundingClientRect();
            const style = window.getComputedStyle(htmlElement);
            return Boolean(rect.width && rect.height) &&
                style.visibility !== "hidden" &&
                style.display !== "none";
        };
        const labels = (value) => Array.from(new Set(compact(value).match(/\b(?:ICE|IC|EC|RE|RB|S)\s*\d+\b/gi) ?? []));
        const price = (value) => /€\s?\d+[,.]\d{2}|\d+[,.]\d{2}\s?€/i.exec(value)?.[0];
        const matchesTrain = (value) => {
            if (!trainLabel) {
                return labels(value).length > 0;
            }
            return compact(value).toLowerCase().includes(compact(String(trainLabel)).toLowerCase());
        };
        const controls = Array.from(document.querySelectorAll("button, a, [role='button']"))
            .map((element, index) => ({
            element,
            index,
            text: compact(element.innerText || element.textContent || ""),
        }))
            .filter((entry) => visible(entry.element) && /^Continue$/i.test(entry.text));
        const candidates = [];
        for (const control of controls) {
            let current = control.element;
            for (let depth = 0; current && depth < 14; depth += 1) {
                const tag = current.tagName.toLowerCase();
                if (tag === "body" || tag === "html") {
                    break;
                }
                const rect = current.getBoundingClientRect();
                const text = compact(current.innerText || current.textContent || "");
                const continueCount = (text.match(/\bContinue\b/gi) ?? []).length;
                const looksLikeResultRow = rect.width > 600 &&
                    rect.height > 80 &&
                    continueCount === 1 &&
                    /Continue/i.test(text) &&
                    /from\s*€|€\s?\d+[,.]\d{2}|\d+[,.]\d{2}\s?€/i.test(text);
                if (looksLikeResultRow) {
                    candidates.push(text.slice(0, 300));
                    if (matchesTrain(text)) {
                        current.scrollIntoView({ block: "center", inline: "center" });
                        control.element.click();
                        return {
                            clicked: true,
                            requestedTrainLabel: trainLabel,
                            selectedIndex: control.index,
                            trainLabels: labels(text),
                            price: price(text),
                            summary: text.slice(0, 500),
                            candidates,
                        };
                    }
                }
                current = current.parentElement;
            }
        }
        return {
            clicked: false,
            requestedTrainLabel: trainLabel,
            candidates,
        };
    }, requestedTrainLabel);
    if (!selected.clicked) {
        throw new Error([
            `no journey card matched train label ${requestedTrainLabel}`,
            `candidates: ${(selected.candidates ?? []).join("; ")}`,
        ].join("; "));
    }
    return {
        requestedTrainLabel,
        selectedIndex: selected.selectedIndex ?? -1,
        trainLabels: selected.trainLabels ?? [],
        price: selected.price,
        summary: compactUiText(selected.summary ?? "").slice(0, 500),
        alreadySelected: false,
    };
}
async function waitForCheckoutProgress(page) {
    await page
        .waitForFunction(() => {
        const text = document.body?.innerText ?? "";
        return /Super Sparpreis|Sparpreis|Flexpreis|Show passenger details|passenger details|traveller details|reisendendaten|payment method|zahlungsart/i.test(text);
    }, undefined, { timeout: DEFAULT_BROWSER_TIMEOUT_MS })
        .catch(() => undefined);
}
async function selectFareOffer(page, fareSelection) {
    const selected = await page.evaluate((selection) => {
        const compact = (value) => value.replace(/\s+/g, " ").trim();
        const visible = (element) => {
            const htmlElement = element;
            const rect = htmlElement.getBoundingClientRect();
            const style = window.getComputedStyle(htmlElement);
            return Boolean(rect.width && rect.height) &&
                style.visibility !== "hidden" &&
                style.display !== "none" &&
                htmlElement.getAttribute("aria-disabled") !== "true" &&
                !htmlElement.disabled;
        };
        const price = (value) => /€\s?\d+[,.]\d{2}|\d+[,.]\d{2}\s?€/i.exec(value)?.[0];
        const priceValue = (value) => {
            const matched = price(value);
            if (!matched) {
                return undefined;
            }
            const numeric = matched.replace(/[^\d,.]/g, "").replace(",", ".");
            const parsed = Number.parseFloat(numeric);
            return Number.isFinite(parsed) ? parsed : undefined;
        };
        const offerLabel = (value) => compact(value)
            .replace(/\bDetails\b.*$/i, "")
            .replace(/\bSelect(?:ed)?\b.*$/i, "")
            .replace(/€\s?\d+[,.]\d{2}|\d+[,.]\d{2}\s?€/gi, "")
            .trim() || "Cheapest selectable offer";
        const matchesFare = (text, fare) => {
            if (fare === "super_sparpreis") {
                return /\bSuper\s+Sparpreis\b|\bSuper\s+Saver\b/i.test(text);
            }
            if (fare === "sparpreis") {
                return ((/\bSparpreis\b|\bSaver\s+Fare\b|\bSaver\s+Ticket\b/i.test(text)) &&
                    !/\bSuper\s+Sparpreis\b|\bSuper\s+Saver\b/i.test(text));
            }
            if (fare === "flexpreis") {
                return /\bFlexpreis\b|\bFlex\s+(?:Fare|Price)\b|\bFlexible\s+Fare\b/i.test(text);
            }
            return false;
        };
        const matchesTravelClass = (text) => {
            const hasFirstClass = /1\.\s*Klasse|1st\s+class|first\s+class/i.test(text);
            const hasSecondClass = /2\.\s*Klasse|2nd\s+class|second\s+class/i.test(text);
            if (selection.travelClass === "first") {
                return hasFirstClass || (!hasFirstClass && !hasSecondClass);
            }
            return hasSecondClass || (!hasFirstClass && !hasSecondClass);
        };
        const controls = Array.from(document.querySelectorAll("button, a, [role='button']"))
            .map((element, index) => ({
            element,
            index,
            text: compact(element.innerText || element.textContent || ""),
        }))
            .filter((entry) => visible(entry.element) &&
            /Select|Selected|Auswählen|Ausgewaehlt|Ausgewählt/i.test(entry.text) &&
            !/Continue|Back|Details|Show\s+passenger|Show\s+season/i.test(entry.text));
        const candidates = [];
        const cheapestSelectable = () => {
            let cheapest;
            for (const control of controls) {
                let current = control.element;
                for (let depth = 0; current && depth < 12; depth += 1) {
                    const tag = current.tagName.toLowerCase();
                    if (tag === "body" || tag === "html") {
                        break;
                    }
                    const rect = current.getBoundingClientRect();
                    const text = compact(current.innerText || current.textContent || "");
                    const numericPrice = priceValue(text);
                    const looksLikeFareCard = rect.width > 180 &&
                        rect.height > 80 &&
                        /Select|Selected|Auswählen|Ausgewählt|Ausgewaehlt/i.test(text) &&
                        numericPrice !== undefined &&
                        matchesTravelClass(text);
                    if (looksLikeFareCard) {
                        const candidate = {
                            control: control.element,
                            controlText: control.text,
                            text,
                            selectedIndex: control.index,
                            price: price(text),
                            priceValue: numericPrice,
                        };
                        if (!cheapest || candidate.priceValue < cheapest.priceValue) {
                            cheapest = candidate;
                        }
                    }
                    current = current.parentElement;
                }
            }
            if (!cheapest) {
                return undefined;
            }
            cheapest.control.scrollIntoView({ block: "center", inline: "center" });
            if (!/Selected|Ausgewaehlt|Ausgewählt/i.test(cheapest.controlText)) {
                cheapest.control.click();
            }
            return {
                clicked: !/Selected|Ausgewaehlt|Ausgewählt/i.test(cheapest.controlText),
                alreadySelected: /Selected|Ausgewaehlt|Ausgewählt/i.test(cheapest.controlText),
                requestedDefaultFare: selection.defaultFare,
                selectedFare: "cheapest_available",
                selectedFareLabel: offerLabel(cheapest.text),
                fallbackUsed: true,
                travelClass: selection.travelClass,
                travelClassLabel: selection.travelClassLabel,
                selectedIndex: cheapest.selectedIndex,
                price: cheapest.price,
                summary: cheapest.text.slice(0, 500),
                candidates,
            };
        };
        for (const fare of selection.preferenceOrder) {
            if (fare === "cheapest_available") {
                const selectedCheapest = cheapestSelectable();
                if (selectedCheapest) {
                    return selectedCheapest;
                }
                continue;
            }
            for (const control of controls) {
                let current = control.element;
                for (let depth = 0; current && depth < 12; depth += 1) {
                    const tag = current.tagName.toLowerCase();
                    if (tag === "body" || tag === "html") {
                        break;
                    }
                    const rect = current.getBoundingClientRect();
                    const text = compact(current.innerText || current.textContent || "");
                    const looksLikeFareCard = rect.width > 180 &&
                        rect.height > 80 &&
                        /Select|Selected|Auswählen|Ausgewählt|Ausgewaehlt/i.test(text) &&
                        /€\s?\d+[,.]\d{2}|\d+[,.]\d{2}\s?€/i.test(text);
                    if (looksLikeFareCard) {
                        candidates.push(text.slice(0, 300));
                        if (matchesFare(text, fare) && matchesTravelClass(text)) {
                            current.scrollIntoView({ block: "center", inline: "center" });
                            if (/Selected|Ausgewaehlt|Ausgewählt/i.test(control.text)) {
                                return {
                                    clicked: false,
                                    alreadySelected: true,
                                    requestedDefaultFare: selection.defaultFare,
                                    selectedFare: fare,
                                    selectedFareLabel: selection.labels[fare],
                                    fallbackUsed: fare !== selection.defaultFare,
                                    travelClass: selection.travelClass,
                                    travelClassLabel: selection.travelClassLabel,
                                    selectedIndex: control.index,
                                    price: price(text),
                                    summary: text.slice(0, 500),
                                    candidates,
                                };
                            }
                            control.element.click();
                            return {
                                clicked: true,
                                alreadySelected: false,
                                requestedDefaultFare: selection.defaultFare,
                                selectedFare: fare,
                                selectedFareLabel: selection.labels[fare],
                                fallbackUsed: fare !== selection.defaultFare,
                                travelClass: selection.travelClass,
                                travelClassLabel: selection.travelClassLabel,
                                selectedIndex: control.index,
                                price: price(text),
                                summary: text.slice(0, 500),
                                candidates,
                            };
                        }
                    }
                    current = current.parentElement;
                }
            }
        }
        const selectedCheapest = cheapestSelectable();
        if (selectedCheapest) {
            return selectedCheapest;
        }
        return {
            clicked: false,
            alreadySelected: false,
            requestedDefaultFare: selection.defaultFare,
            selectedFare: undefined,
            selectedFareLabel: undefined,
            fallbackUsed: false,
            travelClass: selection.travelClass,
            travelClassLabel: selection.travelClassLabel,
            selectedIndex: -1,
            price: undefined,
            summary: undefined,
            candidates,
        };
    }, fareSelection);
    if (!selected.clicked && !selected.alreadySelected) {
        throw new Error([
            `no offer matched fare preference ${fareSelection.preferenceOrder.join(", ")}`,
            `travel class ${fareSelection.travelClass}`,
            `candidates: ${(selected.candidates ?? []).join("; ")}`,
        ].join("; "));
    }
    return {
        requestedDefaultFare: selected.requestedDefaultFare,
        selectedFare: selected.selectedFare,
        selectedFareLabel: selected.selectedFareLabel,
        fallbackUsed: selected.fallbackUsed,
        travelClass: selected.travelClass,
        travelClassLabel: selected.travelClassLabel,
        selectedIndex: selected.selectedIndex,
        price: selected.price,
        summary: compactUiText(selected.summary ?? "").slice(0, 500),
        alreadySelected: selected.alreadySelected,
    };
}
async function continueFromOfferSelection(page, config, artifactCapture) {
    const before = await detectCheckoutBoundary(page);
    if (before.finalOrderButtonVisible || before.paymentBoundaryVisible) {
        return offerContinueResult(before, "not_clicked_boundary_visible");
    }
    const next = await findOfferSelectionContinue(page);
    if (!next) {
        return offerContinueResult(before, "not_clicked_no_offer_continue");
    }
    await next.click();
    await page.waitForLoadState("domcontentloaded").catch(() => undefined);
    await waitForCustomerDataProgress(page);
    await captureTicketStage(page, config, artifactCapture, "checkout-customer-data");
    return offerContinueResult(before, "clicked_offer_continue", next.text);
}
async function continueFromCustomerData(page, config, artifactCapture, bookingFor) {
    const before = await detectCheckoutBoundary(page);
    if (before.finalOrderButtonVisible || before.paymentBoundaryVisible) {
        return customerDataContinueResult(before, "not_clicked_boundary_visible", bookingFor);
    }
    if (before.stage !== "customer_data") {
        return customerDataContinueResult(before, "not_clicked_not_customer_data", bookingFor);
    }
    const bookingForAction = await applyBookingFor(page);
    const next = await findSafeCheckoutNext(page);
    if (!next) {
        return customerDataContinueResult(before, "not_clicked_no_customer_data_continue", bookingFor, { bookingForAction });
    }
    await next.click();
    await page.waitForLoadState("domcontentloaded").catch(() => undefined);
    await page.waitForTimeout(5000);
    await captureTicketStage(page, config, artifactCapture, "checkout-after-customer-data");
    const after = await detectCheckoutBoundary(page);
    return customerDataContinueResult(before, "clicked_customer_data_continue", bookingFor, { bookingForAction, clickedText: next.text, after });
}
async function applyBookingFor(page) {
    return page.evaluate(() => {
        const compact = (value) => value.replace(/\s+/g, " ").trim();
        const visible = (element) => {
            const htmlElement = element;
            const rect = htmlElement.getBoundingClientRect();
            const style = window.getComputedStyle(htmlElement);
            return Boolean(rect.width && rect.height) &&
                style.visibility !== "hidden" &&
                style.display !== "none";
        };
        const selfPattern = /book\s+for\s+me|für\s+mich\s+buchen|fuer\s+mich\s+buchen/i;
        const elements = Array.from(document.querySelectorAll("label, button, [role='radio'], [role='button'], div, span"))
            .map((element) => ({
            element,
            text: compact(element.innerText || element.textContent || ""),
        }))
            .filter((entry) => visible(entry.element) && selfPattern.test(entry.text));
        for (const entry of elements) {
            let current = entry.element;
            for (let depth = 0; current && depth < 8; depth += 1) {
                const text = compact(current.innerText || current.textContent || "");
                if (!selfPattern.test(text)) {
                    current = current.parentElement;
                    continue;
                }
                const checked = current.querySelector('input[type="radio"]:checked, [role="radio"][aria-checked="true"]');
                if (checked) {
                    return "already_selected";
                }
                const radio = current.querySelector('input[type="radio"], [role="radio"]');
                if (radio) {
                    radio.click();
                    return "clicked";
                }
                current.click();
                return "clicked";
            }
        }
        return "not_found";
    });
}
async function collectControlSnapshots(page, selector, options = {}) {
    const { preferInputValue = false } = options;
    return page.locator(selector).evaluateAll((nodes, browserOptions) => nodes.map((node, index) => {
        const element = node;
        const rect = element.getBoundingClientRect();
        const inputValue = browserOptions.preferInputValue
            ? node.value
            : "";
        return {
            index,
            text: (inputValue || element.innerText || node.textContent || "")
                .trim()
                .replace(/\s+/g, " "),
            visible: Boolean(element.offsetWidth ||
                element.offsetHeight ||
                node.getClientRects().length),
            disabled: node.disabled ||
                element.getAttribute("aria-disabled") === "true",
            rect: {
                top: rect.top,
                left: rect.left,
                width: rect.width,
                height: rect.height,
            },
        };
    }), { preferInputValue });
}
async function findOfferSelectionContinue(page) {
    const controls = await collectControlSnapshots(page, "button, a");
    const candidate = controls
        .filter(isSafeContinueControl)
        .at(-1);
    if (!candidate) {
        return undefined;
    }
    const locator = page.locator("button, a").nth(candidate.index);
    return {
        text: candidate.text,
        click: () => locator.click({ timeout: 10000 }),
    };
}
function isSafeContinueControl(control) {
    return control.visible &&
        !control.disabled &&
        /^Continue$/i.test(control.text) &&
        !isFinalOrderText(control.text);
}
async function waitForCustomerDataProgress(page) {
    await page.waitForFunction(() => {
        const text = document.body?.innerText ?? "";
        const hasCustomerDataInput = Boolean(document.querySelector([
            'input[type="email"]',
            'input[autocomplete*="email" i]',
            'input[name*="mail" i]',
            'input[id*="mail" i]',
            'input[name*="first" i]',
            'input[id*="first" i]',
            'input[name*="last" i]',
            'input[id*="last" i]',
            'input[autocomplete*="given-name" i]',
            'input[autocomplete*="family-name" i]',
        ].join(", ")));
        const hasCustomerDataText = /e-?mail\s+address|first\s+name|last\s+name|personal\s+details|contact\s+details|reisendendaten|vorname|nachname/i.test(text);
        const hasPaymentBoundary = /payment\s+method|payment\s+details|zahlungsart|zahlungsdaten|credit\s+card|kreditkarte|paypal|sepa/i.test(text);
        return hasCustomerDataInput || hasCustomerDataText || hasPaymentBoundary;
    }, undefined, { timeout: DEFAULT_BROWSER_TIMEOUT_MS });
}
async function fillPaymentProfileAtBoundary(page, paymentProfile) {
    const before = await detectCheckoutBoundary(page);
    if (!paymentProfile) {
        return skippedPaymentFillResult(before, "not_filled_no_payment_profile");
    }
    if (before.finalOrderButtonVisible) {
        return skippedPaymentFillResult(before, "not_filled_final_order_boundary", paymentProfile.method);
    }
    if (before.stage !== "payment_boundary") {
        return skippedPaymentFillResult(before, "not_filled_not_payment_boundary", paymentProfile.method);
    }
    let methodAction = await selectPaymentMethod(page, paymentProfile.method);
    await waitForPaymentMethodForm(page, paymentProfile.method);
    if (methodAction === "not_found") {
        methodAction = await selectPaymentMethod(page, paymentProfile.method);
        await waitForPaymentMethodForm(page, paymentProfile.method);
    }
    const filledFields = [];
    const matchedFields = [];
    const mismatchedFields = [];
    const missingFields = [];
    const recordPaymentField = (fieldName, result) => {
        if (result === "filled") {
            filledFields.push(fieldName);
        }
        else if (result === "matched") {
            matchedFields.push(fieldName);
        }
        else if (result === "mismatched") {
            mismatchedFields.push(fieldName);
        }
        else {
            missingFields.push(fieldName);
        }
    };
    if (paymentProfile.method === "sepa") {
        const sepa = paymentProfile.payment?.sepa;
        const savedSepaResult = await selectedSavedSepaPaymentResult(page, sepa?.iban);
        const useSavedSepa = savedSepaResult !== "missing" &&
            !(await sepaPaymentFormVisible(page));
        if (useSavedSepa) {
            recordPaymentField("sepa.savedPaymentMethod", savedSepaResult === "matched" ? "matched" : "missing");
        }
        else if (sepa?.accountOwner) {
            const result = await verifyPaymentInput(page, [
                /account\s+(?:owner|holder)/i,
                /name\s+of\s+account\s+holder/i,
                /kontoinhaber/i,
            ], [
                'input[name*="accountOwner" i]',
                'input[id*="accountOwner" i]',
                'input[name*="account-owner" i]',
                'input[id*="account-owner" i]',
                'input[name*="accountHolder" i]',
                'input[id*="accountHolder" i]',
                'input[name*="kontoinhaber" i]',
                'input[id*="kontoinhaber" i]',
            ], sepa.accountOwner);
            recordPaymentField("sepa.accountOwner", result);
        }
        else {
            missingFields.push("sepa.accountOwner");
        }
        if (!useSavedSepa && sepa?.iban) {
            const result = await fillPaymentInput(page, [/iban/i], [
                'input[name*="iban" i]',
                'input[id*="iban" i]',
                'input[autocomplete*="iban" i]',
            ], sepa.iban, { normalize: normalizeIban });
            recordPaymentField("sepa.iban", result);
        }
        else if (!useSavedSepa) {
            missingFields.push("sepa.iban");
        }
        if (!useSavedSepa && sepa?.birthdate) {
            const result = await verifyPaymentInput(page, [/date\s+of\s+birth/i, /birthdate/i, /birthday/i, /geburtsdatum/i], [
                'input[name*="birth" i]',
                'input[id*="birth" i]',
                'input[name*="geburts" i]',
                'input[id*="geburts" i]',
            ], formatPaymentBirthdateForDbUi(sepa.birthdate), { normalize: normalizeUiDateComparable });
            recordPaymentField("sepa.birthdate", result);
        }
        if (!useSavedSepa && sepa?.address?.streetNumber) {
            const result = await fillPaymentInput(page, [
                /street\s+(?:and\s+)?house\s+number/i,
                /street\s*\/\s*house\s+number/i,
                /street/i,
                /stra(?:ß|ss)e|hausnummer/i,
            ], [
                'input[name*="street" i]',
                'input[id*="street" i]',
                'input[name*="strasse" i]',
                'input[id*="strasse" i]',
                'input[name*="straße" i]',
                'input[id*="straße" i]',
            ], sepa.address.streetNumber);
            recordPaymentField("sepa.address.streetNumber", result);
        }
        if (!useSavedSepa && sepa?.address?.additionalInfo) {
            const result = await fillPaymentInput(page, [
                /other\s+address\s+info/i,
                /additional\s+address/i,
                /address\s+line\s+2/i,
                /adresszusatz/i,
            ], [
                'input[name*="address2" i]',
                'input[id*="address2" i]',
                'input[name*="additional" i]',
                'input[id*="additional" i]',
                'input[name*="zusatz" i]',
                'input[id*="zusatz" i]',
            ], sepa.address.additionalInfo);
            recordPaymentField("sepa.address.additionalInfo", result);
        }
        if (!useSavedSepa && sepa?.address?.zip) {
            const result = await fillPaymentInput(page, [/postcode/i, /postal\s+code/i, /^zip$/i, /postleitzahl/i, /^plz$/i], [
                'input[name*="post" i]',
                'input[id*="post" i]',
                'input[name*="zip" i]',
                'input[id*="zip" i]',
                'input[name*="plz" i]',
                'input[id*="plz" i]',
            ], sepa.address.zip);
            recordPaymentField("sepa.address.zip", result);
        }
        if (!useSavedSepa && sepa?.address?.city) {
            const result = await fillPaymentInput(page, [/town\s*\/\s*city/i, /town/i, /city/i, /stadt/i, /^ort$/i], [
                'input[name*="city" i]',
                'input[id*="city" i]',
                'input[name*="town" i]',
                'input[id*="town" i]',
                'input[name*="ort" i]',
                'input[id*="ort" i]',
                'input[name*="stadt" i]',
                'input[id*="stadt" i]',
            ], sepa.address.city);
            recordPaymentField("sepa.address.city", result);
        }
        if (!useSavedSepa && sepa?.address?.country) {
            const result = await fillPaymentInput(page, [/country/i, /^land$/i], [
                'select[name*="country" i]',
                'select[id*="country" i]',
                'input[name*="country" i]',
                'input[id*="country" i]',
                'select[name*="land" i]',
                'select[id*="land" i]',
                'input[name*="land" i]',
                'input[id*="land" i]',
            ], sepa.address.country, { normalize: normalizeCountry });
            recordPaymentField("sepa.address.country", result);
        }
        if (!useSavedSepa && sepa?.mandateAccepted === true) {
            const result = await clickPaymentCheckbox(page, [
                /issue\s+sepa\s+mandate/i,
                /sepa.*mandate/i,
                /direct\s+debit.*mandate/i,
                /authori[sz]e.*direct\s+debit/i,
                /lastschriftmandat/i,
                /einzugsermaechtigung/i,
                /einzugsermächtigung/i,
            ]);
            recordPaymentField("sepa.mandateAccepted", result);
        }
        if (!useSavedSepa && sepa?.saveAsPreferred === true) {
            const result = await clickPaymentCheckbox(page, [
                /preferred\s+means\s+of\s+payment/i,
                /preferred\s+payment/i,
                /bevorzugte.*zahlung/i,
            ]);
            recordPaymentField("sepa.saveAsPreferred", result);
        }
    }
    if (paymentProfile.method === "credit_card") {
        const card = paymentProfile.payment?.card;
        if (card?.cardholderName) {
            const result = await fillPaymentInput(page, [/cardholder/i, /card\s+holder/i, /name\s+on\s+card/i, /karteninhaber/i], [
                'input[name*="cardholder" i]',
                'input[id*="cardholder" i]',
                'input[name*="holder" i]',
                'input[id*="holder" i]',
            ], card.cardholderName);
            recordPaymentField("card.cardholderName", result);
        }
        else {
            missingFields.push("card.cardholderName");
        }
        if (card?.cardNumber) {
            const result = await fillPaymentInput(page, [/card\s+number/i, /kartennummer/i], [
                'input[name*="cardNumber" i]',
                'input[id*="cardNumber" i]',
                'input[name*="pan" i]',
                'input[id*="pan" i]',
            ], card.cardNumber, { normalize: normalizeCardNumber });
            recordPaymentField("card.cardNumber", result);
        }
        else {
            missingFields.push("card.cardNumber");
        }
        if (card?.expiryMonth) {
            const result = await fillPaymentInput(page, [/expiry\s+month/i, /month/i, /gültig.*monat/i, /gueltig.*monat/i], ['input[name*="expir" i]', 'input[id*="expir" i]'], card.expiryMonth);
            recordPaymentField("card.expiryMonth", result);
        }
        if (card?.expiryYear) {
            const result = await fillPaymentInput(page, [/expiry\s+year/i, /year/i, /gültig.*jahr/i, /gueltig.*jahr/i], ['input[name*="expir" i]', 'input[id*="expir" i]'], card.expiryYear);
            recordPaymentField("card.expiryYear", result);
        }
    }
    const after = await detectCheckoutBoundary(page);
    return {
        stage: before.stage,
        action: "selected_payment_method_and_filled_profile_fields",
        method: paymentProfile.method,
        methodAction,
        filledFields,
        matchedFields,
        mismatchedFields,
        missingFields,
        warnings: paymentFieldWarnings(mismatchedFields),
        boundaryBefore: before,
        boundaryAfter: after,
        artifactCaptureSkipped: true,
    };
}
async function continueFromPaymentPage(page, paymentFill) {
    const before = await detectCheckoutBoundary(page);
    if (paymentFill.missingFields.length > 0) {
        return paymentContinueResult(before, "not_clicked_missing_payment_fields");
    }
    if (before.finalOrderButtonVisible) {
        return paymentContinueResult(before, "not_clicked_final_order_boundary");
    }
    if (before.stage !== "payment_boundary") {
        return paymentContinueResult(before, "not_clicked_not_payment_boundary");
    }
    let clickedText;
    let after = before;
    for (let attempt = 0; attempt < 3; attempt += 1) {
        const next = await findPaymentPageContinue(page);
        if (!next) {
            return paymentContinueResult(before, clickedText
                ? "clicked_payment_continue_no_review_progress"
                : "not_clicked_no_payment_continue", { clickedText, after });
        }
        clickedText = next.text;
        await next.click();
        await page.waitForLoadState("domcontentloaded").catch(() => undefined);
        await waitForCheckOrFinalOrderProgress(page);
        after = await detectCheckoutBoundary(page);
        if (await isCheckPageReview(page) ||
            after.finalOrderButtonVisible ||
            after.stage !== "payment_boundary") {
            return paymentContinueResult(before, "clicked_payment_continue", { clickedText, after });
        }
        await page.waitForTimeout(750);
    }
    return paymentContinueResult(before, "clicked_payment_continue_no_review_progress", { clickedText, after });
}
async function selectPaymentMethod(page, method) {
    return page.evaluate((selectedMethod) => {
        const compact = (value) => value.replace(/\s+/g, " ").trim();
        const visible = (element) => {
            const htmlElement = element;
            const rect = htmlElement.getBoundingClientRect();
            const style = window.getComputedStyle(htmlElement);
            return Boolean(rect.width && rect.height) &&
                style.visibility !== "hidden" &&
                style.display !== "none";
        };
        const pattern = selectedMethod === "sepa"
            ? /\bsepa\b|direct\s+debit|lastschrift/i
            : selectedMethod === "credit_card"
                ? /credit\s+card|kreditkarte/i
                : /paypal/i;
        const conflictingPattern = selectedMethod === "sepa"
            ? /paypal|credit\s+card|kreditkarte|bonvoyo/i
            : selectedMethod === "credit_card"
                ? /\bsepa\b|direct\s+debit|lastschrift|paypal|bonvoyo/i
                : /\bsepa\b|direct\s+debit|lastschrift|credit\s+card|kreditkarte|bonvoyo/i;
        const isChecked = (element) => {
            if (element instanceof HTMLInputElement) {
                return element.checked;
            }
            return element.getAttribute("aria-checked") === "true";
        };
        const elements = Array.from(document.querySelectorAll("label, button, [role='radio'], [role='button'], div, span"))
            .map((element) => ({
            element,
            text: compact(element.innerText || element.textContent || ""),
        }))
            .filter((entry) => visible(entry.element) && pattern.test(entry.text));
        for (const entry of elements) {
            let current = entry.element;
            for (let depth = 0; current && depth < 8; depth += 1) {
                const text = compact(current.innerText || current.textContent || "");
                const rect = current.getBoundingClientRect();
                if (!pattern.test(text) || conflictingPattern.test(text)) {
                    current = current.parentElement;
                    continue;
                }
                const ownRoleRadio = current.getAttribute("role") === "radio" ? current : undefined;
                const radio = ownRoleRadio ?? current.querySelector('input[type="radio"], [role="radio"]');
                if (radio && isChecked(radio)) {
                    return "already_selected";
                }
                if (radio) {
                    radio.scrollIntoView({ block: "center", inline: "center" });
                    radio.click();
                    return "clicked_radio";
                }
                if (rect.width > 120 &&
                    rect.height > 20 &&
                    text.length <= 120) {
                    current.scrollIntoView({ block: "center", inline: "center" });
                    current.click();
                    return "clicked_container";
                }
                current = current.parentElement;
            }
        }
        return "not_found";
    }, method);
}
async function waitForPaymentMethodForm(page, method) {
    if (method === "sepa") {
        await page
            .waitForFunction(() => {
            const text = document.body?.innerText ?? "";
            const hasSepaFormText = /SEPA\s+direct\s+debit|IBAN|Name\s+of\s+the\s+account\s+holder|Date\s+of\s+birth|Issue\s+SEPA\s+mandate/i.test(text);
            const hasSepaInput = Boolean(document.querySelector([
                'input[name*="iban" i]',
                'input[id*="iban" i]',
                'input[name*="accountOwner" i]',
                'input[id*="accountOwner" i]',
                'input[name*="accountHolder" i]',
                'input[id*="accountHolder" i]',
            ].join(", ")));
            return hasSepaFormText || hasSepaInput;
        }, undefined, { timeout: 12000 })
            .catch(() => undefined);
        await page.waitForTimeout(500);
        return;
    }
    const pattern = method === "credit_card"
        ? /card\s+number|cardholder|name\s+on\s+card|expiry/i
        : /paypal/i;
    await page
        .waitForFunction((source) => {
        const pattern = new RegExp(source, "i");
        return pattern.test(document.body?.innerText ?? "");
    }, pattern.source, { timeout: 8000 })
        .catch(() => undefined);
    await page.waitForTimeout(500);
}
async function fillPaymentInput(page, labels, selectors, value, options = {}) {
    const input = await findVisiblePaymentInput(page, labels, selectors);
    if (!input) {
        return "missing";
    }
    return applyPaymentControlValue(input, value, options);
}
async function findVisiblePaymentInput(page, labels, selectors) {
    for (const label of labels) {
        const input = page.getByLabel(label).first();
        if (await input.isVisible({ timeout: 500 }).catch(() => false)) {
            return input;
        }
    }
    for (const selector of selectors) {
        const input = page.locator(selector).first();
        if (await input.isVisible({ timeout: 500 }).catch(() => false)) {
            return input;
        }
    }
    return undefined;
}
async function verifyPaymentInput(page, labels, selectors, value, options = {}) {
    const normalize = options.normalize ?? normalizeUiText;
    const input = await findVisiblePaymentInput(page, labels, selectors);
    if (!input) {
        return "missing";
    }
    const current = await readPaymentControlValue(input);
    return normalize(current) === normalize(value) ? "matched" : "mismatched";
}
async function clickPaymentCheckbox(page, labels) {
    for (const label of labels) {
        const control = page.getByLabel(label).first();
        if (await control.isVisible({ timeout: 500 }).catch(() => false)) {
            if (await paymentCheckboxIsChecked(control)) {
                return "matched";
            }
            await control.check({ force: true }).catch(async () => {
                await control.click({ force: true });
            });
            await page.waitForTimeout(150);
            if (await paymentCheckboxIsChecked(control)) {
                return "filled";
            }
        }
    }
    const clickedByText = await clickCheckboxByVisibleText(page, labels);
    if (clickedByText !== "missing") {
        return clickedByText;
    }
    return "missing";
}
async function sepaPaymentFormVisible(page) {
    return page.locator([
        'input[name*="iban" i]',
        'input[id*="iban" i]',
        'input[name*="accountOwner" i]',
        'input[id*="accountOwner" i]',
        'input[name*="accountHolder" i]',
        'input[id*="accountHolder" i]',
    ].join(", ")).first().isVisible({ timeout: 500 }).catch(() => false);
}
async function selectedSavedSepaPaymentResult(page, configuredIban) {
    if (!configuredIban) {
        return "missing";
    }
    const suffix = normalizeIban(configuredIban).slice(-4);
    if (suffix.length < 4) {
        return "missing";
    }
    const matched = await page.evaluate((expectedSuffix) => {
        const compact = (value) => value.replace(/\s+/g, " ").trim();
        const visible = (element) => {
            const htmlElement = element;
            const rect = htmlElement.getBoundingClientRect();
            const style = window.getComputedStyle(htmlElement);
            return Boolean(rect.width && rect.height) &&
                style.visibility !== "hidden" &&
                style.display !== "none";
        };
        const checked = (element) => {
            if (element instanceof HTMLInputElement) {
                return element.checked;
            }
            return element.getAttribute("aria-checked") === "true";
        };
        const candidates = Array.from(document.querySelectorAll("label, button, [role='radio'], div, section"))
            .map((element) => ({
            element: element,
            text: compact(element.innerText || element.textContent || ""),
        }))
            .filter((entry) => visible(entry.element) &&
            /SEPA\s+direct\s+debit|Lastschrift/i.test(entry.text));
        for (const entry of candidates) {
            let current = entry.element;
            for (let depth = 0; current && depth < 6; depth += 1) {
                const text = compact(current.innerText || current.textContent || "");
                const radio = current.matches('input[type="radio"], [role="radio"]')
                    ? current
                    : current.querySelector('input[type="radio"], [role="radio"]');
                if (radio &&
                    checked(radio) &&
                    /SEPA\s+direct\s+debit|Lastschrift/i.test(text)) {
                    return text.replace(/\s+/g, "").includes(expectedSuffix);
                }
                current = current.parentElement;
            }
        }
        return false;
    }, suffix);
    return matched ? "matched" : "missing";
}
async function clickCheckboxByVisibleText(page, labels) {
    const result = await page.evaluate((patternSpecs) => {
        const patterns = patternSpecs.map((spec) => new RegExp(spec.source, spec.flags));
        const checkboxSelector = 'input[type="checkbox"], [role="checkbox"]';
        const compact = (value) => value.replace(/\s+/g, " ").trim();
        const visible = (element) => {
            const htmlElement = element;
            const rect = htmlElement.getBoundingClientRect();
            const style = window.getComputedStyle(htmlElement);
            return Boolean(rect.width && rect.height) &&
                style.visibility !== "hidden" &&
                style.display !== "none";
        };
        const disabled = (element) => (element instanceof HTMLInputElement && element.disabled) ||
            element.getAttribute("aria-disabled") === "true";
        const checked = (element) => {
            if (element instanceof HTMLInputElement) {
                return element.checked;
            }
            return element.getAttribute("aria-checked") === "true";
        };
        const checkboxElementsIn = (element) => {
            const controls = element.matches(checkboxSelector)
                ? [element]
                : Array.from(element.querySelectorAll(checkboxSelector));
            return controls
                .map((control) => control)
                .filter((control) => visible(control) && !disabled(control));
        };
        const uniqueControls = (controls) => Array.from(new Set(controls));
        const distance = (left, right) => {
            const leftRect = left.getBoundingClientRect();
            const rightRect = right.getBoundingClientRect();
            const leftX = leftRect.left + leftRect.width / 2;
            const leftY = leftRect.top + leftRect.height / 2;
            const rightX = rightRect.left + rightRect.width / 2;
            const rightY = rightRect.top + rightRect.height / 2;
            return Math.hypot(leftX - rightX, leftY - rightY);
        };
        const controlsNear = (anchor) => {
            const controls = [];
            if (anchor.matches(checkboxSelector)) {
                controls.push(anchor);
            }
            if (anchor instanceof HTMLLabelElement && anchor.control) {
                controls.push(anchor.control);
            }
            const htmlFor = anchor.getAttribute("for");
            if (htmlFor) {
                const labelled = document.getElementById(htmlFor);
                if (labelled instanceof HTMLElement) {
                    controls.push(labelled);
                }
            }
            let current = anchor;
            for (let depth = 0; current && depth < 5; depth += 1) {
                controls.push(...checkboxElementsIn(current));
                for (const sibling of [
                    current.previousElementSibling,
                    current.nextElementSibling,
                ]) {
                    if (sibling) {
                        controls.push(...checkboxElementsIn(sibling));
                    }
                }
                current = current.parentElement;
            }
            return uniqueControls(controls)
                .filter((control) => visible(control) && !disabled(control))
                .sort((left, right) => distance(anchor, left) - distance(anchor, right));
        };
        const clickControl = (control, anchor) => {
            if (checked(control)) {
                return "matched";
            }
            control.scrollIntoView({ block: "center", inline: "center" });
            control.click();
            if (checked(control)) {
                return "filled";
            }
            if (anchor && anchor !== control) {
                anchor.click();
            }
            return checked(control) ? "filled" : "missing";
        };
        const candidates = Array.from(document.querySelectorAll("label, button, [role='checkbox'], div, span, p"))
            .map((element) => ({
            element: element,
            text: compact(element.innerText || element.textContent || ""),
        }))
            .filter((entry) => visible(entry.element) &&
            entry.text.length <= 240 &&
            patterns.some((pattern) => pattern.test(entry.text)))
            .sort((left, right) => left.text.length - right.text.length ||
            left.element.getBoundingClientRect().top -
                right.element.getBoundingClientRect().top);
        for (const entry of candidates) {
            for (const control of controlsNear(entry.element)) {
                const result = clickControl(control, entry.element);
                if (result !== "missing") {
                    return result;
                }
            }
        }
        return "missing";
    }, labels.map((label) => ({ source: label.source, flags: label.flags })));
    if (result !== "missing") {
        await page.waitForTimeout(150);
    }
    return result;
}
function skippedPaymentFillResult(before, action, method) {
    return {
        stage: before.stage,
        action,
        method,
        filledFields: [],
        matchedFields: [],
        mismatchedFields: [],
        missingFields: [],
        boundaryBefore: before,
        artifactCaptureSkipped: true,
    };
}
function offerContinueResult(before, action, clickedText) {
    return {
        stage: before.stage,
        action,
        clickedText,
        boundaryBefore: before,
    };
}
function customerDataContinueResult(before, action, bookingFor, { bookingForAction, clickedText, after = before, } = {}) {
    return {
        stage: before.stage,
        action,
        clickedText,
        bookingFor,
        bookingForAction,
        boundaryBefore: before,
        boundaryAfter: after,
    };
}
function paymentContinueResult(before, action, { clickedText, after = before, } = {}) {
    return {
        stage: before.stage,
        action,
        clickedText,
        boundaryBefore: before,
        boundaryAfter: after,
    };
}
function paymentFieldWarnings(mismatchedFields) {
    return mismatchedFields.map((field) => ({
        code: "db_account_identity_mismatch",
        field,
        message: "Configured payment profile identity did not match the logged-in DB account; DB account value was kept.",
    }));
}
async function applyPaymentControlValue(control, value, options) {
    const normalize = options.normalize ?? normalizeUiText;
    const current = await readPaymentControlValue(control);
    if (normalize(current) === normalize(value)) {
        return "matched";
    }
    const tagName = await control
        .evaluate((element) => element.tagName.toLowerCase())
        .catch(() => "");
    if (tagName === "select") {
        if (await selectPaymentOption(control, value, normalize)) {
            return "filled";
        }
        return "missing";
    }
    const filled = await fillSensitiveTextControl(control, value, { timeout: 5000 })
        .then(() => true)
        .catch(() => false);
    return filled ? "filled" : "missing";
}
async function readPaymentControlValue(control) {
    return control
        .evaluate((element) => {
        if (element instanceof HTMLSelectElement) {
            const option = element.selectedOptions.item(0);
            return option?.label || option?.textContent || option?.value || "";
        }
        if (element instanceof HTMLInputElement ||
            element instanceof HTMLTextAreaElement) {
            return element.value;
        }
        return element.textContent ?? "";
    })
        .catch(() => "");
}
async function selectPaymentOption(control, value, normalize) {
    if (await control.selectOption({ label: value }).then(() => true).catch(() => false)) {
        return true;
    }
    if (await control.selectOption(value).then(() => true).catch(() => false)) {
        return true;
    }
    const options = await selectControlOptions(control);
    const normalizedTarget = normalizeOption(value);
    const option = options.find((entry) => {
        const candidates = [entry.label, entry.text, entry.value].map(normalizeOption);
        return candidates.some((candidate) => candidate === normalizedTarget ||
            candidate.includes(normalizedTarget) ||
            normalizedTarget.includes(candidate));
    });
    if (option && await selectOptionEntry(control, option)) {
        return true;
    }
    const normalizedValue = normalize(value);
    const normalizedOption = options.find((entry) => [entry.label, entry.text, entry.value].some((candidate) => normalize(candidate) === normalizedValue));
    if (normalizedOption && await selectOptionEntry(control, normalizedOption)) {
        return true;
    }
    return false;
}
async function selectControlOptions(control) {
    return control.locator("option").evaluateAll((nodes) => nodes.map((node) => {
        const option = node;
        return {
            value: option.value,
            label: option.label,
            text: option.textContent ?? "",
        };
    })).catch(() => []);
}
async function selectOptionEntry(control, option) {
    if (option.value) {
        return control.selectOption(option.value).then(() => true).catch(() => false);
    }
    if (option.label) {
        return control
            .selectOption({ label: option.label })
            .then(() => true)
            .catch(() => false);
    }
    if (option.text) {
        return control
            .selectOption({ label: option.text })
            .then(() => true)
            .catch(() => false);
    }
    return false;
}
async function paymentCheckboxIsChecked(control) {
    const checked = await control.isChecked().catch(() => undefined);
    if (checked !== undefined) {
        return checked;
    }
    return (await control.getAttribute("aria-checked").catch(() => "")) === "true";
}
async function stopAfterFareSelection(page, selectedJourney, selectedFare, offerContinue, customerDataContinue, paymentFill, paymentContinue) {
    const boundary = await detectCheckoutBoundary(page);
    const resultState = checkoutResultState(boundary, selectedJourney, selectedFare, offerContinue, customerDataContinue, paymentFill, paymentContinue);
    if (boundary.stage === "check_page") {
        return {
            stage: "check_page_review",
            finalSafetyStop: "check_page_review",
            needsUserAction: false,
            message: "stopped on DB check page before any final order action",
            ...resultState,
        };
    }
    if (boundary.finalOrderButtonVisible) {
        return {
            stage: "final_order_boundary",
            finalSafetyStop: "final_order_boundary",
            needsUserAction: false,
            message: "stopped before a legally binding final order button",
            ...resultState,
        };
    }
    if (boundary.paymentBoundaryVisible) {
        return {
            stage: "payment_boundary",
            finalSafetyStop: "payment_boundary",
            needsUserAction: false,
            message: paymentFill
                ? "stopped after payment-profile field handling before payment continuation"
                : "stopped at payment boundary before payment continuation",
            ...resultState,
        };
    }
    if (boundary.stage === "customer_data") {
        return {
            stage: "customer_data",
            finalSafetyStop: "customer_data",
            needsUserAction: false,
            message: "selected the configured journey and fare offer; stopped on customer data before payment",
            ...resultState,
        };
    }
    return {
        stage: boundary.stage === "offer_selection" ? "fare_selected" : boundary.stage,
        finalSafetyStop: "fare_selected",
        needsUserAction: false,
        message: selectedFare.alreadySelected
            ? "configured fare was already selected; stopped before passenger details"
            : "selected the configured journey and fare offer; stopped before passenger details",
        ...resultState,
    };
}
function checkoutResultState(boundary, ...args) {
    const [selectedJourney, selectedFare, offerContinue, customerDataContinue, paymentFill, paymentContinue,] = args;
    return {
        steps: checkoutSteps(...args),
        boundary,
        selectedJourney,
        selectedFare,
        offerContinue,
        customerDataContinue,
        paymentFill,
        paymentContinue,
    };
}
function checkoutSteps(selectedJourney, selectedFare, offerContinue, customerDataContinue, paymentFill, paymentContinue) {
    return [
        journeySelectionStep(selectedJourney),
        fareSelectionStep(selectedFare),
        ...(offerContinue ? [offerContinueStep(offerContinue)] : []),
        ...(customerDataContinue ? [customerDataContinueStep(customerDataContinue)] : []),
        ...(paymentFill ? [paymentFillStep(paymentFill)] : []),
        ...(paymentContinue ? [paymentContinueStep(paymentContinue)] : []),
    ];
}
function journeySelectionStep(selectedJourney) {
    return {
        stage: "search_results",
        action: selectedJourney.alreadySelected
            ? "already_on_offer_selection"
            : "clicked_journey_continue",
        requestedTrainLabel: selectedJourney.requestedTrainLabel,
        selectedIndex: selectedJourney.selectedIndex,
        trainLabels: selectedJourney.trainLabels,
        price: selectedJourney.price,
    };
}
function fareSelectionStep(selectedFare) {
    return {
        stage: "offer_selection",
        action: selectedFare.alreadySelected
            ? "already_selected_fare_offer"
            : "clicked_fare_select",
        requestedDefaultFare: selectedFare.requestedDefaultFare,
        selectedFare: selectedFare.selectedFare,
        selectedFareLabel: selectedFare.selectedFareLabel,
        fallbackUsed: Boolean(selectedFare.fallbackUsed),
        travelClass: selectedFare.travelClass,
        travelClassLabel: selectedFare.travelClassLabel,
        selectedIndex: selectedFare.selectedIndex,
        price: selectedFare.price,
    };
}
function offerContinueStep(offerContinue) {
    return {
        stage: offerContinue.stage,
        action: offerContinue.action,
        clickedText: offerContinue.clickedText,
    };
}
function customerDataContinueStep(customerDataContinue) {
    return {
        stage: customerDataContinue.stage,
        action: customerDataContinue.action,
        clickedText: customerDataContinue.clickedText,
        bookingFor: customerDataContinue.bookingFor,
        bookingForAction: customerDataContinue.bookingForAction,
    };
}
function paymentFillStep(paymentFill) {
    return {
        stage: paymentFill.stage,
        action: paymentFill.action,
        method: paymentFill.method,
        methodAction: paymentFill.methodAction,
        filledFields: paymentFill.filledFields,
        matchedFields: paymentFill.matchedFields,
        mismatchedFields: paymentFill.mismatchedFields,
        missingFields: paymentFill.missingFields,
        warnings: paymentFill.warnings,
        artifactCaptureSkipped: paymentFill.artifactCaptureSkipped,
    };
}
function paymentContinueStep(paymentContinue) {
    return {
        stage: paymentContinue.stage,
        action: paymentContinue.action,
        clickedText: paymentContinue.clickedText,
    };
}
function isOfferSelectionPage(value) {
    return /Offers/i.test(value) &&
        /Super\s+Sparpreis|Sparpreis|Flexpreis|Select/i.test(value);
}
function extractTrainLabels(value) {
    return Array.from(new Set(compactUiText(value).match(/\b(?:ICE|IC|EC|RE|RB|S)\s*\d+\b/gi) ?? []));
}
function extractPrice(value) {
    return /€\s?\d+[,.]\d{2}|\d+[,.]\d{2}\s?€/i.exec(value)?.[0];
}
async function detectCheckoutBoundary(page) {
    const body = await page.locator("body").innerText().catch(() => "");
    const visibleButtons = await visibleButtonTexts(page);
    const finalOrderButton = visibleButtons.find((text) => isFinalOrderText(text));
    const checkPageVisible = await isCheckPageReview(page);
    const paymentBoundaryVisible = !checkPageVisible && (/payment\s+method|payment\s+details|zahlungsart|zahlungsdaten|pay\s+with|credit\s+card|kreditkarte|paypal|sepa|card\s+number|kartennummer/i.test(body) || await page.locator('input[name*="card" i], input[id*="card" i], input[name*="iban" i], input[id*="iban" i]').first().isVisible({ timeout: 500 }).catch(() => false));
    return {
        stage: checkPageVisible ? "check_page" : inferCheckoutStage(body),
        paymentBoundaryVisible,
        finalOrderButtonVisible: Boolean(finalOrderButton),
        finalOrderButtonText: finalOrderButton,
    };
}
async function findSafeCheckoutNext(page) {
    const controls = await collectControlSnapshots(page, "button, a");
    const candidate = controls.find((control) => control.visible &&
        !isFinalOrderText(control.text) &&
        SAFE_CHECKOUT_NEXT_PATTERNS.some((pattern) => pattern.test(control.text)));
    if (!candidate) {
        return undefined;
    }
    const locator = page.locator("button, a").nth(candidate.index);
    return {
        text: candidate.text,
        click: () => locator.click({ timeout: 10000 }),
    };
}
async function findPaymentPageContinue(page) {
    const selector = "button, a, input[type='submit'], [role='button']";
    const controls = await collectControlSnapshots(page, selector, {
        preferInputValue: true,
    });
    const candidate = controls.find(isSafeContinueControl);
    if (!candidate) {
        return undefined;
    }
    const ranked = controls
        .filter(isSafeContinueControl)
        .sort((left, right) => right.rect.top - left.rect.top ||
        right.rect.left - left.rect.left ||
        right.rect.width * right.rect.height - left.rect.width * left.rect.height);
    const selected = ranked[0] ?? candidate;
    const locator = page.locator(selector).nth(selected.index);
    return {
        text: selected.text,
        click: async () => {
            await locator.scrollIntoViewIfNeeded({ timeout: 5000 }).catch(() => undefined);
            await locator.click({ timeout: 10000 });
        },
    };
}
async function waitForCheckOrFinalOrderProgress(page) {
    await page
        .waitForFunction((finalOrderSources) => {
        const url = window.location.href;
        const text = document.body?.innerText ?? "";
        const finalOrderPatterns = finalOrderSources.map((source) => new RegExp(source, "i"));
        return /\/(?:pruefen-buchen|prüfen-buchen|check)(?:[/?#]|$)/i.test(url) ||
            /check\s+(?:and\s+)?book|check\s+your\s+booking|review\s+your\s+booking|prüfen\s+und\s+buchen|pruefen\s+und\s+buchen|order\s+overview|booking\s+overview/i.test(text) ||
            /booking\s+will\s+be\s+made|complete\s+your\s+booking|confirm\s+payment|payment\s+summary/i.test(text) ||
            finalOrderPatterns.some((pattern) => pattern.test(text));
    }, FINAL_ORDER_PATTERNS.map((pattern) => pattern.source), { timeout: DEFAULT_BROWSER_TIMEOUT_MS })
        .catch(() => undefined);
}
async function visibleButtonTexts(page) {
    const controls = await collectControlSnapshots(page, "button, a");
    return controls
        .filter((entry) => entry.visible)
        .map((entry) => entry.text);
}
export function isFinalOrderText(value) {
    return FINAL_ORDER_PATTERNS.some((pattern) => pattern.test(value));
}
function inferCheckoutStage(body) {
    const normalized = body.replace(/\s+/g, " ");
    if (/payment\s+method|payment\s+details|zahlungsart|zahlungsdaten|credit\s+card|kreditkarte|paypal|sepa/i.test(normalized)) {
        return "payment_boundary";
    }
    if (/e-?mail\s+address|first\s+name|last\s+name|personal\s+details|reisendendaten|reisende\s+daten|kundendaten\s+eingeben|vorname|nachname/i.test(normalized)) {
        return "customer_data";
    }
    if (/super\s+sparpreis|sparpreis|flexpreis|saver\s+fare|standard\s+fare|select\s+fare|select\s+offer|angebot\s+auswählen|zur\s+buchung/i.test(normalized)) {
        return "offer_selection";
    }
    return "search_results";
}
async function fillStation(page, selector, value) {
    await page.locator(selector).first().fill(value);
    await page.waitForTimeout(1500);
    const exactOption = page
        .getByRole("option", { name: new RegExp(escapeRegExp(value), "i") })
        .first();
    if ((await exactOption.count()) > 0) {
        await exactOption.click().catch(() => undefined);
        return;
    }
    await page.keyboard.press("ArrowDown").catch(() => undefined);
    await page.keyboard.press("Enter").catch(() => undefined);
}
async function applyOutboundDateTime(page, params) {
    if (!params.service_date && !params.departure_time) {
        return { requested: false, applied: false };
    }
    await page.getByRole("button", { name: /Change outbound route/i }).first().click();
    await page.waitForTimeout(1000);
    if (params.service_date) {
        const parsed = parseServiceDate(params.service_date);
        await page.getByLabel(/^Day$/i).fill(parsed.day);
        await page.getByLabel(/^Month$/i).fill(parsed.month);
        await page.getByLabel(/^Year$/i).fill(parsed.year);
    }
    if (params.departure_time) {
        const parsed = parseDepartureTime(params.departure_time);
        await page.getByLabel(/^Hours$/i).fill(parsed.hours);
        await page.getByLabel(/^Minutes$/i).fill(parsed.minutes);
    }
    await page.getByRole("button", { name: /^Accept$/i }).click();
    await page.waitForTimeout(1000);
    return {
        requested: true,
        applied: true,
        serviceDate: params.service_date,
        departureTime: params.departure_time,
    };
}
function parseServiceDate(value) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
    if (!match) {
        throw new Error("service_date must use YYYY-MM-DD");
    }
    return {
        year: match[1],
        month: match[2],
        day: match[3],
    };
}
function parseDepartureTime(value) {
    const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
    if (!match) {
        throw new Error("departure_time must use HH:mm");
    }
    const hour = Number(match[1]);
    const minute = Number(match[2]);
    if (hour < 0 || hour > 23 || minute < 0 || minute > 59) {
        throw new Error("departure_time must be a valid local time");
    }
    return {
        hours: String(hour).padStart(2, "0"),
        minutes: String(minute).padStart(2, "0"),
    };
}
export function defaultCheckoutServiceDate(now = new Date()) {
    const target = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    return new Intl.DateTimeFormat("sv-SE", {
        timeZone: "Europe/Berlin",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
    }).format(target);
}
async function createTicketArtifactDir(config) {
    const workspace = resolveWorkspace(config);
    const artifactRoot = config.artifactRoot || path.join(workspace.root, "tmp");
    return createTimestampedArtifactDir(artifactRoot, "ticket-purchase-test-drive");
}
function createTicketArtifactCapture(params) {
    return {
        artifacts: [],
        testDrivePurchase: params.test_drive_purchase === true,
        nextArtifactIndex: 1,
    };
}
function ticketArtifactResult(artifactCapture) {
    return {
        artifactDir: artifactCapture.artifactDir,
        artifacts: artifactCapture.artifacts,
        testDrivePurchase: artifactCapture.testDrivePurchase,
    };
}
async function ensureTicketArtifactDir(config, artifactCapture) {
    artifactCapture.artifactDir ??= await createTicketArtifactDir(config);
    return artifactCapture.artifactDir;
}
async function captureTicketStage(page, config, artifactCapture, label) {
    if (!artifactCapture.testDrivePurchase) {
        return;
    }
    const artifactDir = await ensureTicketArtifactDir(config, artifactCapture);
    const stem = nextTicketArtifactStem(artifactCapture, label);
    artifactCapture.artifacts.push(await saveTicketPageText(page, artifactDir, stem));
    artifactCapture.artifacts.push(await saveTicketScreenshot(page, artifactDir, stem));
}
function nextTicketArtifactStem(artifactCapture, label) {
    const index = String(artifactCapture.nextArtifactIndex++).padStart(2, "0");
    return `${index}_ticket-${safeArtifactSegment(label)}`;
}
async function saveTicketPageText(page, artifactDir, stem) {
    const target = path.join(artifactDir, `${stem}.txt`);
    const text = await page.locator("body").innerText().catch(() => "");
    await fs.writeFile(target, `${text}\n`, "utf8");
    return target;
}
async function saveTicketScreenshot(page, artifactDir, stem) {
    const target = path.join(artifactDir, `${stem}.png`);
    await page.screenshot({ path: target, fullPage: true });
    return target;
}
async function saveTicketReviewScreenshot(page, config, artifactCapture, label) {
    const screenshot = await page.screenshot({ fullPage: true });
    const path = await savePurchaseReviewScreenshot(config, screenshot);
    artifactCapture.artifacts.push(path);
    if (artifactCapture.testDrivePurchase) {
        await saveTicketTestDriveScreenshot(config, artifactCapture, label, screenshot);
    }
    return {
        captured: true,
        path,
        mimeType: "image/png",
        sensitive: true,
        purpose: "ticket_checkout_review",
    };
}
async function savePurchaseReviewScreenshot(config, screenshot) {
    const target = path.join(await purchaseReviewArtifactDir(config), `ticket-checkout-review-${purchaseReviewTimestamp()}.png`);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, screenshot);
    return target;
}
async function purchaseReviewArtifactDir(config) {
    return configuredPurchaseArtifactsDir(config);
}
function purchaseReviewTimestamp(now = new Date()) {
    const pad = (value) => String(value).padStart(2, "0");
    return [
        now.getFullYear(),
        pad(now.getMonth() + 1),
        pad(now.getDate()),
    ].join("-") + "-" + [
        pad(now.getHours()),
        pad(now.getMinutes()),
        pad(now.getSeconds()),
    ].join("-");
}
async function saveTicketTestDriveScreenshot(config, artifactCapture, label, screenshot) {
    const artifactDir = await ensureTicketArtifactDir(config, artifactCapture);
    const target = path.join(artifactDir, `${nextTicketArtifactStem(artifactCapture, label)}.png`);
    await fs.writeFile(target, screenshot);
    artifactCapture.artifacts.push(target);
    return target;
}
async function visibleTicketControls(page) {
    const controls = await page.locator("input, select, textarea, button, a").evaluateAll((nodes) => nodes
        .map((el) => ({
        tag: el.tagName.toLowerCase(),
        id: el.id || undefined,
        name: el.getAttribute("name") || undefined,
        type: el.getAttribute("type") || undefined,
        text: (el.innerText || el.textContent || "")
            .trim()
            .replace(/\s+/g, " "),
        visible: Boolean(el.offsetWidth ||
            el.offsetHeight ||
            el.getClientRects().length),
    }))
        .filter((entry) => entry.visible || entry.id));
    return controls
        .filter((entry) => !isPrivateAccountControl(entry))
        .map((entry) => ({
        ...entry,
        text: redactControlText(entry.text),
    }))
        .slice(0, 120);
}
function normalizeBookingStationName(value) {
    const trimmed = value.trim();
    return STATION_ALIASES.get(trimmed.toLowerCase()) ?? trimmed;
}
function isPrivateAccountControl(entry) {
    const haystack = [entry.id, entry.name, entry.text]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
    return /login|logout|account|customer\s+account|mein\s+konto|profil|abmelden|businessprivate/.test(haystack);
}
function redactControlText(value) {
    return (value || "").replace(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi, "[redacted-email]");
}
function requiredString(value, field) {
    const trimmed = value?.trim();
    if (!trimmed) {
        throw new Error(`${field} is required`);
    }
    return trimmed;
}
function escapeRegExp(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

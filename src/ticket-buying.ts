import fs from "node:fs/promises";
import path from "node:path";

import { Type } from "typebox";
import type { Browser, BrowserContext, Page } from "playwright-core";

import { launchBrowser, resolveBrowserExecutablePath } from "./browser.js";
import {
  credentialsSummary,
  readSelectedCredentialsProfile,
} from "./credentials.js";
import { resolveCredentialUserDataDir } from "./access-browser.js";
import { performDbAccountLogin } from "./db-login.js";
import type { DBhopperConfig } from "./types.js";
import { resolveWorkspace } from "./workspace.js";

export const TICKET_BUYING_TOOL_NAMES = [
  "dbhopper_ticket_buying_research",
  "dbhopper_ticket_buying_dry_run",
  "dbhopper_ticket_checkout_dry_run",
] as const;

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
  safety:
    "DBhopper ticket buying is dry-run only. It may open DB's booking website, but it must not submit payment or finalize a purchase.",
  purchaseCandidates: [
    {
      name: "bahn.de/int.bahn.de browser flow",
      status: "best initial path",
      notes:
        "Official consumer path. Works with or without DB account; automation should stop before payment unless a later explicit confirmation gate exists.",
    },
    {
      name: "DB Navigator app",
      status: "manual or device-driven future path",
      notes:
        "Official app can book tickets shortly before departure, but app automation needs a real device/emulator and stronger safety gates.",
    },
    {
      name: "DB partner/PST interface",
      status: "partner-only research candidate",
      notes:
        "Public evidence indicates a partner booking interface exists, but it is not a self-service public DB API Marketplace product.",
    },
    {
      name: "bahn web JSON endpoints",
      status: "search/offers only",
      notes:
        "Useful for route and offer reconnaissance. Do not use private website APIs to finalize purchases without documented terms.",
    },
  ],
};

export function createTicketBuyingToolDefinitions(tool: any) {
  return [
    tool({
      name: "dbhopper_ticket_buying_research",
      label: "DBhopper Ticket Buying Research",
      description:
        "Return WIP ticket-buying interface candidates and safety constraints.",
      optional: true,
      parameters: Type.Object({}, { additionalProperties: false }),
      execute: () => ({
        ok: true,
        operation: "ticket_buying_research",
        research: TICKET_BUYING_RESEARCH_SUMMARY,
      }),
    }),
    tool({
      name: "dbhopper_ticket_buying_dry_run",
      label: "DBhopper Ticket Buying Dry Run",
      description:
        [
          "Test DB ticket-buying navigation for a replacement train.",
          "This is dry-run only and never submits payment.",
        ].join(" "),
      optional: true,
      parameters: Type.Object(
        {
          credentials_profile: Type.Optional(
            Type.String({
              description:
                "Optional TOML credentials file under assets/private/credentials/.",
            }),
          ),
          departure_station: Type.String(),
          arrival_station: Type.String(),
          service_date: Type.Optional(Type.String()),
          departure_time: Type.Optional(Type.String()),
          train_label: Type.Optional(Type.String()),
          open_browser: Type.Optional(
            Type.Boolean({
              default: false,
              description:
                "When true, open int.bahn.de and stop after search/results.",
            }),
          ),
          login_before_search: Type.Optional(
            Type.Boolean({
              default: false,
              description:
                "When true, log into the configured Bahn account before searching.",
            }),
          ),
          stay_logged_in: Type.Optional(
            Type.Boolean({
              default: true,
              description:
                "When logging in, check the stay-logged-in box if DB exposes it.",
            }),
          ),
          headless: Type.Optional(Type.Boolean()),
          include_controls: Type.Optional(Type.Boolean()),
        },
        { additionalProperties: false },
      ),
      execute: async (
        params: TicketBuyingDryRunParams,
        config: DBhopperConfig,
        context: { signal?: AbortSignal },
      ) => runTicketBuyingDryRun(params, config, context.signal),
    }),
    tool({
      name: "dbhopper_ticket_checkout_dry_run",
      label: "DBhopper Ticket Checkout Dry Run",
      description:
        [
          "Explore DB ticket checkout as far as safely possible.",
          "Never submits payment or clicks a legally binding order button.",
        ].join(" "),
      optional: true,
      parameters: Type.Object(
        {
          credentials_profile: Type.Optional(Type.String()),
          departure_station: Type.Optional(Type.String({
            default: DEFAULT_CHECKOUT_DEPARTURE,
          })),
          arrival_station: Type.Optional(Type.String({
            default: DEFAULT_CHECKOUT_ARRIVAL,
          })),
          service_date: Type.Optional(Type.String({
            description:
              "YYYY-MM-DD. Defaults to about one week after the run date.",
          })),
          departure_time: Type.Optional(Type.String({
            default: DEFAULT_CHECKOUT_TIME,
          })),
          login_before_search: Type.Optional(Type.Boolean({ default: true })),
          stay_logged_in: Type.Optional(Type.Boolean({ default: true })),
          open_browser: Type.Optional(Type.Boolean({
            default: false,
            description:
              "When false, return a deterministic plan without opening a browser.",
          })),
          headless: Type.Optional(Type.Boolean()),
          include_controls: Type.Optional(Type.Boolean()),
        },
        { additionalProperties: false },
      ),
      execute: async (
        params: TicketCheckoutDryRunParams,
        config: DBhopperConfig,
        context: { signal?: AbortSignal },
      ) => runTicketCheckoutDryRun(params, config, context.signal),
    }),
  ];
}

export async function runTicketBuyingDryRun(
  params: TicketBuyingDryRunParams,
  config: DBhopperConfig = {},
  signal?: AbortSignal,
) {
  let loadedCredentials: Awaited<ReturnType<typeof readSelectedCredentialsProfile>> =
    undefined;
  let stage = "credentials";

  try {
    loadedCredentials = await readSelectedCredentialsProfile(
      config,
      params.credentials_profile,
    );
    stage = "plan";
    const plan = ticketBuyingPlan(
      params,
      loadedCredentials?.credentials.browser?.userDataDir,
    );

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
  } catch (error) {
    return {
      ok: false,
      operation: "ticket_buying_dry_run",
      testing: true,
      stage,
      purchaseSubmitted: false,
      needsUserAction: true,
      message: error instanceof Error ? error.message : String(error),
      credentials: credentialsSummary(loadedCredentials),
      research: TICKET_BUYING_RESEARCH_SUMMARY,
    };
  }
}

export async function runTicketCheckoutDryRun(
  params: TicketCheckoutDryRunParams,
  config: DBhopperConfig = {},
  signal?: AbortSignal,
) {
  let loadedCredentials: Awaited<ReturnType<typeof readSelectedCredentialsProfile>> =
    undefined;
  let stage = "credentials";

  try {
    loadedCredentials = await readSelectedCredentialsProfile(
      config,
      params.credentials_profile,
    );
    stage = "plan";
    const plan = ticketCheckoutPlan(
      params,
      loadedCredentials?.credentials.browser?.userDataDir,
    );

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
        plan,
        research: TICKET_BUYING_RESEARCH_SUMMARY,
      };
    }

    return runBrowserTicketCheckout(params, config, plan, loadedCredentials, signal);
  } catch (error) {
    return {
      ok: false,
      operation: "ticket_checkout_dry_run",
      testing: true,
      stage,
      purchaseSubmitted: false,
      finalSafetyStop: "blocked",
      needsUserAction: true,
      message: error instanceof Error ? error.message : String(error),
      credentials: credentialsSummary(loadedCredentials),
      research: TICKET_BUYING_RESEARCH_SUMMARY,
    };
  }
}

export function ticketBuyingPlan(params: TicketBuyingDryRunParams, userDataDir?: string) {
  const departure = normalizeBookingStationName(
    requiredString(params.departure_station, "departure_station"),
  );
  const arrival = normalizeBookingStationName(
    requiredString(params.arrival_station, "arrival_station"),
  );
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

export function ticketCheckoutPlan(
  params: TicketCheckoutDryRunParams,
  userDataDir?: string,
  now = new Date(),
) {
  const serviceDate = params.service_date || defaultCheckoutServiceDate(now);
  const departure = normalizeBookingStationName(
    params.departure_station?.trim() || DEFAULT_CHECKOUT_DEPARTURE,
  );
  const arrival = normalizeBookingStationName(
    params.arrival_station?.trim() || DEFAULT_CHECKOUT_ARRIVAL,
  );
  const departureTime = params.departure_time?.trim() || DEFAULT_CHECKOUT_TIME;
  return {
    startUrl: DB_HOME_URL,
    target: {
      departureStation: departure,
      arrivalStation: arrival,
      serviceDate,
      departureTime,
    },
    browser: {
      canUsePersistentProfile: Boolean(userDataDir),
      userDataDir,
    },
    accountLogin: {
      loginBeforeSearch: params.login_before_search !== false,
      stayLoggedIn: params.stay_logged_in !== false,
    },
    safety: {
      mayEnterPaymentData: false,
      maySubmitPayment: false,
      mayClickFinalOrder: false,
      finalUnsafeButtonPatterns: FINAL_ORDER_PATTERNS.map((pattern) => pattern.source),
    },
    plannedStages: [
      "account_login",
      "search_results",
      "offer_selection",
      "customer_data",
      "payment_boundary",
      "final_order_boundary",
    ],
  };
}

async function runBrowserTicketSearch(
  params: TicketBuyingDryRunParams,
  config: DBhopperConfig,
  plan: ReturnType<typeof ticketBuyingPlan>,
  loadedCredentials: Awaited<ReturnType<typeof readSelectedCredentialsProfile>>,
  signal?: AbortSignal,
) {
  const artifactDir = await createTicketArtifactDir(config);
  const artifacts: string[] = [];
  let browser: Browser | undefined;
  let context: BrowserContext | undefined;
  let page: Page | undefined;
  let stage = "open_home";

  try {
    const browserSession = await openTicketBrowserSession(
      params,
      config,
      loadedCredentials,
    );
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
    await captureTicketStage(page, artifactDir, "home", artifacts);

    const login =
      params.login_before_search === true
        ? await performDbAccountLogin(
            page,
            loadedCredentials?.credentials.bahnAccount ?? {},
            {
              stayLoggedIn: params.stay_logged_in !== false,
              requireCredentialEntry: false,
            },
          )
        : { requested: false };
    if (params.login_before_search === true) {
      await captureTicketStage(page, artifactDir, "login", artifacts);
    }

    stage = "search_form";
    await fillStation(page, 'input[name="quickFinderBasic-von"]', plan.target.departureStation);
    await fillStation(page, 'input[name="quickFinderBasic-nach"]', plan.target.arrivalStation);
    const applied = {
      outboundDateTime: await applyOutboundDateTime(page, params),
    };
    await captureTicketStage(page, artifactDir, "search-form", artifacts);

    stage = "search_results";
    await page.getByRole("button", { name: /^Search$/i }).first().click();
    await page.waitForTimeout(8000);
    await captureTicketStage(page, artifactDir, "search-results", artifacts);

    const controls =
      params.include_controls === true ? await visibleTicketControls(page) : undefined;

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
        artifactDir,
        artifacts,
        login,
        applied,
        controls,
      },
      research: TICKET_BUYING_RESEARCH_SUMMARY,
    };
  } catch (error) {
    if (page) {
      try {
        await captureTicketStage(page, artifactDir, `blocked-${stage}`, artifacts);
      } catch {
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
      message: error instanceof Error ? error.message : String(error),
      credentials: credentialsSummary(loadedCredentials),
      plan,
      browserResult: {
        artifactDir,
        artifacts,
      },
      research: TICKET_BUYING_RESEARCH_SUMMARY,
    };
  } finally {
    await context?.close();
    await browser?.close();
  }
}

async function runBrowserTicketCheckout(
  params: TicketCheckoutDryRunParams,
  config: DBhopperConfig,
  plan: ReturnType<typeof ticketCheckoutPlan>,
  loadedCredentials: Awaited<ReturnType<typeof readSelectedCredentialsProfile>>,
  signal?: AbortSignal,
) {
  const artifactDir = await createTicketArtifactDir(config);
  const artifacts: string[] = [];
  let browser: Browser | undefined;
  let context: BrowserContext | undefined;
  let page: Page | undefined;
  let stage = "open_home";

  try {
    const browserSession = await openTicketBrowserSession(
      {
        credentials_profile: params.credentials_profile,
        departure_station: plan.target.departureStation,
        arrival_station: plan.target.arrivalStation,
        headless: params.headless,
      },
      config,
      loadedCredentials,
    );
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
    await captureTicketStage(page, artifactDir, "checkout-home", artifacts);

    const login =
      params.login_before_search !== false
        ? await performDbAccountLogin(
            page,
            loadedCredentials?.credentials.bahnAccount ?? {},
            {
              stayLoggedIn: params.stay_logged_in !== false,
              requireCredentialEntry: false,
            },
          )
        : { requested: false };
    if (params.login_before_search !== false) {
      await captureTicketStage(page, artifactDir, "checkout-login", artifacts);
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
    await captureTicketStage(page, artifactDir, "checkout-search-form", artifacts);

    stage = "search_results";
    await page.getByRole("button", { name: /^Search$/i }).first().click();
    await page.waitForTimeout(8000);
    await captureTicketStage(page, artifactDir, "checkout-search-results", artifacts);

    const checkout = await advanceCheckoutSafely(page, artifactDir, artifacts);
    stage = checkout.stage;
    const controls =
      params.include_controls === true ? await visibleTicketControls(page) : undefined;

    return {
      ok: true,
      operation: "ticket_checkout_dry_run",
      testing: true,
      stage,
      purchaseSubmitted: false,
      finalSafetyStop: checkout.finalSafetyStop,
      needsUserAction: checkout.needsUserAction,
      message: checkout.message,
      credentials: credentialsSummary(loadedCredentials),
      plan,
      browserResult: {
        url: page.url(),
        title: await page.title(),
        artifactDir,
        artifacts,
        login,
        applied,
        checkout,
        controls,
      },
      research: TICKET_BUYING_RESEARCH_SUMMARY,
    };
  } catch (error) {
    if (page) {
      try {
        await captureTicketStage(page, artifactDir, `blocked-${stage}`, artifacts);
      } catch {}
    }
    return {
      ok: false,
      operation: "ticket_checkout_dry_run",
      testing: true,
      stage,
      purchaseSubmitted: false,
      finalSafetyStop: "blocked",
      needsUserAction: true,
      message: error instanceof Error ? error.message : String(error),
      credentials: credentialsSummary(loadedCredentials),
      plan,
      browserResult: {
        artifactDir,
        artifacts,
      },
      research: TICKET_BUYING_RESEARCH_SUMMARY,
    };
  } finally {
    await context?.close();
    await browser?.close();
  }
}

async function openTicketBrowserSession(
  params: TicketBuyingDryRunParams,
  config: DBhopperConfig,
  loadedCredentials: Awaited<ReturnType<typeof readSelectedCredentialsProfile>>,
) {
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

async function advanceCheckoutSafely(
  page: Page,
  artifactDir: string,
  artifacts: string[],
) {
  const steps: Array<{
    stage: string;
    action: string;
    clickedText?: string;
    boundary?: string;
  }> = [];

  for (let index = 0; index < 5; index += 1) {
    const boundary = await detectCheckoutBoundary(page);
    if (boundary.finalOrderButtonVisible) {
      return {
        stage: "final_order_boundary",
        finalSafetyStop: "final_order_boundary",
        needsUserAction: false,
        message: "stopped before a legally binding final order button",
        steps,
        boundary,
      };
    }
    if (boundary.paymentBoundaryVisible) {
      return {
        stage: "payment_boundary",
        finalSafetyStop: "payment_boundary",
        needsUserAction: false,
        message: "stopped before entering payment data",
        steps,
        boundary,
      };
    }

    const next = await findSafeCheckoutNext(page);
    if (!next) {
      return {
        stage: boundary.stage,
        finalSafetyStop: "no_safe_next_step",
        needsUserAction: true,
        message: "no safe checkout continuation control was found",
        steps,
        boundary,
      };
    }

    await next.click();
    steps.push({
      stage: boundary.stage,
      action: "clicked_safe_next",
      clickedText: next.text,
    });
    await page.waitForTimeout(5000);
    await captureTicketStage(page, artifactDir, `checkout-${index + 1}`, artifacts);
  }

  const boundary = await detectCheckoutBoundary(page);
  return {
    stage: boundary.stage,
    finalSafetyStop: "step_limit",
    needsUserAction: true,
    message: "stopped after safe checkout exploration step limit",
    steps,
    boundary,
  };
}

async function detectCheckoutBoundary(page: Page) {
  const body = await page.locator("body").innerText().catch(() => "");
  const visibleButtons = await visibleButtonTexts(page);
  const finalOrderButton = visibleButtons.find((text) => isFinalOrderText(text));
  const paymentBoundaryVisible =
    /payment\s+method|payment\s+details|zahlungsart|zahlungsdaten|pay\s+with|credit\s+card|kreditkarte|paypal|sepa|card\s+number|kartennummer/i.test(
      body,
    ) || await page.locator(
      'input[name*="card" i], input[id*="card" i], input[name*="iban" i], input[id*="iban" i]',
    ).first().isVisible({ timeout: 500 }).catch(() => false);

  return {
    stage: inferCheckoutStage(body),
    paymentBoundaryVisible,
    finalOrderButtonVisible: Boolean(finalOrderButton),
    finalOrderButtonText: finalOrderButton,
  };
}

async function findSafeCheckoutNext(page: Page) {
  const controls = await page.locator("button, a").evaluateAll((nodes) =>
    nodes.map((node, index) => ({
      index,
      text: ((node as HTMLElement).innerText || node.textContent || "")
        .trim()
        .replace(/\s+/g, " "),
      visible: Boolean(
        (node as HTMLElement).offsetWidth ||
          (node as HTMLElement).offsetHeight ||
          node.getClientRects().length,
      ),
    })),
  );
  const candidate = controls.find((control) =>
    control.visible &&
    !isFinalOrderText(control.text) &&
    SAFE_CHECKOUT_NEXT_PATTERNS.some((pattern) => pattern.test(control.text)),
  );
  if (!candidate) {
    return undefined;
  }
  const locator = page.locator("button, a").nth(candidate.index);
  return {
    text: candidate.text,
    click: () => locator.click({ timeout: 10000 }),
  };
}

async function visibleButtonTexts(page: Page) {
  return page.locator("button, a").evaluateAll((nodes) =>
    nodes
      .map((node) => ({
        text: ((node as HTMLElement).innerText || node.textContent || "")
          .trim()
          .replace(/\s+/g, " "),
        visible: Boolean(
          (node as HTMLElement).offsetWidth ||
            (node as HTMLElement).offsetHeight ||
            node.getClientRects().length,
        ),
      }))
      .filter((entry) => entry.visible)
      .map((entry) => entry.text),
  );
}

export function isFinalOrderText(value: string) {
  return FINAL_ORDER_PATTERNS.some((pattern) => pattern.test(value));
}

function inferCheckoutStage(body: string) {
  const normalized = body.replace(/\s+/g, " ");
  if (/payment\s+method|payment\s+details|zahlungsart|zahlungsdaten|credit\s+card|kreditkarte|paypal|sepa/i.test(normalized)) {
    return "payment_boundary";
  }
  if (/e-?mail\s+address|first\s+name|last\s+name|passenger\s+details|traveller\s+details|personal\s+details|reisendendaten|reisende\s+daten|kundendaten\s+eingeben|vorname|nachname/i.test(normalized)) {
    return "customer_data";
  }
  if (/super\s+sparpreis|sparpreis|flexpreis|saver\s+fare|standard\s+fare|select\s+fare|select\s+offer|angebot\s+auswählen|zur\s+buchung/i.test(normalized)) {
    return "offer_selection";
  }
  return "search_results";
}

async function fillStation(page: Page, selector: string, value: string) {
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

async function applyOutboundDateTime(page: Page, params: TicketBuyingDryRunParams) {
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

function parseServiceDate(value: string) {
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

function parseDepartureTime(value: string) {
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

async function createTicketArtifactDir(config: DBhopperConfig) {
  const workspace = resolveWorkspace(config);
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const artifactRoot = config.artifactRoot || path.join(workspace.root, "tmp");
  const artifactDir = path.join(artifactRoot, `ticket-buying-dry-run-${timestamp}`);
  await fs.mkdir(artifactDir, { recursive: true });
  return artifactDir;
}

async function captureTicketStage(
  page: Page,
  artifactDir: string,
  label: string,
  artifacts: string[],
) {
  artifacts.push(await saveTicketPageText(page, artifactDir, label));
  artifacts.push(await saveTicketScreenshot(page, artifactDir, label));
}

async function saveTicketPageText(page: Page, artifactDir: string, label: string) {
  const target = path.join(artifactDir, `ticket-${safeArtifactLabel(label)}.txt`);
  const text = await page.locator("body").innerText().catch(() => "");
  await fs.writeFile(target, `${text}\n`, "utf8");
  return target;
}

async function saveTicketScreenshot(page: Page, artifactDir: string, label: string) {
  const target = path.join(artifactDir, `ticket-${safeArtifactLabel(label)}.png`);
  await page.screenshot({ path: target, fullPage: true });
  return target;
}

async function visibleTicketControls(page: Page) {
  const controls = await page.locator("input, select, textarea, button, a").evaluateAll((nodes) =>
    nodes
      .map((el) => ({
        tag: el.tagName.toLowerCase(),
        id: (el as HTMLElement).id || undefined,
        name: el.getAttribute("name") || undefined,
        type: el.getAttribute("type") || undefined,
        text: ((el as HTMLElement).innerText || el.textContent || "")
          .trim()
          .replace(/\s+/g, " "),
        visible: Boolean(
          (el as HTMLElement).offsetWidth ||
            (el as HTMLElement).offsetHeight ||
          el.getClientRects().length,
        ),
      }))
      .filter((entry) => entry.visible || entry.id),
  );
  return controls
    .filter((entry) => !isPrivateAccountControl(entry))
    .map((entry) => ({
      ...entry,
      text: redactControlText(entry.text),
    }))
    .slice(0, 120);
}

function normalizeBookingStationName(value: string) {
  const trimmed = value.trim();
  return STATION_ALIASES.get(trimmed.toLowerCase()) ?? trimmed;
}

function isPrivateAccountControl(entry: {
  id?: string;
  name?: string;
  text?: string;
}) {
  const haystack = [entry.id, entry.name, entry.text]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return /login|logout|account|customer\s+account|mein\s+konto|profil|abmelden|businessprivate/.test(
    haystack,
  );
}

function redactControlText(value?: string) {
  return (value || "").replace(
    /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi,
    "[redacted-email]",
  );
}

function requiredString(value: string | undefined, field: string) {
  const trimmed = value?.trim();
  if (!trimmed) {
    throw new Error(`${field} is required`);
  }
  return trimmed;
}

function safeArtifactLabel(value: string) {
  return value.replace(/[^a-z0-9._-]+/gi, "-").replace(/-+/g, "-").toLowerCase();
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

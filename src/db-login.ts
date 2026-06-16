import type { Locator, Page } from "playwright-core";

import { fillSensitiveTextControl } from "./sensitive-input.js";

export interface DBAccountCredentials {
  username?: string;
  password?: string;
}

export interface DBAccountLoginOptions {
  stayLoggedIn?: boolean;
  requireCredentialEntry?: boolean;
}

export interface DBAccountLoginResult {
  requested: boolean;
  ok: boolean;
  loginOpened: boolean;
  alreadyLoggedIn: boolean;
  usernameSubmitted: boolean;
  passwordSubmitted: boolean;
  selectedCredentialsSubmitted: boolean;
  needsUserAction: boolean;
  credentialProof:
    | "selected_credentials_submitted"
    | "not_proven_existing_session"
    | "not_proven_missing_login_form"
    | "not_proven_invalid_username"
    | "not_proven_invalid_password"
    | "not_proven_invalid_credentials"
    | "not_proven_blocked_by_user_action";
  credentialRejected?: boolean;
  credentialRejectionStage?: CredentialRejectionStage;
  credentialRejectionReason?: CredentialRejectionReason;
  usernameRejected?: boolean;
  usernameRejectionReason?: UsernameRejectionReason;
  passwordRejected?: boolean;
  passwordRejectionReason?: PasswordRejectionReason;
  credentialCombinationRejected?: boolean;
  stayLoggedIn: StayLoggedInResult;
  message?: string;
}

export type UsernameRejectionReason = "invalid_format" | "unknown_username";
export type PasswordRejectionReason =
  | "incorrect_password"
  | "username_password_mismatch";
export type CredentialRejectionStage = "username" | "password" | "combination";
export type CredentialRejectionReason =
  | "invalid_username_format"
  | "unknown_username"
  | PasswordRejectionReason;

export interface StayLoggedInResult {
  requested: boolean;
  found: boolean;
  checked: boolean;
  alreadyChecked: boolean;
  method?: string;
  label?: string;
  selector?: string;
}

export const STAY_LOGGED_IN_LABELS = [
  "Stay logged in",
  "Stay signed in",
  "Remember me",
  "Angemeldet bleiben",
  "Eingeloggt bleiben",
] as const;

const STAY_LOGGED_IN_SELECTORS = [
  "#rememberMe--checkbox",
  'input[name="rememberMe"]',
  'input[type="checkbox"][id*="remember" i]',
  'input[type="checkbox"][name*="remember" i]',
  'input[type="checkbox"][id*="stay" i]',
  'input[type="checkbox"][name*="stay" i]',
];

const LOGIN_CONTROL_SELECTORS = [
  "#js-login-nav",
  'a[href*="login"]',
  'button:has-text("Log in")',
  'a:has-text("Log in")',
  'button:has-text("Login")',
  'a:has-text("Login")',
  'button:has-text("Anmelden")',
  'a:has-text("Anmelden")',
  'button:has-text("Continue")',
  'a:has-text("Continue")',
  'button:has-text("Weiter")',
  'a:has-text("Weiter")',
];

const USERNAME_SELECTORS = [
  'input[type="email"]',
  'input[name="username"]',
  'input[autocomplete="username"]',
  'input[id*="username" i]',
  'input[placeholder*="email" i]',
  'input[aria-label*="email" i]',
  'input[type="text"]',
];

const USERNAME_SUBMIT_SELECTORS = [
  'button[type="submit"]',
  'button:has-text("Log in/Register")',
  'button:has-text("Einloggen/Registrieren")',
  'button:has-text("Continue")',
  'button:has-text("Next")',
  'button:has-text("Weiter")',
  'button:has-text("Anmelden")',
];

const PASSWORD_SELECTORS = [
  'input[type="password"]',
  'input[name="password"]',
  'input[id*="password" i]',
  'input[autocomplete="current-password"]',
];

const PASSWORD_SUBMIT_SELECTORS = [
  'button[type="submit"]',
  'button:has-text("Log in")',
  'button:has-text("Login")',
  'button:has-text("Einloggen")',
  'button:has-text("Anmelden")',
  'button:has-text("Weiter")',
];

const ACCOUNT_MENU_SELECTORS = [
  "#js-login-nav",
  '[aria-label*="account" i]',
  '[aria-label*="profile" i]',
  'button:has-text("My Bahn")',
  'a:has-text("My Bahn")',
  'button:has-text("Meine Bahn")',
  'a:has-text("Meine Bahn")',
  'button:has-text("Account")',
  'a:has-text("Account")',
];

const LOGOUT_SELECTORS = [
  'button:has-text("Log out")',
  'a:has-text("Log out")',
  'button:has-text("Logout")',
  'a:has-text("Logout")',
  'button:has-text("Sign out")',
  'a:has-text("Sign out")',
  'button:has-text("Abmelden")',
  'a:has-text("Abmelden")',
];

export function isStayLoggedInLabel(value: string) {
  return /^(stay\s+(logged|signed)\s+in|remember\s+me|angemeldet\s+bleiben|eingeloggt\s+bleiben)$/i.test(
    value.trim(),
  );
}

export function classifyDbUsernameRejectionText(
  value: string,
): UsernameRejectionReason | undefined {
  const text = value.replace(/\s+/g, " ").trim().toLowerCase();
  if (
    /please enter a valid e-?mail address/.test(text) ||
    /enter a valid email address/.test(text) ||
    /bitte geben sie eine g(?:ü|ue)ltige e-?mail-adresse ein/.test(text) ||
    /g(?:ü|ue)ltige e-?mail-adresse/.test(text)
  ) {
    return "invalid_format";
  }
  if (
    /no account (?:was )?found/.test(text) ||
    /account .*not found/.test(text) ||
    /unknown (?:user|username|email|e-?mail)/.test(text) ||
    /not registered/.test(text) ||
    /kein(?:e[rs]?)? konto .*gefunden/.test(text) ||
    /konto .*nicht gefunden/.test(text) ||
    /unbekannte[rs]? (?:benutzer|benutzername|e-?mail)/.test(text) ||
    /nicht registriert/.test(text)
  ) {
    return "unknown_username";
  }
  return undefined;
}

export function classifyDbPasswordRejectionText(
  value: string,
): PasswordRejectionReason | undefined {
  const text = value.replace(/\s+/g, " ").trim().toLowerCase();
  if (
    /(?:user(?:name)?|e-?mail(?: address)?) .* password .* (?:incorrect|invalid|wrong)/.test(
      text,
    ) ||
    /(?:incorrect|invalid|wrong) .*(?:user(?:name)?|e-?mail(?: address)?) .* password/.test(
      text,
    ) ||
    /login (?:data|details|credentials) .* (?:incorrect|invalid|wrong)/.test(text) ||
    /(?:benutzer(?:name)?|e-?mail(?:-adresse)?) .* passwort .* (?:falsch|ung(?:ü|ue)ltig|nicht korrekt)/.test(
      text,
    ) ||
    /(?:anmelde|zugangs)daten .* (?:falsch|ung(?:ü|ue)ltig|nicht korrekt)/.test(
      text,
    )
  ) {
    return "username_password_mismatch";
  }
  if (
    /password .*incorrect/.test(text) ||
    /incorrect password/.test(text) ||
    /password entered is incorrect/.test(text) ||
    /passwort .*falsch/.test(text) ||
    /falsches passwort/.test(text) ||
    /kennwort .*falsch/.test(text) ||
    /passwort .*nicht korrekt/.test(text)
  ) {
    return "incorrect_password";
  }
  return undefined;
}

export async function performDbAccountLogin(
  page: Page,
  credentials: DBAccountCredentials,
  options: DBAccountLoginOptions = {},
): Promise<DBAccountLoginResult> {
  const stayLoggedInRequested = options.stayLoggedIn !== false;
  const requireCredentialEntry = options.requireCredentialEntry !== false;
  const emptyStayLoggedIn = {
    requested: stayLoggedInRequested,
    found: false,
    checked: false,
    alreadyChecked: false,
  };
  if (!credentials.username || !credentials.password) {
    return {
      requested: true,
      ok: false,
      loginOpened: false,
      alreadyLoggedIn: false,
      usernameSubmitted: false,
      passwordSubmitted: false,
      selectedCredentialsSubmitted: false,
      needsUserAction: true,
      credentialProof: "not_proven_missing_login_form",
      stayLoggedIn: emptyStayLoggedIn,
      message: "selected credential profile has no account username/password",
    };
  }

  let loginOpened = false;
  if (!(await hasVisible(page, USERNAME_SELECTORS))) {
    loginOpened = await clickFirstVisible(page, LOGIN_CONTROL_SELECTORS);
    if (loginOpened) {
      await page.waitForTimeout(3000);
      await waitForAnySelector(page, USERNAME_SELECTORS, 8000);
    }
  }
  if (!(await hasVisible(page, USERNAME_SELECTORS)) && requireCredentialEntry) {
    const reloginReady = await prepareCredentialEntryFromExistingSession(page);
    loginOpened = loginOpened || reloginReady;
  }

  if (!(await hasVisible(page, USERNAME_SELECTORS))) {
    const existingSession = await pageLooksAuthenticated(page);
    return {
      requested: true,
      ok: !requireCredentialEntry || existingSession,
      loginOpened,
      alreadyLoggedIn: existingSession || !loginOpened,
      usernameSubmitted: false,
      passwordSubmitted: false,
      selectedCredentialsSubmitted: false,
      needsUserAction: requireCredentialEntry,
      credentialProof: existingSession || !loginOpened
        ? "not_proven_existing_session"
        : "not_proven_missing_login_form",
      stayLoggedIn: emptyStayLoggedIn,
      message: existingSession
        ? "existing session prevented credential-entry proof"
        : loginOpened
        ? "login opened but no username field was found"
        : "existing session or page state prevented credential-entry proof",
    };
  }

  const usernameSubmitted = await fillFirstVisible(
    page,
    USERNAME_SELECTORS,
    credentials.username,
  );
  if (!usernameSubmitted) {
    return {
      requested: true,
      ok: false,
      loginOpened,
      alreadyLoggedIn: false,
      usernameSubmitted: false,
      passwordSubmitted: false,
      selectedCredentialsSubmitted: false,
      needsUserAction: true,
      credentialProof: "not_proven_missing_login_form",
      stayLoggedIn: emptyStayLoggedIn,
      message: "username field disappeared before it could be filled",
    };
  }

  const usernameClicked = await clickFirstVisible(page, USERNAME_SUBMIT_SELECTORS);
  if (!usernameClicked) {
    return {
      requested: true,
      ok: false,
      loginOpened,
      alreadyLoggedIn: false,
      usernameSubmitted,
      passwordSubmitted: false,
      selectedCredentialsSubmitted: false,
      needsUserAction: true,
      credentialProof: "not_proven_missing_login_form",
      stayLoggedIn: emptyStayLoggedIn,
      message: "could not submit username",
    };
  }

  await page.waitForTimeout(3500);
  await waitForAnySelector(page, PASSWORD_SELECTORS, 8000);
  if (!(await hasVisible(page, PASSWORD_SELECTORS))) {
    const usernameRejectionReason = await pageUsernameRejectionReason(page);
    if (usernameRejectionReason) {
      return {
        requested: true,
        ok: false,
        loginOpened: true,
        alreadyLoggedIn: false,
        usernameSubmitted,
        passwordSubmitted: false,
        selectedCredentialsSubmitted: false,
        needsUserAction: true,
        credentialProof: "not_proven_invalid_username",
        credentialRejected: true,
        credentialRejectionStage: "username",
        credentialRejectionReason: credentialReasonFromUsername(
          usernameRejectionReason,
        ),
        usernameRejected: true,
        usernameRejectionReason,
        stayLoggedIn: emptyStayLoggedIn,
        message:
          usernameRejectionReason === "invalid_format"
            ? "DB rejected the selected account username as an invalid email address"
            : "DB rejected the selected account username as unknown or unregistered",
      };
    }
  }
  if (!(await hasVisible(page, PASSWORD_SELECTORS)) && await pageNeedsUserAction(page)) {
    return {
      requested: true,
      ok: false,
      loginOpened: true,
      alreadyLoggedIn: false,
      usernameSubmitted,
      passwordSubmitted: false,
      selectedCredentialsSubmitted: false,
      needsUserAction: true,
      credentialProof: "not_proven_blocked_by_user_action",
      stayLoggedIn: emptyStayLoggedIn,
      message: "login requires captcha, passkey, verification, or another user action",
    };
  }

  const stayLoggedIn = await checkStayLoggedInIfPresent(
    page,
    stayLoggedInRequested,
  );
  const passwordFilled = await fillFirstVisible(
    page,
    PASSWORD_SELECTORS,
    credentials.password,
  );
  if (!passwordFilled) {
    return {
      requested: true,
      ok: false,
      loginOpened: true,
      alreadyLoggedIn: false,
      usernameSubmitted,
      passwordSubmitted: false,
      selectedCredentialsSubmitted: false,
      needsUserAction: true,
      credentialProof: "not_proven_missing_login_form",
      stayLoggedIn,
      message: "could not find password field after username submission",
    };
  }

  const passwordSubmitted = await clickFirstVisible(page, PASSWORD_SUBMIT_SELECTORS);
  await page.waitForTimeout(6000);
  const passwordRejectionReason = await pagePasswordRejectionReason(page);
  if (passwordRejectionReason) {
    const isCombination = passwordRejectionReason === "username_password_mismatch";
    return {
      requested: true,
      ok: false,
      loginOpened: true,
      alreadyLoggedIn: false,
      usernameSubmitted,
      passwordSubmitted,
      selectedCredentialsSubmitted: usernameSubmitted && passwordSubmitted,
      needsUserAction: true,
      credentialProof: isCombination
        ? "not_proven_invalid_credentials"
        : "not_proven_invalid_password",
      credentialRejected: true,
      credentialRejectionStage: isCombination ? "combination" : "password",
      credentialRejectionReason: passwordRejectionReason,
      passwordRejected: !isCombination,
      passwordRejectionReason,
      credentialCombinationRejected: true,
      stayLoggedIn,
      message: isCombination
        ? "DB rejected the selected username/password combination"
        : "DB rejected the selected account password",
    };
  }
  const finalNeedsUserAction = await pageNeedsUserAction(page);
  const hasError = await pageHasError(page);
  const ok = passwordSubmitted && !finalNeedsUserAction && !hasError;

  return {
    requested: true,
    ok,
    loginOpened: true,
    alreadyLoggedIn: false,
    usernameSubmitted,
    passwordSubmitted,
    selectedCredentialsSubmitted: usernameSubmitted && passwordSubmitted,
    needsUserAction: finalNeedsUserAction,
    credentialProof: usernameSubmitted && passwordSubmitted
      ? "selected_credentials_submitted"
      : "not_proven_missing_login_form",
    stayLoggedIn,
    message: ok
      ? "selected credentials were submitted to DB account login"
      : "selected credentials were submitted, but login success was not confirmed",
  };
}

export async function checkStayLoggedInIfPresent(
  page: Page,
  requested = true,
): Promise<StayLoggedInResult> {
  if (!requested) {
    return {
      requested: false,
      found: false,
      checked: false,
      alreadyChecked: false,
    };
  }

  for (const label of STAY_LOGGED_IN_LABELS) {
    const result = await checkCheckbox(page.getByLabel(label).first(), {
      method: "label",
      label,
    });
    if (result) {
      return result;
    }
  }

  for (const selector of STAY_LOGGED_IN_SELECTORS) {
    const result = await checkCheckbox(page.locator(selector).first(), {
      method: "selector",
      selector,
    });
    if (result) {
      return result;
    }
  }

  return {
    requested: true,
    found: false,
    checked: false,
    alreadyChecked: false,
  };
}

async function checkCheckbox(
  locator: Locator,
  metadata: Pick<StayLoggedInResult, "method" | "label" | "selector">,
): Promise<StayLoggedInResult | undefined> {
  try {
    if ((await locator.count()) === 0) {
      return undefined;
    }
    if (!(await locator.isVisible({ timeout: 1000 }))) {
      return undefined;
    }
    const alreadyChecked = await locator.isChecked();
    if (!alreadyChecked) {
      await locator.check({ timeout: 5000 });
    }
    return {
      requested: true,
      found: true,
      checked: true,
      alreadyChecked,
      ...metadata,
    };
  } catch {
    return undefined;
  }
}

async function prepareCredentialEntryFromExistingSession(page: Page) {
  if (await clickFirstVisible(page, LOGOUT_SELECTORS)) {
    await page.waitForTimeout(3000);
    const opened = await clickFirstVisible(page, LOGIN_CONTROL_SELECTORS);
    if (opened) {
      await waitForAnySelector(page, USERNAME_SELECTORS, 8000);
    }
    return opened;
  }
  await clickFirstVisible(page, ACCOUNT_MENU_SELECTORS);
  await page.waitForTimeout(1500);
  if (!(await clickFirstVisible(page, LOGOUT_SELECTORS))) {
    return false;
  }
  await page.waitForTimeout(3000);
  const opened = await clickFirstVisible(page, LOGIN_CONTROL_SELECTORS);
  if (opened) {
    await waitForAnySelector(page, USERNAME_SELECTORS, 8000);
  }
  return opened;
}

async function clickFirstVisible(page: Page, selectors: string[]) {
  for (const selector of selectors) {
    const locator = page.locator(selector).first();
    try {
      if ((await locator.count()) > 0 && await locator.isVisible({ timeout: 1000 })) {
        await locator.click({ timeout: 10000 });
        return true;
      }
    } catch {}
  }
  return false;
}

async function fillFirstVisible(page: Page, selectors: string[], value: string) {
  for (const selector of selectors) {
    const locator = page.locator(selector).first();
    try {
      if ((await locator.count()) > 0 && await locator.isVisible({ timeout: 1000 })) {
        await fillSensitiveTextControl(locator, value, { timeout: 10000 });
        return true;
      }
    } catch {}
  }
  return false;
}

async function hasVisible(page: Page, selectors: string[]) {
  for (const selector of selectors) {
    const locator = page.locator(selector).first();
    try {
      if ((await locator.count()) > 0 && await locator.isVisible({ timeout: 1000 })) {
        return true;
      }
    } catch {}
  }
  return false;
}

async function waitForAnySelector(page: Page, selectors: string[], timeout: number) {
  await page.waitForSelector(selectors.join(","), { timeout }).catch(() => undefined);
}

async function pageNeedsUserAction(page: Page) {
  const text = await page.locator("body").innerText({ timeout: 3000 }).catch(() => "");
  return /captcha|passkey|verification code|security code|two-factor|2fa|mfa|sicherheitscode|authenticator/i.test(
    text,
  );
}

async function pageHasError(page: Page) {
  const text = await page.locator("body").innerText({ timeout: 3000 }).catch(() => "");
  return /invalid|incorrect|unauthorized|fehler|ungültig|falsch|nicht korrekt|error/i.test(
    text,
  );
}

async function pageUsernameRejectionReason(page: Page) {
  const text = await page.locator("body").innerText({ timeout: 3000 }).catch(() => "");
  return classifyDbUsernameRejectionText(text);
}

async function pagePasswordRejectionReason(page: Page) {
  const text = await page.locator("body").innerText({ timeout: 3000 }).catch(() => "");
  return classifyDbPasswordRejectionText(text);
}

async function pageLooksAuthenticated(page: Page) {
  const text = await page.locator("body").innerText({ timeout: 3000 }).catch(() => "");
  return /logout|log out|sign out|abmelden|my bahn|meine bahn|applications|anwendungen|account|konto/i.test(
    text,
  );
}

function credentialReasonFromUsername(
  reason: UsernameRejectionReason,
): CredentialRejectionReason {
  return reason === "invalid_format" ? "invalid_username_format" : reason;
}

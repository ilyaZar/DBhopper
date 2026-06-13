import type { Page } from "playwright-core";
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
    credentialProof: "selected_credentials_submitted" | "not_proven_existing_session" | "not_proven_missing_login_form" | "not_proven_invalid_username" | "not_proven_invalid_password" | "not_proven_invalid_credentials" | "not_proven_blocked_by_user_action";
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
export type PasswordRejectionReason = "incorrect_password" | "username_password_mismatch";
export type CredentialRejectionStage = "username" | "password" | "combination";
export type CredentialRejectionReason = "invalid_username_format" | "unknown_username" | PasswordRejectionReason;
export interface StayLoggedInResult {
    requested: boolean;
    found: boolean;
    checked: boolean;
    alreadyChecked: boolean;
    method?: string;
    label?: string;
    selector?: string;
}
export declare const STAY_LOGGED_IN_LABELS: readonly ["Stay logged in", "Stay signed in", "Remember me", "Angemeldet bleiben", "Eingeloggt bleiben"];
export declare function isStayLoggedInLabel(value: string): boolean;
export declare function classifyDbUsernameRejectionText(value: string): UsernameRejectionReason | undefined;
export declare function classifyDbPasswordRejectionText(value: string): PasswordRejectionReason | undefined;
export declare function performDbAccountLogin(page: Page, credentials: DBAccountCredentials, options?: DBAccountLoginOptions): Promise<DBAccountLoginResult>;
export declare function checkStayLoggedInIfPresent(page: Page, requested?: boolean): Promise<StayLoggedInResult>;

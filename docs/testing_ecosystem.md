# Testing Ecosystem

DBhopper testing is split between deterministic local validation, browser
access checks, direct API probes, and safety-bounded browser dry runs. Tool
outputs must already be cleaned by plugin code; agents should not need to
interpret screenshots or raw page text to decide whether a check passed.
General account validity is checked through separate DB passenger website,
DB API Marketplace browser, and DB Timetables API-key probes.

## Local Commands

Run these before packaging or publishing:

```bash
npm test
npm run package:check
npm pack --dry-run --json --ignore-scripts
```

`npm test` rebuilds `dist/` and runs the node test suite. The package check
verifies the plugin metadata and keeps runtime private data out of the package
file list.

## Settings And Credentials

Use `dbhopper_private_settings_status` to check the selected credential and
profile IDs from `assets/private/settings.toml`. The status check must flag:

- `PATH_CRED` or `PATH_PRF` values that are unreadable.
- `PATH_CRED` or `PATH_PRF` values that point to a file instead of a directory.
- missing selected `ID_CRED` or `ID_PRF` values.

Use `dbhopper_credentials_validate` to validate credential TOML files without
returning secrets. It checks TOML syntax, known fields, required `ID_CRED`, and
the credential directory selected by `PATH_CRED`.

Credential tools return presence flags such as `hasBahnAPICredentials`,
`hasBahnAccountCredentials`, `hasBahnAccountAPICredentials`, and
`hasBrowserUserDataDir`. They must not return usernames, passwords, API keys,
cookies, browser storage, or full credential file contents.

## Browser Profiles

Browser login checks use the selected credential file's `[browser].userDataDir`.
The profile is persistent so DB sessions can be reused for normal workflows.
One-time credential checks, however, must not pass merely because a saved
session is already logged in.

When a fresh credential proof is needed, back up the configured profile and then
remove the original profile directory before rerunning the check. The current
manual backup convention is:

```text
~/Documents/dbhopper-browser-profile-backups/
```

Do not clear persistent profiles by default. Use a clean profile only when the
purpose of the check is to prove the selected username/password pair.

## Login Proof

The shared DB login helper is responsible for deterministic credential proof.
It must submit the selected username and password unless DB blocks that path.
An existing saved session is reported as inconclusive proof:

```text
credentialProof = "not_proven_existing_session"
```

The helper exposes structured rejection fields for failed credentials:

- `credentialRejected`
- `credentialRejectionStage`
- `credentialRejectionReason`
- `usernameRejected`
- `usernameRejectionReason`
- `passwordRejected`
- `passwordRejectionReason`
- `credentialCombinationRejected`

Supported proof and rejection values include:

- `selected_credentials_submitted`
- `not_proven_invalid_username`
- `not_proven_invalid_password`
- `not_proven_invalid_credentials`
- `not_proven_existing_session`
- `not_proven_missing_login_form`
- `not_proven_blocked_by_user_action`

Username rejection reasons:

- `invalid_username_format`
- `unknown_username`

Password and combined rejection reasons:

- `incorrect_password`
- `username_password_mismatch`

The plugin must derive these values from deterministic browser page state and
page text checks. Screenshots are useful artifacts, but screenshots must not be
required for pass/fail classification.

## Account Checks

`dbhopper_db_standard_login_check` verifies the DB passenger website account
stored in `[bahnAccount]`. It opens the DB website, submits the selected
credentials, checks the stay-logged-in checkbox when DB exposes one, and
returns sanitized structured output. It must not submit registrations, account
setting changes, purchases, or payment actions.

`dbhopper_db_marketplace_access_check` verifies the DB API Marketplace browser
login stored in `[bahnAccountAPI]`. It starts at the Marketplace login route,
clicks the DB customer-account gate when present, follows DB identity hosts such
as `id.bahn.de`, and then reuses the shared login helper. It also checks that
the Timetables product page is reachable.

Marketplace browser login and technical API-key validity are separate checks.
A successful `[bahnAccountAPI]` browser login does not prove that `[bahnAPI]`
`clientId` and `apiKey` are valid for DB Timetables.

`dbhopper_db_api_credential_probe` verifies `[bahnAPI]` with a direct DB
Timetables probe. It returns sanitized credential presence and DB response
status/error information. HTTP 401 `Invalid client id or secret` means the
official API path remains blocked until the DB Marketplace application,
subscription, client ID, and API key are corrected.
The probe also returns `credentialDiagnosis` with deterministic `status`,
`reason`, and `next_steps`; agents should use those fields instead of parsing
raw DB error text.

## Current Live Findings

The standard DB website login path has been tested through Chromium with
selected `[bahnAccount]` credentials. DB's stay-logged-in checkbox can be found
by label, including `"Stay logged in"`, and may also appear as
`input#rememberMe--checkbox` or `name=rememberMe`.

The DB API Marketplace browser path has been tested with a clean DBhopper
browser profile and selected `[bahnAccountAPI]` credentials. The working flow
is:

1. Open the Marketplace login route.
2. Click `"Weiter mit DB Kundenkonto"` when the gate is shown.
3. Follow the DB identity page on `id.bahn.de`.
4. Submit the selected username and password.
5. Confirm the Timetables product page is reachable.

## Ticket Dry Runs

Ticket-buying tools are testing-only. They may open the official DB website and
explore booking screens, but they must not buy a ticket.

Safety rules:

- Mark tool results with `testing: true`.
- Return `purchaseSubmitted: false`.
- Stop at search/results for `dbhopper_ticket_buying_dry_run`.
- Stop before payment data or a legally binding final order button for
  `dbhopper_ticket_checkout_dry_run`.
- Do not click final payment or final booking controls.
- Do not store payment card data in DBhopper files.

`dbhopper_ticket_buying_dry_run` uses the active credentials from
`settings.toml` by default. With `open_browser: false`, it returns a
deterministic plan only. With `open_browser: true`, it opens the official DB
website, applies the supplied route and outbound date/time, and stops after
search/results.

When `login_before_search: true`, the dry run logs into the configured
`[bahnAccount]` before searching. `stay_logged_in` defaults to `true`.

`dbhopper_ticket_checkout_dry_run` accepts the same route and login controls,
uses a default route of Hamm(Westf)Hbf -> Köln Hbf about one week after the run
date, and returns `finalSafetyStop` values such as `payment_boundary`,
`final_order_boundary`, or `no_safe_next_step`.

## Delay Retrieval Tests

Delay retrieval tests cover both provider paths:

- official DB Timetables API using `[bahnAPI]`
- deterministic `bahn-web` retrieval using DB passenger website JSON calls

The default delay provider is controlled by `DELAY_PROVIDER` in
`assets/private/settings.toml`; the current default is `"bahn-web"` with
`DELAY_FALLBACK = "none"`.

Tests should cover provider selection, configured fallback behavior, route
matching, delay filtering, inclusive query windows, sanitized outputs, and the
known 401 behavior for invalid DB Timetables credentials.

Provider parity tests should drive both Timetables and `bahn-web` through their
provider parsers, then compare the normalized `Journey[]` data handed to the
shared regional and replacement filters.

`runDbDelayProviderParityProbe` is an internal comparison helper for live
checks after API credentials work. It runs both providers for one query and
compares cleaned `table_rows`; it does not add another user-facing OpenClaw
tool.

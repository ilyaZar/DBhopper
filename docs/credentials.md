# DBhopper Credentials

DBhopper keeps credentials in local TOML files under the external directory
selected by `path_usr` in:

```text
assets/private/settings.toml
```

Credential files must stay outside the plugin workspace/package root. The
plugin process may read them, but coding agents and workspace read/write tools
should not have access to the external private directory. Create that directory
before copying `docs/examples/credentials.example.toml` into it, then set the
`ID_USR` value that should be selected by settings routing.

## Settings Router

The single settings file is `assets/private/settings.toml`:

```toml
use_delay_retrieval = true
use_claim_requests = false
use_ticket_purchase = false

ID_USR = "01"
ID_CLM = "01"
ID_BUY = "01"
ID_PYM = "01"
purchase_mode = "review"
path_usr = "../dbhopper-private/credentials"
path_clm = "../dbhopper-private/profiles"
path_buy = "../dbhopper-private/profiles"
path_pym = "../dbhopper-private/credentials"
delay_provider = "bahn-web"
delay_fallback = "none"
```

`path_usr`, `path_clm`, `path_buy`, and `path_pym` are user-controlled scan
directories outside the plugin workspace. They may be relative to the plugin
directory or absolute within the user file system, but DBhopper rejects paths
inside the workspace, including `assets/private/`. OpenClaw agents should only
change `ID_USR`, `ID_CLM`, `ID_BUY`, `ID_PYM`, and `purchase_mode` through
`dbhopper_private_settings_select`.

`purchase_mode` defaults to `"review"`, which captures a sensitive DB
Check-page screenshot artifact under `assets/private/purchases/` and stops
before final order controls. `"auto"` records that automatic buying was
requested, but final buying is not enabled yet, so checkout still stops before
the final order button.

Use the selected external private paths inside this single settings TOML file.
The settings file itself always remains at `assets/private/settings.toml`.

`dbhopper_private_settings_status` lists available user credential,
claim-profile, buying-profile, and payment-profile IDs. It returns an error if
the selected ID does not exist.

## Credential Schema

```toml
ID_USR = "01"

[bahn_account]
username = "user@example.org"
password = "replace-with-secret"

[bahn_account_api]
username = "db-marketplace-account@example.org"
password = "replace-with-secret"

[bahn_api]
client_id = "db-api-marketplace-client-id"
api_key = "db-api-marketplace-api-key"

[browser]
user_data_dir = "../dbhopper-private/browser/db-ticket-buying"
```

Current top-level fields:

- `ID_USR`: required quoted numeric credential ID, for example `"01"`.

Current credential sections:

- `[bahn_account].username`: DB passenger website account login name.
- `[bahn_account].password`: DB passenger website account password.
- `[bahn_account_api].username`: DB API Marketplace browser-login account name.
- `[bahn_account_api].password`: DB API Marketplace browser-login password.
- `[bahn_api].client_id`: DB API Marketplace technical client ID.
- `[bahn_api].api_key`: DB API Marketplace technical API key.
- `[browser].user_data_dir`: persistent Chromium profile directory, absolute or
  relative to the plugin workspace root. Keep it outside the plugin workspace.

All credential sections are optional, but tools that need a section return a
deterministic configuration error when the selected credential file lacks the
required values. Unknown keys are rejected so typos do not silently change
behavior.

Store several credentials by giving each private file a different ID, for
example:

```text
../dbhopper-private/credentials/credentials-01.toml
../dbhopper-private/credentials/credentials-02.toml
../dbhopper-private/credentials/credentials-03.toml
```

Payment profiles live in the same private credentials directory and are
selected by `ID_PYM`. Use `docs/examples/payment-profile.example.toml` as the
public template. SEPA profiles can include `birthdate` and a grouped
`[payment.sepa.address]` table for direct debit setup. Direct
`[payment.sepa]` address fields are rejected.
Payment-profile summaries expose method and presence flags only, never
account, IBAN, birthdate, address, or card values.

During logged-in DB checkout, DB account identity is fixed. SEPA
`account_owner` and `birthdate` are checked against the visible DB account
fields, but DBhopper does not edit them. If the configured payment profile
differs, checkout returns a sanitized warning and keeps the value from the
logged-in DB account. SEPA IBAN, mandate, and configured address fields remain
fillable: DBhopper compares visible values, leaves matching prefill untouched,
and updates mismatches.

## Use

Select the active credential by changing only `ID_USR` in
`assets/private/settings.toml`:

```toml
ID_USR = "02"
```

DBhopper tools return only presence flags such as `hasBahnAPICredentials`. They
do not return credential values or credential lengths. Browser credential
submission uses the selected TOML values inside the plugin process and returns
only structured proof flags such as `usernameSubmitted`,
`passwordSubmitted`, and `selectedCredentialsSubmitted`.

## Current Consumers

- `dbhopper_query_db_delay` can load `[bahn_api]` and use it for the official DB
  Timetables provider.
- `dbhopper_ticket_buying_dry_run` can use `[browser].user_data_dir` as a
  persistent Chromium profile for DB website browser runs.

Validation, browser-login proof, API-key probes, and ticket dry-run testing are
documented in `docs/testing_ecosystem.md`.

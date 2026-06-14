# DBhopper Credentials

DBhopper keeps credentials in local TOML files under:

```text
assets/private/credentials/
```

or under the directory selected by `PATH_CRED` in:

```text
assets/private/settings.toml
```

Packaged files in that directory are only:

- `.gitkeep`

Real credential files are ignored by git and should stay local. Use
`docs/examples/credentials.example.toml` as the public template. Copy it into
the private credentials directory and set the `ID_USR` value that should be
selected by settings routing.

## Settings Router

The single settings file is `assets/private/settings.toml`:

```toml
ID_USR = "01"
ID_CLM = "01"
ID_BUY = "01"
ID_PYM = "01"
TICKET_BUYING_MODE = "review"
PATH_CRED = "assets/private/credentials"
PATH_PRF = "assets/private/profiles"
DELAY_PROVIDER = "bahn-web"
DELAY_FALLBACK = "none"
```

`PATH_CRED` and `PATH_PRF` are user-controlled. They may be relative to the
plugin directory or absolute within the user file system. OpenClaw agents
should only change `ID_USR`, `ID_CLM`, `ID_BUY`, `ID_PYM`, and
`TICKET_BUYING_MODE` through `dbhopper_private_settings_select`.

`TICKET_BUYING_MODE` defaults to `"review"`, which captures a sensitive DB
Check-page screenshot artifact and stops before final order controls. `"auto"`
records that automatic buying was requested, but final buying is not enabled
yet, so checkout still stops before the final order button.

Use either the default private paths or user-chosen private paths inside this
single settings TOML file; private paths may be relative to the plugin
directory or absolute within the user file system, while the settings file
itself always remains at `assets/private/settings.toml`.

`dbhopper_private_settings_status` lists available user credential,
claim-profile, buying-profile, and payment-profile IDs. It returns an error if
the selected ID does not exist.

## Credential Schema

```toml
version = 1
ID_USR = "01"

[bahnAccount]
username = "user@example.org"
password = "replace-with-secret"

[bahnAccountAPI]
username = "db-marketplace-account@example.org"
password = "replace-with-secret"

[bahnAPI]
clientId = "db-api-marketplace-client-id"
apiKey = "db-api-marketplace-api-key"

[browser]
userDataDir = "assets/private/browser/db-ticket-buying"
```

Current top-level fields:

- `version`: optional schema version, currently `1`.
- `ID_USR`: required quoted numeric credential ID, for example `"01"`.

Current credential sections:

- `[bahnAccount].username`: DB passenger website account login name.
- `[bahnAccount].password`: DB passenger website account password.
- `[bahnAccountAPI].username`: DB API Marketplace browser-login account name.
- `[bahnAccountAPI].password`: DB API Marketplace browser-login password.
- `[bahnAPI].clientId`: DB API Marketplace technical client ID.
- `[bahnAPI].apiKey`: DB API Marketplace technical API key.
- `[browser].userDataDir`: persistent Chromium profile directory, absolute or
  relative to the plugin workspace root.

All credential sections are optional, but tools that need a section return a
deterministic configuration error when the selected credential file lacks the
required values. Unknown keys are rejected so typos do not silently change
behavior.

Store several credentials by giving each private file a different ID, for
example:

```text
assets/private/credentials/credentials-01.toml
assets/private/credentials/credentials-02.toml
assets/private/credentials/credentials-03.toml
```

Payment profiles live in the same private credentials directory and are
selected by `ID_PYM`. Use `docs/examples/payment-profile.example.toml` as the
public template. SEPA profiles can include `birthdate` and
direct address fields such as `streetNhouseNum`, `zip`, `city`, and `country`
for direct debit setup. A grouped `[payment.sepa.address]` table is also
accepted. `birthday` is accepted as an alias, but `birthdate` is canonical.
Payment-profile summaries expose method and presence flags only, never
account, IBAN, birthdate, address, or card values.

During logged-in DB checkout, DB account identity is fixed. SEPA
`accountOwner` and `birthdate` are checked against the visible DB account
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
do not return the credential values.

## Current Consumers

- `dbhopper_query_db_delay` can load `[bahnAPI]` and use it for the official DB
  Timetables provider.
- `dbhopper_ticket_buying_dry_run` can use `[browser].userDataDir` as a
  persistent Chromium profile for DB website browser runs.

Validation, browser-login proof, API-key probes, and ticket dry-run testing are
documented in `docs/testing_ecosystem.md`.

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
the private credentials directory and set the `ID_CRED` value that should be
selected by settings routing.

## Settings Router

The single settings file is `assets/private/settings.toml`:

```toml
ID_CRED = "01"
ID_PRF = "01"
PATH_CRED = "assets/private/credentials"
PATH_PRF = "assets/private/profiles"
DELAY_PROVIDER = "bahn-web"
DELAY_FALLBACK = "none"
```

`PATH_CRED` and `PATH_PRF` are user-controlled. They may be relative to the
plugin directory or absolute within the user file system. OpenClaw agents
should only change `ID_CRED` and `ID_PRF` through
`dbhopper_private_settings_select`.

Use either the default private paths or user-chosen private paths inside this
single settings TOML file; private paths may be relative to the plugin
directory or absolute within the user file system, while the settings file
itself always remains at `assets/private/settings.toml`.

`dbhopper_private_settings_status` lists available credential/profile IDs and
returns an error if the selected ID does not exist.

## Credential Schema

```toml
version = 1
ID_CRED = "01"

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
- `ID_CRED`: required quoted numeric credential ID, for example `"01"`.

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

## Use

Select the active credential by changing only `ID_CRED` in
`assets/private/settings.toml`:

```toml
ID_CRED = "02"
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

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

Real files such as `default.toml` are ignored by git and should stay local.
Use `docs/examples/credentials.example.toml` as the public template. Copy it
into the private credentials directory and add an `ID_CRED` value that should
be selected by settings routing.

## Settings Router

Start from `assets/private/settings.example.toml`:

```toml
ID_CRED = "01"
ID_PRF = "01"
PATH_CRED = "assets/private/credentials"
PATH_PRF = "assets/private/profiles"
```

`PATH_CRED` and `PATH_PRF` are user-controlled. They may be plugin-internal
relative paths or absolute external paths. OpenClaw agents should only change
`ID_CRED` and `ID_PRF` through `dbhopper_private_settings_select`.

`dbhopper_private_settings_status` lists available credential/profile IDs and
returns an error if the selected ID does not exist.

## Credential Schema

```toml
version = 1
ID_CRED = "01"

[dbApi]
clientId = "db-api-marketplace-client-id"
apiKey = "db-api-marketplace-api-key"
# Optional, only for DB API Marketplace browser-login diagnostics:
accountUsername = "db-marketplace-account@example.org"
accountPassword = "replace-with-secret"

[bahnAccount]
username = "user@example.org"
password = "replace-with-secret"

[browser]
userDataDir = "assets/private/browser/db-ticket-buying"
```

All sections except `ID_CRED` are optional. Unknown keys are rejected so typos
do not silently change behavior.

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

Direct `credentials_profile` and `activeCredentialsName` still work as legacy
overrides, but the settings-router path is the preferred runtime default.

DBhopper tools return only presence flags such as `hasDbApiCredentials`. They
do not return the credential values.

## Current Consumers

- `dbhopper_query_db_delay` can load `[dbApi]` and use it for the official DB
  Timetables provider.
- `dbhopper_db_api_credential_probe` can test `[dbApi].clientId` and
  `[dbApi].apiKey` without returning the values.
- `dbhopper_db_marketplace_access_check` can use optional
  `[dbApi].accountUsername` and `[dbApi].accountPassword` for browser-login
  proof. Client ID/API key values alone are not human-login credentials.
- `dbhopper_db_standard_login_check` can submit `[bahnAccount]` for one-time DB
  website login onboarding.
- `dbhopper_ticket_buying_dry_run` can use `[browser].userDataDir` as a
  persistent Chromium profile for a DB website testing session.
- `dbhopper_ticket_buying_dry_run` can use `[bahnAccount]` when
  `login_before_search: true`. It checks DB's stay-logged-in box by default
  when the login page exposes one, and it does not print account values.

Run `dbhopper_credentials_validate` to check all local credential TOML files
without exposing secrets.

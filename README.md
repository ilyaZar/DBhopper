![DBhopper banner](assets/dbhopper_banner.png)

# DBhopper

OpenClaw tools for NRW Mobilitätsgarantie claims, Deutsche Bahn live-delay route
queries, and travel disruption workflows.

DBhopper keeps claim data local, validates eligibility for Mobilitätsgarantie,
and can drive the NRW browser form, including confirmed submission. If your
OpenClaw agent is available through WhatsApp, Telegram, Signal, or another chat
channel, DBhopper still keeps private values in local files and exposes only
deterministic tool results.

## Local Setup

```bash
openclaw plugins install -l /home/iz/Dropbox/projects/openclaw/own-plugins/dbhopper
openclaw plugins enable dbhopper
```

Configure `plugins.entries.dbhopper.config.workspaceRoot` to this plugin
directory. Route private profiles and credentials through
`assets/private/settings.toml`: this is a fixed settings file:

```toml
ID_CRED = "01"
ID_PRF = "01"
PATH_CRED = "assets/private/credentials"
PATH_PRF = "assets/private/profiles"
DELAY_PROVIDER = "bahn-web"
DELAY_FALLBACK = "none"
```

The `PATH_*` values may point to the plugin-private folders or to external
directories. You or the OpenClaw agent should only change `ID_CRED` and
`ID_PRF`, either manually or through the dedicated DBhopper settings tools.

Use either the default private paths or user-chosen private paths inside this
single settings TOML file; private paths may be relative to the plugin directory
or absolute within the user file system, while the settings file itself always
remains at `assets/private/settings.toml`.

Start from the safe credential/profile templates under `docs/examples/`. Copy
`docs/examples/private-profile.example.toml` to
`assets/private/profiles/private-profile-01.toml` and copy
`docs/examples/credentials.example.toml` to
`assets/private/credentials/credentials-01.toml`. Keep real profiles and
credentials private: do not paste credentials into chat; edit them only in local
private TOML files. DBhopper returns only credential presence flags, not
credential values.

Prepared claims are editable TOML files at `claims/<claim-id>/claim.toml`. They
store claim-specific journey, ticket, and file data, but not claimant or bank
fields. DBhopper merges the selected private profile in memory for validation
and browser filing. A successful submit writes `claim_submitted_recipe.toml`
next to the downloaded confirmation PDF as the full joined audit recipe.

## Usage mode: delay alarm and lookup

Deutsche Bahn delay lookup supports these provider values:

- `bahn-web`, the `settings.toml` default, uses the passenger website JSON
  endpoint through the browser-context retrieval path.
- `db-timetables` uses the official DB API Marketplace Timetables product.
- `auto` uses DB Timetables when credentials exist, otherwise `bahn-web`.

`bahn-web` works without Marketplace credentials. It is still an unofficial
website endpoint and may change or block clients.
If Timetables is selected and then fails, `DELAY_FALLBACK` controls whether
DBhopper retries another provider; the default is no automatic retry.

### DB API Marketplace

For the official DB Timetables provider, create a DB API Marketplace
application, subscribe it to the Timetables product, and put the technical
credentials in `[bahnAPI]` of the selected credential TOML file.

By default, DBhopper uses the passenger website JSON endpoint through the
browser-context retrieval path:

```toml
DELAY_PROVIDER = "bahn-web"
DELAY_FALLBACK = "none"
```

This keeps delay lookup usable without DB API Marketplace credentials. Set
`DELAY_PROVIDER = "db-timetables"` only when you want the official API as the
default. `DELAY_FALLBACK` can be set later, but the default is no automatic
fallback.

The free Timetables subscription currently offers 60 calls per minute.

1. Register and log in at:
   `https://developers.deutschebahn.com/db-api-marketplace/apis/`
2. Open getting started, "Los gehts", step 02, then click "Neue Anwendung
   erstellen".
3. Fill the application form:
   - title: "DBhopper Timetables Delay Lookup"
   - "Zertifikat": leave empty
   - description: Local DBhopper tool for Deutsche Bahn Timetables API delay
     lookup. Uses station, plan, fchg, and rchg endpoints for deterministic
     train-delay queries. No OAuth redirect flow.
   - "OAuth-Umleitungs-URL(s)": leave empty
   - click "Speichern"
4. On "Neue Anwendungsberechtigungsnachweise", copy "Client ID" and "Client
   Secret (API KEY)" into the selected credentials file:

   ```toml
   [bahnAPI]
   clientId = "..."
   apiKey = "..."
   ```

5. Use "Produktsuche" or "Katalog auswählen", search for `Timetable`, choose the
   free subscription, link the application to that subscription, and subscribe
   to the usage plan.
6. Verify it from the main page under "Anwendungen": open the new application
   and confirm the selected product subscription below:
   - product: `Timetables` with its version number
   - plan: `Free`

The `bahn-web` provider tries native `fetch`, `curl`, and then Playwright
page-context JSON fetch when using `bahnWebTransport: "auto"`. This is
intentional: live checks showed DB's edge can reject direct HTTP clients with
`OPS_BLOCKED` while accepting same-origin browser-context requests.

Access onboarding tools can verify the selected DB website login, DB API
Marketplace browser reachability, and DB Timetables API key validity without
returning secrets. A saved browser session is not treated as proof that the
currently selected credentials work.

### DB ticket buying support

Ticket-buying support is WIP and testing-only. `dbhopper_ticket_buying_dry_run`
stops after search/results. `dbhopper_ticket_checkout_dry_run` can explore
offer/customer-data steps as far as safely possible and must stop before payment
data or any legally binding final order button. See `docs/ticket-buying-wip.md`.

Browser runs save screenshots and text captures below `tmp/`. Those artifacts
are local runtime data and may contain account identity.

## User-facing capabilities

DBhopper exposes granular tools to the agent, but users normally interact with
these workflows:

- prepare a Mobilitätsgarantie claim: `dbhopper_prepare_claim`
- validate a claim: `dbhopper_validate_claim`
- dry-run or submit a prepared claim: `dbhopper_run_claim`
- query train delays and direct replacement options: `dbhopper_query_db_delay`
- select local credential and profile IDs:
  `dbhopper_private_settings_status`,
  `dbhopper_private_settings_select`
- verify DB setup:
  `dbhopper_credentials_validate`,
  `dbhopper_db_api_credential_probe`

Advanced agent diagnostics and research helpers include:

- `dbhopper_claim_schema`
- `dbhopper_list_claims`
- `dbhopper_browser_probe`
- `dbhopper_db_standard_login_check`
- `dbhopper_db_marketplace_access_check`
- `dbhopper_db_delay_research`
- `dbhopper_ticket_buying_research`
- `dbhopper_ticket_buying_dry_run`
- `dbhopper_ticket_checkout_dry_run`

The ticket-buying helpers are experimental and should not be treated as the
main user-facing purchase interface.

`dbhopper_run_claim` defaults to dry-run behavior and only submits with explicit
confirmation.

`dbhopper_query_db_delay` uses inclusive bounds around the explicit query time:
`[query_time - window_width_minutes, query_time + window_width_minutes]`. It
checks regional candidates by delay at the boarding station and separately
checks direct ICE/IC/EC replacement candidates for reachability.

Example parameters:

```json
{
  "provider": "auto",
  "departure_station": "Hamm(Westf)Hbf",
  "arrival_station": "Koeln Hbf",
  "service_date": "2026-05-25",
  "query_time": "19:00",
  "window_width_minutes": 45,
  "delay_threshold_minutes": 20,
  "force_query_departure_time": true,
  "long_distance_replacement_types": ["ICE", "IC", "EC"]
}
```

The query response is already normalized for downstream use. `table_rows`
contains deterministic, display-ready route candidates, while `cleaned_summary`
contains candidate counts and reachability booleans. Agents should not clean raw
DB or website payloads with the LLM; raw provider rows are only returned when
`include_raw` is true.

Local `claims/*` and `assets/private/*` files are ignored runtime data. Newly
prepared claims are written as `claim.toml`.

## Troubleshooting

If an OpenClaw-routed agent can describe the skill but cannot call `dbhopper_*`,
check the sandbox tool policy. The local config needs DBhopper in both
`tools.alsoAllow` and `tools.sandbox.tools.alsoAllow`.

## Development

```bash
npm run build
npm run plugin:build
npm run plugin:validate
npm test
npm run package:check
```

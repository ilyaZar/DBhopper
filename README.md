# DBhopper

OpenClaw tools for NRW Mobilitätsgarantie claims and Deutsche Bahn live-delay
route queries.

DBhopper keeps claim data local, validates deterministic eligibility facts, and
can drive the NRW browser form. It does not own WhatsApp, Telegram, Signal, or
email transport; OpenClaw channels handle chat and artifact delivery.

## Local Setup

```bash
openclaw plugins install -l /home/iz/Dropbox/projects/openclaw/own-plugins/dbhopper
openclaw plugins enable dbhopper
```

Configure `plugins.entries.dbhopper.config.workspaceRoot` to this plugin
directory. Route private profiles and credentials through
`assets/private/settings.toml`. Start from
`assets/private/settings.example.toml`:

```toml
ID_CRED = "01"
ID_PRF = "01"
PATH_CRED = "assets/private/credentials"
PATH_PRF = "assets/private/profiles"
```

The `PATH_*` values may point to the plugin-private folders or to external
directories. The OpenClaw agent should only change `ID_CRED` and `ID_PRF` via
the DBhopper settings tools.

Start from the safe templates under `docs/examples/`. Copy
`docs/examples/private-profile.example.toml` to
`assets/private/profiles/private-profile-01.toml` and copy
`docs/examples/credentials.example.toml` to
`assets/private/credentials/credentials-01.toml`. Keep real profiles and
credentials private. DBhopper returns only credential presence flags, not
credential values.

Prepared claims are editable TOML files at `claims/<claim-id>/claim.toml`.
They store claim-specific journey, ticket, file, and selected profile data, but
not claimant or bank fields. DBhopper merges the selected private profile in
memory for validation and browser filing. A successful submit writes
`claim_submitted_recipe.toml` next to the downloaded confirmation PDF as the
full joined audit recipe.

Deutsche Bahn delay lookup supports two providers:

- `auto`, the default, uses DB Timetables when credentials exist and falls back
  to `bahn-web` when credentials are missing or Timetables returns an
  authentication failure.
- `db-timetables` uses the official DB API Marketplace Timetables product.
- `bahn-web` uses the passenger website JSON endpoint without Marketplace
  credentials. This endpoint is unofficial and may change or block clients.

For the official DB Timetables provider, create a DB API Marketplace
application, subscribe it to the Timetables product, and configure either:

- `plugins.entries.dbhopper.config.dbClientId`
- `plugins.entries.dbhopper.config.dbApiKey`

or the equivalent environment variables:

```bash
export DB_CLIENT_ID=...
export DB_API_KEY=...
```

The `bahn-web` provider tries native `fetch`, `curl`, and then Playwright
page-context JSON fetch when using `bahnWebTransport: "auto"`. This is
intentional: live checks showed DB's edge can reject direct HTTP clients with
`OPS_BLOCKED` while accepting same-origin browser-context requests.

Access onboarding tools can verify the selected DB website login, DB API
Marketplace browser reachability, and DB Timetables API key validity without
returning secrets. A saved browser session is not treated as proof that the
currently selected credentials work.

Ticket-buying support is WIP and testing-only. `dbhopper_ticket_buying_dry_run`
stops after search/results. `dbhopper_ticket_checkout_dry_run` can explore
offer/customer-data steps as far as safely possible and must stop before
payment data or any legally binding final order button. See
`docs/ticket-buying-wip.md`.

## Tools

- `dbhopper_claim_schema`
- `dbhopper_list_claims`
- `dbhopper_prepare_claim`
- `dbhopper_validate_claim`
- `dbhopper_browser_probe`
- `dbhopper_run_claim`
- `dbhopper_private_settings_status`
- `dbhopper_private_settings_select`
- `dbhopper_credentials_validate`
- `dbhopper_db_standard_login_check`
- `dbhopper_db_marketplace_access_check`
- `dbhopper_db_api_credential_probe`
- `dbhopper_db_delay_research`
- `dbhopper_query_db_delay`
- `dbhopper_ticket_buying_research`
- `dbhopper_ticket_buying_dry_run`
- `dbhopper_ticket_checkout_dry_run`

`dbhopper_run_claim` defaults to dry-run behavior and only submits with explicit
confirmation.

Browser runs save screenshots and text captures below `tmp/`. A dry run stops at
the summary page before `Angaben absenden`.

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
contains deterministic, display-ready route candidates, while
`cleaned_summary` contains candidate counts and reachability booleans. Agents
should not clean raw DB or website payloads with the LLM; raw provider rows are
only returned when `include_raw` is true.

Local `claims/*` and `assets/private/*` files are ignored runtime data. Legacy
`claim.json` files are not used by the current code path and are not packaged;
newly prepared claims are written as `claim.toml`.

## Troubleshooting

If an OpenClaw-routed agent can describe the skill but cannot call
`dbhopper_*`, check the sandbox tool policy. The local config needs DBhopper in
both `tools.alsoAllow` and `tools.sandbox.tools.alsoAllow`.

## Development

```bash
npm run build
npm run plugin:build
npm run plugin:validate
npm test
npm run package:check
```

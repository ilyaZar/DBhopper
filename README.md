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
directory. Put reusable private profile data under `assets/private/` and pass
only the file name as `profileAssetName`.

Start from [assets/private-profile.example.json](assets/private-profile.example.json)
and copy it to `assets/private/default.json`. Keep the copied file private.

## Tools

- `dbhopper_claim_schema`
- `dbhopper_list_claims`
- `dbhopper_prepare_claim`
- `dbhopper_validate_claim`
- `dbhopper_browser_probe`
- `dbhopper_run_claim`
- `dbhopper_db_delay_research`
- `dbhopper_query_db_delay`

`dbhopper_run_claim` defaults to dry-run behavior and only submits with explicit
confirmation.

Browser runs save screenshots and text captures below `tmp/`. A dry run stops at
the summary page before `Angaben absenden`.

`dbhopper_query_db_delay` uses inclusive bounds around the explicit query time:
`[query_time - window_width_minutes, query_time + window_width_minutes]`. It
checks regional candidates by delay at the boarding station and separately
checks direct ICE/IC/EC replacement candidates for reachability.

Deutsche Bahn delay lookup supports two providers:

- `auto`, the default, uses DB Timetables when credentials exist and otherwise
  falls back to `bahn-web`.
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

The `bahn-web` provider tries native `fetch` first and then `curl` when using
`bahnWebTransport: "auto"`. This is intentional: live checks showed DB's edge
can reject Node's HTTPS client with `OPS_BLOCKED` while accepting browser-like
curl requests.

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

The next design notes live in [specs/next.md](specs/next.md).

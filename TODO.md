# DBhopper TODO

## Publishing readiness

Current release decision:

- The checks in this section are currently resolved for a publish attempt,
  subject to owner release approval, final package file-list inspection, and a
  clean intentional git state.

Resolved in this branch:

- OpenClaw now registers the full public tool contract and enforces
  `settings.yaml` feature gates at execution time. Disabled claim and
  ticket-buying tools return `feature_disabled` instead of being omitted from
  `openclaw.plugin.json`.
- `package.json` declares ClawHub install metadata:
  `clawhub:dbhopper`, default source `clawhub`, and host floor
  `>=2026.6.2`.
- The selected official DB Timetables technical credentials probed
  successfully on 2026-06-13 with HTTP 200 and diagnosis `accepted`.
- `npm run test:live:delay-backends` passed on 2026-06-13 with 50 web
  successes, 47 official API successes, and 425 matched user-visible rows.
- ClawHub validator passed with zero breakages and zero warnings, and the
  ClawHub publish dry-run completed without publishing.
- Ticket-buying tools remain feature-gated, testing-only, and dry-run bounded.

Blocking issues found by the current checks:

- None.

Release cautions to keep visible:

- Ticket buying is still intentionally non-purchase-capable. Keep it
  feature-gated and documented as testing-only before broad publication.
- `bahn-web` uses an unofficial passenger website endpoint. It remains the
  default because it works without technical API credentials, but it may change
  or block non-browser clients.

Required local gates before a publish attempt:

```bash
npm test
npm run package:check
npm pack --dry-run --json --ignore-scripts
npm run plugin:build
npm run plugin:validate
npm run clawhub:validate
npm run clawhub:publish:dry-run
```

Also inspect the dry-run package file list manually. It must exclude real
`claims/*`, `assets/private/*`, browser profiles, credentials, claim PDFs,
runtime `tmp/*`, generated ClawHub reports, and this `TODO.md`.

Security and release evidence to capture:

- `npm audit --omit=dev --audit-level=high`
- ClawHub validator output with zero hard breakages.
- ClawHub security evidence via `oc-clawhub-security-capture` once an exact
  version exists on ClawHub or when validating a published scanner result.
- A clean git state containing only intentional source, manifest, dist, docs,
  and test updates.

## Delay lookup live data source

Current official-provider state:

- `dbhopper_query_db_delay` uses the official DB Timetables API:
  `https://apis.deutschebahn.com/db-api-marketplace/apis/timetables/v1`
- It calls:
  - `GET /station/{pattern}`
  - `GET /plan/{evaNo}/{date}/{hour}`
  - `GET /fchg/{evaNo}`
  - `GET /rchg/{evaNo}`
- This requires DB API Marketplace application credentials:
  - `DB-Client-Id`
  - `DB-Api-Key`
- Missing credentials return `needs_configuration: true`.
- Populated but invalid credentials can return HTTP 401:
  `Invalid client id or secret`.
- `dbhopper_db_api_credential_probe` verifies the selected `[bahnAPI]`
  credentials independently of any browser login.

Implemented passenger website alternative:

- The DB web endpoint
  `https://int.bahn.de/web/api/reiseloesung/abfahrten`
  returns current live departure data without DB Marketplace credentials when
  called with browser-like headers.
- DBhopper now includes a deterministic `bahn-web` provider that calls:
  - `GET /reiseloesung/orte`
  - `GET /reiseloesung/abfahrten`
- The provider parses website JSON into normalized `Journey` objects and then
  reuses the same deterministic route, delay, and replacement filters as the
  official provider.
- The query tool returns `table_rows` and `cleaned_summary` so orchestration
  agents do not need to clean raw API or website payloads with the LLM.
- Provider selection is explicit:
  - `provider: "db-timetables"` for the official credentialed API
  - `provider: "bahn-web"` for the passenger website API
  - `provider: "auto"` to use Timetables when credentials exist, otherwise
    `bahn-web`
- Runtime fallback after a provider failure is controlled by `DELAY_FALLBACK`;
  the default `"none"` disables automatic fallback even when `provider` is
  `"auto"`.
- For Hamm(Westf)Hbf -> Köln Hbf on 2026-06-10 around 22:03 CEST, it returned
  live-updating entries such as ICE 542, RE1, and ICE 842, with realtime
  departure changes visible across repeated checks.
- The public `bahnhof.de` departure page is a Next.js app shell, so raw HTML is
  not a reliable structured data source by itself.
- Live Node `fetch`/HTTPS and curl calls to `int.bahn.de` can return
  `OPS_BLOCKED`. The `bahn-web` provider therefore supports
  `bahnWebTransport: "auto"`, which tries native `fetch`, `curl`, and then
  Playwright page-context JSON fetch. Use `bahnWebTransport: "browser"` to go
  straight to the structured browser-context fetch path.

Live verification notes:

- 2026-06-13 direct Timetables API probe returned HTTP 200 with populated
  selected `[bahnAPI]` fields. Browser Marketplace login remains separate from
  API-key validity.
- 2026-06-13 live backend parity passed with 50 route probes, 47 official API
  successes, 50 `bahn-web` successes, 425 matched user-visible rows, failed
  API probe IDs `p035`, `p038`, and `p039`, and no failed web probes.
- Invalid API probe and query failures still classify DB 401 responses as
  `invalid_client_id_or_secret` and return next checks for `[bahnAPI]`
  `clientId`, `[bahnAPI]` `apiKey`, selected settings ID, and the Timetables
  subscription on the same Marketplace application.
- The configured default remains `DELAY_PROVIDER = "bahn-web"` with
  `DELAY_FALLBACK = "none"` because the passenger website provider works
  without technical API credentials and is the safer default for local use.
- Ticket checkout dry-run reached a safe stop and did not buy anything.
- Fixture parity now verifies that Timetables and `bahn-web` provider parsers
  feed the same normalized `Journey[]` data shape into the shared filters.
- `runDbDelayProviderParityProbe` can run both providers for the same query and
  compare cleaned `table_rows`. It is not a separate user-facing OpenClaw tool.

Follow-up work:

1. Keep official Timetables as the preferred provider when DB Marketplace
   credentials are configured.
2. Keep `bahn-web` caveats visible:
   - unofficial web endpoint
   - may change without notice
   - may block non-browser clients
   - use browser-like headers and conservative rate limits
3. Keep the Playwright-backed website fallback structured: page-context JSON
   fetch is allowed, but free-form page text scraping is not. Do not route
   deterministic delay lookup through OpenClaw `web_search`; that is an agent
   research tool, not a structured train-board API.
4. Expand recorded fixtures for the web provider as new shapes appear:
   - changed/cancelled train messages
   - replacement buses
   - route changes and cancelled stops
   - trains crossing midnight
5. Re-check current DB docs before broad publication because these APIs and
   access rules are time-sensitive.

DB Navigator app comparison:

- Exact parity with what the user sees in DB Navigator requires the app UI,
  preferably a real device or Android emulator with DB Navigator installed.
- A Dockerized Android setup may work, but is likely more brittle than a normal
  emulator or physical device.
- A data-level comparison can try DB Navigator/Vendo backend requests, but a
  test from this machine using `db-vendo-client` against
  `app.services-bahn.de/mob/bahnhofstafel/abfahrt` returned HTTP 403.
- Treat app-backend scraping as less stable than either official Timetables API
  or the passenger web endpoint.

## Credential profiles

Current storage:

- Active private data is routed through:
  `assets/private/settings.toml`
- There is no settings template file; the live router path is fixed.
- Public credential template:
  `docs/examples/credentials.example.toml`
- Real credential files:
  `assets/private/credentials/*.toml`
- Real credentials are ignored by git and should stay local.
- Credential values are loaded only inside deterministic helper functions.
  Tool results return presence flags, not raw secrets.

Current consumers:

- `dbhopper_private_settings_status` lists available `ID_USR`, `ID_CLM`,
  `ID_BUY`, and `ID_PYM` values and flags missing selected IDs.
- `dbhopper_private_settings_select` updates only `ID_USR`, `ID_CLM`,
  `ID_BUY`, and `ID_PYM`; it does not accept path fields.
- `dbhopper_query_db_delay` can load `[bahnAPI]` for DB Timetables credentials.
- `dbhopper_db_api_credential_probe` can probe `[bahnAPI]` without returning
  secrets.
- `dbhopper_db_marketplace_access_check` can inspect DB API Marketplace browser
  reachability. Browser-login proof needs `[bahnAccountAPI].username` and
  `[bahnAccountAPI].password`; `[bahnAPI].clientId` and `[bahnAPI].apiKey` are
  API credentials, not human login fields.
- `dbhopper_db_standard_login_check` can submit `[bahnAccount]` through the DB
  website login for one-time onboarding checks.
- `dbhopper_ticket_buying_dry_run` can use `[browser].userDataDir` as a
  persistent Chromium profile.
- `dbhopper_ticket_buying_dry_run` can use `[bahnAccount]` when
  `login_before_search: true`; it checks DB's stay-logged-in box by default
  when the login page exposes one. It is not used to submit or buy anything.

Validation:

- `dbhopper_credentials_validate` checks all local credential TOML files.
- Unknown fields are rejected to keep output deterministic and avoid LLM
  cleanup.
- `PATH_CRED` and `PATH_PRF` may point to external directories. Agents should
  not edit those values.

## Ticket buying WIP

Urgent goal:

- Consolidate ticket-buying into one stable user-facing capability with a clear
  name and safe contract. Once that exists, de-emphasize or deprecate the
  current exploratory `dbhopper_ticket_buying_*` helpers from the public README
  surface while keeping any useful lower-level pieces available to the agent.

Current state:

- `dbhopper_ticket_buying_research` returns candidate purchase interfaces and
  safety constraints.
- `dbhopper_ticket_buying_dry_run` can return a deterministic plan.
- With `open_browser: true`, the dry run opens `https://int.bahn.de/en`, fills
  route and outbound date/time controls, optionally logs into the configured
  Bahn account, and stops after search/results.
- `dbhopper_ticket_checkout_dry_run` can explore offer/customer-data steps as
  far as safely possible and stops at payment or final-order boundaries.
- A live headless run for Hamm(Westf)Hbf -> Köln Hbf on 2026-06-18 stopped at
  `no_safe_next_step` because the site showed the outbound frame but no visible
  offer-selection controls. It did not submit a purchase.
- The dry run is explicitly testing-only and returns
  `purchaseSubmitted: false`.
- No tool selects payment, submits payment, or finalizes a purchase.

Candidate interfaces:

- Official consumer website: `https://int.bahn.de/en`
- Official app path: DB Navigator, useful later for device/emulator work
- Official DB Marketplace Timetables: live delay only, not ticket purchase
- Partner PST interface: mentioned publicly, but treat as partner-only unless
  DB gives explicit access
- Website JSON endpoints: useful for search/delay data, not for purchase
  finalization without documented terms

Follow-up work:

1. Add controlled offer selection for a replacement train after
   `dbhopper_query_db_delay` has found the ICE/IC/EC candidate.
2. Keep payment profile data private, redacted from tool output, and out of
   browser-run artifacts after fields are filled.
3. Add an explicit confirmation gate before any future purchase-capable step.

## Local claim files

Current code writes and reads `claims/<claim-id>/claim.toml`. The whole
`claims/*` subtree remains ignored because it contains local runtime data and
evidence files.

Useful validation commands:

```bash
npm run build
npm test
node /home/iz/Dropbox/projects/openclaw/openclaw-dev/source/openclaw/openclaw.mjs \
  plugins validate --root . --entry ./dist/index.js
```

Useful official docs:

- https://developers.deutschebahn.com/db-api-marketplace/apis/product/timetables
- https://developers.deutschebahn.com/db-api-marketplace/apis/start
- https://www.bahnhof.de/en/hamm-westf-hbf/departure
- https://int.bahn.de/en/booking-information/db-navigator

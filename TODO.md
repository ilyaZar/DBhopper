# DBhopper TODO

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
- Without those credentials, the official endpoint returns HTTP 401:
  `Invalid client id or secret`.
- On this machine, no `DB_CLIENT_ID` / `DB_API_KEY` env vars and no DBhopper
  `dbClientId` / `dbApiKey` plugin config are currently configured, so the
  official `db-timetables` provider returns `needs_configuration: true`.

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
- For Hamm(Westf)Hbf -> Köln Hbf on 2026-06-10 around 22:03 CEST, it returned
  live-updating entries such as ICE 542, RE1, and ICE 842, with realtime
  departure changes visible across repeated checks.
- The public `bahnhof.de` departure page is a Next.js app shell, so raw HTML is
  not a reliable structured data source by itself.
- Live Node `fetch`/HTTPS calls to `int.bahn.de` returned `OPS_BLOCKED` during
  testing, while curl with browser-like headers worked. The `bahn-web`
  provider therefore supports `bahnWebTransport: "auto"`, which tries native
  `fetch` and then `curl`, or `bahnWebTransport: "curl"` for direct curl use.

Follow-up work:

1. Keep official Timetables as the preferred provider when DB Marketplace
   credentials are configured.
2. Keep `bahn-web` caveats visible:
   - unofficial web endpoint
   - may change without notice
   - may block non-browser clients
   - use browser-like headers and conservative rate limits
3. Add a Playwright-backed website fallback only if curl transport becomes
   unreliable. Do not route deterministic delay lookup through OpenClaw
   `web_search`; that is an agent research tool, not a structured train-board
   API.
4. Expand recorded fixtures for the web provider as new shapes appear:
   - changed/cancelled train messages
   - replacement buses
   - route changes and cancelled stops
   - trains crossing midnight
5. Re-check current DB docs before broad publication because these APIs and
   access rules are time-sensitive.
6. Do not publish/upload to ClawHub yet.

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

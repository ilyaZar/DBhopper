![DBhopper banner](assets/dbhopper_banner.png)

# DBhopper

OpenClaw tools for Deutsche Bahn delay retrieval, NRW Mobilitätsgarantie claims,
and replacement-ticket workflows.

DBhopper keeps private values in local files and returns deterministic tool
results. Agents should not clean raw DB or website payloads with the LLM.

## Local Setup

```bash
openclaw plugins install -l /home/iz/Dropbox/projects/openclaw/own-plugins/dbhopper
openclaw plugins enable dbhopper
```

Configure `plugins.entries.dbhopper.config.workspaceRoot` to this plugin
directory. DBhopper uses one local settings file:

```text
assets/private/settings.toml
```

This file is user-managed runtime state. It selects external private directories
with `path_usr`, `path_clm`, `path_buy`, and `path_pym`. Those directories must
be outside the plugin workspace/package root. The plugin process may read them,
but coding agents and read/write workspace tools should not be granted access to
those external directories.

The repo ignores private runtime files under `assets/private/` through both
`.gitignore` and `.clawhubignore`, so local settings and purchase-review
screenshots stay out of git commits, pull requests, and Clawhub packages.

Safe boilerplate TOML files live under `docs/examples/`. Copy only the settings
example into `assets/private/`; copy real credential/profile templates into an
external private directory:

```bash
mkdir -p assets/private ../dbhopper-private/credentials ../dbhopper-private/profiles
cp docs/examples/settings.example.toml assets/private/settings.toml
cp docs/examples/private-profile.example.toml \
  ../dbhopper-private/profiles/private-profile-01.toml
cp docs/examples/buying-profile.example.toml \
  ../dbhopper-private/profiles/buying-profile-01.toml
cp docs/examples/credentials.example.toml \
  ../dbhopper-private/credentials/credentials-01.toml
cp docs/examples/payment-profile.example.toml \
  ../dbhopper-private/credentials/payment-profile-01.toml
```

TOML field names are case-sensitive; use the spelling shown in the examples.

## Configuration

`assets/private/settings.toml` controls workflow gates, selected private IDs,
profile scan directories, and delay-provider defaults:

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

The four `path_*` fields are directories to scan for TOML files with matching
IDs:

- `path_usr` is scanned for files containing `ID_USR`.
- `path_clm` is scanned for files containing `ID_CLM`.
- `path_buy` is scanned for files containing `ID_BUY`.
- `path_pym` is scanned for files containing `ID_PYM`.

The directories may be identical if you want all private TOML files in one
folder. They may also be split by type. In either case, DBhopper resolves the
selected file by scanning the configured directory for exactly the matching
`ID_*` value. DBhopper rejects any `path_*` directory inside the plugin
workspace, including `assets/private/`.

DBhopper still registers the full public tool contract. When a disabled workflow
tool is called, it returns a structured `feature_disabled` result instead of
running browser automation or writing files. To change the enabled workflows,
edit the relevant `use_*` flag and reload or restart the plugin if the running
OpenClaw process does not pick up the change.

### 1. Delay retrieval

`bahn-web` uses Deutsche Bahn passenger website JSON retrieval and works without
DB API Marketplace credentials. It is deterministic after retrieval, but the
website endpoint is unofficial and may change.

To change the default delay provider, edit `delay_provider` in
`assets/private/settings.toml`. Supported values are `"bahn-web"`,
`"db-timetables"`, and `"auto"`. Keep `delay_fallback = "none"` unless the agent
should automatically retry with the other provider after a provider failure.

For the official provider, create a DB API Marketplace application, subscribe it
to the Timetables product, and put the technical credentials in `[bahn_api]` of
the selected credential TOML file.

1. Register and log in at
   `https://developers.deutschebahn.com/db-api-marketplace/apis/`.
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
   [bahn_api]
   client_id = "..."
   api_key = "..."
   ```

5. Use "Produktsuche" or "Katalog auswählen", search for `Timetable`, choose the
   free subscription, link the application to that subscription, and subscribe
   to the usage plan.
6. Under "Anwendungen", open the new application and verify:
   - product: `Timetables` with its version number
   - plan: `Free`

The free Timetables subscription currently offers 60 calls per minute.

### 2. Autonomous claims

Autonomous claim tools are disabled by default. Enable them explicitly:

```toml
use_claim_requests = true
```

Claim-specific journey, ticket, and file data is stored in
`claims/<claim-id>/claim.toml`. Claimant and bank details stay in the selected
claim profile and are joined in memory for validation and browser filing. A
successful submit writes `claim_submitted_recipe.toml` next to the downloaded
confirmation PDF as the joined audit recipe.

Use `assets/private/settings.toml` to select the claim profile and credential
IDs used for claim filing. Claim filing uses `ID_CLM` from `path_clm`.

### 3. Autonomous ticket buying

Autonomous ticket-buying tools are disabled by default. Enable them explicitly:

```toml
use_ticket_purchase = true
```

Ticket buying uses the selected private IDs from `assets/private/settings.toml`:

- `ID_USR`: Bahn account credentials and browser profile.
- `ID_BUY`: fare, class, and customer-data choices.
- `ID_PYM`: payment method and fillable payment fields.
- `purchase_mode`: final Check-page behavior.

`purchase_mode = "review"` is the default. Checkout may fill the configured
forms and reach DB's final Check page, then it saves a sensitive screenshot
artifact for user inspection and stops before any final order control.

`purchase_mode = "auto"` records that automatic buying was requested, but final
buying is not enabled yet. The tool returns `auto_unavailable` before any final
order button.

Change the mode with `dbhopper_private_settings_select` by passing
`purchase_mode: "review"` or `purchase_mode: "auto"`.

Buying profiles support `super_sparpreis`, `sparpreis`, `flexpreis`, and
`cheapest_available`. Payment-profile summaries expose only method and
field-presence metadata, never payment values. Logged-in DB account identity
fields are checked but not changed.

## Usage

### 1. Delay retrieval

Ask the agent to query train delays and direct replacement options. The main
tool is `dbhopper_query_db_delay`; setup diagnostics include
`dbhopper_db_api_credential_probe` and `dbhopper_db_marketplace_access_check`.

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

`dbhopper_query_db_delay` uses inclusive bounds around the explicit query time:
`[query_time - window_width_minutes, query_time + window_width_minutes]`. It
checks regional candidates by delay at the boarding station and checks direct
ICE/IC/EC replacement candidates for reachability.

The query response is already normalized for downstream use. `table_rows`
contains display-ready route candidates, while `cleaned_summary` contains
candidate counts and reachability booleans. Timetables and `bahn-web` preserve
both the public line, such as `RE6`, and the technical identity, such as
`NX 89718`.

### 2. Autonomous claims

With `use_claim_requests: true`, the agent can prepare, validate, and file NRW
Mobilitätsgarantie claims:

- `dbhopper_prepare_claim` creates or replaces a local claim folder.
- `dbhopper_validate_claim` checks deterministic eligibility facts.
- `dbhopper_run_claim` drives the browser filing flow for a prepared claim.

`dbhopper_run_claim` defaults to dry-run behavior and submits only after the
explicit confirmation fields are set. OpenClaw approval hooks can require
approval for all claim tools or only mutating claim tools, depending on
`approvalMode`.

### 3. Autonomous ticket buying

With `use_ticket_purchase = true`, the agent can use ticket-buying workflows for
a replacement train after delay retrieval identifies a reachable option.

The main ticket tools are:

- `dbhopper_db_standard_login_check` verifies the selected Bahn account and
  browser profile.
- `dbhopper_ticket_buying_research` returns the deterministic purchase-path
  assumptions.
- `dbhopper_ticket_buying_dry_run` searches for replacement-ticket options.
- `dbhopper_ticket_checkout_dry_run` explores checkout with hard safety gates.

Use these tools after the delay result identifies the target route, service
date, train label, and departure time. Ticket workflows use deterministic
browser automation. In review mode, the checkout tool stores the user-facing
`reviewScreenshot` under ignored `assets/private/purchases/` and returns that
path for the agent to show to the user. Per-stage page text and screenshot
trails are test-drive artifacts only; pass `test_drive_purchase: true` when
explicitly asked to create that numbered comparison trail under ignored `tmp/`.
In auto mode, final buying still stops with `auto_unavailable`; there is no
final purchase click yet. The agent should not infer or invent checkout state
from screenshots or raw page text.

## Security Architecture

DBhopper is designed so the OpenClaw agent can request DB delay, claim, and
ticket workflows without receiving the private TOML values that execute those
workflows. The agent and Gateway see tool schemas, approval prompts, selected
IDs, file/path metadata, boolean presence flags, normalized results, and local
artifact paths. They should not receive DB account passwords, DB API keys,
payment values, claimant profile values, bank data, cookies, or raw private
profile TOML content through normal tool results.

The local DBhopper plugin process is the boundary layer. It reads
`assets/private/settings.toml`, resolves `ID_USR`, `ID_CLM`, `ID_BUY`, and
`ID_PYM` against the external `path_usr`, `path_clm`, `path_buy`, and `path_pym`
directories, and loads the selected TOML files locally. DBhopper rejects those
`path_*` directories when they resolve inside the plugin workspace, so the
normal setup keeps real credentials and profiles outside the workspace that
coding agents can inspect.

Sensitive values are used inside the plugin process. DB account credentials and
payment fields are passed to Playwright form controls through DBhopper's
sensitive input helper, which sets the browser DOM value in the page context and
returns only generic success/failure state. DB API Marketplace credentials are
attached as request headers inside the delay-provider code. Claimant and bank
profile values are merged in memory for validation and browser filing; the draft
`claims/<claim-id>/claim.toml` must not contain those private fields.

Local artifacts are intentionally local and should be treated as sensitive.
Claim browser runs write screenshots and page text under ignored `tmp/`. Ticket
checkout review mode writes the final user-review screenshot under ignored
`assets/private/purchases/`; numbered per-stage ticket page text and screenshots
are created only when `test_drive_purchase: true` is explicitly passed. These
artifact paths may be returned to the agent, but the files themselves remain on
the local machine unless the user chooses to inspect or share them.

```text
+----------------------------- +                +------------------------------+
| I. Local machine             |                | II. OpenClaw agent + Gateway |
+------------------------------+                +------------------------------+
| storage of sensitive data    |                | sees config paths and IDs    |
|                              |                | sees workflow status/proofs  |
| 1. profiles in .TOML files   |                | sees local artifact paths    |
|   - DB logins and API keys   |                | does NOT see sensitive data: |
|   - claim requests           |                |  -> no TOML secrets/cookies  |
| 2. private data in TOML files|                |  -> no profile/payment data  |
| - ticket and banking data    |                +----+-----+-------------------+
| - browser profile / cookies  |                     |     ^ redacted, i.e.,
| - claims, evidence, artifacts|                     |     | processed info
+-------------+----------------+          tool calls v     |
      ^                                 +------------+-----+-------------------+
      |                                 | III. DBhopper plugin process         |
      |                                 +--------------------------------------+
      |  reads settings file locally    | validates settings/TOML files, then: |
      |  reads private .toml locally    |   1. delay retrieval from DB         |
      +---------------------------------|   2. claim filing/mobilitätsgarantie |
                                        |   3. ticket search/purchase          |
                                        +--------------------+-----------------+
                                                             |
                                                             |
                         fills browser controls locally:     |
                         -> sends forms/requests to websites |
                                                             v
                                     +-----------------------+----------------+
                                     | IV. DB, bahn.de, DB API, NRW form      |
                                     +----------------------------------------+
                                     | DB Timetables and bahn-web delay       |
                                     | Mobilitaetsgarantie claim form         |
                                     | DB account login and ticket purchasing |
                                     +----------------------------------------+
```

## Troubleshooting

If an OpenClaw-routed agent can describe the skill but cannot call `dbhopper_*`,
check the sandbox tool policy. The local config needs DBhopper in both
`tools.alsoAllow` and `tools.sandbox.tools.alsoAllow`.

If a workflow tool returns `feature_disabled`, check
`assets/private/settings.toml`, enable the matching `use_*` flag, and reload or
restart the plugin if the running OpenClaw process does not pick up the change.

## Development

```bash
npm run build
npm run plugin:build
npm run plugin:validate
npm test
npm run package:check
```

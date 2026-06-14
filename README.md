![DBhopper banner](assets/dbhopper_banner.png)

# DBhopper

OpenClaw tools for Deutsche Bahn delay retrieval, NRW
Mobilitätsgarantie claims, and replacement-ticket workflows.

DBhopper keeps private values in local files and returns deterministic tool
results. Agents should not clean raw DB or website payloads with the LLM.

## Local Setup

```bash
openclaw plugins install -l /home/iz/Dropbox/projects/openclaw/own-plugins/dbhopper
openclaw plugins enable dbhopper
```

Configure `plugins.entries.dbhopper.config.workspaceRoot` to this plugin
directory. DBhopper has two local settings layers:

- `settings.yaml` at the plugin top level controls which workflow tool calls
  are allowed to run.
- `assets/private/settings.toml` selects private credential, claim-profile, and
  buying-profile IDs plus private file paths.

The default `settings.yaml` enables only delay retrieval:

```yaml
use_delay_retrieval: true
use_claim_requests: false
use_ticket_buying: false
```

DBhopper still registers the full public tool contract. When a disabled
workflow tool is called, it returns a structured `feature_disabled` result
instead of running browser automation or writing files. To change the enabled
workflows, edit `settings.yaml` and set the relevant flag to `true`; reload or
restart the plugin if the running OpenClaw process does not pick up the change.

Private profile and credential templates live under `docs/examples/`. Create
the local private directories, then copy templates into them:

```bash
mkdir -p assets/private/credentials assets/private/profiles
cp docs/examples/private-profile.example.toml \
  assets/private/profiles/private-profile-01.toml
cp docs/examples/buying-profile.example.toml \
  assets/private/profiles/buying-profile-01.toml
cp docs/examples/credentials.example.toml \
  assets/private/credentials/credentials-01.toml
```

Keep real profiles and credentials private.

TOML field names are case-sensitive; use the spelling shown in the examples.

## Configuration

### 1. Delay retrieval

Delay retrieval is enabled by default through top-level `settings.yaml`:

```yaml
use_delay_retrieval: true
```

The default provider is controlled in `assets/private/settings.toml`:

```toml
ID_USR = "01"
ID_CLM = "01"
ID_BUY = "01"
ID_PYM = "01"
ticket_buying_mode = "review"
path_cred = "assets/private/credentials"
path_prf = "assets/private/profiles"
delay_provider = "bahn-web"
delay_fallback = "none"
```

`bahn-web` uses Deutsche Bahn passenger website JSON retrieval and works without
DB API Marketplace credentials. It is deterministic after retrieval, but the
website endpoint is unofficial and may change.

To change the default delay provider, edit `delay_provider` in
`assets/private/settings.toml`. Supported values are `"bahn-web"`,
`"db-timetables"`, and `"auto"`. Keep `delay_fallback = "none"` unless the
agent should automatically retry with the other provider after a provider
failure.

For the official provider, create a DB API Marketplace application, subscribe
it to the Timetables product, and put the technical credentials in `[bahn_api]`
of the selected credential TOML file.

1. Register and log in at
   `https://developers.deutschebahn.com/db-api-marketplace/apis/`.
2. Open getting started, "Los gehts", step 02, then click
   "Neue Anwendung erstellen".
3. Fill the application form:
   - title: "DBhopper Timetables Delay Lookup"
   - "Zertifikat": leave empty
   - description: Local DBhopper tool for Deutsche Bahn Timetables API delay
     lookup. Uses station, plan, fchg, and rchg endpoints for deterministic
     train-delay queries. No OAuth redirect flow.
   - "OAuth-Umleitungs-URL(s)": leave empty
   - click "Speichern"
4. On "Neue Anwendungsberechtigungsnachweise", copy "Client ID" and
   "Client Secret (API KEY)" into the selected credentials file:

   ```toml
   [bahn_api]
   client_id = "..."
   api_key = "..."
   ```

5. Use "Produktsuche" or "Katalog auswählen", search for `Timetable`, choose
   the free subscription, link the application to that subscription, and
   subscribe to the usage plan.
6. Under "Anwendungen", open the new application and verify:
   - product: `Timetables` with its version number
   - plan: `Free`

The free Timetables subscription currently offers 60 calls per minute.

### 2. Autonomous claims

Autonomous claim tools are disabled by default. Enable them explicitly:

```yaml
use_claim_requests: true
```

Claim-specific journey, ticket, and file data is stored in
`claims/<claim-id>/claim.toml`. Claimant and bank details stay in the selected
claim profile and are joined in memory for validation and browser filing. A
successful submit writes `claim_submitted_recipe.toml` next to the downloaded
confirmation PDF as the joined audit recipe.

Use `assets/private/settings.toml` to select the claim profile and credential
IDs used for claim filing. `path_cred` and `path_prf` may be relative to the
plugin directory or absolute paths in the user file system. Claim filing uses
`ID_CLM` from the shared profiles directory.
The `assets/private/settings.toml` file itself always stays in that fixed
location.

### 3. Autonomous ticket buying

Autonomous ticket-buying tools are disabled by default. Enable them explicitly:

```yaml
use_ticket_buying: true
```

Ticket buying uses the selected private IDs from
`assets/private/settings.toml`:

- `ID_USR`: Bahn account credentials and browser profile.
- `ID_BUY`: fare, class, and customer-data choices.
- `ID_PYM`: payment method and fillable payment fields.
- `ticket_buying_mode`: final Check-page behavior.

`ticket_buying_mode = "review"` is the default. Checkout may fill the
configured forms and reach DB's final Check page, then it saves a sensitive
screenshot artifact for user inspection and stops before any final order
control.

`ticket_buying_mode = "auto"` records that automatic buying was requested, but
final buying is not enabled yet. The tool still stops with
`buying_not_enabled` before the final order button.

Change the mode with `dbhopper_private_settings_select` by passing
`ticket_buying_mode: "review"` or `ticket_buying_mode: "auto"`.

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

With `use_ticket_buying: true`, the agent can use ticket-buying workflows for a
replacement train after delay retrieval identifies a reachable option.

The main ticket tools are:

- `dbhopper_db_standard_login_check` verifies the selected Bahn account and
  browser profile.
- `dbhopper_ticket_buying_research` returns the deterministic purchase-path
  assumptions.
- `dbhopper_ticket_buying_dry_run` searches for replacement-ticket options.
- `dbhopper_ticket_checkout_dry_run` explores checkout with hard safety gates.

Use these tools after the delay result identifies the target route, service
date, train label, and departure time. Ticket workflows use deterministic
browser automation and ignored local artifacts. In review mode, the checkout
tool returns `reviewScreenshot` for the agent to show to the user. In auto
mode, final buying still stops with `buying_not_enabled`; there is no final
purchase click yet. The agent should not infer or invent checkout state from
screenshots or raw page text.

## Troubleshooting

If an OpenClaw-routed agent can describe the skill but cannot call
`dbhopper_*`, check the sandbox tool policy. The local config needs DBhopper in
both `tools.alsoAllow` and `tools.sandbox.tools.alsoAllow`.

If a workflow tool returns `feature_disabled`, check `settings.yaml`, enable the
matching `use_*` flag, and reload or restart the plugin if the running
OpenClaw process does not pick up the change.

## Development

```bash
npm run build
npm run plugin:build
npm run plugin:validate
npm test
npm run package:check
```

# Private Settings

DBhopper routes active private data through:

```text
assets/private/settings.toml
```

There is no second settings template file. The fixed settings path above is
user-managed local runtime state and is not packaged.

## Shape

`settings.toml` has these fields:

```toml
use_delay_retrieval = true
use_claim_requests = false
use_ticket_purchase = false
test_run_claim_request = false
test_run_purchase = false

ID_USR = "01"
ID_CLM = "01"
ID_BUY = "01"
ID_PYM = "01"
claim_request_mode = "review"
purchase_mode = "review"
path_usr = "../dbhopper-private/credentials"
path_clm = "../dbhopper-private/claims"
path_buy = "../dbhopper-private/profiles"
path_pym = "../dbhopper-private/credentials"
path_prc = "../dbhopper-private/purchases"
delay_provider = "bahn-web"
delay_fallback = "none"
```

- `use_delay_retrieval` controls delay-query tools.
- `use_claim_requests` controls claim-preparation and filing tools.
- `use_ticket_purchase` controls ticket-purchase dry-run tools.
- `test_run_claim_request` controls page-by-page claim browser text and
  screenshots. Keep it `false` for normal runs; the final summary screenshot is
  still saved for user review.
- `test_run_purchase` controls numbered purchase browser text and screenshots.
  Keep it `false` for normal runs; the final checkout review screenshot is
  still saved under `path_prc`.
- `claim_request_mode` controls the final Mobilitätsgarantie claim filing gate.
  `"review"` is the default and always stops at the summary page with a
  `summaryScreenshot`. `"auto"` allows submit mode only when the tool call also
  passes `mode: "submit"` and `confirmSubmit: true`.
- `ID_USR` selects one user credential file from `path_usr`.
- `ID_CLM` selects one claim TOML from `path_clm` when a routed claim file
  contains the same `ID_CLM` field.
- `ID_BUY` selects one buying profile file from `path_buy`.
- `ID_PYM` selects one payment profile file from `path_pym`.
- `purchase_mode` controls the final DB Check-page gate. `"review"` is the
  default and saves a sensitive screenshot artifact under `path_prc` for user
  inspection. `"auto"` requests automatic buying, but buying is not enabled yet,
  so the run still aborts before any final order button with `auto_unavailable`.
- `path_usr`, `path_buy`, and `path_pym` point to external directories to scan
  for files with the matching `ID_*` field. `path_clm` points to external claim
  TOML storage and supports both `<claim-id>/claim.toml` and `<claim-id>.toml`.
- `path_prc` points to an external directory for sensitive purchase review
  screenshot artifacts.
- `delay_provider` selects the default delay data source for omitted provider
  tool calls.
- `delay_fallback` controls fallback behavior; `"none"` disables automatic
  fallback.

Paths may be relative to the plugin directory or absolute within the user file
system, but every resolved `path_*` directory must be outside the plugin
workspace/package root. The plugin process may read the profile and credential
directories and write to `path_prc`. Coding agents and workspace read/write
tools should be denied access to them.

OpenClaw agents should only change selected IDs through
`dbhopper_private_settings_select`, and workflow or mode settings through
`dbhopper_private_settings_configure`. They must not change path fields or read
private values into the conversation. The settings file itself always remains
at `assets/private/settings.toml`. Manual local edits are also valid when you
want to control the file directly.

## File IDs

Every routed credential file needs an `ID_USR`:

```toml
ID_USR = "01"
```

Every claim TOML that should be selectable by `ID_CLM` needs an `ID_CLM`:

```toml
ID_CLM = "01"
```

Every routed buying profile file needs an `ID_BUY`:

```toml
ID_BUY = "01"
```

Every routed payment profile file needs an `ID_PYM`:

```toml
ID_PYM = "01"
```

IDs are quoted strings such as `"01"`, `"02"`, and `"03"`.

## Claim Fields

Claim TOML files live under `path_clm` and are selected by `ID_CLM`. They may
be stored either as `<claim-id>/claim.toml` with evidence files next to the
TOML, or as `<claim-id>.toml` when no per-claim directory is needed.

The full dummy example is:

```text
docs/examples/claim.example.toml
```

Current top-level fields:

- `ID_CLM`: required quoted claim ID, for example `"01"`.
- `status`: optional local workflow state, for example `"draft"`.

Current claimant sections:

- `[claimant].salutation`: one of `MR`, `MS`, `DIVERS`, or `FAMILY`.
  German form labels `Herr`, `Frau`, `Divers`, and `Keine Angabe` are also
  accepted and normalized.
- `[claimant].first_name`: claimant first name.
- `[claimant].last_name`: claimant last name.
- `[claimant].email`: claimant email address.
- `[claimant].phone`: claimant phone number.
- `[claimant.address].street_number`: claimant street and house number.
- `[claimant.address].zip`: claimant postal code.
- `[claimant.address].city`: claimant city.
- `[claimant.address].country`: claimant country.
- `[claimant.bank].account_owner`: bank account owner.
- `[claimant.bank].iban`: IBAN for reimbursement.

Current journey section:

- `[journey].date`: incident date as `YYYY-MM-DD`.
- `[journey].scheduled_departure_time`: scheduled departure time as `HH:MM`.
- `[journey].start_station`: user-facing departure station guess. Browser
  automation resolves it to an exact live dropdown entry before submitting the
  station field.
- `[journey].end_station`: user-facing destination station guess. Browser
  automation resolves it to an exact live dropdown entry before submitting the
  station field.
- `[journey].planned_line`: delayed local line, for example `RE5`.
- `[journey].planned_train_label`: optional train label when a line alone is
  not specific enough.
- `[journey].delay_minutes`: optional known delay in minutes.
- `[journey].disruption_type`: `delay` or `cancellation`.
- `[journey].replacement_started_at`: replacement-service start time as
  `HH:MM`.
- `[journey].used_delayed_vehicle`: optional boolean exclusion check.
- `[journey].used_identical_local_alternative`: optional boolean exclusion
  check.
- `[journey].excluded_reasons`: optional list of known exclusion reasons.

Current ticket section:

- `[ticket].base_ticket_name`: original ticket name shown to the form.
- `[ticket].base_ticket_category`: original ticket category label.
- `[ticket].tariff_area`: tariff label, usually `NRW-Tarif`.
- `[ticket].substitute_type`: one of `long_distance`, `taxi`, `sharing`, or
  `alternative_local`.
- `[ticket].substitute_cost`: replacement-service cost as a number.
- `[ticket].companions`: companion count as a number.
- `[ticket].description`: free-text message for the claim. The default
  messages keep German umlauts and the final exclamation mark.

Current file entries:

- `[[files]].role`: one of `base_ticket`, `substitute_receipt`,
  `delay_evidence`, `submission_pdf`, `screenshot`, or `other`.
- `[[files]].path`: one claim-local file path for this role.
- `[[files]].paths`: multiple claim-local file paths for this role. Use this
  for delay evidence and keep delay evidence at three files or fewer.
- `[[files]].reusable_asset`: optional boolean for reusable local assets.

Only claim-local relative file paths should be used in public examples. Real
ticket, receipt, delay screenshot, bank, claimant, and browser data belong only
in external private directories.

## Buying Profile Fields

Current top-level fields:

- `ID_BUY`: required quoted numeric buying profile ID, for example `"01"`.
- `default_fare`: first fare product to select on the DB Offers page.
- `fallback_fares`: ordered fallback fare products when the default is not
  visible on the current DB Offers page.
- `travel_class`: optional class preference, `"second"` by default.
- `continue_to_customer_data`: optional boolean; `true` selects the fare and
  then clicks the offer-page `Continue` button so checkout stops on Customer
  data. Set it to `false` for an Abnahme stop on the fare cards.
- `booking_for`: optional customer-data choice, `"self"` by default.
- `continue_to_payment_boundary`: optional boolean; `true` applies
  `booking_for` and clicks the customer-data `Continue` button so checkout
  reaches the payment boundary. Payment-profile filling may then run, but
  automation still stops before payment-page continuation or final order
  controls.

Supported fare product names:

- `super_sparpreis`: DB label `Super Sparpreis`.
- `sparpreis`: DB label `Sparpreis`.
- `flexpreis`: DB label `Flexpreis`.
- `cheapest_available`: cheapest visible selectable offer matching the
  configured travel class.

DB may show Sparpreis/Flexpreis products on some long-distance connections,
local products such as NRW tickets on other connections, or a changing mix of
offer cards. The selector is opportunistic: it tries configured fare names only
when matching cards are visible, and otherwise falls back to the cheapest
visible selectable offer for the configured class.

Supported travel class names are `second` and `first`.

Supported `booking_for` name: `self`.

## Payment Profile Fields

Payment profiles live under `path_pym` and are selected by `ID_PYM`.

Current top-level fields:

- `ID_PYM`: required quoted numeric payment profile ID, for example `"01"`.
- `method`: one of `sepa`, `credit_card`, or `paypal`.

Current payment profile sections:

- `[payment.sepa].account_owner`: SEPA account owner. During logged-in DB
  checkout this is checked against the DB account value but not changed.
- `[payment.sepa].iban`: SEPA IBAN.
- `[payment.sepa].birthdate`: optional account-holder birth date. Use
  `YYYY-MM-DD` in TOML; DB's `DD/MM/YYYY` form format is accepted as input and
  used for comparison. During logged-in DB checkout this is checked against the
  DB account value but not changed.
- `[payment.sepa.address]`: optional grouped address table. It accepts
  `street_number`, `additional_info`, `zip`, `city`, and `country`.
- `[payment.sepa].mandate_accepted`: optional boolean for the SEPA mandate
  checkbox when DB exposes it.
- `[payment.sepa].save_as_preferred`: optional boolean for DB's preferred
  payment toggle.
- `[payment.card].cardholder_name`: cardholder name.
- `[payment.card].card_number`: card number.
- `[payment.card].expiry_month`: optional expiration month.
- `[payment.card].expiry_year`: optional expiration year.
- `[payment.card].save_as_preferred`: optional boolean for DB's preferred
  payment toggle.

Do not store CVC, CVV, CID, PIN, or similar authentication secrets in DBhopper
payment profiles. Those fields are rejected by the parser.

Use only the snake_case keys shown above. Direct SEPA address fields under
`[payment.sepa]` are rejected.

For SEPA checkout, DB account data may prefill account-holder and registered
address fields. DB account identity values, currently account-holder name and
birth date, are authoritative when logged in: automation checks them, keeps the
DB account values, and reports profile mismatches as warnings. Fillable SEPA
values such as IBAN, mandate, and address fields still use the payment profile
as the flexible source: automation compares configured profile values with the
visible form value, leaves matching prefill untouched, and updates mismatches.
Tool results report only field names as filled, matched, mismatched, or
missing.

Example private files:

```text
../dbhopper-private/credentials/credentials-01.toml
../dbhopper-private/credentials/credentials-02.toml
../dbhopper-private/credentials/payment-profile-01.toml
../dbhopper-private/claims/essen-koeln-2026-06-26-re1/claim.toml
../dbhopper-private/claims/duisburg-koeln-2026-06-18-re5.toml
../dbhopper-private/profiles/buying-profile-01.toml
```

Safe public credential, claim, payment, and buying templates live under
`docs/examples/`. Create the private directories, then copy those files before
adding real account, claimant, ticket, receipt, or bank values.

```bash
mkdir -p ../dbhopper-private/credentials ../dbhopper-private/claims
mkdir -p ../dbhopper-private/profiles
```

## Tools

Use `dbhopper_private_settings_status` to list available user credential,
claim, buying, and payment IDs. It returns an error when the selected ID does
not exist.

Use `dbhopper_private_settings_select` to update `ID_USR`, `ID_CLM`, `ID_BUY`,
and/or `ID_PYM`. That tool does not accept path fields, so an agent cannot
change the directories where private files are stored.

Use `dbhopper_private_settings_configure` to update important runtime choices:

- `use_delay_retrieval`: enables or disables DB delay-query tools.
- `use_claim_requests`: enables or disables claim preparation and browser
  filing tools.
- `use_ticket_purchase`: enables or disables ticket search and checkout dry-run
  tools.
- `test_run_claim_request`: enables or disables page-by-page claim browser text
  and screenshots. Normal runs still save the final summary review screenshot.
- `test_run_purchase`: enables or disables numbered purchase browser text and
  screenshots. Normal review runs still save the Check-page review screenshot.
- `claim_request_mode`: chooses `"review"` to stop on the claim summary page
  with a review screenshot, or `"auto"` to allow explicitly confirmed submit
  mode.
- `delay_provider`: chooses `"bahn-web"` website retrieval, `"db-timetables"`
  official DB API calls, or `"auto"` provider selection.
- `delay_fallback`: chooses a retry backend after provider failure, or `"none"`
  for no automatic retry.
- `purchase_mode`: chooses `"review"` to stop on the DB Check page with a
  review screenshot, or `"auto"` to request automatic purchase mode. Current
  code still stops with `auto_unavailable` before final buying.

The configure tool always previews current values, requested values, changed
fields, and the plain-language meaning of each change. It writes
`settings.toml` only when called again with `confirm: true`.

# TOML Snake Case Refactor

## Context

This pass executed `docs/refactor_pass_02.md` after reviewing the current
branch commits relative to `main`:

- `92f69bc`: simplified ticket-buying helpers and introduced shared
  `src/errors.ts`.
- `2f89860`: moved repeated TOML parse and validation-message helpers into
  `src/toml.ts` and `src/validation-messages.ts`.
- `1fc8da8`: reused the shared `errorMessage` helper across provider modules.
- `66c6ff8`: documented the first cleanup pass in
  `docs/refactor_pass_01.md`.

The important design signal from those commits is that TOML parsing and
validation helpers already have a shared home. This pass extends that boundary
instead of adding one-off key rewrites to each parser.

## Auto RF Scan

Commands:

```bash
/home/iz/Dropbox/workflow/other-skills/auto-rf/scripts/auto-rf --mode auto --dry-run
/home/iz/Dropbox/workflow/other-skills/auto-rf/scripts/auto-rf \
  --mode repo \
  --max-files 0 \
  --json-output /tmp/dbhopper-auto-rf.json
```

Results:

- Auto mode selected only the untracked pass document and found no candidates.
- Repo mode scanned 67 selected files and reported 34 advisory candidates.
- Most candidates were unrelated repeated test data, tool-definition shapes,
  or ticket-buying browser snippets.
- The only relevant signal was that the previous pass had already centralized
  TOML parse handling, making `src/toml.ts` the correct place for alias
  normalization.

Rejected or deferred candidates:

- Live-delay test route-table repetition: static test data, not part of the
  TOML naming migration.
- Ticket-buying DOM helper repetition: already handled by pass 01 and outside
  this TOML schema pass.
- Tool-definition shape repetition: unrelated public tool metadata cleanup.
- Test setup repetition: useful fixture duplication, not a schema refactor.

Accepted candidate:

- Extend shared TOML helpers with key-alias normalization and output-key
  renaming, then use those helpers from each TOML parser.

## Inventory

Canonical TOML names are lowercase snake_case. Old camelCase and uppercase
routing keys remain accepted as temporary aliases.

Settings:

- `id_usr`, `id_clm`, `id_buy`, and `id_pym`.
- `ticket_buying_mode`, `path_cred`, and `path_prf`.
- `delay_provider` and `delay_fallback`.

Credentials:

- `[bahn_api]`, `[bahn_account]`, and `[bahn_account_api]`.
- `client_id`, `api_key`, and `user_data_dir`.

Buying profiles:

- `default_fare`, `fallback_fares`, and `travel_class`.
- `continue_to_customer_data`, `booking_for`, and
  `continue_to_payment_boundary`.

Payment profiles:

- `account_owner`, `street_number`, and `additional_info`.
- `zip`, `city`, `mandate_accepted`, and `save_as_preferred`.
- `cardholder_name`, `card_number`, `expiry_month`, and `expiry_year`.

Claims and private claim profiles:

- `claim_id`, `first_name`, `last_name`, and `street_number`.
- `scheduled_departure_time`, `start_station`, `end_station`,
  `planned_line`, and `planned_train_label`.
- `delay_minutes`, `disruption_type`, `replacement_started_at`,
  `used_delayed_vehicle`, `used_identical_local_alternative`, and
  `excluded_reasons`.
- `base_ticket_name`, `base_ticket_category`, `tariff_area`,
  `substitute_type`, `substitute_cost`, and `reusable_asset`.

Payment alias decisions:

- `street_number` is canonical. `street_and_house_number`,
  `street_n_house_num`, `streetAndHouseNumber`, and `streetNhouseNum` are
  aliases.
- `additional_info` is canonical. `other_address`, `other_adress`,
  `other_address_info`, `other_adress_info`, and old camelCase variants are
  aliases.
- `zip` is canonical. `postcode`, `postal_code`, and `postalCode` are aliases.
- `city` is canonical. `town_city` and `townCity` are aliases.
- `birthdate` remains canonical; `birthday` remains a compatibility alias
  because it also accepts DB UI date formatting.

ID decision:

- Canonical TOML now uses `id_usr`, `id_clm`, `id_buy`, and `id_pym`.
- Internal TypeScript and tool result fields continue to use `ID_USR`,
  `ID_CLM`, `ID_BUY`, and `ID_PYM`.
- Uppercase ID keys remain accepted as aliases to preserve existing private
  files and external habits during migration.

## Internal Name Decision

Two designs were compared:

1. TOML boundary normalization only.
2. End-to-end snake_case inside TypeScript interfaces, tool results, browser
   code, tests, and docs.

Decision: use TOML boundary normalization only.

Reasons:

- The public TypeScript/tool surface already returns camelCase and uppercase ID
  fields. Changing it would create a broad public API break unrelated to TOML
  file readability.
- The browser and validation code already use camelCase object paths. Keeping
  that internal shape avoids stale dual lookup tables in runtime code.
- Type safety is stronger when only parser entrypoints translate aliases and
  every downstream consumer sees the existing internal interfaces.
- The blast radius is concentrated in parser modules, examples, docs, tests,
  and TOML output.

## Implementation

Accepted changes:

- Added `normalizeTomlKeys` and `renameTomlKeys` to `src/toml.ts`.
- Normalized settings, credentials, buying profile, payment profile, claim, and
  private profile TOML at parser boundaries.
- Rejected alias conflicts with a clear `aliases must not disagree` error.
- Kept unknown-key rejection after normalization.
- Changed `stringifyPrivateSettingsToml`, `stringifyClaimToml`, and
  `stringifySubmittedRecipeToml` output to canonical snake_case.
- Updated examples, README, docs, skill guidance, and tests.
- Migrated ignored local TOML files under `assets/private/**/*.toml` and
  `claims/*/claim.toml` by key name only, without printing private values.

Deferred:

- Removing old camelCase aliases. Keep them until there is a deliberate
  compatibility-breaking release.
- Renaming internal TypeScript fields and tool result fields. This was rejected
  for this pass because the cost is high and the TOML boundary is enough.

## Verification

Focused verification run:

```bash
npm run build && node --test \
  test/credentials.test.js \
  test/payment-profile.test.js \
  test/buying-profile.test.js \
  test/private-settings.test.js \
  test/workspace.test.js \
  test/access-tools.test.js \
  test/db-delay-tools.test.js
```

Result: 36 focused tests passed.

Workspace-specific rerun after adding claim alias tests:

```bash
npm run build && node --test test/workspace.test.js
```

Result: 8 workspace tests passed.

Final verification:

```bash
npm test
npm run package:check
npm pack --dry-run --json --ignore-scripts
```

Results:

- `npm test`: 72 tests passed.
- `npm run package:check`: 3 package metadata tests passed.
- `npm pack --dry-run --json --ignore-scripts`: succeeded with 114 packaged
  entries and only `.gitkeep` files from private/runtime directories.
- All four `docs/examples/*.toml` files parsed through the built parsers.
- Local migrated private/runtime TOML validation returned `ok: true`; the only
  message code was existing informational `unrouted_private_toml`.

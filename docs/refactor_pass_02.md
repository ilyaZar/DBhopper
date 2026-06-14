In /home/iz/Dropbox/projects/openclaw/own-plugins/dbhopper, investigate and
implement a TOML key-style migration from camelCase to lowercase snake_case
across DBhopper private TOML files and examples. Use $auto-rf and $rf
iteratively: first scout/ inventory, then make small behavior-preserving passes,
logging decisions and verification.

Context:

- Respect AGENTS.md.
- The repo may already have uncommitted changes. Do not revert unrelated/user
  changes.
- Private real TOML files under assets/private/\*\* are ignored and may contain
  secrets. Never print values. You may inspect/migrate key names only.
- Tests import dist, so run npm run build before node tests when needed.

Primary objective: Make user-maintained TOML schemas use lowercase snake_case
field names instead of camelCase, for:

- credentials TOML
- payment profile TOML
- username/password sections
- buying profile TOML
- claim/private profile TOML
- docs/examples/\*.toml
- tests and docs that demonstrate TOML

Use $auto-rf first:

- Inventory all TOML-facing camelCase keys and camelCase section names.
- Include docs/examples, tests, parser schemas, local ignored assets/private key
  names, and user docs.
- Identify canonical new snake_case names.
- Identify backwards-compatible aliases to keep temporarily.

Use $rf next:

- Objectively and unprejudiced, evaluate whether internal TypeScript names
  should also be translated to snake_case for consistency.
- Compare both designs:
  1. TOML boundary normalization only: TOML snake_case, internal TS/tool/result
     objects remain camelCase.
  2. End-to-end snake_case internally: TS interfaces, parser output, validation,
     tool result fields, browser code, tests, docs all use snake_case.
- Judge by maintainability, blast radius, type safety, risk of stale lookup
  tables, readability, public API stability, and test cost.
- Do not assume camelCase is better just because it is idiomatic TS. If
  snake_case internally is clearly less error-prone here, say so and implement
  it. If boundary normalization is safer, implement that and document why.

Likely current mappings to investigate:

- credentials:
  - [bahnAPI] -> [bahn_api]
  - [bahnAccount] -> [bahn_account]
  - [bahnAccountAPI] -> [bahn_account_api]
  - clientId -> client_id
  - apiKey -> api_key
  - userDataDir -> user_data_dir
- buying profile:
  - defaultFare -> default_fare
  - fallbackFares -> fallback_fares
  - travelClass -> travel_class
  - continueToCustomerData -> continue_to_customer_data
  - bookingFor -> booking_for
  - continueToPaymentBoundary -> continue_to_payment_boundary
- payment profile:
  - accountOwner -> account_owner
  - streetNumber -> street_number
  - streetAndHouseNumber -> street_and_house_number
  - streetNhouseNum -> decide canonical/deprecated alias
  - additionalInfo -> additional_info
  - otherAddress / otherAdress / otherAddressInfo / otherAdressInfo -> decide
    canonical/deprecated aliases
  - postalCode -> postal_code
  - townCity -> town_city
  - mandateAccepted -> mandate_accepted
  - saveAsPreferred -> save_as_preferred
  - cardholderName -> cardholder_name
  - cardNumber -> card_number
  - expiryMonth -> expiry_month
  - expiryYear -> expiry_year
- claim/private profile:
  - claimId -> claim_id
  - firstName -> first_name
  - lastName -> last_name
  - streetNumber -> street_number
  - accountOwner -> account_owner
  - scheduledDepartureTime -> scheduled_departure_time
  - startStation -> start_station
  - endStation -> end_station
  - plannedLine -> planned_line
  - plannedTrainLabel -> planned_train_label
  - delayMinutes -> delay_minutes
  - disruptionType -> disruption_type
  - replacementStartedAt -> replacement_started_at
  - usedDelayedVehicle -> used_delayed_vehicle
  - usedIdenticalLocalAlternative -> used_identical_local_alternative
  - excludedReasons -> excluded_reasons
  - baseTicketName -> base_ticket_name
  - baseTicketCategory -> base_ticket_category
  - tariffArea -> tariff_area
  - substituteType -> substitute_type
  - substituteCost -> substitute_cost
  - reusableAsset -> reusable_asset
- Decide whether ID\_\* keys should remain uppercase for compatibility or
  whether canonical TOML should be id_usr/id_clm/id_buy/ id_pym. Evaluate this
  explicitly.

Implementation expectations:

- Prefer a structured normalization helper rather than ad hoc string rewrites.
- Unknown keys should still be rejected after alias normalization, with useful
  errors.
- If both old and new aliases appear with conflicting values, reject with a
  clear error.
- Keep old camelCase aliases accepted unless you decide and document a clean
  break.
- Update stringification/output TOML to write canonical snake_case.
- Update docs/examples and tests to use canonical snake_case.
- If local ignored assets/private TOML files exist, migrate their key names in
  place without printing secret values.
- Add focused tests for:
  - snake_case parses for each TOML type
  - old camelCase compatibility if kept
  - conflict rejection when aliases disagree
  - stringify emits canonical snake_case
  - workspace validation still catches typo keys

Logging:

- Create docs/toml_snake_case_refactor.md.
- Log each $auto-rf scan, each $rf decision, accepted/rejected/deferred
  candidates, and test evidence.
- Include final objective assessment of the internal-name decision.

Verification:

- npm run build
- focused tests touched by
  credentials/payment/buying/profile/workspace/validation
- npm test
- npm run package:check
- npm pack --dry-run --json --ignore-scripts

Stop when no further reasonable TOML naming refactors remain. Report changed
files, tests run, compatibility decision, and any local ignored private files
migrated without revealing values.

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

- `ID_USR` selects one user credential file from `path_cred`.
- `ID_CLM` selects one claim profile file from `path_prf`.
- `ID_BUY` selects one buying profile file from `path_prf`.
- `ID_PYM` selects one payment profile file from `path_cred`.
- `ticket_buying_mode` controls the final DB Check-page gate. `"review"` is the
  default and saves a sensitive screenshot artifact for user inspection.
  `"auto"` requests automatic buying, but buying is not enabled yet, so the
  run still aborts before any final order button.
- `path_cred` points to the directory containing user credential and payment
  profile TOML files.
- `path_prf` points to the directory containing claim and buying profile TOML
  files.
- `delay_provider` selects the default delay data source for omitted provider
  tool calls.
- `delay_fallback` controls fallback behavior; `"none"` disables automatic
  fallback.

Paths may be relative to the plugin directory or absolute within the user file
system. The user owns path values and file contents. OpenClaw agents should
only change `ID_USR`, `ID_CLM`, `ID_BUY`, `ID_PYM`, and
`ticket_buying_mode`; they must not change path fields or read private values
into the conversation.

Use either the default private paths or user-chosen private paths inside this
single settings TOML file; private paths may be relative to the plugin
directory or absolute within the user file system, while the settings file
itself always remains at `assets/private/settings.toml`.

## File IDs

Every routed credential file needs an `ID_USR`:

```toml
ID_USR = "01"
```

Every routed claim profile file needs an `ID_CLM`:

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

IDs are quoted numeric strings such as `"01"`, `"02"`, and `"03"`.

## Claim Profile Fields

Current top-level fields:

- `ID_CLM`: required quoted numeric claim profile ID, for example `"01"`.

Current claim profile sections:

- `[claimant].salutation`: one of `MR`, `MS`, `DIVERS`, or `FAMILY`.
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

Supported `booking_for` names are `self` and `other`. The `other` value is
reserved for a later passenger-details profile; current automation supports
`self`.

## Payment Profile Fields

Payment profiles live under `path_cred` and are selected by `ID_PYM`.

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
assets/private/credentials/credentials-01.toml
assets/private/credentials/credentials-02.toml
assets/private/credentials/payment-profile-01.toml
assets/private/profiles/private-profile-01.toml
assets/private/profiles/private-profile-03.toml
assets/private/profiles/buying-profile-01.toml
```

Safe public credential/profile templates live under `docs/examples/`. Copy
those files into the private directories before adding real account, claimant,
or bank values.

## Tools

Use `dbhopper_private_settings_status` to list available user credential,
claim, buying, and payment IDs. It returns an error when the selected ID does
not exist.

Use `dbhopper_private_settings_select` to update `ID_USR`, `ID_CLM`, `ID_BUY`,
`ID_PYM`, and/or `ticket_buying_mode`. That tool does not accept path fields,
so an agent cannot change the directories where private files are stored.

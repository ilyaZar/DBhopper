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
TICKET_BUYING_MODE = "review"
PATH_CRED = "assets/private/credentials"
PATH_PRF = "assets/private/profiles"
DELAY_PROVIDER = "bahn-web"
DELAY_FALLBACK = "none"
```

- `ID_USR` selects one user credential file from `PATH_CRED`.
- `ID_CLM` selects one claim profile file from `PATH_PRF`.
- `ID_BUY` selects one buying profile file from `PATH_PRF`.
- `ID_PYM` selects one payment profile file from `PATH_CRED`.
- `TICKET_BUYING_MODE` controls the final DB Check-page gate. `"review"` is the
  default and saves a sensitive screenshot artifact for user inspection.
  `"auto"` requests automatic buying, but buying is not enabled yet, so the
  run still aborts before any final order button.
- `PATH_CRED` points to the directory containing user credential and payment
  profile TOML files.
- `PATH_PRF` points to the directory containing claim and buying profile TOML
  files.
- `DELAY_PROVIDER` selects the default delay data source for omitted provider
  tool calls.
- `DELAY_FALLBACK` controls fallback behavior; `"none"` disables automatic
  fallback.

Paths may be relative to the plugin directory or absolute within the user file
system. The user owns path values and file contents. OpenClaw agents should
only change `ID_USR`, `ID_CLM`, `ID_BUY`, `ID_PYM`, and
`TICKET_BUYING_MODE`; they must not change path fields or read private values
into the conversation.

Use either the default private paths or user-chosen private paths inside this
single settings TOML file; private paths may be relative to the plugin
directory or absolute within the user file system, while the settings file
itself always remains at `assets/private/settings.toml`.

## File IDs

Every routed credential file needs an `ID_USR`:

```toml
version = 1
ID_USR = "01"
```

Every routed claim profile file needs an `ID_CLM`:

```toml
version = 1
ID_CLM = "01"
```

Every routed buying profile file needs an `ID_BUY`:

```toml
version = 1
ID_BUY = "01"
```

Every routed payment profile file needs an `ID_PYM`:

```toml
version = 1
ID_PYM = "01"
```

IDs are quoted numeric strings such as `"01"`, `"02"`, and `"03"`.

## Claim Profile Fields

Current top-level fields:

- `version`: optional schema version, currently `1`.
- `ID_CLM`: required quoted numeric claim profile ID, for example `"01"`.

Current claim profile sections:

- `[claimant].salutation`: one of `MR`, `MS`, `DIVERS`, or `FAMILY`.
- `[claimant].firstName`: claimant first name.
- `[claimant].lastName`: claimant last name.
- `[claimant].email`: claimant email address.
- `[claimant].phone`: claimant phone number.
- `[claimant.address].streetNumber`: claimant street and house number.
- `[claimant.address].zip`: claimant postal code.
- `[claimant.address].city`: claimant city.
- `[claimant.address].country`: claimant country.
- `[claimant.bank].accountOwner`: bank account owner.
- `[claimant.bank].iban`: IBAN for reimbursement.

## Buying Profile Fields

Current top-level fields:

- `version`: optional schema version, currently `1`.
- `ID_BUY`: required quoted numeric buying profile ID, for example `"01"`.
- `defaultFare`: first fare product to select on the DB Offers page.
- `fallbackFares`: ordered fallback fare products when the default is not
  visible on the current DB Offers page.
- `travelClass`: optional class preference, `"second"` by default.
- `continueToCustomerData`: optional boolean; `true` selects the fare and then
  clicks the offer-page `Continue` button so checkout stops on Customer data.
  Set it to `false` for an Abnahme stop on the fare cards.
- `bookingFor`: optional customer-data choice, `"self"` by default.
- `continueToPaymentBoundary`: optional boolean; `true` applies `bookingFor`
  and clicks the customer-data `Continue` button so checkout reaches the
  payment boundary. Payment-profile filling may then run, but automation still
  stops before payment-page continuation or final order controls.

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

Supported `bookingFor` names are `self` and `other`. The `other` value is
reserved for a later passenger-details profile; current automation supports
`self`.

## Payment Profile Fields

Payment profiles live under `PATH_CRED` and are selected by `ID_PYM`.

Current top-level fields:

- `version`: optional schema version, currently `1`.
- `ID_PYM`: required quoted numeric payment profile ID, for example `"01"`.
- `method`: one of `sepa`, `credit_card`, or `paypal`.

Current payment profile sections:

- `[payment.sepa].accountOwner`: SEPA account owner. During logged-in DB
  checkout this is checked against the DB account value but not changed.
- `[payment.sepa].iban`: SEPA IBAN.
- `[payment.sepa].birthdate`: optional account-holder birth date. Use
  `YYYY-MM-DD` in TOML; DB's `DD/MM/YYYY` form format is accepted as input and
  used for comparison. During logged-in DB checkout this is checked against the
  DB account value but not changed. `birthday` is accepted as an alias, but
  `birthdate` is canonical.
- `[payment.sepa].streetNhouseNum`: optional registered street and house
  number for direct debit. The clearer aliases `streetNumber` and
  `streetAndHouseNumber` are also accepted.
- `[payment.sepa].additionalInfo`: optional additional address line.
  `otherAddress`, `otherAdress`, `otherAddressInfo`, and `otherAdressInfo`
  are also accepted.
- `[payment.sepa].zip`: optional postcode. `postcode` and `postalCode` are
  also accepted.
- `[payment.sepa].city`: optional town or city. `townCity` is also accepted.
- `[payment.sepa].country`: optional country.
- `[payment.sepa.address]`: optional grouped address table. It accepts
  `streetNumber`, `additionalInfo`, `zip`, `city`, and `country` with the same
  alias handling. Direct `[payment.sepa]` address fields are supported for
  compact profiles.
- `[payment.sepa].mandateAccepted`: optional boolean for the SEPA mandate
  checkbox when DB exposes it.
- `[payment.sepa].saveAsPreferred`: optional boolean for DB's preferred
  payment toggle.
- `[payment.card].cardholderName`: cardholder name.
- `[payment.card].cardNumber`: card number.
- `[payment.card].expiryMonth`: optional expiration month.
- `[payment.card].expiryYear`: optional expiration year.
- `[payment.card].saveAsPreferred`: optional boolean for DB's preferred
  payment toggle.

Do not store CVC, CVV, CID, PIN, or similar authentication secrets in DBhopper
payment profiles. Those fields are rejected by the parser.

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

Use `dbhopper_private_settings_select` to update `ID_USR`, `ID_CLM`,
`ID_BUY`, `ID_PYM`, and/or `TICKET_BUYING_MODE`. That tool does not accept path
fields, so an agent cannot change the directories where private files are
stored.

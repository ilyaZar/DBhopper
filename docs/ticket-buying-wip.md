# Ticket Buying WIP

Ticket buying is testing-only. DBhopper may open the official DB website and
explore booking screens, but it must not submit payment or finalize a purchase.

## Candidate Interfaces

### Consumer Website

Use `https://int.bahn.de/en` as the first implementation target. DB documents
that digital tickets can be booked on bahn.de and DB Navigator, with or without
a DB customer account:

https://int.bahn.de/en/booking-information/online-ticket

This is the current practical route for a local helper.
`dbhopper_ticket_buying_dry_run` opens the website, fills route and outbound
date/time controls, and stops after search/results. The separate
`dbhopper_ticket_checkout_dry_run` explores offer/customer-data steps as far as
safely possible and stops before payment data or a final order button. Browser
runs save text and screenshots below `tmp/`.

### DB Navigator

DB Navigator is also an official booking route:

https://int.bahn.de/en/booking-information/db-navigator

It can book long-distance tickets up to 10 minutes after departure, even if the
train is delayed, and local transport shortly before departure. App automation
should be treated as a later device/emulator project, not as the first DBhopper
path.

### DB API Marketplace

The current DBhopper official delay provider uses DB API Marketplace
Timetables:

https://developers.deutschebahn.com/db-api-marketplace/apis/product/timetables

Timetables is for current traffic information, planned timetable slices, and
current deviations. It is not a ticket purchase API. DB Marketplace use requires
registration and freischaltung through a DB customer account:

https://developers.deutschebahn.com/db-api-marketplace/apis/nutzungsbedingungen

### Partner Interfaces

Public reporting mentions a DB partner API called the PST interface, used by
Rail Europe:

[Rail Europe press release][rail-europe-pst]

Treat this as a partner-only research path unless DB gives explicit access. It
is not currently a normal DBhopper self-service implementation target.

### Website JSON Endpoints

DBhopper already uses the passenger web JSON endpoint for deterministic delay
queries when DB Marketplace credentials are missing. That path is useful for
search and live-delay data, but it should not be used to complete purchases
unless there is a documented and permitted purchasing API.

## Safety Rules

- Mark every tool result with `testing: true`.
- Return `purchaseSubmitted: false` for dry runs.
- Stop at search/results for `dbhopper_ticket_buying_dry_run`.
- Stop before payment data or a legally binding final order button for
  `dbhopper_ticket_checkout_dry_run`.
- Do not click final payment or final booking controls.
- Do not store payment card data in DBhopper files.
- Keep DB account credentials in ignored
  `assets/private/credentials/*.toml` files only.
- Prefer a persistent browser profile for website login/session state.

## Current Tool Shape

The dry-run tool uses the active credentials from `settings.toml` by default.
It accepts:

```json
{
  "departure_station": "Hamm(Westf)Hbf",
  "arrival_station": "Koeln Hbf",
  "service_date": "2026-05-25",
  "departure_time": "19:00",
  "train_label": "ICE 123",
  "open_browser": false
}
```

With `open_browser: false`, it returns a deterministic plan only. With
`open_browser: true`, it opens the official DB website, applies the route and
outbound date/time where supplied, and stops after search/results.

When `login_before_search: true`, the dry run logs into the configured
`[bahnAccount]` before searching. `stay_logged_in` defaults to `true` and checks
DB's stay-logged-in checkbox if the login page exposes one.

`dbhopper_ticket_checkout_dry_run` accepts the same route/login controls, uses a
default route of Hamm(Westf)Hbf -> Köln Hbf about one week after the run date,
and returns `finalSafetyStop` with values such as `payment_boundary`,
`final_order_boundary`, or `no_safe_next_step`.

## Future Work

1. Add controlled offer selection after the delay query has selected an ICE/IC
   replacement.
2. Investigate whether reaching the last pre-order screen requires payment
   data, and keep payment data out of DBhopper until a separate safety design
   exists.
3. Add another explicit confirmation gate before any purchase-capable step.
4. Keep payment submission out of this plugin until the interface and safety
   policy are reviewed again.

[rail-europe-pst]: https://press.raileurope.com/article/43609-deutsche-bahn-and-rail-europe-forge-continued-strategic-partnership-to-transform-international-rail-travel

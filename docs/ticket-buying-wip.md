# Ticket Buying WIP

Ticket-buying support is experimental. Safety rules and dry-run behavior are
documented in `docs/testing_ecosystem.md`.

## Candidate Interfaces

### Consumer Website

Use `https://int.bahn.de/en` as the first implementation target. DB documents
that digital tickets can be booked on bahn.de and DB Navigator, with or without
a DB customer account:

https://int.bahn.de/en/booking-information/online-ticket

This is the current practical route for a local helper.

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

## Testing

Ticket dry-run safety rules and the current testing tool shape are documented
in `docs/testing_ecosystem.md`. Per-stage text and screenshots are explicit
purchase test-drive artifacts, enabled only by `test_drive_purchase: true`; the
normal review screenshot is stored under configured `path_prc`.

## Future Work

1. Decide the policy and user-confirmation shape for final purchase-capable
   automation.
2. Implement final buying only after that policy exists;
   `purchase_mode = "auto"` currently records intent but still stops
   before final order controls.
3. Keep payment profile data private, redacted from tool output, and out of
   browser-run text artifacts after fields are filled.

[rail-europe-pst]: https://press.raileurope.com/article/43609-deutsche-bahn-and-rail-europe-forge-continued-strategic-partnership-to-transform-international-rail-travel

# Re-evaluation 2026-06-09

DBhopper is structurally functional as a local OpenClaw plugin. The package
builds, tests pass, the live NRW Mobilitaetsgarantie form loads, and two guarded
dry-runs reached the final review page without pressing `Angaben absenden`.

## Baseline

- Plugin: `own-plugins/dbhopper`
- Skill: `own-skills/dbhopper` and packaged `skills/dbhopper`
- Workspace: `claims/`, `assets/`, and `tmp/` under the plugin directory
- Live form: `https://mg.kcm-nrw.de/elmapublic/`
- Public wrapper: `https://www.mobil.nrw/fahren/mobigarantie/einreichen.html`

The public mobil.nrw page says the digital application needs personal data,
bank details, trip date/time/start stop, and scans/screenshots/photos of the
original ticket plus replacement ticket or receipt. It also notes the >=20
minute delay/cancellation condition and that Uber-like services have not been
reimbursable since 2025-01-01.

## Main Findings

- The plugin browser driver can fill the current form through legal consent,
  claimant data, route/date/time, ticket/refund details, uploads, and bank
  details.
- The dry-run stop condition is correct: both tests stopped on the summary page
  with the `Angaben absenden` button visible and unclicked.
- The OpenClaw routed-agent setup had the same class of permission issue seen
  with KleinClaw: DBhopper was in `tools.alsoAllow` but missing from
  `tools.sandbox.tools.alsoAllow`, so sandboxed routed sessions filtered
  `dbhopper_*` tools out.
- The existing JSON `profileAssetName` mechanism is the right minimal private
  metadata layer. It merges claimant and bank data inside the plugin, without
  pasting private profile data into chat.

## Changes Made

- Added `dbhopper` to the local sandbox `alsoAllow` config.
- Added stage screenshots and text captures under plugin `tmp/` for browser
  runs.
- Added `assets/private-profile.example.json` as the user-fillable profile
  template source.
- Tightened validation so phone and address fields required by the form are not
  silently omitted.
- Documented the sandbox allow-list troubleshooting note in the plugin README.

## Test Evidence

Unit and package checks:

```bash
npm test
npm pack --dry-run --json --ignore-scripts
```

Live dry-runs:

- `tmp/dummy-live-dry-run-2026-06-09-19-27-56-2026-06-09T19-27-56-556Z/`
- `tmp/dummy-profile-dry-run-2026-06-09-19-31-11-2026-06-09T19-31-11-541Z/`

Both runs wrote `browser-summary.png` and `browser-summary.txt`. The summary
contains claimant, address, route, ticket, refund amount, bank details, document
previews, and the final `Angaben absenden` button.

## Next Real-Data Step

Copy `assets/private-profile.example.json` to `assets/private/default.json` and
fill only the private profile file locally. Then create or prepare a real claim
with incident details and evidence file paths, run `dbhopper_validate_claim`,
then `dbhopper_run_claim` with `mode: "dry_run"`. Submit only after inspecting
the `tmp/` screenshots.

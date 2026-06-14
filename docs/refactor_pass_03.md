# Refactor Pass 03

## Setup

- Branch: `refactor/pass-03`, created from `main` at `15dd919`.
- Recent history reviewed:
  - `15dd919` documented the TOML snake_case migration.
  - `44a6278` normalized TOML key aliases in source, dist, and tests.
  - `f471130` documented the prior cleanup pass.
  - `de57875` reused the shared error-message helper.
  - `c251991` shared TOML validation helpers.
  - `16f0bea` simplified ticket-buying helpers.
  - `752fa9c` added the large ticket-buying/profile surface.
  - `9374d34` removed `tmp` from the published package surface.

## Codebase Overview

DBhopper is a TypeScript OpenClaw plugin for DB delay retrieval, NRW
Mobilitatsgarantie claim workflows, and guarded ticket-buying automation. The
repo commits generated `dist/` output, and tests import `dist`, so source
refactors need a build before focused tests. The largest remaining source
surfaces are ticket buying, delay retrieval, login/browser automation, and
TOML-backed private profile/settings parsing.

## Pass 1 Auto RF

Command:

```bash
/home/iz/Dropbox/workflow/other-skills/auto-rf/scripts/auto-rf \
  --mode repo \
  --max-files 0 \
  --json-output /tmp/dbhopper-auto-rf-pass03-01.json
```

Result: 69 files scanned, 35 advisory candidates.

Decisions:

| Candidate              | Decision | Reason                                   |
| ---------------------- | -------- | ---------------------------------------- |
| live route table       | reject   | static data, not useful shared logic     |
| buying-profile aliases | reject   | lookup table, explicit repetition        |
| tool descriptions      | defer    | helpers add little today                 |
| in-browser DOM blocks  | defer    | real duplication, higher browser risk    |
| private settings IDs   | accept   | repeated wrappers with narrow behavior   |
| prior refactor docs    | reject   | historical prose, not stale code         |

## Pass 1 RF

Accepted target: collapse repeated `readPrivateSettings` plus `listIdFiles` and
`resolveIdFile` wrapper logic in `src/private-settings.ts`.

Changes:

- Added shared `PrivateIdField` and `PrivateDirectoryField` internal types.
- Routed credential, payment-profile, claim-profile, and buying-profile list
  helpers through one `listConfiguredIdFiles` helper.
- Routed selected-file resolvers through one `resolveConfiguredIdFile` helper.

Verification:

- `npm run build`
- `node --test test/private-settings.test.js`

## Pass 2 Auto RF

Command:

```bash
/home/iz/Dropbox/workflow/other-skills/auto-rf/scripts/auto-rf \
  --mode repo \
  --max-files 0 \
  --json-output /tmp/dbhopper-auto-rf-pass03-02.json
```

Result: the private-settings wrapper candidate disappeared. Remaining medium
signals are mostly static data, lookup tables, and ticket-buying duplication.

Decision: accept the repeated checkout result type shapes in
`src/ticket-buying.ts`; reject changing browser selectors or page-evaluate DOM
helpers in this pass because those paths carry higher live-site risk.

## Pass 2 RF

Changes:

- Added local checkout result aliases for journey selection, fare selection,
  checkout continuation steps, payment fill summaries, and checkout boundary
  snapshots.
- Reused those aliases in `stopAfterFareSelection`, `checkoutSteps`, and the
  step projection helpers.
- Left runtime browser flow, selectors, waits, and output field names
  unchanged.

Verification:

- `npm run build`
- `node --test test/ticket-buying.test.js`

## Pass 3 Auto RF

Command:

```bash
/home/iz/Dropbox/workflow/other-skills/auto-rf/scripts/auto-rf \
  --mode repo \
  --max-files 0 \
  --json-output /tmp/dbhopper-auto-rf-pass03-03.json
```

Result: checkout type-shape duplication was gone. Remaining fresh candidate:
repeated db-login classifier assertions in `test/db-login.test.js`.

Decision: accept as a low-risk test cleanup. Defer broader tool-definition
helpers because the repeated objects live across several plugin surfaces and
would mostly rename existing structure.

## Pass 3 RF

Changes:

- Replaced repeated classifier `assert.equal` calls in
  `test/db-login.test.js` with a local table-driven assertion helper.
- Covered stay-logged-in labels, username rejection reasons, and password
  rejection reasons with the same helper.

Verification:

- `node --test test/db-login.test.js`

## Pass 4 Auto RF

Command:

```bash
/home/iz/Dropbox/workflow/other-skills/auto-rf/scripts/auto-rf \
  --mode repo \
  --max-files 0 \
  --json-output /tmp/dbhopper-auto-rf-pass03-04.json
```

Result: db-login assertion duplication was gone. Remaining source candidates
were mostly static data, lookup tables, tool-definition shapes, and repeated
private-settings test workspace setup.

Decision: accept the private-settings setup cleanup because six tests created
the same temporary settings workspace shape with only IDs and directory names
changing.

## Pass 4 RF

Changes:

- Added `createSettingsWorkspace` in `test/private-settings.test.js`.
- Reused it across private-settings tests while keeping each test's differing
  selected IDs and configured path names visible at the call site.

Verification:

- `node --check test/private-settings.test.js`
- `node --test test/private-settings.test.js`

## Pass 5 Auto RF

Command:

```bash
/home/iz/Dropbox/workflow/other-skills/auto-rf/scripts/auto-rf \
  --mode repo \
  --max-files 0 \
  --json-output /tmp/dbhopper-auto-rf-pass03-05.json
```

Result: the private-settings setup candidate disappeared. The strongest
remaining source candidate was repeated checkout continuation result objects in
`src/ticket-buying.ts`.

Decision: accept a constructor-helper pass for result objects only. Continue to
defer in-browser DOM helper extraction because those functions run inside
`page.evaluate` and are harder to validate without live browser coverage.

## Pass 5 RF

Changes:

- Added `offerContinueResult`, `customerDataContinueResult`, and
  `paymentContinueResult` helpers.
- Replaced repeated inline continuation return objects with those helpers.
- Left boundary detection, click decisions, selectors, and waits unchanged.

Verification:

- `npm run build`
- `node --test test/ticket-buying.test.js`

## Pass 6 Auto RF

Command:

```bash
/home/iz/Dropbox/workflow/other-skills/auto-rf/scripts/auto-rf \
  --mode repo \
  --max-files 0 \
  --json-output /tmp/dbhopper-auto-rf-pass03-06.json
```

Result: checkout continuation return-object duplication was gone. Remaining
candidates were reviewed as follows:

| Candidate              | Decision | Reason                                 |
| ---------------------- | -------- | -------------------------------------- |
| live route table       | reject   | static integration matrix, not logic   |
| fare alias map         | reject   | explicit accepted spelling table       |
| in-browser DOM helpers | defer    | needs live browser evidence            |
| tool definitions       | defer    | obscures per-tool parameters           |
| date formatting blocks | reject   | different locale semantics             |
| catch result objects   | reject   | operation-specific responses differ    |
| typebox literal lists  | reject   | schemas clearer at call sites          |
| old refactor docs      | reject   | historical log text, not stale runtime |

Final assessment: no remaining candidate has a good cleanup-to-risk ratio for
this pass. The useful low-risk duplication in settings, checkout summaries, and
tests has been handled. Continuing would either move into live-browser behavior,
hide explicit lookup/schema data behind helpers, or churn tool definitions
without reducing meaningful maintenance cost.

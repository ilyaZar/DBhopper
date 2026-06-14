# Refactor Pass 01

## Scope

Branch: `refactor/pass-01-cleanup`

Goal: reduce local duplication and stale code while preserving DBhopper
behavior. This pass alternated between automated `auto-rf` scans and `$rf`
decision/execution passes.

Guardrails:

- Keep live credentials, tickets, browser profiles, claims, and runtime
  artifacts out of the refactor.
- Keep behavior changes out of this pass.
- Extract helpers only where call sites become easier to read.
- Prefer focused tests after each edit and broader checks before stopping.

## Log

### 2026-06-14 - setup

- Started from clean `main` at `752fa9c`.
- Created branch `refactor/pass-01-cleanup`.
- Read the `$rf` references for duplication, stale/dead code, decision, and
  execution.
- Read the `$auto-rf` instructions and used the local scout as the alternating
  assessment counterpart.

### 2026-06-14 - auto-rf pass 1

Command:

```bash
/home/iz/Dropbox/workflow/other-skills/auto-rf/scripts/auto-rf \
  --mode repo --max-files 120 \
  --json-output /tmp/dbhopper-auto-rf-01.json --format text
```

Result:

- 63 files scanned.
- 21 candidates: 12 duplication inventory, 8 refactor decisions, and 1
  execution guardrail.
- Largest implementation file was `src/ticket-buying.ts`, at about 3.5k LOC.
- Repeated local helpers existed across providers and tests, but provider
  parsers had different contracts and should stay independent for now.

Decision:

- Accepted a narrow `src/ticket-buying.ts` cleanup: repeated checkout return
  payload wiring plus one stale local variable.
- Rejected alias-map and live-probe-table candidates as static data false
  positives.

### 2026-06-14 - rf pass 1

Edit:

- Removed unused `paymentProfileTouched` from `runBrowserTicketSearch`.
- Added `checkoutResultState` and used it in `stopAfterFareSelection`.

Result:

- `src/ticket-buying.ts`: 31 insertions, 69 deletions.
- Net reduction: 38 lines.

Verification:

- `npm run build` passed.
- `node --test test/ticket-buying.test.js` passed.

### 2026-06-14 - auto-rf pass 2

Command:

```bash
/home/iz/Dropbox/workflow/other-skills/auto-rf/scripts/auto-rf \
  --mode repo --max-files 120 \
  --json-output /tmp/dbhopper-auto-rf-02.json --format text
```

Result:

- 63 files scanned.
- 21 candidates remained.
- The previous checkout payload candidate was gone.
- The strongest local candidate was repeated payment-field recording in
  `fillPaymentProfileAtBoundary`.

Decision:

- Accepted payment-field recorder cleanup. All calls were inside one function
  and wrote to the same four local arrays.
- Deferred browser-context `visible` helper duplication. Those snippets live
  inside separate `page.evaluate` closures, where sharing would make the code
  less direct.

### 2026-06-14 - rf pass 2

Edit:

- Replaced wide `recordPaymentFieldResult(...)` calls with local
  `recordPaymentField(fieldName, result)` calls.
- Removed the unused module-level `recordPaymentFieldResult` helper.

Result:

- Cumulative `src/ticket-buying.ts` diff after pass 2: 72 insertions and 252
  deletions.
- Cumulative source net reduction in that file: 180 lines.

Verification:

- `npm run build` passed.
- `node --test test/ticket-buying.test.js` passed.

### 2026-06-14 - auto-rf pass 3

Command:

```bash
/home/iz/Dropbox/workflow/other-skills/auto-rf/scripts/auto-rf \
  --mode repo --max-files 120 \
  --json-output /tmp/dbhopper-auto-rf-03.json --format text
```

Result:

- 63 files scanned.
- 21 candidates remained.
- The payment-field recorder candidate was gone.
- The strongest remaining code candidate was duplicated TOML parse/catch/error
  text in buying profiles, payment profiles, claim TOML, credentials, and
  private settings.

Decision:

- Accepted a shared TOML parse wrapper.
- Kept each module's schema validation and normalization local.
- Added `tryParseToml` only for the credentials payment-profile probe, where
  parse failure intentionally means "not a payment profile".

### 2026-06-14 - rf pass 3

Edit:

- Added `src/toml.ts` with `parseToml` and `tryParseToml`.
- Replaced duplicated TOML parser wrappers in five modules.
- Removed local parse-only `errorMessage` helpers from those modules.

Result:

- Generated `dist/toml.js` and `dist/toml.d.ts` by running the build.

Verification:

- First `npm run build` caught a TypeScript inference issue because
  `parseToml` inferred the library TOML table type. Fixed by typing the
  wrapper return as `unknown`, matching the old local parse boundary.
- `npm run build` passed after that fix.
- Focused parser/config test set passed:

```bash
node --test \
  test/buying-profile.test.js test/payment-profile.test.js \
  test/credentials.test.js test/private-settings.test.js \
  test/workspace.test.js test/validation.test.js
```

### 2026-06-14 - auto-rf pass 4

Command:

```bash
/home/iz/Dropbox/workflow/other-skills/auto-rf/scripts/auto-rf \
  --mode repo --max-files 120 \
  --json-output /tmp/dbhopper-auto-rf-04.json --format text
```

Result:

- 63 files scanned.
- 21 candidates remained.
- The TOML parse-wrapper candidate was gone.
- The strongest remaining non-static candidate was repeated error-message
  extraction and three local `errorMessage` helpers.

Decision:

- Accepted shared `errorMessage` helper extraction. The expression and helper
  behavior were identical across reporting, parser, browser, and provider code.
- Rejected broader tool-definition helper extraction for now. The repeated
  shapes carry tool-specific descriptions, parameters, and gating semantics.

### 2026-06-14 - rf pass 4

Edit:

- Added `src/errors.ts` with `errorMessage(error)`.
- Replaced repeated inline error-message expressions.
- Removed local `errorMessage` helpers from delay provider modules.
- Updated `src/toml.ts` to reuse the shared helper.

Result:

- Generated `dist/errors.js` and `dist/errors.d.ts` by running the build.

Verification:

- `npm run build` passed.
- `npm test` passed: 65 tests, 17 suites, 65 pass, 0 fail. The opt-in live
  delay backend parity test stayed skipped in the default run.

### 2026-06-14 - auto-rf pass 5

Command:

```bash
/home/iz/Dropbox/workflow/other-skills/auto-rf/scripts/auto-rf \
  --mode repo --max-files 120 \
  --json-output /tmp/dbhopper-auto-rf-05.json --format text
```

Result:

- 63 files scanned.
- 21 candidates remained.
- After the shared error helper, the only still useful non-static pattern was
  repeated `ValidationMessage` error objects.

Decision:

- Accepted a validation-message helper for validation/status arrays only.
- Kept tool results, browser results, and provider result objects explicit
  because those are user-facing response shapes rather than `ValidationMessage`
  arrays.

### 2026-06-14 - rf pass 5

Edit:

- Added `src/validation-messages.ts` with `validationError` and
  `validationErrorFromException`.
- Replaced repeated error `ValidationMessage` construction in profile schema
  validators, credentials validation, private settings validation, and
  workspace TOML validation.

Result:

- Generated `dist/validation-messages.js` and
  `dist/validation-messages.d.ts` by running the build.

Verification:

- `npm run build` passed.
- Focused parser/config test set passed:

```bash
node --test \
  test/buying-profile.test.js test/payment-profile.test.js \
  test/credentials.test.js test/private-settings.test.js \
  test/workspace.test.js test/validation.test.js
```

### 2026-06-14 - auto-rf pass 6

Command:

```bash
/home/iz/Dropbox/workflow/other-skills/auto-rf/scripts/auto-rf \
  --mode repo --max-files 120 \
  --json-output /tmp/dbhopper-auto-rf-06.json --format text
```

Result:

- 63 files scanned.
- 21 candidates remained, but manual verification did not find another
  worthwhile behavior-preserving refactor.

Rejected or deferred:

- Live backend probe rows and buying-profile aliases are static data tables.
- `ticket-buying.ts` browser-context `compact` and `visible` helpers are inside
  separate `page.evaluate` closures. Sharing them would require injected
  browser-side helpers and would make the code less local.
- Checkout "not clicked" return objects differ by boundary and booking state.
  A helper would hide safety-specific fields for little reduction.
- Tool-definition shapes remain explicit because names, labels, parameter
  schemas, optional gating, and descriptions differ by tool.
- `test/private-settings.test.js` setup repetition is scenario setup. A fixture
  builder would save lines but make each path-routing test less readable.

## Final Assessment

Accepted refactors:

- Consolidated checkout result payload construction.
- Localized payment field recording.
- Added shared TOML parsing helpers.
- Added shared error-message helper.
- Added shared validation-message helpers.

Final size result:

- Tracked source diff: 149 insertions, 379 deletions.
- Tracked generated `dist/` diff: 100 insertions, 243 deletions.
- New helper source files: 38 lines total.
- New helper generated files: 34 lines total.
- Net across changed source and generated files, including new helper files:
  about 301 fewer lines.

Final verification:

- `npm test` passed: 65 tests, 17 suites, 65 pass, 0 fail.
- Default run skipped the opt-in live backend parity test as intended.

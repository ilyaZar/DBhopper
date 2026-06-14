# Refactor Pass 04

## Setup

- Branch: `refactor/pass-04-cleanup`, created from `main` at `a85ef09`.
- Recent history reviewed:
  - `a85ef09` logged refactor pass 03.
  - `383e81d` shared private settings workspace setup.
  - `292da3b` tabled DB login helper cases.
  - `6bc598b` shared ticket checkout result shapes.
  - `2421d1a` shared private settings ID helpers.
  - `15dd919` documented the TOML snake_case migration.
  - `44a6278` normalized TOML key aliases.
  - `f471130` documented cleanup pass 02.
  - `de57875` reused the shared error-message helper.
  - `c251991` shared TOML validation helpers.
  - `16f0bea` simplified ticket-buying helpers.
  - `752fa9c` hardened the ticket-buying surface.

## Codebase Overview

DBhopper is a TypeScript OpenClaw plugin for DB delay retrieval, NRW
Mobilitatsgarantie claim workflows, private TOML-backed profiles, and guarded
DB ticket-buying automation. The package commits generated `dist/`, and tests
import `dist`, so source changes need a build before source-backed tests. The
largest and riskiest surface remains `src/ticket-buying.ts`; lower-risk cleanup
is mostly in tests, fixture setup, and small helpers around private settings.

## Pass 1 Auto RF

Command:

```bash
/home/iz/Dropbox/workflow/other-skills/auto-rf/scripts/auto-rf \
  --mode repo \
  --max-files 0 \
  --json-output /tmp/dbhopper-auto-rf-pass04-01.json
```

Result: 70 files scanned, 35 advisory candidates.

Focused stale/dead searches found historical refactor-doc markers and deliberate
compatibility aliases, not current removal targets.

Decisions:

| Candidate                 | Decision | Reason                               |
| ------------------------- | -------- | ------------------------------------ |
| live route table          | reject   | static parity matrix                 |
| buying-profile aliases    | reject   | explicit accepted spelling table     |
| tool definition shapes    | defer    | helper would mostly hide parameters  |
| in-browser DOM helpers    | defer    | higher live-site browser risk        |
| date formatting blocks    | reject   | different locale semantics           |
| catch result objects      | reject   | operation-specific responses differ  |
| TypeBox literal lists     | reject   | schemas clearer at call sites        |
| old refactor docs         | reject   | historical logs, not stale runtime   |
| test settings TOML writer | accept   | copied fixture setup across tests    |

## Pass 1 RF

Accepted target: share the repeated private `settings.toml` fixture writer used
by access, credentials, delay-provider, private-settings, and workspace tests.

Changes:

- Added `test/helpers/private-settings.js` with
  `writePrivateSettingsFixture`.
- Reused it in five test files.
- Kept per-test IDs and configured private paths visible at call sites.
- Left runtime source, browser automation, and committed `dist/` unchanged.

Verification:

```bash
node --check test/helpers/private-settings.js
node --check test/access-tools.test.js
node --check test/credentials.test.js
node --check test/private-settings.test.js
node --check test/workspace.test.js
node --check test/db-delay-tools.test.js
node --test test/access-tools.test.js test/credentials.test.js \
  test/workspace.test.js test/db-delay-tools.test.js \
  test/private-settings.test.js
```

Result: 26 affected tests passed.

## Pass 2 Auto RF

The second repo scout still reported the same broad advisory set. A focused
manual test search found another low-risk pattern that the scanner had not
made prominent: identical JSON and XML `Response` fixture constructors in the
delay-provider tests.

Decision: accept a test-only helper extraction for response builders. Continue
to reject or defer runtime candidates from pass 1 for the same reasons.

## Pass 2 RF

Changes:

- Added `test/helpers/responses.js` with shared `jsonResponse` and
  `xmlResponse` helpers.
- Reused the helpers in bahn-web, delay-provider, and provider-parity tests.
- Left fake fetch routing and provider assertions unchanged.

Verification:

```bash
node --check test/helpers/responses.js
node --check test/bahn-web.test.js
node --check test/db-delay-tools.test.js
node --check test/provider-parity.test.js
node --test test/bahn-web.test.js test/db-delay-tools.test.js \
  test/provider-parity.test.js
```

Result: 9 affected tests passed.

## Pass 3 Auto RF

The third repo scout again repeated the known static-data, tool-definition,
browser DOM, date-formatting, and historical-doc findings. A final focused
fixture search found repeated complete private-profile TOML writers in
workspace and private-settings tests.

Decision: accept one more test-only fixture helper. The duplication is a full
valid private profile and the tests still assert the relevant private email,
IBAN, profile ID, and first-name behavior after extraction.

## Pass 3 RF

Changes:

- Added `writePrivateProfileFixture` beside the private settings fixture helper.
- Reused it in private-settings and workspace tests.
- Removed the local private-settings `writeProfile` helper.
- Wrapped one long assertion in the touched workspace test.

Verification:

```bash
node --check test/helpers/private-settings.js
node --check test/private-settings.test.js
node --check test/workspace.test.js
node --test test/private-settings.test.js test/workspace.test.js
```

Result: 16 affected tests passed.

## Pass 4 Auto RF

Command:

```bash
/home/iz/Dropbox/workflow/other-skills/auto-rf/scripts/auto-rf \
  --mode repo \
  --max-files 0 \
  --json-output /tmp/dbhopper-auto-rf-pass04-04.json
```

Result: 70 files scanned, 35 advisory candidates. The accepted test fixture
duplication from this pass was gone from focused searches. Remaining candidates
were the same rejected or deferred categories:

| Candidate              | Decision | Reason                              |
| ---------------------- | -------- | ----------------------------------- |
| live route table       | reject   | static integration matrix           |
| buying-profile aliases | reject   | explicit accepted spelling table    |
| tool definition shapes | defer    | helper would hide tool parameters   |
| in-browser DOM helpers | defer    | needs live browser evidence         |
| date formatting blocks | reject   | different locale and output needs   |
| catch result objects   | reject   | operation-specific responses differ |
| TypeBox literal lists  | reject   | schemas clearer at call sites       |
| historical docs        | reject   | pass logs, not stale runtime code   |

Final assessment: no remaining candidate has a good cleanup-to-risk ratio for
this pass. The useful low-risk cleanup was in shared test fixtures. Continuing
would either churn static lookup/schema data, obscure tool definitions, or move
into live-browser DOM closures without stronger live-site evidence.

## Final Verification

```bash
npm test
npm run package:check
npm pack --dry-run --json --ignore-scripts
```

Results:

- `npm test`: build passed, 74 tests passed, live delay backend parity skipped
  by its opt-in environment gate.
- `npm run package:check`: 3 package metadata tests passed.
- `npm pack --dry-run --json --ignore-scripts`: package dry-run succeeded and
  included `docs/refactor_pass_04.md`.
- `git diff -- src dist package.json package-lock.json`: no runtime source,
  generated `dist`, or package metadata diffs.

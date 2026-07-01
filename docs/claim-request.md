# Mobilitätsgarantie Claim Request Flow

Reference screenshots live outside this repository:

```text
/home/iz/Work/mobilitaetsgarantie-screenshots/
```

They document the live NRW Mobilitätsgarantie web form from entry page through
summary. This file is the implementation spec for making DBhopper drive that
flow reliably while keeping claimant, bank, ticket, receipt, and browser data
out of chat and commits.

## Target Outcome

DBhopper should prepare a claim from local TOML plus evidence files, drive the
Mobilitätsgarantie form through the summary page, save a review screenshot, and
stop before the final `Angaben absenden` click. Final submission remains a
separate explicit-confirmation step.

Completion for this flow means screenshots 1-11 can be replayed against the
live form with dummy data, then repeated with real local data, while preserving
the private-data boundary:

- Claimant, bank, and per-incident claim facts live under external `path_clm`.
- Claims may be stored as `path_clm/<claim-id>/claim.toml` or
  `path_clm/<claim-id>.toml`.
- Mandatory and optional evidence files live in the claim directory.
- The agent may see sanitized tool results and artifact paths, not private
  claimant, bank, receipt, browser, or raw profile values.
- The browser run reaches the final summary page and saves a screenshot.
- The final submit button is not clicked by the normal review flow.

## Current Implementation Snapshot

The repo already has the basic ownership split:

- `assets/private/settings.toml` selects the active claim root with `path_clm`;
  the selected `ID_CLM` routes to a matching external claim TOML.
- `src/workspace.ts` writes under `path_clm`, copies evidence files into the
  claim directory, and rejects claimant data supplied through tool input.
- `src/claim-toml.ts` defines the current claim schema, including sensitive
  claimant/bank fields for external `path_clm` TOML and multi-file evidence
  entries via `paths = [...]`.
- `src/validation.ts` checks core eligibility and required browser fields.
- `src/browser.ts` opens `https://mg.kcm-nrw.de/elmapublic/`, resolves live
  autocomplete station choices, uploads claim-local evidence, and stops at the
  final summary page in dry-run mode.

The current browser implementation starts directly at the embedded form, so the
public entry page and consent screen from screenshots 1-2 remain the main
full-parity gap. Train matching is deterministic for a configured
`planned_line` when the live form returns a selectable row, with an explicit
non-submit dry-run boundary at screenshot 11.

## Data Ownership

Use one external claim TOML for the active claim.

The claim TOML may include sensitive claimant and bank data when it lives under
the external `path_clm` directory:

```toml
# Selects this claim from assets/private/settings.toml.
ID_CLM = "01"

# Claimant data fills the personal details page.
[claimant]
salutation = "FAMILY"
first_name = "Maria"
last_name = "Mustermann"
email = "maria@example.org"
phone = "+4922112345678"

# Claimant address fills the address fields.
[claimant.address]
street_number = "Musterstrasse 1"
zip = "50667"
city = "Koeln"
country = "Deutschland"

# Bank data fills the reimbursement page.
[claimant.bank]
account_owner = "Maria Mustermann"
iban = "DE00000000000000000000"

# Journey data selects the delayed local service.
[journey]
date = "2026-06-26"
scheduled_departure_time = "12:31"
start_station = "Essen Hbf"
end_station = "Koeln Hbf"
planned_line = "RE1"
disruption_type = "delay"
replacement_started_at = "13:19"

# Ticket data fills ticket, replacement, and message fields.
[ticket]
base_ticket_name = "Deutschlandticket"
base_ticket_category = "Sonstiges"
tariff_area = "NRW-Tarif"
substitute_type = "long_distance"
substitute_cost = 13.40
companions = 0
description = "Vielen Dank für die Bearbeitung!"

# Original ticket proof.
[[files]]
role = "base_ticket"
path = "deutschlandticket.pdf"

# Replacement ticket or receipt.
[[files]]
role = "substitute_receipt"
path = "ersatzleistung.pdf"

# Optional delay proof screenshots.
[[files]]
role = "delay_evidence"
paths = ["delay-screenshot-1.png", "delay-screenshot-2.png"]
```

Required evidence:

- one `base_ticket` file: original local/NRW/Deutschlandticket proof
- one `substitute_receipt` file: receipt or invoice for the replacement service

Optional evidence:

- up to three `delay_evidence` files, so the total upload count stays at five
- multi-file evidence entries use `paths = ["one.png", "two.png"]`; the
  single-file `path = "one.png"` form remains valid
- only files already copied into the claim directory should be uploaded
- the agent may verify that optional evidence files exist and have plausible
  roles before invoking the plugin, but should not transcribe private contents

Default free text:

- no delay evidence: `Vielen Dank für die Bearbeitung!`
- with delay evidence:
  `Anbei auch Bilder, die die Verspätung verifizieren. Vielen Dank für die
  Bearbeitung!`
- custom text is allowed via `ticket.description`

## Screenshot Flow

| Step | Screenshot | Page State                | Required Automation |
| ---- | ---------- | ------------------------- | ------------------- |
| 1    | `01_*`     | NRW info page             | Open entry URL and click the orange online-form button. |
| 2    | `02_*`     | consent iframe/modal      | Click `Akzeptieren`. |
| 3    | `03_*`     | legal questions           | Tick only the first required rule checkbox, then save. |
| 4    | `04_*`     | claimant data             | Fill from selected external claim TOML. |
| 5    | `05_*`     | incident date/time        | Fill date, time, start, and destination. |
| 6    | `06_*`     | station text fields       | Try normalized station candidates. |
| 7    | `07_*`     | station suggestion menu   | Select the exact live menu option, not arbitrary text. |
| 8    | `08_*`     | connection result table   | Select the intended delayed local service. |
| 9    | `09_*`     | ticket and evidence       | Fill ticket facts, upload evidence, fill description. |
| 10   | `10_*`    | bank data                 | Check prefill and fill IBAN from private profile. |
| 11   | `11_*`    | final summary             | Save screenshot and stop before submit. |

Keep the external screenshot filenames stable; they are the manual reference for
this spec. Do not commit the screenshots unless a separate task deliberately
adds sanitized fixtures.

## Field Rules

### Step 1 And 2: Entry

The robust production path should start from the public Mobilitätsgarantie page
shown in screenshot 1 and click:

```text
Zum Online-Formular für den digitalen Erstattungsantrag
```

The current direct `elmapublic` URL is useful for probing, but a full live smoke
should also cover the entry page and the consent accept step shown in screenshot
2.

### Step 3: Legal Questions

Only the first checkbox is required for the normal claim path:

```text
Ich habe die Regeln zur NRW Mobilitätsgarantie gelesen ...
```

Do not tick the marketing or research-contact checkbox unless a later explicit
setting is added for that behavior.

### Step 4: Claimant Data

Map the private profile to the visible fields:

- `claimant.salutation`: `MR`, `MS`, `DIVERS`, or `FAMILY`
- `claimant.email`
- `claimant.first_name`
- `claimant.last_name`
- `claimant.phone`
- `claimant.address.street_number`
- `claimant.address.zip`
- `claimant.address.city`
- `claimant.address.country`, defaulting to `Deutschland`

Use the sensitive input helper for private fields. Tool results must report only
field names or high-level status, never raw claimant values.

### Steps 5-8: Journey And Train Selection

The date/time and station section is the highest-risk part of the flow.

Station fields are live autocomplete controls. DBhopper must not simply leave
the user's typed value in the control. It should select the final station exactly
as offered by the form menu.

Recommended station resolution loop:

1. Start with `journey.start_station` and `journey.end_station`.
2. Build safe public candidates from the claim text, for example:
   - `HBF` -> `Hbf`
   - `Hauptbahnhof` -> `Hbf`
   - ASCII and umlaut spellings normalize to the same match text
   - reordered variants such as `Hbf Duisburg` and `Duisburg Hbf`
   - city-only input -> likely `Hbf` candidate
3. Enter one candidate and capture the visible suggestion labels.
4. If there is a high-confidence exact or normalized match, click that option.
5. If several options are plausible, return the options to the agent and ask
   the user to choose.
6. Let the LLM side make the public-data guess from the TOML station text and
   the returned dropdown labels. If one label is clearly correct, it should call
   a small claim-update tool or write the public `claim.toml` fields with the
   selected live values. If not, it should show the candidate labels to the user
   and ask for the exact station.
7. Persist the selected live labels back into the correct TOML fields,
   `journey.start_station` and/or `journey.end_station`, so a second browser
   pass is deterministic and does not depend on repeated fuzzy guessing.

After station selection, click `Verbindung suchen`.

Train selection must match the intended delayed local service, not just the
first visible result. Matching should prefer:

- `journey.planned_line`, for example `RE1`
- scheduled departure time
- start and destination stations from the selected menu values

If no row matches confidently, stop with a structured result that includes the
visible row summaries for user clarification. Do not silently select the first
result in the final implementation.

### Step 9: Ticket, Evidence, And Text

Defaults:

- `ticket.tariff_area`: `NRW-Tarif`
- `ticket.base_ticket_category`: `Sonstiges`
- `ticket.substitute_type`: `long_distance`
- `ticket.companions`: `0`

The form uses predefined option labels for several fields. DBhopper should
validate configured labels against the live options or against a checked local
allowlist before filling:

- salutation labels: `Herr`, `Frau`, `Divers`, `Keine Angabe`
- tariff area labels, defaulting to `NRW-Tarif`
- ticket category labels, defaulting to `Sonstiges`
- replacement service labels:
  `Fernverkehrszug`, `Taxi`, `Sharing-Angebote`, or
  `Alternatives Nahverkehrsmittel`
- companion count options

Typos in predefined labels should be errors or clarification prompts. For
example, `Herrr` must not be coerced silently to `Herr`.

Uploads:

- upload `base_ticket` and `substitute_receipt`
- upload up to three `delay_evidence` files
- reject or ignore extra upload files before reaching the browser
- keep upload paths inside the claim directory

### Step 10: Bank Data

The form may prefill `Kontoinhaber*in` from contact data. Compare that value
against `claimant.bank.account_owner`.

- If the visible value matches, leave it as-is.
- If it is empty, fill the private profile value.
- If it differs, stop or warn before overwriting, depending on the final safety
  policy.
- Fill `claimant.bank.iban` with the sensitive input helper.

Do not expose account owner or IBAN values in tool output.

### Step 11: Summary

At the summary page:

- capture page text and a screenshot artifact
- return the artifact path to the agent
- stop before `Angaben absenden`

The user should inspect the screenshot and explicitly confirm any later final
submission path. This spec does not require implementing the final click.

## Validation Requirements

Before a browser run, validation should prove:

- selected `ID_CLM` exists under `path_clm`
- `claim.toml` has required journey and ticket fields
- claimant and bank fields are only stored in the external `path_clm` claim TOML
- incident date is not in the future and is within the allowed filing window
- excluded causes are absent
- `base_ticket` and `substitute_receipt` files exist
- no more than five upload files are selected
- every upload file stays inside the claim directory
- predefined option fields are supported

Warnings are acceptable for optional delay evidence, but mandatory file and
schema problems should prevent browser execution.

## Implementation Checklist

- Add a dummy end-to-end claim fixture with public dummy values and local dummy
  evidence files.
- Extend the claim TOML schema only where the screenshots require more explicit
  data than the current fields provide.
- Add typed allowlists for predefined form option labels.
- Replace direct station autocomplete with the resolution loop described above.
- Replace first-row fallback train selection with explicit row matching and
  clarification on ambiguity.
- Route the browser flow through the entry and consent pages for full live
  parity, while keeping the direct form URL as a lower-level probe if useful.
- Ensure dry-run/review mode stops at screenshot 11 and cannot submit.
- Save the summary screenshot as the user-review artifact.
- Add focused tests for TOML validation, upload-count validation, station option
  matching, train-row matching, and the no-submit review boundary.

## Completion Evidence

The goal is complete only when current evidence shows:

- a dummy claim can be prepared from TOML and evidence files
- the browser reaches each page represented by screenshots 1-11
- station choices are selected from live menu options
- the intended train row is selected deterministically
- mandatory uploads are attached
- the summary screenshot is saved and returned
- no final submit occurs in the normal review run
- private claimant and bank values stay out of tool output and commits

There must also be a live test-drive record from the plugin itself:

- build the current plugin
- create a dummy local claim workspace with a dummy external claim TOML and
  dummy evidence files
- run the browser claim workflow against the live Mobilitätsgarantie form in
  dry-run/review mode
- record which screenshot step is reached, which fields are filled, and the
  exact first blocker if the run stops before screenshot 11
- keep the generated artifacts local and ignored

### Latest Local Live Test-Drive

The latest local dry-run used the plugin tool path with the external claim
under:

```text
/home/iz/Documents/dbhopper-own-tests/claims/live-dummy-essen-koeln-re1/claim.toml
```

It was run against the live embedded form and stopped at the final summary page
without submitting. Local artifacts are under:

```text
/home/iz/Documents/dbhopper-own-tests/tmp/browser-runs/live-dummy-essen-koeln-re1-2026-07-01T17-20-57-893Z/
```

Verified summary facts:

- start station: `Duisburg Hbf, Duisburg`
- destination: `Köln Messe/Deutz Bf, Köln`
- station resolution returned the TOML guess, dropdown choices, and selected
  live option for both station fields
- delayed local service fallback field: `RE5; delay`
- replacement service: `Fernverkehrszug (IC/EC/ICE)`
- ticket name/category: `Semesterticket`, `Sonstiges Ticket`
- substitute cost: `38,00 EURO`
- uploads: invoice PDF, base-ticket image, and two delay-evidence images from
  the claim directory; the summary header reported `4 Dateien`
- free text: `Anbei auch Bilder, die die Verspätung verifizieren. Vielen Dank
  für die Bearbeitung!`
- final state: `browser-summary.png` captured with `Angaben absenden` visible
  but not clicked; `summaryScreenshot` pointed at the same file

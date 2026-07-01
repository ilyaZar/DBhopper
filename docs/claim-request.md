# Mobilitätsgarantie Claim Request Flow

Reference screenshots live outside this repository:

```text
<local-screenshot-reference-dir>/
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
- `src/browser.ts` starts from the public mobil.nrw entry page, accepts the
  consent prompts, resolves live autocomplete station choices from joined
  dropdown evidence, uploads claim-local evidence, and stops at the final
  summary page in dry-run mode.

Train matching is deterministic for a configured `planned_line` when the live
form returns a selectable row, with an explicit non-submit dry-run boundary at
screenshot 11.

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
city = "Köln"
country = "Deutschland"

# Bank data fills the reimbursement page.
[claimant.bank]
account_owner = "Maria Mustermann"
iban = "DE00000000000000000000"

# Journey data selects the delayed local service.
[journey]
date = "2026-06-26"
scheduled_departure_time = "12:31"
start_station = "Duisburg Hbf"
end_station = "Köln Messe/Deutz Bf"
planned_line = "RE5"
disruption_type = "delay"
replacement_started_at = "12:49"

# Ticket data fills ticket, replacement, and message fields.
[ticket]
base_ticket_name = "Deutschlandticket"
base_ticket_category = "Sonstiges Ticket"
tariff_area = "NRW-Tarif"
substitute_type = "long_distance"
substitute_cost = 38.00
companions = 0
description = "Anbei auch Bilder, die die Verspätung verifizieren. Vielen Dank für die Bearbeitung!"

# Original ticket proof.
[[files]]
role = "base_ticket"
path = "base-ticket.png"

# Replacement ticket or receipt.
[[files]]
role = "substitute_receipt"
path = "replacement-ticket-receipt.pdf"

# Optional delay proof screenshots.
[[files]]
role = "delay_evidence"
paths = ["delay-evidence-1.png", "delay-evidence-2.png"]
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

| Step | Screenshot                                      | Size      | Page State              | Required Automation |
| ---- | ----------------------------------------------- | --------- | ----------------------- | ------------------- |
| 1    | `01_first_page.png`                             | `935x743` | NRW info page           | Open entry URL and click the orange online-form button. |
| 2    | `02_accept_mobilitaetsgarantie_form.png`        | `1196x438` | consent iframe/modal    | Click `Akzeptieren`. |
| 3    | `03_acceptance_pass_01.png`                     | `930x379` | legal questions         | Tick only the first required rule checkbox, then save. |
| 4    | `04_personal_data.png`                          | `865x852` | claimant data           | Fill from selected external claim TOML. |
| 5    | `05_place_date_meta_info.png`                   | `878x340` | incident date/time      | Fill date, time, start, and destination. |
| 6    | `06_how_to_guess.png`                           | `835x134` | station text fields     | Try normalized station candidates. |
| 7    | `07_how_to_guess_2.png`                         | `881x294` | station suggestion menu | Select the exact live menu option, not arbitrary text. |
| 8    | `08_long_train_list.png`                        | `938x577` | connection result table | Select the intended delayed local service. |
| 9    | `09_base_ticket.png`                            | `717x801` | ticket and evidence     | Fill ticket facts, upload evidence, fill description. |
| 10   | `10_banking.png`                                | `716x243` | bank data               | Check prefill and fill IBAN from private profile. |
| 11   | `11_final_page.png`                             | `749x747` | final summary           | Save screenshot and stop before submit. |

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

The browser flow starts at this public page. Do not drive the embedded form URL
directly for claim filing.

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
2. Derive the city-like prefix from the TOML guess.
3. Probe only these dropdown query vectors:
   - plain city, for example `Duisburg`
   - city plus `Hb`, for example `Duisburg Hb`
   - city plus `B`, for example `Duisburg B`
4. In `stop_after_station_resolution` mode, collect the visible dropdown
   choices from those probes and stop without committing a station value.
5. Let the LLM compare the returned choices against the TOML intent. If one
   pickable live label is clearly best, rerun with `exact_station_departure`
   and/or `exact_station_arrival` set to that exact returned label. If several
   labels are plausible, show the choices to the user and ask for the exact
   station.
6. Forced exact station fields must still be pickable from the live dropdown.
   The browser should type the exact label, verify it appears in the dropdown,
   click that option, and verify the input committed to it. If not, return the
   live choices and ask again instead of leaving arbitrary text in the form.
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

- capture the final summary screenshot artifact
- return the artifact path to the agent
- stop before `Angaben absenden`

The user should inspect the screenshot and explicitly confirm any later final
submission path. This spec does not require implementing the final click.

`claim_request_mode = "review"` always stops here. `claim_request_mode =
"auto"` allows final submission only when the tool call also passes
`mode: "submit"` and `confirmSubmit: true`.

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
- Select the intended delayed train row explicitly and clarify ambiguity.
- Keep the browser flow routed through the entry and consent pages for full
  live parity.
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

Normal claim runs save only the final summary screenshot for user review.
Set `test_run_claim_request = true` in `settings.toml` only when an explicit
test run needs page-by-page text and screenshots. Normal review screenshots are
stored under `path_clm/<claim-id>/review/`; claim test-run trails are stored
under `path_clm/<claim-id>/test-runs/`.

### Latest Local Live Test-Drive

The latest local dry-run used the plugin tool path with the external claim
under:

```text
<external-claim-root>/claims/live-dummy-claim/claim.toml
```

It was run against the live public entry page, handled the cookie and consent
gates, and stopped at the final summary page without submitting. Local artifacts
are under:

```text
<external-claim-root>/tmp/browser-runs/live-dummy-claim-2026-07-01T18-34-23-756Z/
<external-claim-root>/tmp/browser-runs/live-dummy-claim-2026-07-01T18-49-00-121Z/
```

Verified summary facts:

- entry flow: public mobil.nrw page opened and cookie modal handled
- start station: `Duisburg Hbf, Duisburg`
- destination: `Köln Messe/Deutz Bf, Köln`
- station resolution probe returned candidate vectors `city`, `city Hb`, and
  `city B` with per-vector `probeChoices`; the follow-up run forced exact
  pickable dropdown labels with
  `exact_station_departure` and `exact_station_arrival`
- delayed local service metadata: `RE5; delay`
- replacement service: `Fernverkehrszug (IC/EC/ICE)`
- ticket name/category: `Semesterticket`, `Sonstiges Ticket`
- substitute cost: `38,00 EURO`
- uploads: invoice PDF, base-ticket image, and two delay-evidence images from
  the claim directory; the summary header reported `4 Dateien`
- free text: `Anbei auch Bilder, die die Verspätung verifizieren. Vielen Dank
  für die Bearbeitung!`
- final state: `browser-summary.png` captured with `Angaben absenden` visible
  but not clicked; `summaryScreenshot` pointed at the same file

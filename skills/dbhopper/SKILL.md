---
name: dbhopper
description: Prepare and file NRW claims with DBhopper.
license: MIT-0
---

# DBhopper

Use this skill when the user wants to prepare, validate, dry-run, or submit an
NRW Mobilitätsgarantie claim for delayed or cancelled local public transport in
North Rhine-Westphalia.

## Requirements

1. Install and enable the `dbhopper` OpenClaw plugin.
2. Configure `plugins.entries.dbhopper.config.workspaceRoot`.
3. Keep real tickets, receipts, screenshots, IBANs, and claim PDFs in local
   DBhopper runtime paths, not in chat.
4. Route claim profiles, buying profiles, credentials, and payment profiles
   through `assets/private/settings.toml`. The selected `path_usr`,
   `path_clm`, `path_buy`, and `path_pym` directories must be outside the
   plugin workspace, and coding agents should not have read/write tool access
   to those external directories. Use
   `dbhopper_private_settings_status` to list IDs and
   `dbhopper_private_settings_select` to change only `ID_USR`, `ID_CLM`,
   `ID_BUY`, `ID_PYM`, and `purchase_mode`.
5. Put reusable sensitive personal data in claim profile TOML files selected by
   `ID_CLM`; do not read those files into the conversation.
6. Put DB API and DB website credentials in private credential TOML files
   selected by `ID_USR`; do not read those files into the conversation.
7. Put payment details in private payment profile TOML files selected by
   `ID_PYM`; do not read those files into the conversation.
8. Browser-run artifacts are saved under the configured ignored artifact
   directory. Inspect screenshots there before asking for real submission.

## Workflow

1. Gather the facts listed in
   [Eligibility And Evidence](references/eligibility-and-evidence.md).
2. Call `dbhopper_claim_schema` when shaping a new `claim.toml`.
3. Call `dbhopper_prepare_claim` to create the claim folder and copy evidence.
   Pass file paths or asset names only; the plugin copies bytes into the claim
   folder and merges claim profile data internally without writing it into
   `claim.toml`.
4. Call `dbhopper_validate_claim` before any browser work.
5. For station-name uncertainty, call `dbhopper_run_claim` with
   `mode: "dry_run"` and `stop_after_station_resolution: true` first. Pass
   `check_bahnhof_suffix`, `start_check_bahnhof_suffix`, or
   `end_check_bahnhof_suffix` as `both`, `hbf_only`, or `bf_only` to tune
   whether the browser probes Hauptbahnhof/Hbf candidates, Bahnhof/Bf
   candidates, or both. Leave `exact_station_departure` and
   `exact_station_arrival` empty on the first invocation so the plugin probes
   dropdown choices. On a later invocation, pass a returned live label in those
   fields to force and verify that exact station. If the choices are ambiguous,
   stop and ask the user for the exact station name before rerunning.
6. Call `dbhopper_run_claim` with `mode: "dry_run"` for the full review pass.
   It must stop at the summary page and save artifacts.
7. Submit only after the user explicitly confirms the exact claim and the dry
   run artifacts look correct. Use `mode: "submit"` and `confirmSubmit: true`.
8. After a successful submit, the claim folder should contain the confirmation
   PDF and `claim_submitted_recipe.toml`. Send the saved confirmation PDF path
   back through the active user channel. If a configured email tool is
   available and the user asked for email delivery, send the same PDF by email
   from that tool.
9. Use `dbhopper_db_standard_login_check`,
   `dbhopper_db_marketplace_access_check`, and
   `dbhopper_db_api_credential_probe` for one-time credential onboarding
   diagnostics without printing secrets.
10. For replacement-ticket experiments, call
   `dbhopper_ticket_buying_dry_run` for search/results only or
   `dbhopper_ticket_checkout_dry_run` to explore checkout boundaries. These
   tools must not buy a ticket. In default review mode, checkout runs stop on
   DB's Check page and return a sensitive screenshot artifact under
   `assets/private/purchases/` for user review. Pass
   `test_drive_purchase: true` only when the user explicitly asks for the
   numbered per-stage purchase test-drive text and screenshot trail under
   ignored `tmp/`.
   If `purchase_mode` is `auto`, expect `auto_unavailable` until final
   purchase-capable automation is deliberately implemented.

## Station Probing

Mobilitätsgarantie station fields are live autocomplete controls. Treat TOML
station values as guesses, not as exact accepted form values.

- Use a station-resolution dry run before full filing when station spelling or
  suffixes may be ambiguous.
- Let the browser collect dropdown choices from public station probes, then use
  the returned `stationSelections` and per-vector `probeChoices` to decide
  whether a station is clear.
- Station probes should be limited to plain city, city plus `Hb`, and city plus
  `B`; compare the resulting dropdown lists against the TOML intent.
- On the first probing invocation, omit `exact_station_departure` and
  `exact_station_arrival`. On a rerun, use those fields only after the LLM or
  user has chosen a specific live dropdown label.
- Exact station fields must be labels returned by the live dropdown. If the
  forced label is not pickable from the dropdown, treat the probe as failed and
  ask again instead of leaving arbitrary text in the form.
- Prefer `hbf_only` when the user likely means a Hauptbahnhof, such as
  `Duisburg Hbf`. Prefer `bf_only` when the station is a plain Bahnhof, such as
  `Köln Messe/Deutz Bf`. Use `both` when the suffix intent is unclear.
- Do not select unrelated street or bus-stop suggestions when the user wrote an
  Hbf or Bf station. Ask the user for the exact station name if the dropdown
  choices do not contain one clear match.
- During plugin use, report the live dropdown candidates considered and the
  exact departure and arrival labels chosen before proceeding to the full dry
  run.
- After a clear live option is found, update the public station fields in the
  external claim TOML or rerun the tool with the narrowed suffix arguments so
  the full dry run is deterministic.

## Guardrails

- Do not submit if the delay at the starting stop is under 20 minutes.
- Do not submit if the incident is more than 14 calendar days old.
- Do not submit for excluded causes: strike, natural forces, severe DWD
  weather, bomb threat, bomb disposal, missed connection, in-journey delay, or
  overfull vehicle.
- Do not submit when the user boarded the delayed vehicle or used an identical
  local route.
- Use browser automation only through the plugin. Do not post directly to the
  form's private `/api/public/complaint/create` endpoint.
- Do not inspect `claim.toml` or claim profile files unless the user asks.
  Treat claim data and browser artifacts as sensitive by default.
- Do not inspect credential or payment TOML files unless the user explicitly
  asks. Use `dbhopper_credentials_validate` for shape checks without exposing
  secrets.
- Do not change `path_usr`, `path_clm`, `path_buy`, or `path_pym`; those paths
  are user-owned settings.
- If the live site asks for unexpected manual confirmation, captcha, changed
  fields, or unavailable route choices, stop and report the saved artifact path.
- Do not click final booking or payment controls in the ticket-buying flow.
- DBhopper does not own WhatsApp, Signal, Telegram, or email credentials. Use
  the configured OpenClaw channel/message tools for delivery.

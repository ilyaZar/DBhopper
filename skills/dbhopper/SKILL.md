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
3. Keep real tickets, receipts, screenshots, IBANs, and claim PDFs in the local
   DBhopper `claims/` or `assets/private/` folders, not in chat.
4. Route claim profiles, buying profiles, credentials, and payment profiles
   through `assets/private/settings.toml`. Use
   `dbhopper_private_settings_status` to list IDs and
   `dbhopper_private_settings_select` to change only `ID_USR`, `ID_CLM`,
   `ID_BUY`, `ID_PYM`, and `TICKET_BUYING_MODE`.
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
5. Call `dbhopper_run_claim` with `mode: "dry_run"` first. It must stop at the
   summary page and save artifacts.
6. Submit only after the user explicitly confirms the exact claim and the dry
   run artifacts look correct. Use `mode: "submit"` and `confirmSubmit: true`.
7. After a successful submit, the claim folder should contain the confirmation
   PDF and `claim_submitted_recipe.toml`. Send the saved confirmation PDF path
   back through the active user channel. If a configured email tool is
   available and the user asked for email delivery, send the same PDF by email
   from that tool.
8. Use `dbhopper_db_standard_login_check`,
   `dbhopper_db_marketplace_access_check`, and
   `dbhopper_db_api_credential_probe` for one-time credential onboarding
   diagnostics without printing secrets.
9. For replacement-ticket experiments, call
   `dbhopper_ticket_buying_dry_run` for search/results only or
   `dbhopper_ticket_checkout_dry_run` to explore checkout boundaries. These
   tools must not buy a ticket. In default review mode, checkout runs stop on
   DB's Check page and return a sensitive screenshot artifact for user review.
   If `TICKET_BUYING_MODE` is `auto`, expect `buying_not_enabled` until final
   purchase-capable automation is deliberately implemented.

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
- Do not change `PATH_CRED` or `PATH_PRF`; those paths are user-owned settings.
- If the live site asks for unexpected manual confirmation, captcha, changed
  fields, or unavailable route choices, stop and report the saved artifact path.
- Do not click final booking or payment controls in the ticket-buying flow.
- DBhopper does not own WhatsApp, Signal, Telegram, or email credentials. Use
  the configured OpenClaw channel/message tools for delivery.

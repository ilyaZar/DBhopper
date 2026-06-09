---
name: dbhopper
description: Prepare and file NRW Mobilitätsgarantie claims with the DBhopper plugin.
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
4. Put reusable sensitive personal data in an `assets/private/*.json` profile
   and pass its file name as `profileAssetName`; do not read that file into
   the conversation.
5. Browser-run artifacts are saved under the plugin `tmp/` directory. Inspect
   screenshots there before asking for real submission.

## Workflow

1. Gather the facts listed in
   [Eligibility And Evidence](references/eligibility-and-evidence.md).
2. Call `dbhopper_claim_schema` when shaping a new `claim.json`.
3. Call `dbhopper_prepare_claim` to create the claim folder and copy evidence.
   Pass file paths or asset names only; the plugin copies bytes into the claim
   folder and merges private profile data internally.
4. Call `dbhopper_validate_claim` before any browser work.
5. Call `dbhopper_run_claim` with `mode: "dry_run"` first. It must stop at the
   summary page and save artifacts.
6. Submit only after the user explicitly confirms the exact claim and the dry
   run artifacts look correct. Use `mode: "submit"` and `confirmSubmit: true`.
7. After a successful submit, send the saved confirmation PDF path back through
   the active user channel. If a configured email tool is available and the
   user asked for email delivery, send the same PDF by email from that tool.

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
- Do not inspect `claim.json` or private profile files unless the user asks.
  Treat claim data and browser artifacts as sensitive by default.
- If the live site asks for unexpected manual confirmation, captcha, changed
  fields, or unavailable route choices, stop and report the saved artifact path.
- DBhopper does not own WhatsApp, Signal, Telegram, or email credentials. Use
  the configured OpenClaw channel/message tools for delivery.

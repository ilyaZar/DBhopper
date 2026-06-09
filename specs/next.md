# Next

This is the short design and todo list for the DBhopper MVP.

## Architecture

- Keep DBhopper focused on NRW claim preparation, validation, local file
  handling, and browser filing.
- Keep WhatsApp, Telegram, Signal, and email credentials in OpenClaw channel or
  message integrations, not in DBhopper.
- Return artifact paths from DBhopper tools. Let the active OpenClaw channel
  decide how to report or deliver those artifacts to the user.

## Todo

- Fast-forward the local OpenClaw source checkout before more channel testing.
- Enable one stock OpenClaw mobile channel first, preferably WhatsApp for phone
  pairing or Telegram for a fast bot-token setup.
- Allow the mobile-channel agent access to the DBhopper tools through standard
  OpenClaw permissions.
- Smoke test from the phone with `dbhopper_claim_schema`,
  `dbhopper_validate_claim`, and `dbhopper_browser_probe`.
- Test a real claim flow with file paths and `profileAssetName`, not pasted
  private claim data. Use `assets/private/default.json`, copied from
  `assets/private-profile.example.json`.
- Keep dry-run and blocked-run screenshots under `tmp/` for inspection.
- Keep submit mode behind explicit user confirmation and DBhopper approval.
- If artifact delivery from the active channel is missing, fix that in OpenClaw
  channel/message APIs instead of adding transport code to DBhopper.

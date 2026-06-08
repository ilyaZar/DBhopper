# DBhopper

OpenClaw tools for NRW Mobilitätsgarantie claims.

DBhopper keeps claim data local, validates deterministic eligibility facts, and
can drive the NRW browser form. It does not own WhatsApp, Telegram, Signal, or
email transport; OpenClaw channels handle chat and artifact delivery.

## Local Setup

```bash
openclaw plugins install -l /home/iz/Dropbox/projects/openclaw/own-plugins/dbhopper
openclaw plugins enable dbhopper
```

Configure `plugins.entries.dbhopper.config.workspaceRoot` to this plugin
directory. Put reusable private profile data under `assets/private/` and pass
only the file name as `profileAssetName`.

## Tools

- `dbhopper_claim_schema`
- `dbhopper_list_claims`
- `dbhopper_prepare_claim`
- `dbhopper_validate_claim`
- `dbhopper_browser_probe`
- `dbhopper_run_claim`

`dbhopper_run_claim` defaults to dry-run behavior and only submits with explicit
confirmation.

## Development

```bash
npm run build
npm test
npm run package:check
```

The next design notes live in [specs/next.md](specs/next.md).

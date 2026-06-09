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

Start from [assets/private-profile.example.json](assets/private-profile.example.json)
and copy it to `assets/private/default.json`. Keep the copied file private.

## Tools

- `dbhopper_claim_schema`
- `dbhopper_list_claims`
- `dbhopper_prepare_claim`
- `dbhopper_validate_claim`
- `dbhopper_browser_probe`
- `dbhopper_run_claim`

`dbhopper_run_claim` defaults to dry-run behavior and only submits with explicit
confirmation.

Browser runs save screenshots and text captures below `tmp/`. A dry run stops at
the summary page before `Angaben absenden`.

## Troubleshooting

If an OpenClaw-routed agent can describe the skill but cannot call
`dbhopper_*`, check the sandbox tool policy. The local config needs DBhopper in
both `tools.alsoAllow` and `tools.sandbox.tools.alsoAllow`.

## Development

```bash
npm run build
npm test
npm run package:check
```

The next design notes live in [specs/next.md](specs/next.md).

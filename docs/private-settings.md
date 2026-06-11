# Private Settings

DBhopper routes active private data through:

```text
assets/private/settings.toml
```

The tracked template is:

```text
assets/private/settings.example.toml
```

## Shape

`settings.toml` has exactly four fields:

```toml
ID_CRED = "01"
ID_PRF = "01"
PATH_CRED = "assets/private/credentials"
PATH_PRF = "assets/private/profiles"
```

- `ID_CRED` selects one credential file.
- `ID_PRF` selects one private profile file.
- `PATH_CRED` points to the directory containing credential TOML files.
- `PATH_PRF` points to the directory containing private profile TOML files.

Paths may be relative to the plugin workspace root or absolute paths outside
the plugin. The user owns path values and file contents. OpenClaw agents should
only change `ID_CRED` and `ID_PRF`.

## File IDs

Every routed credential file needs an `ID_CRED`:

```toml
version = 1
ID_CRED = "01"
```

Every routed private profile file needs an `ID_PRF`:

```toml
version = 1
ID_PRF = "01"
```

IDs are quoted numeric strings such as `"01"`, `"02"`, and `"03"`.

Example private files:

```text
assets/private/credentials/credentials-01.toml
assets/private/credentials/credentials-02.toml
assets/private/profiles/private-profile-01.toml
assets/private/profiles/private-profile-03.toml
```

Safe public templates live under `docs/examples/`. Copy those files into the
private directories before adding real account, claimant, or bank values.

## Tools

Use `dbhopper_private_settings_status` to list available credential and profile
IDs. It returns an error when the selected ID does not exist.

Use `dbhopper_private_settings_select` to update `ID_CRED` and/or `ID_PRF`.
That tool does not accept path fields, so an agent cannot change the directories
where private files are stored.

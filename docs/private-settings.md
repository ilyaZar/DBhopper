# Private Settings

DBhopper routes active private data through:

```text
assets/private/settings.toml
```

There is no second settings template file. The fixed settings path above is
user-managed local runtime state and is not packaged.

## Shape

`settings.toml` has exactly six fields:

```toml
ID_CRED = "01"
ID_PRF = "01"
PATH_CRED = "assets/private/credentials"
PATH_PRF = "assets/private/profiles"
DELAY_PROVIDER = "bahn-web"
DELAY_FALLBACK = "none"
```

- `ID_CRED` selects one credential file.
- `ID_PRF` selects one private profile file.
- `PATH_CRED` points to the directory containing credential TOML files.
- `PATH_PRF` points to the directory containing private profile TOML files.
- `DELAY_PROVIDER` selects the default delay data source for omitted provider
  tool calls.
- `DELAY_FALLBACK` controls fallback behavior; `"none"` disables automatic
  fallback.

Paths may be relative to the plugin directory or absolute within the user file
system. The user owns path values and file contents. OpenClaw agents should
only change `ID_CRED` and `ID_PRF`.

Use either the default private paths or user-chosen private paths inside this
single settings TOML file; private paths may be relative to the plugin
directory or absolute within the user file system, while the settings file
itself always remains at `assets/private/settings.toml`.

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

## Private Profile Fields

Current top-level fields:

- `version`: optional schema version, currently `1`.
- `ID_PRF`: required quoted numeric private profile ID, for example `"01"`.

Current private profile sections:

- `[claimant].salutation`: one of `MR`, `MS`, `DIVERS`, or `FAMILY`.
- `[claimant].firstName`: claimant first name.
- `[claimant].lastName`: claimant last name.
- `[claimant].email`: claimant email address.
- `[claimant].phone`: claimant phone number.
- `[claimant.address].streetNumber`: claimant street and house number.
- `[claimant.address].zip`: claimant postal code.
- `[claimant.address].city`: claimant city.
- `[claimant.address].country`: claimant country.
- `[bank].accountOwner`: bank account owner.
- `[bank].iban`: IBAN for reimbursement.

Example private files:

```text
assets/private/credentials/credentials-01.toml
assets/private/credentials/credentials-02.toml
assets/private/profiles/private-profile-01.toml
assets/private/profiles/private-profile-03.toml
```

Safe public credential/profile templates live under `docs/examples/`. Copy
those files into the private directories before adding real account, claimant,
or bank values.

## Tools

Use `dbhopper_private_settings_status` to list available credential and profile
IDs. It returns an error when the selected ID does not exist.

Use `dbhopper_private_settings_select` to update `ID_CRED` and/or `ID_PRF`.
That tool does not accept path fields, so an agent cannot change the directories
where private files are stored.

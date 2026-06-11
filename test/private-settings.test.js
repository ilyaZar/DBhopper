import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  privateSettingsStatus,
  writePrivateSettingsIds,
} from "../dist/private-settings.js";
import { readSelectedCredentialsProfile } from "../dist/credentials.js";
import { prepareClaim } from "../dist/workspace.js";

describe("dbhopper private settings", () => {
  it("routes credentials and profiles through selected IDs", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "dbhopper-settings-"));
    const credentialsDir = path.join(root, "external-creds");
    const profilesDir = path.join(root, "external-profiles");
    await writeSettings(root, {
      credentialId: "02",
      profileId: "03",
      credentialsDir,
      profilesDir,
    });
    await writeCredential(credentialsDir, "01", "credentials-01.toml");
    await writeCredential(credentialsDir, "02", "credentials-02.toml");
    await writeProfile(profilesDir, "01", "private-profile-01.toml", "First");
    await writeProfile(profilesDir, "03", "private-profile-03.toml", "Third");

    const status = await privateSettingsStatus({ workspaceRoot: root });
    assert.equal(status.ok, true);
    assert.deepEqual(status.credentials.availableIds, ["01", "02"]);
    assert.deepEqual(status.profiles.availableIds, ["01", "03"]);
    assert.equal(status.credentials.selected.fileName, "credentials-02.toml");
    assert.equal(status.profiles.selected.fileName, "private-profile-03.toml");

    const credentials = await readSelectedCredentialsProfile({ workspaceRoot: root });
    assert.equal(credentials.credentialsId, "02");
    assert.equal(credentials.credentials.dbApi.clientId, "client-02");

    const prepared = await prepareClaim(
      {
        confirm: true,
        claimId: "settings-profile",
        claim: {
          journey: {
            startStation: "Koeln Hbf",
            endStation: "Duesseldorf Hbf",
          },
        },
      },
      { workspaceRoot: root },
    );

    assert.equal(prepared.profileName, "private-profile-03.toml");
    assert.equal(prepared.claim.claimant.firstName, "Third");
    assert.equal(prepared.storedClaim.profileName, undefined);
  });

  it("can route the credential example as implicit ID 01", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "dbhopper-settings-example-"));
    const credentialsDir = path.join(root, "assets", "private", "credentials");
    const profilesDir = path.join(root, "assets", "private", "profiles");
    await writeSettings(root, {
      credentialId: "01",
      profileId: "01",
      credentialsDir,
      profilesDir,
    });
    await writeCredential(credentialsDir, undefined, "credentials.example.toml", {
      clientId: " client-with-space ",
      apiKey: " key-with-space ",
      username: " maria@example.org ",
    });
    await writeProfile(profilesDir, "01", "private-profile-01.toml", "First");

    const status = await privateSettingsStatus({ workspaceRoot: root });
    assert.equal(status.ok, true);
    assert.equal(status.credentials.selected.fileName, "credentials.example.toml");
    assert.equal(status.credentials.selected.implicitId, true);

    const credentials = await readSelectedCredentialsProfile({ workspaceRoot: root });
    assert.equal(credentials.credentialsId, "01");
    assert.equal(credentials.credentials.dbApi.clientId, "client-with-space");
    assert.equal(credentials.credentials.dbApi.apiKey, "key-with-space");
    assert.equal(credentials.credentials.bahnAccount.username, "maria@example.org");
  });

  it("updates only ID fields and preserves user-controlled paths", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "dbhopper-settings-write-"));
    const credentialsDir = path.join(root, "creds");
    const profilesDir = path.join(root, "profiles");
    await writeSettings(root, {
      credentialId: "01",
      profileId: "01",
      credentialsDir,
      profilesDir,
    });
    await writeCredential(credentialsDir, "01", "credentials-01.toml");
    await writeCredential(credentialsDir, "02", "credentials-02.toml");
    await writeProfile(profilesDir, "01", "private-profile-01.toml", "First");
    await writeProfile(profilesDir, "03", "private-profile-03.toml", "Third");

    const status = await writePrivateSettingsIds(
      { credentialId: "02", profileId: "03" },
      { workspaceRoot: root },
    );
    const settings = await fs.readFile(
      path.join(root, "assets", "private", "settings.toml"),
      "utf8",
    );

    assert.equal(status.ok, true);
    assert.match(settings, /ID_CRED = "02"/);
    assert.match(settings, /ID_PRF = "03"/);
    assert.match(settings, new RegExp(escapeRegExp(`PATH_CRED = "${credentialsDir}"`)));
    assert.match(settings, new RegExp(escapeRegExp(`PATH_PRF = "${profilesDir}"`)));
  });

  it("uses PATH_PRF instead of the internal profile directory", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "dbhopper-settings-path-"));
    const credentialsDir = path.join(root, "creds");
    const profilesDir = path.join(root, "outside-profiles");
    await writeSettings(root, {
      credentialId: "01",
      profileId: "03",
      credentialsDir,
      profilesDir,
    });
    await writeCredential(credentialsDir, "01", "credentials-01.toml");
    await writeProfile(profilesDir, "03", "private-profile-03.toml", "External");
    await fs.mkdir(path.join(root, "assets", "private", "profiles"), { recursive: true });
    await writeProfile(
      path.join(root, "assets", "private", "profiles"),
      "03",
      "private-profile-03.toml",
      "Internal",
    );

    const prepared = await prepareClaim(
      {
        confirm: true,
        claimId: "external-profile",
        claim: {
          journey: {
            startStation: "Koeln Hbf",
            endStation: "Duesseldorf Hbf",
          },
        },
      },
      { workspaceRoot: root },
    );

    assert.equal(prepared.claim.claimant.firstName, "External");
  });

  it("uses PATH_CRED instead of the internal credential directory", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "dbhopper-settings-cred-path-"));
    const credentialsDir = path.join(root, "outside-creds");
    const profilesDir = path.join(root, "profiles");
    await writeSettings(root, {
      credentialId: "02",
      profileId: "01",
      credentialsDir,
      profilesDir,
    });
    await writeCredential(credentialsDir, "02", "credentials-02.toml", {
      clientId: "external-client",
    });
    await fs.mkdir(path.join(root, "assets", "private", "credentials"), {
      recursive: true,
    });
    await writeCredential(
      path.join(root, "assets", "private", "credentials"),
      "02",
      "credentials-02.toml",
      { clientId: "internal-client" },
    );
    await writeProfile(profilesDir, "01", "private-profile-01.toml", "First");

    const credentials = await readSelectedCredentialsProfile({ workspaceRoot: root });

    assert.equal(credentials.credentials.dbApi.clientId, "external-client");
  });

  it("flags missing selected IDs", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "dbhopper-settings-missing-"));
    const credentialsDir = path.join(root, "creds");
    const profilesDir = path.join(root, "profiles");
    await writeSettings(root, {
      credentialId: "09",
      profileId: "03",
      credentialsDir,
      profilesDir,
    });
    await writeCredential(credentialsDir, "01", "credentials-01.toml");
    await writeProfile(profilesDir, "01", "private-profile-01.toml", "First");

    const status = await privateSettingsStatus({ workspaceRoot: root });

    assert.equal(status.ok, false);
    assert.ok(
      status.messages.some((message) =>
        /ID_CRED 09 does not exist/.test(message.message),
      ),
    );
    assert.ok(
      status.messages.some((message) =>
        /ID_PRF 03 does not exist/.test(message.message),
      ),
    );
  });
});

async function writeSettings(
  root,
  { credentialId, profileId, credentialsDir, profilesDir },
) {
  await fs.mkdir(path.join(root, "assets", "private"), { recursive: true });
  await fs.writeFile(
    path.join(root, "assets", "private", "settings.toml"),
    [
      `ID_CRED = "${credentialId}"`,
      `ID_PRF = "${profileId}"`,
      `PATH_CRED = "${credentialsDir}"`,
      `PATH_PRF = "${profilesDir}"`,
      "",
    ].join("\n"),
    "utf8",
  );
}

async function writeCredential(dir, id, fileName, overrides = {}) {
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(
    path.join(dir, fileName),
    [
      "version = 1",
      ...(id ? [`ID_CRED = "${id}"`] : []),
      "",
      "[dbApi]",
      `clientId = "${overrides.clientId ?? `client-${id}`}"`,
      `apiKey = "${overrides.apiKey ?? `key-${id}`}"`,
      "",
      "[bahnAccount]",
      `username = "${overrides.username ?? `user-${id}@example.org`}"`,
      `password = "${overrides.password ?? `password-${id}`}"`,
      "",
    ].join("\n"),
    "utf8",
  );
}

async function writeProfile(dir, id, fileName, firstName) {
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(
    path.join(dir, fileName),
    [
      "version = 1",
      `ID_PRF = "${id}"`,
      "",
      "[claimant]",
      'salutation = "FAMILY"',
      `firstName = "${firstName}"`,
      'lastName = "Mustermann"',
      'email = "maria@example.org"',
      'phone = "+4922112345678"',
      "",
      "[claimant.address]",
      'streetNumber = "Musterstrasse 1"',
      'zip = "50667"',
      'city = "Koeln"',
      'country = "Deutschland"',
      "",
      "[bank]",
      'accountOwner = "Maria Mustermann"',
      'iban = "DE89370400440532013000"',
      "",
    ].join("\n"),
    "utf8",
  );
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

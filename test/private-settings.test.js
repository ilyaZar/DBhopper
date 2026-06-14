import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  parsePrivateSettingsToml,
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
      paymentProfileId: "01",
      credentialsDir,
      profilesDir,
    });
    await writeCredential(credentialsDir, "01", "credentials-01.toml");
    await writeCredential(credentialsDir, "02", "credentials-02.toml");
    await writePaymentProfile(credentialsDir, "01", "payment-profile-01.toml");
    await writeProfile(profilesDir, "01", "private-profile-01.toml", "First");
    await writeProfile(profilesDir, "03", "private-profile-03.toml", "Third");
    await writeBuyingProfile(profilesDir, "01", "buying-profile-01.toml");

    const status = await privateSettingsStatus({ workspaceRoot: root });
    assert.equal(status.ok, true);
    assert.deepEqual(status.credentials.availableIds, ["01", "02"]);
    assert.deepEqual(status.paymentProfiles.availableIds, ["01"]);
    assert.deepEqual(status.claimProfiles.availableIds, ["01", "03"]);
    assert.deepEqual(status.buyingProfiles.availableIds, ["01"]);
    assert.equal(status.credentials.selected.fileName, "credentials-02.toml");
    assert.equal(status.paymentProfiles.selected.fileName, "payment-profile-01.toml");
    assert.equal(status.claimProfiles.selected.fileName, "private-profile-03.toml");
    assert.equal(status.buyingProfiles.selected.fileName, "buying-profile-01.toml");
    assert.equal(status.settings.DELAY_PROVIDER, "bahn-web");
    assert.equal(status.settings.DELAY_FALLBACK, "none");
    assert.equal(status.settings.TICKET_BUYING_MODE, "review");

    const credentials = await readSelectedCredentialsProfile({ workspaceRoot: root });
    assert.equal(credentials.credentialsId, "02");
    assert.equal(credentials.credentials.bahnAPI.clientId, "client-02");

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

    assert.equal(prepared.profileId, "03");
    assert.equal(prepared.profileFile, "private-profile-03.toml");
    assert.equal(prepared.claim.claimant.firstName, "Third");
  });

  it("requires explicit credential IDs", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "dbhopper-settings-explicit-"));
    const credentialsDir = path.join(root, "assets", "private", "credentials");
    const profilesDir = path.join(root, "assets", "private", "profiles");
    await writeSettings(root, {
      credentialId: "01",
      profileId: "01",
      paymentProfileId: "01",
      credentialsDir,
      profilesDir,
    });
    await writeCredential(credentialsDir, undefined, "credentials-without-id.toml", {
      clientId: " client-with-space ",
      apiKey: " key-with-space ",
      username: " maria@example.org ",
    });
    await writePaymentProfile(credentialsDir, "01", "payment-profile-01.toml");
    await writeProfile(profilesDir, "01", "private-profile-01.toml", "First");
    await writeBuyingProfile(profilesDir, "01", "buying-profile-01.toml");

    const status = await privateSettingsStatus({ workspaceRoot: root });
    assert.equal(status.ok, false);
    assert.equal(status.credentials.selected, undefined);
    assert.ok(
      status.messages.some((message) =>
        /ID_USR 01 does not exist/.test(message.message),
      ),
    );
    assert.ok(
      status.messages.some((message) =>
        /ID_USR is missing/.test(message.message),
      ),
    );
    await assert.rejects(
      () => readSelectedCredentialsProfile({ workspaceRoot: root }),
      /ID_USR 01 does not exist/,
    );
  });

  it("updates only ID fields and preserves user-controlled paths", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "dbhopper-settings-write-"));
    const credentialsDir = path.join(root, "creds");
    const profilesDir = path.join(root, "profiles");
    await writeSettings(root, {
      credentialId: "01",
      profileId: "01",
      paymentProfileId: "01",
      credentialsDir,
      profilesDir,
    });
    await writeCredential(credentialsDir, "01", "credentials-01.toml");
    await writeCredential(credentialsDir, "02", "credentials-02.toml");
    await writePaymentProfile(credentialsDir, "01", "payment-profile-01.toml");
    await writePaymentProfile(credentialsDir, "02", "payment-profile-02.toml");
    await writeProfile(profilesDir, "01", "private-profile-01.toml", "First");
    await writeProfile(profilesDir, "03", "private-profile-03.toml", "Third");
    await writeBuyingProfile(profilesDir, "01", "buying-profile-01.toml");
    await writeBuyingProfile(profilesDir, "02", "buying-profile-02.toml");

    const status = await writePrivateSettingsIds(
      {
        userId: "02",
        claimProfileId: "03",
        buyingProfileId: "02",
        paymentProfileId: "02",
        ticketBuyingMode: "auto",
      },
      { workspaceRoot: root },
    );
    const settings = await fs.readFile(
      path.join(root, "assets", "private", "settings.toml"),
      "utf8",
    );

    assert.equal(status.ok, true);
    assert.match(settings, /ID_USR = "02"/);
    assert.match(settings, /ID_CLM = "03"/);
    assert.match(settings, /ID_BUY = "02"/);
    assert.match(settings, /ID_PYM = "02"/);
    assert.match(settings, /TICKET_BUYING_MODE = "auto"/);
    assert.match(settings, new RegExp(escapeRegExp(`PATH_CRED = "${credentialsDir}"`)));
    assert.match(settings, new RegExp(escapeRegExp(`PATH_PRF = "${profilesDir}"`)));
    assert.match(settings, /DELAY_PROVIDER = "bahn-web"/);
    assert.match(settings, /DELAY_FALLBACK = "none"/);
  });

  it("accepts ticket buying mode aliases and rejects disagreements", () => {
    const parsed = parsePrivateSettingsToml([
      'ID_USR = "01"',
      'ID_CLM = "01"',
      'ID_BUY = "01"',
      'ID_PYM = "01"',
      'buying_mode = "auto"',
      'PATH_CRED = "assets/private/credentials"',
      'PATH_PRF = "assets/private/profiles"',
      'DELAY_PROVIDER = "bahn-web"',
      'DELAY_FALLBACK = "none"',
      "",
    ].join("\n"));

    assert.equal(parsed.TICKET_BUYING_MODE, "auto");
    assert.throws(
      () => parsePrivateSettingsToml([
        'ID_USR = "01"',
        'ID_CLM = "01"',
        'ID_BUY = "01"',
        'ID_PYM = "01"',
        'TICKET_BUYING_MODE = "review"',
        'ticket_buying_mode = "auto"',
        'PATH_CRED = "assets/private/credentials"',
        'PATH_PRF = "assets/private/profiles"',
        'DELAY_PROVIDER = "bahn-web"',
        'DELAY_FALLBACK = "none"',
        "",
      ].join("\n")),
      /aliases must not disagree/,
    );
  });

  it("uses PATH_PRF instead of the internal profile directory", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "dbhopper-settings-path-"));
    const credentialsDir = path.join(root, "creds");
    const profilesDir = path.join(root, "outside-profiles");
    await writeSettings(root, {
      credentialId: "01",
      profileId: "03",
      paymentProfileId: "01",
      credentialsDir,
      profilesDir,
    });
    await writeCredential(credentialsDir, "01", "credentials-01.toml");
    await writePaymentProfile(credentialsDir, "01", "payment-profile-01.toml");
    await writeProfile(profilesDir, "03", "private-profile-03.toml", "External");
    await writeBuyingProfile(profilesDir, "01", "buying-profile-01.toml");
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
      paymentProfileId: "01",
      credentialsDir,
      profilesDir,
    });
    await writeCredential(credentialsDir, "02", "credentials-02.toml", {
      clientId: "external-client",
    });
    await writePaymentProfile(credentialsDir, "01", "payment-profile-01.toml");
    await writeBuyingProfile(profilesDir, "01", "buying-profile-01.toml");
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

    assert.equal(credentials.credentials.bahnAPI.clientId, "external-client");
  });

  it("flags PATH_CRED when it points to a file", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "dbhopper-settings-file-path-"));
    const credentialsFile = path.join(root, "credentials-as-file.toml");
    const profilesDir = path.join(root, "profiles");
    await writeSettings(root, {
      credentialId: "01",
      profileId: "01",
      paymentProfileId: "01",
      credentialsDir: credentialsFile,
      profilesDir,
    });
    await fs.writeFile(credentialsFile, 'ID_USR = "01"\n', "utf8");
    await writeProfile(profilesDir, "01", "private-profile-01.toml", "First");
    await writeBuyingProfile(profilesDir, "01", "buying-profile-01.toml");

    const status = await privateSettingsStatus({ workspaceRoot: root });

    assert.equal(status.ok, false);
    assert.ok(
      status.messages.some((message) =>
        /PATH_CRED .* must point to a directory/.test(message.message),
      ),
    );
    assert.equal(
      status.messages.some((message) =>
        /ID_USR 01 does not exist/.test(message.message),
      ),
      false,
    );
    await assert.rejects(
      () => readSelectedCredentialsProfile({ workspaceRoot: root }),
      /PATH_CRED .* must point to a directory/,
    );
  });

  it("flags missing selected IDs", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "dbhopper-settings-missing-"));
    const credentialsDir = path.join(root, "creds");
    const profilesDir = path.join(root, "profiles");
    await writeSettings(root, {
      credentialId: "09",
      profileId: "03",
      buyingProfileId: "04",
      paymentProfileId: "05",
      credentialsDir,
      profilesDir,
    });
    await writeCredential(credentialsDir, "01", "credentials-01.toml");
    await writePaymentProfile(credentialsDir, "01", "payment-profile-01.toml");
    await writeProfile(profilesDir, "01", "private-profile-01.toml", "First");
    await writeBuyingProfile(profilesDir, "01", "buying-profile-01.toml");

    const status = await privateSettingsStatus({ workspaceRoot: root });

    assert.equal(status.ok, false);
    assert.ok(
      status.messages.some((message) =>
        /ID_USR 09 does not exist/.test(message.message),
      ),
    );
    assert.ok(
      status.messages.some((message) =>
        /ID_CLM 03 does not exist/.test(message.message),
      ),
    );
    assert.ok(
      status.messages.some((message) =>
        /ID_BUY 04 does not exist/.test(message.message),
      ),
    );
    assert.ok(
      status.messages.some((message) =>
        /ID_PYM 05 does not exist/.test(message.message),
      ),
    );
  });
});

async function writeSettings(
  root,
  {
    credentialId,
    profileId,
    buyingProfileId = "01",
    paymentProfileId = "01",
    credentialsDir,
    profilesDir,
    ticketBuyingMode = "review",
  },
) {
  await fs.mkdir(path.join(root, "assets", "private"), { recursive: true });
  await fs.writeFile(
    path.join(root, "assets", "private", "settings.toml"),
    [
      `ID_USR = "${credentialId}"`,
      `ID_CLM = "${profileId}"`,
      `ID_BUY = "${buyingProfileId}"`,
      `ID_PYM = "${paymentProfileId}"`,
      `TICKET_BUYING_MODE = "${ticketBuyingMode}"`,
      `PATH_CRED = "${credentialsDir}"`,
      `PATH_PRF = "${profilesDir}"`,
      'DELAY_PROVIDER = "bahn-web"',
      'DELAY_FALLBACK = "none"',
      "",
    ].join("\n"),
    "utf8",
  );
}

async function writePaymentProfile(dir, id, fileName) {
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(
    path.join(dir, fileName),
    [
      "version = 1",
      `ID_PYM = "${id}"`,
      'method = "sepa"',
      "",
      "[payment.sepa]",
      'accountOwner = "Account Owner"',
      'iban = "DE00000000000000000000"',
      "mandateAccepted = true",
      "",
    ].join("\n"),
    "utf8",
  );
}

async function writeBuyingProfile(dir, id, fileName) {
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(
    path.join(dir, fileName),
    [
      "version = 1",
      `ID_BUY = "${id}"`,
      'defaultFare = "super_sparpreis"',
      'fallbackFares = ["sparpreis", "flexpreis"]',
      'travelClass = "second"',
      "continueToCustomerData = true",
      'bookingFor = "self"',
      "continueToPaymentBoundary = true",
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
      ...(id ? [`ID_USR = "${id}"`] : []),
      "",
      "[bahnAPI]",
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
      `ID_CLM = "${id}"`,
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
      "[claimant.bank]",
      'accountOwner = "Maria Mustermann"',
      'iban = "fill-iban"',
      "",
    ].join("\n"),
    "utf8",
  );
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

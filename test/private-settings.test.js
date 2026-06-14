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
    const { root, credentialsDir, profilesDir } = await createSettingsWorkspace(
      "dbhopper-settings-",
      {
        credentialsDirName: "external-creds",
        profilesDirName: "external-profiles",
        credentialId: "02",
        profileId: "03",
      },
    );
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
    const { root, credentialsDir, profilesDir } = await createSettingsWorkspace(
      "dbhopper-settings-explicit-",
      {
        credentialsDirName: path.join("assets", "private", "credentials"),
        profilesDirName: path.join("assets", "private", "profiles"),
      },
    );
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
    const { root, credentialsDir, profilesDir } = await createSettingsWorkspace(
      "dbhopper-settings-write-",
    );
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
    assert.match(settings, /id_usr = "02"/);
    assert.match(settings, /id_clm = "03"/);
    assert.match(settings, /id_buy = "02"/);
    assert.match(settings, /id_pym = "02"/);
    assert.match(settings, /ticket_buying_mode = "auto"/);
    assert.match(settings, new RegExp(escapeRegExp(`path_cred = "${credentialsDir}"`)));
    assert.match(settings, new RegExp(escapeRegExp(`path_prf = "${profilesDir}"`)));
    assert.match(settings, /delay_provider = "bahn-web"/);
    assert.match(settings, /delay_fallback = "none"/);
  });

  it("accepts ticket buying mode aliases and rejects disagreements", () => {
    const parsed = parsePrivateSettingsToml([
      'id_usr = "01"',
      'id_clm = "01"',
      'id_buy = "01"',
      'id_pym = "01"',
      'buying_mode = "auto"',
      'path_cred = "assets/private/credentials"',
      'path_prf = "assets/private/profiles"',
      'delay_provider = "bahn-web"',
      'delay_fallback = "none"',
      "",
    ].join("\n"));

    assert.equal(parsed.TICKET_BUYING_MODE, "auto");
    assert.throws(
      () => parsePrivateSettingsToml([
        'id_usr = "01"',
        'id_clm = "01"',
        'id_buy = "01"',
        'id_pym = "01"',
        'TICKET_BUYING_MODE = "review"',
        'ticket_buying_mode = "auto"',
        'path_cred = "assets/private/credentials"',
        'path_prf = "assets/private/profiles"',
        'delay_provider = "bahn-web"',
        'delay_fallback = "none"',
        "",
      ].join("\n")),
      /aliases must not disagree/,
    );
  });

  it("uses PATH_PRF instead of the internal profile directory", async () => {
    const { root, credentialsDir, profilesDir } = await createSettingsWorkspace(
      "dbhopper-settings-path-",
      {
        profilesDirName: "outside-profiles",
        profileId: "03",
      },
    );
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
    const { root, credentialsDir, profilesDir } = await createSettingsWorkspace(
      "dbhopper-settings-cred-path-",
      {
        credentialsDirName: "outside-creds",
        credentialId: "02",
      },
    );
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
    const {
      root,
      credentialsDir: credentialsFile,
      profilesDir,
    } = await createSettingsWorkspace("dbhopper-settings-file-path-", {
      credentialsDirName: "credentials-as-file.toml",
    });
    await fs.writeFile(credentialsFile, 'id_usr = "01"\n', "utf8");
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
    const { root, credentialsDir, profilesDir } = await createSettingsWorkspace(
      "dbhopper-settings-missing-",
      {
        credentialId: "09",
        profileId: "03",
        buyingProfileId: "04",
        paymentProfileId: "05",
      },
    );
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

async function createSettingsWorkspace(
  prefix,
  {
    credentialsDirName = "creds",
    profilesDirName = "profiles",
    ...settings
  } = {},
) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  const credentialsDir = path.join(root, credentialsDirName);
  const profilesDir = path.join(root, profilesDirName);
  await writeSettings(root, {
    credentialId: "01",
    profileId: "01",
    paymentProfileId: "01",
    credentialsDir,
    profilesDir,
    ...settings,
  });
  return { root, credentialsDir, profilesDir };
}

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
      `id_usr = "${credentialId}"`,
      `id_clm = "${profileId}"`,
      `id_buy = "${buyingProfileId}"`,
      `id_pym = "${paymentProfileId}"`,
      `ticket_buying_mode = "${ticketBuyingMode}"`,
      `path_cred = "${credentialsDir}"`,
      `path_prf = "${profilesDir}"`,
      'delay_provider = "bahn-web"',
      'delay_fallback = "none"',
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
      `id_pym = "${id}"`,
      'method = "sepa"',
      "",
      "[payment.sepa]",
      'account_owner = "Account Owner"',
      'iban = "DE00000000000000000000"',
      "mandate_accepted = true",
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
      `id_buy = "${id}"`,
      'default_fare = "super_sparpreis"',
      'fallback_fares = ["sparpreis", "flexpreis"]',
      'travel_class = "second"',
      "continue_to_customer_data = true",
      'booking_for = "self"',
      "continue_to_payment_boundary = true",
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
      ...(id ? [`id_usr = "${id}"`] : []),
      "",
      "[bahn_api]",
      `client_id = "${overrides.clientId ?? `client-${id}`}"`,
      `api_key = "${overrides.apiKey ?? `key-${id}`}"`,
      "",
      "[bahn_account]",
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
      `id_clm = "${id}"`,
      "",
      "[claimant]",
      'salutation = "FAMILY"',
      `first_name = "${firstName}"`,
      'last_name = "Mustermann"',
      'email = "maria@example.org"',
      'phone = "+4922112345678"',
      "",
      "[claimant.address]",
      'street_number = "Musterstrasse 1"',
      'zip = "50667"',
      'city = "Koeln"',
      'country = "Deutschland"',
      "",
      "[claimant.bank]",
      'account_owner = "Maria Mustermann"',
      'iban = "fill-iban"',
      "",
    ].join("\n"),
    "utf8",
  );
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

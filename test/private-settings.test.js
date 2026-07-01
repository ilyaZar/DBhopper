import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  configuredPurchaseArtifactsDir,
  parsePrivateSettingsToml,
  privateSettingsStatus,
  writePrivateSettingsIds,
  writePrivateSettingsRuntimeConfig,
} from "../dist/private-settings.js";
import { readSelectedCredentialsProfile } from "../dist/credentials.js";
import { readSelectedBuyingProfile } from "../dist/buying-profile.js";
import { readSelectedPaymentProfile } from "../dist/payment-profile.js";
import { prepareClaim } from "../dist/workspace.js";
import {
  writeBuyingProfileFixture,
  writePaymentProfileFixture,
  writePrivateProfileFixture,
  writePrivateSettingsFixture,
} from "./helpers/private-settings.js";

describe("dbhopper private settings", () => {
  it("routes credentials and profiles through selected IDs", async () => {
    const { root, credentialsDir, profilesDir, purchaseArtifactsDir } = await createSettingsWorkspace(
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
    await writePaymentProfileFixture(credentialsDir, "01", "payment-profile-01.toml");
    await writePrivateProfileFixture(profilesDir, "01", "private-profile-01.toml", "First");
    await writePrivateProfileFixture(profilesDir, "03", "private-profile-03.toml", "Third");
    await writeBuyingProfileFixture(profilesDir, "01", "buying-profile-01.toml");

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
    assert.equal(status.settings.PURCHASE_MODE, "review");
    assert.equal(status.settings.purchaseArtifactsDir, purchaseArtifactsDir);
    assert.equal(
      await configuredPurchaseArtifactsDir({ workspaceRoot: root }),
      purchaseArtifactsDir,
    );
    assert.doesNotMatch(
      JSON.stringify(status),
      /client-02|key-02|user-02@example|password-02|Account Owner|DE00000000000000000000|First|Third/,
    );

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
    );
    await writeCredential(credentialsDir, undefined, "credentials-without-id.toml", {
      clientId: " client-with-space ",
      apiKey: " key-with-space ",
      username: " maria@example.org ",
    });
    await writePaymentProfileFixture(credentialsDir, "01", "payment-profile-01.toml");
    await writePrivateProfileFixture(profilesDir, "01", "private-profile-01.toml", "First");
    await writeBuyingProfileFixture(profilesDir, "01", "buying-profile-01.toml");

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
    await writePaymentProfileFixture(credentialsDir, "01", "payment-profile-01.toml");
    await writePaymentProfileFixture(credentialsDir, "02", "payment-profile-02.toml");
    await writePrivateProfileFixture(profilesDir, "01", "private-profile-01.toml", "First");
    await writePrivateProfileFixture(profilesDir, "03", "private-profile-03.toml", "Third");
    await writeBuyingProfileFixture(profilesDir, "01", "buying-profile-01.toml");
    await writeBuyingProfileFixture(profilesDir, "02", "buying-profile-02.toml");

    const status = await writePrivateSettingsIds(
      {
        userId: "02",
        claimProfileId: "03",
        buyingProfileId: "02",
        paymentProfileId: "02",
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
    assert.match(settings, /purchase_mode = "review"/);
    assert.match(settings, new RegExp(escapeRegExp(`path_usr = "${credentialsDir}"`)));
    assert.match(settings, new RegExp(escapeRegExp(`path_pym = "${credentialsDir}"`)));
    assert.match(settings, new RegExp(escapeRegExp(`path_clm = "${profilesDir}"`)));
    assert.match(settings, new RegExp(escapeRegExp(`path_buy = "${profilesDir}"`)));
    assert.match(settings, /delay_provider = "bahn-web"/);
    assert.match(settings, /delay_fallback = "none"/);
  });

  it("updates purchase mode through the runtime configuration writer", async () => {
    const { root, credentialsDir, profilesDir } = await createSettingsWorkspace(
      "dbhopper-settings-runtime-write-",
    );

    const result = await writePrivateSettingsRuntimeConfig(
      { purchase_mode: "auto" },
      { workspaceRoot: root },
    );
    const settings = await fs.readFile(
      path.join(root, "assets", "private", "settings.toml"),
      "utf8",
    );

    assert.equal(result.preview.needsUserAction, true);
    assert.match(settings, /purchase_mode = "auto"/);
    assert.match(settings, new RegExp(escapeRegExp(`path_usr = "${credentialsDir}"`)));
    assert.match(settings, new RegExp(escapeRegExp(`path_clm = "${profilesDir}"`)));
  });

  it("rejects unsupported private settings keys", () => {
    assert.throws(
      () => parsePrivateSettingsToml([
        "use_delay_retrieval = true",
        "use_claim_requests = false",
        "use_ticket_purchase = false",
        "",
        'ID_USR = "01"',
        'ID_CLM = "01"',
        'ID_BUY = "01"',
        'ID_PYM = "01"',
        'buying_mode = "auto"',
        'purchase_mode = "review"',
        'path_usr = "../dbhopper-private/credentials"',
        'path_clm = "../dbhopper-private/profiles"',
        'path_buy = "../dbhopper-private/profiles"',
        'path_pym = "../dbhopper-private/credentials"',
        'path_prc = "../dbhopper-private/purchases"',
        'delay_provider = "bahn-web"',
        'delay_fallback = "none"',
        "",
      ].join("\n")),
      /buying_mode is not a supported field/,
    );
    assert.throws(
      () => parsePrivateSettingsToml([
        "use_delay_retrieval = true",
        "use_claim_requests = false",
        "use_ticket_purchase = false",
        "",
        'id_usr = "01"',
        'ID_CLM = "01"',
        'ID_BUY = "01"',
        'ID_PYM = "01"',
        'purchase_mode = "review"',
        'path_usr = "../dbhopper-private/credentials"',
        'path_clm = "../dbhopper-private/profiles"',
        'path_buy = "../dbhopper-private/profiles"',
        'path_pym = "../dbhopper-private/credentials"',
        'path_prc = "../dbhopper-private/purchases"',
        'delay_provider = "bahn-web"',
        'delay_fallback = "none"',
        "",
      ].join("\n")),
      /id_usr is not a supported field/,
    );
  });

  it("rejects repo-internal private directories for every path field", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "dbhopper-settings-internal-"));
    await writePrivateSettingsFixture(root, {
      userCredentialsPath: path.join(root, "assets", "private", "credentials"),
      paymentProfilesPath: path.join(root, "assets", "private", "credentials"),
      claimProfilesPath: path.join(root, "assets", "private", "profiles"),
      buyingProfilesPath: path.join(root, "assets", "private", "profiles"),
      purchaseArtifactsPath: path.join(root, "assets", "private", "purchases"),
    });

    const status = await privateSettingsStatus({ workspaceRoot: root });

    assert.equal(status.ok, false);
    for (const field of ["path_usr", "path_pym", "path_clm", "path_buy", "path_prc"]) {
      assert.ok(
        status.messages.some((message) =>
          message.code === "private_directory_inside_workspace" &&
            message.message.includes(field),
        ),
        `${field} should be rejected as repo-internal`,
      );
    }
    await assert.rejects(
      () => readSelectedCredentialsProfile({ workspaceRoot: root }),
      /path_usr .* outside the plugin workspace/,
    );
    await assert.rejects(
      () => readSelectedPaymentProfile({ workspaceRoot: root }),
      /path_pym .* outside the plugin workspace/,
    );
    await assert.rejects(
      () => readSelectedBuyingProfile({ workspaceRoot: root }),
      /path_buy .* outside the plugin workspace/,
    );
    await assert.rejects(
      () =>
        prepareClaim(
          {
            confirm: true,
            claimId: "internal-profile",
            claim: {
              journey: {
                startStation: "Koeln Hbf",
                endStation: "Duesseldorf Hbf",
              },
            },
          },
          { workspaceRoot: root },
        ),
      /path_clm .* outside the plugin workspace/,
    );
    await assert.rejects(
      () => configuredPurchaseArtifactsDir({ workspaceRoot: root }),
      /path_prc .* outside the plugin workspace/,
    );
  });

  it("rejects path_prc through a symlinked parent into the workspace", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "dbhopper-settings-prc-link-"));
    const linkRoot = await fs.mkdtemp(
      path.join(os.tmpdir(), "dbhopper-settings-prc-link-external-"),
    );
    const linkPath = path.join(linkRoot, "purchase-link");
    await fs.mkdir(path.join(root, "assets", "private"), { recursive: true });
    await fs.symlink(path.join(root, "assets", "private"), linkPath, "dir");
    await writePrivateSettingsFixture(root, {
      purchaseArtifactsPath: path.join(linkPath, "purchases"),
    });

    const status = await privateSettingsStatus({ workspaceRoot: root });

    assert.equal(status.ok, false);
    assert.ok(
      status.messages.some((message) =>
        message.code === "private_directory_inside_workspace" &&
          message.message.includes("path_prc"),
      ),
    );
    await assert.rejects(
      () => configuredPurchaseArtifactsDir({ workspaceRoot: root }),
      /path_prc .* inside the plugin workspace/,
    );
  });

  it("uses path_clm instead of the internal profile directory", async () => {
    const { root, credentialsDir, profilesDir } = await createSettingsWorkspace(
      "dbhopper-settings-path-",
      {
        profilesDirName: "outside-profiles",
        profileId: "03",
      },
    );
    await writeCredential(credentialsDir, "01", "credentials-01.toml");
    await writePaymentProfileFixture(credentialsDir, "01", "payment-profile-01.toml");
    await writePrivateProfileFixture(
      profilesDir,
      "03",
      "private-profile-03.toml",
      "External",
    );
    await writeBuyingProfileFixture(profilesDir, "01", "buying-profile-01.toml");
    await fs.mkdir(path.join(root, "assets", "private", "profiles"), { recursive: true });
    await writePrivateProfileFixture(
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

  it("uses path_usr instead of the internal credential directory", async () => {
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
    await writePaymentProfileFixture(credentialsDir, "01", "payment-profile-01.toml");
    await writeBuyingProfileFixture(profilesDir, "01", "buying-profile-01.toml");
    await fs.mkdir(path.join(root, "assets", "private", "credentials"), {
      recursive: true,
    });
    await writeCredential(
      path.join(root, "assets", "private", "credentials"),
      "02",
      "credentials-02.toml",
      { clientId: "internal-client" },
    );
    await writePrivateProfileFixture(profilesDir, "01", "private-profile-01.toml", "First");

    const credentials = await readSelectedCredentialsProfile({ workspaceRoot: root });

    assert.equal(credentials.credentials.bahnAPI.clientId, "external-client");
  });

  it("flags path_usr when it points to a file", async () => {
    const {
      root,
      credentialsDir: credentialsFile,
      profilesDir,
    } = await createSettingsWorkspace("dbhopper-settings-file-path-", {
      credentialsDirName: "credentials-as-file.toml",
    });
    await fs.writeFile(credentialsFile, 'ID_USR = "01"\n', "utf8");
    await writePrivateProfileFixture(profilesDir, "01", "private-profile-01.toml", "First");
    await writeBuyingProfileFixture(profilesDir, "01", "buying-profile-01.toml");

    const status = await privateSettingsStatus({ workspaceRoot: root });

    assert.equal(status.ok, false);
    assert.ok(
      status.messages.some((message) =>
        /path_usr .* must point to a directory/.test(message.message),
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
      /path_usr .* must point to a directory/,
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
    await writePaymentProfileFixture(credentialsDir, "01", "payment-profile-01.toml");
    await writePrivateProfileFixture(profilesDir, "01", "private-profile-01.toml", "First");
    await writeBuyingProfileFixture(profilesDir, "01", "buying-profile-01.toml");

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
    purchaseArtifactsDirName = "purchases",
    credentialId = "01",
    profileId = "01",
    buyingProfileId = "01",
    paymentProfileId = "01",
    purchaseMode = "review",
  } = {},
) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  const externalRoot = await fs.mkdtemp(path.join(os.tmpdir(), `${prefix}external-`));
  const credentialsDir = path.isAbsolute(credentialsDirName)
    ? credentialsDirName
    : path.join(externalRoot, credentialsDirName);
  const profilesDir = path.isAbsolute(profilesDirName)
    ? profilesDirName
    : path.join(externalRoot, profilesDirName);
  const purchaseArtifactsDir = path.isAbsolute(purchaseArtifactsDirName)
    ? purchaseArtifactsDirName
    : path.join(externalRoot, purchaseArtifactsDirName);
  await writePrivateSettingsFixture(root, {
    userId: credentialId,
    claimProfileId: profileId,
    buyingProfileId,
    paymentProfileId,
    purchaseMode,
    userCredentialsPath: credentialsDir,
    paymentProfilesPath: credentialsDir,
    claimProfilesPath: profilesDir,
    buyingProfilesPath: profilesDir,
    purchaseArtifactsPath: purchaseArtifactsDir,
  });
  return { root, credentialsDir, profilesDir, purchaseArtifactsDir };
}

async function writeCredential(dir, id, fileName, overrides = {}) {
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(
    path.join(dir, fileName),
    [
      ...(id ? [`ID_USR = "${id}"`] : []),
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

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

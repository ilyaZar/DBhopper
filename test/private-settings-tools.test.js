import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  createPrivateSettingsToolDefinitions,
} from "../dist/private-settings-tools.js";
import {
  configWithPrivateSettings,
  writeBuyingProfileFixture,
  writeCredentialsFixture,
  writePaymentProfileFixture,
  writePrivateProfileFixture,
  writePrivateSettingsFixture,
} from "./helpers/private-settings.js";

describe("dbhopper private settings tools", () => {
  it("accepts only canonical profile selection parameters", () => {
    const definitions = createPrivateSettingsToolDefinitions(
      (definition) => definition,
    );
    const selectTool = definitions.find(
      (definition) => definition.name === "dbhopper_private_settings_select",
    );

    assert.ok(selectTool);
    assert.equal(selectTool.parameters.additionalProperties, false);
    assert.equal("claim_profile_id" in selectTool.parameters.properties, true);
    assert.equal("profile_id" in selectTool.parameters.properties, false);
    assert.equal("purchase_mode" in selectTool.parameters.properties, false);
  });

  it("accepts only canonical runtime configuration parameters", () => {
    const configureTool = configureToolDefinition();
    const properties = Object.keys(configureTool.parameters.properties).sort();

    assert.equal(configureTool.parameters.additionalProperties, false);
    assert.deepEqual(properties, [
      "confirm",
      "delay_fallback",
      "delay_provider",
      "purchase_mode",
      "use_claim_requests",
      "use_delay_retrieval",
      "use_ticket_purchase",
    ]);
    assert.equal("profile_id" in configureTool.parameters.properties, false);
    assert.equal("mode_purchase" in configureTool.parameters.properties, false);
  });

  it("previews runtime configuration changes without writing", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "dbhopper-config-preview-"));
    await writePrivateSettingsFixture(root);
    const before = await readSettings(root);
    const configureTool = configureToolDefinition();

    const result = await configureTool.execute(
      {
        use_ticket_purchase: true,
        delay_provider: "db-timetables",
        purchase_mode: "auto",
      },
      configWithPrivateSettings(root, { approvalMode: "none" }),
    );
    const after = await readSettings(root);

    assert.equal(result.ok, true);
    assert.equal(result.mode, "preview");
    assert.equal(result.preview.needsUserAction, true);
    assert.deepEqual(
      result.preview.changes.map((change) => change.field),
      ["use_ticket_purchase", "delay_provider", "purchase_mode"],
    );
    assert.match(
      result.preview.changes.find((change) => change.field === "delay_provider").meaning,
      /DB Timetables API/,
    );
    assert.equal(before, after);
  });

  it("writes runtime configuration only after explicit confirmation", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "dbhopper-config-write-"));
    const externalRoot = await fs.mkdtemp(
      path.join(os.tmpdir(), "dbhopper-config-write-external-"),
    );
    const credentialsDir = path.join(externalRoot, "credentials");
    const profilesDir = path.join(externalRoot, "profiles");
    await writePrivateSettingsFixture(root, {
      userId: "02",
      claimProfileId: "03",
      buyingProfileId: "04",
      paymentProfileId: "05",
      userCredentialsPath: credentialsDir,
      claimProfilesPath: profilesDir,
      buyingProfilesPath: profilesDir,
      paymentProfilesPath: credentialsDir,
    });
    await writeCredentialsFixture(root, {
      id: "02",
      fileName: "credentials-02.toml",
      credentialsDir,
    });
    await writePaymentProfileFixture(
      credentialsDir,
      "05",
      "payment-profile-05.toml",
    );
    await writePrivateProfileFixture(
      profilesDir,
      "03",
      "private-profile-03.toml",
      "Third",
    );
    await writeBuyingProfileFixture(
      profilesDir,
      "04",
      "buying-profile-04.toml",
    );
    const configureTool = configureToolDefinition();

    const result = await configureTool.execute(
      {
        use_delay_retrieval: false,
        use_claim_requests: true,
        use_ticket_purchase: true,
        delay_provider: "auto",
        delay_fallback: "bahn-web",
        purchase_mode: "auto",
        confirm: true,
      },
      configWithPrivateSettings(root),
    );
    const settings = await readSettings(root);

    assert.equal(result.ok, true);
    assert.equal(result.mode, "confirmed");
    assert.match(settings, /use_delay_retrieval = false/);
    assert.match(settings, /use_claim_requests = true/);
    assert.match(settings, /use_ticket_purchase = true/);
    assert.match(settings, /delay_provider = "auto"/);
    assert.match(settings, /delay_fallback = "bahn-web"/);
    assert.match(settings, /purchase_mode = "auto"/);
    assert.match(settings, /ID_USR = "02"/);
    assert.match(settings, /ID_CLM = "03"/);
    assert.match(settings, /ID_BUY = "04"/);
    assert.match(settings, /ID_PYM = "05"/);
    assert.match(settings, new RegExp(`path_usr = "${escapeRegExp(credentialsDir)}"`));
    assert.match(settings, new RegExp(`path_clm = "${escapeRegExp(profilesDir)}"`));
    assert.equal(result.status.credentials.selected.fileName, "credentials-02.toml");
    assert.equal(result.status.claimProfiles.selected.fileName, "private-profile-03.toml");
    assert.equal(result.status.buyingProfiles.selected.fileName, "buying-profile-04.toml");
    assert.equal(result.status.paymentProfiles.selected.fileName, "payment-profile-05.toml");
  });

  it("preserves omitted runtime configuration fields", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "dbhopper-config-omit-"));
    await writePrivateSettingsFixture(root, {
      useDelayRetrieval: true,
      useClaimRequests: false,
      useTicketPurchase: false,
      delayProvider: "bahn-web",
      delayFallback: "none",
      purchaseMode: "review",
    });
    const configureTool = configureToolDefinition();

    await configureTool.execute(
      { use_claim_requests: true, confirm: true },
      configWithPrivateSettings(root),
    );
    const settings = await readSettings(root);

    assert.match(settings, /use_delay_retrieval = true/);
    assert.match(settings, /use_claim_requests = true/);
    assert.match(settings, /use_ticket_purchase = false/);
    assert.match(settings, /delay_provider = "bahn-web"/);
    assert.match(settings, /delay_fallback = "none"/);
    assert.match(settings, /purchase_mode = "review"/);
  });

  it("rejects invalid runtime configuration values", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "dbhopper-config-invalid-"));
    await writePrivateSettingsFixture(root);
    const configureTool = configureToolDefinition();

    const invalidProvider = await configureTool.execute(
      { delay_provider: "browser", confirm: true },
      configWithPrivateSettings(root),
    );
    const invalidPurchaseMode = await configureTool.execute(
      { purchase_mode: "execute", confirm: true },
      configWithPrivateSettings(root),
    );

    assert.equal(invalidProvider.ok, false);
    assert.match(invalidProvider.error, /delay_provider must be one of/);
    assert.equal(invalidPurchaseMode.ok, false);
    assert.match(invalidPurchaseMode.error, /purchase_mode must be one of/);
  });
});

function configureToolDefinition() {
  const definitions = createPrivateSettingsToolDefinitions(
    (definition) => definition,
  );
  const configureTool = definitions.find(
    (definition) => definition.name === "dbhopper_private_settings_configure",
  );

  assert.ok(configureTool);
  return configureTool;
}

function readSettings(root) {
  return fs.readFile(
    path.join(root, "assets", "private", "settings.toml"),
    "utf8",
  );
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

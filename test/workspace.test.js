import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  listClaims,
  prepareClaim,
  readClaim,
  validateWorkspaceTomlFiles,
  writeSubmittedRecipe,
} from "../dist/workspace.js";
import { parseClaimToml, parsePrivateProfileToml } from "../dist/claim-toml.js";
import {
  writePrivateProfileFixture,
  writePrivateSettingsFixture,
} from "./helpers/private-settings.js";

describe("dbhopper workspace", () => {
  it("creates per-claim folders and copies evidence", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "dbhopper-test-"));
    const source = path.join(root, "ticket.pdf");
    await fs.writeFile(source, "fixture", "utf8");

    const prepared = await prepareClaim(
      {
        confirm: true,
        claimId: "RE 6 Koeln",
        claim: {
          journey: { startStation: "Koeln Hbf", endStation: "Duesseldorf Hbf" },
        },
        files: [{ role: "base_ticket", sourcePath: source }],
      },
      { workspaceRoot: root },
    );

    assert.equal(prepared.claimId, "re-6-koeln");
    assert.equal(path.basename(prepared.claimPath), "claim.toml");
    assert.equal(prepared.copiedFiles[0].path, "ticket.pdf");
    assert.equal("originalPath" in prepared.copiedFiles[0], false);
    assert.equal(
      await fs.readFile(path.join(prepared.claimDir, "ticket.pdf"), "utf8"),
      "fixture",
    );

    const reread = await readClaim("re-6-koeln", { workspaceRoot: root });
    assert.equal(reread.claim.claimId, "re-6-koeln");

    const claims = await listClaims({ workspaceRoot: root });
    assert.equal(claims.length, 1);
    assert.equal(claims[0].claimant, undefined);
  });

  it("requires confirmation before writing", async () => {
    await assert.rejects(
      () => prepareClaim({ claim: {} }, { workspaceRoot: os.tmpdir() }),
      /confirm must be true/,
    );
  });

  it("merges private profile TOML without storing private fields in claim TOML", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "dbhopper-profile-"));
    await writePrivateSettingsFixture(root);
    await writePrivateProfileFixture(
      path.join(root, "assets", "private", "profiles"),
      "01",
      "private-profile-01.toml",
      "Maria",
    );

    const prepared = await prepareClaim(
      {
        confirm: true,
        claimId: "with-profile",
        claim: {
          journey: {
            date: "2026-06-06",
            startStation: "Koeln Hbf",
            endStation: "Duesseldorf Hbf",
          },
        },
      },
      { workspaceRoot: root },
    );

    assert.equal(prepared.claim.claimant.email, "maria@example.org");
    assert.equal(prepared.claim.claimant.bank.iban, "fill-iban");
    assert.equal(prepared.claim.journey.startStation, "Koeln Hbf");
    const stored = await fs.readFile(path.join(prepared.claimDir, "claim.toml"), "utf8");
    assert.doesNotMatch(stored, /private-profile-01/);
    assert.doesNotMatch(stored, /maria@example/);
    assert.doesNotMatch(stored, /DE893704/);
  });

  it("rejects claim TOML field typos and private field duplication", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "dbhopper-invalid-"));
    await fs.mkdir(path.join(root, "claims", "bad"), { recursive: true });
    await fs.writeFile(
      path.join(root, "claims", "bad", "claim.toml"),
      [
        "version = 1",
        'claim_id = "bad"',
        "",
        "[journey]",
        'start_staiton = "Koeln Hbf"',
        "delay_minutes = 25",
        "",
      ].join("\n"),
      "utf8",
    );

    await assert.rejects(
      () => readClaim("bad", { workspaceRoot: root }),
      /start_staiton is not a supported field/,
    );

    await assert.rejects(
      () =>
        prepareClaim(
          {
            confirm: true,
            claimId: "private-dup",
            claim: { claimant: { email: "maria@example.org" } },
          },
          { workspaceRoot: root },
        ),
      /must not include private fields/,
    );
  });

  it("keeps old camelCase claim and profile aliases compatible", () => {
    const claim = parseClaimToml([
      "version = 1",
      'claimId = "legacy-claim"',
      "",
      "[journey]",
      'startStation = "Koeln Hbf"',
      'endStation = "Duesseldorf Hbf"',
      "delayMinutes = 25",
      "",
      "[[files]]",
      'role = "base_ticket"',
      'path = "ticket.pdf"',
      "reusableAsset = true",
      "",
    ].join("\n"));
    const profile = parsePrivateProfileToml([
      "version = 1",
      'ID_CLM = "01"',
      "",
      "[claimant]",
      'salutation = "FAMILY"',
      'firstName = "Maria"',
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
    ].join("\n"));

    assert.equal(claim.claimId, "legacy-claim");
    assert.equal(claim.journey.startStation, "Koeln Hbf");
    assert.equal(claim.files[0].reusableAsset, true);
    assert.equal(profile.ID_CLM, "01");
    assert.equal(profile.claimant.firstName, "Maria");
  });

  it("rejects conflicting claim aliases", () => {
    assert.throws(
      () =>
        parseClaimToml([
          "version = 1",
          'claim_id = "snake-claim"',
          'claimId = "legacy-claim"',
          "",
        ].join("\n")),
      /aliases must not disagree/,
    );
  });

  it("flags wrong profile TOML value types in workspace validation", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "dbhopper-profile-invalid-"));
    await fs.mkdir(path.join(root, "assets", "private", "profiles"), { recursive: true });
    await fs.writeFile(
      path.join(root, "assets", "private", "profiles", "broken.toml"),
      [
        "version = 1",
        'id_clm = "01"',
        "",
        "[claimant]",
        'salutation = "FAMILY"',
        "first_name = 123",
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

    const result = await validateWorkspaceTomlFiles({ workspaceRoot: root });

    assert.equal(result.ok, false);
    assert.ok(
      result.messages.some((message) =>
        /firstName must be a string/.test(message.message),
      ),
    );
  });

  it("writes a submitted recipe with profile and claim data joined", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "dbhopper-recipe-"));
    await writePrivateSettingsFixture(root);
    await writePrivateProfileFixture(
      path.join(root, "assets", "private", "profiles"),
      "01",
      "private-profile-01.toml",
      "Maria",
    );
    const prepared = await prepareClaim(
      {
        confirm: true,
        claimId: "submitted",
        claim: {
          journey: {
            date: "2026-06-06",
            startStation: "Koeln Hbf",
            endStation: "Duesseldorf Hbf",
          },
        },
      },
      { workspaceRoot: root },
    );

    const recipePath = await writeSubmittedRecipe(prepared);
    const recipe = await fs.readFile(recipePath, "utf8");

    assert.match(recipe, /email = "maria@example.org"/);
    assert.match(recipe, /start_station = "Koeln Hbf"/);
  });
});

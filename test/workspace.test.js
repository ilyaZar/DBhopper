import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  findExistingSubmissionProof,
  listClaims,
  prepareClaim,
  readClaim,
  validateWorkspaceTomlFiles,
  writeSubmittedRecipe,
} from "../dist/workspace.js";
import { parseClaimToml, parsePrivateProfileToml } from "../dist/claim-toml.js";
import {
  configWithPrivateSettings,
  defaultExternalPrivateRoot,
  writePrivateProfileFixture,
  writePrivateSettingsFixture,
} from "./helpers/private-settings.js";

describe("dbhopper workspace", () => {
  it("creates per-claim folders and copies evidence", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "dbhopper-test-"));
    await writePrivateSettingsFixture(root);
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
      configWithPrivateSettings(root),
    );

    assert.equal(prepared.claimId, "re-6-koeln");
    assert.equal(path.basename(prepared.claimPath), "claim.toml");
    assert.equal(prepared.copiedFiles[0].path, "ticket.pdf");
    assert.equal("originalPath" in prepared.copiedFiles[0], false);
    assert.equal(
      await fs.readFile(path.join(prepared.claimDir, "ticket.pdf"), "utf8"),
      "fixture",
    );

    const reread = await readClaim("re-6-koeln", configWithPrivateSettings(root));
    assert.equal(reread.claim.ID_CLM, "re-6-koeln");

    const claims = await listClaims(configWithPrivateSettings(root));
    assert.equal(claims.length, 1);
    assert.equal(claims[0].claimant, undefined);
  });

  it("reads flat and nested claims from path_clm", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "dbhopper-claim-layouts-"));
    await writePrivateSettingsFixture(root);
    const claimRoot = path.join(defaultExternalPrivateRoot(root), "profiles");
    await fs.mkdir(path.join(claimRoot, "nested-claim"), { recursive: true });
    await fs.writeFile(
      path.join(claimRoot, "nested-claim", "claim.toml"),
      minimalClaimToml("nested-claim"),
      "utf8",
    );
    await fs.writeFile(
      path.join(claimRoot, "flat-claim.toml"),
      minimalClaimToml("flat-claim"),
      "utf8",
    );

    const nested = await readClaim("nested-claim", configWithPrivateSettings(root));
    const flat = await readClaim("flat-claim", configWithPrivateSettings(root));
    const claims = await listClaims(configWithPrivateSettings(root));

    assert.equal(nested.claimPath, path.join(claimRoot, "nested-claim", "claim.toml"));
    assert.equal(flat.claimPath, path.join(claimRoot, "flat-claim.toml"));
    assert.deepEqual(
      claims.map((claim) => claim.claimId).sort(),
      ["flat-claim", "nested-claim"],
    );
  });

  it("lists a callable storage ID when the stored claim ID differs", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "dbhopper-claim-id-"));
    await writePrivateSettingsFixture(root);
    const claimRoot = path.join(defaultExternalPrivateRoot(root), "profiles");
    await fs.mkdir(path.join(claimRoot, "claim-02"), { recursive: true });
    await fs.writeFile(
      path.join(claimRoot, "claim-02", "claim.toml"),
      minimalClaimToml("02"),
      "utf8",
    );

    const [listed] = await listClaims(configWithPrivateSettings(root));
    const prepared = await readClaim(
      listed.claimId,
      configWithPrivateSettings(root),
    );

    assert.equal(listed.claimId, "claim-02");
    assert.equal(listed.storedClaimId, "02");
    assert.equal(prepared.claimId, "claim-02");
    assert.equal(prepared.claim.ID_CLM, "02");
  });

  it("detects existing submission proof before a repeat submit", async () => {
    const claimDir = await fs.mkdtemp(
      path.join(os.tmpdir(), "dbhopper-submission-proof-"),
    );
    assert.equal(await findExistingSubmissionProof(claimDir), undefined);

    const proofPath = path.join(claimDir, "submission-confirmation.pdf");
    await fs.writeFile(proofPath, "proof", "utf8");

    assert.equal(await findExistingSubmissionProof(claimDir), proofPath);
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
      path.join(defaultExternalPrivateRoot(root), "profiles"),
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
      configWithPrivateSettings(root),
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
    await writePrivateSettingsFixture(root);
    const claimRoot = path.join(defaultExternalPrivateRoot(root), "profiles");
    await fs.mkdir(path.join(claimRoot, "bad"), { recursive: true });
    await fs.writeFile(
      path.join(claimRoot, "bad", "claim.toml"),
      [
        'ID_CLM = "bad"',
        "",
        "[journey]",
        'start_staiton = "Koeln Hbf"',
        "delay_minutes = 25",
        "",
      ].join("\n"),
      "utf8",
    );

    await assert.rejects(
      () => readClaim("bad", configWithPrivateSettings(root)),
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
          configWithPrivateSettings(root),
        ),
      /must not include private fields/,
    );
  });

  it("rejects unsupported claim and profile keys", () => {
    assert.throws(
      () =>
        parseClaimToml([
          'ID_CLM = "bad-claim"',
          'claimId = "bad-claim"',
          "",
        ].join("\n")),
      /claimId is not a supported field/,
    );
    assert.throws(
      () =>
        parseClaimToml([
          'ID_CLM = "bad-claim"',
          'claim_id = "bad-claim"',
          "",
        ].join("\n")),
      /claim_id is not a supported field/,
    );
    assert.throws(
      () =>
        parseClaimToml([
          'ID_CLM = "bad-claim"',
          "",
          "[journey]",
          'startStation = "Koeln Hbf"',
          "",
        ].join("\n")),
      /use start_station/,
    );
    assert.throws(
      () =>
        parsePrivateProfileToml([
          'ID_CLM = "01"',
          'id_clm = "01"',
          "",
          "[claimant]",
          'salutation = "FAMILY"',
          'first_name = "Maria"',
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
        ].join("\n")),
      /id_clm is not a supported field/,
    );
    assert.throws(
      () =>
        parsePrivateProfileToml([
          'ID_CLM = "01"',
          "",
          "[claimant]",
          'firstName = "Maria"',
          "",
        ].join("\n")),
      /use first_name/,
    );
    assert.equal(
      parsePrivateProfileToml([
        'ID_CLM = "01"',
        "",
        "[claimant]",
        'salutation = "Herr"',
        'first_name = "Maria"',
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
      ].join("\n")).claimant.salutation,
      "MR",
    );
  });

  it("parses file path arrays in claim TOML", () => {
    const claim = parseClaimToml([
      'ID_CLM = "multi-evidence"',
      "",
      "[[files]]",
      'role = "delay_evidence"',
      'paths = ["delay-1.png", "delay-2.png", "delay-3.png"]',
      "",
    ].join("\n"));

    assert.deepEqual(claim.files?.[0].paths, [
      "delay-1.png",
      "delay-2.png",
      "delay-3.png",
    ]);
  });

  it("flags wrong profile TOML value types in workspace validation", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "dbhopper-profile-invalid-"));
    await writePrivateSettingsFixture(root);
    const profilesDir = path.join(defaultExternalPrivateRoot(root), "profiles");
    await fs.mkdir(profilesDir, { recursive: true });
    await fs.writeFile(
      path.join(profilesDir, "broken.toml"),
      [
        'ID_CLM = "01"',
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

    const result = await validateWorkspaceTomlFiles(configWithPrivateSettings(root));

    assert.equal(result.ok, false);
    assert.ok(
      result.messages.some((message) =>
        /firstName must be a string/.test(message.message),
      ),
    );
  });

  it("writes a submitted recipe without private profile data", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "dbhopper-recipe-"));
    await writePrivateSettingsFixture(root);
    await writePrivateProfileFixture(
      path.join(defaultExternalPrivateRoot(root), "profiles"),
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
      configWithPrivateSettings(root),
    );

    const recipePath = await writeSubmittedRecipe(prepared, {
      submittedAt: new Date("2026-07-01T12:00:00.000Z"),
    });
    const recipe = await fs.readFile(recipePath, "utf8");

    assert.match(recipe, /submitted = true/);
    assert.doesNotMatch(recipe, /maria@example\.org/);
    assert.doesNotMatch(recipe, /first_name|iban|start_station/);
  });
});

function minimalClaimToml(claimId) {
  return [
    `ID_CLM = "${claimId}"`,
    'status = "draft"',
    "",
    "[journey]",
    'start_station = "Koeln Hbf"',
    'end_station = "Duesseldorf Hbf"',
    "",
  ].join("\n");
}

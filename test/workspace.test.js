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
    await fs.mkdir(path.join(root, "assets", "private", "profiles"), { recursive: true });
    await fs.writeFile(
      path.join(root, "assets", "private", "profiles", "default.toml"),
      [
        "version = 1",
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
        "[bank]",
        'accountOwner = "Maria Mustermann"',
        'iban = "DE89370400440532013000"',
        "",
      ].join("\n"),
      "utf8",
    );

    const prepared = await prepareClaim(
      {
        confirm: true,
        claimId: "with-profile",
        profileName: "default",
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
    assert.equal(prepared.claim.bank.iban, "DE89370400440532013000");
    assert.equal(prepared.claim.journey.startStation, "Koeln Hbf");
    const stored = await fs.readFile(path.join(prepared.claimDir, "claim.toml"), "utf8");
    assert.match(stored, /profileName = "default.toml"/);
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
        'claimId = "bad"',
        "",
        "[journey]",
        'startStaiton = "Koeln Hbf"',
        "delayMinutes = 25",
        "",
      ].join("\n"),
      "utf8",
    );

    await assert.rejects(
      () => readClaim("bad", { workspaceRoot: root }),
      /startStaiton is not a supported field/,
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

  it("flags wrong profile TOML value types in workspace validation", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "dbhopper-profile-invalid-"));
    await fs.mkdir(path.join(root, "assets", "private", "profiles"), { recursive: true });
    await fs.writeFile(
      path.join(root, "assets", "private", "profiles", "broken.toml"),
      [
        "version = 1",
        "",
        "[claimant]",
        'salutation = "FAMILY"',
        "firstName = 123",
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

    const result = await validateWorkspaceTomlFiles({ workspaceRoot: root });

    assert.equal(result.ok, false);
    assert.ok(result.messages.some((message) => /firstName must be a string/.test(message.message)));
  });

  it("writes a submitted recipe with profile and claim data joined", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "dbhopper-recipe-"));
    await fs.mkdir(path.join(root, "assets", "private", "profiles"), { recursive: true });
    await fs.writeFile(
      path.join(root, "assets", "private", "profiles", "default.toml"),
      [
        "version = 1",
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
        "[bank]",
        'accountOwner = "Maria Mustermann"',
        'iban = "DE89370400440532013000"',
        "",
      ].join("\n"),
      "utf8",
    );
    const prepared = await prepareClaim(
      {
        confirm: true,
        claimId: "submitted",
        profileName: "default",
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
    assert.match(recipe, /startStation = "Koeln Hbf"/);
  });
});

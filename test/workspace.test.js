import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { listClaims, prepareClaim, readClaim } from "../dist/workspace.js";

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
          claimant: { email: "maria@example.org" },
          journey: { startStation: "Koeln Hbf", endStation: "Duesseldorf Hbf" },
        },
        files: [{ role: "base_ticket", sourcePath: source }],
      },
      { workspaceRoot: root },
    );

    assert.equal(prepared.claimId, "re-6-koeln");
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
    assert.equal(claims[0].claimant.email, "ma***@example.org");
  });

  it("requires confirmation before writing", async () => {
    await assert.rejects(
      () => prepareClaim({ claim: {} }, { workspaceRoot: os.tmpdir() }),
      /confirm must be true/,
    );
  });

  it("merges private profile assets without returning source data", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "dbhopper-profile-"));
    await fs.mkdir(path.join(root, "assets", "private"), { recursive: true });
    await fs.writeFile(
      path.join(root, "assets", "private", "default.json"),
      JSON.stringify({
        claimant: {
          firstName: "Maria",
          lastName: "Mustermann",
          email: "maria@example.org",
        },
        bank: {
          accountOwner: "Maria Mustermann",
          iban: "DE89370400440532013000",
        },
      }),
      "utf8",
    );

    const prepared = await prepareClaim(
      {
        confirm: true,
        claimId: "with-profile",
        profileAssetName: "default.json",
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
  });
});

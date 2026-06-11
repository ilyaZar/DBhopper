import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";

describe("dbhopper package metadata", () => {
  it("declares plugin contracts matching package entrypoint", async () => {
    const manifest = JSON.parse(await fs.readFile("openclaw.plugin.json", "utf8"));
    const pkg = JSON.parse(await fs.readFile("package.json", "utf8"));

    assert.equal(manifest.id, "dbhopper");
    assert.equal(manifest.name, "DBhopper");
    assert.equal(pkg.name, "dbhopper");
    assert.equal(pkg.repository.url, "git+https://github.com/ilyaZar/dbhopper.git");
    assert.deepEqual(pkg.openclaw.extensions, ["./dist/index.js"]);
    assert.deepEqual(manifest.skills, ["./skills"]);
    assert.deepEqual(manifest.contracts.tools, [
      "dbhopper_claim_schema",
      "dbhopper_list_claims",
      "dbhopper_prepare_claim",
      "dbhopper_validate_claim",
      "dbhopper_browser_probe",
      "dbhopper_run_claim",
      "dbhopper_db_delay_research",
      "dbhopper_query_db_delay",
    ]);
    for (const toolName of manifest.contracts.tools) {
      assert.equal(manifest.toolMetadata[toolName].optional, true);
    }
  });

  it("keeps runtime claim data out of the npm file list", async () => {
    const pkg = JSON.parse(await fs.readFile("package.json", "utf8"));
    assert.ok(pkg.files.includes("claims/.gitkeep"));
    assert.ok(pkg.files.includes("assets/private/.gitkeep"));
    assert.ok(pkg.files.includes("assets/private/profiles/.gitkeep"));
    assert.ok(pkg.files.includes("assets/private/profiles/private-profile.example.toml"));
    assert.ok(pkg.files.includes("specs/"));
    assert.equal(pkg.files.includes("claims/"), false);
    assert.equal(pkg.files.includes("tmp/"), false);
  });
});

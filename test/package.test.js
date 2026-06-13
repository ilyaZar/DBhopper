import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

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
    assert.ok(pkg.files.includes("settings.yaml"));
    assert.deepEqual(manifest.contracts.tools, [
      "dbhopper_claim_schema",
      "dbhopper_list_claims",
      "dbhopper_prepare_claim",
      "dbhopper_validate_claim",
      "dbhopper_browser_probe",
      "dbhopper_run_claim",
      "dbhopper_private_settings_status",
      "dbhopper_private_settings_select",
      "dbhopper_credentials_validate",
      "dbhopper_db_standard_login_check",
      "dbhopper_db_marketplace_access_check",
      "dbhopper_db_api_credential_probe",
      "dbhopper_db_delay_research",
      "dbhopper_query_db_delay",
      "dbhopper_ticket_buying_research",
      "dbhopper_ticket_buying_dry_run",
      "dbhopper_ticket_checkout_dry_run",
    ]);
    for (const toolName of manifest.contracts.tools) {
      assert.equal(manifest.toolMetadata[toolName].optional, true);
    }
  });

  it("keeps runtime claim data out of the npm file list", async () => {
    const pkg = JSON.parse(await fs.readFile("package.json", "utf8"));
    assert.ok(pkg.files.includes("claims/.gitkeep"));
    assert.ok(pkg.files.includes("assets/private/.gitkeep"));
    assert.ok(pkg.files.includes("assets/private/credentials/.gitkeep"));
    assert.ok(pkg.files.includes("assets/private/profiles/.gitkeep"));
    assert.ok(pkg.files.includes("docs/"));
    assert.equal(
      pkg.files.includes("assets/private/credentials/credentials.example.toml"),
      false,
    );
    assert.equal(
      pkg.files.includes("assets/private/profiles/private-profile.example.toml"),
      false,
    );
    assert.equal(pkg.files.includes("assets/private/settings.toml"), false);
    assert.equal(pkg.files.includes("claims/"), false);
    assert.equal(pkg.files.includes("tmp/"), false);
  });

  it("keeps tmp out of gitignore exceptions and package output", async () => {
    const gitignore = await fs.readFile(".gitignore", "utf8");
    const clawhubignore = await fs.readFile(".clawhubignore", "utf8");

    assert.match(gitignore, /^tmp\/$/m);
    assert.doesNotMatch(gitignore, /!tmp\//);
    assert.match(clawhubignore, /^tmp\/$/m);

    const { stdout } = await execFileAsync(
      "npm",
      ["pack", "--dry-run", "--json", "--ignore-scripts"],
      { maxBuffer: 1024 * 1024 * 8 },
    );
    const [{ files }] = JSON.parse(stdout);
    const paths = files.map((file) => file.path);

    assert.equal(paths.some((filePath) => filePath.startsWith("tmp/")), false);
    assert.equal(paths.includes("tmp/.gitkeep"), false);
  });
});

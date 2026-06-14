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
    assert.deepEqual(pkg.openclaw.install, {
      clawhubSpec: "clawhub:dbhopper",
      defaultChoice: "clawhub",
      minHostVersion: ">=2026.6.2",
    });
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
    assert.ok(pkg.files.includes("assets/dbhopper_banner.png"));
    assert.ok(pkg.files.includes("docs/"));
    for (const filePath of [
      "claims/.gitkeep",
      "assets/.gitkeep",
      "assets/private/.gitkeep",
      "assets/private/credentials/.gitkeep",
      "assets/private/profiles/.gitkeep",
    ]) {
      assert.equal(pkg.files.includes(filePath), false);
    }
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

  it("keeps private runtime paths ignored and out of package output", async () => {
    const gitignore = await fs.readFile(".gitignore", "utf8");
    const clawhubignore = await fs.readFile(".clawhubignore", "utf8");

    assert.match(gitignore, /^tmp\/$/m);
    assert.match(gitignore, /^claims\/$/m);
    assert.match(gitignore, /^assets\/private\/$/m);
    assert.match(gitignore, /^assets\/psc\/$/m);
    assert.doesNotMatch(gitignore, /!tmp\//);
    assert.doesNotMatch(gitignore, /!claims\//);
    assert.doesNotMatch(gitignore, /!assets\/private\//);
    assert.match(clawhubignore, /^tmp\/$/m);
    assert.match(clawhubignore, /^claims\/$/m);
    assert.match(clawhubignore, /^assets\/private\/$/m);
    assert.match(clawhubignore, /^assets\/psc\/$/m);

    const ignoredPaths = [
      "assets/private/settings.toml",
      "assets/private/credentials/credentials-01.toml",
      "assets/private/credentials/payment-01.toml",
      "assets/private/profiles/private-profile-01.toml",
      "assets/private/profiles/buying-profile-01.toml",
      "claims/real-claim/claim.toml",
      "tmp/browser/db-ticket-buying/Default/Cookies",
      "tmp/ticket-buying-dry-run/review.png",
      "assets/psc/scan-report.zip",
      ".env",
      "local.pem",
      "secrets.sqlite",
    ];
    const { stdout: ignoredStdout } = await execFileAsync(
      "git",
      ["check-ignore", ...ignoredPaths],
    );
    assert.deepEqual(
      ignoredStdout.trim().split("\n").sort(),
      ignoredPaths.sort(),
    );

    const { stdout } = await execFileAsync(
      "npm",
      ["pack", "--dry-run", "--json", "--ignore-scripts"],
      { maxBuffer: 1024 * 1024 * 8 },
    );
    const [{ files }] = JSON.parse(stdout);
    const paths = files.map((file) => file.path);

    assert.equal(paths.some((filePath) => filePath.startsWith("tmp/")), false);
    for (const prefix of ["claims/", "assets/private/", "assets/psc/"]) {
      assert.equal(paths.some((filePath) => filePath.startsWith(prefix)), false);
    }
    for (const filePath of [
      "tmp/.gitkeep",
      "claims/.gitkeep",
      "assets/private/.gitkeep",
    ]) {
      assert.equal(paths.includes(filePath), false);
    }
  });
});

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  applyCredentialsToConfig,
  credentialsSummary,
  normalizeCredentialsName,
  readCredentialsProfile,
  validateCredentialsFiles,
} from "../dist/credentials.js";

describe("dbhopper credentials", () => {
  it("loads TOML credentials and redacts values from summaries", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "dbhopper-creds-"));
    const credentialsDir = path.join(root, "assets", "private", "credentials");
    await fs.mkdir(credentialsDir, { recursive: true });
    await fs.writeFile(
      path.join(credentialsDir, "default.toml"),
      [
        "version = 1",
        "",
        "[dbApi]",
        'clientId = "client-secret-value"',
        'apiKey = "api-secret-value"',
        'accountUsername = "api-user@example.org"',
        'accountPassword = "api-account-secret"',
        "",
        "[bahnAccount]",
        'username = "maria@example.org"',
        'password = "account-secret-value"',
        "",
        "[browser]",
        'userDataDir = "assets/private/browser/db-ticket-buying"',
        "",
      ].join("\n"),
      "utf8",
    );

    const loaded = await readCredentialsProfile("default", { workspaceRoot: root });
    assert.equal(loaded.credentialsName, "default.toml");
    assert.equal(loaded.credentials.dbApi.clientId, "client-secret-value");
    assert.equal(loaded.credentials.dbApi.accountUsername, "api-user@example.org");

    const summary = credentialsSummary(loaded);
    assert.equal(summary.configured, true);
    assert.equal(summary.hasDbApiCredentials, true);
    assert.equal(summary.hasDbApiAccountCredentials, true);
    assert.equal(summary.hasBahnAccountCredentials, true);
    assert.equal(summary.hasBrowserUserDataDir, true);
    assert.doesNotMatch(JSON.stringify(summary), /secret|maria@example|api-user/);

    const config = applyCredentialsToConfig({ workspaceRoot: root }, loaded);
    assert.equal(config.dbClientId, "client-secret-value");
    assert.equal(config.dbApiKey, "api-secret-value");
  });

  it("rejects unsafe names and unknown fields", async () => {
    assert.throws(() => normalizeCredentialsName("../default"), /safe TOML/);

    const root = await fs.mkdtemp(path.join(os.tmpdir(), "dbhopper-creds-bad-"));
    const credentialsDir = path.join(root, "assets", "private", "credentials");
    await fs.mkdir(credentialsDir, { recursive: true });
    await fs.writeFile(
      path.join(credentialsDir, "bad.toml"),
      [
        "version = 1",
        "unexpected = true",
        "",
      ].join("\n"),
      "utf8",
    );

    const result = await validateCredentialsFiles({ workspaceRoot: root });
    assert.equal(result.ok, false);
    assert.ok(
      result.messages.some((message) =>
        /unexpected is not a supported field/.test(message.message),
      ),
    );
  });
});

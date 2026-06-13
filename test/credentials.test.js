import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  applyCredentialsToConfig,
  credentialsSummary,
  readSelectedCredentialsProfile,
  validateCredentialsFiles,
} from "../dist/credentials.js";

describe("dbhopper credentials", () => {
  it("loads TOML credentials and redacts values from summaries", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "dbhopper-creds-"));
    const credentialsDir = path.join(root, "assets", "private", "credentials");
    await fs.mkdir(credentialsDir, { recursive: true });
    await writeSettings(root);
    await fs.writeFile(
      path.join(credentialsDir, "credentials-01.toml"),
      [
        "version = 1",
        'ID_CRED = "01"',
        "",
        "[bahnAPI]",
        'clientId = "client-secret-value"',
        'apiKey = "api-secret-value"',
        "",
        "[bahnAccountAPI]",
        'username = "api-user@example.org"',
        'password = "api-account-secret"',
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

    const loaded = await readSelectedCredentialsProfile({ workspaceRoot: root });
    assert.equal(loaded.credentialsName, "credentials-01.toml");
    assert.equal(loaded.credentialsId, "01");
    assert.equal(loaded.credentials.bahnAPI.clientId, "client-secret-value");
    assert.equal(loaded.credentials.bahnAccountAPI.username, "api-user@example.org");

    const summary = credentialsSummary(loaded);
    assert.equal(summary.configured, true);
    assert.equal(summary.hasBahnAPICredentials, true);
    assert.equal(summary.hasBahnAccountCredentials, true);
    assert.equal(summary.hasBahnAccountAPICredentials, true);
    assert.equal(summary.hasBrowserUserDataDir, true);
    assert.doesNotMatch(JSON.stringify(summary), /secret|maria@example|api-user/);

    const config = applyCredentialsToConfig({ workspaceRoot: root }, loaded);
    assert.equal(config.dbClientId, "client-secret-value");
    assert.equal(config.dbApiKey, "api-secret-value");
  });

  it("rejects unknown fields", async () => {
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

  it("flags PATH_CRED when credentials validation sees a file", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "dbhopper-creds-path-"));
    const credentialsFile = path.join(root, "credentials-as-file.toml");
    await fs.writeFile(credentialsFile, 'ID_CRED = "01"\n', "utf8");
    await writeSettings(root, credentialsFile);

    const result = await validateCredentialsFiles({ workspaceRoot: root });

    assert.equal(result.ok, false);
    assert.ok(
      result.messages.some((message) =>
        /PATH_CRED .* must point to a directory/.test(message.message),
      ),
    );
  });
});

async function writeSettings(root, credentialsPath = "assets/private/credentials") {
  await fs.mkdir(path.join(root, "assets", "private"), { recursive: true });
  await fs.writeFile(
    path.join(root, "assets", "private", "settings.toml"),
    [
      'ID_CRED = "01"',
      'ID_PRF = "01"',
      `PATH_CRED = "${credentialsPath}"`,
      'PATH_PRF = "assets/private/profiles"',
      'DELAY_PROVIDER = "bahn-web"',
      'DELAY_FALLBACK = "none"',
      "",
    ].join("\n"),
    "utf8",
  );
}

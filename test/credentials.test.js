import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  applyCredentialsToConfig,
  credentialsSummary,
  parseCredentialsToml,
  readSelectedCredentialsProfile,
  validateCredentialsFiles,
} from "../dist/credentials.js";
import {
  writeCredentialsFixture,
  writePrivateSettingsFixture,
} from "./helpers/private-settings.js";

describe("dbhopper credentials", () => {
  it("loads TOML credentials and redacts values from summaries", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "dbhopper-creds-"));
    await writePrivateSettingsFixture(root);
    await writeCredentialsFixture(root, {
      extraLines: [
        "[bahn_account_api]",
        'username = "api-user@example.org"',
        'password = "api-account-secret"',
        "",
        "[bahn_account]",
        'username = "maria@example.org"',
        'password = "account-secret-value"',
        "",
        "[browser]",
        'user_data_dir = "../dbhopper-private/browser/db-ticket-buying"',
        "",
      ],
    });

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

  it("rejects unsupported credentials keys", () => {
    assert.throws(
      () =>
        parseCredentialsToml([
          'id_usr = "01"',
          "",
        ].join("\n")),
      /id_usr is not a supported field/,
    );
    assert.throws(
      () =>
        parseCredentialsToml([
          'ID_USR = "01"',
          "",
          "[bahnAPI]",
          'client_id = "client-secret-value"',
          "",
        ].join("\n")),
      /use bahn_api/,
    );
    assert.throws(
      () =>
        parseCredentialsToml([
          'ID_USR = "01"',
          "",
          "[bahn_api]",
          'clientId = "different-client-value"',
          "",
        ].join("\n")),
      /use client_id/,
    );
  });

  it("rejects unknown fields", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "dbhopper-creds-bad-"));
    const externalRoot = await fs.mkdtemp(
      path.join(os.tmpdir(), "dbhopper-creds-bad-external-"),
    );
    const credentialsDir = path.join(externalRoot, "credentials");
    await writePrivateSettingsFixture(root, { userCredentialsPath: credentialsDir });
    await fs.mkdir(credentialsDir, { recursive: true });
    await fs.writeFile(
      path.join(credentialsDir, "bad.toml"),
      [
        'ID_USR = "01"',
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

  it("flags path_usr when credentials validation sees a file", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "dbhopper-creds-path-"));
    const externalRoot = await fs.mkdtemp(
      path.join(os.tmpdir(), "dbhopper-creds-path-external-"),
    );
    const credentialsFile = path.join(externalRoot, "credentials-as-file.toml");
    await fs.writeFile(credentialsFile, 'ID_USR = "01"\n', "utf8");
    await writePrivateSettingsFixture(root, { userCredentialsPath: credentialsFile });

    const result = await validateCredentialsFiles({ workspaceRoot: root });

    assert.equal(result.ok, false);
    assert.ok(
      result.messages.some((message) =>
        /path_usr .* must point to a directory/.test(message.message),
      ),
    );
  });
});

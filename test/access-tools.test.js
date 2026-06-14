import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { runDbApiCredentialProbe } from "../dist/db-api-access.js";

describe("dbhopper access diagnostics", () => {
  it("probes DB API credentials without returning secrets", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "dbhopper-access-"));
    const credentialsDir = path.join(root, "assets", "private", "credentials");
    await fs.mkdir(credentialsDir, { recursive: true });
    await writeSettings(root);
    await fs.writeFile(
      path.join(credentialsDir, "credentials-01.toml"),
      [
        "version = 1",
        'id_usr = "01"',
        "",
        "[bahn_api]",
        'client_id = "client-secret-value"',
        'api_key = "api-secret-value"',
        "",
      ].join("\n"),
      "utf8",
    );

    const result = await runDbApiCredentialProbe(
      {},
      { workspaceRoot: root },
      { fetchImpl: fakeUnauthorizedFetch },
    );

    assert.equal(result.ok, false);
    assert.equal(result.response.status, 401);
    assert.equal(result.response.dbErrorMessage, "Invalid client id or secret.");
    assert.equal(result.credentialDiagnosis.status, "rejected");
    assert.equal(result.credentialDiagnosis.reason, "invalid_client_id_or_secret");
    assert.ok(
      result.credentialDiagnosis.next_steps.some((step) =>
        step.includes("Timetables product"),
      ),
    );
    assert.equal(result.credentialSignals.clientIdLength, "client-secret-value".length);
    assert.equal(result.browserLoginDoesNotProveApiKeyValidity, true);
    assert.doesNotMatch(JSON.stringify(result), /client-secret-value|api-secret-value/);
  });
});

async function fakeUnauthorizedFetch() {
  return new Response(
    [
      '<?xml version="1.0" encoding="UTF-8"?>',
      "<errorResponse>",
      "<httpCode>401</httpCode>",
      "<httpMessage>Unauthorized</httpMessage>",
      "<moreInformation>Invalid client id or secret.</moreInformation>",
      "</errorResponse>",
    ].join(""),
    {
      status: 401,
      statusText: "Unauthorized",
      headers: { "content-type": "application/xml" },
    },
  );
}

async function writeSettings(root) {
  await fs.mkdir(path.join(root, "assets", "private"), { recursive: true });
  await fs.writeFile(
    path.join(root, "assets", "private", "settings.toml"),
    [
      'id_usr = "01"',
      'id_clm = "01"',
      'id_buy = "01"',
      'id_pym = "01"',
      'path_cred = "assets/private/credentials"',
      'path_prf = "assets/private/profiles"',
      'delay_provider = "bahn-web"',
      'delay_fallback = "none"',
      "",
    ].join("\n"),
    "utf8",
  );
}

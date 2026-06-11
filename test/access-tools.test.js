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
    await fs.writeFile(
      path.join(credentialsDir, "default.toml"),
      [
        "version = 1",
        "",
        "[dbApi]",
        'clientId = "client-secret-value"',
        'apiKey = "api-secret-value"',
        "",
      ].join("\n"),
      "utf8",
    );

    const result = await runDbApiCredentialProbe(
      { credentials_profile: "default" },
      { workspaceRoot: root },
      { fetchImpl: fakeUnauthorizedFetch },
    );

    assert.equal(result.ok, false);
    assert.equal(result.response.status, 401);
    assert.equal(result.response.dbErrorMessage, "Invalid client id or secret.");
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

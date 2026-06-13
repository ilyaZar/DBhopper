import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";

import {
  DEFAULT_FEATURE_SETTINGS,
  enabledToolNames,
  parseTopLevelSettings,
} from "../dist/plugin-settings.js";

describe("dbhopper top-level settings", () => {
  it("defaults to delay retrieval only", async () => {
    const settings = parseTopLevelSettings(
      await fs.readFile("settings.yaml", "utf8"),
    );

    assert.deepEqual(settings, DEFAULT_FEATURE_SETTINGS);

    const tools = enabledToolNames(settings);
    assert.equal(tools.has("dbhopper_query_db_delay"), true);
    assert.equal(tools.has("dbhopper_prepare_claim"), false);
    assert.equal(tools.has("dbhopper_ticket_checkout_dry_run"), false);
  });

  it("enables claim and ticket tool groups explicitly", () => {
    const settings = parseTopLevelSettings([
      "use_delay_retrieval: false",
      "use_claim_requests: true",
      "use_ticket_buying: true",
      "",
    ].join("\n"));
    const tools = enabledToolNames(settings);

    assert.equal(tools.has("dbhopper_query_db_delay"), false);
    assert.equal(tools.has("dbhopper_db_api_credential_probe"), false);
    assert.equal(tools.has("dbhopper_run_claim"), true);
    assert.equal(tools.has("dbhopper_db_standard_login_check"), true);
    assert.equal(tools.has("dbhopper_ticket_checkout_dry_run"), true);
  });

  it("rejects unknown top-level settings", () => {
    assert.throws(
      () => parseTopLevelSettings("use_ticket_buying_now: true\n"),
      /unknown setting use_ticket_buying_now/,
    );
  });
});

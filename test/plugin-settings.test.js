import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";

import {
  DEFAULT_FEATURE_SETTINGS,
  enabledToolNames,
  featureSettingForToolName,
  parseTopLevelSettings,
} from "../dist/plugin-settings.js";
import {
  DB_API_CREDENTIAL_PROBE_TOOL_NAME,
  DB_STANDARD_LOGIN_CHECK_TOOL_NAME,
  PRIVATE_SETTINGS_STATUS_TOOL_NAME,
  QUERY_DB_DELAY_TOOL_NAME,
  TICKET_CHECKOUT_DRY_RUN_TOOL_NAME,
} from "../dist/tool-contracts.js";

describe("dbhopper top-level settings", () => {
  it("defaults to delay retrieval only", async () => {
    const settings = parseTopLevelSettings(
      await fs.readFile("settings.yaml", "utf8"),
    );

    assert.deepEqual(settings, DEFAULT_FEATURE_SETTINGS);

    const tools = enabledToolNames(settings);
    assert.equal(tools.has(QUERY_DB_DELAY_TOOL_NAME), true);
    assert.equal(tools.has("dbhopper_prepare_claim"), false);
    assert.equal(tools.has(TICKET_CHECKOUT_DRY_RUN_TOOL_NAME), false);
  });

  it("enables claim and ticket tool groups explicitly", () => {
    const settings = parseTopLevelSettings([
      "use_delay_retrieval: false",
      "use_claim_requests: true",
      "use_ticket_buying: true",
      "",
    ].join("\n"));
    const tools = enabledToolNames(settings);

    assert.equal(tools.has(QUERY_DB_DELAY_TOOL_NAME), false);
    assert.equal(tools.has(DB_API_CREDENTIAL_PROBE_TOOL_NAME), false);
    assert.equal(tools.has("dbhopper_run_claim"), true);
    assert.equal(tools.has(DB_STANDARD_LOGIN_CHECK_TOOL_NAME), true);
    assert.equal(tools.has(TICKET_CHECKOUT_DRY_RUN_TOOL_NAME), true);
  });

  it("rejects unknown top-level settings", () => {
    assert.throws(
      () => parseTopLevelSettings("use_ticket_buying_now: true\n"),
      /unknown setting use_ticket_buying_now/,
    );
  });

  it("maps public tool names to workflow gates", () => {
    assert.equal(
      featureSettingForToolName(QUERY_DB_DELAY_TOOL_NAME),
      "use_delay_retrieval",
    );
    assert.equal(
      featureSettingForToolName("dbhopper_prepare_claim"),
      "use_claim_requests",
    );
    assert.equal(
      featureSettingForToolName(TICKET_CHECKOUT_DRY_RUN_TOOL_NAME),
      "use_ticket_buying",
    );
    assert.equal(
      featureSettingForToolName(PRIVATE_SETTINGS_STATUS_TOOL_NAME),
      undefined,
    );
  });
});

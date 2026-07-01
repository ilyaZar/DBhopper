import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  DEFAULT_FEATURE_SETTINGS,
  enabledToolNames,
  featureSettingEnableSuggestion,
  featureSettingForToolName,
  parseTopLevelSettings,
} from "../dist/plugin-settings.js";
import {
  DB_API_CREDENTIAL_PROBE_TOOL_NAME,
  DB_STANDARD_LOGIN_CHECK_TOOL_NAME,
  PRIVATE_SETTINGS_CONFIGURE_TOOL_NAME,
  PRIVATE_SETTINGS_STATUS_TOOL_NAME,
  QUERY_DB_DELAY_TOOL_NAME,
  TICKET_CHECKOUT_DRY_RUN_TOOL_NAME,
} from "../dist/tool-contracts.js";

describe("dbhopper top-level settings", () => {
  it("defaults to delay retrieval only", () => {
    const settings = parseTopLevelSettings(settingsToml());

    assert.deepEqual(settings, DEFAULT_FEATURE_SETTINGS);

    const tools = enabledToolNames(settings);
    assert.equal(tools.has(QUERY_DB_DELAY_TOOL_NAME), true);
    assert.equal(tools.has("dbhopper_prepare_claim"), false);
    assert.equal(tools.has(TICKET_CHECKOUT_DRY_RUN_TOOL_NAME), false);
    assert.equal(tools.has(PRIVATE_SETTINGS_CONFIGURE_TOOL_NAME), true);
  });

  it("enables claim and ticket tool groups explicitly", () => {
    const settings = parseTopLevelSettings(settingsToml({
      useDelayRetrieval: false,
      useClaimRequests: true,
      useTicketPurchase: true,
    }));
    const tools = enabledToolNames(settings);

    assert.equal(tools.has(QUERY_DB_DELAY_TOOL_NAME), false);
    assert.equal(tools.has(DB_API_CREDENTIAL_PROBE_TOOL_NAME), false);
    assert.equal(tools.has("dbhopper_run_claim"), true);
    assert.equal(tools.has(DB_STANDARD_LOGIN_CHECK_TOOL_NAME), true);
    assert.equal(tools.has(TICKET_CHECKOUT_DRY_RUN_TOOL_NAME), true);
  });

  it("rejects unknown top-level settings", () => {
    assert.throws(
      () => parseTopLevelSettings(`${settingsToml()}use_ticket_purchase_now = true\n`),
      /use_ticket_purchase_now is not a supported field/,
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
      "use_ticket_purchase",
    );
    assert.equal(
      featureSettingForToolName(PRIVATE_SETTINGS_STATUS_TOOL_NAME),
      undefined,
    );
    assert.equal(
      featureSettingForToolName(PRIVATE_SETTINGS_CONFIGURE_TOOL_NAME),
      undefined,
    );
  });

  it("suggests the configure tool when a workflow is disabled", () => {
    const suggestion = featureSettingEnableSuggestion("use_ticket_purchase");

    assert.equal(suggestion.suggestedTool, PRIVATE_SETTINGS_CONFIGURE_TOOL_NAME);
    assert.deepEqual(suggestion.suggestedChange, {
      use_ticket_purchase: true,
    });
  });
});

function settingsToml({
  useDelayRetrieval = true,
  useClaimRequests = false,
  useTicketPurchase = false,
} = {}) {
  return [
    `use_delay_retrieval = ${useDelayRetrieval}`,
    `use_claim_requests = ${useClaimRequests}`,
    `use_ticket_purchase = ${useTicketPurchase}`,
    "",
    'ID_USR = "01"',
    'ID_CLM = "01"',
    'ID_BUY = "01"',
    'ID_PYM = "01"',
    'purchase_mode = "review"',
    'path_usr = "../dbhopper-private/credentials"',
    'path_clm = "../dbhopper-private/claims"',
    'path_buy = "../dbhopper-private/profiles"',
    'path_pym = "../dbhopper-private/credentials"',
    'path_prc = "../dbhopper-private/purchases"',
    'delay_provider = "bahn-web"',
    'delay_fallback = "none"',
    "",
  ].join("\n");
}

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  buildDBhopperApprovalDescription,
  createDBhopperTools,
  OPTIONAL_TOOL_NAMES,
  resolveApprovalToolNames,
  SIDE_EFFECT_TOOL_NAMES,
} from "../dist/tools.js";

describe("dbhopper tools", () => {
  it("registers optional tools and mutating approval groups", () => {
    const tools = createDBhopperTools();
    assert.equal(tools.length, 6);
    assert.deepEqual(
      tools.map((tool) => tool.name),
      [
        "dbhopper_claim_schema",
        "dbhopper_list_claims",
        "dbhopper_prepare_claim",
        "dbhopper_validate_claim",
        "dbhopper_browser_probe",
        "dbhopper_run_claim",
      ],
    );
    assert.equal(OPTIONAL_TOOL_NAMES.has("dbhopper_run_claim"), true);
    assert.equal(SIDE_EFFECT_TOOL_NAMES.has("dbhopper_validate_claim"), false);
    assert.equal(SIDE_EFFECT_TOOL_NAMES.has("dbhopper_browser_probe"), false);
    assert.equal(SIDE_EFFECT_TOOL_NAMES.has("dbhopper_prepare_claim"), true);
    assert.equal(SIDE_EFFECT_TOOL_NAMES.has("dbhopper_run_claim"), true);
    assert.deepEqual(
      [...resolveApprovalToolNames({ approvalMode: "mutating" })],
      [...SIDE_EFFECT_TOOL_NAMES],
    );
    assert.deepEqual([...resolveApprovalToolNames({ approvalMode: "none" })], []);
  });

  it("redacts email in approval descriptions", () => {
    const description = buildDBhopperApprovalDescription({
      toolName: "dbhopper_run_claim",
      params: {
        claimId: "test-claim",
        mode: "submit",
        confirmSubmit: true,
        claim: {
          claimant: { email: "maria.mustermann@example.org" },
          journey: {
            date: "2026-06-06",
            startStation: "Koeln Hbf",
            endStation: "Duesseldorf Hbf",
          },
        },
      },
    });

    assert.match(description, /Claim: test-claim/);
    assert.match(description, /Mode: submit/);
    assert.match(description, /Email: ma\*\*\*@example.org/);
    assert.doesNotMatch(description, /mustermann/);
  });
});

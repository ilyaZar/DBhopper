import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  buildDBhopperApprovalDescription,
  createDBhopperTools,
  registerClaimApprovalHook,
  requiresMandatoryHumanApproval,
  resolveApprovalToolNames,
} from "../dist/tools.js";
import {
  configWithPrivateSettings,
  defaultExternalPrivateRoot,
  writePrivateSettingsFixture,
} from "./helpers/private-settings.js";

describe("dbhopper tools", () => {
  it("registers claim tools with no routine approvals by default", () => {
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
    assert.deepEqual([...resolveApprovalToolNames()], []);
    assert.deepEqual(
      [...resolveApprovalToolNames({ approvalMode: "mutating" })],
      [
        "dbhopper_prepare_claim",
        "dbhopper_run_claim",
        "dbhopper_private_settings_configure",
      ],
    );
    assert.equal(
      resolveApprovalToolNames({ approvalMode: "mutating" }).has("dbhopper_validate_claim"),
      false,
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

  it("always requires human approval at submission boundaries", () => {
    assert.equal(
      requiresMandatoryHumanApproval({
        toolName: "dbhopper_run_claim",
        params: { mode: "submit", confirmSubmit: true },
      }),
      true,
    );
    assert.equal(
      requiresMandatoryHumanApproval({
        toolName: "dbhopper_run_claim",
        params: { mode: "dry_run", confirmSubmit: true },
      }),
      false,
    );
  });

  it("keeps a critical one-time gate when routine approval is off", () => {
    let hook;
    registerClaimApprovalHook(
      {
        pluginConfig: { approvalMode: "none" },
        on(_eventName, handler) {
          hook = handler;
        },
      },
      () => ({
        use_delay_retrieval: true,
        use_claim_requests: true,
        use_ticket_purchase: false,
      }),
    );

    const approval = hook({
      toolName: "dbhopper_run_claim",
      params: { claimId: "02", mode: "submit", confirmSubmit: true },
    }).requireApproval;
    assert.equal(approval.severity, "critical");
    assert.deepEqual(approval.allowedDecisions, ["allow-once", "deny"]);
    assert.equal(
      hook({
        toolName: "dbhopper_run_claim",
        params: { claimId: "02", mode: "dry_run" },
      }),
      undefined,
    );
  });

  it("refuses submit mode when the claim already has submission proof", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "dbhopper-repeat-submit-"));
    await writePrivateSettingsFixture(root, {
      claimRequestMode: "auto",
      useClaimRequests: true,
    });
    const claimDir = path.join(
      defaultExternalPrivateRoot(root),
      "profiles",
      "claim-02",
    );
    await fs.mkdir(claimDir, { recursive: true });
    await fs.writeFile(
      path.join(claimDir, "claim.toml"),
      [
        'ID_CLM = "02"',
        "",
        "[journey]",
        'start_station = "Koeln Hbf"',
        'end_station = "Essen Hbf"',
        "",
      ].join("\n"),
      "utf8",
    );
    const proofPath = path.join(claimDir, "submission-confirmation.pdf");
    await fs.writeFile(proofPath, "proof", "utf8");

    const runClaim = createDBhopperTools(
      configWithPrivateSettings(root),
    ).find((tool) => tool.name === "dbhopper_run_claim");
    assert.ok(runClaim);

    const response = await runClaim.execute("call-id", {
      confirm: true,
      claimId: "claim-02",
      mode: "submit",
      confirmSubmit: true,
    });
    const result = JSON.parse(response.content[0].text);

    assert.equal(result.ok, false);
    assert.equal(result.existingSubmissionProof, proofPath);
    assert.match(result.message, /refusing duplicate claim submission/);
  });
});

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  createPrivateSettingsToolDefinitions,
} from "../dist/private-settings-tools.js";

describe("dbhopper private settings tools", () => {
  it("accepts only canonical profile selection parameters", () => {
    const definitions = createPrivateSettingsToolDefinitions(
      (definition) => definition,
    );
    const selectTool = definitions.find(
      (definition) => definition.name === "dbhopper_private_settings_select",
    );

    assert.ok(selectTool);
    assert.equal(selectTool.parameters.additionalProperties, false);
    assert.equal("claim_profile_id" in selectTool.parameters.properties, true);
    assert.equal("profile_id" in selectTool.parameters.properties, false);
    assert.equal("purchase_mode" in selectTool.parameters.properties, true);
  });
});

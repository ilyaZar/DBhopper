import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  isTimetablesCredentialError,
  selectDelayProvider,
  shouldFallbackToBahnWeb,
} from "../dist/db-delay-tools.js";

describe("db delay provider selection", () => {
  it("selects Timetables for auto when credentials exist", () => {
    const selected = selectDelayProvider("auto", {}, true);

    assert.equal(selected.selected, "db-timetables");
    assert.equal(selected.requested, "auto");
  });

  it("falls back from auto Timetables on credential errors only", () => {
    const selected = selectDelayProvider("auto", {}, true);

    assert.equal(
      shouldFallbackToBahnWeb(
        "auto",
        selected,
        new Error("DB Timetables request failed with HTTP 401"),
      ),
      true,
    );
    assert.equal(
      shouldFallbackToBahnWeb(
        "db-timetables",
        { ...selected, requested: "db-timetables" },
        new Error("DB Timetables request failed with HTTP 401"),
      ),
      false,
    );
    assert.equal(
      shouldFallbackToBahnWeb("auto", selected, new Error("HTTP 500")),
      false,
    );
    assert.equal(isTimetablesCredentialError(new Error("Invalid client id or secret")), true);
  });
});

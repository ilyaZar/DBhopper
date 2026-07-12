import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  normalizeIbanForBrowser,
  normalizePhoneForBrowser,
  stationAutocompleteCandidates,
} from "../dist/browser.js";

describe("dbhopper browser claim fields", () => {
  it("normalizes grouped phone and iban values for browser fill", () => {
    assert.equal(normalizePhoneForBrowser("+49 221 123 45 67"), "+492211234567");
    assert.equal(
      normalizeIbanForBrowser("de00 0000 0000 0000 0000 00"),
      "DE00000000000000000000",
    );
  });

  it("uses complete station suffixes so capped dropdowns include the intended station", () => {
    assert.deepEqual(
      stationAutocompleteCandidates("Duisburg HBF"),
      ["Duisburg", "Duisburg Hbf", "Duisburg Bf"],
    );
    assert.deepEqual(
      stationAutocompleteCandidates("Duisburg HBF", "hbf_only"),
      ["Duisburg", "Duisburg Hbf"],
    );
    assert.deepEqual(
      stationAutocompleteCandidates("Duisburg HBF", "bf_only"),
      ["Duisburg", "Duisburg Bf"],
    );
    assert.deepEqual(
      stationAutocompleteCandidates("Koeln Messe Deutz Bf", "bf_only"),
      ["Koeln Messe Deutz", "Koeln Messe Deutz Bf"],
    );
  });
});

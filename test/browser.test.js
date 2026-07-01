import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  normalizeIbanForBrowser,
  normalizePhoneForBrowser,
  scoreStationOption,
} from "../dist/browser.js";

describe("dbhopper browser claim fields", () => {
  it("normalizes grouped phone and iban values for browser fill", () => {
    assert.equal(normalizePhoneForBrowser("+49 221 123 45 67"), "+492211234567");
    assert.equal(
      normalizeIbanForBrowser("de00 0000 0000 0000 0000 00"),
      "DE00000000000000000000",
    );
  });

  it("scores reordered and case-varied hbf station options", () => {
    const plainDuisburg = scoreStationOption(
      "Duisburg HBF",
      "Duisburg Hbf, Duisburg",
    );
    const eastEntrance = scoreStationOption(
      "Duisburg HBF",
      "Duisburg Hbf (Osteingang), Duisburg",
    );

    assert.ok(plainDuisburg > eastEntrance);
    assert.ok(
      scoreStationOption(
        "Duisburg Hbf Osteingang",
        "Duisburg Hbf (Osteingang), Duisburg",
      ) >= 2,
    );
    assert.ok(
      scoreStationOption(
        "Hbf Duisburg",
        "Duisburg Hbf (Osteingang), Duisburg",
      ) > 1,
    );
    assert.ok(
      scoreStationOption(
        "Koeln Messe Deutz",
        "Köln Messe/Deutz Bf, Köln",
      ) > 1,
    );
  });
});

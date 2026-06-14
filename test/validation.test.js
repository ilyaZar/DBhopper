import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { validateClaim } from "../dist/validation.js";

function validClaim() {
  return {
    claimant: {
      firstName: "Maria",
      lastName: "Mustermann",
      email: "maria@example.org",
      phone: "+4922112345678",
      address: {
        streetNumber: "Musterstrasse 1",
        zip: "50667",
        city: "Koeln",
        country: "Deutschland",
      },
      bank: {
        accountOwner: "Maria Mustermann",
        iban: "fill-iban",
      },
    },
    journey: {
      date: "2026-06-06",
      scheduledDepartureTime: "09:07",
      startStation: "Koeln Hbf",
      endStation: "Duesseldorf Hbf",
      plannedLine: "RE6",
      delayMinutes: 25,
      disruptionType: "delay",
      replacementStartedAt: "09:35",
      usedDelayedVehicle: false,
      usedIdenticalLocalAlternative: false,
      excludedReasons: [],
    },
    ticket: {
      baseTicketName: "Deutschlandticket",
      baseTicketCategory: "Ticket im Abo",
      tariffArea: "NRW-Tarif",
      substituteType: "long_distance",
      substituteCost: 12.5,
    },
    files: [
      { role: "base_ticket", path: "ticket.pdf" },
      { role: "substitute_receipt", path: "ice.pdf" },
      { role: "delay_evidence", path: "delay.png" },
    ],
  };
}

describe("dbhopper validation", () => {
  it("accepts a complete eligible claim", () => {
    const result = validateClaim(validClaim(), {
      now: new Date("2026-06-08T12:00:00Z"),
    });

    assert.equal(result.ok, true);
    assert.equal(result.readyForBrowser, true);
    assert.equal(result.readyForSubmit, true);
    assert.deepEqual(result.messages, []);
  });

  it("rejects short delays and claims older than 14 days", () => {
    const claim = validClaim();
    claim.journey.delayMinutes = 19;
    const result = validateClaim(claim, {
      now: new Date("2026-06-30T12:00:00Z"),
    });

    assert.equal(result.ok, false);
    assert.equal(result.readyForBrowser, false);
    assert.ok(result.messages.some((message) => message.code === "delay_too_short"));
    assert.ok(result.messages.some((message) => message.code === "claim_too_old"));
  });

  it("rejects excluded circumstances", () => {
    const claim = validClaim();
    claim.journey.excludedReasons = ["strike"];
    claim.journey.usedDelayedVehicle = true;

    const result = validateClaim(claim, {
      now: new Date("2026-06-08T12:00:00Z"),
    });

    assert.equal(result.ok, false);
    assert.ok(result.messages.some((message) => message.code === "excluded_reason"));
    assert.ok(result.messages.some((message) => message.code === "used_delayed_vehicle"));
  });
});

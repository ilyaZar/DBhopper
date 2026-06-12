import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  defaultCheckoutServiceDate,
  isFinalOrderText,
  runTicketBuyingDryRun,
  runTicketCheckoutDryRun,
  ticketCheckoutPlan,
  ticketBuyingPlan,
} from "../dist/ticket-buying.js";

describe("dbhopper ticket buying dry run", () => {
  it("builds a non-purchase plan", () => {
    const plan = ticketBuyingPlan(
      {
        departure_station: "Hamm(Westf)Hbf",
        arrival_station: "Koeln Hbf",
        service_date: "2026-05-25",
        departure_time: "19:00",
        train_label: "ICE 123",
      },
      "tmp/browser/db-ticket-buying",
    );

    assert.equal(plan.target.departureStation, "Hamm(Westf)Hbf");
    assert.equal(plan.target.arrivalStation, "Köln Hbf");
    assert.equal(plan.maySubmitPayment, false);
    assert.equal(plan.currentStop, "search_results");
    assert.equal(plan.browser.canUsePersistentProfile, true);
    assert.equal(plan.accountLogin.loginBeforeSearch, false);
    assert.equal(plan.accountLogin.stayLoggedIn, true);
  });

  it("returns a deterministic plan without opening a browser", async () => {
    const result = await runTicketBuyingDryRun(
      {
        departure_station: "Hamm(Westf)Hbf",
        arrival_station: "Koeln Hbf",
        open_browser: false,
      },
      {},
    );

    assert.equal(result.ok, true);
    assert.equal(result.testing, true);
    assert.equal(result.stage, "planned");
    assert.equal(result.purchaseSubmitted, false);
    assert.equal(result.credentials.configured, false);
    assert.equal(result.plan.browser.canUsePersistentProfile, false);
    assert.doesNotMatch(JSON.stringify(result), /account-secret|maria@example/);
  });

  it("builds a checkout plan with a one-week default date and hard stop flags", () => {
    const plan = ticketCheckoutPlan(
      {},
      "tmp/browser/db-ticket-buying",
      new Date("2026-06-11T12:00:00.000Z"),
    );

    assert.equal(plan.target.departureStation, "Hamm(Westf)Hbf");
    assert.equal(plan.target.arrivalStation, "Köln Hbf");
    assert.equal(plan.target.serviceDate, "2026-06-18");
    assert.equal(plan.safety.mayEnterPaymentData, false);
    assert.equal(plan.safety.maySubmitPayment, false);
    assert.equal(plan.safety.mayClickFinalOrder, false);
    assert.equal(defaultCheckoutServiceDate(new Date("2026-06-11T12:00:00.000Z")), "2026-06-18");
  });

  it("returns a checkout plan without opening a browser", async () => {
    const result = await runTicketCheckoutDryRun(
      {
        open_browser: false,
      },
      {},
    );

    assert.equal(result.ok, true);
    assert.equal(result.operation, "ticket_checkout_dry_run");
    assert.equal(result.purchaseSubmitted, false);
    assert.equal(result.finalSafetyStop, "not_started");
  });

  it("recognizes final order button text", () => {
    assert.equal(isFinalOrderText("Jetzt kaufen"), true);
    assert.equal(isFinalOrderText("Zahlungspflichtig bestellen"), true);
    assert.equal(isFinalOrderText("Buy now"), true);
    assert.equal(isFinalOrderText("Continue"), false);
    assert.equal(isFinalOrderText("Book"), false);
  });
});

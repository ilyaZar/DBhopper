import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  createTicketBuyingToolDefinitions,
  defaultCheckoutServiceDate,
  isFinalOrderText,
  runTicketBuyingDryRun,
  runTicketCheckoutDryRun,
  ticketCheckoutPlan,
  ticketBuyingPlan,
} from "../dist/ticket-buying.js";
import {
  TICKET_BUYING_DRY_RUN_TOOL_NAME,
  TICKET_CHECKOUT_DRY_RUN_TOOL_NAME,
} from "../dist/tool-contracts.js";

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
      "../dbhopper-private/browser/db-ticket-buying",
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
      "../dbhopper-private/browser/db-ticket-buying",
      new Date("2026-06-11T12:00:00.000Z"),
    );

    assert.equal(plan.target.departureStation, "Hamm(Westf)Hbf");
    assert.equal(plan.target.arrivalStation, "Köln Hbf");
    assert.equal(plan.target.serviceDate, "2026-06-18");
    assert.equal(plan.fareSelection.defaultFare, "super_sparpreis");
    assert.deepEqual(plan.fareSelection.preferenceOrder, [
      "super_sparpreis",
      "sparpreis",
      "flexpreis",
    ]);
    assert.equal(plan.fareSelection.travelClass, "second");
    assert.equal(plan.fareSelection.continueToCustomerData, true);
    assert.equal(plan.fareSelection.bookingFor, "self");
    assert.equal(plan.fareSelection.continueToPaymentBoundary, true);
    assert.equal(plan.purchaseMode, "review");
    assert.equal(plan.finalBuying.requested, false);
    assert.equal(plan.finalBuying.enabled, false);
    assert.equal(plan.safety.mayEnterPaymentProfileData, true);
    assert.equal(plan.safety.mayReviewCheckPage, true);
    assert.equal(plan.safety.maySubmitPayment, false);
    assert.equal(plan.safety.mayClickFinalOrder, false);
    assert.equal(defaultCheckoutServiceDate(new Date("2026-06-11T12:00:00.000Z")), "2026-06-18");
  });

  it("marks auto mode as requested but not buying-enabled", () => {
    const plan = ticketCheckoutPlan(
      { continue_after_payment_profile: true },
      undefined,
      new Date("2026-06-11T12:00:00.000Z"),
      undefined,
      "auto",
    );

    assert.equal(plan.purchaseMode, "auto");
    assert.equal(plan.finalBuying.requested, true);
    assert.equal(plan.finalBuying.enabled, false);
    assert.equal(plan.safety.mayClickFinalOrder, false);
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
    assert.equal(result.purchaseMode, "review");
  });

  it("keeps purchase test-run artifacts controlled by settings", () => {
    const definitions = createTicketBuyingToolDefinitions((definition) => definition);
    for (const toolName of [
      TICKET_BUYING_DRY_RUN_TOOL_NAME,
      TICKET_CHECKOUT_DRY_RUN_TOOL_NAME,
    ]) {
      const definition = definitions.find((tool) => tool.name === toolName);

      assert.ok(definition);
      assert.equal(definition.parameters.additionalProperties, false);
      assert.equal("test_run_purchase" in definition.parameters.properties, false);
      assert.equal("test_drive_purchase" in definition.parameters.properties, false);
      assert.equal("test-drive-purchase" in definition.parameters.properties, false);
    }
  });

  it("recognizes final order button text", () => {
    assert.equal(isFinalOrderText("Jetzt kaufen"), true);
    assert.equal(isFinalOrderText("Zahlungspflichtig bestellen"), true);
    assert.equal(isFinalOrderText("Buy now"), true);
    assert.equal(isFinalOrderText("Continue"), false);
    assert.equal(isFinalOrderText("Book"), false);
  });
});

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  buyingProfileSummary,
  parseBuyingProfileToml,
  resolveBuyingFarePreference,
} from "../dist/buying-profile.js";

describe("dbhopper buying profiles", () => {
  it("normalizes the selected fare product and fallback order", () => {
    const profile = parseBuyingProfileToml(
      [
        "version = 1",
        'id_buy = "01"',
        'default_fare = "Super Sparpreis"',
        'fallback_fares = ["Sparpreis", "Flexpreis"]',
        'travel_class = "2. Klasse"',
        "continue_to_customer_data = true",
        'booking_for = "book for me"',
        "continue_to_payment_boundary = true",
        "",
      ].join("\n"),
    );
    const preference = resolveBuyingFarePreference(profile);

    assert.equal(profile.defaultFare, "super_sparpreis");
    assert.deepEqual(preference.preferenceOrder, [
      "super_sparpreis",
      "sparpreis",
      "flexpreis",
    ]);
    assert.equal(preference.travelClass, "second");
    assert.equal(preference.continueToCustomerData, true);
    assert.equal(preference.bookingFor, "self");
    assert.equal(preference.continueToPaymentBoundary, true);
  });

  it("keeps old camelCase buying-profile aliases compatible", () => {
    const profile = parseBuyingProfileToml(
      [
        "version = 1",
        'ID_BUY = "01"',
        'defaultFare = "Super Sparpreis"',
        'fallbackFares = ["Sparpreis"]',
        'travelClass = "2. Klasse"',
        "",
      ].join("\n"),
    );

    assert.equal(profile.ID_BUY, "01");
    assert.equal(profile.defaultFare, "super_sparpreis");
    assert.deepEqual(profile.fallbackFares, ["sparpreis"]);
    assert.equal(profile.travelClass, "second");
  });

  it("rejects conflicting buying-profile aliases", () => {
    assert.throws(
      () =>
        parseBuyingProfileToml(
          [
            "version = 1",
            'id_buy = "01"',
            'default_fare = "super_sparpreis"',
            'defaultFare = "sparpreis"',
            "",
          ].join("\n"),
        ),
      /aliases must not disagree/,
    );
  });

  it("uses super sparpreis as the default when no profile is loaded", () => {
    const summary = buyingProfileSummary(undefined);

    assert.equal(summary.configured, false);
    assert.equal(summary.farePreference.defaultFare, "super_sparpreis");
    assert.deepEqual(summary.farePreference.fallbackFares, [
      "sparpreis",
      "flexpreis",
    ]);
    assert.equal(summary.farePreference.continueToCustomerData, true);
    assert.equal(summary.farePreference.bookingFor, "self");
    assert.equal(summary.farePreference.continueToPaymentBoundary, true);
  });

  it("accepts cheapest available as an explicit fare preference", () => {
    const profile = parseBuyingProfileToml(
      [
        "version = 1",
        'id_buy = "01"',
        'default_fare = "cheapest available"',
        'fallback_fares = ["Super Saver Fare", "Saver Fare", "Flex Fare"]',
        "",
      ].join("\n"),
    );
    const preference = resolveBuyingFarePreference(profile);

    assert.equal(profile.defaultFare, "cheapest_available");
    assert.deepEqual(preference.preferenceOrder, [
      "cheapest_available",
      "super_sparpreis",
      "sparpreis",
      "flexpreis",
    ]);
  });

  it("rejects unknown fare names", () => {
    assert.throws(
      () =>
        parseBuyingProfileToml(
          [
            "version = 1",
            'id_buy = "01"',
            'default_fare = "cheap_anything"',
            "",
          ].join("\n"),
        ),
      /defaultFare must be one of/,
    );
  });
});

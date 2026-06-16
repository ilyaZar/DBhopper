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
        'ID_BUY = "01"',
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

  it("rejects unsupported buying-profile keys", () => {
    assert.throws(
      () =>
        parseBuyingProfileToml(
          [
            'id_buy = "01"',
            'default_fare = "Super Sparpreis"',
            "",
          ].join("\n"),
        ),
      /id_buy is not a supported field/,
    );
    assert.throws(
      () =>
        parseBuyingProfileToml(
          [
            'ID_BUY = "01"',
            'defaultFare = "sparpreis"',
            "",
          ].join("\n"),
        ),
      /use default_fare/,
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
        'ID_BUY = "01"',
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
            'ID_BUY = "01"',
            'default_fare = "cheap_anything"',
            "",
          ].join("\n"),
        ),
      /defaultFare must be one of/,
    );
  });

  it("rejects unsupported passenger booking modes", () => {
    assert.throws(
      () =>
        parseBuyingProfileToml(
          [
            'ID_BUY = "01"',
            'default_fare = "super_sparpreis"',
            'booking_for = "other"',
            "",
          ].join("\n"),
        ),
      /bookingFor must be one of: self/,
    );
  });
});

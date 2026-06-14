import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  formatPaymentBirthdateForDbUi,
  normalizePaymentBirthdate,
  parsePaymentProfileToml,
  paymentProfileSummary,
} from "../dist/payment-profile.js";

describe("dbhopper payment profiles", () => {
  it("normalizes sepa payment profiles and redacts summaries", () => {
    const profile = parsePaymentProfileToml(
      [
        "version = 1",
        'ID_PYM = "01"',
        'method = "sepa"',
        "",
        "[payment.sepa]",
        'accountOwner = " Maria Example "',
        'iban = "de00 0000 0000 0000 0000 00"',
        'birthdate = "1962-09-02"',
        "mandateAccepted = true",
        "saveAsPreferred = false",
        "",
        "[payment.sepa.address]",
        'streetNumber = " Example Str. 42 "',
        'additionalInfo = " Floor 2 "',
        'zip = "48151"',
        'city = "Münster"',
        'country = "Germany"',
        "",
      ].join("\n"),
    );

    assert.equal(profile.ID_PYM, "01");
    assert.equal(profile.method, "sepa");
    assert.equal(profile.payment.sepa.accountOwner, "Maria Example");
    assert.equal(profile.payment.sepa.iban, "DE00000000000000000000");
    assert.equal(profile.payment.sepa.birthdate, "1962-09-02");
    assert.equal(profile.payment.sepa.address.streetNumber, "Example Str. 42");
    assert.equal(profile.payment.sepa.address.additionalInfo, "Floor 2");

    const summary = paymentProfileSummary({
      paymentProfileName: "payment-profile-01.toml",
      paymentProfilePath: "/private/payment-profile-01.toml",
      paymentProfileId: "01",
      paymentProfile: profile,
    });

    assert.equal(summary.configured, true);
    assert.equal(summary.method, "sepa");
    assert.equal(summary.hasSepaAccountOwner, true);
    assert.equal(summary.hasSepaIban, true);
    assert.equal(summary.hasSepaBirthdate, true);
    assert.equal(summary.hasSepaAddress, true);
    assert.equal(summary.hasSepaAddressStreetNumber, true);
    assert.equal(summary.hasSepaAddressAdditionalInfo, true);
    assert.equal(summary.hasSepaAddressZip, true);
    assert.equal(summary.hasSepaAddressCity, true);
    assert.equal(summary.hasSepaAddressCountry, true);
    assert.equal(summary.sepaMandateAccepted, true);
    assert.doesNotMatch(JSON.stringify(summary), /Maria|DE00|48151|1962/);
  });

  it("accepts birthday alias and DB UI birthdate format", () => {
    const profile = parsePaymentProfileToml(
      [
        "version = 1",
        'ID_PYM = "01"',
        'method = "sepa"',
        "",
        "[payment.sepa]",
        'accountOwner = "Maria Example"',
        'iban = "DE00000000000000000000"',
        'birthday = "02/09/1962"',
        'streetNhouseNum = "Example Str. 42"',
        'otherAdress = "Floor 2"',
        'otherAddressInfo = ""',
        'zip = "48151"',
        'city = "Muenster"',
        'country = "Germany"',
        "",
      ].join("\n"),
    );

    assert.equal(profile.payment.sepa.birthdate, "1962-09-02");
    assert.equal(profile.payment.sepa.address.streetNumber, "Example Str. 42");
    assert.equal(profile.payment.sepa.address.additionalInfo, "Floor 2");
    assert.equal(profile.payment.sepa.address.zip, "48151");
    assert.equal(normalizePaymentBirthdate("02/09/1962"), "1962-09-02");
    assert.equal(formatPaymentBirthdateForDbUi("1962-09-02"), "02/09/1962");
  });

  it("accepts card profiles without CVC", () => {
    const profile = parsePaymentProfileToml(
      [
        "version = 1",
        'ID_PYM = "02"',
        'method = "credit_card"',
        "",
        "[payment.card]",
        'cardholderName = "Card User"',
        'cardNumber = "4111 1111 1111 1111"',
        'expiryMonth = "12"',
        'expiryYear = "2030"',
        "",
      ].join("\n"),
    );

    const summary = paymentProfileSummary({
      paymentProfileName: "payment-profile-02.toml",
      paymentProfilePath: "/private/payment-profile-02.toml",
      paymentProfileId: "02",
      paymentProfile: profile,
    });

    assert.equal(profile.payment.card.cardNumber, "4111111111111111");
    assert.equal(summary.hasCardNumber, true);
    assert.equal(summary.hasCardExpiry, true);
    assert.equal(summary.hasCvc, false);
    assert.doesNotMatch(JSON.stringify(summary), /4111|Card User/);
  });

  it("rejects CVC-like fields", () => {
    assert.throws(
      () =>
        parsePaymentProfileToml(
          [
            "version = 1",
            'ID_PYM = "02"',
            'method = "credit_card"',
            "",
            "[payment.card]",
            'cardholderName = "Card User"',
            'cardNumber = "4111111111111111"',
            'cvc = "123"',
            "",
          ].join("\n"),
        ),
      /do not store CVC\/CVV\/PIN/,
    );
  });

  it("rejects mismatched birthdate aliases", () => {
    assert.throws(
      () =>
        parsePaymentProfileToml(
          [
            "version = 1",
            'ID_PYM = "01"',
            'method = "sepa"',
            "",
            "[payment.sepa]",
            'accountOwner = "Maria Example"',
            'iban = "DE00000000000000000000"',
            'birthdate = "1962-09-02"',
            'birthday = "03/09/1962"',
            "",
          ].join("\n"),
        ),
      /birthdate and birthday must match/,
    );
  });
});

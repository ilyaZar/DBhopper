import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  classifyDbPasswordRejectionText,
  classifyDbUsernameRejectionText,
  isStayLoggedInLabel,
} from "../dist/db-login.js";

describe("dbhopper db login helpers", () => {
  it("recognizes stay-logged-in labels in english and german", () => {
    assertClassifications(isStayLoggedInLabel, [
      ["Stay logged in", true],
      ["Stay signed in", true],
      ["Remember me", true],
      ["Angemeldet bleiben", true],
      ["Eingeloggt bleiben", true],
      ["Log in", false],
      ["Privacy policy", false],
    ]);
  });

  it("classifies DB username validation errors", () => {
    assertClassifications(classifyDbUsernameRejectionText, [
      ["Please enter a valid email address.", "invalid_format"],
      ["Bitte geben Sie eine gueltige E-Mail-Adresse ein.", "invalid_format"],
      ["No account was found for this e-mail.", "unknown_username"],
      ["Das Konto wurde nicht gefunden.", "unknown_username"],
      ["Log in or register", undefined],
    ]);
  });

  it("classifies DB password validation errors", () => {
    assertClassifications(classifyDbPasswordRejectionText, [
      ["The password entered is incorrect.", "incorrect_password"],
      ["Das Passwort ist falsch.", "incorrect_password"],
      ["The username or password is incorrect.", "username_password_mismatch"],
      ["Die Anmeldedaten sind falsch.", "username_password_mismatch"],
      ["Log in with passkey", undefined],
    ]);
  });
});

function assertClassifications(classifier, cases) {
  for (const [text, expected] of cases) {
    assert.equal(classifier(text), expected);
  }
}

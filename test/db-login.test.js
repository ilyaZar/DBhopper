import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  classifyDbPasswordRejectionText,
  classifyDbUsernameRejectionText,
  isStayLoggedInLabel,
} from "../dist/db-login.js";

describe("dbhopper db login helpers", () => {
  it("recognizes stay-logged-in labels in english and german", () => {
    assert.equal(isStayLoggedInLabel("Stay logged in"), true);
    assert.equal(isStayLoggedInLabel("Stay signed in"), true);
    assert.equal(isStayLoggedInLabel("Remember me"), true);
    assert.equal(isStayLoggedInLabel("Angemeldet bleiben"), true);
    assert.equal(isStayLoggedInLabel("Eingeloggt bleiben"), true);
    assert.equal(isStayLoggedInLabel("Log in"), false);
    assert.equal(isStayLoggedInLabel("Privacy policy"), false);
  });

  it("classifies DB username validation errors", () => {
    assert.equal(
      classifyDbUsernameRejectionText("Please enter a valid email address."),
      "invalid_format",
    );
    assert.equal(
      classifyDbUsernameRejectionText("Bitte geben Sie eine gueltige E-Mail-Adresse ein."),
      "invalid_format",
    );
    assert.equal(
      classifyDbUsernameRejectionText("No account was found for this e-mail."),
      "unknown_username",
    );
    assert.equal(
      classifyDbUsernameRejectionText("Das Konto wurde nicht gefunden."),
      "unknown_username",
    );
    assert.equal(classifyDbUsernameRejectionText("Log in or register"), undefined);
  });

  it("classifies DB password validation errors", () => {
    assert.equal(
      classifyDbPasswordRejectionText("The password entered is incorrect."),
      "incorrect_password",
    );
    assert.equal(
      classifyDbPasswordRejectionText("Das Passwort ist falsch."),
      "incorrect_password",
    );
    assert.equal(
      classifyDbPasswordRejectionText("The username or password is incorrect."),
      "username_password_mismatch",
    );
    assert.equal(
      classifyDbPasswordRejectionText("Die Anmeldedaten sind falsch."),
      "username_password_mismatch",
    );
    assert.equal(
      classifyDbPasswordRejectionText("Log in with passkey"),
      undefined,
    );
  });
});

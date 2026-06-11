import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { isStayLoggedInLabel } from "../dist/db-login.js";

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
});

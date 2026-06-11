  Do not publish to ClawHub. Do not commit secrets. Do not print usernames,
  passwords, API keys, client secrets, cookies, browser storage, or full
  credential file contents. Treat assets/private/** and tmp/** as local private
  material.

  Context:
  DBhopper is the top-level plugin directory to be published. The plugin name is
  DBhopper and the target GitHub repo is ilyaZar/dbhopper. Credentials and browser
  profiles are selected through assets/private/settings.toml, with PATH_CRED and
  PATH_PRF steering private directories. Helpers must read selected live files via
  settings, not hard-coded paths.

  Current state:
  - DB standard website login has been tested through Chromium.
  - The DB login checkbox is input#rememberMe--checkbox / name=rememberMe.
  - English label: Stay logged in.
  - German label: Angemeldet bleiben.
  - checkStayLoggedInIfPresent exists and should be reused.
  - dbhopper_ticket_buying_dry_run supports login_before_search and
    stay_logged_in, but currently stops at search/results.
  - Official DB Timetables API credentials are loaded and sent as DB-Client-Id and
    DB-Api-Key, but current credentials return HTTP 401 Invalid client id or
    secret.
  - Direct bahn-web retrieval exists but needs to be shaped into the deterministic
    train-delay query path described in TODO.md.

  Global constraints:
  - Keep browser cookies and saved sessions. Do not clear the persistent profile by
    default.
  - However, one-time login diagnostics must not pass merely because an old session
    is already logged in. They must force or request a credential-entry path and
    submit the username/password from the currently selected credentials.
  - If DB prevents credential re-entry without destructive session clearing, return
    a deterministic inconclusive/needs_user_action result instead of treating the
    existing session as success.
  - Existing sessions may remain, but the test must prove the currently selected
    credential file works or report that it could not prove that.
  - All tool outputs must be structured and already cleaned by code. No LLM cleanup
    should be required.

  Workstream 1: one-time login/access onboarding

  Create separate implementation files and tools for one-time access diagnostics.

  1. DB standard website one-time login

  Purpose:
  Verify selected [bahnAccount] credentials, persistent browser profile,
  stay-logged-in behavior, and account switching.

  Requirements:
  - Use selected credentials via settings.toml.
  - Use configured browser.userDataDir.
  - Keep cookies and saved sessions.
  - Do not accept an already-logged-in session as credential proof.
  - Drive the login or reauthentication path so the selected username and password
    are actually used.
  - If another account is already active, use a safe switch-account /
    reauthentication route if available.
  - Check stay-logged-in by default if the checkbox exists.
  - Return sanitized structured output only.
  - Screenshots are opt-in because they can contain account identity.
  - Do not submit purchases, registrations, or account-setting changes.

  2. DB API Marketplace one-time browser access check

  Purpose:
  Verify Marketplace browser access/login and account reachability.

  Credential model:
  - Treat [dbApi] as the DB API Marketplace/API credential area.
  - Verify whether the browser Marketplace account is actually backed by the same
    credential material as the non-browser API credentials.
  - If the current [dbApi] schema is insufficient for browser login, report the
    minimal deterministic schema change needed before using any fallback account
    field.
  - Do not assume [bahnAccount] and [dbApi] are interchangeable unless verified.

  Requirements:
  - Use browser flow safely.
  - Do not create apps, accept legal terms, subscribe to APIs, or change account
    settings unless a later explicit gate is added.
  - If Marketplace redirects to the DB account login, reuse the shared login helper
    and stay-logged-in helper.
  - Keep cookies and saved sessions, but do not count an existing session as proof
    that current credentials are valid.
  - Report whether logged in, whether account/dashboard/product pages are
    reachable, whether selected credentials were actually submitted, and whether
    user action is needed.

  3. Official DB API credential probe

  Purpose:
  Verify [dbApi] clientId/apiKey independently of browser login.

  Requirements:
  - Direct HTTP probe to DB Timetables endpoint.
  - Return status code, DB error message, and sanitized credential presence /
    length signals only.
  - Make clear that Marketplace browser login success does not by itself imply
    API key validity.
  - Preserve the current finding that DB may return HTTP 401 Invalid client id or
    secret even when local fields are populated.

  Workstream 2A: DB standard website ticket checkout dry-run

  Extend the DB website access path into a dedicated ticket-buying dry-run.

  Hard safety boundary:
  - Never buy a ticket.
  - Never click a final legally binding order button such as Buy now, Jetzt
    kaufen, Zahlungspflichtig bestellen, or equivalent.
  - Always include purchaseSubmitted: false and finalSafetyStop in output.

  Implementation:
  - Use deterministic Playwright selectors and helper functions.
  - Select a simple future test journey, defaulting to about one week after the run
    date. If run on 2026-06-11, default to 2026-06-18.
  - Allow route/time overrides.
  - Implement as much of the buying path as safely possible: search, offer
    selection, customer data, checkout/payment-area exploration, and stop before
    the legally binding final order action.
  - Do not enter real payment data unless a later explicit safety design and user
    approval exist.
  - During this workstream, investigate where payment data is requested and what
    the final legally binding action is.
  - Add a final follow-up TODO for safely handling payment-data entry if that is
    needed to reach the last pre-order screen.
  - Record structured steps: login, search, offer selection, customer data page,
    payment boundary, final order boundary, stop reason.
  - Do not depend on LLM interpretation of page text.

  Workstream 2B: train-delay retrieval through direct web/API calls

  Implement the deterministic train-delay retrieval path described in TODO.md.

  Requirements:
  - Preserve two provider paths:
    - official DB Timetables API using DB Marketplace credentials
    - direct web retrieval using bahn.de/int.bahn.de web calls when official API is
      unavailable or returns 401
  - Use non-browser direct HTTP/API calls for quick train-data access where
    possible.
  - Use the DB API Marketplace browser path only for onboarding/testing whether the
    Marketplace account/credentials work in general.
  - Do not scrape via LLM or free-form browser text.
  - Use structured request/response parsing, deterministic normalization, and
    deterministic filtering.
  - Return cleaned candidates directly from code.
  - Keep query semantics:
    - inclusive bounds
    - configurable window_width
    - delay threshold at boarding station
    - direct route match departure station -> arrival station
    - optional force_query_departure_time
    - regional candidates and ICE/IC/EC replacement candidates configurable
  - Add tests for provider selection, 401 fallback behavior, route matching, delay
    filtering, and sanitized outputs.

  Cleanup / refactor:
  - Move duplicated login selectors into shared access helpers.
  - Prune stale TODO/docs that say [bahnAccount] is unused.
  - Keep docs concise and publication-ready, but do not publish.
  - Ensure package file list excludes runtime private data, browser profiles, and
    tmp artifacts.
  - Remove dead or redundant access-path code if the new shared helpers replace it.
  - Avoid overgrown docs; keep onboarding docs procedural and short.
  - Run npm test and package validation before final response.

  Final response should include:
  - Files changed.
  - Which access paths were added.
  - Whether current selected credentials were actually submitted during login
    diagnostics.
  - DB API credential status.
  - Ticket dry-run safety boundary reached.
  - Remaining blockers.
  - Cleanup performed.
  - Test commands and results.
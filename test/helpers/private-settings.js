import fs from "node:fs/promises";
import path from "node:path";

export async function writePrivateSettingsFixture(root, options = {}) {
  const defaultExternalRoot = defaultExternalPrivateRoot(root);
  const {
    userId = "01",
    claimProfileId = "01",
    buyingProfileId = "01",
    paymentProfileId = "01",
    purchaseMode = "review",
    userCredentialsPath = path.join(defaultExternalRoot, "credentials"),
    claimProfilesPath = path.join(defaultExternalRoot, "profiles"),
    buyingProfilesPath = path.join(defaultExternalRoot, "profiles"),
    paymentProfilesPath = path.join(defaultExternalRoot, "credentials"),
    delayProvider = "bahn-web",
    delayFallback = "none",
    useDelayRetrieval = true,
    useClaimRequests = false,
    useTicketPurchase = false,
  } = options;
  const lines = [
    `use_delay_retrieval = ${useDelayRetrieval}`,
    `use_claim_requests = ${useClaimRequests}`,
    `use_ticket_purchase = ${useTicketPurchase}`,
    "",
    `ID_USR = "${userId}"`,
    `ID_CLM = "${claimProfileId}"`,
    `ID_BUY = "${buyingProfileId}"`,
    `ID_PYM = "${paymentProfileId}"`,
    `purchase_mode = "${purchaseMode}"`,
    `path_usr = "${userCredentialsPath}"`,
    `path_clm = "${claimProfilesPath}"`,
    `path_buy = "${buyingProfilesPath}"`,
    `path_pym = "${paymentProfilesPath}"`,
    `delay_provider = "${delayProvider}"`,
    `delay_fallback = "${delayFallback}"`,
    "",
  ];

  await fs.mkdir(path.join(root, "assets", "private"), { recursive: true });
  await fs.writeFile(
    path.join(root, "assets", "private", "settings.toml"),
    lines.join("\n"),
    "utf8",
  );
}

export async function writeCredentialsFixture(root, options = {}) {
  const {
    id = "01",
    fileName = `credentials-${id}.toml`,
    clientId = "client-secret-value",
    apiKey = "api-secret-value",
    credentialsDir = path.join(defaultExternalPrivateRoot(root), "credentials"),
    extraLines = [],
  } = options;
  const lines = [
    `ID_USR = "${id}"`,
    "",
    "[bahn_api]",
    `client_id = "${clientId}"`,
    `api_key = "${apiKey}"`,
    "",
    ...extraLines,
  ];

  await fs.mkdir(credentialsDir, { recursive: true });
  const credentialsFile = path.join(credentialsDir, fileName);
  await fs.writeFile(credentialsFile, lines.join("\n"), "utf8");
  return { credentialsDir, credentialsFile };
}

export function defaultExternalPrivateRoot(root) {
  return path.join(path.dirname(root), `${path.basename(root)}-private`);
}

export async function writePrivateProfileFixture(dir, id, fileName, firstName) {
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(
    path.join(dir, fileName),
    [
      `ID_CLM = "${id}"`,
      "",
      "[claimant]",
      'salutation = "FAMILY"',
      `first_name = "${firstName}"`,
      'last_name = "Mustermann"',
      'email = "maria@example.org"',
      'phone = "+4922112345678"',
      "",
      "[claimant.address]",
      'street_number = "Musterstrasse 1"',
      'zip = "50667"',
      'city = "Koeln"',
      'country = "Deutschland"',
      "",
      "[claimant.bank]",
      'account_owner = "Maria Mustermann"',
      'iban = "fill-iban"',
      "",
    ].join("\n"),
    "utf8",
  );
}

export async function writePaymentProfileFixture(
  dir,
  id,
  fileName = `payment-profile-${id}.toml`,
) {
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(
    path.join(dir, fileName),
    [
      `ID_PYM = "${id}"`,
      'method = "sepa"',
      "",
      "[payment.sepa]",
      'account_owner = "Account Owner"',
      'iban = "DE00000000000000000000"',
      "mandate_accepted = true",
      "",
    ].join("\n"),
    "utf8",
  );
}

export async function writeBuyingProfileFixture(
  dir,
  id,
  fileName = `buying-profile-${id}.toml`,
) {
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(
    path.join(dir, fileName),
    [
      `ID_BUY = "${id}"`,
      'default_fare = "super_sparpreis"',
      'fallback_fares = ["sparpreis", "flexpreis"]',
      'travel_class = "second"',
      "continue_to_customer_data = true",
      'booking_for = "self"',
      "continue_to_payment_boundary = true",
      "",
    ].join("\n"),
    "utf8",
  );
}

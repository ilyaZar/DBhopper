import fs from "node:fs/promises";
import path from "node:path";

export async function writePrivateSettingsFixture(root, options = {}) {
  const {
    userId = "01",
    claimProfileId = "01",
    buyingProfileId = "01",
    paymentProfileId = "01",
    ticketBuyingMode,
    credentialsPath = "assets/private/credentials",
    profilesPath = "assets/private/profiles",
    delayProvider = "bahn-web",
    delayFallback = "none",
  } = options;
  const lines = [
    `ID_USR = "${userId}"`,
    `ID_CLM = "${claimProfileId}"`,
    `ID_BUY = "${buyingProfileId}"`,
    `ID_PYM = "${paymentProfileId}"`,
  ];

  if (ticketBuyingMode) {
    lines.push(`ticket_buying_mode = "${ticketBuyingMode}"`);
  }

  lines.push(
    `path_cred = "${credentialsPath}"`,
    `path_prf = "${profilesPath}"`,
    `delay_provider = "${delayProvider}"`,
    `delay_fallback = "${delayFallback}"`,
    "",
  );

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
    extraLines = [],
  } = options;
  const credentialsDir = path.join(root, "assets", "private", "credentials");
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

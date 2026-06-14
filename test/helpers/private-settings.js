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
    `id_usr = "${userId}"`,
    `id_clm = "${claimProfileId}"`,
    `id_buy = "${buyingProfileId}"`,
    `id_pym = "${paymentProfileId}"`,
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

export async function writePrivateProfileFixture(dir, id, fileName, firstName) {
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(
    path.join(dir, fileName),
    [
      "version = 1",
      `id_clm = "${id}"`,
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

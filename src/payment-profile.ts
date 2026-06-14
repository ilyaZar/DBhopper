import fs from "node:fs/promises";

import type {
  DBhopperConfig,
  DBhopperPaymentMethod,
  DBhopperPaymentProfile,
  ValidationMessage,
} from "./types.js";
import { resolveSelectedPaymentProfileFile } from "./private-settings.js";
import { parseToml } from "./toml.js";
import { validationErrorFromException } from "./validation-messages.js";

export interface LoadedPaymentProfile {
  paymentProfileName: string;
  paymentProfilePath: string;
  paymentProfileId?: string;
  paymentProfile: DBhopperPaymentProfile;
}

type SepaPaymentProfile = NonNullable<
  NonNullable<DBhopperPaymentProfile["payment"]>["sepa"]
>;
type SepaPaymentAddress = NonNullable<SepaPaymentProfile["address"]> &
  Record<string, string | undefined>;

const PAYMENT_METHODS = new Set(["sepa", "credit_card", "paypal"]);
const FORBIDDEN_PAYMENT_KEYS = [
  /cvc/i,
  /cvv/i,
  /cid/i,
  /security\s*code/i,
  /pin/i,
];

export async function readSelectedPaymentProfile(config: DBhopperConfig = {}) {
  const resolved = await resolveSelectedPaymentProfileFile(config);
  if (!resolved) {
    return undefined;
  }
  const raw = await fs.readFile(resolved.file.filePath, "utf8");
  const paymentProfile = parsePaymentProfileToml(raw, resolved.file.filePath);
  return {
    paymentProfileName: resolved.file.fileName,
    paymentProfilePath: resolved.file.filePath,
    paymentProfileId: resolved.file.id,
    paymentProfile,
  };
}

export function parsePaymentProfileToml(
  text: string,
  source = "payment-profile.toml",
) {
  const parsed = parseToml(text, source);
  assertPaymentProfileShape(parsed, source);
  return normalizePaymentProfile(parsed);
}

export function schemaValidationMessagesForPaymentProfile(
  value: unknown,
  source: string,
): ValidationMessage[] {
  try {
    assertPaymentProfileShape(value, source);
    return [];
  } catch (error) {
    return [validationErrorFromException("invalid_toml_schema", error)];
  }
}

export function paymentProfileSummary(loaded?: LoadedPaymentProfile) {
  if (!loaded) {
    return {
      configured: false,
      paymentProfileName: undefined,
      paymentProfileId: undefined,
      method: undefined,
      hasSepaAccountOwner: false,
      hasSepaIban: false,
      hasSepaBirthdate: false,
      hasSepaAddress: false,
      hasSepaAddressStreetNumber: false,
      hasSepaAddressAdditionalInfo: false,
      hasSepaAddressZip: false,
      hasSepaAddressCity: false,
      hasSepaAddressCountry: false,
      sepaMandateAccepted: false,
      hasCardholderName: false,
      hasCardNumber: false,
      hasCardExpiry: false,
      hasCvc: false,
    };
  }
  const profile = loaded.paymentProfile;
  return {
    configured: true,
    paymentProfileName: loaded.paymentProfileName,
    paymentProfileId: loaded.paymentProfileId,
    method: profile.method,
    hasSepaAccountOwner: Boolean(profile.payment?.sepa?.accountOwner),
    hasSepaIban: Boolean(profile.payment?.sepa?.iban),
    hasSepaBirthdate: Boolean(profile.payment?.sepa?.birthdate),
    hasSepaAddress: Boolean(hasPaymentAddress(profile.payment?.sepa?.address)),
    hasSepaAddressStreetNumber: Boolean(
      profile.payment?.sepa?.address?.streetNumber,
    ),
    hasSepaAddressAdditionalInfo: Boolean(
      profile.payment?.sepa?.address?.additionalInfo,
    ),
    hasSepaAddressZip: Boolean(profile.payment?.sepa?.address?.zip),
    hasSepaAddressCity: Boolean(profile.payment?.sepa?.address?.city),
    hasSepaAddressCountry: Boolean(profile.payment?.sepa?.address?.country),
    sepaMandateAccepted: profile.payment?.sepa?.mandateAccepted === true,
    hasCardholderName: Boolean(profile.payment?.card?.cardholderName),
    hasCardNumber: Boolean(profile.payment?.card?.cardNumber),
    hasCardExpiry: Boolean(
      profile.payment?.card?.expiryMonth && profile.payment?.card?.expiryYear,
    ),
    hasCvc: false,
  };
}

function normalizePaymentProfile(value: DBhopperPaymentProfile) {
  return {
    ...value,
    ID_PYM: value.ID_PYM.trim(),
    method: normalizePaymentMethod(value.method, "method"),
    payment: {
      ...(value.payment?.sepa
        ? {
            sepa: {
              accountOwner: value.payment.sepa.accountOwner?.trim(),
              iban: value.payment.sepa.iban?.replace(/\s+/g, "").toUpperCase(),
              birthdate: normalizeOptionalPaymentBirthdate(
                value.payment.sepa.birthdate ?? value.payment.sepa.birthday,
              ),
              address: normalizePaymentAddress(
                value.payment.sepa.address,
                value.payment.sepa,
              ),
              mandateAccepted: value.payment.sepa.mandateAccepted === true,
              saveAsPreferred: value.payment.sepa.saveAsPreferred === true,
            },
          }
        : {}),
      ...(value.payment?.card
        ? {
            card: {
              cardholderName: value.payment.card.cardholderName?.trim(),
              cardNumber: value.payment.card.cardNumber?.replace(/\s+/g, ""),
              expiryMonth: value.payment.card.expiryMonth?.trim(),
              expiryYear: value.payment.card.expiryYear?.trim(),
              saveAsPreferred: value.payment.card.saveAsPreferred === true,
            },
          }
        : {}),
      ...(value.payment?.paypal
        ? {
            paypal: {
              saveAsPreferred: value.payment.paypal.saveAsPreferred === true,
            },
          }
        : {}),
    },
  };
}

function assertPaymentProfileShape(
  value: unknown,
  source: string,
): asserts value is DBhopperPaymentProfile {
  assertTable(value, source);
  rejectForbiddenPaymentKeys(value, source);
  assertKnownKeys(value, new Set(["ID_PYM", "version", "method", "payment"]), source);
  if (!("ID_PYM" in value)) {
    throw new Error(`${source}.ID_PYM is required`);
  }
  if (!("method" in value)) {
    throw new Error(`${source}.method is required`);
  }
  assertString(value.ID_PYM, `${source}.ID_PYM`);
  if (!/^\d{2,}$/.test(value.ID_PYM)) {
    throw new Error(`${source}.ID_PYM must be a quoted numeric ID like "01"`);
  }
  if ("version" in value && value.version !== 1) {
    throw new Error(`${source}.version must be 1`);
  }
  assertString(value.method, `${source}.method`);
  const method = normalizePaymentMethod(value.method, `${source}.method`);

  if ("payment" in value) {
    assertTable(value.payment, `${source}.payment`);
    const payment = value.payment;
    assertKnownKeys(
      payment,
      new Set(["sepa", "card", "paypal"]),
      `${source}.payment`,
    );
    if ("sepa" in payment) {
      const sepa = payment.sepa;
      assertSection(sepa, `${source}.payment.sepa`, [
        "accountOwner",
        "iban",
        "birthdate",
        "birthday",
        "streetNhouseNum",
        "streetAndHouseNumber",
        "streetNumber",
        "additionalInfo",
        "otherAddress",
        "otherAdress",
        "otherAddressInfo",
        "otherAdressInfo",
        "zip",
        "postcode",
        "postalCode",
        "city",
        "townCity",
        "country",
        "address",
        "mandateAccepted",
        "saveAsPreferred",
      ]);
      if ("accountOwner" in sepa) {
        assertString(sepa.accountOwner, `${source}.payment.sepa.accountOwner`);
      }
      if ("iban" in sepa) {
        assertString(sepa.iban, `${source}.payment.sepa.iban`);
      }
      const birthdate = "birthdate" in sepa ? sepa.birthdate : undefined;
      const birthday = "birthday" in sepa ? sepa.birthday : undefined;
      if (birthdate !== undefined) {
        assertString(birthdate, `${source}.payment.sepa.birthdate`);
        normalizePaymentBirthdate(
          birthdate,
          `${source}.payment.sepa.birthdate`,
        );
      }
      if (birthday !== undefined) {
        assertString(birthday, `${source}.payment.sepa.birthday`);
        normalizePaymentBirthdate(
          birthday,
          `${source}.payment.sepa.birthday`,
        );
      }
      for (const key of [
        "streetNhouseNum",
        "streetAndHouseNumber",
        "streetNumber",
        "additionalInfo",
        "otherAddress",
        "otherAdress",
        "otherAddressInfo",
        "otherAdressInfo",
        "zip",
        "postcode",
        "postalCode",
        "city",
        "townCity",
        "country",
      ]) {
        if (key in sepa) {
          assertOptionalString(sepa[key], `${source}.payment.sepa.${key}`);
        }
      }
      if (birthdate !== undefined && birthday !== undefined) {
        const normalizedBirthdate = normalizePaymentBirthdate(
          birthdate,
          `${source}.payment.sepa.birthdate`,
        );
        const normalizedBirthday = normalizePaymentBirthdate(
          birthday,
          `${source}.payment.sepa.birthday`,
        );
        if (normalizedBirthdate !== normalizedBirthday) {
          throw new Error(
            `${source}.payment.sepa.birthdate and birthday must match`,
          );
        }
      }
      if ("address" in sepa) {
        const address = sepa.address;
        assertSection(address, `${source}.payment.sepa.address`, [
          "streetNumber",
          "streetAndHouseNumber",
          "additionalInfo",
          "otherAddressInfo",
          "zip",
          "postcode",
          "postalCode",
          "city",
          "townCity",
          "country",
        ]);
        for (const key of Object.keys(address)) {
          assertOptionalString(
            address[key],
            `${source}.payment.sepa.address.${key}`,
          );
        }
      }
      assertOptionalBoolean(
        sepa.mandateAccepted,
        `${source}.payment.sepa.mandateAccepted`,
      );
      assertOptionalBoolean(
        sepa.saveAsPreferred,
        `${source}.payment.sepa.saveAsPreferred`,
      );
    }
    if ("card" in payment) {
      const card = payment.card;
      assertSection(card, `${source}.payment.card`, [
        "cardholderName",
        "cardNumber",
        "expiryMonth",
        "expiryYear",
        "saveAsPreferred",
      ]);
      if ("cardholderName" in card) {
        assertString(
          card.cardholderName,
          `${source}.payment.card.cardholderName`,
        );
      }
      if ("cardNumber" in card) {
        assertString(card.cardNumber, `${source}.payment.card.cardNumber`);
      }
      if ("expiryMonth" in card) {
        assertString(card.expiryMonth, `${source}.payment.card.expiryMonth`);
      }
      if ("expiryYear" in card) {
        assertString(card.expiryYear, `${source}.payment.card.expiryYear`);
      }
      assertOptionalBoolean(
        card.saveAsPreferred,
        `${source}.payment.card.saveAsPreferred`,
      );
    }
    if ("paypal" in payment) {
      const paypal = payment.paypal;
      assertSection(paypal, `${source}.payment.paypal`, [
        "saveAsPreferred",
      ]);
      assertOptionalBoolean(
        paypal.saveAsPreferred,
        `${source}.payment.paypal.saveAsPreferred`,
      );
    }
  }

  if (method === "sepa") {
    const sepa = (value as unknown as DBhopperPaymentProfile).payment?.sepa;
    assertString(
      sepa?.accountOwner,
      `${source}.payment.sepa.accountOwner`,
    );
    assertString(sepa?.iban, `${source}.payment.sepa.iban`);
  }
  if (method === "credit_card") {
    const card = (value as unknown as DBhopperPaymentProfile).payment?.card;
    assertString(
      card?.cardholderName,
      `${source}.payment.card.cardholderName`,
    );
    assertString(card?.cardNumber, `${source}.payment.card.cardNumber`);
  }
}

export function normalizePaymentBirthdate(
  value: string,
  source = "payment.sepa.birthdate",
) {
  const trimmed = value.trim();
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  if (iso) {
    return checkedBirthdateParts(iso[1], iso[2], iso[3], source);
  }

  const slash = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(trimmed);
  if (slash) {
    return checkedBirthdateParts(slash[3], slash[2], slash[1], source);
  }

  const dot = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(trimmed);
  if (dot) {
    return checkedBirthdateParts(dot[3], dot[2], dot[1], source);
  }

  throw new Error(`${source} must use YYYY-MM-DD or DD/MM/YYYY`);
}

export function formatPaymentBirthdateForDbUi(value: string) {
  const normalized = normalizePaymentBirthdate(value);
  const [year, month, day] = normalized.split("-");
  return `${day}/${month}/${year}`;
}

function normalizePaymentMethod(value: string, source: string): DBhopperPaymentMethod {
  const normalized = value.trim().toLowerCase().replace(/[-\s]+/g, "_");
  if (!PAYMENT_METHODS.has(normalized)) {
    throw new Error(`${source} must be one of: sepa, credit_card, paypal`);
  }
  return normalized as DBhopperPaymentMethod;
}

function rejectForbiddenPaymentKeys(value: unknown, source: string) {
  const visit = (node: unknown, path: string) => {
    if (!node || typeof node !== "object" || Array.isArray(node)) {
      return;
    }
    for (const [key, child] of Object.entries(node)) {
      const childPath = `${path}.${key}`;
      if (FORBIDDEN_PAYMENT_KEYS.some((pattern) => pattern.test(key))) {
        throw new Error(`${childPath} is not supported; do not store CVC/CVV/PIN`);
      }
      visit(child, childPath);
    }
  };
  visit(value, source);
}

function assertSection(
  value: unknown,
  source: string,
  allowedKeys: string[],
): asserts value is Record<string, unknown> {
  assertTable(value, source);
  assertKnownKeys(value, new Set(allowedKeys), source);
}

function assertKnownKeys(
  value: Record<string, unknown>,
  allowed: Set<string>,
  source: string,
) {
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) {
      throw new Error(`${source}.${key} is not a supported field`);
    }
  }
}

function assertTable(
  value: unknown,
  source: string,
): asserts value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${source} must be a TOML table`);
  }
}

function assertString(value: unknown, source: string): asserts value is string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${source} must be a non-empty string`);
  }
}

function assertOptionalBoolean(value: unknown, source: string) {
  if (value !== undefined && typeof value !== "boolean") {
    throw new Error(`${source} must be a boolean`);
  }
}

function assertOptionalString(value: unknown, source: string): asserts value is string {
  if (value !== undefined && typeof value !== "string") {
    throw new Error(`${source} must be a string`);
  }
}

function normalizeOptionalPaymentBirthdate(value: string | undefined) {
  return value ? normalizePaymentBirthdate(value) : undefined;
}

function normalizePaymentAddress(
  address: SepaPaymentAddress | undefined,
  sepa: SepaPaymentProfile,
) {
  const direct = sepa as Record<string, string | undefined>;
  if (!address && !hasDirectPaymentAddress(direct)) {
    return undefined;
  }
  const keyed = (address ?? {}) as Record<string, string | undefined>;
  return {
    streetNumber: stringOrUndefined(
      keyed.streetNumber ??
        keyed.streetAndHouseNumber ??
        direct.streetNumber ??
        direct.streetAndHouseNumber ??
        direct.streetNhouseNum,
    ),
    additionalInfo: stringOrUndefined(
        keyed.additionalInfo ??
        keyed.otherAddress ??
        keyed.otherAdress ??
        keyed.otherAddressInfo ??
        keyed.otherAdressInfo ??
        direct.additionalInfo ??
        direct.otherAddress ??
        direct.otherAdress ??
        direct.otherAddressInfo ??
        direct.otherAdressInfo,
    ),
    zip: stringOrUndefined(
      keyed.zip ??
        keyed.postcode ??
        keyed.postalCode ??
        direct.zip ??
        direct.postcode ??
        direct.postalCode,
    ),
    city: stringOrUndefined(
      keyed.city ?? keyed.townCity ?? direct.city ?? direct.townCity,
    ),
    country: stringOrUndefined(keyed.country ?? direct.country),
  };
}

function hasPaymentAddress(address: SepaPaymentAddress | undefined) {
  if (!address) {
    return false;
  }
  return Object.values(address).some((value) => Boolean(value));
}

function stringOrUndefined(value: string | undefined) {
  const trimmed = value?.trim();
  return trimmed || undefined;
}

function hasDirectPaymentAddress(value: Record<string, string | undefined>) {
  return [
    "streetNhouseNum",
    "streetAndHouseNumber",
    "streetNumber",
    "additionalInfo",
    "otherAddress",
    "otherAdress",
    "otherAddressInfo",
    "otherAdressInfo",
    "zip",
    "postcode",
    "postalCode",
    "city",
    "townCity",
    "country",
  ].some((key) => Boolean(value[key]));
}

function checkedBirthdateParts(
  year: string,
  month: string,
  day: string,
  source: string,
) {
  const yyyy = Number(year);
  const mm = Number(month);
  const dd = Number(day);
  const date = new Date(Date.UTC(yyyy, mm - 1, dd));
  const valid =
    date.getUTCFullYear() === yyyy &&
    date.getUTCMonth() === mm - 1 &&
    date.getUTCDate() === dd;
  if (!valid) {
    throw new Error(`${source} must be a valid calendar date`);
  }
  return `${year}-${month}-${day}`;
}

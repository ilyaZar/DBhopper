import { resolveSelectedPaymentProfileFile } from "./private-settings.js";
import { readSelectedPrivateToml } from "./private-profile-loader.js";
import { assertKnownKeys, assertNumericIdString, assertSection, assertString, assertTable, } from "./schema-helpers.js";
import { normalizeTomlKeys, parseToml } from "./toml.js";
import { validationErrorFromException } from "./validation-messages.js";
const PAYMENT_METHODS = new Set(["sepa", "credit_card", "paypal"]);
const FORBIDDEN_PAYMENT_KEYS = [
    /cvc/i,
    /cvv/i,
    /cid/i,
    /security\s*code/i,
    /pin/i,
];
const PAYMENT_PROFILE_TOML_ALIASES = {
    "payment.sepa": {
        account_owner: "accountOwner",
        mandate_accepted: "mandateAccepted",
        save_as_preferred: "saveAsPreferred",
    },
    "payment.sepa.address": {
        street_number: "streetNumber",
        additional_info: "additionalInfo",
    },
    "payment.card": {
        cardholder_name: "cardholderName",
        card_number: "cardNumber",
        expiry_month: "expiryMonth",
        expiry_year: "expiryYear",
        save_as_preferred: "saveAsPreferred",
    },
    "payment.paypal": {
        save_as_preferred: "saveAsPreferred",
    },
};
export async function readSelectedPaymentProfile(config = {}) {
    const selected = await readSelectedPrivateToml(config, resolveSelectedPaymentProfileFile, parsePaymentProfileToml);
    if (!selected) {
        return undefined;
    }
    return {
        paymentProfileName: selected.file.fileName,
        paymentProfilePath: selected.file.filePath,
        paymentProfileId: selected.file.id,
        paymentProfile: selected.parsed,
    };
}
export function parsePaymentProfileToml(text, source = "payment-profile.toml") {
    const parsed = normalizeTomlKeys(parseToml(text, source), source, PAYMENT_PROFILE_TOML_ALIASES, true);
    assertPaymentProfileShape(parsed, source);
    return normalizePaymentProfile(parsed);
}
export function schemaValidationMessagesForPaymentProfile(value, source) {
    try {
        assertPaymentProfileShape(normalizeTomlKeys(value, source, PAYMENT_PROFILE_TOML_ALIASES, true), source);
        return [];
    }
    catch (error) {
        return [validationErrorFromException("invalid_toml_schema", error)];
    }
}
export function paymentProfileSummary(loaded) {
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
        hasSepaAddressStreetNumber: Boolean(profile.payment?.sepa?.address?.streetNumber),
        hasSepaAddressAdditionalInfo: Boolean(profile.payment?.sepa?.address?.additionalInfo),
        hasSepaAddressZip: Boolean(profile.payment?.sepa?.address?.zip),
        hasSepaAddressCity: Boolean(profile.payment?.sepa?.address?.city),
        hasSepaAddressCountry: Boolean(profile.payment?.sepa?.address?.country),
        sepaMandateAccepted: profile.payment?.sepa?.mandateAccepted === true,
        hasCardholderName: Boolean(profile.payment?.card?.cardholderName),
        hasCardNumber: Boolean(profile.payment?.card?.cardNumber),
        hasCardExpiry: Boolean(profile.payment?.card?.expiryMonth && profile.payment?.card?.expiryYear),
        hasCvc: false,
    };
}
function normalizePaymentProfile(value) {
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
                        birthdate: normalizeOptionalPaymentBirthdate(value.payment.sepa.birthdate),
                        address: normalizePaymentAddress(value.payment.sepa.address),
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
function assertPaymentProfileShape(value, source) {
    assertTable(value, source);
    rejectForbiddenPaymentKeys(value, source);
    assertKnownKeys(value, new Set(["ID_PYM", "method", "payment"]), source);
    if (!("ID_PYM" in value)) {
        throw new Error(`${source}.ID_PYM is required`);
    }
    if (!("method" in value)) {
        throw new Error(`${source}.method is required`);
    }
    assertNumericIdString(value.ID_PYM, `${source}.ID_PYM`);
    assertString(value.method, `${source}.method`);
    const method = normalizePaymentMethod(value.method, `${source}.method`);
    if ("payment" in value) {
        assertTable(value.payment, `${source}.payment`);
        const payment = value.payment;
        assertKnownKeys(payment, new Set(["sepa", "card", "paypal"]), `${source}.payment`);
        if ("sepa" in payment) {
            const sepa = payment.sepa;
            assertSection(sepa, `${source}.payment.sepa`, [
                "accountOwner",
                "iban",
                "birthdate",
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
            if (birthdate !== undefined) {
                assertString(birthdate, `${source}.payment.sepa.birthdate`);
                normalizePaymentBirthdate(birthdate, `${source}.payment.sepa.birthdate`);
            }
            if ("address" in sepa) {
                const address = sepa.address;
                assertSection(address, `${source}.payment.sepa.address`, [
                    "streetNumber",
                    "additionalInfo",
                    "zip",
                    "city",
                    "country",
                ]);
                for (const key of Object.keys(address)) {
                    assertOptionalString(address[key], `${source}.payment.sepa.address.${key}`);
                }
            }
            assertOptionalBoolean(sepa.mandateAccepted, `${source}.payment.sepa.mandateAccepted`);
            assertOptionalBoolean(sepa.saveAsPreferred, `${source}.payment.sepa.saveAsPreferred`);
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
                assertString(card.cardholderName, `${source}.payment.card.cardholderName`);
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
            assertOptionalBoolean(card.saveAsPreferred, `${source}.payment.card.saveAsPreferred`);
        }
        if ("paypal" in payment) {
            const paypal = payment.paypal;
            assertSection(paypal, `${source}.payment.paypal`, [
                "saveAsPreferred",
            ]);
            assertOptionalBoolean(paypal.saveAsPreferred, `${source}.payment.paypal.saveAsPreferred`);
        }
    }
    if (method === "sepa") {
        const sepa = value.payment?.sepa;
        assertString(sepa?.accountOwner, `${source}.payment.sepa.accountOwner`);
        assertString(sepa?.iban, `${source}.payment.sepa.iban`);
    }
    if (method === "credit_card") {
        const card = value.payment?.card;
        assertString(card?.cardholderName, `${source}.payment.card.cardholderName`);
        assertString(card?.cardNumber, `${source}.payment.card.cardNumber`);
    }
}
export function normalizePaymentBirthdate(value, source = "payment.sepa.birthdate") {
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
export function formatPaymentBirthdateForDbUi(value) {
    const normalized = normalizePaymentBirthdate(value);
    const [year, month, day] = normalized.split("-");
    return `${day}/${month}/${year}`;
}
function normalizePaymentMethod(value, source) {
    const normalized = value.trim().toLowerCase().replace(/[-\s]+/g, "_");
    if (!PAYMENT_METHODS.has(normalized)) {
        throw new Error(`${source} must be one of: sepa, credit_card, paypal`);
    }
    return normalized;
}
function rejectForbiddenPaymentKeys(value, source) {
    const visit = (node, path) => {
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
function assertOptionalBoolean(value, source) {
    if (value !== undefined && typeof value !== "boolean") {
        throw new Error(`${source} must be a boolean`);
    }
}
function assertOptionalString(value, source) {
    if (value !== undefined && typeof value !== "string") {
        throw new Error(`${source} must be a string`);
    }
}
function normalizeOptionalPaymentBirthdate(value) {
    return value ? normalizePaymentBirthdate(value) : undefined;
}
function normalizePaymentAddress(address) {
    if (!address) {
        return undefined;
    }
    const keyed = (address ?? {});
    return {
        streetNumber: stringOrUndefined(keyed.streetNumber),
        additionalInfo: stringOrUndefined(keyed.additionalInfo),
        zip: stringOrUndefined(keyed.zip),
        city: stringOrUndefined(keyed.city),
        country: stringOrUndefined(keyed.country),
    };
}
function hasPaymentAddress(address) {
    if (!address) {
        return false;
    }
    return Object.values(address).some((value) => Boolean(value));
}
function stringOrUndefined(value) {
    const trimmed = value?.trim();
    return trimmed || undefined;
}
function checkedBirthdateParts(year, month, day, source) {
    const yyyy = Number(year);
    const mm = Number(month);
    const dd = Number(day);
    const date = new Date(Date.UTC(yyyy, mm - 1, dd));
    const valid = date.getUTCFullYear() === yyyy &&
        date.getUTCMonth() === mm - 1 &&
        date.getUTCDate() === dd;
    if (!valid) {
        throw new Error(`${source} must be a valid calendar date`);
    }
    return `${year}-${month}-${day}`;
}

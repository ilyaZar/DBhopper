import fs from "node:fs/promises";

import type {
  DBhopperBuyingProfile,
  DBhopperBookingFor,
  DBhopperConfig,
  DBhopperFareProduct,
  DBhopperTravelClass,
  ValidationMessage,
} from "./types.js";
import { resolveSelectedBuyingProfileFile } from "./private-settings.js";
import { normalizeTomlKeys, parseToml, type TomlKeyMapByPath } from "./toml.js";
import { validationErrorFromException } from "./validation-messages.js";

export interface LoadedBuyingProfile {
  buyingProfileName: string;
  buyingProfilePath: string;
  buyingProfileId?: string;
  buyingProfile: DBhopperBuyingProfile;
}

export interface BuyingFarePreference {
  defaultFare: DBhopperFareProduct;
  fallbackFares: DBhopperFareProduct[];
  preferenceOrder: DBhopperFareProduct[];
  travelClass: DBhopperTravelClass;
  continueToCustomerData: boolean;
  bookingFor: DBhopperBookingFor;
  continueToPaymentBoundary: boolean;
}

export const BUYING_FARE_PRODUCT_ORDER = [
  "super_sparpreis",
  "sparpreis",
  "flexpreis",
  "cheapest_available",
] as const;

export const BUYING_FARE_PRODUCT_LABELS: Record<DBhopperFareProduct, string> = {
  super_sparpreis: "Super Sparpreis",
  sparpreis: "Sparpreis",
  flexpreis: "Flexpreis",
  cheapest_available: "Cheapest available offer",
};

export const BUYING_TRAVEL_CLASS_LABELS: Record<DBhopperTravelClass, string> = {
  second: "2. Klasse",
  first: "1. Klasse",
};

const FARE_PRODUCT_ALIASES = new Map<string, DBhopperFareProduct>([
  ["super_sparpreis", "super_sparpreis"],
  ["super-sparpreis", "super_sparpreis"],
  ["super sparpreis", "super_sparpreis"],
  ["super saver fare", "super_sparpreis"],
  ["super saver", "super_sparpreis"],
  ["super saver ticket", "super_sparpreis"],
  ["sparpreis", "sparpreis"],
  ["saver fare", "sparpreis"],
  ["saver", "sparpreis"],
  ["saver ticket", "sparpreis"],
  ["flexpreis", "flexpreis"],
  ["flex price", "flexpreis"],
  ["flex fare", "flexpreis"],
  ["flexible fare", "flexpreis"],
  ["cheapest_available", "cheapest_available"],
  ["cheapest-available", "cheapest_available"],
  ["cheapest available", "cheapest_available"],
  ["cheapest", "cheapest_available"],
  ["any cheapest", "cheapest_available"],
]);

const TRAVEL_CLASS_ALIASES = new Map<string, DBhopperTravelClass>([
  ["second", "second"],
  ["2", "second"],
  ["2nd", "second"],
  ["2. klasse", "second"],
  ["second class", "second"],
  ["first", "first"],
  ["1", "first"],
  ["1st", "first"],
  ["1. klasse", "first"],
  ["first class", "first"],
]);

const BOOKING_FOR_ALIASES = new Map<string, DBhopperBookingFor>([
  ["self", "self"],
  ["me", "self"],
  ["for me", "self"],
  ["book for me", "self"],
  ["other", "other"],
  ["another person", "other"],
  ["book for another person", "other"],
]);
const BUYING_PROFILE_TOML_ALIASES: TomlKeyMapByPath = {
  "": {
    default_fare: "defaultFare",
    fallback_fares: "fallbackFares",
    travel_class: "travelClass",
    continue_to_customer_data: "continueToCustomerData",
    booking_for: "bookingFor",
    continue_to_payment_boundary: "continueToPaymentBoundary",
  },
};

export async function readSelectedBuyingProfile(config: DBhopperConfig = {}) {
  const resolved = await resolveSelectedBuyingProfileFile(config);
  if (!resolved) {
    return undefined;
  }
  const raw = await fs.readFile(resolved.file.filePath, "utf8");
  const buyingProfile = parseBuyingProfileToml(raw, resolved.file.filePath);
  return {
    buyingProfileName: resolved.file.fileName,
    buyingProfilePath: resolved.file.filePath,
    buyingProfileId: resolved.file.id,
    buyingProfile,
  };
}

export function parseBuyingProfileToml(
  text: string,
  source = "buying-profile.toml",
) {
  const parsed = normalizeTomlKeys(
    parseToml(text, source),
    source,
    BUYING_PROFILE_TOML_ALIASES,
    true,
  );
  assertBuyingProfileShape(parsed, source);
  return normalizeBuyingProfile(parsed);
}

export function schemaValidationMessagesForBuyingProfile(
  value: unknown,
  source: string,
): ValidationMessage[] {
  try {
    assertBuyingProfileShape(
      normalizeTomlKeys(value, source, BUYING_PROFILE_TOML_ALIASES, true),
      source,
    );
    return [];
  } catch (error) {
    return [validationErrorFromException("invalid_toml_schema", error)];
  }
}

export function buyingProfileSummary(loaded?: LoadedBuyingProfile) {
  if (!loaded) {
    return {
      configured: false,
      buyingProfileName: undefined,
      buyingProfileId: undefined,
      farePreference: resolveBuyingFarePreference(),
    };
  }
  return {
    configured: true,
    buyingProfileName: loaded.buyingProfileName,
    buyingProfileId: loaded.buyingProfileId,
    farePreference: resolveBuyingFarePreference(loaded.buyingProfile),
  };
}

export function resolveBuyingFarePreference(
  profile?: Partial<DBhopperBuyingProfile>,
): BuyingFarePreference {
  const defaultFare = profile?.defaultFare ?? "super_sparpreis";
  const fallbackFares = profile?.fallbackFares?.length
    ? profile.fallbackFares
    : BUYING_FARE_PRODUCT_ORDER.filter((fare) =>
        fare !== defaultFare && fare !== "cheapest_available",
      );
  const preferenceOrder = uniqueFareOrder([defaultFare, ...fallbackFares]);
  return {
    defaultFare,
    fallbackFares: preferenceOrder.filter((fare) => fare !== defaultFare),
    preferenceOrder,
    travelClass: profile?.travelClass ?? "second",
    continueToCustomerData: profile?.continueToCustomerData !== false,
    bookingFor: profile?.bookingFor ?? "self",
    continueToPaymentBoundary: profile?.continueToPaymentBoundary !== false,
  };
}

export function fareProductLabel(value: DBhopperFareProduct) {
  return BUYING_FARE_PRODUCT_LABELS[value];
}

export function travelClassLabel(value: DBhopperTravelClass) {
  return BUYING_TRAVEL_CLASS_LABELS[value];
}

function normalizeBuyingProfile(value: DBhopperBuyingProfile) {
  const defaultFare = normalizeFareProduct(value.defaultFare, "defaultFare");
  const fallbackFares = (value.fallbackFares ?? [])
    .map((fare, index) => normalizeFareProduct(fare, `fallbackFares[${index}]`));
  return {
    ...value,
    ID_BUY: value.ID_BUY.trim(),
    defaultFare,
    fallbackFares: uniqueFareOrder(fallbackFares.filter((fare) => fare !== defaultFare)),
    travelClass: normalizeTravelClass(value.travelClass ?? "second", "travelClass"),
    continueToCustomerData: value.continueToCustomerData !== false,
    bookingFor: normalizeBookingFor(value.bookingFor ?? "self", "bookingFor"),
    continueToPaymentBoundary: value.continueToPaymentBoundary !== false,
  };
}

function uniqueFareOrder(values: DBhopperFareProduct[]) {
  const seen = new Set<DBhopperFareProduct>();
  const result: DBhopperFareProduct[] = [];
  for (const value of values) {
    if (seen.has(value)) {
      continue;
    }
    seen.add(value);
    result.push(value);
  }
  return result;
}

function assertBuyingProfileShape(
  value: unknown,
  source: string,
): asserts value is DBhopperBuyingProfile {
  assertTable(value, source);
  const allowed = new Set([
    "ID_BUY",
    "defaultFare",
    "fallbackFares",
    "travelClass",
    "continueToCustomerData",
    "bookingFor",
    "continueToPaymentBoundary",
  ]);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) {
      throw new Error(`${source}.${key} is not a supported field`);
    }
  }
  if (!("ID_BUY" in value)) {
    throw new Error(`${source}.ID_BUY is required`);
  }
  if (!("defaultFare" in value)) {
    throw new Error(`${source}.defaultFare is required`);
  }
  assertString(value.ID_BUY, `${source}.ID_BUY`);
  if (!/^\d{2,}$/.test(value.ID_BUY)) {
    throw new Error(`${source}.ID_BUY must be a quoted numeric ID like "01"`);
  }
  assertString(value.defaultFare, `${source}.defaultFare`);
  normalizeFareProduct(value.defaultFare, `${source}.defaultFare`);
  if ("fallbackFares" in value) {
    if (!Array.isArray(value.fallbackFares)) {
      throw new Error(`${source}.fallbackFares must be an array`);
    }
    value.fallbackFares.forEach((fare, index) => {
      assertString(fare, `${source}.fallbackFares[${index}]`);
      normalizeFareProduct(fare, `${source}.fallbackFares[${index}]`);
    });
  }
  if ("travelClass" in value) {
    assertString(value.travelClass, `${source}.travelClass`);
    normalizeTravelClass(value.travelClass, `${source}.travelClass`);
  }
  if ("continueToCustomerData" in value &&
    typeof value.continueToCustomerData !== "boolean") {
    throw new Error(`${source}.continueToCustomerData must be a boolean`);
  }
  if ("bookingFor" in value) {
    assertString(value.bookingFor, `${source}.bookingFor`);
    normalizeBookingFor(value.bookingFor, `${source}.bookingFor`);
  }
  if ("continueToPaymentBoundary" in value &&
    typeof value.continueToPaymentBoundary !== "boolean") {
    throw new Error(`${source}.continueToPaymentBoundary must be a boolean`);
  }
}

function normalizeFareProduct(value: string, source: string): DBhopperFareProduct {
  const normalized = FARE_PRODUCT_ALIASES.get(value.trim().toLowerCase());
  if (!normalized) {
    throw new Error(
      `${source} must be one of: ${BUYING_FARE_PRODUCT_ORDER.join(", ")}`,
    );
  }
  return normalized;
}

function normalizeTravelClass(value: string, source: string): DBhopperTravelClass {
  const normalized = TRAVEL_CLASS_ALIASES.get(value.trim().toLowerCase());
  if (!normalized) {
    throw new Error(`${source} must be one of: second, first`);
  }
  return normalized;
}

function normalizeBookingFor(value: string, source: string): DBhopperBookingFor {
  const normalized = BOOKING_FOR_ALIASES.get(value.trim().toLowerCase());
  if (!normalized) {
    throw new Error(`${source} must be one of: self, other`);
  }
  return normalized;
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

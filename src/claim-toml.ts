import { parse, stringify } from "smol-toml";

import type { DBhopperClaim, ValidationMessage } from "./types.js";

type PrimitiveKind = "string" | "number" | "boolean";

interface PrimitiveSchema {
  kind: PrimitiveKind;
  enum?: readonly string[];
  const?: string | number | boolean;
}

interface ObjectSchema {
  kind: "object";
  fields: Record<string, TomlSchema>;
  required?: readonly string[];
  allowUnknown?: boolean;
}

interface ArraySchema {
  kind: "array";
  item: TomlSchema;
}

type TomlSchema = PrimitiveSchema | ObjectSchema | ArraySchema;

const SALUTATIONS = ["MR", "MS", "DIVERS", "FAMILY"] as const;
const DISRUPTION_TYPES = ["delay", "cancellation"] as const;
const SUBSTITUTE_TYPES = [
  "long_distance",
  "taxi",
  "sharing",
  "alternative_local",
] as const;
const FILE_ROLES = [
  "base_ticket",
  "substitute_receipt",
  "delay_evidence",
  "submission_pdf",
  "screenshot",
  "other",
] as const;

const claimantSchema: TomlSchema = object(
  {
    salutation: stringEnum(SALUTATIONS),
    firstName: string(),
    lastName: string(),
    email: string(),
    phone: string(),
    address: object(
      {
        streetNumber: string(),
        zip: string(),
        city: string(),
        country: string(),
      },
      ["streetNumber", "zip", "city", "country"],
    ),
  },
  ["salutation", "firstName", "lastName", "email", "phone", "address"],
);

const bankSchema: TomlSchema = object(
  {
    accountOwner: string(),
    iban: string(),
  },
  ["accountOwner", "iban"],
);

const journeySchema: TomlSchema = object({
  date: string(),
  scheduledDepartureTime: string(),
  startStation: string(),
  endStation: string(),
  plannedLine: string(),
  plannedTrainLabel: string(),
  delayMinutes: number(),
  disruptionType: stringEnum(DISRUPTION_TYPES),
  replacementStartedAt: string(),
  usedDelayedVehicle: boolean(),
  usedIdenticalLocalAlternative: boolean(),
  excludedReasons: array(string()),
});

const ticketSchema: TomlSchema = object({
  baseTicketName: string(),
  baseTicketCategory: string(),
  tariffArea: string(),
  substituteType: stringEnum(SUBSTITUTE_TYPES),
  substituteCost: number(),
  companions: number(),
  description: string(),
});

const fileSchema: TomlSchema = object(
  {
    role: stringEnum(FILE_ROLES),
    path: string(),
    description: string(),
    reusableAsset: boolean(),
  },
  ["role", "path"],
);

const baseClaimFields: Record<string, TomlSchema> = {
  version: constant(1),
  claimId: string(),
  status: string(),
  profileName: string(),
  journey: journeySchema,
  ticket: ticketSchema,
  files: array(fileSchema),
  metadata: object({}, [], true),
};

const claimFileSchema = object(baseClaimFields);

const privateProfileSchema = object(
  {
    version: constant(1),
    claimant: claimantSchema,
    bank: bankSchema,
  },
  ["claimant", "bank"],
);

export function parseClaimToml(text: string, source = "claim.toml") {
  return parseTomlDocument(text, claimFileSchema, source) as DBhopperClaim;
}

export function parsePrivateProfileToml(text: string, source = "profile.toml") {
  return parseTomlDocument(text, privateProfileSchema, source) as DBhopperClaim;
}

export function stringifyClaimToml(claim: DBhopperClaim) {
  return stringifyToml(stripPrivateClaimFields(claim));
}

export function stringifySubmittedRecipeToml(claim: DBhopperClaim) {
  return stringifyToml(claim);
}

export function assertClaimTomlShape(claim: DBhopperClaim, source = "claim.toml") {
  assertSchema(claim, claimFileSchema, source);
}

function stripPrivateClaimFields(claim: DBhopperClaim): DBhopperClaim {
  const { claimant: _claimant, bank: _bank, ...rest } = claim;
  return rest;
}

export function mergeClaims(base: DBhopperClaim, override: DBhopperClaim): DBhopperClaim {
  return mergeObjects(base, override) as DBhopperClaim;
}

export function profileFieldsInClaim(claim: DBhopperClaim) {
  return ["claimant", "bank"].filter((field) => field in claim);
}

export function schemaValidationMessages(
  value: unknown,
  kind: "claim" | "profile",
  source: string,
): ValidationMessage[] {
  const schema = kind === "profile" ? privateProfileSchema : claimFileSchema;
  try {
    assertSchema(value, schema, source);
    return [];
  } catch (error) {
    return [{
      code: "invalid_toml_schema",
      message: error instanceof Error ? error.message : String(error),
      severity: "error",
    }];
  }
}

function parseTomlDocument(text: string, schema: TomlSchema, source: string) {
  let parsed: unknown;
  try {
    parsed = parse(text);
  } catch (error) {
    throw new Error(`${source}: invalid TOML: ${errorMessage(error)}`);
  }
  assertSchema(parsed, schema, source);
  return parsed;
}

function stringifyToml(value: DBhopperClaim) {
  return `${stringify(cleanForToml(value))}`;
}

function assertSchema(value: unknown, schema: TomlSchema, path: string) {
  if (schema.kind === "array") {
    if (!Array.isArray(value)) {
      throw new Error(`${path} must be an array`);
    }
    value.forEach((entry, index) => assertSchema(entry, schema.item, `${path}[${index}]`));
    return;
  }

  if (schema.kind === "object") {
    if (!isPlainObject(value)) {
      throw new Error(`${path} must be a table`);
    }
    for (const key of schema.required ?? []) {
      if (!(key in value)) {
        throw new Error(`${path}.${key} is required`);
      }
    }
    if (!schema.allowUnknown) {
      for (const key of Object.keys(value)) {
        if (!(key in schema.fields)) {
          throw new Error(`${path}.${key} is not a supported field`);
        }
      }
    }
    for (const [key, childSchema] of Object.entries(schema.fields)) {
      if (key in value) {
        assertSchema(value[key], childSchema, `${path}.${key}`);
      }
    }
    return;
  }

  if (schema.kind === "string") {
    if (typeof value !== "string") {
      throw new Error(`${path} must be a string`);
    }
    if (schema.enum && !schema.enum.includes(value)) {
      throw new Error(`${path} must be one of: ${schema.enum.join(", ")}`);
    }
    if (schema.const !== undefined && value !== schema.const) {
      throw new Error(`${path} must be ${String(schema.const)}`);
    }
    return;
  }

  if (schema.kind === "number") {
    if (typeof value !== "number" || !Number.isFinite(value)) {
      throw new Error(`${path} must be a number`);
    }
    if (schema.const !== undefined && value !== schema.const) {
      throw new Error(`${path} must be ${String(schema.const)}`);
    }
    return;
  }

  if (typeof value !== "boolean") {
    throw new Error(`${path} must be a boolean`);
  }
  if (schema.const !== undefined && value !== schema.const) {
    throw new Error(`${path} must be ${String(schema.const)}`);
  }
}

function object(
  fields: Record<string, TomlSchema>,
  required: readonly string[] = [],
  allowUnknown = false,
): TomlSchema {
  return { kind: "object", fields, required, allowUnknown };
}

function string(): TomlSchema {
  return { kind: "string" };
}

function stringEnum(values: readonly string[]): TomlSchema {
  return { kind: "string", enum: values };
}

function number(): TomlSchema {
  return { kind: "number" };
}

function boolean(): TomlSchema {
  return { kind: "boolean" };
}

function constant(value: string | number | boolean): TomlSchema {
  return { kind: typeof value as PrimitiveKind, const: value };
}

function array(item: TomlSchema): TomlSchema {
  return { kind: "array", item };
}

function cleanForToml(value: unknown): any {
  if (Array.isArray(value)) {
    return value.map(cleanForToml);
  }
  if (!isPlainObject(value)) {
    return value;
  }
  const cleaned: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value)) {
    if (child === undefined || child === null) {
      continue;
    }
    if (isPlainObject(child)) {
      const nested = cleanForToml(child);
      if (Object.keys(nested).length === 0) {
        continue;
      }
      cleaned[key] = nested;
      continue;
    }
    if (Array.isArray(child) && child.length === 0) {
      cleaned[key] = [];
      continue;
    }
    cleaned[key] = cleanForToml(child);
  }
  return cleaned;
}

function mergeObjects(base: unknown, override: unknown): unknown {
  if (!isPlainObject(base) || !isPlainObject(override)) {
    return override === undefined ? base : override;
  }
  const merged: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(override)) {
    merged[key] = mergeObjects(merged[key], value);
  }
  return merged;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

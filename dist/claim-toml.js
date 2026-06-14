import { parse, stringify } from "smol-toml";
const SALUTATIONS = ["MR", "MS", "DIVERS", "FAMILY"];
const DISRUPTION_TYPES = ["delay", "cancellation"];
const SUBSTITUTE_TYPES = [
    "long_distance",
    "taxi",
    "sharing",
    "alternative_local",
];
const FILE_ROLES = [
    "base_ticket",
    "substitute_receipt",
    "delay_evidence",
    "submission_pdf",
    "screenshot",
    "other",
];
const bankSchema = object({
    accountOwner: string(),
    iban: string(),
}, ["accountOwner", "iban"]);
const claimantSchema = object({
    salutation: stringEnum(SALUTATIONS),
    firstName: string(),
    lastName: string(),
    email: string(),
    phone: string(),
    address: object({
        streetNumber: string(),
        zip: string(),
        city: string(),
        country: string(),
    }, ["streetNumber", "zip", "city", "country"]),
    bank: bankSchema,
}, ["salutation", "firstName", "lastName", "email", "phone", "address", "bank"]);
const journeySchema = object({
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
const ticketSchema = object({
    baseTicketName: string(),
    baseTicketCategory: string(),
    tariffArea: string(),
    substituteType: stringEnum(SUBSTITUTE_TYPES),
    substituteCost: number(),
    companions: number(),
    description: string(),
});
const fileSchema = object({
    role: stringEnum(FILE_ROLES),
    path: string(),
    description: string(),
    reusableAsset: boolean(),
}, ["role", "path"]);
const baseClaimFields = {
    version: constant(1),
    claimId: string(),
    status: string(),
    journey: journeySchema,
    ticket: ticketSchema,
    files: array(fileSchema),
    metadata: object({}, [], true),
};
const claimFileSchema = object(baseClaimFields);
const privateProfileSchema = object({
    ID_CLM: string(),
    version: constant(1),
    claimant: claimantSchema,
}, ["ID_CLM", "claimant"]);
export function parseClaimToml(text, source = "claim.toml") {
    return parseTomlDocument(text, claimFileSchema, source);
}
export function parsePrivateProfileToml(text, source = "profile.toml") {
    const parsed = parseTomlDocument(text, privateProfileSchema, source);
    if (parsed.ID_CLM && !/^\d{2,}$/.test(parsed.ID_CLM)) {
        throw new Error(`${source}.ID_CLM must be a quoted numeric ID like "01"`);
    }
    return parsed;
}
export function stringifyClaimToml(claim) {
    return stringifyToml(stripPrivateClaimFields(claim));
}
export function stringifySubmittedRecipeToml(claim) {
    return stringifyToml(claim);
}
export function assertClaimTomlShape(claim, source = "claim.toml") {
    assertSchema(claim, claimFileSchema, source);
}
function stripPrivateClaimFields(claim) {
    const { claimant: _claimant, ...rest } = claim;
    return rest;
}
export function mergeClaims(base, override) {
    return mergeObjects(base, override);
}
export function profileFieldsInClaim(claim) {
    return ["claimant"].filter((field) => field in claim);
}
export function schemaValidationMessages(value, kind, source) {
    const schema = kind === "profile" ? privateProfileSchema : claimFileSchema;
    try {
        assertSchema(value, schema, source);
        return [];
    }
    catch (error) {
        return [{
                code: "invalid_toml_schema",
                message: error instanceof Error ? error.message : String(error),
                severity: "error",
            }];
    }
}
function parseTomlDocument(text, schema, source) {
    let parsed;
    try {
        parsed = parse(text);
    }
    catch (error) {
        throw new Error(`${source}: invalid TOML: ${errorMessage(error)}`);
    }
    assertSchema(parsed, schema, source);
    return parsed;
}
function stringifyToml(value) {
    return `${stringify(cleanForToml(value))}`;
}
function assertSchema(value, schema, path) {
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
function object(fields, required = [], allowUnknown = false) {
    return { kind: "object", fields, required, allowUnknown };
}
function string() {
    return { kind: "string" };
}
function stringEnum(values) {
    return { kind: "string", enum: values };
}
function number() {
    return { kind: "number" };
}
function boolean() {
    return { kind: "boolean" };
}
function constant(value) {
    return { kind: typeof value, const: value };
}
function array(item) {
    return { kind: "array", item };
}
function cleanForToml(value) {
    if (Array.isArray(value)) {
        return value.map(cleanForToml);
    }
    if (!isPlainObject(value)) {
        return value;
    }
    const cleaned = {};
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
function mergeObjects(base, override) {
    if (!isPlainObject(base) || !isPlainObject(override)) {
        return override === undefined ? base : override;
    }
    const merged = { ...base };
    for (const [key, value] of Object.entries(override)) {
        merged[key] = mergeObjects(merged[key], value);
    }
    return merged;
}
function isPlainObject(value) {
    return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
function errorMessage(error) {
    return error instanceof Error ? error.message : String(error);
}

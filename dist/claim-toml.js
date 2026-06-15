import { stringify } from "smol-toml";
import { CLAIM_FILE_ROLES } from "./claim-tool-contracts.js";
import { normalizeTomlKeys, parseToml, renameTomlKeys, } from "./toml.js";
import { validationErrorFromException } from "./validation-messages.js";
import { assertNumericId } from "./schema-helpers.js";
const SALUTATIONS = ["MR", "MS", "DIVERS", "FAMILY"];
const DISRUPTION_TYPES = ["delay", "cancellation"];
const SUBSTITUTE_TYPES = [
    "long_distance",
    "taxi",
    "sharing",
    "alternative_local",
];
const CLAIM_TOML_ALIASES = {
    "": {
        claim_id: "claimId",
    },
    claimant: {
        first_name: "firstName",
        last_name: "lastName",
    },
    "claimant.address": {
        street_number: "streetNumber",
    },
    "claimant.bank": {
        account_owner: "accountOwner",
    },
    journey: {
        scheduled_departure_time: "scheduledDepartureTime",
        start_station: "startStation",
        end_station: "endStation",
        planned_line: "plannedLine",
        planned_train_label: "plannedTrainLabel",
        delay_minutes: "delayMinutes",
        disruption_type: "disruptionType",
        replacement_started_at: "replacementStartedAt",
        used_delayed_vehicle: "usedDelayedVehicle",
        used_identical_local_alternative: "usedIdenticalLocalAlternative",
        excluded_reasons: "excludedReasons",
    },
    ticket: {
        base_ticket_name: "baseTicketName",
        base_ticket_category: "baseTicketCategory",
        tariff_area: "tariffArea",
        substitute_type: "substituteType",
        substitute_cost: "substituteCost",
    },
    files: {
        reusable_asset: "reusableAsset",
    },
};
const CLAIM_TOML_OUTPUT_KEYS = {
    "": {
        claimId: "claim_id",
    },
    claimant: {
        firstName: "first_name",
        lastName: "last_name",
    },
    "claimant.address": {
        streetNumber: "street_number",
    },
    "claimant.bank": {
        accountOwner: "account_owner",
    },
    journey: {
        scheduledDepartureTime: "scheduled_departure_time",
        startStation: "start_station",
        endStation: "end_station",
        plannedLine: "planned_line",
        plannedTrainLabel: "planned_train_label",
        delayMinutes: "delay_minutes",
        disruptionType: "disruption_type",
        replacementStartedAt: "replacement_started_at",
        usedDelayedVehicle: "used_delayed_vehicle",
        usedIdenticalLocalAlternative: "used_identical_local_alternative",
        excludedReasons: "excluded_reasons",
    },
    ticket: {
        baseTicketName: "base_ticket_name",
        baseTicketCategory: "base_ticket_category",
        tariffArea: "tariff_area",
        substituteType: "substitute_type",
        substituteCost: "substitute_cost",
    },
    files: {
        reusableAsset: "reusable_asset",
    },
};
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
    role: stringEnum(CLAIM_FILE_ROLES),
    path: string(),
    description: string(),
    reusableAsset: boolean(),
}, ["role", "path"]);
const baseClaimFields = {
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
    claimant: claimantSchema,
}, ["ID_CLM", "claimant"]);
export function parseClaimToml(text, source = "claim.toml") {
    return parseTomlDocument(text, claimFileSchema, source);
}
export function parsePrivateProfileToml(text, source = "profile.toml") {
    const parsed = parseTomlDocument(text, privateProfileSchema, source);
    if (parsed.ID_CLM) {
        assertNumericId(parsed.ID_CLM, `${source}.ID_CLM`);
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
    assertSchema(normalizeTomlKeys(claim, source, CLAIM_TOML_ALIASES), claimFileSchema, source);
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
        assertSchema(normalizeTomlKeys(value, source, CLAIM_TOML_ALIASES, true), schema, source);
        return [];
    }
    catch (error) {
        return [validationErrorFromException("invalid_toml_schema", error)];
    }
}
function parseTomlDocument(text, schema, source) {
    const parsed = normalizeTomlKeys(parseToml(text, source), source, CLAIM_TOML_ALIASES, true);
    assertSchema(parsed, schema, source);
    return parsed;
}
function stringifyToml(value) {
    return `${stringify(renameTomlKeys(cleanForToml(value), CLAIM_TOML_OUTPUT_KEYS))}`;
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
        return;
    }
    if (schema.kind === "number") {
        if (typeof value !== "number" || !Number.isFinite(value)) {
            throw new Error(`${path} must be a number`);
        }
        return;
    }
    if (typeof value !== "boolean") {
        throw new Error(`${path} must be a boolean`);
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

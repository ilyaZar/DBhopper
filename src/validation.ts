import type { DBhopperClaim, ValidationMessage, ValidationResult } from "./types.js";

const EXCLUDED_REASONS = new Set([
  "strike",
  "severe_weather",
  "natural_forces",
  "bomb_threat",
  "bomb_disposal",
  "overcrowding",
  "missed_connection",
  "en_route_delay",
  "uber",
  "ride_hailing",
]);

const REQUIRED_BROWSER_FIELDS = [
  "claimant.email",
  "claimant.firstName",
  "claimant.lastName",
  "claimant.phone",
  "claimant.address.streetNumber",
  "claimant.address.zip",
  "claimant.address.city",
  "claimant.address.country",
  "journey.date",
  "journey.scheduledDepartureTime",
  "journey.startStation",
  "journey.endStation",
  "ticket.baseTicketName",
  "ticket.baseTicketCategory",
  "ticket.tariffArea",
  "ticket.substituteType",
  "ticket.substituteCost",
  "claimant.bank.accountOwner",
  "claimant.bank.iban",
];

export function validateClaim(
  claim: DBhopperClaim,
  options: { now?: Date; submit?: boolean } = {},
): ValidationResult {
  const messages: ValidationMessage[] = [];
  const now = options.now || new Date();

  for (const field of REQUIRED_BROWSER_FIELDS) {
    if (!readPath(claim, field)) {
      messages.push(error("missing_field", `required field is missing: ${field}`));
    }
  }

  if (claim.version && claim.version !== 1) {
    messages.push(error("unsupported_version", "claim version must be 1"));
  }

  validateJourney(claim, now, messages);
  validateTicket(claim, messages);
  validateFiles(claim, messages);

  const errors = messages.filter((message) => message.severity === "error");
  const warnings = messages.filter((message) => message.severity === "warning");

  return {
    ok: errors.length === 0,
    readyForBrowser: errors.length === 0,
    readyForSubmit: errors.length === 0 && warnings.length === 0,
    messages,
  };
}

export function claimSchemaReference() {
  return {
    requiredFacts: {
      privateProfile:
        [
          "Store reusable sensitive claimant and bank data in",
          "assets/private/profiles/*.toml and select it with",
          "assets/private/settings.toml ID_CLM.",
        ].join(" "),
      privateProfileShape: {
        version: 1,
        claimant: {
          salutation: "FAMILY",
          firstName: "Maria",
          lastName: "Mustermann",
          email: "maria@example.org",
          phone: "+4922112345678",
          address: {
            streetNumber: "Musterstrasse 1",
            zip: "50667",
            city: "Koeln",
            country: "Deutschland",
          },
          bank: {
            accountOwner: "Maria Mustermann",
            iban: "fill-iban",
          },
        },
      },
      eligibility: [
        "departure delay or cancellation gap at the starting stop is at least 20 minutes",
        "claim is filed within 14 calendar days after the incident",
        "replacement ride starts within 60 minutes after guarantee eligibility starts",
        "the delayed or cancelled service is NRW local public transport",
        "the user did not board the delayed vehicle and did not use an identical local route",
        "excluded causes are absent: strike, natural forces, severe DWD weather, bomb threat or disposal",
      ],
      evidence: [
        "original local/NRW/Deutschlandticket proof",
        "replacement IC/EC/ICE ticket, taxi receipt, or sharing receipt",
        "delay/cancellation screenshot when relying on displayed forecast at scheduled departure",
      ],
      formData: REQUIRED_BROWSER_FIELDS,
    },
    editableClaimTomlShape: {
      version: 1,
      claimId: "koeln-duesseldorf-2026-06-06-re6",
      journey: {
        date: "2026-06-06",
        scheduledDepartureTime: "09:07",
        startStation: "Koeln Hbf",
        endStation: "Duesseldorf Hbf",
        plannedLine: "RE6",
        delayMinutes: 25,
        disruptionType: "delay",
        replacementStartedAt: "09:35",
        usedDelayedVehicle: false,
        usedIdenticalLocalAlternative: false,
        excludedReasons: [],
      },
      ticket: {
        baseTicketName: "Deutschlandticket",
        baseTicketCategory: "Ticket im Abo",
        tariffArea: "NRW-Tarif",
        substituteType: "long_distance",
        substituteCost: 12.5,
        companions: 0,
        description: "RE6 was delayed by at least 20 minutes at the starting station.",
      },
      files: [
        { role: "base_ticket", path: "deutschlandticket.pdf" },
        { role: "substitute_receipt", path: "ice-ticket.pdf" },
      ],
    },
    submittedRecipeShape:
      "claim_submitted_recipe.toml joins editable claim.toml with the selected claim profile after successful submit.",
  };
}

function validateJourney(claim: DBhopperClaim, now: Date, messages: ValidationMessage[]) {
  const journey = claim.journey || {};

  if (!Number.isFinite(journey.delayMinutes) || Number(journey.delayMinutes) < 20) {
    messages.push(error("delay_too_short", "delayMinutes must be at least 20"));
  }

  if (!["delay", "cancellation"].includes(String(journey.disruptionType || ""))) {
    messages.push(error("missing_disruption_type", "disruptionType must be delay or cancellation"));
  }

  if (journey.usedDelayedVehicle) {
    messages.push(error("used_delayed_vehicle", "claim is excluded if the delayed vehicle was used"));
  }

  if (journey.usedIdenticalLocalAlternative) {
    messages.push(
      error(
        "used_identical_local_alternative",
        "claim is excluded if an identical local route was used instead",
      ),
    );
  }

  for (const reason of journey.excludedReasons || []) {
    if (EXCLUDED_REASONS.has(reason)) {
      messages.push(error("excluded_reason", `claim has excluded reason: ${reason}`));
    }
  }

  const incidentDate = parseDate(journey.date);
  if (incidentDate) {
    const diffDays = Math.floor((startOfDay(now).getTime() - incidentDate.getTime()) / 86400000);
    if (diffDays < 0) {
      messages.push(error("incident_in_future", "journey.date must not be in the future"));
    } else if (diffDays > 14) {
      messages.push(error("claim_too_old", "claim must be filed within 14 calendar days"));
    }
  } else if (journey.date) {
    messages.push(error("invalid_date", "journey.date must use YYYY-MM-DD"));
  }

  if (!journey.replacementStartedAt) {
    messages.push(
      warning(
        "missing_replacement_start",
        "replacementStartedAt is missing; the form may still work, but the 60-minute rule is not proven",
      ),
    );
  }
}

function validateTicket(claim: DBhopperClaim, messages: ValidationMessage[]) {
  const ticket = claim.ticket || {};
  if (ticket.substituteType === "alternative_local") {
    messages.push(
      warning(
        "alternative_local_not_primary",
        "NRW guidance reimburses IC/EC/ICE, taxi, and sharing; alternative local transport is risky",
      ),
    );
  }

  if (ticket.substituteCost !== undefined && ticket.substituteCost <= 0) {
    messages.push(error("invalid_substitute_cost", "substituteCost must be greater than zero"));
  }

  if (ticket.substituteType === "taxi" || ticket.substituteType === "sharing") {
    const cost = Number(ticket.substituteCost || 0);
    if (cost > 60) {
      messages.push(
        warning(
          "refund_cap",
          "taxi and sharing reimbursements are capped; verify the day/night cap before submitting",
        ),
      );
    }
  }
}

function validateFiles(claim: DBhopperClaim, messages: ValidationMessage[]) {
  const roles = new Set((claim.files || []).map((file) => file.role));
  if (!roles.has("base_ticket")) {
    messages.push(error("missing_base_ticket", "original ticket proof must be attached"));
  }
  if (!roles.has("substitute_receipt")) {
    messages.push(error("missing_substitute_receipt", "replacement ride ticket or receipt must be attached"));
  }
  if (!roles.has("delay_evidence")) {
    messages.push(
      warning(
        "missing_delay_evidence",
        "delay evidence is not attached; add a screenshot when relying on displayed delay forecast",
      ),
    );
  }
}

function readPath(value: unknown, dotted: string) {
  return dotted.split(".").reduce<unknown>((current, key) => {
    if (!current || typeof current !== "object") {
      return undefined;
    }
    return (current as Record<string, unknown>)[key];
  }, value);
}

function parseDate(value?: string) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null;
  }
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function startOfDay(value: Date) {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
}

function error(code: string, message: string): ValidationMessage {
  return { code, message, severity: "error" };
}

function warning(code: string, message: string): ValidationMessage {
  return { code, message, severity: "warning" };
}

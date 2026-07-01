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
export function validateClaim(claim, options = {}) {
    const messages = [];
    const now = options.now || new Date();
    for (const field of REQUIRED_BROWSER_FIELDS) {
        if (!readPath(claim, field)) {
            messages.push(error("missing_field", `required field is missing: ${field}`));
        }
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
            privateProfile: [
                "Store sensitive claimant and bank data in",
                "an external path_clm claim TOML and select it by",
                "assets/private/settings.toml ID_CLM.",
            ].join(" "),
            privateProfileShape: {
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
            ID_CLM: "01",
            journey: {
                date: "2026-06-06",
                scheduledDepartureTime: "09:07",
                startStation: "Koeln Hbf",
                endStation: "Duesseldorf Hbf",
                plannedLine: "RE6",
                disruptionType: "delay",
                replacementStartedAt: "09:35",
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
        submittedRecipeShape: "claim_submitted_recipe.toml records the selected claim after successful submit.",
    };
}
function validateJourney(claim, now, messages) {
    const journey = claim.journey || {};
    if (journey.delayMinutes === undefined || journey.delayMinutes === null) {
        messages.push(warning("missing_delay_minutes", "delayMinutes is missing; browser filing can continue but eligibility is not proven"));
    }
    else if (!Number.isFinite(journey.delayMinutes) || Number(journey.delayMinutes) < 20) {
        messages.push(error("delay_too_short", "delayMinutes must be at least 20"));
    }
    if (!["delay", "cancellation"].includes(String(journey.disruptionType || ""))) {
        messages.push(error("missing_disruption_type", "disruptionType must be delay or cancellation"));
    }
    if (journey.usedDelayedVehicle) {
        messages.push(error("used_delayed_vehicle", "claim is excluded if the delayed vehicle was used"));
    }
    if (journey.usedIdenticalLocalAlternative) {
        messages.push(error("used_identical_local_alternative", "claim is excluded if an identical local route was used instead"));
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
        }
        else if (diffDays > 14) {
            messages.push(error("claim_too_old", "claim must be filed within 14 calendar days"));
        }
    }
    else if (journey.date) {
        messages.push(error("invalid_date", "journey.date must use YYYY-MM-DD"));
    }
    if (!journey.replacementStartedAt) {
        messages.push(warning("missing_replacement_start", "replacementStartedAt is missing; the form may still work, but the 60-minute rule is not proven"));
    }
}
function validateTicket(claim, messages) {
    const ticket = claim.ticket || {};
    if (ticket.substituteType === "alternative_local") {
        messages.push(warning("alternative_local_not_primary", "NRW guidance reimburses IC/EC/ICE, taxi, and sharing; alternative local transport is risky"));
    }
    if (ticket.substituteCost !== undefined && ticket.substituteCost <= 0) {
        messages.push(error("invalid_substitute_cost", "substituteCost must be greater than zero"));
    }
    if (ticket.substituteType === "taxi" || ticket.substituteType === "sharing") {
        const cost = Number(ticket.substituteCost || 0);
        if (cost > 60) {
            messages.push(warning("refund_cap", "taxi and sharing reimbursements are capped; verify the day/night cap before submitting"));
        }
    }
}
function validateFiles(claim, messages) {
    const roles = new Set((claim.files || []).map((file) => file.role));
    let uploadCount = 0;
    let delayEvidenceCount = 0;
    for (const file of claim.files || []) {
        const paths = filePaths(file);
        if (paths.length === 0) {
            messages.push(error("missing_file_path", `file entry ${file.role} must set path or paths`));
        }
        uploadCount += paths.length;
        if (file.role === "delay_evidence") {
            delayEvidenceCount += paths.length;
        }
    }
    if (!roles.has("base_ticket")) {
        messages.push(error("missing_base_ticket", "original ticket proof must be attached"));
    }
    if (!roles.has("substitute_receipt")) {
        messages.push(error("missing_substitute_receipt", "replacement ride ticket or receipt must be attached"));
    }
    if (!roles.has("delay_evidence")) {
        messages.push(warning("missing_delay_evidence", "delay evidence is not attached; add a screenshot when relying on displayed delay forecast"));
    }
    if (delayEvidenceCount > 3) {
        messages.push(error("too_many_delay_evidence_files", "delay_evidence may include at most 3 files"));
    }
    if (uploadCount > 5) {
        messages.push(error("too_many_upload_files", "the browser form accepts at most 5 upload files"));
    }
}
function filePaths(file) {
    return [
        ...(file.path ? [file.path] : []),
        ...(Array.isArray(file.paths) ? file.paths : []),
    ];
}
function readPath(value, dotted) {
    return dotted.split(".").reduce((current, key) => {
        if (!current || typeof current !== "object") {
            return undefined;
        }
        return current[key];
    }, value);
}
function parseDate(value) {
    if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        return null;
    }
    const date = new Date(`${value}T00:00:00Z`);
    return Number.isNaN(date.getTime()) ? null : date;
}
function startOfDay(value) {
    return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
}
function error(code, message) {
    return { code, message, severity: "error" };
}
function warning(code, message) {
    return { code, message, severity: "warning" };
}

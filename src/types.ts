import type {
  BahnWebTransport,
  DBhopperDelayProviderSetting,
} from "./delay-provider-options.js";

export type SubstituteType =
  | "long_distance"
  | "taxi"
  | "sharing"
  | "alternative_local";

export type DisruptionType = "delay" | "cancellation";

export type ClaimFileRole =
  | "base_ticket"
  | "substitute_receipt"
  | "delay_evidence"
  | "submission_pdf"
  | "screenshot"
  | "other";

export interface ClaimFile {
  role: ClaimFileRole;
  path?: string;
  paths?: string[];
  description?: string;
  reusableAsset?: boolean;
}

export interface DBhopperClaim {
  ID_CLM?: string;
  claimId?: string;
  status?: string;
  claimant?: {
    salutation?: "MR" | "MS" | "DIVERS" | "FAMILY";
    firstName?: string;
    lastName?: string;
    email?: string;
    phone?: string;
    address?: {
      streetNumber?: string;
      zip?: string;
      city?: string;
      country?: string;
    };
    bank?: {
      accountOwner?: string;
      iban?: string;
    };
  };
  journey?: {
    date?: string;
    scheduledDepartureTime?: string;
    startStation?: string;
    endStation?: string;
    plannedLine?: string;
    plannedTrainLabel?: string;
    delayMinutes?: number;
    disruptionType?: DisruptionType;
    replacementStartedAt?: string;
    usedDelayedVehicle?: boolean;
    usedIdenticalLocalAlternative?: boolean;
    excludedReasons?: string[];
  };
  ticket?: {
    baseTicketName?: string;
    baseTicketCategory?: string;
    tariffArea?: string;
    substituteType?: SubstituteType;
    substituteCost?: number;
    companions?: number;
    description?: string;
  };
  files?: ClaimFile[];
  metadata?: Record<string, unknown>;
}

export type DBhopperFareProduct =
  | "super_sparpreis"
  | "sparpreis"
  | "flexpreis"
  | "cheapest_available";

export type DBhopperTravelClass = "second" | "first";
export type DBhopperBookingFor = "self";
export type DBhopperPaymentMethod = "sepa" | "credit_card" | "paypal";

export interface DBhopperBuyingProfile {
  ID_BUY: string;
  defaultFare: DBhopperFareProduct;
  fallbackFares?: DBhopperFareProduct[];
  travelClass?: DBhopperTravelClass;
  continueToCustomerData?: boolean;
  bookingFor?: DBhopperBookingFor;
  continueToPaymentBoundary?: boolean;
}

export interface DBhopperPaymentProfile {
  ID_PYM: string;
  method: DBhopperPaymentMethod;
  payment?: {
    sepa?: {
      accountOwner?: string;
      iban?: string;
      birthdate?: string;
      address?: {
        streetNumber?: string;
        additionalInfo?: string;
        zip?: string;
        city?: string;
        country?: string;
      };
      mandateAccepted?: boolean;
      saveAsPreferred?: boolean;
    };
    card?: {
      cardholderName?: string;
      cardNumber?: string;
      expiryMonth?: string;
      expiryYear?: string;
      saveAsPreferred?: boolean;
    };
    paypal?: {
      saveAsPreferred?: boolean;
    };
  };
}

export interface PreparedClaim {
  claimId: string;
  claimDir: string;
  claimPath: string;
  recipePath?: string;
  profileId?: string;
  profileFile?: string;
  storedClaim?: DBhopperClaim;
  claim: DBhopperClaim;
  copiedFiles: ClaimFile[];
}

export interface ValidationMessage {
  code: string;
  message: string;
  severity: "error" | "warning" | "info";
}

export interface ValidationResult {
  ok: boolean;
  readyForBrowser: boolean;
  readyForSubmit: boolean;
  messages: ValidationMessage[];
}

export interface DBhopperConfig {
  workspaceRoot?: string;
  settingsPath?: string;
  browserExecutablePath?: string;
  artifactRoot?: string;
  headless?: boolean;
  timeoutMs?: number;
  approvalMode?: "all" | "mutating" | "none";
  dbClientId?: string;
  dbApiKey?: string;
  timetableBaseUrl?: string;
  delayProvider?: DBhopperDelayProviderSetting;
  bahnWebBaseUrl?: string;
  bahnWebTransport?: BahnWebTransport;
  requestTimeoutMs?: number;
  delayLookbackMinutes?: number;
  timeZone?: string;
}

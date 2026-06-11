import type { DBhopperConfig } from "./types.js";
import {
  applyCredentialsToConfig,
  credentialsSummary,
  readSelectedCredentialsProfile,
} from "./credentials.js";
import { DEFAULT_TIMETABLE_BASE_URL, timetablesConfigStatus } from "./db-timetables.js";

export interface DbApiCredentialProbeParams {
  credentials_profile?: string;
  station_pattern?: string;
}

export interface DbApiCredentialProbeOptions {
  fetchImpl?: typeof fetch;
}

export async function runDbApiCredentialProbe(
  params: DbApiCredentialProbeParams,
  config: DBhopperConfig = {},
  options: DbApiCredentialProbeOptions = {},
) {
  const loadedCredentials = await readSelectedCredentialsProfile(
    config,
    params.credentials_profile,
  );
  const effectiveConfig = applyCredentialsToConfig(config, loadedCredentials);
  const status = timetablesConfigStatus(effectiveConfig);
  const credentialSignals = dbApiCredentialSignals(effectiveConfig);

  if (!status.configured) {
    return {
      ok: false,
      operation: "db_api_credential_probe",
      source_api: "db-timetables",
      needsConfiguration: true,
      message: "DB API Marketplace clientId/apiKey are not configured",
      credentials: credentialsSummary(loadedCredentials),
      credentialSignals,
      configStatus: status,
      browserLoginDoesNotProveApiKeyValidity: true,
    };
  }

  const stationPattern = params.station_pattern?.trim() || "Hamm";
  const baseUrl = normalizeBaseUrl(effectiveConfig.timetableBaseUrl);
  const endpoint = `/station/${encodeURIComponent(stationPattern)}`;
  const controller = new AbortController();
  const timeoutMs = effectiveConfig.requestTimeoutMs ?? 20000;
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await (options.fetchImpl ?? fetch)(`${baseUrl}${endpoint}`, {
      headers: {
        Accept: "application/xml",
        "DB-Client-Id": effectiveConfig.dbClientId ?? "",
        "DB-Api-Key": effectiveConfig.dbApiKey ?? "",
      },
      signal: controller.signal,
    });
    const body = await response.text();
    return {
      ok: response.ok,
      operation: "db_api_credential_probe",
      source_api: "db-timetables",
      needsConfiguration: false,
      credentials: credentialsSummary(loadedCredentials),
      credentialSignals,
      configStatus: status,
      request: {
        endpoint,
        headersSent: ["Accept", "DB-Client-Id", "DB-Api-Key"],
      },
      response: {
        ok: response.ok,
        status: response.status,
        statusText: response.statusText,
        contentType: response.headers.get("content-type"),
        dbErrorMessage: extractDbErrorMessage(body),
      },
      browserLoginDoesNotProveApiKeyValidity: true,
    };
  } catch (error) {
    return {
      ok: false,
      operation: "db_api_credential_probe",
      source_api: "db-timetables",
      needsConfiguration: false,
      credentials: credentialsSummary(loadedCredentials),
      credentialSignals,
      configStatus: status,
      error: error instanceof Error ? error.message : String(error),
      browserLoginDoesNotProveApiKeyValidity: true,
    };
  } finally {
    clearTimeout(timeout);
  }
}

export function dbApiCredentialSignals(config: DBhopperConfig) {
  return {
    hasClientId: Boolean(config.dbClientId),
    hasApiKey: Boolean(config.dbApiKey),
    clientIdLength: config.dbClientId?.length ?? 0,
    apiKeyLength: config.dbApiKey?.length ?? 0,
  };
}

function normalizeBaseUrl(baseUrl?: string) {
  return (baseUrl || DEFAULT_TIMETABLE_BASE_URL).replace(/\/+$/, "");
}

function extractDbErrorMessage(body: string) {
  const moreInfo = body.match(/<moreInformation>(.*?)<\/moreInformation>/is)?.[1];
  const httpMessage = body.match(/<httpMessage>(.*?)<\/httpMessage>/is)?.[1];
  return normalizeText(moreInfo ?? httpMessage ?? body.slice(0, 240));
}

function normalizeText(value: string) {
  return value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

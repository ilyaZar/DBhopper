export function extractDbErrorMessage(body: string) {
  const moreInfo = body.match(/<moreInformation>(.*?)<\/moreInformation>/is)?.[1];
  const httpMessage = body.match(/<httpMessage>(.*?)<\/httpMessage>/is)?.[1];
  return normalizeDbErrorText(moreInfo ?? httpMessage ?? body.slice(0, 240));
}

export function diagnoseDbApiCredentialResponse(
  status: number,
  dbErrorMessage = "",
) {
  if (
    status === 401 &&
    /invalid client id or secret/i.test(dbErrorMessage)
  ) {
    return {
      status: "rejected",
      reason: "invalid_client_id_or_secret",
      next_steps: [
        "verify the selected [bahnAPI].clientId value",
        "verify the selected [bahnAPI].apiKey value",
        "verify that the same DB Marketplace application is subscribed to the Timetables product",
        "verify that the selected credential file ID matches assets/private/settings.toml",
      ],
    };
  }
  if (status === 401) {
    return {
      status: "rejected",
      reason: "unauthorized",
      next_steps: [
        "verify the selected DB Marketplace application credentials",
        "verify that the application has an active Timetables subscription",
      ],
    };
  }
  if (status === 403) {
    return {
      status: "rejected",
      reason: "forbidden_or_not_subscribed",
      next_steps: [
        "verify the Timetables product subscription and usage plan",
        "verify that the API key belongs to the subscribed application",
      ],
    };
  }
  return {
    status: status >= 200 && status < 300 ? "accepted" : "unknown",
    reason: status >= 200 && status < 300 ? "ok" : "unclassified_response",
    next_steps: [] as string[],
  };
}

export function diagnoseDbApiCredentialErrorMessage(message: string) {
  const status = Number(message.match(/HTTP\s+(\d{3})/i)?.[1] ?? NaN);
  if (!Number.isFinite(status)) {
    return {
      status: "unknown",
      reason: "unclassified_error",
      next_steps: [] as string[],
    };
  }
  return diagnoseDbApiCredentialResponse(status, message);
}

function normalizeDbErrorText(value: string) {
  return value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

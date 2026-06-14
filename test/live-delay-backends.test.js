import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { performance } from "node:perf_hooks";

import { runDbDelayQuery } from "../dist/db-delay-tools.js";

const LIVE_ENABLED = process.env.DBHOPPER_LIVE_DELAY_BACKENDS === "1";
const TIME_ZONE = "Europe/Berlin";
const ROUTES = [
  ["p001", "Aachen Hbf", "Düren"],
  ["p002", "Düren", "Köln Hbf"],
  ["p003", "Aachen Hbf", "Köln Hbf"],
  ["p004", "Köln Hbf", "Leverkusen Mitte"],
  ["p005", "Leverkusen Mitte", "Düsseldorf Hbf"],
  ["p006", "Köln Hbf", "Düsseldorf Hbf"],
  ["p007", "Düsseldorf Hbf", "Düsseldorf Flughafen"],
  ["p008", "Düsseldorf Flughafen", "Duisburg Hbf"],
  ["p009", "Düsseldorf Hbf", "Duisburg Hbf"],
  ["p010", "Duisburg Hbf", "Mülheim(Ruhr)Hbf"],
  ["p011", "Mülheim(Ruhr)Hbf", "Essen Hbf"],
  ["p012", "Duisburg Hbf", "Essen Hbf"],
  ["p013", "Essen Hbf", "Bochum Hbf"],
  ["p014", "Bochum Hbf", "Dortmund Hbf"],
  ["p015", "Essen Hbf", "Dortmund Hbf"],
  ["p016", "Dortmund Hbf", "Kamen"],
  ["p017", "Kamen", "Hamm(Westf)Hbf"],
  ["p018", "Dortmund Hbf", "Hamm(Westf)Hbf"],
  ["p019", "Hamm(Westf)Hbf", "Gütersloh Hbf"],
  ["p020", "Gütersloh Hbf", "Bielefeld Hbf"],
  ["p021", "Bielefeld Hbf", "Herford"],
  ["p022", "Herford", "Minden(Westf)"],
  ["p023", "Hamm(Westf)Hbf", "Soest"],
  ["p024", "Soest", "Paderborn Hbf"],
  ["p025", "Hamm(Westf)Hbf", "Paderborn Hbf"],
  ["p026", "Dortmund Hbf", "Hagen Hbf"],
  ["p027", "Hagen Hbf", "Wuppertal Hbf"],
  ["p028", "Wuppertal Hbf", "Düsseldorf Hbf"],
  ["p029", "Wuppertal Hbf", "Köln Hbf"],
  ["p030", "Köln Hbf", "Krefeld Hbf"],
  ["p031", "Krefeld Hbf", "Mönchengladbach Hbf"],
  ["p032", "Mönchengladbach Hbf", "Düsseldorf Hbf"],
  ["p033", "Neuss Hbf", "Düsseldorf Hbf"],
  ["p034", "Neuss Hbf", "Köln Hbf"],
  ["p035", "Köln/Bonn Flughafen", "Köln Hbf"],
  ["p036", "Köln Hbf", "Bonn Hbf"],
  ["p037", "Bonn Hbf", "Köln Hbf"],
  ["p038", "Köln Hbf", "Siegburg/Bonn"],
  ["p039", "Siegburg/Bonn", "Troisdorf"],
  ["p040", "Köln Hbf", "Troisdorf"],
  ["p041", "Essen Hbf", "Gelsenkirchen Hbf"],
  ["p042", "Gelsenkirchen Hbf", "Recklinghausen Hbf"],
  ["p043", "Recklinghausen Hbf", "Münster(Westf)Hbf"],
  ["p044", "Essen Hbf", "Münster(Westf)Hbf"],
  ["p045", "Duisburg Hbf", "Münster(Westf)Hbf"],
  ["p046", "Münster(Westf)Hbf", "Hamm(Westf)Hbf"],
  ["p047", "Münster(Westf)Hbf", "Rheine"],
  ["p048", "Bochum Hbf", "Gelsenkirchen Hbf"],
  ["p049", "Dortmund Hbf", "Gelsenkirchen Hbf"],
  ["p050", "Siegen Hbf", "Hagen Hbf"],
];

describe(
  "live delay backend parity",
  {
    skip: LIVE_ENABLED
      ? false
      : "set DBHOPPER_LIVE_DELAY_BACKENDS=1 to run live backend parity",
  },
  () => {
    it(
      "compares user-visible DB Timetables and bahn-web table rows",
      { timeout: 20 * 60 * 1000 },
      async () => {
        const run = await runLiveParityProbe();

        assert.equal(run.summary.probe_count, 50);
        assert.equal(run.summary.retrieval_contract.function, "runDbDelayQuery");
        assert.equal(run.summary.retrieval_contract.api_provider, "db-timetables");
        assert.equal(run.summary.retrieval_contract.web_provider, "bahn-web");
        assert.match(
          run.summary.retrieval_contract.web_transport,
          /no agent browser driving/,
        );
        assert.deepEqual(run.summary.comparison_contract.ignored_identity_fields, [
          "source",
          "train_number",
          "technical_category",
          "operator",
          "route_confidence",
        ]);
        assert.deepEqual(
          run.summary.comparison_contract.sorted_before_comparison_by,
          [
            "planned_boarding_time",
            "delay_minutes",
            "display_label",
            "role",
            "boarding_station",
            "destination_station",
          ],
        );
        assert.equal(run.summary.web_success_count, 50);
        assert.ok(run.summary.api_success_count >= 40);
        assert.ok(run.summary.matched_user_visible_rows > 0);
        assert.ok(run.summary.api_elapsed_ms.count === 50);
        assert.ok(run.summary.web_elapsed_ms.count === 50);

        const summaryText = await fs.readFile(
          path.join(run.runDir, "summary.json"),
          "utf8",
        );
        assert.deepEqual(JSON.parse(summaryText), run.summary);
      },
    );
  },
);

async function runLiveParityProbe() {
  const fixedNow = new Date();
  const fixedLocal = localParts(fixedNow, TIME_ZONE);
  const fixed = {
    service_date: fixedLocal.date,
    query_time: `${fixedLocal.hour}:${fixedLocal.minute}`,
    time_zone: TIME_ZONE,
    captured_at_utc: fixedNow.toISOString(),
  };
  const runId = `${fixedLocal.date}T${fixedLocal.hour}-${fixedLocal.minute}-${fixedLocal.second}`;
  const runDir = path.join("tmp", "testing-delay-backends", runId);
  const probes = [];

  for (const [index, [id, departure, arrival]] of ROUTES.entries()) {
    const probe = { id, departure_station: departure, arrival_station: arrival };
    const query = queryParams(probe, fixed);
    const [api, web] = await Promise.all([
      callProvider("db-timetables", probe, query),
      callProvider("bahn-web", probe, query),
    ]);
    probes.push({
      index: index + 1,
      ...probe,
      query,
      api,
      web,
      comparison: compareRows(api.table_rows, web.table_rows),
    });
  }

  const summary = summarize({
    run_id: runId,
    run_dir: runDir,
    fixed_query_time: fixed,
    probes,
  });
  const run = { run_id: runId, run_dir: runDir, fixed_query_time: fixed, probes, summary };
  await writeOutputs(runDir, run);
  return { runDir, summary };
}

function queryParams(probe, fixed) {
  return {
    departure_station: probe.departure_station,
    arrival_station: probe.arrival_station,
    service_date: fixed.service_date,
    query_time: fixed.query_time,
    time_zone: fixed.time_zone,
    window_width_minutes: 90,
    delay_threshold_minutes: 0,
    force_query_departure_time: false,
    regional_types: ["RE", "RB", "S"],
    long_distance_replacement_types: ["ICE", "IC", "EC"],
    include_discarded: false,
    include_raw: false,
  };
}

async function callProvider(provider, probe, query) {
  const started = performance.now();
  try {
    const response = await runDbDelayQuery(
      { ...query, provider },
      {
        workspaceRoot: process.cwd(),
        bahnWebTransport: provider === "bahn-web" ? "browser" : undefined,
        requestTimeoutMs: Number(process.env.DBHOPPER_PROBE_TIMEOUT_MS ?? 60000),
        delayLookbackMinutes: Number(
          process.env.DBHOPPER_PROBE_LOOKBACK_MINUTES ?? 30,
        ),
      },
    );
    return {
      provider,
      ok: response.ok === true,
      elapsed_ms: Math.round(performance.now() - started),
      error: response.error ?? response.message,
      cleaned_summary: response.cleaned_summary,
      table_rows: toUserRows(response.table_rows ?? [], provider, probe),
    };
  } catch (error) {
    return {
      provider,
      ok: false,
      elapsed_ms: Math.round(performance.now() - started),
      error: error instanceof Error ? error.message : String(error),
      table_rows: [],
    };
  }
}

function toUserRows(rows, provider, probe) {
  return rows
    .map((row) => ({
      provider,
      probe_id: probe.id,
      query_route: `${probe.departure_station} -> ${probe.arrival_station}`,
      role: row.role,
      display_label: row.display_label ?? row.label ?? row.public_line,
      planned_boarding_time: row.planned_boarding_time,
      realtime_boarding_time: row.realtime_boarding_time,
      delay_minutes: row.delay_minutes,
      reachable: row.reachable,
      boarding_station: row.boarding_station,
      destination_station: row.destination_station,
      platform: row.platform,
      route: row.route ?? [],
    }))
    .sort(userRowSort);
}

function compareRows(apiRows, webRows) {
  const apiBuckets = buckets(apiRows);
  const webBuckets = buckets(webRows);
  const matched = [];
  const apiOnly = [];
  const webOnly = [];
  for (const [key, apiBucket] of apiBuckets) {
    const webBucket = webBuckets.get(key) ?? [];
    const pairs = pair(apiBucket, webBucket);
    matched.push(...pairs.matched);
    apiOnly.push(...pairs.leftOnly);
    webOnly.push(...pairs.rightOnly);
  }
  for (const [key, webBucket] of webBuckets) {
    if (!apiBuckets.has(key)) {
      webOnly.push(...webBucket);
    }
  }
  const compared = matched.map(([api, web]) => rowDiff(api, web));
  const discrepancies = compared.filter((row) => !row.core_same || !row.route_same);
  return {
    api_row_count: apiRows.length,
    web_row_count: webRows.length,
    matched_row_count: matched.length,
    api_only_row_count: apiOnly.length,
    web_only_row_count: webOnly.length,
    core_same_count: compared.filter((row) => row.core_same).length,
    full_same_count: compared.filter((row) => row.core_same && row.route_same).length,
    compared_rows: compared,
    discrepancies,
    api_only_rows: apiOnly,
    web_only_rows: webOnly,
  };
}

function buckets(rows) {
  const map = new Map();
  for (const row of rows) {
    const key = [
      row.role,
      row.display_label,
      row.planned_boarding_time,
      row.boarding_station,
      row.destination_station,
    ]
      .map((value) => String(value ?? ""))
      .join("|");
    if (!map.has(key)) {
      map.set(key, []);
    }
    map.get(key).push(row);
  }
  for (const rowsForKey of map.values()) {
    rowsForKey.sort(userRowSort);
  }
  return map;
}

function pair(leftRows, rightRows) {
  const right = [...rightRows];
  const matched = [];
  const leftOnly = [];
  for (const left of leftRows) {
    if (!right.length) {
      leftOnly.push(left);
      continue;
    }
    let bestIndex = 0;
    let bestScore = Infinity;
    for (const [index, candidate] of right.entries()) {
      const score =
        Math.abs(
          minuteDelta(left.realtime_boarding_time, candidate.realtime_boarding_time) ??
            999,
        ) +
        (typeof left.delay_minutes === "number" &&
        typeof candidate.delay_minutes === "number"
          ? Math.abs(candidate.delay_minutes - left.delay_minutes)
          : 0) +
        (String(left.platform ?? "") === String(candidate.platform ?? "") ? 0 : 10) +
        (sameRoute(left.route, candidate.route) ? 0 : 5);
      if (score < bestScore) {
        bestScore = score;
        bestIndex = index;
      }
    }
    matched.push([left, right.splice(bestIndex, 1)[0]]);
  }
  return { matched, leftOnly, rightOnly: right };
}

function rowDiff(api, web) {
  const realtimeDelta = minuteDelta(
    api.realtime_boarding_time,
    web.realtime_boarding_time,
  );
  const delayDelta =
    typeof api.delay_minutes === "number" && typeof web.delay_minutes === "number"
      ? web.delay_minutes - api.delay_minutes
      : undefined;
  const platformSame = String(api.platform ?? "") === String(web.platform ?? "");
  const routeSame = sameRoute(api.route, web.route);
  const delaySame = delayDelta === undefined || delayDelta === 0;
  const realtimeSame = realtimeDelta === undefined || realtimeDelta === 0;
  return {
    probe_id: api.probe_id,
    query_route: api.query_route,
    role: api.role,
    display_label: api.display_label,
    planned_boarding_time: api.planned_boarding_time,
    api_realtime_boarding_time: api.realtime_boarding_time,
    web_realtime_boarding_time: web.realtime_boarding_time,
    realtime_delta_minutes: realtimeDelta,
    api_delay_minutes: api.delay_minutes,
    web_delay_minutes: web.delay_minutes,
    delay_delta_minutes: delayDelta,
    api_platform: api.platform,
    web_platform: web.platform,
    platform_same: platformSame,
    route_same: routeSame,
    core_same: delaySame && realtimeSame && platformSame,
  };
}

function summarize(run) {
  const discrepancies = run.probes.flatMap((probe) =>
    probe.comparison.discrepancies.map((row) => row),
  );
  const allCompared = run.probes.flatMap((probe) => probe.comparison.compared_rows);
  const apiOnly = run.probes.flatMap((probe) => probe.comparison.api_only_rows);
  const webOnly = run.probes.flatMap((probe) => probe.comparison.web_only_rows);
  const delayDeltas = allCompared.map((row) => row.delay_delta_minutes).filter(isNumber);
  const realtimeDeltas = allCompared
    .map((row) => row.realtime_delta_minutes)
    .filter(isNumber);
  return {
    operation: "dbhopper_user_visible_backend_parity",
    run_id: run.run_id,
    run_dir: run.run_dir,
    fixed_query_time: run.fixed_query_time,
    retrieval_contract: {
      mode: "programmatic DBhopper function calls",
      function: "runDbDelayQuery",
      api_provider: "db-timetables",
      web_provider: "bahn-web",
      web_transport:
        "DBhopper-owned Playwright page-context fetch; no agent browser driving",
    },
    comparison_contract: {
      table_compared: "DBhopper db_delay_query table_rows",
      user_visible_identity_key: [
        "role",
        "display_label",
        "planned_boarding_time",
        "boarding_station",
        "destination_station",
      ],
      ignored_identity_fields: [
        "source",
        "train_number",
        "technical_category",
        "operator",
        "route_confidence",
      ],
      sorted_before_comparison_by: [
        "planned_boarding_time",
        "delay_minutes",
        "display_label",
        "role",
        "boarding_station",
        "destination_station",
      ],
      core_user_values_compared: [
        "realtime_boarding_time",
        "delay_minutes",
        "platform",
      ],
      route_path_compared_separately: true,
    },
    probe_count: run.probes.length,
    api_success_count: run.probes.filter((probe) => probe.api.ok).length,
    web_success_count: run.probes.filter((probe) => probe.web.ok).length,
    both_success_count: run.probes.filter((probe) => probe.api.ok && probe.web.ok)
      .length,
    api_elapsed_ms: stats(run.probes.map((probe) => probe.api.elapsed_ms)),
    web_elapsed_ms: stats(run.probes.map((probe) => probe.web.elapsed_ms)),
    api_total_rows: sum(run.probes.map((probe) => probe.comparison.api_row_count)),
    web_total_rows: sum(run.probes.map((probe) => probe.comparison.web_row_count)),
    matched_user_visible_rows: sum(
      run.probes.map((probe) => probe.comparison.matched_row_count),
    ),
    api_only_user_visible_rows: apiOnly.length,
    web_only_user_visible_rows: webOnly.length,
    matched_core_same_rows: allCompared.filter((row) => row.core_same).length,
    matched_full_same_rows: allCompared.filter((row) => row.core_same && row.route_same)
      .length,
    rows_with_core_user_discrepancy: allCompared.filter((row) => !row.core_same).length,
    rows_with_route_path_discrepancy: allCompared.filter((row) => !row.route_same).length,
    rows_with_delay_discrepancy: allCompared.filter(
      (row) => row.delay_delta_minutes !== undefined && row.delay_delta_minutes !== 0,
    ).length,
    rows_with_realtime_discrepancy: allCompared.filter(
      (row) =>
        row.realtime_delta_minutes !== undefined &&
        row.realtime_delta_minutes !== 0,
    ).length,
    rows_with_platform_discrepancy: allCompared.filter((row) => !row.platform_same)
      .length,
    delay_delta_minutes: stats(delayDeltas),
    realtime_delta_minutes: stats(realtimeDeltas),
    failed_api_probe_ids: run.probes
      .filter((probe) => !probe.api.ok)
      .map((probe) => probe.id),
    failed_web_probe_ids: run.probes
      .filter((probe) => !probe.web.ok)
      .map((probe) => probe.id),
  };
}

async function writeOutputs(runDir, run) {
  await fs.mkdir(runDir, { recursive: true });
  await fs.writeFile(
    path.join(runDir, "run.json"),
    `${JSON.stringify(run, null, 2)}\n`,
  );
  await fs.writeFile(
    path.join(runDir, "summary.json"),
    `${JSON.stringify(run.summary, null, 2)}\n`,
  );
  await fs.writeFile(
    path.join(runDir, "per-probe-summary.csv"),
    perProbeCsv(run.probes),
  );
}

function perProbeCsv(probes) {
  const columns = [
    "id",
    "departure_station",
    "arrival_station",
    "api_ok",
    "web_ok",
    "api_elapsed_ms",
    "web_elapsed_ms",
    "api_row_count",
    "web_row_count",
    "matched_row_count",
    "api_only_row_count",
    "web_only_row_count",
    "core_same_count",
    "full_same_count",
  ];
  const rows = probes.map((probe) =>
    [
      probe.id,
      probe.departure_station,
      probe.arrival_station,
      probe.api.ok,
      probe.web.ok,
      probe.api.elapsed_ms,
      probe.web.elapsed_ms,
      probe.comparison.api_row_count,
      probe.comparison.web_row_count,
      probe.comparison.matched_row_count,
      probe.comparison.api_only_row_count,
      probe.comparison.web_only_row_count,
      probe.comparison.core_same_count,
      probe.comparison.full_same_count,
    ].map(csvValue).join(","),
  );
  return `${columns.join(",")}\n${rows.join("\n")}\n`;
}

function userRowSort(left, right) {
  return (
    compareText(left.planned_boarding_time, right.planned_boarding_time) ||
    compareNumber(left.delay_minutes, right.delay_minutes) ||
    compareText(left.display_label, right.display_label) ||
    compareText(left.role, right.role) ||
    compareText(left.boarding_station, right.boarding_station) ||
    compareText(left.destination_station, right.destination_station)
  );
}

function localParts(date, timeZone) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const get = (type) => parts.find((part) => part.type === type)?.value ?? "";
  return {
    date: `${get("year")}-${get("month")}-${get("day")}`,
    hour: get("hour"),
    minute: get("minute"),
    second: get("second"),
  };
}

function minuteDelta(left, right) {
  const leftMs = Date.parse(left ?? "");
  const rightMs = Date.parse(right ?? "");
  return Number.isFinite(leftMs) && Number.isFinite(rightMs)
    ? Math.round((rightMs - leftMs) / 60000)
    : undefined;
}

function stats(values) {
  const sorted = values.filter(isNumber).sort((left, right) => left - right);
  if (!sorted.length) {
    return { count: 0 };
  }
  return {
    count: sorted.length,
    min: sorted[0],
    median: sorted[Math.floor((sorted.length - 1) * 0.5)],
    p90: sorted[Math.floor((sorted.length - 1) * 0.9)],
    max: sorted.at(-1),
    mean: Math.round((sum(sorted) / sorted.length) * 100) / 100,
  };
}

function csvValue(value) {
  if (value === undefined || value === null) {
    return "";
  }
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function sameRoute(left, right) {
  return JSON.stringify(left ?? []) === JSON.stringify(right ?? []);
}

function compareText(left, right) {
  return String(left ?? "").localeCompare(String(right ?? ""));
}

function compareNumber(left, right) {
  const leftNumber = typeof left === "number" ? left : Number.POSITIVE_INFINITY;
  const rightNumber = typeof right === "number" ? right : Number.POSITIVE_INFINITY;
  return leftNumber - rightNumber;
}

function isNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function sum(values) {
  return values.filter(isNumber).reduce((total, value) => total + value, 0);
}

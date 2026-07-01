import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  isTimetablesCredentialError,
  runDbDelayQuery,
  runDbDelayProviderParityProbe,
  selectDelayProvider,
  shouldFallbackToProvider,
} from "../dist/db-delay-tools.js";
import {
  writeCredentialsFixture,
  writePrivateSettingsFixture,
} from "./helpers/private-settings.js";
import { jsonResponse, xmlResponse } from "./helpers/responses.js";

describe("db delay provider selection", () => {
  it("selects Timetables for auto when credentials exist", () => {
    const selected = selectDelayProvider("auto", {}, true);

    assert.equal(selected.selected, "db-timetables");
    assert.equal(selected.requested, "auto");
  });

  it("uses configured fallback for Timetables credential errors only", () => {
    const selected = selectDelayProvider("auto", {}, true);

    assert.equal(shouldFallbackToProvider("bahn-web", selected, credentialError()), true);
    assert.equal(shouldFallbackToProvider("none", selected, credentialError()), false);
    assert.equal(shouldFallbackToProvider("bahn-web", selected, new Error("HTTP 500")), false);
    assert.equal(isTimetablesCredentialError(new Error("Invalid client id or secret")), true);
  });

  it("uses configured fallback only when it is enabled", () => {
    const selected = selectDelayProvider("db-timetables", {}, true);
    const credentialError = new Error("DB Timetables request failed with HTTP 401");

    assert.equal(shouldFallbackToProvider("none", selected, credentialError), false);
    assert.equal(shouldFallbackToProvider("bahn-web", selected, credentialError), true);
    assert.equal(shouldFallbackToProvider("bahn-web", selected, new Error("HTTP 500")), false);
  });

  it("compares cleaned rows from both delay providers", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "dbhopper-parity-"));
    await writePrivateFiles(root);

    const result = await runDbDelayProviderParityProbe(
      {
        departure_station: "Hamm(Westf)Hbf",
        arrival_station: "Koeln Hbf",
        query_time: "22:00",
        service_date: "2026-06-10",
        delay_threshold_minutes: 20,
        include_table_rows: true,
      },
      {
        workspaceRoot: root,
        bahnWebTransport: "fetch",
        fetchImpl: fakeParityFetch,
        timeZone: "Europe/Berlin",
      },
    );

    assert.equal(result.ok, true);
    assert.equal(result.api_ready, true);
    assert.equal(result.web_ready, true);
    assert.equal(result.comparison.same, true);
    assert.equal(result.comparison.same_identity, true);
    assert.equal(result.comparison.official_row_count, 2);
    assert.equal(result.official.table_rows[0].label, "RE1");
    assert.equal(result.official.table_rows[0].public_line, "RE1");
    assert.equal(result.official.table_rows[0].public_category, "RE");
    assert.equal(result.official.table_rows[0].technical_category, "NX");
    assert.equal(result.official.table_rows[0].train_number, "26838");
  });

  it("adds local Berlin times and keeps replacement rows distinct", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "dbhopper-local-time-"));
    await writePrivateFiles(root);

    const result = await runDbDelayQuery(
      {
        provider: "db-timetables",
        departure_station: "Münster(Westf)Hbf",
        arrival_station: "Düsseldorf Hbf",
        query_time: "17:59",
        service_date: "2026-06-16",
        window_width_minutes: 60,
        delay_threshold_minutes: 20,
      },
      {
        workspaceRoot: root,
        fetchImpl: fakeMunsterTimetablesFetch,
        timeZone: "Europe/Berlin",
      },
    );

    assert.equal(result.ok, true);
    assert.equal(result.normalized_input.query_time, "2026-06-16T15:59:00.000Z");
    assert.equal(
      result.normalized_input.query_time_local,
      "2026-06-16T17:59:00+02:00",
    );
    assert.equal(result.window.lower_bound, "2026-06-16T14:59:00.000Z");
    assert.equal(result.window.lower_bound_local, "2026-06-16T16:59:00+02:00");
    assert.equal(result.window.query_time, "2026-06-16T15:59:00.000Z");
    assert.equal(result.window.query_time_local, "2026-06-16T17:59:00+02:00");
    assert.equal(result.window.upper_bound, "2026-06-16T16:59:00.000Z");
    assert.equal(result.window.upper_bound_local, "2026-06-16T18:59:00+02:00");
    assert.equal(result.window.local_time_zone, "Europe/Berlin");
    assert.equal(result.local_time.time_zone, "Europe/Berlin");
    assert.equal(result.local_time.query_time, "2026-06-16T17:59:00+02:00");
    assert.equal(
      result.local_time.window_lower_bound,
      "2026-06-16T16:59:00+02:00",
    );
    assert.equal(
      result.local_time.window_upper_bound,
      "2026-06-16T18:59:00+02:00",
    );
    assert.equal(result.cleaned_summary.delayed_regional_count, 0);
    assert.equal(result.cleaned_summary.replacement_count, 2);
    assert.equal(result.cleaned_summary.replacements_without_delayed_regional, true);
    assert.match(
      result.cleaned_summary.candidate_roles.reachable_replacement,
      /ICE\/IC\/EC replacement/,
    );

    const [ice, ic] = result.table_rows;
    assert.equal(ice.role, "reachable_replacement");
    assert.equal(ice.label, "ICE 615");
    assert.equal(ice.planned_boarding_time, "2026-06-16T16:02:00.000Z");
    assert.equal(ice.planned_boarding_time_local, "2026-06-16T18:02:00+02:00");
    assert.equal(ice.realtime_boarding_time, "2026-06-16T16:03:00.000Z");
    assert.equal(ice.realtime_boarding_time_local, "2026-06-16T18:03:00+02:00");
    assert.equal(ice.local_time_zone, "Europe/Berlin");
    assert.equal(ic.realtime_boarding_time_local, "2026-06-16T18:30:00+02:00");
    assert.equal(
      result.replacement_candidates[0].boarding_station.realtime_departure_local,
      "2026-06-16T18:03:00+02:00",
    );
  });
});

function credentialError() {
  return new Error("DB Timetables request failed with HTTP 401");
}

async function writePrivateFiles(root) {
  await writePrivateSettingsFixture(root);
  await writeCredentialsFixture(root, {
    clientId: "client-id",
    apiKey: "api-key",
  });
}

async function fakeParityFetch(url) {
  const text = String(url);
  if (text.includes("/reiseloesung/orte")) {
    return jsonResponse([
      {
        extId: "8000149",
        id: "A=1@O=Hamm(Westf)Hbf@L=8000149@",
        name: "Hamm(Westf)Hbf",
        products: ["ICE", "EC_IC", "REGIONAL"],
        type: "ST",
      },
      {
        extId: "8000207",
        id: "A=1@O=Koeln Hbf@L=8000207@",
        name: "Köln Hbf",
        products: ["ICE", "EC_IC", "REGIONAL"],
        type: "ST",
      },
    ]);
  }
  if (text.includes("/reiseloesung/abfahrten")) {
    return jsonResponse({
      entries: [
        {
          bahnhofsId: "8000149",
          zeit: "2026-06-10T22:18:00",
          ezZeit: "2026-06-10T22:45:00",
          gleis: "1",
          ueber: ["Hamm(Westf)Hbf", "Dortmund Hbf", "Köln Hbf"],
          journeyId: "journey-re1",
          verkehrmittel: {
            name: "26838",
            linienNummer: "RE1",
            mittelText: "RE1",
            langText: "26838",
            produktGattung: "REGIONAL",
          },
          terminus: "Aachen Hbf",
        },
        {
          bahnhofsId: "8000149",
          zeit: "2026-06-10T22:30:00",
          ezZeit: "2026-06-10T22:32:00",
          gleis: "10",
          ueber: ["Hamm(Westf)Hbf", "Dortmund Hbf", "Köln Hbf"],
          journeyId: "journey-ice",
          verkehrmittel: {
            name: "ICE 542",
            linienNummer: "10",
            mittelText: "ICE 542",
            langText: "ICE 542",
            produktGattung: "ICE",
          },
          terminus: "Köln Hbf",
        },
      ],
    });
  }
  if (text.includes("/station/")) {
    return xmlResponse(`
      <stations>
        <station name="Hamm(Westf)Hbf" eva="8000149" ds100="EHM" />
        <station name="Köln Hbf" eva="8000207" ds100="KK" />
      </stations>
    `);
  }
  if (text.includes("/plan/8000149/260610/22")) {
    return xmlResponse(`
      <timetable station="Hamm(Westf)Hbf" eva="8000149">
        <s id="journey-re1">
          <tl o="NXRE" c="NX" n="26838" />
          <dp pt="2606102218" pp="1" l="RE1" fb="RE1"
            ppth="Hamm(Westf)Hbf|Dortmund Hbf|Köln Hbf|Aachen Hbf" />
        </s>
        <s id="journey-ice">
          <tl c="ICE" n="542" l="10" />
          <dp pt="2606102230" pp="10"
            ppth="Hamm(Westf)Hbf|Dortmund Hbf|Köln Hbf" />
        </s>
      </timetable>
    `);
  }
  if (text.includes("/fchg/8000149")) {
    return xmlResponse(`
      <timetable station="Hamm(Westf)Hbf" eva="8000149">
        <s id="journey-re1"><dp ct="2606102245" cp="1" /></s>
        <s id="journey-ice"><dp ct="2606102232" cp="10" /></s>
      </timetable>
    `);
  }
  if (text.includes("/rchg/8000149") || text.includes("/plan/8000149/")) {
    return new Response("", { status: 404 });
  }
  return new Response("not found", { status: 404 });
}

async function fakeMunsterTimetablesFetch(url) {
  const parsed = new URL(String(url));
  const path = decodeURIComponent(parsed.pathname);
  if (path.includes("/station/Münster(Westf)Hbf")) {
    return xmlResponse(`
      <stations>
        <station name="Münster(Westf)Hbf" eva="8000263" ds100="EMSTP" />
      </stations>
    `);
  }
  if (path.includes("/station/Düsseldorf Hbf")) {
    return xmlResponse(`
      <stations>
        <station name="Düsseldorf Hbf" eva="8000085" ds100="KD" />
      </stations>
    `);
  }
  if (path.includes("/plan/8000263/260616/18")) {
    return xmlResponse(`
      <timetable station="Münster(Westf)Hbf" eva="8000263">
        <s id="ice-615">
          <tl c="ICE" n="615" />
          <dp pt="2606161802" pp="9"
            ppth="Münster(Westf)Hbf|Dortmund Hbf|Bochum Hbf|Essen Hbf|Duisburg Hbf|Düsseldorf Hbf|Köln Hbf" />
        </s>
        <s id="ic-2207">
          <tl c="IC" n="2207" />
          <dp pt="2606161830" pp="8"
            ppth="Münster(Westf)Hbf|Recklinghausen Hbf|Herne-Wanne-Eickel Hbf|Gelsenkirchen Hbf|Oberhausen Hbf|Duisburg Hbf|Düsseldorf Hbf|Köln Hbf" />
        </s>
      </timetable>
    `);
  }
  if (path.includes("/fchg/8000263")) {
    return xmlResponse(`
      <timetable station="Münster(Westf)Hbf" eva="8000263">
        <s id="ice-615"><dp ct="2606161803" cp="9" /></s>
      </timetable>
    `);
  }
  if (path.includes("/rchg/8000263") || path.includes("/plan/8000263/")) {
    return new Response("", { status: 404 });
  }
  return new Response("not found", { status: 404 });
}

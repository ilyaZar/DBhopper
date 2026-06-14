import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  isTimetablesCredentialError,
  runDbDelayProviderParityProbe,
  selectDelayProvider,
  shouldFallbackToProvider,
} from "../dist/db-delay-tools.js";
import { writePrivateSettingsFixture } from "./helpers/private-settings.js";
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
});

function credentialError() {
  return new Error("DB Timetables request failed with HTTP 401");
}

async function writePrivateFiles(root) {
  const privateDir = path.join(root, "assets", "private");
  const credentialsDir = path.join(privateDir, "credentials");
  await fs.mkdir(credentialsDir, { recursive: true });
  await writePrivateSettingsFixture(root);
  await fs.writeFile(
    path.join(credentialsDir, "credentials-01.toml"),
    [
      'ID_USR = "01"',
      "",
      "[bahn_api]",
      'client_id = "client-id"',
      'api_key = "api-key"',
      "",
    ].join("\n"),
    "utf8",
  );
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

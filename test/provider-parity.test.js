import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { createBahnWebProvider } from "../dist/bahn-web.js";
import { createTimetablesProvider } from "../dist/db-timetables.js";
import {
  collectProviderJourneys,
  filterLongDistanceReplacements,
  filterRegionalDelayedCandidates,
} from "../dist/db-delay.js";
import { jsonResponse, xmlResponse } from "./helpers/responses.js";

const hamm = { name: "Hamm(Westf)Hbf", evaNo: "8000149" };
const koln = { name: "Koeln Hbf", evaNo: "8000207" };

const timeWindow = {
  lowerBound: new Date("2026-06-10T19:15:00.000Z"),
  queryTime: new Date("2026-06-10T20:00:00.000Z"),
  upperBound: new Date("2026-06-10T20:45:00.000Z"),
};

const query = {
  departureStation: hamm,
  arrivalStation: koln,
  queryTime: "2026-06-10T22:00:00+02:00",
  windowWidthMinutes: 45,
  delayThresholdMinutes: 20,
  regionalTypes: ["RE"],
  longDistanceReplacementTypes: ["ICE", "IC", "EC"],
};

describe("delay provider parity", () => {
  it("feeds the filters with the same normalized data shape", async () => {
    const bahnWeb = createBahnWebProvider({
      bahnWebTransport: "fetch",
      fetchImpl: fakeBahnWebFetch,
      timeZone: "Europe/Berlin",
    });
    const timetables = createTimetablesProvider({
      dbClientId: "client-id",
      dbApiKey: "api-key",
      fetchImpl: fakeTimetablesFetch,
      timeZone: "Europe/Berlin",
    });

    const webStation = (await bahnWeb.resolveStation("Hamm(Westf)Hbf"))[0];
    const timetableStation = (await timetables.resolveStation("Hamm(Westf)Hbf"))[0];
    const web = await collectProviderJourneys(bahnWeb, webStation, timeWindow);
    const official = await collectProviderJourneys(
      timetables,
      timetableStation,
      timeWindow,
    );

    assert.deepEqual(comparableJourneys(official.journeys), comparableJourneys(web.journeys));

    assert.deepEqual(filterSummary(official.journeys), {
      delayedRegional: ["RE1"],
      replacements: ["ICE 542"],
      delayMinutes: [27],
    });
    assert.deepEqual(filterSummary(web.journeys), filterSummary(official.journeys));

    const officialRegional = official.journeys.find((journey) => journey.id === "journey-re1");
    assert.equal(officialRegional.label, "RE1");
    assert.equal(officialRegional.publicLine, "RE1");
    assert.equal(officialRegional.publicCategory, "RE");
    assert.equal(officialRegional.technicalCategory, "NX");
    assert.equal(officialRegional.operator, "NXRE");
  });

  it("resolves common ASCII station aliases through Timetables fallback lookup", async () => {
    const timetables = createTimetablesProvider({
      dbClientId: "client-id",
      dbApiKey: "api-key",
      fetchImpl: fakeTimetablesFetch,
      timeZone: "Europe/Berlin",
    });

    const matches = await timetables.resolveStation("Koeln Hbf");

    assert.equal(matches[0].name, "Köln Hbf");
    assert.equal(matches[0].evaNo, "8000207");
  });
});

function comparableJourneys(journeys) {
  return journeys
    .map((journey) => ({
      category: journey.category,
      displayLabel: journey.displayLabel,
      publicLine: journey.publicLine,
      publicCategory: journey.publicCategory,
      number: journey.number,
      lineNumber: journey.lineNumber,
      label: journey.label,
      route: journey.stops.map((stop) => stop.station.name),
      boarding: {
        plannedDeparture: journey.stops[0].plannedDeparture,
        realtimeDeparture: journey.stops[0].realtimeDeparture,
      },
    }))
    .sort((left, right) => String(left.label).localeCompare(String(right.label)));
}

function filterSummary(journeys) {
  const regional = filterRegionalDelayedCandidates(journeys, query);
  const replacements = filterLongDistanceReplacements(journeys, query);
  return {
    delayedRegional: regional.candidates.map((candidate) => candidate.journey.label),
    replacements: replacements.replacements.map((replacement) => replacement.journey.label),
    delayMinutes: regional.candidates.map((candidate) => candidate.boardingDelayMinutes),
  };
}

async function fakeBahnWebFetch(url) {
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
          ueber: [
            "Hamm(Westf)Hbf",
            "Dortmund Hbf",
            "Bochum Hbf",
            "Essen Hbf",
            "Köln Hbf",
          ],
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
          ueber: [
            "Hamm(Westf)Hbf",
            "Dortmund Hbf",
            "Bochum Hbf",
            "Essen Hbf",
            "Köln Hbf",
          ],
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
  return new Response("not found", { status: 404 });
}

async function fakeTimetablesFetch(url) {
  const text = String(url);
  if (text.includes("/station/Hamm")) {
    return xmlResponse(`
      <stations>
        <station name="Hamm(Westf)Hbf" eva="8000149" ds100="EHM" />
      </stations>
    `);
  }
  if (text.includes("/station/Koeln%20Hbf")) {
    return xmlResponse("<stations></stations>");
  }
  if (text.includes("/station/K%C3%B6ln%20Hbf")) {
    return xmlResponse(`
      <stations>
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
            ppth="Hamm(Westf)Hbf|Dortmund Hbf|Bochum Hbf|Essen Hbf|Köln Hbf|Aachen Hbf" />
        </s>
        <s id="journey-ice">
          <tl c="ICE" n="542" l="10" />
          <dp pt="2606102230" pp="10"
            ppth="Hamm(Westf)Hbf|Dortmund Hbf|Bochum Hbf|Essen Hbf|Köln Hbf" />
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

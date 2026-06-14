import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  createBahnWebProvider,
  parseBahnWebDepartures,
  parseBahnWebStations,
} from "../dist/bahn-web.js";
import {
  filterLongDistanceReplacements,
  filterRegionalDelayedCandidates,
} from "../dist/db-delay.js";
import { jsonResponse } from "./helpers/responses.js";

const stationFixture = [
  {
    extId: "8000149",
    id: "A=1@O=Hamm(Westf)Hbf@L=8000149@",
    name: "Hamm(Westf)Hbf",
    products: ["ICE", "EC_IC", "REGIONAL"],
    type: "ST",
  },
];

const departureFixture = {
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
      meldungen: [],
      verkehrmittel: {
        name: "26838",
        linienNummer: "RE1",
        kurzText: "NX",
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
      meldungen: [],
      verkehrmittel: {
        name: "ICE 542",
        linienNummer: "10",
        kurzText: "ICE",
        mittelText: "ICE 542",
        langText: "ICE 542",
        produktGattung: "ICE",
      },
      terminus: "Köln Hbf",
    },
  ],
};

const duplicateDepartureFixture = {
  entries: [
    {
      ...departureFixture.entries[0],
      ezZeit: "2026-06-10T22:18:00",
      journeyId: "journey-re1-stale",
    },
    departureFixture.entries[0],
    departureFixture.entries[1],
  ],
};

const hamm = { name: "Hamm(Westf)Hbf", evaNo: "8000149" };
const koln = { name: "Koeln Hbf", evaNo: "8000207" };

describe("bahn-web provider parsing", () => {
  it("maps station lookup rows to station refs", () => {
    const stations = parseBahnWebStations(stationFixture);

    assert.equal(stations.length, 1);
    assert.equal(stations[0].name, "Hamm(Westf)Hbf");
    assert.equal(stations[0].evaNo, "8000149");
    assert.equal(stations[0].source, "bahn-web");
  });

  it("maps departure rows to normalized journeys", () => {
    const events = parseBahnWebDepartures(departureFixture, hamm, "Europe/Berlin");
    const regional = events[0].journey;

    assert.equal(events.length, 2);
    assert.equal(regional.category, "RE");
    assert.equal(regional.lineNumber, "RE1");
    assert.equal(regional.publicLine, "RE1");
    assert.equal(regional.publicCategory, "RE");
    assert.equal(regional.technicalCategory, "NX");
    assert.equal(regional.displayLabel, "RE1");
    assert.equal(events[0].plannedDeparture, "2026-06-10T20:18:00.000Z");
    assert.equal(events[0].realtimeDeparture, "2026-06-10T20:45:00.000Z");
    assert.deepEqual(
      regional.stops.map((stop) => stop.station.name),
      [
        "Hamm(Westf)Hbf",
        "Dortmund Hbf",
        "Bochum Hbf",
        "Essen Hbf",
        "Köln Hbf",
        "Aachen Hbf",
      ],
    );
  });

  it("feeds deterministic route, delay, and replacement filters", async () => {
    const provider = createBahnWebProvider({
      bahnWebTransport: "fetch",
      fetchImpl: fakeFetch,
      timeZone: "Europe/Berlin",
    });
    const station = (await provider.resolveStation("Hamm(Westf)Hbf"))[0];
    const events = await provider.queryStationBoard(station, {
      lowerBound: new Date("2026-06-10T19:15:00.000Z"),
      queryTime: new Date("2026-06-10T20:00:00.000Z"),
      upperBound: new Date("2026-06-10T20:45:00.000Z"),
    });
    assert.equal(events.length, 2);

    const journeys = await Promise.all(
      events.map((event) => provider.fetchJourneyDetails(event)),
    );
    const query = {
      departureStation: station,
      arrivalStation: koln,
      queryTime: "2026-06-10T22:00:00+02:00",
      windowWidthMinutes: 45,
      delayThresholdMinutes: 20,
      regionalTypes: ["RE"],
      longDistanceReplacementTypes: ["ICE", "IC", "EC"],
    };

    const regional = filterRegionalDelayedCandidates(journeys, query);
    const replacements = filterLongDistanceReplacements(journeys, query);

    assert.equal(regional.candidates.length, 1);
    assert.equal(regional.candidates[0].boardingDelayMinutes, 27);
    assert.equal(replacements.replacements.length, 1);
    assert.equal(replacements.replacements[0].journey.label, "ICE 542");
  });
});

async function fakeFetch(url) {
  const text = String(url);
  if (text.includes("/reiseloesung/orte")) {
    return jsonResponse(stationFixture);
  }
  if (text.includes("/reiseloesung/abfahrten")) {
    return jsonResponse(duplicateDepartureFixture);
  }
  return new Response("not found", { status: 404 });
}

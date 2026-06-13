import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  delayAtBoardingStation,
  filterLongDistanceReplacements,
  filterRegionalDelayedCandidates,
  isReachableAtQueryTime,
  isWithinInclusiveWindow,
  trainServesRouteInOrder,
} from "../dist/db-delay.js";

const hamm = { name: "Hamm(Westf)Hbf" };
const koln = { name: "Koeln Hbf" };

describe("db delay filtering", () => {
  it("uses inclusive lower and upper window bounds", () => {
    const query = baseQuery();

    assert.equal(
      isWithinInclusiveWindow(
        { station: hamm, plannedDeparture: "2026-05-25T15:45:00.000Z" },
        query,
      ),
      true,
    );
    assert.equal(
      isWithinInclusiveWindow(
        { station: hamm, plannedDeparture: "2026-05-25T17:15:00.000Z" },
        query,
      ),
      true,
    );
    assert.equal(
      isWithinInclusiveWindow(
        { station: hamm, plannedDeparture: "2026-05-25T17:15:01.000Z" },
        query,
      ),
      false,
    );
  });

  it("clips the lower side with force_query_departure_time", () => {
    const journey = regionalJourney({
      plannedDeparture: "2026-05-25T16:00:00.000Z",
      realtimeDeparture: "2026-05-25T16:00:00.000Z",
    });

    assert.equal(
      filterRegionalDelayedCandidates([journey], {
        ...baseQuery(),
        delayThresholdMinutes: 0,
        forceQueryDepartureTime: false,
      }).candidates.length,
      1,
    );
    assert.equal(
      filterRegionalDelayedCandidates([journey], {
        ...baseQuery(),
        delayThresholdMinutes: 0,
        forceQueryDepartureTime: true,
      }).candidates.length,
      0,
    );
  });

  it("includes delayed earlier trains that are still reachable", () => {
    const journey = regionalJourney({
      plannedDeparture: "2026-05-25T16:00:00.000Z",
      realtimeDeparture: "2026-05-25T16:45:00.000Z",
    });
    const query = { ...baseQuery(), forceQueryDepartureTime: true };

    const result = filterRegionalDelayedCandidates([journey], query);

    assert.equal(result.candidates.length, 1);
    assert.equal(result.candidates[0].boardingDelayMinutes, 45);
    assert.equal(isReachableAtQueryTime(journey.stops[0], query), true);
  });

  it("requires the destination after the boarding station", () => {
    const valid = regionalJourney({});
    const invalid = {
      ...valid,
      id: "RE-invalid",
      stops: [valid.stops[1], valid.stops[0]],
    };

    assert.equal(trainServesRouteInOrder(valid, hamm, koln), true);
    assert.equal(trainServesRouteInOrder(invalid, hamm, koln), false);
  });

  it("does not treat arrival-only board rows as boardable departures", () => {
    const journey = regionalJourney({});
    delete journey.stops[0].plannedDeparture;
    delete journey.stops[0].realtimeDeparture;
    journey.stops[0].plannedArrival = "2026-05-25T16:10:00.000Z";
    journey.stops[0].realtimeArrival = "2026-05-25T16:32:00.000Z";

    const result = filterRegionalDelayedCandidates([journey], baseQuery());

    assert.equal(result.candidates.length, 0);
    assert.ok(
      result.discarded[0].reasons.includes("boarding station has no departure event"),
    );
  });

  it("measures delay at the boarding station", () => {
    const journey = regionalJourney({
      plannedDeparture: "2026-05-25T16:10:00.000Z",
      realtimeDeparture: "2026-05-25T16:32:00.000Z",
    });

    assert.equal(delayAtBoardingStation(journey, hamm), 22);
  });

  it("uses public line category for regional filters before technical category", () => {
    const journey = regionalJourney({
      id: "NX-re6",
      plannedDeparture: "2026-05-25T16:10:00.000Z",
      realtimeDeparture: "2026-05-25T16:32:00.000Z",
    });
    journey.category = "RE";
    journey.lineNumber = "RE6";
    journey.publicLine = "RE6";
    journey.publicCategory = "RE";
    journey.technicalCategory = "NX";
    journey.operator = "NXRE";
    journey.label = "RE6";

    const result = filterRegionalDelayedCandidates([journey], baseQuery());

    assert.equal(result.candidates.length, 1);
    assert.equal(result.candidates[0].journey.publicLine, "RE6");
    assert.equal(result.candidates[0].journey.technicalCategory, "NX");
  });

  it("filters direct reachable long-distance replacements", () => {
    const reachable = longDistanceJourney({
      id: "IC-reachable",
      plannedDeparture: "2026-05-25T16:10:00.000Z",
      realtimeDeparture: "2026-05-25T16:35:00.000Z",
    });
    const missed = longDistanceJourney({
      id: "IC-missed",
      plannedDeparture: "2026-05-25T16:10:00.000Z",
      realtimeDeparture: "2026-05-25T16:20:00.000Z",
    });

    const result = filterLongDistanceReplacements(
      [reachable, missed, regionalJourney({})],
      baseQuery(),
    );

    assert.deepEqual(
      result.replacements.map((replacement) => replacement.journey.id),
      ["IC-reachable"],
    );
  });
});

function baseQuery() {
  return {
    departureStation: hamm,
    arrivalStation: koln,
    queryTime: "2026-05-25T18:30:00+02:00",
    windowWidthMinutes: 45,
    delayThresholdMinutes: 20,
    forceQueryDepartureTime: false,
    regionalTypes: ["RE"],
    longDistanceReplacementTypes: ["ICE", "IC", "EC"],
  };
}

function regionalJourney({
  id = "RE-test",
  plannedDeparture = "2026-05-25T16:05:00.000Z",
  realtimeDeparture = "2026-05-25T16:25:00.000Z",
}) {
  return {
    id,
    category: "RE",
    number: "1",
    lineNumber: "RE 1",
    label: "RE 1",
    routeConfidence: "full_stop_list",
    stops: [
      {
        station: hamm,
        plannedDeparture,
        realtimeDeparture,
      },
      {
        station: { name: "Dortmund Hbf" },
      },
      {
        station: koln,
        plannedArrival: "2026-05-25T17:20:00.000Z",
        realtimeArrival: "2026-05-25T17:40:00.000Z",
      },
    ],
  };
}

function longDistanceJourney({
  id,
  plannedDeparture,
  realtimeDeparture,
}) {
  return {
    id,
    category: "IC",
    number: "2045",
    label: "IC 2045",
    routeConfidence: "full_stop_list",
    stops: [
      {
        station: hamm,
        plannedDeparture,
        realtimeDeparture,
      },
      {
        station: koln,
        plannedArrival: "2026-05-25T17:10:00.000Z",
      },
    ],
  };
}

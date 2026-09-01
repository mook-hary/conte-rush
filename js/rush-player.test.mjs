import assert from "node:assert/strict";
import test from "node:test";
import { compareCutNumbers, orderCutsForPlayback } from "./cut-order.js";
import { buildSnapshot, inspectCuts } from "./rush-player.js";

function cut(id, cutNumber, durationFrames = 24, panelIds = ["panel-1"]) {
  return { id, cutNumber, durationFrames, panelIds };
}

function timeline(cutId, panelId = "panel-1") {
  return {
    cutId,
    placements: [{ id: `pl-${cutId}`, panelId, startFrame: 0 }],
  };
}

test("cutNumber 2 comes before 10 as numbers, not strings", () => {
  assert.ok(compareCutNumbers("2", "10") < 0);
  assert.ok(compareCutNumbers("10", "2") > 0);
  assert.deepEqual(
    orderCutsForPlayback([
      cut("c-10", "10"),
      cut("c-2", "2"),
      cut("c-1", "1"),
    ]).map((item) => item.cutNumber),
    ["1", "2", "10"],
  );
});

test("Player snapshot follows cutNumber, not creation order", () => {
  const cuts = [cut("created-first", "2", 10), cut("created-second", "1", 20)];
  const timelines = {
    "created-first": timeline("created-first"),
    "created-second": timeline("created-second"),
  };
  const snapshot = buildSnapshot(cuts, (id) => timelines[id]);
  assert.deepEqual(
    snapshot.segments.map((segment) => ({
      cutId: segment.cutId,
      cutNumber: segment.cutNumber,
      globalStart: segment.globalStart,
      durationFrames: segment.durationFrames,
    })),
    [
      {
        cutId: "created-second",
        cutNumber: "1",
        globalStart: 0,
        durationFrames: 20,
      },
      {
        cutId: "created-first",
        cutNumber: "2",
        globalStart: 20,
        durationFrames: 10,
      },
    ],
  );
  assert.equal(snapshot.totalFrames, 30);
});

test("sorted snapshot keeps each Cut's Timeline placements", () => {
  const cuts = [
    cut("cut-b", "2", 12, ["panel-b"]),
    cut("cut-a", "1", 8, ["panel-a"]),
  ];
  const timelines = {
    "cut-b": timeline("cut-b", "panel-b"),
    "cut-a": timeline("cut-a", "panel-a"),
  };
  const snapshot = buildSnapshot(cuts, (id) => timelines[id]);
  assert.equal(snapshot.segments[0].cutId, "cut-a");
  assert.equal(snapshot.segments[0].placements[0].panelId, "panel-a");
  assert.equal(snapshot.segments[1].cutId, "cut-b");
  assert.equal(snapshot.segments[1].placements[0].panelId, "panel-b");
});

test("inspectCuts reports issues in cutNumber order", () => {
  const cuts = [cut("later", "2", 24, []), cut("earlier", "1", 24, [])];
  const inspected = inspectCuts(cuts, () => null);
  assert.equal(inspected.ok, false);
  assert.deepEqual(
    inspected.issues.map((issue) => issue.cutNumber),
    ["1", "2"],
  );
});

test("non-numeric cutNumbers stay after numeric ones without string-sort traps", () => {
  assert.deepEqual(
    orderCutsForPlayback([
      cut("a", "A"),
      cut("ten", "10"),
      cut("two", "2"),
    ]).map((item) => item.cutNumber),
    ["2", "10", "A"],
  );
});

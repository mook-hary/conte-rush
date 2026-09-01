import assert from "node:assert/strict";
import test from "node:test";
import { createCutStore } from "./cut-store.js";
import { createMotionStore } from "./motion-store.js";
import { createPanelMediaStore } from "./panel-media-store.js";
import {
  createPanelStore,
  PANEL_SOURCE_DRAWING,
  PANEL_SOURCE_MANUAL,
} from "./panel-store.js";
import { createTimelineStore } from "./timeline-store.js";
import {
  applyDraftToStores,
  DRAFT_SCHEMA_VERSION,
  isQuotaError,
  serializeProjectState,
  validateDraft,
} from "./project-persistence.js";

function pdfBlob() {
  return new Blob([new Uint8Array([37, 80, 68, 70])], { type: "application/pdf" });
}

function imageBlob() {
  return new Blob([new Uint8Array([1, 2, 3, 4])], { type: "image/png" });
}

function validDraft(overrides = {}) {
  const pdf = {
    blob: pdfBlob(),
    fileName: "board.pdf",
    fileSize: 4,
    pageCount: 3,
    ...overrides.pdf,
  };
  const panels = overrides.panels ?? [
    {
      id: "panel-1",
      pageNumber: 1,
      x: 0.1,
      y: 0.1,
      width: 0.4,
      height: 0.4,
      source: PANEL_SOURCE_MANUAL,
    },
  ];
  const cuts = overrides.cuts ?? [
    {
      id: "cut-1",
      cutNumber: "1",
      durationFrames: 24,
      panelIds: ["panel-1"],
    },
  ];
  const timelines = overrides.timelines ?? [
    {
      cutId: "cut-1",
      placements: [{ id: "pl-1", panelId: "panel-1", startFrame: 0 }],
    },
  ];
  const motions = overrides.motions ?? [
    {
      cutId: "cut-1",
      motions: [
        {
          panelId: "panel-1",
          from: { x: 0.5, y: 0.5, scale: 1 },
          to: { x: 0.4, y: 0.4, scale: 1.2 },
          preFixFrames: 0,
          postFixFrames: 0,
        },
      ],
    },
  ];
  const state = serializeProjectState({
    userId: "user-1",
    currentPage: 2,
    panels,
    cuts,
    timelines,
    motions,
    metadata: overrides.metadata ?? {
      timesheetEpisode: "01",
      timesheetTitle: "OP",
      selectedCutId: cuts[0]?.id ?? null,
    },
  });
  return {
    pdf,
    state: { ...state, ...overrides.state },
    media: overrides.media ?? [],
  };
}

test("validateDraft accepts a complete snapshot", () => {
  const result = validateDraft(validDraft(), "user-1");
  assert.equal(result.ok, true);
  assert.equal(result.draft.state.currentPage, 2);
  assert.equal(result.draft.state.metadata.selectedCutId, "cut-1");
});

test("validateDraft rejects unknown schemaVersion", () => {
  const result = validateDraft(
    validDraft({ state: { schemaVersion: 99 } }),
    "user-1",
  );
  assert.equal(result.ok, false);
  assert.match(result.message, /schemaVersion/);
});

test("validateDraft rejects another user's snapshot", () => {
  const result = validateDraft(validDraft(), "user-2");
  assert.equal(result.ok, false);
  assert.match(result.message, /userId/);
});

test("validateDraft rejects missing PDF blob", () => {
  const draft = validDraft();
  draft.pdf.blob = null;
  const result = validateDraft(draft, "user-1");
  assert.equal(result.ok, false);
  assert.match(result.message, /PDF Blob/);
});

test("validateDraft rejects duplicate panel ids", () => {
  const panel = {
    id: "panel-1",
    pageNumber: 1,
    x: 0,
    y: 0,
    width: 0.2,
    height: 0.2,
    source: PANEL_SOURCE_MANUAL,
  };
  const result = validateDraft(
    validDraft({
      panels: [panel, { ...panel }],
      cuts: [],
      timelines: [],
      motions: [],
    }),
    "user-1",
  );
  assert.equal(result.ok, false);
  assert.match(result.message, /重複/);
});

test("validateDraft rejects cut that references a missing panel", () => {
  const result = validateDraft(
    validDraft({
      cuts: [
        {
          id: "cut-1",
          cutNumber: "1",
          durationFrames: 24,
          panelIds: ["missing"],
        },
      ],
      timelines: [],
      motions: [],
    }),
    "user-1",
  );
  assert.equal(result.ok, false);
  assert.match(result.message, /存在しないPanel/);
});

test("validateDraft rejects timeline that references a missing cut", () => {
  const result = validateDraft(
    validDraft({
      timelines: [
        {
          cutId: "missing-cut",
          placements: [{ id: "pl-1", panelId: "panel-1", startFrame: 0 }],
        },
      ],
      motions: [],
    }),
    "user-1",
  );
  assert.equal(result.ok, false);
  assert.match(result.message, /存在しないCut/);
});

test("validateDraft rejects motion that references a missing panel", () => {
  const result = validateDraft(
    validDraft({
      motions: [
        {
          cutId: "cut-1",
          motions: [
            {
              panelId: "missing",
              from: { x: 0.5, y: 0.5, scale: 1 },
              to: { x: 0.5, y: 0.5, scale: 1 },
            },
          ],
        },
      ],
    }),
    "user-1",
  );
  assert.equal(result.ok, false);
  assert.match(result.message, /存在しないPanel/);
});

test("validateDraft requires drawing media blobs", () => {
  const result = validateDraft(
    validDraft({
      panels: [{ id: "draw-1", source: PANEL_SOURCE_DRAWING }],
      cuts: [],
      timelines: [],
      motions: [],
      media: [],
    }),
    "user-1",
  );
  assert.equal(result.ok, false);
  assert.match(result.message, /画像/);
});

test("validateDraft accepts drawing panel with blob", () => {
  const result = validateDraft(
    validDraft({
      panels: [{ id: "draw-1", source: PANEL_SOURCE_DRAWING }],
      cuts: [],
      timelines: [],
      motions: [],
      media: [
        {
          panelId: "draw-1",
          kind: "drawing",
          blob: imageBlob(),
          mimeType: "image/png",
          width: 1280,
          height: 720,
        },
      ],
    }),
    "user-1",
  );
  assert.equal(result.ok, true);
});

test("applyDraftToStores restores ids into existing stores", () => {
  const draft = validateDraft(
    validDraft({
      panels: [
        {
          id: "panel-1",
          pageNumber: 1,
          x: 0.1,
          y: 0.2,
          width: 0.3,
          height: 0.4,
          source: PANEL_SOURCE_MANUAL,
        },
        { id: "draw-1", source: PANEL_SOURCE_DRAWING },
      ],
      cuts: [
        {
          id: "cut-keep",
          cutNumber: "A",
          durationFrames: 48,
          panelIds: ["panel-1", "draw-1"],
        },
      ],
      timelines: [
        {
          cutId: "cut-keep",
          placements: [
            { id: "pl-keep", panelId: "panel-1", startFrame: 0 },
            { id: "pl-2", panelId: "draw-1", startFrame: 12 },
          ],
        },
      ],
      motions: [
        {
          cutId: "cut-keep",
          motions: [
            {
              panelId: "panel-1",
              from: { x: 0.5, y: 0.5, scale: 1 },
              to: { x: 0.2, y: 0.3, scale: 1.5 },
              preFixFrames: 1,
              postFixFrames: 2,
            },
          ],
        },
      ],
      media: [
        {
          panelId: "draw-1",
          kind: "drawing",
          blob: imageBlob(),
          mimeType: "image/png",
          width: 1280,
          height: 720,
        },
      ],
    }),
    "user-1",
  );
  assert.equal(draft.ok, true);

  const stores = {
    panelStore: createPanelStore(),
    panelMediaStore: createPanelMediaStore(),
    cutStore: createCutStore(),
    timelineStore: createTimelineStore(),
    motionStore: createMotionStore(),
  };
  applyDraftToStores(draft.draft, stores);

  assert.equal(stores.panelStore.getById("panel-1")?.pageNumber, 1);
  assert.equal(stores.panelStore.getById("draw-1")?.source, PANEL_SOURCE_DRAWING);
  assert.equal(stores.panelMediaStore.get("draw-1")?.width, 1280);
  assert.equal(stores.cutStore.getById("cut-keep")?.cutNumber, "A");
  assert.equal(
    stores.timelineStore.getPlacementById("cut-keep", "pl-keep")?.startFrame,
    0,
  );
  assert.equal(stores.motionStore.get("cut-keep", "panel-1")?.postFixFrames, 2);
});

test("isQuotaError detects QuotaExceededError", () => {
  const error = new Error("full");
  error.name = "QuotaExceededError";
  assert.equal(isQuotaError(error), true);
  assert.equal(isQuotaError(new Error("other")), false);
});

test("validateDraft accepts PDF-only empty editing state", () => {
  const result = validateDraft(
    validDraft({
      panels: [],
      cuts: [],
      timelines: [],
      motions: [],
    }),
    "user-1",
  );
  assert.equal(result.ok, true);
});

test("serializeProjectState stamps schemaVersion", () => {
  const state = serializeProjectState({
    userId: "user-1",
    currentPage: 1,
    panels: [],
    cuts: [],
    timelines: [],
    motions: [],
    metadata: {},
  });
  assert.equal(state.schemaVersion, DRAFT_SCHEMA_VERSION);
  assert.equal(state.userId, "user-1");
});

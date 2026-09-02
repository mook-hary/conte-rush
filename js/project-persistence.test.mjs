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
  buildProjectSummary,
  chooseRecoveredProjectName,
  createDraftController,
  createProjectId,
  DRAFT_SCHEMA_VERSION,
  isFuturePersistenceSchema,
  isLegacyMediaKeyForUser,
  isProjectMediaKeyFor,
  isQuotaError,
  listUserProjects,
  migrateLegacyUserDraft,
  projectMediaKey,
  projectRecordKey,
  readActiveProject,
  readLegacyDraft,
  readProject,
  readUserMeta,
  resetDraftDbForTests,
  serializeProjectState,
  setDraftDbForTests,
  syncProjectMedia,
  validateDraft,
  writeProjectPdf,
  writeProjectState,
  writeProjectSummary,
  writeUserMeta,
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

test("validateDraft requires a PDF blob so metadata cannot restore alone", () => {
  const draft = validDraft();
  draft.pdf = {
    fileName: "board.pdf",
    fileSize: 4,
    pageCount: 3,
  };
  const result = validateDraft(draft, "user-1");
  assert.equal(result.ok, false);
  assert.match(result.message, /PDF Blob/);
});

test("saved PDF blob can be rebuilt into a File for restore", () => {
  const blob = pdfBlob();
  const file = new File([blob], "board.pdf", {
    type: blob.type || "application/pdf",
  });
  assert.equal(file.name, "board.pdf");
  assert.equal(file.size, blob.size);
  assert.equal(file.type, "application/pdf");
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
    projectId: "project-1",
    currentPage: 1,
    panels: [],
    cuts: [],
    timelines: [],
    motions: [],
    metadata: {},
  });
  assert.equal(state.schemaVersion, DRAFT_SCHEMA_VERSION);
  assert.equal(state.userId, "user-1");
  assert.equal(state.projectId, "project-1");
});

if (typeof globalThis.IDBKeyRange === "undefined") {
  globalThis.IDBKeyRange = {
    bound(lower, upper) {
      return { lower, upper };
    },
  };
}

function createMemoryDraftDb() {
  const maps = {
    pdf: new Map(),
    state: new Map(),
    media: new Map(),
    meta: new Map(),
    projects: new Map(),
  };

  function inRange(key, range) {
    if (!range) {
      return true;
    }
    const value = String(key);
    return value >= range.lower && value <= range.upper;
  }

  return {
    objectStoreNames: {
      contains(name) {
        return Object.hasOwn(maps, name);
      },
    },
    transaction() {
      let pending = 0;
      const tx = { onerror: null, onabort: null, _oncomplete: null };
      function maybeComplete() {
        if (pending !== 0 || !tx._oncomplete) {
          return;
        }
        const cb = tx._oncomplete;
        queueMicrotask(() => {
          if (pending === 0 && tx._oncomplete === cb) {
            cb();
          }
        });
      }
      Object.defineProperty(tx, "oncomplete", {
        get() {
          return tx._oncomplete;
        },
        set(cb) {
          tx._oncomplete = cb;
          maybeComplete();
        },
      });
      function run(fn) {
        pending += 1;
        const request = { result: undefined, error: null, onsuccess: null, onerror: null };
        queueMicrotask(() => {
          try {
            request.result = fn();
            pending -= 1;
            request.onsuccess?.({ target: request });
            maybeComplete();
          } catch (error) {
            pending -= 1;
            request.error = error;
            request.onerror?.({ target: request });
          }
        });
        return request;
      }
      tx.objectStore = (name) => {
        const map = maps[name];
        return {
          get(key) {
            return run(() => map.get(key));
          },
          put(value, key) {
            return run(() => {
              map.set(key, value);
            });
          },
          delete(key) {
            return run(() => {
              map.delete(key);
            });
          },
          openCursor(range) {
            pending += 1;
            const keys = [...map.keys()].filter((key) => inRange(key, range)).sort();
            let index = 0;
            const request = { result: undefined, onsuccess: null, onerror: null };
            function emit() {
              queueMicrotask(() => {
                if (index >= keys.length) {
                  request.result = null;
                  pending -= 1;
                  request.onsuccess?.({ target: request });
                  maybeComplete();
                  return;
                }
                const key = keys[index];
                request.result = {
                  key,
                  value: map.get(key),
                  continue() {
                    index += 1;
                    emit();
                  },
                  delete() {
                    map.delete(key);
                  },
                };
                request.onsuccess?.({ target: request });
              });
            }
            emit();
            return request;
          },
        };
      };
      return tx;
    },
    maps,
  };
}

function legacyState(draft) {
  return {
    ...draft.state,
    schemaVersion: 1,
    projectId: undefined,
  };
}

function seedLegacy(db, userId, draft) {
  db.maps.pdf.set(userId, draft.pdf);
  db.maps.state.set(userId, legacyState(draft));
  for (const entry of draft.media ?? []) {
    db.maps.media.set(`${userId}::${entry.panelId}`, {
      userId,
      panelId: entry.panelId,
      kind: entry.kind,
      blob: entry.blob,
      mimeType: entry.mimeType,
      width: entry.width,
      height: entry.height,
    });
  }
}

async function writeCompleteProject(userId, projectId, draft) {
  const state = {
    ...draft.state,
    userId,
    projectId,
    schemaVersion: DRAFT_SCHEMA_VERSION,
  };
  await writeProjectPdf(userId, projectId, draft.pdf);
  await writeProjectState(userId, projectId, state);
  const mediaEntries = (draft.media ?? []).map((entry) => ({
    panelId: entry.panelId,
    media: {
      kind: entry.kind,
      blob: entry.blob,
      mimeType: entry.mimeType,
      width: entry.width,
      height: entry.height,
    },
  }));
  await syncProjectMedia(userId, projectId, mediaEntries, new Map());
  await writeProjectSummary(
    userId,
    projectId,
    buildProjectSummary({
      userId,
      projectId,
      pdf: draft.pdf,
      state,
      media: draft.media,
    }),
  );
  await writeUserMeta(userId, { lastActiveProjectId: projectId });
}

test("chooseRecoveredProjectName prefers timesheet title then PDF name", () => {
  assert.equal(
    chooseRecoveredProjectName({
      state: { metadata: { timesheetTitle: " OP " } },
      pdf: { fileName: "board.pdf" },
    }),
    "OP",
  );
  assert.equal(
    chooseRecoveredProjectName({
      state: { metadata: { timesheetTitle: "" } },
      pdf: { fileName: "board.pdf" },
    }),
    "board.pdf",
  );
  assert.equal(chooseRecoveredProjectName({}), "Recovered Project");
});

test("media keys distinguish legacy user drafts from project media", () => {
  assert.equal(isLegacyMediaKeyForUser("user-1::panel-1", "user-1"), true);
  assert.equal(
    isProjectMediaKeyFor("user-1::proj-1::panel-1", "user-1", "proj-1"),
    true,
  );
  assert.equal(isLegacyMediaKeyForUser("user-1::proj-1::panel-1", "user-1"), false);
});

test("Test 1: version 1 draft migrates to a version 2 project", async () => {
  const db = createMemoryDraftDb();
  setDraftDbForTests(db);
  try {
    const draft = validDraft({
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
      panels: [
        {
          id: "panel-1",
          pageNumber: 1,
          x: 0.1,
          y: 0.1,
          width: 0.4,
          height: 0.4,
          source: PANEL_SOURCE_MANUAL,
        },
        { id: "draw-1", source: PANEL_SOURCE_DRAWING },
      ],
      cuts: [
        {
          id: "cut-1",
          cutNumber: "1",
          durationFrames: 24,
          panelIds: ["panel-1", "draw-1"],
        },
      ],
      timelines: [
        {
          cutId: "cut-1",
          placements: [
            { id: "pl-1", panelId: "panel-1", startFrame: 0 },
            { id: "pl-2", panelId: "draw-1", startFrame: 12 },
          ],
        },
      ],
    });
    seedLegacy(db, "user-1", draft);
    const result = await migrateLegacyUserDraft("user-1", {
      createProjectId: () => "recovered-1",
    });
    assert.equal(result.migrated, true);
    assert.equal(result.projectId, "recovered-1");
    assert.equal(await readLegacyDraft("user-1"), null);
    const project = await readProject("user-1", "recovered-1");
    assert.equal(project.pdf.fileName, "board.pdf");
    assert.equal(project.state.projectId, "recovered-1");
    assert.equal(project.state.schemaVersion, DRAFT_SCHEMA_VERSION);
    assert.equal(project.media.length, 1);
    assert.equal(project.media[0].panelId, "draw-1");
    assert.equal(project.summary.projectName, "OP");
    const meta = await readUserMeta("user-1");
    assert.equal(meta.lastActiveProjectId, "recovered-1");
  } finally {
    resetDraftDbForTests();
  }
});

test("Test 2: failed migration keeps the legacy draft and can retry", async () => {
  const db = createMemoryDraftDb();
  setDraftDbForTests(db);
  try {
    const draft = validDraft();
    seedLegacy(db, "user-1", draft);
    await assert.rejects(
      () =>
        migrateLegacyUserDraft("user-1", {
          createProjectId: () => "broken-1",
          afterCopy() {
            throw new Error("copy interrupted");
          },
        }),
      /copy interrupted/,
    );
    const legacy = await readLegacyDraft("user-1");
    assert.equal(legacy.pdf.fileName, "board.pdf");
    assert.equal(await readProject("user-1", "broken-1"), null);
    assert.equal((await listUserProjects("user-1")).length, 0);
    const retry = await migrateLegacyUserDraft("user-1", {
      createProjectId: () => "recovered-2",
    });
    assert.equal(retry.migrated, true);
    assert.equal(retry.projectId, "recovered-2");
    assert.equal((await readProject("user-1", "recovered-2")).pdf.fileName, "board.pdf");
  } finally {
    resetDraftDbForTests();
  }
});

test("Test 3: reload restores lastActiveProjectId", async () => {
  const db = createMemoryDraftDb();
  setDraftDbForTests(db);
  try {
    await writeCompleteProject("user-1", "active-1", validDraft());
    const active = await readActiveProject("user-1");
    assert.equal(active.projectId, "active-1");
    assert.equal(active.state.cuts[0].id, "cut-1");
    assert.equal(active.pdf.pageCount, 3);
  } finally {
    resetDraftDbForTests();
  }
});

test("Test 4-6: a new PDF becomes a second project and reload opens B", async () => {
  const db = createMemoryDraftDb();
  setDraftDbForTests(db);
  try {
    const draftA = validDraft({ pdf: { fileName: "a.pdf", fileSize: 4, pageCount: 3 } });
    const draftB = validDraft({
      pdf: { fileName: "b.pdf", fileSize: 8, pageCount: 2, blob: pdfBlob() },
      cuts: [
        {
          id: "cut-b",
          cutNumber: "2",
          durationFrames: 24,
          panelIds: ["panel-1"],
        },
      ],
      timelines: [
        {
          cutId: "cut-b",
          placements: [{ id: "pl-b", panelId: "panel-1", startFrame: 0 }],
        },
      ],
      motions: [],
    });
    await writeCompleteProject("user-1", "project-a", draftA);
    await writeCompleteProject("user-1", "project-b", draftB);
    const listed = await listUserProjects("user-1");
    assert.equal(listed.length, 2);
    assert.equal(
      listed.some((item) => item.projectId === "project-a" && item.fileName === "a.pdf"),
      true,
    );
    assert.equal(
      listed.some((item) => item.projectId === "project-b" && item.fileName === "b.pdf"),
      true,
    );
    const active = await readActiveProject("user-1");
    assert.equal(active.projectId, "project-b");
    assert.equal(active.pdf.fileName, "b.pdf");
    assert.equal((await readProject("user-1", "project-a")).pdf.fileName, "a.pdf");
  } finally {
    resetDraftDbForTests();
  }
});

test("Test 7: replacing PDF on the same project does not add a project", async () => {
  const db = createMemoryDraftDb();
  setDraftDbForTests(db);
  try {
    const draft = validDraft();
    await writeCompleteProject("user-1", "same-1", draft);
    let currentId = "same-1";
    const controller = createDraftController({
      getUserId: () => "user-1",
      getProjectId: () => currentId,
      hasSession: () => true,
      collectState: () => ({
        ...draft.state,
        userId: "user-1",
        projectId: currentId,
        schemaVersion: DRAFT_SCHEMA_VERSION,
      }),
      collectMedia: () => [],
    });
    await controller.replacePdf({
      blob: pdfBlob(),
      fileName: "board.pdf",
      fileSize: 4,
      pageCount: 3,
    });
    await controller.replacePdf({
      blob: pdfBlob(),
      fileName: "board.pdf",
      fileSize: 4,
      pageCount: 3,
    });
    const listed = await listUserProjects("user-1");
    assert.equal(listed.length, 1);
    assert.equal(listed[0].projectId, "same-1");
    const kept = await readProject("user-1", "same-1");
    assert.equal(kept.state.cuts[0].id, "cut-1");
    assert.equal(kept.state.panels[0].id, "panel-1");
  } finally {
    resetDraftDbForTests();
  }
});

test("Test 8-9: logout policy keeps projects and same user can restore", async () => {
  const db = createMemoryDraftDb();
  setDraftDbForTests(db);
  try {
    await writeCompleteProject("user-1", "keep-1", validDraft());
    assert.equal((await listUserProjects("user-1")).length, 1);
    const again = await readActiveProject("user-1");
    assert.equal(again.projectId, "keep-1");
  } finally {
    resetDraftDbForTests();
  }
});

test("Test 10: a different user cannot see or restore another user's project", async () => {
  const db = createMemoryDraftDb();
  setDraftDbForTests(db);
  try {
    await writeCompleteProject("user-1", "private-1", validDraft());
    assert.equal((await listUserProjects("user-2")).length, 0);
    assert.equal(await readProject("user-2", "private-1"), null);
    assert.equal(await readActiveProject("user-2"), null);
    assert.equal((await readProject("user-1", "private-1")).pdf.fileName, "board.pdf");
  } finally {
    resetDraftDbForTests();
  }
});

test("Test 11: drawing media stays scoped to projectId", async () => {
  const db = createMemoryDraftDb();
  setDraftDbForTests(db);
  try {
    const blobA = imageBlob();
    const blobB = new Blob([new Uint8Array([9, 9, 9, 9])], { type: "image/png" });
    const draftA = validDraft({
      panels: [{ id: "draw-a", source: PANEL_SOURCE_DRAWING }],
      cuts: [],
      timelines: [],
      motions: [],
      media: [
        {
          panelId: "draw-a",
          kind: "drawing",
          blob: blobA,
          mimeType: "image/png",
          width: 1280,
          height: 720,
        },
      ],
    });
    const draftB = validDraft({
      panels: [{ id: "draw-b", source: PANEL_SOURCE_DRAWING }],
      cuts: [],
      timelines: [],
      motions: [],
      media: [
        {
          panelId: "draw-b",
          kind: "drawing",
          blob: blobB,
          mimeType: "image/png",
          width: 1280,
          height: 720,
        },
      ],
    });
    await writeCompleteProject("user-1", "proj-a", draftA);
    await writeCompleteProject("user-1", "proj-b", draftB);
    const a = await readProject("user-1", "proj-a");
    const b = await readProject("user-1", "proj-b");
    assert.equal(a.media.length, 1);
    assert.equal(b.media.length, 1);
    assert.equal(a.media[0].panelId, "draw-a");
    assert.equal(b.media[0].panelId, "draw-b");
    assert.equal(
      db.maps.media.has(projectMediaKey("user-1", "proj-a", "draw-a")),
      true,
    );
    assert.equal(
      db.maps.media.has(projectMediaKey("user-1", "proj-b", "draw-a")),
      false,
    );
  } finally {
    resetDraftDbForTests();
  }
});

test("Test 12: Auth teardown does not delete projects", async () => {
  const { readFile } = await import("node:fs/promises");
  const app = await readFile(new URL("./app.js", import.meta.url), "utf8");
  const gate = await readFile(new URL("./access-gate.js", import.meta.url), "utf8");
  assert.equal(app.includes("draftController.clearUser"), false);
  assert.equal(app.includes("deleteUserDraft"), false);
  assert.match(
    gate,
    /enterUnauthenticated\(\)[\s\S]*?teardownApp\(\{ clearPersistence: false \}\)/,
  );
  assert.match(
    gate,
    /network_error[\s\S]*?teardownApp\(\)/,
  );
});

test("validateDraft still accepts a version 1 state snapshot", () => {
  const draft = validDraft();
  draft.state.schemaVersion = 1;
  delete draft.state.projectId;
  const result = validateDraft(draft, "user-1");
  assert.equal(result.ok, true);
});

test("createProjectId returns a non-empty id", () => {
  assert.equal(typeof createProjectId(), "string");
  assert.ok(createProjectId().length > 4);
  assert.equal(projectRecordKey("u", "p"), "u::p");
});

test("crash after lastActive is set does not create a second Recovered Project", async () => {
  const db = createMemoryDraftDb();
  setDraftDbForTests(db);
  try {
    const draft = validDraft();
    await writeCompleteProject("user-1", "recovered-1", draft);
    seedLegacy(db, "user-1", draft);
    assert.equal((await readLegacyDraft("user-1")) != null, true);
    const result = await migrateLegacyUserDraft("user-1", {
      createProjectId: () => {
        throw new Error("must not create another Recovered Project");
      },
    });
    assert.equal(result.cleanedLegacy, true);
    assert.equal(result.projectId, "recovered-1");
    assert.equal(result.migrated, false);
    assert.equal(await readLegacyDraft("user-1"), null);
    const listed = await listUserProjects("user-1");
    assert.equal(listed.length, 1);
    assert.equal(listed[0].projectId, "recovered-1");
    const kept = await readProject("user-1", "recovered-1");
    assert.equal(kept.pdf.fileName, "board.pdf");
    assert.equal(kept.state.cuts[0].id, "cut-1");
  } finally {
    resetDraftDbForTests();
  }
});

test("schemaVersion 999 is refused and original records stay intact", async () => {
  const db = createMemoryDraftDb();
  setDraftDbForTests(db);
  try {
    const draft = validDraft();
    await writeCompleteProject("user-1", "future-1", draft);
    const stored = await readProject("user-1", "future-1");
    const futureState = {
      ...stored.state,
      schemaVersion: 999,
      extraFutureField: "keep-me",
    };
    const futureSummary = { ...stored.summary, schemaVersion: 999 };
    await writeProjectState("user-1", "future-1", futureState);
    await writeProjectSummary("user-1", "future-1", futureSummary);

    const opened = validateDraft(
      { pdf: stored.pdf, state: futureState, media: stored.media },
      "user-1",
      "future-1",
    );
    assert.equal(opened.ok, false);
    assert.match(opened.message, /schemaVersion/);
    assert.equal(
      isFuturePersistenceSchema({ state: futureState, summary: futureSummary }),
      true,
    );

    const active = await readActiveProject("user-1");
    assert.equal(active.projectId, "future-1");
    assert.equal(active.state.schemaVersion, 999);
    assert.equal(active.state.extraFutureField, "keep-me");

    const controller = createDraftController({
      getUserId: () => "user-1",
      getProjectId: () => "future-1",
      hasSession: () => true,
      collectState: () =>
        serializeProjectState({
          userId: "user-1",
          projectId: "future-1",
          currentPage: 1,
          panels: [],
          cuts: [],
          timelines: [],
          motions: [],
          metadata: { timesheetTitle: "should-not-write" },
        }),
      collectMedia: () => [],
    });
    controller.schedule();
    await controller.flush();
    const afterFlush = await readProject("user-1", "future-1");
    assert.equal(afterFlush.state.schemaVersion, 999);
    assert.equal(afterFlush.state.extraFutureField, "keep-me");
    assert.notEqual(afterFlush.state.metadata?.timesheetTitle, "should-not-write");
    assert.equal(afterFlush.summary.schemaVersion, 999);

    seedLegacy(db, "user-1", validDraft());
    const migrated = await migrateLegacyUserDraft("user-1", {
      createProjectId: () => {
        throw new Error("must not migrate over a future schema project");
      },
    });
    assert.equal(migrated.cleanedLegacy, true);
    const afterMigrate = await readProject("user-1", "future-1");
    assert.equal(afterMigrate.state.schemaVersion, 999);
    assert.equal(afterMigrate.state.extraFutureField, "keep-me");
    assert.equal((await listUserProjects("user-1")).length, 1);
  } finally {
    resetDraftDbForTests();
  }
});

test("prepareProjectSwitch flushes A and delayed autosave does not write B", async () => {
  const db = createMemoryDraftDb();
  setDraftDbForTests(db);
  try {
    const draftA = validDraft({
      metadata: {
        timesheetEpisode: "01",
        timesheetTitle: "A-original",
        selectedCutId: "cut-1",
      },
    });
    const draftB = validDraft({
      pdf: { fileName: "b.pdf", fileSize: 8, pageCount: 2, blob: pdfBlob() },
      metadata: {
        timesheetEpisode: "02",
        timesheetTitle: "B-original",
        selectedCutId: "cut-1",
      },
    });
    await writeCompleteProject("user-1", "project-a", draftA);
    await writeCompleteProject("user-1", "project-b", draftB);

    let currentId = "project-a";
    let title = "A-edited";
    const controller = createDraftController({
      debounceMs: 40,
      getUserId: () => "user-1",
      getProjectId: () => currentId,
      hasSession: () => true,
      collectState: () =>
        serializeProjectState({
          userId: "user-1",
          projectId: currentId,
          currentPage: 2,
          panels: draftA.state.panels,
          cuts: draftA.state.cuts,
          timelines: draftA.state.timelines,
          motions: draftA.state.motions,
          metadata: {
            timesheetEpisode: "01",
            timesheetTitle: title,
            selectedCutId: "cut-1",
          },
        }),
      collectMedia: () => [],
    });
    controller.rememberSummary((await readProject("user-1", "project-a")).summary);
    controller.schedule();
    await controller.prepareProjectSwitch();
    currentId = "project-b";
    title = "B-should-not-receive-A";
    controller.rememberSummary((await readProject("user-1", "project-b")).summary);
    await new Promise((resolve) => setTimeout(resolve, 80));
    const a = await readProject("user-1", "project-a");
    const b = await readProject("user-1", "project-b");
    assert.equal(a.state.metadata.timesheetTitle, "A-edited");
    assert.equal(b.state.metadata.timesheetTitle, "B-original");
    assert.equal(b.pdf.fileName, "b.pdf");
  } finally {
    resetDraftDbForTests();
  }
});

test("app flushes the current project before opening a new PDF project", async () => {
  const { readFile } = await import("node:fs/promises");
  const app = await readFile(new URL("./app.js", import.meta.url), "utf8");
  const start = app.indexOf("async function handleFileChange");
  const fn = app.slice(start, start + 3500);
  const flushAt = fn.indexOf("prepareProjectSwitch");
  const newIdAt = fn.indexOf("createProjectId");
  assert.ok(flushAt >= 0);
  assert.ok(newIdAt > flushAt);
  assert.match(app, /export async function prepareProjectSwitch/);
});


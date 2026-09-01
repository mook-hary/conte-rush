export const DRAFT_SCHEMA_VERSION = 2;
export const MIN_STATE_SCHEMA_VERSION = 1;
export const PROJECT_SCHEMA_VERSION = 2;
export const DRAFT_DB_NAME = "conte-rush-draft";
export const DRAFT_DB_VERSION = 2;
export const DRAFT_AUTOSAVE_MS = 750;
export const RECOVERED_PROJECT_NAME = "Recovered Project";

const PDF_STORE = "pdf";
const STATE_STORE = "state";
const MEDIA_STORE = "media";
const META_STORE = "meta";
const PROJECTS_STORE = "projects";

let dbPromise = null;
let testDb = null;
let opChain = Promise.resolve();

function withLock(fn) {
  const run = opChain.then(fn, fn);
  opChain = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.length > 0;
}

function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function isBlobValue(value) {
  return typeof Blob !== "undefined" && value instanceof Blob && value.size > 0;
}

export function isQuotaError(error) {
  return (
    error?.name === "QuotaExceededError" ||
    error?.code === 22 ||
    error?.name === "NS_ERROR_DOM_QUOTA_REACHED"
  );
}

export function createProjectId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `project-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
}

export function projectRecordKey(userId, projectId) {
  return `${userId}::${projectId}`;
}

export function legacyMediaKey(userId, panelId) {
  return `${userId}::${panelId}`;
}

export function projectMediaKey(userId, projectId, panelId) {
  return `${userId}::${projectId}::${panelId}`;
}

function splitStorageKey(key) {
  return String(key ?? "").split("::");
}

export function isLegacyMediaKeyForUser(key, userId) {
  const parts = splitStorageKey(key);
  return parts.length === 2 && parts[0] === userId;
}

export function isProjectMediaKeyFor(key, userId, projectId) {
  const parts = splitStorageKey(key);
  return parts.length === 3 && parts[0] === userId && parts[1] === projectId;
}

function legacyMediaKeyRange(userId) {
  return IDBKeyRange.bound(`${userId}::`, `${userId}::\uffff`);
}

function projectMediaKeyRange(userId, projectId) {
  const prefix = `${userId}::${projectId}::`;
  return IDBKeyRange.bound(prefix, `${prefix}\uffff`);
}

function requestToPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB error"));
  });
}

function transactionDone(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("IndexedDB transaction error"));
    tx.onabort = () => reject(tx.error ?? new Error("IndexedDB transaction aborted"));
  });
}

export function setDraftDbForTests(db) {
  testDb = db ?? null;
  dbPromise = db ? Promise.resolve(db) : null;
}

export function resetDraftDbForTests() {
  testDb = null;
  dbPromise = null;
}

export function openDraftDb() {
  if (testDb) {
    return Promise.resolve(testDb);
  }
  if (typeof indexedDB === "undefined") {
    return Promise.reject(new Error("IndexedDB is not available."));
  }
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DRAFT_DB_NAME, DRAFT_DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(PDF_STORE)) {
          db.createObjectStore(PDF_STORE);
        }
        if (!db.objectStoreNames.contains(STATE_STORE)) {
          db.createObjectStore(STATE_STORE);
        }
        if (!db.objectStoreNames.contains(MEDIA_STORE)) {
          db.createObjectStore(MEDIA_STORE);
        }
        if (!db.objectStoreNames.contains(META_STORE)) {
          db.createObjectStore(META_STORE);
        }
        if (!db.objectStoreNames.contains(PROJECTS_STORE)) {
          db.createObjectStore(PROJECTS_STORE);
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => {
        dbPromise = null;
        reject(request.error ?? new Error("IndexedDB open failed."));
      };
    });
  }
  return dbPromise;
}

function clonePose(pose) {
  return {
    x: pose.x,
    y: pose.y,
    scale: pose.scale,
  };
}

export function serializeProjectState({
  userId,
  projectId,
  currentPage,
  panels,
  cuts,
  timelines,
  motions,
  metadata,
}) {
  return {
    schemaVersion: DRAFT_SCHEMA_VERSION,
    userId,
    projectId: projectId ?? null,
    updatedAt: new Date().toISOString(),
    currentPage,
    panels: (panels ?? []).map((panel) => ({ ...panel })),
    cuts: (cuts ?? []).map((cut) => ({
      id: cut.id,
      cutNumber: cut.cutNumber,
      durationFrames: cut.durationFrames,
      panelIds: [...(cut.panelIds ?? [])],
    })),
    timelines: (timelines ?? []).map((timeline) => ({
      cutId: timeline.cutId,
      placements: (timeline.placements ?? []).map((item) => ({
        id: item.id,
        panelId: item.panelId,
        startFrame: item.startFrame,
      })),
    })),
    motions: (motions ?? []).map((set) => ({
      cutId: set.cutId,
      motions: (set.motions ?? []).map((motion) => ({
        panelId: motion.panelId,
        from: clonePose(motion.from),
        to: clonePose(motion.to),
        preFixFrames: motion.preFixFrames,
        postFixFrames: motion.postFixFrames,
      })),
    })),
    metadata: {
      timesheetEpisode: String(metadata?.timesheetEpisode ?? ""),
      timesheetTitle: String(metadata?.timesheetTitle ?? ""),
      selectedCutId: metadata?.selectedCutId ?? null,
    },
  };
}

function fail(message) {
  return { ok: false, message };
}

function validatePdfPanel(panel) {
  if (!isNonEmptyString(panel.id)) {
    return fail("Panel idがありません。");
  }
  if (!Number.isInteger(panel.pageNumber) || panel.pageNumber < 1) {
    return fail("PanelのpageNumberが不正です。");
  }
  for (const key of ["x", "y", "width", "height"]) {
    if (!isFiniteNumber(panel[key]) || panel[key] < 0 || panel[key] > 1) {
      return fail("Panelの座標が不正です。");
    }
  }
  if (panel.source !== "manual" && panel.source !== "auto") {
    return fail("PDF Panelのsourceが不正です。");
  }
  return { ok: true };
}

function validateMediaPanel(panel) {
  if (!isNonEmptyString(panel.id)) {
    return fail("Panel idがありません。");
  }
  if (panel.source !== "drawing" && panel.source !== "upload") {
    return fail("画像Panelのsourceが不正です。");
  }
  return { ok: true };
}

function validatePose(pose) {
  if (!pose) {
    return fail("画角がありません。");
  }
  if (!isFiniteNumber(pose.x) || !isFiniteNumber(pose.y)) {
    return fail("画角の位置が不正です。");
  }
  if (pose.x < 0 || pose.x > 1 || pose.y < 0 || pose.y > 1) {
    return fail("画角の位置は 0〜1 にしてください。");
  }
  if (!isFiniteNumber(pose.scale) || pose.scale < 1) {
    return fail("scale は 1 以上にしてください。");
  }
  return { ok: true };
}

export function validateDraft(record, expectedUserId, expectedProjectId = null) {
  if (!record || typeof record !== "object") {
    return fail("保存データがありません。");
  }
  const { pdf, state, media } = record;
  if (!pdf || !isBlobValue(pdf.blob)) {
    return fail("PDF Blobがありません。");
  }
  if (!isNonEmptyString(pdf.fileName)) {
    return fail("PDFのファイル名がありません。");
  }
  if (!Number.isInteger(pdf.pageCount) || pdf.pageCount < 1) {
    return fail("PDFのページ数が不正です。");
  }
  if (!state || typeof state !== "object") {
    return fail("編集状態がありません。");
  }
  if (
    state.schemaVersion !== DRAFT_SCHEMA_VERSION &&
    state.schemaVersion !== MIN_STATE_SCHEMA_VERSION
  ) {
    return fail("未対応のschemaVersionです。");
  }
  if (!isNonEmptyString(state.userId) || state.userId !== expectedUserId) {
    return fail("userIdが一致しません。");
  }
  if (
    expectedProjectId &&
    isNonEmptyString(state.projectId) &&
    state.projectId !== expectedProjectId
  ) {
    return fail("projectIdが一致しません。");
  }
  if (!Number.isInteger(state.currentPage) || state.currentPage < 1) {
    return fail("currentPageが不正です。");
  }
  if (state.currentPage > pdf.pageCount) {
    return fail("currentPageがページ数を超えています。");
  }

  const panels = Array.isArray(state.panels) ? state.panels : null;
  const cuts = Array.isArray(state.cuts) ? state.cuts : null;
  const timelines = Array.isArray(state.timelines) ? state.timelines : null;
  const motions = Array.isArray(state.motions) ? state.motions : null;
  if (!panels || !cuts || !timelines || !motions) {
    return fail("編集状態の配列が不正です。");
  }

  const panelIds = new Set();
  const mediaPanels = new Set();
  for (const panel of panels) {
    if (!panel || typeof panel !== "object") {
      return fail("Panelが不正です。");
    }
    if (panelIds.has(panel.id)) {
      return fail("Panel idが重複しています。");
    }
    const checked =
      panel.source === "drawing" || panel.source === "upload"
        ? validateMediaPanel(panel)
        : validatePdfPanel(panel);
    if (!checked.ok) {
      return checked;
    }
    panelIds.add(panel.id);
    if (panel.source === "drawing" || panel.source === "upload") {
      mediaPanels.add(panel.id);
    }
  }

  const mediaEntries = Array.isArray(media) ? media : [];
  const mediaByPanelId = new Map();
  for (const entry of mediaEntries) {
    if (!entry || !isNonEmptyString(entry.panelId)) {
      return fail("Panel画像のidが不正です。");
    }
    if (mediaByPanelId.has(entry.panelId)) {
      return fail("Panel画像idが重複しています。");
    }
    if (!mediaPanels.has(entry.panelId)) {
      return fail("存在しないPanelの画像があります。");
    }
    if (entry.kind !== "drawing" && entry.kind !== "upload") {
      return fail("Panel画像のkindが不正です。");
    }
    if (!isBlobValue(entry.blob)) {
      return fail("Panel画像のBlobがありません。");
    }
    if (!isFiniteNumber(entry.width) || entry.width <= 0) {
      return fail("Panel画像の幅が不正です。");
    }
    if (!isFiniteNumber(entry.height) || entry.height <= 0) {
      return fail("Panel画像の高さが不正です。");
    }
    mediaByPanelId.set(entry.panelId, {
      kind: entry.kind,
      blob: entry.blob,
      mimeType: String(entry.mimeType ?? entry.blob.type ?? ""),
      width: entry.width,
      height: entry.height,
    });
  }
  for (const panelId of mediaPanels) {
    if (!mediaByPanelId.has(panelId)) {
      return fail("手描き/Upload Panelの画像がありません。");
    }
  }

  const cutIds = new Set();
  const cutNumbers = new Set();
  for (const cut of cuts) {
    if (!cut || !isNonEmptyString(cut.id)) {
      return fail("Cut idがありません。");
    }
    if (cutIds.has(cut.id)) {
      return fail("Cut idが重複しています。");
    }
    if (!isNonEmptyString(cut.cutNumber)) {
      return fail("CUT番号がありません。");
    }
    if (cutNumbers.has(cut.cutNumber)) {
      return fail("CUT番号が重複しています。");
    }
    if (!Number.isInteger(cut.durationFrames) || cut.durationFrames < 1) {
      return fail("Cutの総尺が不正です。");
    }
    if (!Array.isArray(cut.panelIds)) {
      return fail("CutのPanel一覧が不正です。");
    }
    const seenMembers = new Set();
    for (const panelId of cut.panelIds) {
      if (!panelIds.has(panelId)) {
        return fail("Cutが存在しないPanelを参照しています。");
      }
      if (seenMembers.has(panelId)) {
        return fail("Cut内のPanel idが重複しています。");
      }
      seenMembers.add(panelId);
    }
    cutIds.add(cut.id);
    cutNumbers.add(cut.cutNumber);
  }

  const timelineCutIds = new Set();
  for (const timeline of timelines) {
    if (!timeline || !isNonEmptyString(timeline.cutId)) {
      return fail("TimelineのcutIdがありません。");
    }
    if (!cutIds.has(timeline.cutId)) {
      return fail("Timelineが存在しないCutを参照しています。");
    }
    if (timelineCutIds.has(timeline.cutId)) {
      return fail("TimelineのcutIdが重複しています。");
    }
    timelineCutIds.add(timeline.cutId);
    const cut = cuts.find((item) => item.id === timeline.cutId);
    const placements = Array.isArray(timeline.placements) ? timeline.placements : null;
    if (!cut || !placements) {
      return fail("Timelineの配置が不正です。");
    }
    const placementIds = new Set();
    const startFrames = new Set();
    for (const placement of placements) {
      if (!placement || !isNonEmptyString(placement.id)) {
        return fail("placementにidがありません。");
      }
      if (placementIds.has(placement.id)) {
        return fail("placement idが重複しています。");
      }
      if (!cut.panelIds.includes(placement.panelId)) {
        return fail("TimelineがCutに所属していないPanelを参照しています。");
      }
      if (!Number.isInteger(placement.startFrame)) {
        return fail("開始フレームは整数にしてください。");
      }
      if (
        placement.startFrame < 0 ||
        placement.startFrame >= cut.durationFrames
      ) {
        return fail("開始フレームが総尺の範囲外です。");
      }
      if (startFrames.has(placement.startFrame)) {
        return fail("開始フレームが重複しています。");
      }
      placementIds.add(placement.id);
      startFrames.add(placement.startFrame);
    }
  }

  const motionCutIds = new Set();
  for (const set of motions) {
    if (!set || !isNonEmptyString(set.cutId)) {
      return fail("MotionのcutIdがありません。");
    }
    if (!cutIds.has(set.cutId)) {
      return fail("Motionが存在しないCutを参照しています。");
    }
    if (motionCutIds.has(set.cutId)) {
      return fail("MotionのcutIdが重複しています。");
    }
    motionCutIds.add(set.cutId);
    const cut = cuts.find((item) => item.id === set.cutId);
    if (!Array.isArray(set.motions) || !cut) {
      return fail("Motion一覧が不正です。");
    }
    const panelSeen = new Set();
    for (const motion of set.motions) {
      if (!motion || !isNonEmptyString(motion.panelId)) {
        return fail("MotionのPanelがありません。");
      }
      if (!panelIds.has(motion.panelId)) {
        return fail("Motionが存在しないPanelを参照しています。");
      }
      if (!cut.panelIds.includes(motion.panelId)) {
        return fail("MotionがCutに所属していないPanelを参照しています。");
      }
      if (panelSeen.has(motion.panelId)) {
        return fail("同一Cut内のMotionが重複しています。");
      }
      const from = validatePose(motion.from);
      if (!from.ok) {
        return from;
      }
      const to = validatePose(motion.to);
      if (!to.ok) {
        return to;
      }
      if (
        motion.preFixFrames !== undefined &&
        motion.preFixFrames !== null &&
        !(Number.isInteger(motion.preFixFrames) && motion.preFixFrames >= 0)
      ) {
        return fail("前FIXは0以上の整数にしてください。");
      }
      if (
        motion.postFixFrames !== undefined &&
        motion.postFixFrames !== null &&
        !(Number.isInteger(motion.postFixFrames) && motion.postFixFrames >= 0)
      ) {
        return fail("後FIXは0以上の整数にしてください。");
      }
      panelSeen.add(motion.panelId);
    }
  }

  const selectedCutId = state.metadata?.selectedCutId ?? null;
  if (selectedCutId && !cutIds.has(selectedCutId)) {
    return fail("selectedCutIdが不正です。");
  }

  return {
    ok: true,
    draft: {
      pdf: {
        blob: pdf.blob,
        fileName: pdf.fileName,
        fileSize: Number.isFinite(pdf.fileSize) ? pdf.fileSize : pdf.blob.size,
        pageCount: pdf.pageCount,
      },
      state,
      mediaByPanelId,
    },
  };
}

export function applyDraftToStores(draft, stores) {
  const { panelStore, panelMediaStore, cutStore, timelineStore, motionStore } =
    stores;
  for (const panel of draft.state.panels) {
    if (!panelStore.restore(panel)) {
      throw new Error("Panelを復元できませんでした。");
    }
  }
  for (const [panelId, media] of draft.mediaByPanelId) {
    if (!panelMediaStore.set(panelId, media)) {
      throw new Error("Panel画像を復元できませんでした。");
    }
  }
  for (const cut of draft.state.cuts) {
    if (!cutStore.restore(cut)) {
      throw new Error("Cutを復元できませんでした。");
    }
  }
  for (const timeline of draft.state.timelines) {
    const cut = cutStore.getById(timeline.cutId);
    const result = timelineStore.restorePlacements(
      timeline.cutId,
      timeline.placements,
      cut,
    );
    if (!result.ok) {
      throw new Error(result.message || "Timelineを復元できませんでした。");
    }
  }
  for (const set of draft.state.motions) {
    for (const motion of set.motions) {
      const result = motionStore.upsert(set.cutId, motion);
      if (!result.ok) {
        throw new Error(result.message || "Motionを復元できませんでした。");
      }
    }
  }
}

export function chooseRecoveredProjectName({ state, pdf } = {}) {
  const title = String(state?.metadata?.timesheetTitle ?? "").trim();
  if (title) {
    return title;
  }
  const fileName = String(pdf?.fileName ?? "").trim();
  if (fileName) {
    return fileName;
  }
  return RECOVERED_PROJECT_NAME;
}

export function estimateProjectBytes({ pdf, state, media } = {}) {
  const pdfSize = Number(pdf?.fileSize ?? pdf?.blob?.size ?? 0) || 0;
  const mediaSize = (media ?? []).reduce(
    (sum, entry) => sum + (Number(entry?.blob?.size ?? entry?.media?.blob?.size ?? 0) || 0),
    0,
  );
  const panels = Array.isArray(state?.panels) ? state.panels.length : 0;
  const cuts = Array.isArray(state?.cuts) ? state.cuts.length : 0;
  const placements = (state?.timelines ?? []).reduce(
    (sum, timeline) => sum + (timeline?.placements?.length ?? 0),
    0,
  );
  const stateEstimate = panels * 220 + cuts * 420 + placements * 90 + 256;
  return pdfSize + mediaSize + stateEstimate;
}

export function buildProjectSummary({
  userId,
  projectId,
  pdf,
  state,
  media,
  existing,
  now,
  projectName,
}) {
  const stamp = now ?? new Date().toISOString();
  const name =
    projectName ||
    existing?.projectName ||
    chooseRecoveredProjectName({ state, pdf });
  return {
    projectId,
    userId,
    projectName: name,
    episode: String(state?.metadata?.timesheetEpisode ?? existing?.episode ?? ""),
    title: String(state?.metadata?.timesheetTitle ?? existing?.title ?? ""),
    fileName: String(pdf?.fileName ?? existing?.fileName ?? ""),
    fileSize: Number(pdf?.fileSize ?? pdf?.blob?.size ?? existing?.fileSize ?? 0) || 0,
    pageCount: Number(pdf?.pageCount ?? existing?.pageCount ?? 0) || 0,
    cutCount: Array.isArray(state?.cuts) ? state.cuts.length : existing?.cutCount ?? 0,
    panelCount: Array.isArray(state?.panels)
      ? state.panels.length
      : existing?.panelCount ?? 0,
    createdAt: existing?.createdAt ?? stamp,
    updatedAt: stamp,
    lastExplicitSaveAt: existing?.lastExplicitSaveAt ?? null,
    schemaVersion: PROJECT_SCHEMA_VERSION,
    byteSizeEstimate: estimateProjectBytes({ pdf, state, media }),
  };
}

function mapMediaValue(_key, value) {
  if (!value) {
    return null;
  }
  return {
    panelId: value.panelId,
    kind: value.kind,
    blob: value.blob,
    mimeType: value.mimeType,
    width: value.width,
    height: value.height,
  };
}

function readCursor(request, filterFn) {
  return new Promise((resolve, reject) => {
    const items = [];
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) {
        resolve(items);
        return;
      }
      if (!filterFn || filterFn(cursor.key, cursor.value)) {
        const mapped = mapMediaValue(cursor.key, cursor.value);
        if (mapped) {
          items.push(mapped);
        }
      }
      cursor.continue();
    };
    request.onerror = () => reject(request.error ?? new Error("media read failed"));
  });
}

async function deleteMatchingMedia(db, range, filterFn) {
  const tx = db.transaction(MEDIA_STORE, "readwrite");
  const store = tx.objectStore(MEDIA_STORE);
  const request = store.openCursor(range);
  request.onsuccess = () => {
    const cursor = request.result;
    if (!cursor) {
      return;
    }
    if (!filterFn || filterFn(cursor.key, cursor.value)) {
      cursor.delete();
    }
    cursor.continue();
  };
  await transactionDone(tx);
}

async function deleteMediaForProject(db, userId, projectId) {
  await deleteMatchingMedia(db, projectMediaKeyRange(userId, projectId));
}

async function deleteLegacyMediaForUser(db, userId) {
  await deleteMatchingMedia(
    db,
    legacyMediaKeyRange(userId),
    (key) => isLegacyMediaKeyForUser(key, userId),
  );
}

export async function readLegacyDraft(userId) {
  if (!isNonEmptyString(userId)) {
    return null;
  }
  const db = await openDraftDb();
  const tx = db.transaction([PDF_STORE, STATE_STORE, MEDIA_STORE], "readonly");
  const pdf = await requestToPromise(tx.objectStore(PDF_STORE).get(userId));
  const state = await requestToPromise(tx.objectStore(STATE_STORE).get(userId));
  const media = await readCursor(
    tx.objectStore(MEDIA_STORE).openCursor(legacyMediaKeyRange(userId)),
    (key) => isLegacyMediaKeyForUser(key, userId),
  );
  await transactionDone(tx);
  if (!pdf && !state && media.length === 0) {
    return null;
  }
  return { pdf, state, media };
}

export async function readProject(userId, projectId) {
  if (!isNonEmptyString(userId) || !isNonEmptyString(projectId)) {
    return null;
  }
  const key = projectRecordKey(userId, projectId);
  const db = await openDraftDb();
  const tx = db.transaction(
    [PDF_STORE, STATE_STORE, MEDIA_STORE, PROJECTS_STORE],
    "readonly",
  );
  const pdf = await requestToPromise(tx.objectStore(PDF_STORE).get(key));
  const state = await requestToPromise(tx.objectStore(STATE_STORE).get(key));
  const summary = await requestToPromise(tx.objectStore(PROJECTS_STORE).get(key));
  const media = await readCursor(
    tx.objectStore(MEDIA_STORE).openCursor(projectMediaKeyRange(userId, projectId)),
    (mediaKey) => isProjectMediaKeyFor(mediaKey, userId, projectId),
  );
  await transactionDone(tx);
  if (!pdf && !state && media.length === 0 && !summary) {
    return null;
  }
  return { projectId, pdf, state, media, summary };
}

export async function readUserMeta(userId) {
  if (!isNonEmptyString(userId)) {
    return null;
  }
  const db = await openDraftDb();
  const tx = db.transaction(META_STORE, "readonly");
  const meta = await requestToPromise(tx.objectStore(META_STORE).get(userId));
  await transactionDone(tx);
  return meta ?? null;
}

export async function writeUserMeta(userId, patch) {
  if (!isNonEmptyString(userId)) {
    return null;
  }
  const db = await openDraftDb();
  const tx = db.transaction(META_STORE, "readwrite");
  const store = tx.objectStore(META_STORE);
  const previous = (await requestToPromise(store.get(userId))) ?? {};
  const next = {
    userId,
    lastActiveProjectId: patch.lastActiveProjectId ?? previous.lastActiveProjectId ?? null,
    schemaVersion: PROJECT_SCHEMA_VERSION,
  };
  store.put(next, userId);
  await transactionDone(tx);
  return next;
}

export async function listUserProjects(userId) {
  if (!isNonEmptyString(userId)) {
    return [];
  }
  const db = await openDraftDb();
  const tx = db.transaction(PROJECTS_STORE, "readonly");
  const prefix = `${userId}::`;
  const items = [];
  await new Promise((resolve, reject) => {
    const request = tx.objectStore(PROJECTS_STORE).openCursor(
      IDBKeyRange.bound(prefix, `${prefix}\uffff`),
    );
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) {
        resolve();
        return;
      }
      const parts = splitStorageKey(cursor.key);
      if (parts.length === 2 && parts[0] === userId && cursor.value) {
        items.push(cursor.value);
      }
      cursor.continue();
    };
    request.onerror = () => reject(request.error ?? new Error("projects read failed"));
  });
  await transactionDone(tx);
  return items.sort((a, b) => String(b.updatedAt ?? "").localeCompare(String(a.updatedAt ?? "")));
}

export async function writeProjectPdf(userId, projectId, pdf) {
  const db = await openDraftDb();
  const tx = db.transaction(PDF_STORE, "readwrite");
  tx.objectStore(PDF_STORE).put(
    {
      blob: pdf.blob,
      fileName: pdf.fileName,
      fileSize: pdf.fileSize,
      pageCount: pdf.pageCount,
    },
    projectRecordKey(userId, projectId),
  );
  await transactionDone(tx);
}

export async function writeProjectState(userId, projectId, state) {
  const db = await openDraftDb();
  const tx = db.transaction(STATE_STORE, "readwrite");
  tx.objectStore(STATE_STORE).put(state, projectRecordKey(userId, projectId));
  await transactionDone(tx);
}

export async function writeProjectSummary(userId, projectId, summary) {
  const db = await openDraftDb();
  const tx = db.transaction(PROJECTS_STORE, "readwrite");
  tx.objectStore(PROJECTS_STORE).put(summary, projectRecordKey(userId, projectId));
  await transactionDone(tx);
}

export async function syncProjectMedia(userId, projectId, entries, previouslySavedIds) {
  const db = await openDraftDb();
  const nextIds = new Set(entries.map((entry) => entry.panelId));
  const tx = db.transaction(MEDIA_STORE, "readwrite");
  const store = tx.objectStore(MEDIA_STORE);
  for (const entry of entries) {
    const previous = previouslySavedIds.get(entry.panelId);
    if (previous === entry.media.blob) {
      continue;
    }
    store.put(
      {
        userId,
        projectId,
        panelId: entry.panelId,
        kind: entry.media.kind,
        blob: entry.media.blob,
        mimeType: entry.media.mimeType,
        width: entry.media.width,
        height: entry.media.height,
      },
      projectMediaKey(userId, projectId, entry.panelId),
    );
  }
  for (const panelId of previouslySavedIds.keys()) {
    if (!nextIds.has(panelId)) {
      store.delete(projectMediaKey(userId, projectId, panelId));
    }
  }
  await transactionDone(tx);
  const nextSaved = new Map();
  for (const entry of entries) {
    nextSaved.set(entry.panelId, entry.media.blob);
  }
  return nextSaved;
}

export async function deleteProject(userId, projectId) {
  if (!isNonEmptyString(userId) || !isNonEmptyString(projectId)) {
    return;
  }
  const db = await openDraftDb();
  await deleteMediaForProject(db, userId, projectId);
  const key = projectRecordKey(userId, projectId);
  const tx = db.transaction(
    [PDF_STORE, STATE_STORE, PROJECTS_STORE, META_STORE],
    "readwrite",
  );
  tx.objectStore(PDF_STORE).delete(key);
  tx.objectStore(STATE_STORE).delete(key);
  tx.objectStore(PROJECTS_STORE).delete(key);
  const meta = await requestToPromise(tx.objectStore(META_STORE).get(userId));
  if (meta?.lastActiveProjectId === projectId) {
    tx.objectStore(META_STORE).put(
      {
        userId,
        lastActiveProjectId: null,
        schemaVersion: PROJECT_SCHEMA_VERSION,
      },
      userId,
    );
  }
  await transactionDone(tx);
}

async function deleteLegacyDraft(userId) {
  const db = await openDraftDb();
  await deleteLegacyMediaForUser(db, userId);
  const tx = db.transaction([PDF_STORE, STATE_STORE], "readwrite");
  tx.objectStore(PDF_STORE).delete(userId);
  tx.objectStore(STATE_STORE).delete(userId);
  await transactionDone(tx);
}

function legacyDraftHasContent(legacy) {
  return Boolean(legacy?.pdf || legacy?.state || (legacy?.media ?? []).length > 0);
}

async function copyLegacyToProject(userId, projectId, legacy, now) {
  const state = {
    ...(legacy.state ?? {}),
    schemaVersion: DRAFT_SCHEMA_VERSION,
    userId,
    projectId,
  };
  const pdf = legacy.pdf
    ? {
        blob: legacy.pdf.blob,
        fileName: legacy.pdf.fileName,
        fileSize: Number.isFinite(legacy.pdf.fileSize)
          ? legacy.pdf.fileSize
          : legacy.pdf.blob?.size,
        pageCount: legacy.pdf.pageCount,
      }
    : null;
  if (pdf) {
    await writeProjectPdf(userId, projectId, pdf);
  }
  await writeProjectState(userId, projectId, state);
  const mediaEntries = (legacy.media ?? []).map((entry) => ({
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
  const summary = buildProjectSummary({
    userId,
    projectId,
    pdf,
    state,
    media: legacy.media,
    now,
    projectName: chooseRecoveredProjectName({ state, pdf }),
  });
  await writeProjectSummary(userId, projectId, summary);
}

export async function migrateLegacyUserDraft(userId, options = {}) {
  if (!isNonEmptyString(userId)) {
    return { migrated: false };
  }
  return withLock(async () => {
    const legacy = await readLegacyDraft(userId);
    if (!legacyDraftHasContent(legacy)) {
      return { migrated: false };
    }
    const meta = await readUserMeta(userId);
    if (meta?.lastActiveProjectId) {
      const active = await readProject(userId, meta.lastActiveProjectId);
      if (active?.pdf?.blob) {
        await deleteLegacyDraft(userId);
        return { migrated: false, cleanedLegacy: true, projectId: meta.lastActiveProjectId };
      }
    }
    const projectId = options.createProjectId?.() ?? createProjectId();
    try {
      await copyLegacyToProject(userId, projectId, legacy, options.now);
      options.afterCopy?.();
      const copied = await readProject(userId, projectId);
      const checked = validateDraft(
        {
          pdf: copied?.pdf,
          state: copied?.state,
          media: copied?.media ?? [],
        },
        userId,
        projectId,
      );
      if (!checked.ok) {
        throw new Error(checked.message || "移行後の検証に失敗しました。");
      }
      await writeUserMeta(userId, { lastActiveProjectId: projectId });
      await deleteLegacyDraft(userId);
      return { migrated: true, projectId };
    } catch (error) {
      try {
        await deleteProject(userId, projectId);
      } catch (cleanupError) {
        console.error(cleanupError);
      }
      throw error;
    }
  });
}

export async function readActiveProject(userId) {
  if (!isNonEmptyString(userId)) {
    return null;
  }
  await migrateLegacyUserDraft(userId);
  const meta = await readUserMeta(userId);
  const projectId = meta?.lastActiveProjectId;
  if (!projectId) {
    return null;
  }
  const project = await readProject(userId, projectId);
  if (!project) {
    return null;
  }
  return { ...project, projectId };
}

export async function readUserDraft(userId) {
  const active = await readActiveProject(userId);
  if (!active) {
    return null;
  }
  return {
    projectId: active.projectId,
    pdf: active.pdf,
    state: active.state,
    media: active.media,
    summary: active.summary,
  };
}

async function persistProjectSnapshot({
  userId,
  projectId,
  pdf,
  state,
  mediaEntries,
  previouslySavedIds,
  existingSummary,
}) {
  if (pdf) {
    await writeProjectPdf(userId, projectId, pdf);
  }
  await writeProjectState(userId, projectId, state);
  const savedMedia = await syncProjectMedia(
    userId,
    projectId,
    mediaEntries,
    previouslySavedIds,
  );
  const mediaForEstimate = mediaEntries.map((entry) => ({
    blob: entry.media?.blob,
  }));
  const summary = buildProjectSummary({
    userId,
    projectId,
    pdf: pdf ?? {
      fileName: existingSummary?.fileName,
      fileSize: existingSummary?.fileSize,
      pageCount: existingSummary?.pageCount,
    },
    state,
    media: mediaForEstimate,
    existing: existingSummary,
  });
  await writeProjectSummary(userId, projectId, summary);
  await writeUserMeta(userId, { lastActiveProjectId: projectId });
  return { savedMedia, summary };
}

export function createDraftController({
  debounceMs = DRAFT_AUTOSAVE_MS,
  getUserId,
  getProjectId,
  hasSession,
  collectState,
  collectMedia,
  onError,
}) {
  let timer = 0;
  let pending = false;
  let savedMediaIds = new Map();
  let lastErrorAt = 0;
  let cachedSummary = null;

  function cancel() {
    pending = false;
    if (timer) {
      clearTimeout(timer);
      timer = 0;
    }
  }

  function rememberMedia(entries) {
    savedMediaIds = new Map(
      entries.map((entry) => [entry.panelId, entry.media.blob]),
    );
  }

  function forgetMedia() {
    savedMediaIds = new Map();
    cachedSummary = null;
  }

  async function writeNow() {
    const userId = getUserId();
    const projectId = getProjectId?.();
    if (!userId || !projectId || !hasSession()) {
      pending = false;
      return;
    }
    pending = false;
    await withLock(async () => {
      if (getUserId() !== userId || getProjectId?.() !== projectId || !hasSession()) {
        return;
      }
      const state = collectState();
      const media = collectMedia();
      const result = await persistProjectSnapshot({
        userId,
        projectId,
        pdf: null,
        state,
        mediaEntries: media,
        previouslySavedIds: savedMediaIds,
        existingSummary: cachedSummary,
      });
      savedMediaIds = result.savedMedia;
      cachedSummary = result.summary;
    });
  }

  async function flush() {
    if (timer) {
      clearTimeout(timer);
      timer = 0;
    }
    while (pending && getUserId() && getProjectId?.() && hasSession()) {
      try {
        await writeNow();
      } catch (error) {
        pending = true;
        const now = Date.now();
        if (now - lastErrorAt > 8000) {
          lastErrorAt = now;
          onError?.(error);
        }
        return;
      }
    }
  }

  function schedule() {
    if (!getUserId() || !getProjectId?.() || !hasSession()) {
      return;
    }
    pending = true;
    if (timer) {
      clearTimeout(timer);
    }
    timer = setTimeout(() => {
      timer = 0;
      void flush();
    }, debounceMs);
  }

  async function replacePdf(pdf) {
    const userId = getUserId();
    const projectId = getProjectId?.();
    if (!userId || !projectId) {
      return;
    }
    cancel();
    try {
      await withLock(async () => {
        if (getUserId() !== userId || getProjectId?.() !== projectId || !hasSession()) {
          return;
        }
        const state = collectState();
        const media = collectMedia();
        const result = await persistProjectSnapshot({
          userId,
          projectId,
          pdf,
          state,
          mediaEntries: media,
          previouslySavedIds: new Map(),
          existingSummary: cachedSummary,
        });
        savedMediaIds = result.savedMedia;
        cachedSummary = result.summary;
      });
      lastErrorAt = 0;
    } catch (error) {
      pending = true;
      const now = Date.now();
      if (now - lastErrorAt > 8000) {
        lastErrorAt = now;
        onError?.(error);
      }
    }
  }

  function rememberSummary(summary) {
    cachedSummary = summary ?? null;
  }

  return {
    schedule,
    flush,
    cancel,
    replacePdf,
    rememberMedia,
    forgetMedia,
    rememberSummary,
  };
}

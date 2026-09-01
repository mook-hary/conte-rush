export const DRAFT_SCHEMA_VERSION = 1;
export const DRAFT_DB_NAME = "conte-rush-draft";
export const DRAFT_DB_VERSION = 1;
export const DRAFT_AUTOSAVE_MS = 750;

const PDF_STORE = "pdf";
const STATE_STORE = "state";
const MEDIA_STORE = "media";

let dbPromise = null;
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

function mediaKey(userId, panelId) {
  return `${userId}::${panelId}`;
}

function mediaKeyRange(userId) {
  return IDBKeyRange.bound(`${userId}::`, `${userId}::\uffff`);
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

export function openDraftDb() {
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

export function validateDraft(record, expectedUserId) {
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
  if (state.schemaVersion !== DRAFT_SCHEMA_VERSION) {
    return fail("未対応のschemaVersionです。");
  }
  if (!isNonEmptyString(state.userId) || state.userId !== expectedUserId) {
    return fail("userIdが一致しません。");
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

async function deleteMediaForUser(db, userId) {
  const tx = db.transaction(MEDIA_STORE, "readwrite");
  const store = tx.objectStore(MEDIA_STORE);
  const request = store.openCursor(mediaKeyRange(userId));
  request.onsuccess = () => {
    const cursor = request.result;
    if (!cursor) {
      return;
    }
    cursor.delete();
    cursor.continue();
  };
  await transactionDone(tx);
}

export async function readUserDraft(userId) {
  if (!isNonEmptyString(userId)) {
    return null;
  }
  const db = await openDraftDb();
  const tx = db.transaction([PDF_STORE, STATE_STORE, MEDIA_STORE], "readonly");
  const pdf = await requestToPromise(tx.objectStore(PDF_STORE).get(userId));
  const state = await requestToPromise(tx.objectStore(STATE_STORE).get(userId));
  const media = [];
  await new Promise((resolve, reject) => {
    const request = tx.objectStore(MEDIA_STORE).openCursor(mediaKeyRange(userId));
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) {
        resolve();
        return;
      }
      const value = cursor.value;
      if (value) {
        media.push({
          panelId: value.panelId,
          kind: value.kind,
          blob: value.blob,
          mimeType: value.mimeType,
          width: value.width,
          height: value.height,
        });
      }
      cursor.continue();
    };
    request.onerror = () => reject(request.error ?? new Error("media read failed"));
  });
  await transactionDone(tx);
  if (!pdf && !state && media.length === 0) {
    return null;
  }
  return { pdf, state, media };
}

export async function writeUserPdf(userId, pdf) {
  const db = await openDraftDb();
  const tx = db.transaction(PDF_STORE, "readwrite");
  tx.objectStore(PDF_STORE).put(
    {
      blob: pdf.blob,
      fileName: pdf.fileName,
      fileSize: pdf.fileSize,
      pageCount: pdf.pageCount,
    },
    userId,
  );
  await transactionDone(tx);
}

export async function writeUserState(userId, state) {
  const db = await openDraftDb();
  const tx = db.transaction(STATE_STORE, "readwrite");
  tx.objectStore(STATE_STORE).put(state, userId);
  await transactionDone(tx);
}

export async function syncUserMedia(userId, entries, previouslySavedIds) {
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
        panelId: entry.panelId,
        kind: entry.media.kind,
        blob: entry.media.blob,
        mimeType: entry.media.mimeType,
        width: entry.media.width,
        height: entry.media.height,
      },
      mediaKey(userId, entry.panelId),
    );
  }
  for (const panelId of previouslySavedIds.keys()) {
    if (!nextIds.has(panelId)) {
      store.delete(mediaKey(userId, panelId));
    }
  }
  await transactionDone(tx);
  const nextSaved = new Map();
  for (const entry of entries) {
    nextSaved.set(entry.panelId, entry.media.blob);
  }
  return nextSaved;
}

export async function deleteUserDraft(userId) {
  if (!isNonEmptyString(userId)) {
    return;
  }
  const db = await openDraftDb();
  await deleteMediaForUser(db, userId);
  const tx = db.transaction([PDF_STORE, STATE_STORE], "readwrite");
  tx.objectStore(PDF_STORE).delete(userId);
  tx.objectStore(STATE_STORE).delete(userId);
  await transactionDone(tx);
}

export function createDraftController({
  debounceMs = DRAFT_AUTOSAVE_MS,
  getUserId,
  hasSession,
  collectState,
  collectMedia,
  onError,
}) {
  let timer = 0;
  let pending = false;
  let savedMediaIds = new Map();
  let lastErrorAt = 0;

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
  }

  async function writeNow() {
    const userId = getUserId();
    if (!userId || !hasSession()) {
      pending = false;
      return;
    }
    pending = false;
    await withLock(async () => {
      if (getUserId() !== userId || !hasSession()) {
        return;
      }
      const state = collectState();
      const media = collectMedia();
      await writeUserState(userId, state);
      savedMediaIds = await syncUserMedia(userId, media, savedMediaIds);
    });
  }

  async function flush() {
    if (timer) {
      clearTimeout(timer);
      timer = 0;
    }
    while (pending && getUserId() && hasSession()) {
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
    if (!getUserId() || !hasSession()) {
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
    if (!userId) {
      return;
    }
    cancel();
    try {
      await withLock(async () => {
        if (getUserId() !== userId || !hasSession()) {
          return;
        }
        const state = collectState();
        const media = collectMedia();
        const db = await openDraftDb();
        await deleteMediaForUser(db, userId);
        await writeUserPdf(userId, pdf);
        await writeUserState(userId, state);
        savedMediaIds = await syncUserMedia(userId, media, new Map());
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

  async function clearUser(userId) {
    cancel();
    forgetMedia();
    if (!userId) {
      return;
    }
    await withLock(async () => {
      await deleteUserDraft(userId);
      forgetMedia();
    });
  }

  return {
    schedule,
    flush,
    cancel,
    replacePdf,
    clearUser,
    rememberMedia,
    forgetMedia,
  };
}

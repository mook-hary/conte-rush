import { destroyPdfDocument, loadPdfFromFile } from "./pdf-loader.js";
import { isSamePdfReconnect } from "./pdf-session.js";
import { orderCutsForPlayback } from "./cut-order.js";
import { createCutStore } from "./cut-store.js";
import {
  formatDuration,
  formatDurationLabel,
  formatFrameRange,
  formatFrameTime,
  formatFrameTimeLabel,
  parseDurationInput,
} from "./duration.js?v=m8-1";
import {
  PREVIEW_SCALE,
  renderableToObjectUrl,
} from "./panel-image.js?v=m10-1";
import { createHistory } from "./history.js?v=m6-2";
import { createPdfViewer } from "./pdf-viewer.js";
import { createPanelOverlay } from "./panel-overlay.js?v=m6-2";
import { createTimelineEditor } from "./timeline-editor.js?v=m10-4-1";
import {
  clonePanel,
  createPanelStore,
  isPdfPanel,
  PANEL_SOURCE_DRAWING,
  PANEL_SOURCE_UPLOAD,
  panelShortLabel,
  panelSourceLabel,
} from "./panel-store.js?v=m10-1";
import { createPanelMediaStore } from "./panel-media-store.js?v=m10-0";
import { createPanelImageProvider } from "./panel-image-provider.js?v=m10-2";
import { createDrawingEditor } from "./drawing-editor.js?v=m10-4";
import { decodeUploadedFile } from "./upload-image.js?v=m10-1";
import { createThumbnailCache } from "./thumbnail-cache.js";
import {
  createTimelineStore,
  evenPlacements,
  neighborsAroundFrame,
  onionNeighbors,
  parseStartFrameInput,
} from "./timeline-store.js?v=m10-4";
import {
  expandRepeat,
  parseHoldFrames,
} from "./timeline-repeat.js?v=m8-1";
import {
  createRushImageCache,
  RUSH_SCALE,
} from "./rush-image-cache.js";
import { renderFrame, rushCanvasPixelSize } from "./frame-renderer.js";
import { createMotionEditor } from "./motion-editor.js?v=m9-3";
import {
  canSampleMotion,
  createMotionStore,
  deriveMotionWindow,
  fixFramesOf,
  motionLabel,
  motionsEqual,
  validateMotionWindowForRanges,
} from "./motion-store.js?v=m9-3";
import { poseForResolvedFrame } from "./frame-pose.js?v=m9-3";
import {
  ExportError,
  exportFileName,
  exportMp4,
} from "./mp4-exporter.js?v=m10-0";
import {
  buildTimesheetModel,
  buildSheetView,
  panelNumberMap,
} from "./timesheet-model.js?v=m9-3";
import { paintTimesheetOnto } from "./timesheet-renderer.js?v=m9-5";
import {
  buildTimesheetPdf,
  timesheetFileName,
} from "./timesheet-pdf.js?v=m9-5";
import {
  buildSnapshot,
  createRushPlayer,
  cutNumberForPanel,
  describeIncomplete,
  inspectCuts,
  uniquePanelIds,
} from "./rush-player.js?v=cut-order-1";
import {
  applyDraftToStores,
  createDraftController,
  createProjectId,
  DRAFT_SCHEMA_VERSION,
  readUserDraft,
  serializeProjectState,
  validateDraft,
} from "./project-persistence.js?v=draft-2";

const pdfInput = document.querySelector("#pdf-input");
const fileNameEl = document.querySelector("#file-name");
const statusEl = document.querySelector("#status");
const persistToastEl = document.querySelector("#persist-toast");
const pageInfoEl = document.querySelector("#page-info");
const prevButton = document.querySelector("#prev-page");
const nextButton = document.querySelector("#next-page");
const canvas = document.querySelector("#pdf-canvas");
const viewerEl = document.querySelector(".viewer-main");
const overlayEl = document.querySelector("#panel-overlay");
const panelCountsEl = document.querySelector("#panel-counts");
const panelListEl = document.querySelector("#panel-list");
const cutForm = document.querySelector("#cut-form");
const cutNumberInput = document.querySelector("#cut-number-input");
const cutDurationInput = document.querySelector("#cut-duration-input");
const cutNumberClear = document.querySelector("#cut-number-clear");
const cutDurationClear = document.querySelector("#cut-duration-clear");
const cutMessageEl = document.querySelector("#cut-message");
const cutListEl = document.querySelector("#cut-list");
const cutDetailEmptyEl = document.querySelector("#cut-detail-empty");
const cutDetailBodyEl = document.querySelector("#cut-detail-body");
const cutDetailForm = document.querySelector("#cut-detail-form");
const detailCutNumberInput = document.querySelector("#detail-cut-number-input");
const detailCutDurationInput = document.querySelector("#detail-cut-duration-input");
const detailCutNumberClear = document.querySelector("#detail-cut-number-clear");
const detailCutDurationClear = document.querySelector("#detail-cut-duration-clear");
const cutAddSelectedButton = document.querySelector("#cut-add-selected");
const cutDeleteButton = document.querySelector("#cut-delete");
const cutMembersEl = document.querySelector("#cut-members");
const cutDetailTitleEl = document.querySelector("#cut-detail-title");
const cutTimelineStripEl = document.querySelector("#cut-timeline-strip");
const motionEditorEl = document.querySelector("#motion-editor");
const timelineMetaEl = document.querySelector("#timeline-meta");
const timelineStatusEl = document.querySelector("#timeline-status");
const timelineRepeatSequenceEl = document.querySelector(
  "#timeline-repeat-sequence",
);
const timelineRepeatHoldInput = document.querySelector("#timeline-repeat-hold");
const timelineRepeatHintEl = document.querySelector("#timeline-repeat-hint");
const timelineRepeatApplyButton = document.querySelector(
  "#timeline-repeat-apply",
);
const timelineUnusedEl = document.querySelector("#timeline-unused");
const timelineRowsEl = document.querySelector("#timeline-rows");
const timelineRangesEl = document.querySelector("#timeline-ranges");
const timelineMessageEl = document.querySelector("#timeline-message");
const rushStatusEl = document.querySelector("#rush-status");
const rushCutEl = document.querySelector("#rush-cut");
const rushLocalEl = document.querySelector("#rush-local");
const rushGlobalEl = document.querySelector("#rush-global");
const rushMessageEl = document.querySelector("#rush-message");
const rushPlaceholderEl = document.querySelector("#rush-placeholder");
const rushCanvasEl = document.querySelector("#rush-canvas");
const rushPlayButton = document.querySelector("#rush-play");
const rushPauseButton = document.querySelector("#rush-pause");
const rushResetButton = document.querySelector("#rush-reset");
const exportButton = document.querySelector("#export-mp4");
const exportCancelButton = document.querySelector("#export-cancel");
const exportStatusEl = document.querySelector("#export-status");
const timesheetEpisodeInput = document.querySelector("#timesheet-episode");
const timesheetTitleInput = document.querySelector("#timesheet-title");
const timesheetPreviewButton = document.querySelector("#timesheet-preview");
const timesheetExportButton = document.querySelector("#timesheet-export");
const timesheetMessageEl = document.querySelector("#timesheet-message");
const timesheetPreviewWrapEl = document.querySelector("#timesheet-preview-wrap");
const timesheetPreviewCanvasEl = document.querySelector(
  "#timesheet-preview-canvas",
);
const timesheetPrevSheetButton = document.querySelector("#timesheet-prev-sheet");
const timesheetNextSheetButton = document.querySelector("#timesheet-next-sheet");
const timesheetSheetInfoEl = document.querySelector("#timesheet-sheet-info");
const placeModeFrameButton = document.querySelector("#place-mode-frame");
const placeModeDragButton = document.querySelector("#place-mode-drag");
const aspectLockInput = document.querySelector("#aspect-lock");
const capturePanelButton = document.querySelector("#capture-panel");
const openDrawingButton = document.querySelector("#open-drawing");
const uploadPanelButton = document.querySelector("#upload-panel");
const panelPlaceMessageEl = document.querySelector("#panel-place-message");
const undoButton = document.querySelector("#undo");
const redoButton = document.querySelector("#redo");

let session = null;
let loadToken = 0;
let resizeTimer = 0;
let thumbnailToken = 0;
let drainingThumbnails = false;
let panelCropQueue = Promise.resolve();
let selectedCutId = null;
let timelineCutId = null;
let panelPlaceMode = "frame";
let selectedTimelinePanelId = null;
let selectedPlacementId = null;
let insertMenuState = null;
let unplacedPlaceDrag = null;
let repeatHoldRaw = "4";
let rushPrepToken = 0;
let rushPreparing = false;
let rushError = "";
let rushView = null;
let rushMotionFreeze = null;
let exportRunning = false;
let exportCancelRequested = false;
let exportJobPromise = null;
let appActive = false;
let appListenersBound = false;
let timesheetEpisode = "";
let timesheetTitle = "";
let timesheetPreviewIndex = 0;
let timesheetPreviewOpen = false;
let timesheetExporting = false;
let motionFixMessage = "";
let motionFixPanelId = null;
let persistenceUserId = null;
let currentProjectId = null;
let restoringDraft = false;
let persistToastTimer = 0;
let historyAutosaveBound = false;
let persistListenersBound = false;

const queuedThumbnails = [];
const queuedThumbnailIds = new Set();
const inFlightThumbnailIds = new Set();
const failedThumbnailIds = new Set();
const selectedPanelIds = new Set();
const timelineDrafts = new Map();
const timelineAddDrafts = new Map();

const viewer = createPdfViewer(canvas, viewerEl);
const panelStore = createPanelStore();
const panelMediaStore = createPanelMediaStore();
const panelImageProvider = createPanelImageProvider({
  getPdfDocument: () => session?.document ?? null,
  mediaStore: panelMediaStore,
});
const cutStore = createCutStore();
const timelineStore = createTimelineStore();
const motionStore = createMotionStore();
const thumbnailCache = createThumbnailCache();
const rushImageCache = createRushImageCache();
const history = createHistory();
const drawingEditor = createDrawingEditor();
const overlay = createPanelOverlay(overlayEl, {
  isEnabled: () => document.body.dataset.state === "viewing" && Boolean(session),
  getPageNumber: () => session?.currentPage ?? null,
  onCreate(rect) {
    registerPanel(rect, { returnToFrame: true });
  },
});
const insertMenuEl = document.createElement("div");
insertMenuEl.className = "cut-timeline-insert-menu";
insertMenuEl.hidden = true;
cutTimelineStripEl.append(insertMenuEl);

const cutTimelineEditor = createTimelineEditor(cutTimelineStripEl, {
  onPreview({ placementId, candidateFrame }) {
    previewStartFrameInput(placementId, candidateFrame);
  },
  onCommit(payload) {
    commitCutTimelineDrag(payload);
  },
  onCancel({ placementId, savedFrame }) {
    restoreStartFrameInput(placementId, savedFrame);
  },
  onSelect({ placementId, panelId }) {
    closeInsertMenu();
    selectTimelinePlacement({ placementId, panelId });
  },
  onTrackPreview({ frame }) {
    previewMemberPlace(frame);
  },
  onTrackPlace({ frame }) {
    placeSelectedMemberAtFrame(frame);
  },
  onInsertPlus({ frame }) {
    openInsertMenu(frame);
  },
  onInsertCancel() {
    closeInsertMenu({ unlock: false });
  },
});
const motionEditor = createMotionEditor(motionEditorEl, {
  onSelect({ panelId }) {
    selectTimelinePanel(panelId);
  },
  onCommit(payload) {
    commitMotionChange(payload);
  },
  onDelete(payload) {
    deleteMotion(payload);
  },
});

function setState(state, message) {
  document.body.dataset.state = state;
  statusEl.textContent = message;
  overlay.setEnabled(state === "viewing" && Boolean(session));
  updatePlaceUi();
}

function updatePager() {
  if (!session) {
    pageInfoEl.textContent = "";
    prevButton.disabled = true;
    nextButton.disabled = true;
    return;
  }

  pageInfoEl.textContent = `${session.currentPage} / ${session.pageCount}`;
  prevButton.disabled = session.currentPage <= 1;
  nextButton.disabled = session.currentPage >= session.pageCount;
}

function updateHistoryButtons() {
  undoButton.disabled = !history.canUndo();
  redoButton.disabled = !history.canRedo();
  undoButton.title = history.peekUndo()?.label
    ? `Undo: ${history.peekUndo().label}`
    : "Undo";
  redoButton.title = history.peekRedo()?.label
    ? `Redo: ${history.peekRedo().label}`
    : "Redo";
}

function updatePlaceUi() {
  placeModeFrameButton.setAttribute(
    "aria-pressed",
    panelPlaceMode === "frame" ? "true" : "false",
  );
  placeModeDragButton.setAttribute(
    "aria-pressed",
    panelPlaceMode === "drag" ? "true" : "false",
  );
  const frame = overlay.getFrame();
  aspectLockInput.checked = frame?.aspectLocked ?? true;
  const canUseSession =
    document.body.dataset.state === "viewing" && Boolean(session);
  capturePanelButton.disabled = !canUseSession || !frame;
  if (openDrawingButton) {
    openDrawingButton.disabled = !canUseSession;
  }
  if (uploadPanelButton) {
    uploadPanelButton.disabled = !canUseSession;
  }
  updateHistoryButtons();
}

function setPanelPlaceMessage(message) {
  if (panelPlaceMessageEl) {
    panelPlaceMessageEl.textContent = message ?? "";
  }
}

function setPanelPlaceMode(nextMode) {
  panelPlaceMode = nextMode === "drag" ? "drag" : "frame";
  overlay.setMode(panelPlaceMode);
  updatePlaceUi();
}

function resetPanelPlaceState() {
  panelPlaceMode = "frame";
  overlay.setMode("frame");
  aspectLockInput.checked = true;
  updatePlaceUi();
}

function initSelectionFrame() {
  overlay.resetFrame();
  aspectLockInput.checked = true;
  setPanelPlaceMode("frame");
}

function clonePanelData(panel) {
  return clonePanel(panel);
}

function clonePlacementData(placement) {
  return {
    id: placement.id,
    panelId: placement.panelId,
    startFrame: placement.startFrame,
  };
}

function clonePlacementList(placements) {
  return (placements ?? []).map(clonePlacementData);
}

function capturePanelSnapshot(panelId) {
  const panel = panelStore.getById(panelId);
  if (!panel) {
    return null;
  }
  const cutId = cutStore.findCutIdByPanelId(panelId);
  const cut = cutId ? cutStore.getById(cutId) : null;
  const timeline = cutId ? timelineStore.getByCutId(cutId) : null;
  const placements = (timeline?.placements ?? []).filter(
    (item) => item.panelId === panelId,
  );
  return {
    panel: clonePanelData(panel),
    media: panelMediaStore.get(panelId),
    index: panelStore.indexOf(panelId),
    cutId: cut?.id ?? null,
    panelIdsIndex: cut ? cut.panelIds.indexOf(panelId) : -1,
    placements: clonePlacementList(placements),
    motion: cutId ? motionStore.get(cutId, panelId) : null,
  };
}

function insertPanelIdAt(cutId, panelId, index) {
  const cut = cutStore.getById(cutId);
  if (!cut) {
    return false;
  }
  const ids = cut.panelIds.filter((id) => id !== panelId);
  const at = Math.min(Math.max(0, index), ids.length);
  ids.splice(at, 0, panelId);
  cutStore.update(cutId, { panelIds: ids });
  return true;
}

function restorePanelSnapshot(snapshot) {
  if (!snapshot?.panel) {
    return;
  }
  panelStore.restore(snapshot.panel, snapshot.index);
  if (snapshot.media) {
    panelMediaStore.set(snapshot.panel.id, snapshot.media);
  } else {
    panelMediaStore.delete(snapshot.panel.id);
  }
  if (snapshot.cutId) {
    insertPanelIdAt(snapshot.cutId, snapshot.panel.id, snapshot.panelIdsIndex);
    const cut = cutStore.getById(snapshot.cutId);
    if (cut && Array.isArray(snapshot.placements)) {
      for (const placement of snapshot.placements) {
        timelineAddDrafts.set(snapshot.panel.id, String(placement.startFrame));
        timelineDrafts.set(placement.id, String(placement.startFrame));
        const result = timelineStore.addPlacement(
          cut.id,
          {
            id: placement.id,
            panelId: placement.panelId,
            startFrame: placement.startFrame,
          },
          cut,
        );
        if (!result.ok) {
          setTimelineMessage(result.message);
        }
      }
    }
    if (snapshot.motion) {
      motionStore.upsert(snapshot.cutId, snapshot.motion);
    }
  }
  failedThumbnailIds.delete(snapshot.panel.id);
  requestThumbnail(snapshot.panel);
  markRushDirty();
  syncPanels();
}

function removePanelInternal(panelId) {
  cutStore.removePanelFromAll(panelId);
  timelineStore.removePanelFromAll(panelId);
  motionStore.removePanelFromAll(panelId);
  selectedPanelIds.delete(panelId);
  if (selectedTimelinePanelId === panelId) {
    selectedTimelinePanelId = null;
  }
  if (selectedPlacementId) {
    const remainingCuts = cutStore.listAll();
    const stillThere = remainingCuts.some((cut) =>
      timelineStore.getPlacementById(cut.id, selectedPlacementId),
    );
    if (!stillThere) {
      selectedPlacementId = null;
    }
  }
  panelStore.remove(panelId);
  panelMediaStore.delete(panelId);
  cancelQueuedThumbnail(panelId);
  thumbnailCache.delete(panelId);
  rushImageCache.delete(panelId);
  failedThumbnailIds.delete(panelId);
  timelineAddDrafts.delete(panelId);
  markRushDirty();
  syncPanels();
}

function registerPanel(rect, { returnToFrame = false } = {}) {
  if (!session || !rect) {
    return null;
  }
  const panel = panelStore.add({
    pageNumber: rect.pageNumber,
    x: rect.x,
    y: rect.y,
    width: rect.width,
    height: rect.height,
  });
  const snapshot = capturePanelSnapshot(panel.id);
  history.push({
    label: "Panelを追加",
    undo() {
      removePanelInternal(panel.id);
    },
    redo() {
      restorePanelSnapshot(snapshot);
    },
  });
  markRushDirty();
  requestThumbnail(panel);
  syncPanels();
  if (returnToFrame) {
    setPanelPlaceMode("frame");
  }
  updateHistoryButtons();
  return panel;
}

function invalidatePanelImages(panelId) {
  cancelQueuedThumbnail(panelId);
  thumbnailCache.delete(panelId);
  rushImageCache.delete(panelId);
  failedThumbnailIds.delete(panelId);
}

function applyPanelMedia(panelId, media) {
  if (media) {
    panelMediaStore.set(panelId, media);
  } else {
    panelMediaStore.delete(panelId);
  }
  invalidatePanelImages(panelId);
  const panel = panelStore.getById(panelId);
  if (panel) {
    requestThumbnail(panel);
  }
  markRushDirty();
  syncPanels();
}

function registerMediaPanel(source, media, label) {
  const panel = panelStore.addMedia(source);
  panelMediaStore.set(panel.id, media);
  const snapshot = capturePanelSnapshot(panel.id);
  history.push({
    label,
    undo() {
      removePanelInternal(panel.id);
    },
    redo() {
      restorePanelSnapshot(snapshot);
    },
  });
  markRushDirty();
  requestThumbnail(panel);
  syncPanels();
  updateHistoryButtons();
  return panel;
}

function replacePanelMedia(panelId, nextMedia, label) {
  const previous = panelMediaStore.get(panelId);
  if (!previous) {
    return false;
  }
  applyPanelMedia(panelId, nextMedia);
  history.push({
    label,
    undo() {
      applyPanelMedia(panelId, previous);
    },
    redo() {
      applyPanelMedia(panelId, nextMedia);
    },
  });
  updateHistoryButtons();
  return true;
}

function pickLocalImageFile() {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/png,image/jpeg,image/webp";
    input.addEventListener(
      "change",
      () => {
        resolve(input.files?.[0] ?? null);
      },
      { once: true },
    );
    input.click();
  });
}

async function handleCreateDrawing() {
  if (!session || document.body.dataset.state !== "viewing" || drawingEditor.isOpen()) {
    return;
  }
  setPanelPlaceMessage("");
  const result = await drawingEditor.open({ mode: "create" });
  if (!result?.blob) {
    return;
  }
  registerMediaPanel(
    PANEL_SOURCE_DRAWING,
    {
      kind: "drawing",
      blob: result.blob,
      mimeType: result.mimeType,
      width: result.width,
      height: result.height,
    },
    "手描きPanelを追加",
  );
}

function onionSideView(cut, neighbor) {
  if (!neighbor?.panelId) {
    return null;
  }
  const panel = panelStore.getById(neighbor.panelId);
  const number = cutPanelNumber(cut, neighbor.panelId);
  return {
    panelId: neighbor.panelId,
    number,
    numberLabel: formatPanelNumberMark(number),
    kindLabel: panelSourceLabel(panel),
    thumbUrl: thumbnailCache.get(neighbor.panelId)?.url ?? "",
  };
}

async function loadOnionNeighborImage(neighborPanelId) {
  const neighbor = panelStore.getById(neighborPanelId);
  if (!neighbor) {
    throw new Error("参照Panelがありません。");
  }
  const rendered = await panelImageProvider.getRenderable(neighbor, {
    purpose: "onion",
    pdfDocument: session?.document,
  });
  return rendered.image;
}

function onionOptionFromNeighbors(cut, neighbors) {
  return {
    prevPanelId: neighbors?.prev?.panelId ?? null,
    nextPanelId: neighbors?.next?.panelId ?? null,
    prevView: onionSideView(cut, neighbors?.prev),
    nextView: onionSideView(cut, neighbors?.next),
    loadImage: loadOnionNeighborImage,
  };
}

function resolveOnionOption(panelId, { cutId = null, placementId = null } = {}) {
  if (!cutId || !placementId || !panelId) {
    return null;
  }
  const cut = cutStore.getById(cutId);
  const timeline = timelineStore.getByCutId(cutId);
  const placement = timelineStore.getPlacementById(cutId, placementId);
  if (!cut || !timeline || !placement || placement.panelId !== panelId) {
    return null;
  }
  return onionOptionFromNeighbors(cut, onionNeighbors(cut, timeline, placementId));
}

function resolveInsertOnionOption(cutId, startFrame) {
  const cut = cutStore.getById(cutId);
  const timeline = timelineStore.getByCutId(cutId);
  if (!cut) {
    return null;
  }
  return onionOptionFromNeighbors(
    cut,
    neighborsAroundFrame(cut, timeline, startFrame),
  );
}

function insertStartFrameTaken(cutId, startFrame) {
  const timeline = timelineStore.getByCutId(cutId);
  return (timeline?.placements ?? []).some(
    (item) => item.startFrame === startFrame,
  );
}

async function handleEditDrawing(panelId, context = {}) {
  const panel = panelStore.getById(panelId);
  const media = panelMediaStore.get(panelId);
  if (!panel || panel.source !== PANEL_SOURCE_DRAWING || !media?.blob) {
    return;
  }
  if (drawingEditor.isOpen()) {
    drawingEditor.close();
  }
  setPanelPlaceMessage("");
  let result;
  try {
    result = await drawingEditor.open({
      mode: "reedit",
      backgroundBlob: media.blob,
      onion: resolveOnionOption(panelId, context),
    });
  } catch (error) {
    console.error(error);
    setPanelPlaceMessage(error.message || "手描き画像を開けませんでした。");
    return;
  }
  if (!result?.blob) {
    return;
  }
  replacePanelMedia(
    panelId,
    {
      kind: "drawing",
      blob: result.blob,
      mimeType: result.mimeType,
      width: result.width,
      height: result.height,
    },
    "手描きPanelを編集",
  );
}

async function handleUploadPanel() {
  if (!session || document.body.dataset.state !== "viewing") {
    return;
  }
  setPanelPlaceMessage("");
  const file = await pickLocalImageFile();
  if (!file) {
    return;
  }
  try {
    const decoded = await decodeUploadedFile(file);
    registerMediaPanel(
      PANEL_SOURCE_UPLOAD,
      {
        kind: "upload",
        blob: decoded.blob,
        mimeType: decoded.mimeType,
        width: decoded.width,
        height: decoded.height,
      },
      "画像Panelを追加",
    );
  } catch (error) {
    console.error(error);
    setPanelPlaceMessage(error.message || "画像を読み込めませんでした。");
  }
}

async function handleReplaceUpload(panelId) {
  const panel = panelStore.getById(panelId);
  if (!panel || panel.source !== PANEL_SOURCE_UPLOAD) {
    return;
  }
  setPanelPlaceMessage("");
  const file = await pickLocalImageFile();
  if (!file) {
    return;
  }
  try {
    const decoded = await decodeUploadedFile(file);
    replacePanelMedia(
      panelId,
      {
        kind: "upload",
        blob: decoded.blob,
        mimeType: decoded.mimeType,
        width: decoded.width,
        height: decoded.height,
      },
      "画像Panelを差し替え",
    );
  } catch (error) {
    console.error(error);
    setPanelPlaceMessage(error.message || "画像を読み込めませんでした。");
  }
}

function captureCurrentFrame() {
  if (!session) {
    return;
  }
  const frame = overlay.getFrame();
  if (!frame) {
    return;
  }
  registerPanel({
    pageNumber: session.currentPage,
    x: frame.x,
    y: frame.y,
    width: frame.width,
    height: frame.height,
  });
  setPanelPlaceMode("frame");
}

function isTextEditingTarget(target) {
  if (!(target instanceof Element)) {
    return false;
  }
  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") {
    return true;
  }
  return Boolean(target.closest("[contenteditable='true'], [contenteditable='']"));
}

function handleUndo() {
  if (drawingEditor.isOpen()) {
    return;
  }
  if (!history.canUndo()) {
    return;
  }
  history.undo();
  updatePlaceUi();
  renderTimelineViews();
  scheduleDraftSave();
}

function handleRedo() {
  if (drawingEditor.isOpen()) {
    return;
  }
  if (!history.canRedo()) {
    return;
  }
  history.redo();
  updatePlaceUi();
  renderTimelineViews();
  scheduleDraftSave();
}

function panelExists(panelId) {
  return Boolean(panelStore.getById(panelId));
}

function normalizeCutNumber(raw) {
  return String(raw ?? "").trim();
}

function setCutMessage(message) {
  cutMessageEl.textContent = message ?? "";
}

function setTimelineMessage(message) {
  timelineMessageEl.textContent = message ?? "";
}

function setRushMessage(message) {
  rushMessageEl.textContent = message ?? "";
}

function enqueuePanelCrop(work) {
  const result = panelCropQueue.then(work, work);
  panelCropQueue = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}

function markRushDirty() {
  rushPlayer.markDirty();
  if (rushPreparing) {
    rushPrepToken += 1;
    rushPreparing = false;
    renderRush();
  }
}

function formatRushIssues(issues) {
  return issues
    .map((issue) =>
      issue.cutNumber
        ? `CUT ${issue.cutNumber}: ${issue.reason}`
        : issue.reason,
    )
    .join("\n");
}

function rushStatusLabel() {
  if (rushError) {
    return "エラー";
  }
  if (rushPreparing) {
    return "再生準備中";
  }
  if (rushPlayer.isPlaying()) {
    return "再生中";
  }
  if (rushPlayer.hasEnded()) {
    return "終了";
  }
  if (rushPlayer.hasSnapshot()) {
    return "一時停止";
  }
  return "未準備";
}

function loadImageElement(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("画像を読み込めませんでした。"));
    image.src = url;
  });
}

function sizeRushCanvas() {
  const { width, height } = rushCanvasPixelSize(window.devicePixelRatio || 1);
  if (rushCanvasEl.width !== width || rushCanvasEl.height !== height) {
    rushCanvasEl.width = width;
    rushCanvasEl.height = height;
  }
}

function freezeExportPanels(snapshot) {
  const panels = new Map();
  for (const panelId of uniquePanelIds(snapshot)) {
    const panel = panelStore.getById(panelId);
    if (panel) {
      panels.set(panelId, clonePanelData(panel));
    }
  }
  return panels;
}

function setExportMessage(message, isError = false) {
  if (!exportStatusEl) {
    return;
  }
  exportStatusEl.textContent = message ?? "";
  exportStatusEl.classList.toggle("is-error", Boolean(isError));
}

function setPdfInputLocked(locked) {
  pdfInput.disabled = locked;
  pdfInput.title = locked ? "書き出し中はPDFを差し替えできません" : "";
}

function updateExportUi() {
  const canExport = Boolean(session) && !rushPreparing;
  if (exportButton) {
    exportButton.disabled = !canExport || exportRunning;
  }
  if (exportCancelButton) {
    exportCancelButton.hidden = !exportRunning;
    exportCancelButton.disabled = !exportRunning;
  }
}

function formatExportProgress(progress) {
  if (!progress) {
    return "";
  }
  if (progress.phase === "preparing") {
    return `準備中（画像 ${progress.preparedCount} / ${progress.prepareTotal}）`;
  }
  if (progress.phase === "encoding") {
    const total = progress.totalFrames;
    const current = progress.currentFrame;
    const percent = total > 0 ? Math.floor((100 * current) / total) : 0;
    return `エンコード中 ${current} / ${total}f（${percent}%）`;
  }
  return "";
}

function formatExportError(error) {
  if (error instanceof ExportError) {
    if (error.code === "image" && error.cutNumber) {
      return `CUT ${error.cutNumber}: Panel ${error.panelId} の画像を準備できませんでした。`;
    }
    return error.message;
  }
  return `書き出しに失敗しました。${error?.message ?? ""}`.trim();
}

function downloadBlob(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 0);
}

async function handleExportMp4() {
  if (!appActive || exportRunning || rushPreparing) {
    return;
  }
  if (!session?.document) {
    setExportMessage("PDFが読み込まれていません。", true);
    return;
  }
  if (rushPlayer.isPlaying()) {
    setExportMessage(
      "再生中は書き出せません。Pauseしてから書き出してください。",
      true,
    );
    return;
  }

  const cuts = cutStore.listAll();
  const inspected = inspectCuts(cuts, (cutId) => timelineStore.getByCutId(cutId));
  if (!inspected.ok) {
    setExportMessage(formatRushIssues(inspected.issues), true);
    return;
  }

  const snapshot = buildSnapshot(cuts, (cutId) => timelineStore.getByCutId(cutId));
  if (!snapshot || snapshot.totalFrames < 1) {
    setExportMessage("書き出せるCutがありません。", true);
    return;
  }

  const motions = motionStore.listAll();
  const panels = freezeExportPanels(snapshot);
  const pdfDocument = session.document;
  const fileName = exportFileName(session.fileName);

  exportRunning = true;
  exportCancelRequested = false;
  setPdfInputLocked(true);
  setExportMessage("準備中");
  updateExportUi();
  renderRush();

  const job = (async () => {
    try {
      const blob = await exportMp4({
        snapshot,
        motions,
        panels,
        pdfDocument,
        getRenderable: (panel, options) => panelImageProvider.getRenderable(panel, options),
        shouldCancel: () => exportCancelRequested,
        onProgress(progress) {
          setExportMessage(formatExportProgress(progress));
        },
      });
      if (exportCancelRequested) {
        setExportMessage("書き出しをキャンセルしました");
        return;
      }
      downloadBlob(blob, fileName);
      setExportMessage("書き出し完了");
    } catch (error) {
      if (error instanceof ExportError && error.code === "cancelled") {
        setExportMessage("書き出しをキャンセルしました");
        return;
      }
      console.error(error);
      setExportMessage(formatExportError(error), true);
    } finally {
      exportRunning = false;
      exportCancelRequested = false;
      setPdfInputLocked(false);
      updateExportUi();
      renderRush();
    }
  })();
  exportJobPromise = job;
  try {
    await job;
  } finally {
    if (exportJobPromise === job) {
      exportJobPromise = null;
    }
  }
}

function handleExportCancel() {
  if (!exportRunning) {
    return;
  }
  exportCancelRequested = true;
}

function poseForRushView(view) {
  return poseForResolvedFrame(
    rushPlayer.getSnapshot(),
    rushMotionFreeze,
    view,
  );
}

function showRushView(view) {
  rushView = view;
  sizeRushCanvas();
  const cached = view?.panelId ? rushImageCache.get(view.panelId) : null;
  const image = cached?.image ?? null;
  if (image) {
    rushPlaceholderEl.hidden = true;
    renderFrame({
      canvas: rushCanvasEl,
      image,
      pose: poseForRushView(view),
    });
  } else {
    renderFrame({ canvas: rushCanvasEl, image: null, pose: null });
    rushPlaceholderEl.hidden = false;
    rushPlaceholderEl.textContent = rushPreparing
      ? "画像を準備しています"
      : "未準備";
  }

  rushCutEl.textContent = view ? `CUT ${view.cutNumber}` : "";
  fillRushMeter(rushLocalEl, "Local", view?.localFrame, view?.durationFrames);
  fillRushMeter(rushGlobalEl, "Global", view?.globalFrame, view?.totalFrames);
}

function fillRushMeter(element, label, current, total) {
  element.replaceChildren();
  if (!Number.isInteger(current) || !Number.isInteger(total)) {
    return;
  }
  const name = document.createElement("span");
  name.className = "rush-meter-label";
  name.textContent = label;
  const time = document.createElement("span");
  time.className = "rush-meter-time";
  time.textContent = `${formatFrameTime(current)} / ${formatFrameTime(total)}`;
  const frames = document.createElement("span");
  frames.className = "rush-meter-frames";
  frames.textContent = `${current}f / ${total}f`;
  element.append(name, time, frames);
}

function renderRush() {
  rushStatusEl.textContent = rushStatusLabel();
  if (rushPreparing && !rushError) {
    setRushMessage("画像を準備しています");
  } else {
    setRushMessage(rushError);
  }

  if (rushPreparing && !rushView) {
    showRushView(null);
    rushPlaceholderEl.hidden = false;
    rushPlaceholderEl.textContent = "画像を準備しています";
  } else if (rushView) {
    showRushView(rushView);
  } else {
    showRushView(null);
  }

  const canControl = Boolean(session) && !exportRunning;
  rushPlayButton.disabled = !canControl || rushPreparing;
  rushPauseButton.disabled = !canControl || !rushPlayer.isPlaying();
  rushResetButton.disabled = !canControl;
  updateExportUi();
}

const rushPlayer = createRushPlayer({
  onFrame(view) {
    showRushView(view);
    renderRush();
  },
});

async function prepareRushImages(snapshot, token) {
  const panelIds = uniquePanelIds(snapshot);
  for (const panelId of panelIds) {
    if (token !== rushPrepToken) {
      return { ok: false, cancelled: true };
    }
    if (rushImageCache.get(panelId)?.image) {
      continue;
    }
    const existing = rushImageCache.get(panelId);
    if (existing?.url) {
      try {
        const image = await loadImageElement(existing.url);
        if (token !== rushPrepToken) {
          return { ok: false, cancelled: true };
        }
        rushImageCache.set(panelId, { url: existing.url, image });
        continue;
      } catch (error) {
        console.error(error);
        rushImageCache.delete(panelId);
      }
    }
    const panel = panelStore.getById(panelId);
    const cutNumber = cutNumberForPanel(snapshot, panelId);
    if (!panel || (isPdfPanel(panel) && !session?.document)) {
      return { ok: false, panelId, cutNumber };
    }
    try {
      const rendered = await enqueuePanelCrop(() =>
        panelImageProvider.getRenderable(panel, {
          purpose: "rush",
          scale: RUSH_SCALE,
          pdfDocument: session?.document,
        }),
      );
      if (token !== rushPrepToken) {
        return { ok: false, cancelled: true };
      }
      const url = await renderableToObjectUrl(rendered);
      if (token !== rushPrepToken) {
        URL.revokeObjectURL(url);
        return { ok: false, cancelled: true };
      }
      const image = await loadImageElement(url);
      if (token !== rushPrepToken) {
        URL.revokeObjectURL(url);
        return { ok: false, cancelled: true };
      }
      rushImageCache.set(panelId, { url, image });
    } catch (error) {
      console.error(error);
      return { ok: false, panelId, cutNumber };
    }
  }

  for (const panelId of panelIds) {
    if (!rushImageCache.has(panelId)) {
      return {
        ok: false,
        panelId,
        cutNumber: cutNumberForPanel(snapshot, panelId),
      };
    }
  }
  return { ok: true };
}

async function handleRushPlay() {
  if (!appActive || !session || rushPreparing || rushPlayer.isPlaying() || exportRunning) {
    return;
  }
  if (
    rushPlayer.hasSnapshot() &&
    !rushPlayer.isDirty() &&
    rushPlayer.hasEnded()
  ) {
    return;
  }
  if (
    rushPlayer.hasSnapshot() &&
    !rushPlayer.isDirty() &&
    !rushPlayer.hasEnded()
  ) {
    rushError = "";
    rushPlayer.resume();
    renderRush();
    return;
  }

  const token = ++rushPrepToken;
  rushPreparing = true;
  rushError = "";
  renderRush();

  const cuts = cutStore.listAll();
  if (cuts.length === 0) {
    if (token !== rushPrepToken) {
      return;
    }
    rushPreparing = false;
    rushError = "Cutがありません。";
    renderRush();
    return;
  }
  const incomplete = [];
  for (const cut of cuts) {
    if (timelineStore.isComplete(cut)) {
      continue;
    }
    const timeline = timelineStore.getByCutId(cut.id);
    incomplete.push({
      cutNumber: cut.cutNumber,
      reason: describeIncomplete(cut, timeline) ?? "Timelineが未完成です。",
    });
  }
  if (incomplete.length > 0) {
    if (token !== rushPrepToken) {
      return;
    }
    rushPreparing = false;
    rushError = formatRushIssues(incomplete);
    renderRush();
    return;
  }

  const snapshot = buildSnapshot(cuts, (cutId) => timelineStore.getByCutId(cutId));
  const prepared = await prepareRushImages(snapshot, token);
  if (token !== rushPrepToken) {
    return;
  }
  rushPreparing = false;
  if (!prepared.ok) {
    rushError = prepared.cutNumber
      ? `CUT ${prepared.cutNumber}: Panel ${prepared.panelId} の画像を準備できませんでした。`
      : `Panel ${prepared.panelId} の画像を準備できませんでした。`;
    renderRush();
    return;
  }

  rushMotionFreeze = motionStore.listAll();
  rushPlayer.replaceSnapshot(snapshot);
  rushPlayer.resume();
  renderRush();
}

function handleRushPause() {
  if (rushPreparing) {
    return;
  }
  rushPlayer.pause();
  renderRush();
}

function handleRushReset() {
  if (rushPreparing) {
    rushPrepToken += 1;
    rushPreparing = false;
  }
  rushError = "";
  rushPlayer.reset();
  if (!rushPlayer.hasSnapshot()) {
    rushView = null;
  }
  renderRush();
}

function discardRush() {
  rushPrepToken += 1;
  rushPreparing = false;
  rushError = "";
  rushView = null;
  rushMotionFreeze = null;
  rushPlayer.discard();
  rushImageCache.clear();
  renderRush();
}

function stopRushKeepData() {
  rushPrepToken += 1;
  rushPreparing = false;
  rushPlayer.pause();
  renderRush();
}

function cachedPanelPreview(panelId) {
  return thumbnailCache.get(panelId) ?? rushImageCache.get(panelId);
}

function panelLabel(panelId) {
  return panelShortLabel(panelStore.getById(panelId), panelId);
}

function cutPanelNumber(cut, panelId) {
  return panelNumberMap(cut?.panelIds).get(panelId) ?? 0;
}

function formatPanelNumberMark(number) {
  const value = Number(number);
  if (!Number.isInteger(value) || value < 1) {
    return "";
  }
  if (value <= 20) {
    return String.fromCodePoint(0x2460 + value - 1);
  }
  return String(value);
}

function panelDisplayLabel(cut, panelId) {
  const mark = formatPanelNumberMark(cutPanelNumber(cut, panelId));
  const kind = panelSourceLabel(panelStore.getById(panelId));
  if (mark && kind) {
    return `${mark} ${kind}`;
  }
  return mark || kind;
}

function formatStartDisplay(frame) {
  return formatFrameTimeLabel(frame);
}

function formatPlacementRange(range) {
  return range ? `区間 ${formatRange(range)}` : "区間 —";
}

function formatRange(range) {
  return formatFrameRange(range.startFrame, range.lastFrame);
}

function frameHintText(raw) {
  const parsed = parseStartFrameInput(raw);
  if (!parsed.ok || parsed.startFrame < 0) {
    return "";
  }
  return `= ${formatFrameTime(parsed.startFrame)}`;
}

function syncStartFrameDisplay(placementId, raw) {
  const input = timelineRowsEl.querySelector(
    `[data-timeline-placement="${CSS.escape(placementId)}"]`,
  );
  if (!input) {
    return;
  }
  input.value = raw;
  const row = input.closest(".timeline-row");
  const hint = row?.querySelector("[data-role='frame-hint']");
  if (hint) {
    hint.textContent = frameHintText(raw);
  }
  const startLabel = row?.querySelector("[data-role='start-label']");
  if (startLabel) {
    const parsed = parseStartFrameInput(raw);
    startLabel.textContent =
      parsed.ok && parsed.startFrame >= 0
        ? formatStartDisplay(parsed.startFrame)
        : "";
  }
}

function previewStartFrameInput(placementId, frame) {
  syncStartFrameDisplay(placementId, String(frame));
}

function restoreStartFrameInput(placementId, frame) {
  timelineDrafts.set(placementId, String(frame));
  previewStartFrameInput(placementId, frame);
}

function isMemberInSelectedCut(panelId) {
  const cut = selectedCutId ? cutStore.getById(selectedCutId) : null;
  return Boolean(cut && panelId && cut.panelIds.includes(panelId));
}

function refreshTimelineUi() {
  markRushDirty();
  renderTimelineViews();
  renderCutList();
  renderCutDetail();
}

function syncTimelineSelectionUi() {
  timelineRowsEl.querySelectorAll(".timeline-row").forEach((row) => {
    if (row.dataset.role === "placement") {
      row.classList.toggle(
        "is-selected",
        Boolean(selectedPlacementId) &&
          row.dataset.placementId === selectedPlacementId,
      );
      return;
    }
    row.classList.toggle(
      "is-selected",
      Boolean(selectedTimelinePanelId) &&
        row.dataset.panelId === selectedTimelinePanelId,
    );
  });
  cutTimelineStripEl.querySelectorAll(".cut-timeline-marker").forEach((element) => {
    element.classList.toggle(
      "is-selected",
      Boolean(selectedPlacementId) &&
        element.dataset.placementId === selectedPlacementId,
    );
  });
  cutTimelineStripEl.querySelector("[data-role='track']")?.classList.toggle(
    "is-placing",
    isMemberInSelectedCut(selectedTimelinePanelId),
  );
}

function selectTimelinePanel(panelId) {
  selectedTimelinePanelId = panelId ?? null;
  selectedPlacementId = null;
  syncTimelineSelectionUi();
  renderMotionEditor();
}

function selectTimelinePlacement({ placementId = null, panelId = null } = {}) {
  selectedPlacementId = placementId ?? null;
  if (panelId) {
    selectedTimelinePanelId = panelId;
  } else if (placementId && selectedCutId) {
    const found = timelineStore.getPlacementById(selectedCutId, placementId);
    selectedTimelinePanelId = found?.panelId ?? selectedTimelinePanelId;
  }
  syncTimelineSelectionUi();
  renderMotionEditor();
}

function previewMemberPlace(frame) {
  if (!isMemberInSelectedCut(selectedTimelinePanelId)) {
    return;
  }
  cutTimelineEditor.setPlacePreview(frame);
}

function addPlacementWithHistory(cut, { id, panelId, startFrame }, label = "placementを追加") {
  const result = timelineStore.addPlacement(
    cut.id,
    { id, panelId, startFrame },
    cut,
  );
  if (!result.ok) {
    setTimelineMessage(result.message);
    return null;
  }
  const placement = result.placement;
  timelineDrafts.set(placement.id, String(placement.startFrame));
  timelineAddDrafts.set(panelId, String(placement.startFrame));
  selectTimelinePlacement({
    placementId: placement.id,
    panelId: placement.panelId,
  });
  setTimelineMessage("");
  refreshTimelineUi();
  history.push({
    label,
    undo() {
      timelineStore.removePlacement(cut.id, placement.id);
      timelineDrafts.delete(placement.id);
      if (selectedPlacementId === placement.id) {
        selectedPlacementId = null;
      }
      refreshTimelineUi();
    },
    redo() {
      const restored = timelineStore.addPlacement(
        cut.id,
        {
          id: placement.id,
          panelId: placement.panelId,
          startFrame: placement.startFrame,
        },
        cut,
      );
      if (!restored.ok) {
        setTimelineMessage(restored.message);
        return;
      }
      timelineDrafts.set(placement.id, String(placement.startFrame));
      selectTimelinePlacement({
        placementId: placement.id,
        panelId: placement.panelId,
      });
      setTimelineMessage("");
      refreshTimelineUi();
    },
  });
  updateHistoryButtons();
  return placement;
}

function placeMemberPanelAtFrame(panelId, frame) {
  const cut = selectedCutId ? cutStore.getById(selectedCutId) : null;
  if (!cut || !cut.panelIds.includes(panelId)) {
    return;
  }
  addPlacementWithHistory(cut, { panelId, startFrame: frame });
}

function placeSelectedMemberAtFrame(frame) {
  if (!Number.isInteger(frame)) {
    return;
  }
  if (!isMemberInSelectedCut(selectedTimelinePanelId)) {
    if (!selectedTimelinePanelId) {
      setTimelineMessage("所属Panelを選んでから Timeline 上へ置いてください。");
    }
    return;
  }
  placeMemberPanelAtFrame(selectedTimelinePanelId, frame);
}

function closeInsertMenu({ unlock = true } = {}) {
  insertMenuState = null;
  insertMenuEl.hidden = true;
  insertMenuEl.replaceChildren();
  if (unlock) {
    cutTimelineEditor.unlockInsert();
  }
}

function openInsertMenu(frame) {
  if (!selectedCutId || !Number.isInteger(frame)) {
    return;
  }
  insertMenuState = {
    cutId: selectedCutId,
    startFrame: frame,
    step: "root",
  };
  renderInsertMenu();
}

function positionInsertMenu() {
  const anchor = cutTimelineEditor.getInsertPlusRect();
  const strip = cutTimelineStripEl.getBoundingClientRect();
  if (!anchor) {
    return;
  }
  const left = anchor.left + anchor.width / 2 - strip.left;
  const top = anchor.bottom - strip.top + 4;
  insertMenuEl.style.left = `${Math.max(8, left)}px`;
  insertMenuEl.style.top = `${Math.max(0, top)}px`;
}

function renderInsertMenu() {
  if (!insertMenuState) {
    insertMenuEl.hidden = true;
    insertMenuEl.replaceChildren();
    return;
  }
  const cut = cutStore.getById(insertMenuState.cutId);
  if (!cut) {
    closeInsertMenu();
    return;
  }
  insertMenuEl.hidden = false;
  insertMenuEl.replaceChildren();
  const frameLabel = document.createElement("p");
  frameLabel.className = "cut-timeline-insert-frame";
  frameLabel.textContent = `追加位置 ${formatFrameTimeLabel(insertMenuState.startFrame)}`;
  insertMenuEl.append(frameLabel);

  if (insertMenuState.step === "pick") {
    const list = document.createElement("ul");
    list.className = "cut-timeline-insert-panels";
    if (cut.panelIds.length === 0) {
      const empty = document.createElement("li");
      empty.className = "cut-timeline-insert-empty";
      empty.textContent = "所属Panelがありません";
      list.append(empty);
    } else {
      for (const panelId of cut.panelIds) {
        list.append(createInsertPanelPickEl(cut, panelId));
      }
    }
    insertMenuEl.append(list);
    positionInsertMenu();
    return;
  }

  const existingButton = document.createElement("button");
  existingButton.type = "button";
  existingButton.textContent = "既存Panelを追加";
  existingButton.addEventListener("click", () => {
    insertMenuState.step = "pick";
    renderInsertMenu();
  });
  const drawingButton = document.createElement("button");
  drawingButton.type = "button";
  drawingButton.textContent = "手描きPanelを追加";
  drawingButton.addEventListener("click", () => {
    handleInsertDrawing(insertMenuState.cutId, insertMenuState.startFrame);
  });
  insertMenuEl.append(existingButton, drawingButton);
  positionInsertMenu();
}

function createInsertPanelPickEl(cut, panelId) {
  const item = document.createElement("li");
  const button = document.createElement("button");
  button.type = "button";
  button.className = "cut-timeline-insert-panel";
  const numberEl = document.createElement("span");
  numberEl.className = "cut-timeline-insert-number";
  numberEl.textContent = formatPanelNumberMark(cutPanelNumber(cut, panelId));
  const label = document.createElement("span");
  label.className = "cut-timeline-insert-kind";
  label.textContent = panelSourceLabel(panelStore.getById(panelId));
  button.append(createTimelineThumbEl(panelId), numberEl, label);
  button.addEventListener("click", () => {
    addExistingPanelAtInsert(cut.id, panelId, insertMenuState.startFrame);
  });
  item.append(button);
  return item;
}

function addExistingPanelAtInsert(cutId, panelId, startFrame) {
  const cut = cutStore.getById(cutId);
  if (!cut) {
    closeInsertMenu();
    return;
  }
  const added = addPlacementWithHistory(cut, { panelId, startFrame });
  closeInsertMenu();
  if (!added) {
    return;
  }
}

async function handleInsertDrawing(cutId, startFrame) {
  if (!session || document.body.dataset.state !== "viewing" || drawingEditor.isOpen()) {
    return;
  }
  const cut = cutStore.getById(cutId);
  if (!cut) {
    closeInsertMenu();
    return;
  }
  if (insertStartFrameTaken(cutId, startFrame)) {
    setTimelineMessage(`開始フレーム ${startFrame}f は他の配置と同じです。`);
    closeInsertMenu();
    return;
  }
  closeInsertMenu();
  setPanelPlaceMessage("");
  let result;
  try {
    result = await drawingEditor.open({
      mode: "create",
      onion: resolveInsertOnionOption(cutId, startFrame),
      caption: `Timeline ${formatFrameTimeLabel(startFrame)}へ手描きPanelを追加`,
    });
  } catch (error) {
    console.error(error);
    setPanelPlaceMessage(error.message || "手描き画像を開けませんでした。");
    return;
  }
  if (!result?.blob) {
    return;
  }
  commitInsertDrawing(cutId, startFrame, result);
}

function commitInsertDrawing(cutId, startFrame, result) {
  const cut = cutStore.getById(cutId);
  if (!cut) {
    setTimelineMessage("Cutが見つかりません。");
    return;
  }
  const panel = panelStore.addMedia(PANEL_SOURCE_DRAWING);
  panelMediaStore.set(panel.id, {
    kind: "drawing",
    blob: result.blob,
    mimeType: result.mimeType,
    width: result.width,
    height: result.height,
  });
  cutStore.appendPanel(cutId, panel.id);
  const nextCut = cutStore.getById(cutId);
  const added = timelineStore.addPlacement(
    cutId,
    { panelId: panel.id, startFrame },
    nextCut,
  );
  if (!added.ok) {
    cutStore.removePanel(cutId, panel.id);
    removePanelInternal(panel.id);
    setTimelineMessage(added.message);
    refreshTimelineUi();
    updateHistoryButtons();
    return;
  }
  const snapshot = capturePanelSnapshot(panel.id);
  timelineDrafts.set(added.placement.id, String(added.placement.startFrame));
  timelineAddDrafts.set(panel.id, String(added.placement.startFrame));
  requestThumbnail(panel);
  selectTimelinePlacement({
    placementId: added.placement.id,
    panelId: panel.id,
  });
  setTimelineMessage("");
  refreshTimelineUi();
  history.push({
    label: "手描きPanelをTimelineへ追加",
    undo() {
      removePanelInternal(panel.id);
      refreshTimelineUi();
    },
    redo() {
      restorePanelSnapshot(snapshot);
      selectTimelinePlacement({
        placementId: added.placement.id,
        panelId: panel.id,
      });
      refreshTimelineUi();
    },
  });
  updateHistoryButtons();
}

function nudgeSelectedTimelinePanel(delta) {
  const cut = selectedCutId ? cutStore.getById(selectedCutId) : null;
  if (!cut || !selectedPlacementId) {
    return false;
  }
  const placementId = selectedPlacementId;
  const placement = timelineStore.getPlacementById(cut.id, placementId);
  if (!placement) {
    return false;
  }
  const fromFrame = placement.startFrame;
  const nextFrame = fromFrame + delta;
  if (nextFrame === fromFrame) {
    return true;
  }
  const result = timelineStore.updatePlacement(cut.id, placementId, nextFrame, cut);
  if (!result.ok) {
    setTimelineMessage(result.message);
    restoreStartFrameInput(placementId, fromFrame);
    renderTimelineViews();
    return true;
  }
  timelineDrafts.set(placementId, String(nextFrame));
  setTimelineMessage("");
  refreshTimelineUi();
  history.push({
    label: "Timelineを変更",
    undo() {
      revertTimelineStartFrame(cut.id, placementId, fromFrame);
    },
    redo() {
      revertTimelineStartFrame(cut.id, placementId, nextFrame);
    },
  });
  updateHistoryButtons();
  return true;
}

function commitCutTimelineDrag({ cutId, placementId, candidateFrame, savedFrame }) {
  if (candidateFrame === savedFrame) {
    restoreStartFrameInput(placementId, savedFrame);
    renderTimelineViews();
    return;
  }
  const cut = cutStore.getById(cutId);
  if (!cut) {
    setTimelineMessage("Cutが見つかりません。");
    restoreStartFrameInput(placementId, savedFrame);
    renderTimelineViews();
    return;
  }
  const result = timelineStore.updatePlacement(
    cutId,
    placementId,
    candidateFrame,
    cut,
  );
  if (!result.ok) {
    setTimelineMessage(result.message);
    restoreStartFrameInput(placementId, savedFrame);
    renderTimelineViews();
    return;
  }
  timelineDrafts.set(placementId, String(candidateFrame));
  setTimelineMessage("");
  refreshTimelineUi();
  history.push({
    label: "Timelineを変更",
    undo() {
      revertTimelineStartFrame(cutId, placementId, savedFrame);
    },
    redo() {
      revertTimelineStartFrame(cutId, placementId, candidateFrame);
    },
  });
  updateHistoryButtons();
}

function revertTimelineStartFrame(cutId, placementId, startFrame) {
  const cut = cutStore.getById(cutId);
  if (!cut) {
    setTimelineMessage("Cutが見つかりません。");
    return;
  }
  const result = timelineStore.updatePlacement(cutId, placementId, startFrame, cut);
  if (!result.ok) {
    setTimelineMessage(result.message);
    restoreStartFrameInput(placementId, startFrame);
    renderTimelineViews();
    return;
  }
  timelineDrafts.set(placementId, String(startFrame));
  setTimelineMessage("");
  refreshTimelineUi();
}

function renderCutTimelineStrip() {
  if (insertMenuState && insertMenuState.cutId !== selectedCutId) {
    closeInsertMenu();
  }
  if (cutTimelineEditor.isBusy()) {
    return;
  }
  const cut = selectedCutId ? cutStore.getById(selectedCutId) : null;
  if (!cut) {
    cutTimelineEditor.render(null);
    return;
  }
  const timeline = timelineStore.getByCutId(cut.id);
  const complete = timelineStore.isComplete(cut);
  const ranges = timelineStore.rangesFor(cut);
  cutTimelineEditor.render({
    cutId: cut.id,
    durationFrames: cut.durationFrames,
    complete,
    metaText: `CUT ${cut.cutNumber} / ${formatDurationLabel(cut.durationFrames)}`,
    statusText: complete ? "配置完了" : "未完成",
    endLabel: formatDurationLabel(cut.durationFrames),
    markers: (timeline?.placements ?? []).map((placement) => {
      const cached = thumbnailCache.get(placement.panelId);
      return {
        placementId: placement.id,
        panelId: placement.panelId,
        startFrame: placement.startFrame,
        label: formatPanelNumberMark(cutPanelNumber(cut, placement.panelId)),
        thumbUrl: cached?.url ?? "",
      };
    }),
    ranges: ranges.map((range) => ({
      text: `${panelDisplayLabel(cut, range.panelId)} ${formatRange(range)}`,
    })),
    selectedPlacementId,
    placing: isMemberInSelectedCut(selectedTimelinePanelId),
  });
}

function motionRangesFor(cut, panelId) {
  if (!cut || !panelId) {
    return [];
  }
  return timelineStore.rangesFor(cut).filter((item) => item.panelId === panelId);
}

function motionRangeFor(cut, panelId) {
  const ranges = motionRangesFor(cut, panelId);
  if (selectedPlacementId) {
    const selected = ranges.find((item) => item.id === selectedPlacementId);
    if (selected) {
      return selected;
    }
  }
  return (
    ranges.find((item) => canSampleMotion(item.startFrame, item.lastFrame)) ??
    ranges[0] ??
    null
  );
}

function commitMotionChange({
  cutId,
  panelId,
  from,
  to,
  preFixFrames,
  postFixFrames,
}) {
  const cut = cutStore.getById(cutId);
  const ranges = motionRangesFor(cut, panelId);
  if (
    ranges.length > 0 &&
    ranges.every((item) => !canSampleMotion(item.startFrame, item.lastFrame))
  ) {
    return;
  }
  const previous = motionStore.get(cutId, panelId);
  const nextFixes = fixFramesOf({
    preFixFrames: preFixFrames ?? previous?.preFixFrames,
    postFixFrames: postFixFrames ?? previous?.postFixFrames,
  });
  const next = {
    panelId,
    from: from ?? previous?.from,
    to: to ?? previous?.to,
    preFixFrames: nextFixes.preFixFrames,
    postFixFrames: nextFixes.postFixFrames,
  };
  if (!next.from || !next.to) {
    return;
  }
  if (previous && motionsEqual(previous, next)) {
    motionFixMessage = "";
    return;
  }
  const windowCheck = validateMotionWindowForRanges(ranges, next);
  if (!windowCheck.ok) {
    motionFixMessage = windowCheck.message;
    motionFixPanelId = panelId;
    renderMotionEditor();
    return;
  }
  const result = motionStore.upsert(cutId, next);
  if (!result.ok) {
    motionFixMessage = result.message;
    motionFixPanelId = panelId;
    renderMotionEditor();
    return;
  }
  motionFixMessage = "";
  motionFixPanelId = null;
  const existed = Boolean(previous);
  history.push({
    label: existed ? "Motionを変更" : "Motionを作成",
    undo() {
      if (existed) {
        motionStore.upsert(cutId, previous);
      } else {
        motionStore.remove(cutId, panelId);
      }
      markRushDirty();
      renderMotionEditor();
    },
    redo() {
      motionStore.upsert(cutId, next);
      markRushDirty();
      renderMotionEditor();
    },
  });
  markRushDirty();
  updateHistoryButtons();
  renderMotionEditor();
}

function deleteMotion({ cutId, panelId }) {
  const previous = motionStore.get(cutId, panelId);
  if (!previous) {
    return;
  }
  motionStore.remove(cutId, panelId);
  history.push({
    label: "Motionを削除",
    undo() {
      motionStore.upsert(cutId, previous);
      markRushDirty();
      renderMotionEditor();
    },
    redo() {
      motionStore.remove(cutId, panelId);
      markRushDirty();
      renderMotionEditor();
    },
  });
  markRushDirty();
  updateHistoryButtons();
  renderMotionEditor();
}

function renderMotionEditor() {
  if (motionEditor.isBusy()) {
    return;
  }
  const cut = selectedCutId ? cutStore.getById(selectedCutId) : null;
  if (!cut) {
    motionEditor.render(null);
    return;
  }
  const panelId =
    selectedTimelinePanelId && cut.panelIds.includes(selectedTimelinePanelId)
      ? selectedTimelinePanelId
      : (cut.panelIds[0] ?? null);
  if (motionFixPanelId && motionFixPanelId !== panelId) {
    motionFixMessage = "";
    motionFixPanelId = null;
  }
  const ranges = motionRangesFor(cut, panelId);
  const range = motionRangeFor(cut, panelId);
  const motion = panelId ? motionStore.get(cut.id, panelId) : null;
  const allOneFrame =
    ranges.length > 0 &&
    ranges.every((item) => !canSampleMotion(item.startFrame, item.lastFrame));
  const rows = cut.panelIds.map((id) => {
    const item = motionStore.get(cut.id, id);
    const itemRanges = motionRangesFor(cut, id);
    const itemAllOneFrame =
      itemRanges.length > 0 &&
      itemRanges.every((entry) => !canSampleMotion(entry.startFrame, entry.lastFrame));
    let kind = "Motionなし";
    if (item && itemAllOneFrame) {
      kind = "適用不能";
    } else if (item) {
      kind = motionLabel(item.from, item.to);
    }
    return {
      panelId: id,
      label: panelLabel(id),
      kind,
    };
  });

  let statusText = "";
  let hintText = "";
  let blocked = false;
  let editable = Boolean(panelId);
  if (!panelId) {
    statusText = "所属Panelがありません";
    editable = false;
  } else if (allOneFrame) {
    blocked = true;
    editable = false;
    statusText = motion
      ? "表示区間が1フレームのためMotionを適用できません"
      : "表示区間が1フレームのためMotionを設定できません";
  } else if (!range) {
    hintText = "未使用です。配置後の各表示区間にMotionがかかります";
  } else if (motion) {
    const window = deriveMotionWindow(range.startFrame, range.lastFrame, motion);
    if (window.preFixFrames > 0 || window.postFixFrames > 0) {
      const parts = [];
      if (window.preFixFrames > 0) {
        parts.push(
          `FIX ${formatFrameRange(range.startFrame, window.motionStart - 1)}`,
        );
      }
      parts.push(
        `${motionLabel(motion.from, motion.to)} ${formatFrameRange(window.motionStart, window.motionLast)}`,
      );
      if (window.postFixFrames > 0) {
        parts.push(
          `FIX ${formatFrameRange(window.motionLast + 1, range.lastFrame)}`,
        );
      }
      hintText = parts.join(" → ");
    } else {
      hintText = `${motionLabel(motion.from, motion.to)} / ${formatRange(range)}`;
    }
  } else {
    hintText = "プリセットから作成し、START / END 枠で調整できます";
  }

  const cached = panelId ? cachedPanelPreview(panelId) : null;

  motionEditor.render({
    cutId: cut.id,
    panelId,
    rows,
    statusText,
    hintText,
    blocked,
    editable,
    hasMotion: Boolean(motion),
    from: motion?.from ?? null,
    to: motion?.to ?? null,
    preFixFrames: fixFramesOf(motion).preFixFrames,
    postFixFrames: fixFramesOf(motion).postFixFrames,
    fixMessage: motionFixMessage,
    imageUrl: cached?.url ?? "",
    imageWidth: cached?.image?.naturalWidth ?? 0,
    imageHeight: cached?.image?.naturalHeight ?? 0,
  });
}

function setTimesheetMessage(message) {
  if (timesheetMessageEl) {
    timesheetMessageEl.textContent = message ?? "";
  }
}

function resetTimesheetMeta() {
  timesheetEpisode = "";
  timesheetTitle = "";
  timesheetPreviewIndex = 0;
  timesheetPreviewOpen = false;
  timesheetExporting = false;
  motionFixMessage = "";
  motionFixPanelId = null;
  if (timesheetEpisodeInput) {
    timesheetEpisodeInput.value = "";
  }
  if (timesheetTitleInput) {
    timesheetTitleInput.value = "";
  }
  if (timesheetPreviewWrapEl) {
    timesheetPreviewWrapEl.hidden = true;
  }
  setTimesheetMessage("");
}

function currentTimesheetModel() {
  const cut = selectedCutId ? cutStore.getById(selectedCutId) : null;
  if (!cut) {
    return { ok: false, message: "Cutを選んでください。" };
  }
  return buildTimesheetModel({
    cut,
    timeline: timelineStore.getByCutId(cut.id),
    motions: motionStore.listByCutId(cut.id),
    episodeNumber: timesheetEpisode,
    title: timesheetTitle,
  });
}

function syncTimesheetInputs() {
  if (timesheetEpisodeInput && timesheetEpisodeInput.value !== timesheetEpisode) {
    timesheetEpisodeInput.value = timesheetEpisode;
  }
  if (timesheetTitleInput && timesheetTitleInput.value !== timesheetTitle) {
    timesheetTitleInput.value = timesheetTitle;
  }
}

function updateTimesheetUi() {
  const hasCut = Boolean(selectedCutId && cutStore.getById(selectedCutId));
  const model = hasCut ? currentTimesheetModel() : { ok: false, message: "Cutを選んでください。" };
  if (timesheetPreviewButton) {
    timesheetPreviewButton.disabled = !hasCut || timesheetExporting;
  }
  if (timesheetExportButton) {
    timesheetExportButton.disabled = !hasCut || timesheetExporting;
  }
  if (timesheetEpisodeInput) {
    timesheetEpisodeInput.disabled = !hasCut;
  }
  if (timesheetTitleInput) {
    timesheetTitleInput.disabled = !hasCut;
  }
  syncTimesheetInputs();
  if (!hasCut) {
    timesheetPreviewOpen = false;
    if (timesheetPreviewWrapEl) {
      timesheetPreviewWrapEl.hidden = true;
    }
    return;
  }
  if (!model.ok) {
    if (timesheetPreviewOpen) {
      setTimesheetMessage(model.message);
      timesheetPreviewOpen = false;
      if (timesheetPreviewWrapEl) {
        timesheetPreviewWrapEl.hidden = true;
      }
    }
    return;
  }
  if (timesheetPreviewOpen) {
    paintCurrentTimesheetPreview(model);
  }
}

function paintCurrentTimesheetPreview(model) {
  if (!model?.ok || !timesheetPreviewCanvasEl) {
    return;
  }
  const maxIndex = Math.max(0, model.sheetTotal - 1);
  timesheetPreviewIndex = Math.min(timesheetPreviewIndex, maxIndex);
  const view = buildSheetView(model, timesheetPreviewIndex);
  paintTimesheetOnto(timesheetPreviewCanvasEl, view, 4);
  if (timesheetSheetInfoEl) {
    timesheetSheetInfoEl.textContent = `sheet ${view.sheetNumber} / ${view.sheetTotal}`;
  }
  if (timesheetPrevSheetButton) {
    timesheetPrevSheetButton.disabled = timesheetPreviewIndex <= 0;
  }
  if (timesheetNextSheetButton) {
    timesheetNextSheetButton.disabled = timesheetPreviewIndex >= maxIndex;
  }
  if (timesheetPreviewWrapEl) {
    timesheetPreviewWrapEl.hidden = false;
  }
}

function handleTimesheetPreview() {
  const model = currentTimesheetModel();
  if (!model.ok) {
    setTimesheetMessage(model.message);
    timesheetPreviewOpen = false;
    if (timesheetPreviewWrapEl) {
      timesheetPreviewWrapEl.hidden = true;
    }
    return;
  }
  setTimesheetMessage("");
  timesheetPreviewOpen = true;
  timesheetPreviewIndex = 0;
  paintCurrentTimesheetPreview(model);
}

function handleTimesheetSheetStep(delta) {
  const model = currentTimesheetModel();
  if (!model.ok || !timesheetPreviewOpen) {
    return;
  }
  timesheetPreviewIndex = Math.min(
    Math.max(0, timesheetPreviewIndex + delta),
    model.sheetTotal - 1,
  );
  paintCurrentTimesheetPreview(model);
}

async function handleTimesheetExport() {
  if (timesheetExporting) {
    return;
  }
  const model = currentTimesheetModel();
  if (!model.ok) {
    setTimesheetMessage(model.message);
    return;
  }
  timesheetExporting = true;
  updateTimesheetUi();
  setTimesheetMessage("PDFを作成しています…");
  try {
    const blob = await buildTimesheetPdf(model);
    const cut = cutStore.getById(selectedCutId);
    downloadBlob(blob, timesheetFileName(session?.fileName, cut?.cutNumber));
    setTimesheetMessage("");
  } catch (error) {
    console.error(error);
    setTimesheetMessage(
      `タイムシートPDFを作れませんでした。${error?.message ?? ""}`.trim(),
    );
  } finally {
    timesheetExporting = false;
    updateTimesheetUi();
  }
}

function renderTimelineViews() {
  renderTimelineEditor();
  renderCutTimelineStrip();
  renderMotionEditor();
  updateTimesheetUi();
}

function maybeInitSinglePanelTimeline(cut) {
  if (!cut || cut.panelIds.length !== 1) {
    return;
  }
  if (timelineStore.getByCutId(cut.id)) {
    return;
  }
  timelineStore.create(cut.id, [
    { panelId: cut.panelIds[0], startFrame: 0 },
  ]);
  markRushDirty();
  scheduleDraftSave();
}

function closeTimelineEditor() {
  timelineCutId = null;
  selectedTimelinePanelId = null;
  selectedPlacementId = null;
  timelineDrafts.clear();
  timelineAddDrafts.clear();
  setTimelineMessage("");
  motionEditor.render(null);
}

function selectCut(cutId, { fillForm = true } = {}) {
  const cut = cutStore.getById(cutId);
  if (!cut) {
    clearCutSelection();
    return;
  }
  selectedCutId = cut.id;
  timelineCutId = cut.id;
  selectedPlacementId = null;
  timelineDrafts.clear();
  timelineAddDrafts.clear();
  maybeInitSinglePanelTimeline(cut);
  setTimelineMessage("");
  if (fillForm) {
    fillDetailForm(cut);
  }
  renderCutList();
  renderCutDetail();
  renderTimelineViews();
}

function fillDetailForm(cut) {
  detailCutNumberInput.value = cut.cutNumber;
  detailCutDurationInput.value = formatDuration(cut.durationFrames);
}

function clearCutSelection() {
  selectedCutId = null;
  closeTimelineEditor();
  detailCutNumberInput.value = "";
  detailCutDurationInput.value = "";
  renderCutList();
  renderCutDetail();
  renderTimelineViews();
}

function createTimelineThumbEl(panelId) {
  const wrap = document.createElement("div");
  wrap.className = "timeline-row-thumb";
  const cached = thumbnailCache.get(panelId);
  if (cached?.url) {
    const image = document.createElement("img");
    image.alt = "Panel のプレビュー";
    image.src = cached.url;
    wrap.append(image);
  }
  return wrap;
}

function renderTimelineEditor() {
  if (cutTimelineEditor.isBusy()) {
    return;
  }
  if (!timelineCutId) {
    timelineMetaEl.replaceChildren();
    timelineStatusEl.textContent = "";
    if (timelineRepeatSequenceEl) {
      timelineRepeatSequenceEl.textContent = "";
    }
    if (timelineUnusedEl) {
      timelineUnusedEl.textContent = "";
    }
    timelineRowsEl.replaceChildren();
    timelineRangesEl.replaceChildren();
    return;
  }

  const cut = cutStore.getById(timelineCutId);
  if (!cut) {
    closeTimelineEditor();
    return;
  }

  const timeline = timelineStore.getByCutId(cut.id);
  const ranges = timelineStore.rangesFor(cut);
  const rangeById = new Map(ranges.map((range) => [range.id, range]));
  const complete = timelineStore.isComplete(cut);
  const placedIds = new Set((timeline?.placements ?? []).map((item) => item.panelId));
  const unused = cut.panelIds
    .filter((panelId) => !placedIds.has(panelId))
    .map((panelId) => panelDisplayLabel(cut, panelId));

  timelineMetaEl.replaceChildren();

  const numberEl = document.createElement("p");
  numberEl.textContent = `CUT ${cut.cutNumber}`;
  const durationEl = document.createElement("p");
  durationEl.textContent = formatDurationLabel(cut.durationFrames);
  timelineMetaEl.append(numberEl, durationEl);

  timelineStatusEl.textContent = complete ? "配置完了" : "未完成";
  timelineStatusEl.classList.toggle("is-complete", complete);
  timelineStatusEl.classList.toggle("is-incomplete", !complete);

  if (timelineRepeatSequenceEl) {
    timelineRepeatSequenceEl.textContent =
      cut.panelIds.length > 0
        ? `列: ${cut.panelIds.map((panelId) => panelDisplayLabel(cut, panelId)).join(" ")}`
        : "列: （所属Panelなし）";
  }
  if (timelineRepeatHoldInput) {
    timelineRepeatHoldInput.value = repeatHoldRaw;
  }
  syncRepeatHoldHint();
  if (timelineUnusedEl) {
    timelineUnusedEl.textContent =
      unused.length > 0 ? `未使用: ${unused.join(", ")}` : "";
  }

  timelineRowsEl.replaceChildren();
  appendTimelineSection("追加するPanel", () => {
    for (const panelId of cut.panelIds) {
      timelineRowsEl.append(createMaterialRowEl(cut, panelId));
    }
  });
  appendTimelineSection("配置済み", () => {
    const placements = timeline?.placements ?? [];
    if (placements.length === 0) {
      const empty = document.createElement("li");
      empty.className = "timeline-range-item";
      empty.textContent = "配置はまだありません";
      timelineRowsEl.append(empty);
      return;
    }
    for (const placement of placements) {
      timelineRowsEl.append(
        createPlacementRowEl(cut, placement, rangeById.get(placement.id) ?? null),
      );
    }
  });

  timelineRangesEl.replaceChildren();
  if (ranges.length === 0) {
    const empty = document.createElement("li");
    empty.className = "timeline-range-item";
    empty.textContent = "配置はまだありません";
    timelineRangesEl.append(empty);
  } else {
    for (const range of ranges) {
      const item = document.createElement("li");
      item.className = "timeline-range-item";
      item.textContent = `${panelDisplayLabel(cut, range.panelId)}  ${formatRange(range)}`;
      timelineRangesEl.append(item);
    }
  }
}

function appendTimelineSection(title, fill) {
  const heading = document.createElement("li");
  heading.className = "timeline-section-label";
  heading.textContent = title;
  timelineRowsEl.append(heading);
  fill();
}

function createMaterialRowEl(cut, panelId) {
  const item = document.createElement("li");
  item.className = "timeline-row";
  item.dataset.role = "material";
  item.dataset.panelId = panelId;
  if (selectedTimelinePanelId === panelId) {
    item.classList.add("is-selected");
  }

  const numberEl = document.createElement("p");
  numberEl.className = "timeline-row-number";
  numberEl.textContent = formatPanelNumberMark(cutPanelNumber(cut, panelId));

  const label = document.createElement("p");
  label.className = "timeline-row-label";
  label.textContent = panelSourceLabel(panelStore.getById(panelId));

  const edit = document.createElement("div");
  edit.className = "timeline-row-edit";

  const field = document.createElement("label");
  field.textContent = "start";
  const input = document.createElement("input");
  input.type = "text";
  input.inputMode = "numeric";
  input.autocomplete = "off";
  input.dataset.timelineAddPanel = panelId;
  input.value = timelineAddDrafts.has(panelId)
    ? timelineAddDrafts.get(panelId)
    : "";
  const unit = document.createElement("span");
  unit.textContent = "f";
  const hint = document.createElement("span");
  hint.className = "timeline-row-hint";
  hint.dataset.role = "frame-hint";
  hint.textContent = frameHintText(input.value);
  input.addEventListener("input", () => {
    timelineAddDrafts.set(panelId, input.value);
    hint.textContent = frameHintText(input.value);
  });
  field.append(input, unit, hint);

  const addButton = document.createElement("button");
  addButton.type = "button";
  addButton.textContent = "追加";
  addButton.addEventListener("click", () => {
    addTimelinePlacement(cut.id, panelId, input.value);
  });
  edit.append(field, addButton);

  item.append(createTimelineThumbEl(panelId), numberEl, label, edit);
  item.addEventListener("click", (event) => {
    if (event.target.closest("button, input")) {
      return;
    }
    selectTimelinePanel(panelId);
  });
  item.addEventListener("pointerdown", (event) => {
    if (event.button !== 0 || event.target.closest("button, input, label")) {
      return;
    }
    event.preventDefault();
    startMemberPlaceDrag(panelId, event);
  });
  return item;
}

function createPlacementRowEl(cut, placement, range) {
  const item = document.createElement("li");
  item.className = "timeline-row";
  item.dataset.role = "placement";
  item.dataset.placementId = placement.id;
  item.dataset.panelId = placement.panelId;
  if (selectedPlacementId === placement.id) {
    item.classList.add("is-selected");
  }

  const numberEl = document.createElement("p");
  numberEl.className = "timeline-row-number";
  numberEl.textContent = formatPanelNumberMark(
    cutPanelNumber(cut, placement.panelId),
  );

  const startLabel = document.createElement("p");
  startLabel.className = "timeline-row-start";
  startLabel.dataset.role = "start-label";
  startLabel.textContent = formatStartDisplay(placement.startFrame);

  const rangeEl = document.createElement("p");
  rangeEl.className = "timeline-row-range";
  rangeEl.textContent = formatPlacementRange(range);

  const edit = document.createElement("div");
  edit.className = "timeline-row-edit";

  const field = document.createElement("label");
  field.textContent = "start";
  const input = document.createElement("input");
  input.type = "text";
  input.inputMode = "numeric";
  input.autocomplete = "off";
  input.dataset.timelinePlacement = placement.id;
  input.value = timelineDrafts.has(placement.id)
    ? timelineDrafts.get(placement.id)
    : String(placement.startFrame);
  const unit = document.createElement("span");
  unit.textContent = "f";
  const hint = document.createElement("span");
  hint.className = "timeline-row-hint";
  hint.dataset.role = "frame-hint";
  hint.textContent = frameHintText(input.value);
  input.addEventListener("input", () => {
    timelineDrafts.set(placement.id, input.value);
    hint.textContent = frameHintText(input.value);
    const parsed = parseStartFrameInput(input.value);
    startLabel.textContent =
      parsed.ok && parsed.startFrame >= 0
        ? formatStartDisplay(parsed.startFrame)
        : "";
  });
  field.append(input, unit, hint);

  const saveButton = document.createElement("button");
  saveButton.type = "button";
  saveButton.textContent = "更新";
  saveButton.addEventListener("click", () => {
    updateTimelinePlacement(cut.id, placement.id, input.value);
  });
  edit.append(field, saveButton);

  const drawingPanel = panelStore.getById(placement.panelId);
  if (drawingPanel?.source === PANEL_SOURCE_DRAWING) {
    const drawEditButton = document.createElement("button");
    drawEditButton.type = "button";
    drawEditButton.textContent = "絵を編集";
    drawEditButton.addEventListener("click", () => {
      handleEditDrawing(placement.panelId, {
        cutId: cut.id,
        placementId: placement.id,
      });
    });
    edit.append(drawEditButton);
  }

  const deleteButton = document.createElement("button");
  deleteButton.type = "button";
  deleteButton.className = "timeline-row-delete";
  deleteButton.textContent = "削除";
  deleteButton.addEventListener("click", () => {
    deleteTimelinePlacement(cut.id, placement.id);
  });
  edit.append(deleteButton);

  item.append(
    createTimelineThumbEl(placement.panelId),
    numberEl,
    startLabel,
    rangeEl,
    edit,
  );
  item.addEventListener("click", (event) => {
    if (event.target.closest("button, input")) {
      return;
    }
    selectTimelinePlacement({
      placementId: placement.id,
      panelId: placement.panelId,
    });
  });
  return item;
}

function startMemberPlaceDrag(panelId, event) {
  selectTimelinePanel(panelId);
  unplacedPlaceDrag = {
    panelId,
    pointerId: event.pointerId,
  };
  window.addEventListener("pointermove", handleUnplacedPlaceDragMove);
  window.addEventListener("pointerup", handleUnplacedPlaceDragUp);
  window.addEventListener("pointercancel", handleUnplacedPlaceDragUp);
}

function handleUnplacedPlaceDragMove(event) {
  if (!unplacedPlaceDrag || event.pointerId !== unplacedPlaceDrag.pointerId) {
    return;
  }
  if (cutTimelineEditor.isPointOnTrack(event.clientX, event.clientY)) {
    cutTimelineEditor.setPlacePreview(
      cutTimelineEditor.frameAtClientX(event.clientX),
    );
    return;
  }
  cutTimelineEditor.setPlacePreview(null);
}

function handleUnplacedPlaceDragUp(event) {
  if (!unplacedPlaceDrag || event.pointerId !== unplacedPlaceDrag.pointerId) {
    return;
  }
  const panelId = unplacedPlaceDrag.panelId;
  unplacedPlaceDrag = null;
  window.removeEventListener("pointermove", handleUnplacedPlaceDragMove);
  window.removeEventListener("pointerup", handleUnplacedPlaceDragUp);
  window.removeEventListener("pointercancel", handleUnplacedPlaceDragUp);
  const onTrack = cutTimelineEditor.isPointOnTrack(event.clientX, event.clientY);
  const frame = cutTimelineEditor.frameAtClientX(event.clientX);
  cutTimelineEditor.setPlacePreview(null);
  if (event.type !== "pointercancel" && onTrack) {
    placeMemberPanelAtFrame(panelId, frame);
  }
}

function addTimelinePlacement(cutId, panelId, rawValue) {
  const cut = cutStore.getById(cutId);
  if (!cut) {
    setTimelineMessage("Cutが見つかりません。");
    return;
  }
  const parsed = parseStartFrameInput(rawValue);
  if (!parsed.ok) {
    setTimelineMessage(parsed.message);
    return;
  }
  addPlacementWithHistory(cut, {
    panelId,
    startFrame: parsed.startFrame,
  });
}

function updateTimelinePlacement(cutId, placementId, rawValue) {
  const cut = cutStore.getById(cutId);
  if (!cut) {
    setTimelineMessage("Cutが見つかりません。");
    return;
  }
  const parsed = parseStartFrameInput(rawValue);
  if (!parsed.ok) {
    setTimelineMessage(parsed.message);
    return;
  }
  const previous = timelineStore.getPlacementById(cutId, placementId);
  if (!previous) {
    setTimelineMessage("この配置がありません。");
    return;
  }
  if (previous.startFrame === parsed.startFrame) {
    timelineDrafts.set(placementId, String(parsed.startFrame));
    setTimelineMessage("");
    return;
  }
  const result = timelineStore.updatePlacement(
    cutId,
    placementId,
    parsed.startFrame,
    cut,
  );
  if (!result.ok) {
    setTimelineMessage(result.message);
    return;
  }
  timelineDrafts.set(placementId, String(parsed.startFrame));
  selectTimelinePlacement({
    placementId,
    panelId: previous.panelId,
  });
  setTimelineMessage("");
  refreshTimelineUi();
  history.push({
    label: "Timelineを変更",
    undo() {
      revertTimelineStartFrame(cutId, placementId, previous.startFrame);
    },
    redo() {
      revertTimelineStartFrame(cutId, placementId, parsed.startFrame);
    },
  });
  updateHistoryButtons();
}

function deleteTimelinePlacement(cutId, placementId) {
  const cut = cutStore.getById(cutId);
  if (!cut) {
    setTimelineMessage("Cutが見つかりません。");
    return;
  }
  const previous = timelineStore.getPlacementById(cutId, placementId);
  if (!previous) {
    return;
  }
  const result = timelineStore.removePlacement(cutId, placementId);
  if (!result.ok) {
    setTimelineMessage(result.message);
    return;
  }
  timelineDrafts.delete(placementId);
  if (selectedPlacementId === placementId) {
    selectedPlacementId = null;
  }
  setTimelineMessage("");
  refreshTimelineUi();
  history.push({
    label: "placementを削除",
    undo() {
      const restored = timelineStore.addPlacement(
        cutId,
        {
          id: previous.id,
          panelId: previous.panelId,
          startFrame: previous.startFrame,
        },
        cut,
      );
      if (!restored.ok) {
        setTimelineMessage(restored.message);
        return;
      }
      timelineDrafts.set(previous.id, String(previous.startFrame));
      selectTimelinePlacement({
        placementId: previous.id,
        panelId: previous.panelId,
      });
      setTimelineMessage("");
      refreshTimelineUi();
    },
    redo() {
      timelineStore.removePlacement(cutId, previous.id);
      timelineDrafts.delete(previous.id);
      if (selectedPlacementId === previous.id) {
        selectedPlacementId = null;
      }
      refreshTimelineUi();
    },
  });
  updateHistoryButtons();
}

function holdHintText(raw) {
  const parsed = parseHoldFrames(raw);
  if (!parsed.ok) {
    return "";
  }
  return `= ${formatFrameTime(parsed.holdFrames)}`;
}

function syncRepeatHoldHint() {
  if (!timelineRepeatHintEl) {
    return;
  }
  timelineRepeatHintEl.textContent = holdHintText(repeatHoldRaw);
}

function applyRepeat() {
  const cut = selectedCutId ? cutStore.getById(selectedCutId) : null;
  if (!cut) {
    setTimelineMessage("Cutが見つかりません。");
    return;
  }
  const parsed = parseHoldFrames(repeatHoldRaw);
  if (!parsed.ok) {
    setTimelineMessage(parsed.message);
    return;
  }
  const expanded = expandRepeat(
    cut.panelIds,
    parsed.holdFrames,
    cut.durationFrames,
  );
  if (!expanded.ok) {
    setTimelineMessage(expanded.message);
    return;
  }
  const before = clonePlacementList(
    timelineStore.getByCutId(cut.id)?.placements ?? [],
  );
  if (before.length > 0) {
    const confirmed = window.confirm(
      "現在の Timeline を置き換えます。Undo で戻せます。",
    );
    if (!confirmed) {
      return;
    }
  }
  const result = timelineStore.replacePlacements(cut.id, expanded.placements, cut);
  if (!result.ok) {
    setTimelineMessage(result.message);
    return;
  }
  const after = clonePlacementList(result.timeline.placements);
  timelineDrafts.clear();
  selectedPlacementId = after[0]?.id ?? null;
  if (after[0]) {
    selectedTimelinePanelId = after[0].panelId;
  }
  setTimelineMessage("");
  refreshTimelineUi();
  history.push({
    label: "Repeat",
    undo() {
      const restored = timelineStore.restorePlacements(cut.id, before, cut);
      if (!restored.ok) {
        setTimelineMessage(restored.message);
        return;
      }
      timelineDrafts.clear();
      selectedPlacementId = before[0]?.id ?? null;
      refreshTimelineUi();
    },
    redo() {
      const restored = timelineStore.restorePlacements(cut.id, after, cut);
      if (!restored.ok) {
        setTimelineMessage(restored.message);
        return;
      }
      timelineDrafts.clear();
      selectedPlacementId = after[0]?.id ?? null;
      refreshTimelineUi();
    },
  });
  updateHistoryButtons();
}

function resetCutForm() {
  cutNumberInput.value = "";
  cutDurationInput.value = "";
}

function thumbnailStatus(panelId) {
  if (thumbnailCache.has(panelId)) {
    return "ready";
  }
  if (failedThumbnailIds.has(panelId)) {
    return "error";
  }
  if (inFlightThumbnailIds.has(panelId)) {
    return "generating";
  }
  return "queued";
}

function createThumbnailEl(panel) {
  const wrap = document.createElement("div");
  wrap.className = "panel-thumb";
  const cached = thumbnailCache.get(panel.id);

  if (cached?.url) {
    const image = document.createElement("img");
    image.alt = `${panelSourceLabel(panel)} の Panel プレビュー`;
    image.src = cached.url;
    wrap.append(image);
    return wrap;
  }

  const status = document.createElement("p");
  status.className = "panel-thumb-status";
  const kind = thumbnailStatus(panel.id);
  if (kind === "error") {
    status.classList.add("is-error");
    status.textContent = "画像を作れませんでした";
  } else if (kind === "generating") {
    status.textContent = "生成中…";
  } else {
    status.textContent = "生成待ち";
  }
  wrap.append(status);
  return wrap;
}

function selectedPanelIdsInListOrder() {
  return panelStore
    .listAll()
    .filter((panel) => selectedPanelIds.has(panel.id))
    .map((panel) => panel.id);
}

function renderPanelList() {
  const currentPage = session?.currentPage ?? null;
  const panels = panelStore.listAll();
  const pageCount =
    currentPage === null ? 0 : panelStore.countByPage(currentPage);

  panelCountsEl.textContent = `全${panelStore.count()}件 / このページ${pageCount}件`;
  panelListEl.replaceChildren();

  for (const panel of panels) {
    const item = document.createElement("li");
    item.className = "panel-item";
    if (isPdfPanel(panel) && panel.pageNumber === currentPage) {
      item.classList.add("is-current-page");
    }

    const select = document.createElement("input");
    select.type = "checkbox";
    select.className = "panel-select";
    select.checked = selectedPanelIds.has(panel.id);
    select.title = "Cutへ所属させる";
    select.addEventListener("change", () => {
      if (select.checked) {
        selectedPanelIds.add(panel.id);
      } else {
        selectedPanelIds.delete(panel.id);
      }
    });

    const idEl = document.createElement("span");
    idEl.className = "panel-id";
    idEl.textContent = panel.id;
    idEl.title = panel.id;

    const pageEl = document.createElement("span");
    pageEl.className = "panel-page";
    pageEl.textContent = panelSourceLabel(panel);

    const actions = document.createElement("div");
    actions.className = "panel-item-actions";

    if (panel.source === PANEL_SOURCE_DRAWING) {
      const editButton = document.createElement("button");
      editButton.type = "button";
      editButton.textContent = "編集";
      editButton.addEventListener("click", () => {
        handleEditDrawing(panel.id);
      });
      actions.append(editButton);
    }
    if (panel.source === PANEL_SOURCE_UPLOAD) {
      const replaceButton = document.createElement("button");
      replaceButton.type = "button";
      replaceButton.textContent = "差し替え";
      replaceButton.addEventListener("click", () => {
        handleReplaceUpload(panel.id);
      });
      actions.append(replaceButton);
    }

    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.textContent = "削除";
    deleteButton.addEventListener("click", () => {
      deletePanel(panel.id);
    });
    actions.append(deleteButton);

    item.append(select, pageEl, actions, idEl, createThumbnailEl(panel));
    panelListEl.append(item);
  }
}

function createCutMemberEl(cutId, panelId) {
  const item = document.createElement("li");
  item.className = "cut-member";

  const panel = panelStore.getById(panelId);
  const cached = thumbnailCache.get(panelId);
  if (cached?.url) {
    const image = document.createElement("img");
    image.alt = "所属 Panel のプレビュー";
    image.src = cached.url;
    item.append(image);
  }

  const idEl = document.createElement("span");
  idEl.className = "cut-member-id";
  idEl.textContent = panelShortLabel(panel, panelId);
  idEl.title = panelId;
  item.append(idEl);

  const removeButton = document.createElement("button");
  removeButton.type = "button";
  removeButton.textContent = "外す";
  removeButton.addEventListener("click", () => {
    cutStore.removePanel(cutId, panelId);
    timelineStore.removePlacementsByPanelId(cutId, panelId);
    motionStore.remove(cutId, panelId);
    if (selectedTimelinePanelId === panelId) {
      selectedTimelinePanelId = null;
    }
    if (
      selectedPlacementId &&
      !timelineStore.getPlacementById(cutId, selectedPlacementId)
    ) {
      selectedPlacementId = null;
    }
    markRushDirty();
    setCutMessage("");
    renderCutList();
    renderCutDetail();
    renderTimelineViews();
    scheduleDraftSave();
  });
  item.append(removeButton);

  return item;
}

function renderCutList() {
  const cuts = orderCutsForPlayback(cutStore.listAll());
  cutListEl.replaceChildren();

  for (const cut of cuts) {
    const complete = timelineStore.isComplete(cut);
    const item = document.createElement("li");
    item.className = "cut-row";
    item.tabIndex = 0;
    if (cut.id === selectedCutId) {
      item.classList.add("is-selected");
    }

    const numberEl = document.createElement("span");
    numberEl.className = "cut-row-number";
    numberEl.textContent = cut.cutNumber;
    numberEl.title = cut.cutNumber;

    const durationEl = document.createElement("span");
    durationEl.className = "cut-row-duration";
    durationEl.textContent = formatDuration(cut.durationFrames);

    const framesEl = document.createElement("span");
    framesEl.className = "cut-row-frames";
    framesEl.textContent = `${cut.durationFrames}f`;

    const countEl = document.createElement("span");
    countEl.className = "cut-row-count";
    countEl.textContent = `P${cut.panelIds.length}`;

    const completeEl = document.createElement("span");
    completeEl.className = "cut-row-complete";
    completeEl.classList.toggle("is-complete", complete);
    completeEl.classList.toggle("is-incomplete", !complete);
    completeEl.textContent = complete ? "✓" : "!";
    completeEl.title = complete ? "Timeline 完成" : "Timeline 未完成";

    item.append(numberEl, durationEl, framesEl, countEl, completeEl);
    item.addEventListener("click", () => {
      selectCut(cut.id);
    });
    item.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        selectCut(cut.id);
      }
    });
    cutListEl.append(item);
  }
}

function renderCutDetail() {
  const cut = selectedCutId ? cutStore.getById(selectedCutId) : null;
  if (!cut) {
    if (selectedCutId) {
      selectedCutId = null;
      closeTimelineEditor();
    }
    cutDetailEmptyEl.hidden = false;
    cutDetailBodyEl.hidden = true;
    cutDetailTitleEl.textContent = "Cut編集";
    cutMembersEl.replaceChildren();
    renderCutTimelineStrip();
    return;
  }

  cutDetailEmptyEl.hidden = true;
  cutDetailBodyEl.hidden = false;
  cutDetailTitleEl.textContent = `CUT ${cut.cutNumber} を編集中`;
  cutMembersEl.replaceChildren();
  for (const panelId of cut.panelIds) {
    cutMembersEl.append(createCutMemberEl(cut.id, panelId));
  }
}

function deleteSelectedCut() {
  if (!selectedCutId) {
    return;
  }
  const cutId = selectedCutId;
  cutStore.remove(cutId);
  timelineStore.removeByCutId(cutId);
  motionStore.removeByCutId(cutId);
  markRushDirty();
  setCutMessage("");
  clearCutSelection();
  scheduleDraftSave();
}

function saveSelectedCut(event) {
  event.preventDefault();
  if (!selectedCutId) {
    return;
  }
  const cutNumber = normalizeCutNumber(detailCutNumberInput.value);
  if (!cutNumber) {
    setCutMessage("CUT番号を入力してください。");
    return;
  }
  const duration = parseDurationInput(detailCutDurationInput.value);
  if (!duration.ok) {
    setCutMessage(duration.message);
    return;
  }
  if (cutStore.hasCutNumber(cutNumber, selectedCutId)) {
    setCutMessage("同じCUT番号がすでにあります。");
    return;
  }
  const blocking = timelineStore.placementsBlockingDuration(
    selectedCutId,
    duration.durationFrames,
  );
  if (blocking.length > 0) {
    const frames = blocking.map((item) => `${item.startFrame}f`).join("、");
    setCutMessage(
      `${frames} の配置があるため ${duration.durationFrames}f にできません。`,
    );
    return;
  }
  cutStore.update(selectedCutId, {
    cutNumber,
    durationFrames: duration.durationFrames,
  });
  markRushDirty();
  setCutMessage("");
  const cut = cutStore.getById(selectedCutId);
  if (cut) {
    fillDetailForm(cut);
  }
  renderCutList();
  renderCutDetail();
  renderTimelineViews();
  scheduleDraftSave();
}

function addSelectedPanelsToCut(cutId) {
  const selectedIds = selectedPanelIdsInListOrder();
  if (selectedIds.length === 0) {
    setCutMessage("追加するPanelを選択してください。");
    return;
  }

  const cut = cutStore.getById(cutId);
  if (!cut) {
    setCutMessage("Cutが見つかりません。");
    return;
  }

  const alreadyInCut = [];
  const ownedByOther = [];
  const toAdd = [];

  for (const panelId of selectedIds) {
    if (cut.panelIds.includes(panelId)) {
      alreadyInCut.push(panelId);
      continue;
    }
    const ownerId = cutStore.findCutIdByPanelId(panelId);
    if (ownerId && ownerId !== cutId) {
      const owner = cutStore.getById(ownerId);
      ownedByOther.push(owner?.cutNumber ?? ownerId);
      continue;
    }
    toAdd.push(panelId);
  }

  if (ownedByOther.length > 0) {
    setCutMessage(
      `別のCutに所属しているPanelがあります（${[...new Set(ownedByOther)].join("、")}）。`,
    );
    return;
  }
  if (toAdd.length === 0) {
    setCutMessage("追加できる新しいPanelがありません。");
    return;
  }

  for (const panelId of toAdd) {
    cutStore.appendPanel(cutId, panelId);
  }
  markRushDirty();
  selectedPanelIds.clear();
  setCutMessage("");
  renderPanelList();
  renderCutList();
  renderCutDetail();
  renderTimelineViews();
  scheduleDraftSave();
}

function handleCutFormSubmit(event) {
  event.preventDefault();
  const cutNumber = normalizeCutNumber(cutNumberInput.value);
  if (!cutNumber) {
    setCutMessage("CUT番号を入力してください。");
    return;
  }

  const duration = parseDurationInput(cutDurationInput.value);
  if (!duration.ok) {
    setCutMessage(duration.message);
    return;
  }

  if (cutStore.hasCutNumber(cutNumber)) {
    setCutMessage("同じCUT番号がすでにあります。");
    return;
  }

  const panelIds = selectedPanelIdsInListOrder();
  if (panelIds.length === 0) {
    setCutMessage("所属させるPanelを1件以上選択してください。");
    return;
  }

  const owned = [];
  for (const panelId of panelIds) {
    const ownerId = cutStore.findCutIdByPanelId(panelId);
    if (ownerId) {
      const owner = cutStore.getById(ownerId);
      owned.push(owner?.cutNumber ?? ownerId);
    }
  }
  if (owned.length > 0) {
    setCutMessage(
      `別のCutに所属しているPanelがあります（${[...new Set(owned)].join("、")}）。`,
    );
    return;
  }

  const created = cutStore.add({
    cutNumber,
    durationFrames: duration.durationFrames,
    panelIds,
  });
  const even = evenPlacements(created.durationFrames, created.panelIds);
  if (even.ok) {
    timelineStore.create(created.id, even.placements);
  }
  markRushDirty();
  selectedPanelIds.clear();
  resetCutForm();
  setCutMessage("");
  renderPanelList();
  selectCut(created.id);
  scheduleDraftSave();
  if (!even.ok) {
    setTimelineMessage(even.message);
  }
}

function cancelQueuedThumbnail(panelId) {
  const index = queuedThumbnails.findIndex((job) => job.panel.id === panelId);
  if (index !== -1) {
    queuedThumbnails.splice(index, 1);
  }
  queuedThumbnailIds.delete(panelId);
}

function requestThumbnail(panel) {
  if (!panel) {
    return;
  }
  if (isPdfPanel(panel) && !session?.document) {
    return;
  }
  if (thumbnailCache.has(panel.id)) {
    return;
  }
  if (queuedThumbnailIds.has(panel.id) || inFlightThumbnailIds.has(panel.id)) {
    return;
  }
  queuedThumbnails.push({
    panel,
    pdfDocument: session.document,
    generation: thumbnailToken,
  });
  queuedThumbnailIds.add(panel.id);
  drainThumbnailQueue();
}

async function drainThumbnailQueue() {
  if (drainingThumbnails) {
    return;
  }
  drainingThumbnails = true;

  while (queuedThumbnails.length > 0) {
    const job = queuedThumbnails.shift();
    queuedThumbnailIds.delete(job.panel.id);

    if (job.generation !== thumbnailToken) {
      continue;
    }
    if (!panelExists(job.panel.id) || thumbnailCache.has(job.panel.id)) {
      continue;
    }

    inFlightThumbnailIds.add(job.panel.id);
    renderPanelList();

    try {
      const rendered = await enqueuePanelCrop(() =>
        panelImageProvider.getRenderable(job.panel, {
          purpose: "thumbnail",
          scale: PREVIEW_SCALE,
          pdfDocument: job.pdfDocument,
        }),
      );
      if (job.generation !== thumbnailToken || !panelExists(job.panel.id)) {
        continue;
      }
      const url = await renderableToObjectUrl(rendered);
      if (job.generation !== thumbnailToken || !panelExists(job.panel.id)) {
        URL.revokeObjectURL(url);
        continue;
      }
      thumbnailCache.set(job.panel.id, { url });
      failedThumbnailIds.delete(job.panel.id);
    } catch (error) {
      console.error(error);
      if (job.generation === thumbnailToken && panelExists(job.panel.id)) {
        failedThumbnailIds.add(job.panel.id);
      }
    } finally {
      inFlightThumbnailIds.delete(job.panel.id);
      if (job.generation === thumbnailToken) {
        renderPanelList();
        renderCutList();
        renderCutDetail();
        renderTimelineViews();
      }
    }
  }

  drainingThumbnails = false;
}

function deletePanel(panelId) {
  const snapshot = capturePanelSnapshot(panelId);
  if (!snapshot) {
    return;
  }
  removePanelInternal(panelId);
  history.push({
    label: "Panelを削除",
    undo() {
      restorePanelSnapshot(snapshot);
    },
    redo() {
      removePanelInternal(panelId);
    },
  });
  updateHistoryButtons();
}

function resetThumbnails() {
  thumbnailToken += 1;
  queuedThumbnails.length = 0;
  queuedThumbnailIds.clear();
  inFlightThumbnailIds.clear();
  failedThumbnailIds.clear();
  thumbnailCache.clear();
}

function clearSessionData() {
  drawingEditor.close();
  setPanelPlaceMessage("");
  resetThumbnails();
  panelStore.clear();
  panelMediaStore.clear();
  cutStore.clear();
  timelineStore.clear();
  motionStore.clear();
  selectedPanelIds.clear();
  selectedTimelinePanelId = null;
  selectedPlacementId = null;
  timelineDrafts.clear();
  timelineAddDrafts.clear();
  selectedCutId = null;
  timelineCutId = null;
  resetCutForm();
  detailCutNumberInput.value = "";
  detailCutDurationInput.value = "";
  setCutMessage("");
  setTimelineMessage("");
  resetPanelPlaceState();
  history.clear();
  overlay.clear();
  cutTimelineEditor.clear();
  motionEditor.clear();
  discardRush();
  resetTimesheetMeta();
}

function syncPanels() {
  const currentPage = session?.currentPage ?? null;
  const pagePanels =
    currentPage === null ? [] : panelStore.listByPage(currentPage);
  overlay.renderPanels(pagePanels);
  overlay.clampFrame();
  renderPanelList();
  renderCutList();
  renderCutDetail();
  renderTimelineViews();
  renderRush();
}

function showIdle() {
  fileNameEl.textContent = "";
  viewer.clear();
  overlay.setEnabled(false);
  overlay.clear();
  history.clear();
  resetPanelPlaceState();
  updatePager();
  updatePlaceUi();
  renderPanelList();
  renderCutList();
  renderCutDetail();
  renderTimelineViews();
  renderRush();
  setState("idle", "PDFファイルを選択してください");
}

function waitForViewerLayout() {
  if (viewerEl) {
    void viewerEl.offsetHeight;
  }
  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(resolve);
    });
  });
}

async function showPage() {
  if (!session) {
    return;
  }
  await waitForViewerLayout();
  await viewer.renderPage(session.document, session.currentPage);
  updatePager();
  syncPanels();
}

async function replaceSession(nextSession) {
  const previous = session;
  session = nextSession;
  if (previous?.document) {
    await destroyPdfDocument(previous.document);
  }
}

async function handleFileChange(event) {
  if (!appActive) {
    event.target.value = "";
    return;
  }
  if (exportRunning) {
    event.target.value = "";
    setExportMessage("書き出し中はPDFを差し替えできません", true);
    return;
  }
  const file = event.target.files?.[0];
  event.target.value = "";
  if (!file) {
    return;
  }

  restoringDraft = false;
  draftController.cancel();
  const reconnecting = isSamePdfReconnect(session, file);
  const pdfBlob = file.slice(0, file.size, file.type || "application/pdf");
  const token = ++loadToken;
  fileNameEl.textContent = file.name;
  prevButton.disabled = true;
  nextButton.disabled = true;
  setState("loading", reconnecting ? "PDFを再接続しています…" : "読み込み中…");

  try {
    const loaded = await loadPdfFromFile(file);
    if (token !== loadToken) {
      await destroyPdfDocument(loaded.document);
      return;
    }

    if (reconnecting) {
      const currentPage = Math.min(
        Math.max(session.currentPage || 1, 1),
        loaded.pageCount,
      );
      await replaceSession({
        fileName: file.name,
        fileSize: file.size,
        pageCount: loaded.pageCount,
        currentPage,
        document: loaded.document,
      });
    } else {
      draftController.forgetMedia();
      currentProjectId = createProjectId();
      clearSessionData();
      await replaceSession({
        fileName: file.name,
        fileSize: file.size,
        pageCount: loaded.pageCount,
        currentPage: 1,
        document: loaded.document,
      });
    }
    await draftController.replacePdf({
      blob: pdfBlob,
      fileName: file.name,
      fileSize: file.size,
      pageCount: loaded.pageCount,
    });
    renderPanelList();
    renderCutList();
    renderTimelineViews();
    setState("viewing", "読み込み中…");
    void viewerEl.offsetHeight;

    try {
      await showPage();
    } catch (renderError) {
      if (token !== loadToken) {
        return;
      }
      if (renderError?.name === "RenderingCancelledException") {
        return;
      }
      console.error(renderError);
      setState("error", "ページを表示できませんでした。");
      updatePager();
      syncPanels();
      return;
    }

    if (token !== loadToken) {
      return;
    }
    setState("viewing", "");
    initSelectionFrame();
    if (reconnecting) {
      requestAllThumbnails();
    }
    syncPanels();
  } catch (error) {
    if (token !== loadToken) {
      return;
    }
    console.error(error);
    if (session) {
      fileNameEl.textContent = session.fileName;
      stopRushKeepData();
      setState(
        "viewing",
        "新しいPDFを読み込めませんでした。直前のPDFを表示しています。",
      );
      updatePager();
      syncPanels();
      return;
    }
    fileNameEl.textContent = "";
    viewer.clear();
    overlay.clear();
    updatePager();
    renderPanelList();
    renderCutList();
    renderCutDetail();
    renderTimelineViews();
    renderRush();
    setState(
      "error",
      "PDFを読み込めませんでした。ファイルが壊れているか、PDFではない可能性があります。",
    );
  }
}

async function goToPage(pageNumber) {
  if (!session) {
    return;
  }
  const nextPage = Math.min(Math.max(pageNumber, 1), session.pageCount);
  if (nextPage === session.currentPage) {
    return;
  }
  session.currentPage = nextPage;
  updatePager();
  scheduleDraftSave();
  try {
    await viewer.renderPage(session.document, session.currentPage);
    setState("viewing", "");
    syncPanels();
  } catch (error) {
    if (error?.name === "RenderingCancelledException") {
      return;
    }
    console.error(error);
    setState("error", "ページを表示できませんでした。");
    syncPanels();
  }
}

function scheduleRefit() {
  if (!appActive || !session || document.body.dataset.state !== "viewing") {
    return;
  }
  window.clearTimeout(resizeTimer);
  resizeTimer = window.setTimeout(() => {
    showPage().catch((error) => {
      if (error?.name === "RenderingCancelledException") {
        return;
      }
      console.error(error);
    });
  }, 100);
}

function showPersistToast(message) {
  if (!persistToastEl || !message) {
    return;
  }
  persistToastEl.textContent = message;
  persistToastEl.hidden = false;
  window.clearTimeout(persistToastTimer);
  persistToastTimer = window.setTimeout(() => {
    persistToastEl.hidden = true;
    persistToastEl.textContent = "";
  }, 3200);
}

function collectDraftState() {
  return serializeProjectState({
    userId: persistenceUserId,
    projectId: currentProjectId,
    currentPage: session?.currentPage ?? 1,
    panels: panelStore.listInRegistrationOrder(),
    cuts: cutStore.listAll(),
    timelines: cutStore
      .listAll()
      .map((cut) => timelineStore.getByCutId(cut.id))
      .filter(Boolean),
    motions: motionStore.listAll(),
    metadata: {
      timesheetEpisode,
      timesheetTitle,
      selectedCutId,
    },
  });
}

function collectDraftMedia() {
  return panelMediaStore.listEntries();
}

const draftController = createDraftController({
  getUserId: () => persistenceUserId,
  getProjectId: () => currentProjectId,
  hasSession: () => Boolean(session) && appActive && !restoringDraft,
  collectState: collectDraftState,
  collectMedia: collectDraftMedia,
  onError(error) {
    console.error(error);
    showPersistToast("自動保存に失敗しました");
  },
});

function scheduleDraftSave() {
  if (!appActive || restoringDraft || !persistenceUserId || !currentProjectId || !session) {
    return;
  }
  draftController.schedule();
}

function emptyDraftState(userId, projectId = null) {
  return serializeProjectState({
    userId,
    projectId,
    currentPage: 1,
    panels: [],
    cuts: [],
    timelines: [],
    motions: [],
    metadata: {
      timesheetEpisode: "",
      timesheetTitle: "",
      selectedCutId: null,
    },
  });
}

function bindHistoryAutosaveOnce() {
  if (historyAutosaveBound) {
    return;
  }
  historyAutosaveBound = true;
  const push = history.push.bind(history);
  history.push = (entry) => {
    push(entry);
    scheduleDraftSave();
  };
}

function bindPersistFlushListenersOnce() {
  if (persistListenersBound) {
    return;
  }
  persistListenersBound = true;
  const flushDraft = () => {
    if (!appActive || restoringDraft || !persistenceUserId || !currentProjectId || !session) {
      return;
    }
    void draftController.flush();
  };
  window.addEventListener("pagehide", flushDraft);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      flushDraft();
    }
  });
}

function requestAllThumbnails() {
  for (const panel of panelStore.listInRegistrationOrder()) {
    requestThumbnail(panel);
  }
}

async function restoreDraftSession(draft, token) {
  const file = new File([draft.pdf.blob], draft.pdf.fileName, {
    type: draft.pdf.blob.type || "application/pdf",
  });
  const loaded = await loadPdfFromFile(file, { restoring: true });
  if (token !== loadToken) {
    await destroyPdfDocument(loaded.document);
    return { ok: false, stale: true };
  }

  // Empty live UI/stores only, then apply the saved draft. IndexedDB is not
  // deleted and this is not the user "new PDF" path.
  clearSessionData();
  const pageCount = loaded.pageCount;
  const currentPage = Math.min(
    Math.max(draft.state.currentPage || 1, 1),
    pageCount,
  );
  await replaceSession({
    fileName: draft.pdf.fileName,
    fileSize: draft.pdf.fileSize ?? draft.pdf.blob.size,
    pageCount,
    currentPage,
    document: loaded.document,
  });
  if (token !== loadToken) {
    return { ok: false, stale: true };
  }

  applyDraftToStores(draft, {
    panelStore,
    panelMediaStore,
    cutStore,
    timelineStore,
    motionStore,
  });
  draftController.rememberMedia(collectDraftMedia());

  timesheetEpisode = String(draft.state.metadata?.timesheetEpisode ?? "");
  timesheetTitle = String(draft.state.metadata?.timesheetTitle ?? "");
  syncTimesheetInputs();

  fileNameEl.textContent = draft.pdf.fileName;
  setState("viewing", "");
  await waitForViewerLayout();
  await showPage();
  if (token !== loadToken) {
    return { ok: false, stale: true };
  }
  initSelectionFrame();
  const selectedId = draft.state.metadata?.selectedCutId ?? null;
  if (selectedId && cutStore.getById(selectedId)) {
    selectCut(selectedId);
  }
  requestAllThumbnails();
  syncPanels();
  return { ok: true };
}

async function tryRestoreDraft() {
  if (!persistenceUserId || restoringDraft) {
    return;
  }
  restoringDraft = true;
  const userId = persistenceUserId;
  const token = ++loadToken;
  try {
    const raw = await readUserDraft(userId);
    if (token !== loadToken) {
      return;
    }
    if (!raw) {
      currentProjectId = null;
      return;
    }
    currentProjectId = raw.projectId ?? null;
    const withState = raw.state
      ? raw
      : {
          ...raw,
          state: emptyDraftState(userId, currentProjectId),
        };
    if (withState.state) {
      withState.state.schemaVersion =
        withState.state.schemaVersion ?? DRAFT_SCHEMA_VERSION;
      withState.state.userId = withState.state.userId ?? userId;
      withState.state.projectId = withState.state.projectId ?? currentProjectId;
      withState.state.currentPage = withState.state.currentPage ?? 1;
    }
    const checked = validateDraft(withState, userId, currentProjectId);
    if (!checked.ok) {
      showIdle();
      showPersistToast("作業の復元に失敗しました。保存データは残しています。");
      return;
    }
    const restored = await restoreDraftSession(checked.draft, token);
    if (token !== loadToken || restored.stale) {
      return;
    }
    if (!restored.ok) {
      clearSessionData();
      await replaceSession(null);
      showIdle();
      showPersistToast("作業の復元に失敗しました。保存データは残しています。");
      return;
    }
    draftController.rememberSummary(raw.summary ?? null);
    showPersistToast("前回の作業を復元しました");
    restoringDraft = false;
    scheduleDraftSave();
  } catch (error) {
    console.error(error);
    if (token !== loadToken) {
      return;
    }
    clearSessionData();
    await replaceSession(null);
    showIdle();
    showPersistToast("作業の復元に失敗しました。保存データは残しています。");
  } finally {
    restoringDraft = false;
  }
}

function bindAppListenersOnce() {
  if (appListenersBound) {
    return;
  }
  appListenersBound = true;
  bindHistoryAutosaveOnce();
  bindPersistFlushListenersOnce();

  cutForm.addEventListener("submit", handleCutFormSubmit);
  cutDetailForm.addEventListener("submit", saveSelectedCut);
  cutNumberClear.addEventListener("click", () => {
    cutNumberInput.value = "";
    cutNumberInput.focus();
  });
  cutDurationClear.addEventListener("click", () => {
    cutDurationInput.value = "";
    cutDurationInput.focus();
  });
  detailCutNumberClear.addEventListener("click", () => {
    detailCutNumberInput.value = "";
    detailCutNumberInput.focus();
  });
  detailCutDurationClear.addEventListener("click", () => {
    detailCutDurationInput.value = "";
    detailCutDurationInput.focus();
  });
  cutAddSelectedButton.addEventListener("click", () => {
    if (selectedCutId) {
      addSelectedPanelsToCut(selectedCutId);
    }
  });
  cutDeleteButton.addEventListener("click", () => {
    deleteSelectedCut();
  });
  timelineRepeatHoldInput?.addEventListener("input", () => {
    repeatHoldRaw = timelineRepeatHoldInput.value;
    syncRepeatHoldHint();
  });
  timelineRepeatApplyButton?.addEventListener("click", () => {
    applyRepeat();
  });
  timesheetEpisodeInput?.addEventListener("input", () => {
    timesheetEpisode = timesheetEpisodeInput.value;
    if (timesheetPreviewOpen) {
      updateTimesheetUi();
    }
  });
  timesheetEpisodeInput?.addEventListener("change", () => {
    timesheetEpisode = timesheetEpisodeInput.value;
    scheduleDraftSave();
  });
  timesheetTitleInput?.addEventListener("input", () => {
    timesheetTitle = timesheetTitleInput.value;
    if (timesheetPreviewOpen) {
      updateTimesheetUi();
    }
  });
  timesheetTitleInput?.addEventListener("change", () => {
    timesheetTitle = timesheetTitleInput.value;
    scheduleDraftSave();
  });
  timesheetPreviewButton?.addEventListener("click", () => {
    handleTimesheetPreview();
  });
  timesheetExportButton?.addEventListener("click", () => {
    handleTimesheetExport();
  });
  timesheetPrevSheetButton?.addEventListener("click", () => {
    handleTimesheetSheetStep(-1);
  });
  timesheetNextSheetButton?.addEventListener("click", () => {
    handleTimesheetSheetStep(1);
  });
  placeModeFrameButton.addEventListener("click", () => {
    setPanelPlaceMode("frame");
  });
  placeModeDragButton.addEventListener("click", () => {
    setPanelPlaceMode("drag");
  });
  aspectLockInput.addEventListener("change", () => {
    overlay.setAspectLocked(aspectLockInput.checked);
    updatePlaceUi();
  });
  capturePanelButton.addEventListener("click", () => {
    captureCurrentFrame();
  });
  openDrawingButton?.addEventListener("click", () => {
    handleCreateDrawing();
  });
  document.addEventListener("pointerdown", (event) => {
    if (!appActive || !insertMenuState) {
      return;
    }
    if (event.target.closest(".cut-timeline-insert-menu")) {
      return;
    }
    if (event.target.closest(".cut-timeline-place-preview")) {
      return;
    }
    closeInsertMenu();
  });
  window.addEventListener("resize", () => {
    if (insertMenuState) {
      positionInsertMenu();
    }
  });
  uploadPanelButton?.addEventListener("click", () => {
    handleUploadPanel();
  });
  undoButton.addEventListener("click", () => {
    handleUndo();
  });
  redoButton.addEventListener("click", () => {
    handleRedo();
  });
  window.addEventListener("keydown", (event) => {
    if (!appActive) {
      return;
    }
    if (drawingEditor.isOpen()) {
      return;
    }
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      if (isTextEditingTarget(event.target)) {
        return;
      }
      if (cutTimelineEditor.isBusy()) {
        return;
      }
      const step = event.shiftKey ? 5 : 1;
      const delta = event.key === "ArrowLeft" ? -step : step;
      if (nudgeSelectedTimelinePanel(delta)) {
        event.preventDefault();
      }
      return;
    }
    const key = event.key.toLowerCase();
    if (key !== "z") {
      return;
    }
    const modifier = event.metaKey || event.ctrlKey;
    if (!modifier) {
      return;
    }
    if (isTextEditingTarget(event.target)) {
      return;
    }
    event.preventDefault();
    if (event.shiftKey) {
      handleRedo();
      return;
    }
    handleUndo();
  });
  rushPlayButton.addEventListener("click", () => {
    handleRushPlay();
  });
  rushPauseButton.addEventListener("click", () => {
    handleRushPause();
  });
  rushResetButton.addEventListener("click", () => {
    handleRushReset();
  });
  exportButton?.addEventListener("click", () => {
    handleExportMp4();
  });
  exportCancelButton?.addEventListener("click", () => {
    handleExportCancel();
  });
  pdfInput.addEventListener("change", handleFileChange);
  prevButton.addEventListener("click", () => {
    if (session) {
      goToPage(session.currentPage - 1);
    }
  });
  nextButton.addEventListener("click", () => {
    if (session) {
      goToPage(session.currentPage + 1);
    }
  });
  window.addEventListener("resize", scheduleRefit);
}

export async function initializeConteRush(userId) {
  bindAppListenersOnce();
  if (!userId) {
    return;
  }
  if (appActive && persistenceUserId === userId) {
    return;
  }
  persistenceUserId = userId;
  appActive = true;
  try {
    showIdle();
    await tryRestoreDraft();
    if (session?.document) {
      await showPage();
    }
  } catch (error) {
    console.error(error);
    if (statusEl) {
      statusEl.textContent = `起動エラー: ${error.message}`;
    }
    throw error;
  }
}

export async function resetConteRushSession({ clearPersistence = false } = {}) {
  void clearPersistence;
  appActive = false;
  restoringDraft = false;
  draftController.cancel();
  persistenceUserId = null;
  currentProjectId = null;
  handleExportCancel();
  if (exportJobPromise) {
    try {
      await exportJobPromise;
    } catch {
      // Cancelled or failed export; session clear continues.
    }
  }
  discardRush();
  clearSessionData();
  await replaceSession(null);
  if (pdfInput) {
    pdfInput.value = "";
  }
  draftController.forgetMedia();
  try {
    showIdle();
  } catch (error) {
    console.error(error);
  }
}


import { destroyPdfDocument, loadPdfFromFile } from "./pdf-loader.js";
import { createCutStore } from "./cut-store.js";
import {
  formatDuration,
  formatDurationLabel,
  parseDurationInput,
} from "./duration.js";
import { canvasToObjectUrl, cropPanelImage, PREVIEW_SCALE } from "./panel-image.js";
import { createPdfViewer } from "./pdf-viewer.js";
import { createPanelOverlay, MIN_SIZE } from "./panel-overlay.js";
import { createTimelineEditor } from "./timeline-editor.js";
import { createPanelStore } from "./panel-store.js";
import { createThumbnailCache } from "./thumbnail-cache.js";
import {
  createTimelineStore,
  parseStartFrameInput,
} from "./timeline-store.js";
import {
  createRushImageCache,
  RUSH_SCALE,
} from "./rush-image-cache.js";
import {
  buildSnapshot,
  createRushPlayer,
  cutNumberForPanel,
  describeIncomplete,
  uniquePanelIds,
} from "./rush-player.js";

const pdfInput = document.querySelector("#pdf-input");
const fileNameEl = document.querySelector("#file-name");
const statusEl = document.querySelector("#status");
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
const timelineMetaEl = document.querySelector("#timeline-meta");
const timelineStatusEl = document.querySelector("#timeline-status");
const timelineRowsEl = document.querySelector("#timeline-rows");
const timelineRangesEl = document.querySelector("#timeline-ranges");
const timelineMessageEl = document.querySelector("#timeline-message");
const rushStatusEl = document.querySelector("#rush-status");
const rushCutEl = document.querySelector("#rush-cut");
const rushLocalEl = document.querySelector("#rush-local");
const rushGlobalEl = document.querySelector("#rush-global");
const rushMessageEl = document.querySelector("#rush-message");
const rushPlaceholderEl = document.querySelector("#rush-placeholder");
const rushImageEl = document.querySelector("#rush-image");
const rushPlayButton = document.querySelector("#rush-play");
const rushPauseButton = document.querySelector("#rush-pause");
const rushResetButton = document.querySelector("#rush-reset");
const placeModeDragButton = document.querySelector("#place-mode-drag");
const placeModeStampButton = document.querySelector("#place-mode-stamp");
const panelSizeFieldsEl = document.querySelector("#panel-size-fields");
const panelWidthPercentInput = document.querySelector("#panel-width-percent");
const panelHeightPercentInput = document.querySelector("#panel-height-percent");
const stampCommitButton = document.querySelector("#stamp-commit");
const stampCancelButton = document.querySelector("#stamp-cancel");

let session = null;
let loadToken = 0;
let resizeTimer = 0;
let thumbnailToken = 0;
let drainingThumbnails = false;
let panelCropQueue = Promise.resolve();
let selectedCutId = null;
let timelineCutId = null;
let panelTemplate = null;
let panelPlaceMode = "drag";
let rushPrepToken = 0;
let rushPreparing = false;
let rushError = "";
let rushView = null;

const queuedThumbnails = [];
const queuedThumbnailIds = new Set();
const inFlightThumbnailIds = new Set();
const failedThumbnailIds = new Set();
const selectedPanelIds = new Set();
const timelineDrafts = new Map();

const viewer = createPdfViewer(canvas, viewerEl);
const panelStore = createPanelStore();
const cutStore = createCutStore();
const timelineStore = createTimelineStore();
const thumbnailCache = createThumbnailCache();
const rushImageCache = createRushImageCache();
const overlay = createPanelOverlay(overlayEl, {
  isEnabled: () => document.body.dataset.state === "viewing" && Boolean(session),
  getPageNumber: () => session?.currentPage ?? null,
  getTemplate: () => panelTemplate,
  onCandidateChange() {
    updatePlaceUi();
  },
  onCreate(rect) {
    const panel = panelStore.add(rect);
    rememberPanelTemplate(panel);
    syncPanels();
    requestThumbnail(panel);
  },
});
const cutTimelineEditor = createTimelineEditor(cutTimelineStripEl, {
  onPreview({ panelId, candidateFrame }) {
    previewStartFrameInput(panelId, candidateFrame);
  },
  onCommit(payload) {
    commitCutTimelineDrag(payload);
  },
  onCancel({ panelId, savedFrame }) {
    restoreStartFrameInput(panelId, savedFrame);
  },
});

function setState(state, message) {
  document.body.dataset.state = state;
  statusEl.textContent = message;
  overlay.setEnabled(state === "viewing" && Boolean(session));
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

function toPercentDisplay(value) {
  return String(Math.round(value * 100));
}

function parsePercentInput(raw) {
  const trimmed = String(raw ?? "").trim();
  if (!trimmed) {
    return { ok: false };
  }
  const percent = Number(trimmed);
  if (!Number.isFinite(percent) || percent < 1 || percent > 100) {
    return { ok: false };
  }
  const value = percent / 100;
  if (value < MIN_SIZE || value > 1) {
    return { ok: false };
  }
  return { ok: true, value };
}

function rememberPanelTemplate(panel) {
  if (!panel) {
    return;
  }
  panelTemplate = {
    width: panel.width,
    height: panel.height,
  };
  updatePlaceUi();
}

function resetPanelPlaceState() {
  panelTemplate = null;
  panelPlaceMode = "drag";
  overlay.setMode("drag");
  overlay.clearCandidate();
  updatePlaceUi();
}

function updatePlaceUi() {
  if (!panelTemplate && panelPlaceMode === "stamp") {
    panelPlaceMode = "drag";
    overlay.setMode("drag");
  }
  const hasTemplate = Boolean(panelTemplate);
  const hasCandidate = overlay.hasCandidate();
  placeModeDragButton.setAttribute(
    "aria-pressed",
    panelPlaceMode === "drag" ? "true" : "false",
  );
  placeModeStampButton.setAttribute(
    "aria-pressed",
    panelPlaceMode === "stamp" ? "true" : "false",
  );
  placeModeStampButton.disabled = !hasTemplate;
  panelSizeFieldsEl.hidden = !hasTemplate;
  if (hasTemplate) {
    panelWidthPercentInput.value = toPercentDisplay(panelTemplate.width);
    panelHeightPercentInput.value = toPercentDisplay(panelTemplate.height);
  } else {
    panelWidthPercentInput.value = "";
    panelHeightPercentInput.value = "";
  }
  stampCommitButton.disabled = !hasCandidate;
  stampCancelButton.disabled = !hasCandidate;
}

function setPanelPlaceMode(nextMode) {
  if (nextMode === "stamp" && !panelTemplate) {
    return;
  }
  panelPlaceMode = nextMode === "stamp" ? "stamp" : "drag";
  overlay.setMode(panelPlaceMode);
  updatePlaceUi();
}

function applyTemplateSizeFromInputs() {
  if (!panelTemplate) {
    return;
  }
  const width = parsePercentInput(panelWidthPercentInput.value);
  const height = parsePercentInput(panelHeightPercentInput.value);
  if (!width.ok || !height.ok) {
    panelWidthPercentInput.value = toPercentDisplay(panelTemplate.width);
    panelHeightPercentInput.value = toPercentDisplay(panelTemplate.height);
    return;
  }
  panelTemplate = {
    width: width.value,
    height: height.value,
  };
  if (overlay.hasCandidate()) {
    overlay.resizeCandidate(panelTemplate);
  }
  updatePlaceUi();
}

function confirmStampCandidate() {
  const rect = overlay.getCandidate();
  if (!rect || !session) {
    return;
  }
  overlay.clearCandidate();
  const panel = panelStore.add({
    pageNumber: session.currentPage,
    x: rect.x,
    y: rect.y,
    width: rect.width,
    height: rect.height,
  });
  rememberPanelTemplate(panel);
  syncPanels();
  requestThumbnail(panel);
}

function cancelStampCandidate() {
  overlay.clearCandidate();
  updatePlaceUi();
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

function showRushView(view) {
  rushView = view;
  const cached = view?.panelId ? rushImageCache.get(view.panelId) : null;
  if (cached?.url) {
    rushImageEl.hidden = false;
    rushImageEl.src = cached.url;
    rushPlaceholderEl.hidden = true;
  } else {
    rushImageEl.hidden = true;
    rushImageEl.removeAttribute("src");
    rushPlaceholderEl.hidden = false;
    rushPlaceholderEl.textContent = rushPreparing
      ? "画像を準備しています"
      : "未準備";
  }

  rushCutEl.textContent = view ? `CUT ${view.cutNumber}` : "";
  rushLocalEl.textContent = view
    ? `${view.localFrame} / ${view.durationFrames}f`
    : "";
  rushGlobalEl.textContent = view
    ? `Global ${view.globalFrame} / ${view.totalFrames}f`
    : "";
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

  const canControl = Boolean(session);
  rushPlayButton.disabled = !canControl || rushPreparing;
  rushPauseButton.disabled = !canControl || !rushPlayer.isPlaying();
  rushResetButton.disabled = !canControl;
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
    if (rushImageCache.has(panelId)) {
      continue;
    }
    const panel = panelStore.getById(panelId);
    const cutNumber = cutNumberForPanel(snapshot, panelId);
    if (!session?.document || !panel) {
      return { ok: false, panelId, cutNumber };
    }
    try {
      const cropped = await enqueuePanelCrop(() =>
        cropPanelImage(session.document, panel, {
          scale: RUSH_SCALE,
        }),
      );
      if (token !== rushPrepToken) {
        return { ok: false, cancelled: true };
      }
      const url = await canvasToObjectUrl(cropped);
      if (token !== rushPrepToken) {
        URL.revokeObjectURL(url);
        return { ok: false, cancelled: true };
      }
      rushImageCache.set(panelId, { url });
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
  if (!session || rushPreparing || rushPlayer.isPlaying()) {
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

function panelLabel(panelId) {
  const panel = panelStore.getById(panelId);
  return panel ? `p.${panel.pageNumber}` : panelId;
}

function formatRange(range) {
  return `${range.startFrame}–${range.lastFrame}f`;
}

function previewStartFrameInput(panelId, frame) {
  const input = timelineRowsEl.querySelector(
    `[data-timeline-panel="${CSS.escape(panelId)}"]`,
  );
  if (input) {
    input.value = String(frame);
  }
}

function restoreStartFrameInput(panelId, frame) {
  timelineDrafts.set(panelId, String(frame));
  previewStartFrameInput(panelId, frame);
}

function commitCutTimelineDrag({ cutId, panelId, candidateFrame, savedFrame }) {
  if (candidateFrame === savedFrame) {
    restoreStartFrameInput(panelId, savedFrame);
    renderTimelineViews();
    return;
  }
  const cut = cutStore.getById(cutId);
  if (!cut) {
    setTimelineMessage("Cutが見つかりません。");
    restoreStartFrameInput(panelId, savedFrame);
    renderTimelineViews();
    return;
  }
  const result = timelineStore.updatePlacement(
    cutId,
    panelId,
    candidateFrame,
    cut,
  );
  if (!result.ok) {
    setTimelineMessage(result.message);
    restoreStartFrameInput(panelId, savedFrame);
    renderTimelineViews();
    return;
  }
  timelineDrafts.set(panelId, String(candidateFrame));
  markRushDirty();
  setTimelineMessage("");
  renderTimelineViews();
  renderCutList();
  renderCutDetail();
}

function renderCutTimelineStrip() {
  if (cutTimelineEditor.isDragging()) {
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
    endLabel: `${cut.durationFrames}f`,
    markers: (timeline?.placements ?? []).map((placement) => {
      const cached = thumbnailCache.get(placement.panelId);
      return {
        panelId: placement.panelId,
        startFrame: placement.startFrame,
        label: panelLabel(placement.panelId),
        thumbUrl: cached?.url ?? "",
      };
    }),
    ranges: ranges.map((range) => ({
      text: `${panelLabel(range.panelId)} ${formatRange(range)}`,
    })),
  });
}

function renderTimelineViews() {
  renderTimelineEditor();
  renderCutTimelineStrip();
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
}

function closeTimelineEditor() {
  timelineCutId = null;
  timelineDrafts.clear();
  setTimelineMessage("");
}

function selectCut(cutId, { fillForm = true } = {}) {
  const cut = cutStore.getById(cutId);
  if (!cut) {
    clearCutSelection();
    return;
  }
  selectedCutId = cut.id;
  timelineCutId = cut.id;
  timelineDrafts.clear();
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
    image.alt = "所属 Panel のプレビュー";
    image.src = cached.url;
    wrap.append(image);
  }
  return wrap;
}

function renderTimelineEditor() {
  if (cutTimelineEditor.isDragging()) {
    return;
  }
  if (!timelineCutId) {
    timelineMetaEl.replaceChildren();
    timelineStatusEl.textContent = "";
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
  const rangeByPanelId = new Map(ranges.map((range) => [range.panelId, range]));
  const placedIds = new Set((timeline?.placements ?? []).map((item) => item.panelId));
  const complete = timelineStore.isComplete(cut);

  timelineMetaEl.replaceChildren();

  const numberEl = document.createElement("p");
  numberEl.textContent = `CUT ${cut.cutNumber}`;
  const durationEl = document.createElement("p");
  durationEl.textContent = formatDurationLabel(cut.durationFrames);
  timelineMetaEl.append(numberEl, durationEl);

  timelineStatusEl.textContent = complete ? "配置完了" : "未完成";
  timelineStatusEl.classList.toggle("is-complete", complete);
  timelineStatusEl.classList.toggle("is-incomplete", !complete);

  timelineRowsEl.replaceChildren();
  for (const panelId of cut.panelIds) {
    timelineRowsEl.append(createTimelineRowEl(cut, panelId, {
      placed: placedIds.has(panelId),
      range: rangeByPanelId.get(panelId) ?? null,
      startFrame: timeline?.placements.find((item) => item.panelId === panelId)
        ?.startFrame,
    }));
  }

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
      item.textContent = `${range.startFrame}f  ${panelLabel(range.panelId)}  ${formatRange(range)}`;
      timelineRangesEl.append(item);
    }
  }
}

function createTimelineRowEl(cut, panelId, { placed, range, startFrame }) {
  const item = document.createElement("li");
  item.className = "timeline-row";

  const label = document.createElement("p");
  label.className = "timeline-row-label";
  label.textContent = placed ? panelLabel(panelId) : `${panelLabel(panelId)}（未配置）`;
  label.title = panelId;

  const rangeEl = document.createElement("p");
  rangeEl.className = "timeline-row-range";
  rangeEl.textContent = range ? formatRange(range) : "—";

  const edit = document.createElement("div");
  edit.className = "timeline-row-edit";

  const field = document.createElement("label");
  field.textContent = "start";
  const input = document.createElement("input");
  input.type = "text";
  input.inputMode = "numeric";
  input.autocomplete = "off";
  input.dataset.timelinePanel = panelId;
  const fallback = placed && startFrame !== undefined ? String(startFrame) : "";
  input.value = timelineDrafts.has(panelId)
    ? timelineDrafts.get(panelId)
    : fallback;
  input.addEventListener("input", () => {
    timelineDrafts.set(panelId, input.value);
  });
  const unit = document.createElement("span");
  unit.textContent = "f";
  field.append(input, unit);

  const saveButton = document.createElement("button");
  saveButton.type = "button";
  saveButton.textContent = placed ? "更新" : "配置";
  saveButton.addEventListener("click", () => {
    saveTimelinePlacement(cut.id, panelId, input.value, placed);
  });
  edit.append(field, saveButton);

  if (placed) {
    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.textContent = "削除";
    deleteButton.addEventListener("click", () => {
      timelineStore.removePlacement(cut.id, panelId);
      timelineDrafts.delete(panelId);
      markRushDirty();
      setTimelineMessage("");
      renderTimelineViews();
      renderCutList();
      renderCutDetail();
    });
    edit.append(deleteButton);
  }

  item.append(createTimelineThumbEl(panelId), label, rangeEl, edit);
  return item;
}

function saveTimelinePlacement(cutId, panelId, rawValue, placed) {
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
  const result = placed
    ? timelineStore.updatePlacement(cutId, panelId, parsed.startFrame, cut)
    : timelineStore.addPlacement(cutId, {
        panelId,
        startFrame: parsed.startFrame,
      }, cut);
  if (!result.ok) {
    setTimelineMessage(result.message);
    return;
  }
  timelineDrafts.set(panelId, String(parsed.startFrame));
  markRushDirty();
  setTimelineMessage("");
  renderTimelineViews();
  renderCutList();
  renderCutDetail();
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
    image.alt = `ページ ${panel.pageNumber} の Panel プレビュー`;
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
    if (panel.pageNumber === currentPage) {
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
    pageEl.textContent = `ページ ${panel.pageNumber}`;

    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.textContent = "削除";
    deleteButton.addEventListener("click", () => {
      deletePanel(panel.id);
    });

    item.append(select, pageEl, deleteButton, idEl, createThumbnailEl(panel));
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
  idEl.textContent = panel ? `p.${panel.pageNumber}` : panelId;
  idEl.title = panelId;
  item.append(idEl);

  const removeButton = document.createElement("button");
  removeButton.type = "button";
  removeButton.textContent = "外す";
  removeButton.addEventListener("click", () => {
    cutStore.removePanel(cutId, panelId);
    timelineStore.removePlacement(cutId, panelId);
    markRushDirty();
    setCutMessage("");
    renderCutList();
    renderCutDetail();
    renderTimelineViews();
  });
  item.append(removeButton);

  return item;
}

function renderCutList() {
  const cuts = cutStore.listAll();
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
  markRushDirty();
  setCutMessage("");
  clearCutSelection();
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
  maybeInitSinglePanelTimeline(cutStore.getById(created.id) ?? created);
  markRushDirty();
  selectedPanelIds.clear();
  resetCutForm();
  setCutMessage("");
  renderPanelList();
  selectCut(created.id);
}

function cancelQueuedThumbnail(panelId) {
  const index = queuedThumbnails.findIndex((job) => job.panel.id === panelId);
  if (index !== -1) {
    queuedThumbnails.splice(index, 1);
  }
  queuedThumbnailIds.delete(panelId);
}

function requestThumbnail(panel) {
  if (!session?.document || !panel) {
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
      const cropped = await enqueuePanelCrop(() =>
        cropPanelImage(job.pdfDocument, job.panel, {
          scale: PREVIEW_SCALE,
        }),
      );
      if (job.generation !== thumbnailToken || !panelExists(job.panel.id)) {
        continue;
      }
      const url = await canvasToObjectUrl(cropped);
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
  cutStore.removePanelFromAll(panelId);
  timelineStore.removePanelFromAll(panelId);
  selectedPanelIds.delete(panelId);
  panelStore.remove(panelId);
  cancelQueuedThumbnail(panelId);
  thumbnailCache.delete(panelId);
  rushImageCache.delete(panelId);
  failedThumbnailIds.delete(panelId);
  timelineDrafts.delete(panelId);
  markRushDirty();
  syncPanels();
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
  resetThumbnails();
  panelStore.clear();
  cutStore.clear();
  timelineStore.clear();
  selectedPanelIds.clear();
  timelineDrafts.clear();
  selectedCutId = null;
  timelineCutId = null;
  resetCutForm();
  detailCutNumberInput.value = "";
  detailCutDurationInput.value = "";
  setCutMessage("");
  setTimelineMessage("");
  resetPanelPlaceState();
  overlay.clear();
  cutTimelineEditor.clear();
  discardRush();
}

function syncPanels() {
  const currentPage = session?.currentPage ?? null;
  const pagePanels =
    currentPage === null ? [] : panelStore.listByPage(currentPage);
  overlay.renderPanels(pagePanels);
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
  updatePager();
  updatePlaceUi();
  renderPanelList();
  renderCutList();
  renderCutDetail();
  renderTimelineViews();
  renderRush();
  setState("idle", "PDFファイルを選択してください");
}

async function showPage() {
  if (!session) {
    return;
  }
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
  const file = event.target.files?.[0];
  event.target.value = "";
  if (!file) {
    return;
  }

  const token = ++loadToken;
  fileNameEl.textContent = file.name;
  prevButton.disabled = true;
  nextButton.disabled = true;
  setState("loading", "読み込み中…");

  try {
    const loaded = await loadPdfFromFile(file);
    if (token !== loadToken) {
      await destroyPdfDocument(loaded.document);
      return;
    }

    clearSessionData();
    await replaceSession({
      fileName: file.name,
      fileSize: file.size,
      pageCount: loaded.pageCount,
      currentPage: 1,
      document: loaded.document,
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
  overlay.clearCandidate();
  session.currentPage = nextPage;
  updatePager();
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
  if (!session || document.body.dataset.state !== "viewing") {
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
placeModeDragButton.addEventListener("click", () => {
  setPanelPlaceMode("drag");
});
placeModeStampButton.addEventListener("click", () => {
  setPanelPlaceMode("stamp");
});
panelWidthPercentInput.addEventListener("change", () => {
  applyTemplateSizeFromInputs();
});
panelHeightPercentInput.addEventListener("change", () => {
  applyTemplateSizeFromInputs();
});
stampCommitButton.addEventListener("click", () => {
  confirmStampCandidate();
});
stampCancelButton.addEventListener("click", () => {
  cancelStampCandidate();
});
window.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") {
    return;
  }
  if (cutTimelineEditor.isDragging()) {
    return;
  }
  if (!overlay.hasCandidate()) {
    return;
  }
  event.preventDefault();
  cancelStampCandidate();
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

try {
  showIdle();
} catch (error) {
  console.error(error);
  if (statusEl) {
    statusEl.textContent = `起動エラー: ${error.message}`;
  }
  throw error;
}

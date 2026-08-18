import { destroyPdfDocument, loadPdfFromFile } from "./pdf-loader.js";
import { createCutStore } from "./cut-store.js";
import {
  formatDuration,
  formatDurationLabel,
  parseDurationInput,
} from "./duration.js";
import { canvasToObjectUrl, cropPanelImage, PREVIEW_SCALE } from "./panel-image.js";
import { createPdfViewer } from "./pdf-viewer.js";
import { createPanelOverlay } from "./panel-overlay.js";
import { createPanelStore } from "./panel-store.js";
import { createThumbnailCache } from "./thumbnail-cache.js";
import {
  createTimelineStore,
  parseStartFrameInput,
} from "./timeline-store.js";

const pdfInput = document.querySelector("#pdf-input");
const fileNameEl = document.querySelector("#file-name");
const statusEl = document.querySelector("#status");
const pageInfoEl = document.querySelector("#page-info");
const prevButton = document.querySelector("#prev-page");
const nextButton = document.querySelector("#next-page");
const canvas = document.querySelector("#pdf-canvas");
const viewerEl = document.querySelector(".viewer");
const overlayEl = document.querySelector("#panel-overlay");
const panelCountsEl = document.querySelector("#panel-counts");
const panelListEl = document.querySelector("#panel-list");
const cutForm = document.querySelector("#cut-form");
const cutNumberInput = document.querySelector("#cut-number-input");
const cutDurationInput = document.querySelector("#cut-duration-input");
const cutSubmitButton = document.querySelector("#cut-submit");
const cutCancelEditButton = document.querySelector("#cut-cancel-edit");
const cutMessageEl = document.querySelector("#cut-message");
const cutListEl = document.querySelector("#cut-list");
const timelineEditorEl = document.querySelector("#timeline-editor");
const timelineCloseButton = document.querySelector("#timeline-close");
const timelineMetaEl = document.querySelector("#timeline-meta");
const timelineStatusEl = document.querySelector("#timeline-status");
const timelineRowsEl = document.querySelector("#timeline-rows");
const timelineRangesEl = document.querySelector("#timeline-ranges");
const timelineMessageEl = document.querySelector("#timeline-message");

let session = null;
let loadToken = 0;
let resizeTimer = 0;
let thumbnailToken = 0;
let drainingThumbnails = false;
let editingCutId = null;
let timelineCutId = null;

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
const overlay = createPanelOverlay(overlayEl, {
  isEnabled: () => document.body.dataset.state === "viewing" && Boolean(session),
  getPageNumber: () => session?.currentPage ?? null,
  onCreate(rect) {
    const panel = panelStore.add(rect);
    syncPanels();
    requestThumbnail(panel);
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

function panelLabel(panelId) {
  const panel = panelStore.getById(panelId);
  return panel ? `p.${panel.pageNumber}` : panelId;
}

function formatRange(range) {
  return `${range.startFrame}–${range.lastFrame}f`;
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
}

function closeTimelineEditor() {
  timelineCutId = null;
  timelineDrafts.clear();
  setTimelineMessage("");
  timelineEditorEl.hidden = true;
  renderCutList();
}

function openTimelineEditor(cutId) {
  const cut = cutStore.getById(cutId);
  if (!cut) {
    return;
  }
  timelineCutId = cutId;
  timelineDrafts.clear();
  maybeInitSinglePanelTimeline(cut);
  setTimelineMessage("");
  renderCutList();
  renderTimelineEditor();
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
  if (!timelineCutId) {
    timelineEditorEl.hidden = true;
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

  timelineEditorEl.hidden = false;
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
      setTimelineMessage("");
      renderTimelineEditor();
      renderCutList();
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
  setTimelineMessage("");
  renderTimelineEditor();
  renderCutList();
}

function resetCutForm() {
  editingCutId = null;
  cutNumberInput.value = "";
  cutDurationInput.value = "";
  cutSubmitButton.textContent = "この選択でCutを作成";
  cutCancelEditButton.hidden = true;
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
    setCutMessage("");
    renderCutList();
    renderTimelineEditor();
  });
  item.append(removeButton);

  return item;
}

function renderCutList() {
  const cuts = cutStore.listAll();
  cutListEl.replaceChildren();

  for (const cut of cuts) {
    const item = document.createElement("li");
    item.className = "cut-item";
    if (cut.id === timelineCutId) {
      item.classList.add("is-timeline-target");
    }

    const numberEl = document.createElement("p");
    numberEl.className = "cut-number";
    numberEl.textContent = cut.cutNumber;

    const durationEl = document.createElement("p");
    durationEl.className = "cut-duration";
    durationEl.textContent = formatDurationLabel(cut.durationFrames);

    const countEl = document.createElement("p");
    countEl.className = "cut-count";
    countEl.textContent = `Panel ${cut.panelIds.length}件`;

    const members = document.createElement("ul");
    members.className = "cut-members";
    for (const panelId of cut.panelIds) {
      members.append(createCutMemberEl(cut.id, panelId));
    }

    const actions = document.createElement("div");
    actions.className = "cut-actions";

    const addButton = document.createElement("button");
    addButton.type = "button";
    addButton.textContent = "選択Panelを追加";
    addButton.addEventListener("click", () => {
      addSelectedPanelsToCut(cut.id);
    });

    const timelineButton = document.createElement("button");
    timelineButton.type = "button";
    timelineButton.textContent = "Timeline";
    timelineButton.addEventListener("click", () => {
      openTimelineEditor(cut.id);
    });

    const editButton = document.createElement("button");
    editButton.type = "button";
    editButton.textContent = "編集";
    editButton.addEventListener("click", () => {
      startCutEdit(cut.id);
    });

    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.textContent = "削除";
    deleteButton.addEventListener("click", () => {
      cutStore.remove(cut.id);
      timelineStore.removeByCutId(cut.id);
      if (editingCutId === cut.id) {
        resetCutForm();
      }
      if (timelineCutId === cut.id) {
        closeTimelineEditor();
      }
      setCutMessage("");
      renderCutList();
    });

    actions.append(addButton, timelineButton, editButton, deleteButton);
    item.append(numberEl, durationEl, countEl, members, actions);
    cutListEl.append(item);
  }
}

function startCutEdit(cutId) {
  const cut = cutStore.getById(cutId);
  if (!cut) {
    return;
  }
  editingCutId = cutId;
  cutNumberInput.value = cut.cutNumber;
  cutDurationInput.value = formatDuration(cut.durationFrames);
  cutSubmitButton.textContent = "変更を保存";
  cutCancelEditButton.hidden = false;
  setCutMessage("");
  cutNumberInput.focus();
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
  selectedPanelIds.clear();
  setCutMessage("");
  renderPanelList();
  renderCutList();
  renderTimelineEditor();
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

  if (editingCutId) {
    if (cutStore.hasCutNumber(cutNumber, editingCutId)) {
      setCutMessage("同じCUT番号がすでにあります。");
      return;
    }
    const blocking = timelineStore.placementsBlockingDuration(
      editingCutId,
      duration.durationFrames,
    );
    if (blocking.length > 0) {
      const frames = blocking.map((item) => `${item.startFrame}f`).join("、");
      setCutMessage(
        `${frames} の配置があるため ${duration.durationFrames}f にできません。`,
      );
      return;
    }
    cutStore.update(editingCutId, {
      cutNumber,
      durationFrames: duration.durationFrames,
    });
    resetCutForm();
    setCutMessage("");
    renderCutList();
    renderTimelineEditor();
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
  maybeInitSinglePanelTimeline(created);
  selectedPanelIds.clear();
  resetCutForm();
  setCutMessage("");
  renderPanelList();
  renderCutList();
  renderTimelineEditor();
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
      const cropped = await cropPanelImage(job.pdfDocument, job.panel, {
        scale: PREVIEW_SCALE,
      });
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
        renderTimelineEditor();
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
  failedThumbnailIds.delete(panelId);
  timelineDrafts.delete(panelId);
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
  timelineCutId = null;
  timelineEditorEl.hidden = true;
  resetCutForm();
  setCutMessage("");
  setTimelineMessage("");
  overlay.clear();
}

function syncPanels() {
  const currentPage = session?.currentPage ?? null;
  const pagePanels =
    currentPage === null ? [] : panelStore.listByPage(currentPage);
  overlay.renderPanels(pagePanels);
  renderPanelList();
  renderCutList();
  renderTimelineEditor();
}

function showIdle() {
  fileNameEl.textContent = "";
  viewer.clear();
  overlay.setEnabled(false);
  overlay.clear();
  updatePager();
  renderPanelList();
  renderCutList();
  renderTimelineEditor();
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
    renderTimelineEditor();

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
    renderTimelineEditor();
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
cutCancelEditButton.addEventListener("click", () => {
  resetCutForm();
  setCutMessage("");
});
timelineCloseButton.addEventListener("click", () => {
  closeTimelineEditor();
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

showIdle();

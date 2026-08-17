import { destroyPdfDocument, loadPdfFromFile } from "./pdf-loader.js";
import { canvasToObjectUrl, cropPanelImage, PREVIEW_SCALE } from "./panel-image.js";
import { createPdfViewer } from "./pdf-viewer.js";
import { createPanelOverlay } from "./panel-overlay.js";
import { createPanelStore } from "./panel-store.js";
import { createThumbnailCache } from "./thumbnail-cache.js";

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

let session = null;
let loadToken = 0;
let resizeTimer = 0;
let thumbnailToken = 0;
let drainingThumbnails = false;

const queuedThumbnails = [];
const queuedThumbnailIds = new Set();
const inFlightThumbnailIds = new Set();
const failedThumbnailIds = new Set();

const viewer = createPdfViewer(canvas, viewerEl);
const panelStore = createPanelStore();
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
  return panelStore.listAll().some((panel) => panel.id === panelId);
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
  if (queuedThumbnailIds.has(panelId)) {
    return "queued";
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

    item.append(idEl, createThumbnailEl(panel), pageEl, deleteButton);
    panelListEl.append(item);
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
      }
    }
  }

  drainingThumbnails = false;
}

function deletePanel(panelId) {
  panelStore.remove(panelId);
  cancelQueuedThumbnail(panelId);
  thumbnailCache.delete(panelId);
  failedThumbnailIds.delete(panelId);
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

function syncPanels() {
  const currentPage = session?.currentPage ?? null;
  const pagePanels =
    currentPage === null ? [] : panelStore.listByPage(currentPage);
  overlay.renderPanels(pagePanels);
  renderPanelList();
}

function showIdle() {
  fileNameEl.textContent = "";
  viewer.clear();
  overlay.setEnabled(false);
  overlay.clear();
  updatePager();
  renderPanelList();
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

    resetThumbnails();
    panelStore.clear();
    overlay.clear();
    await replaceSession({
      fileName: file.name,
      fileSize: file.size,
      pageCount: loaded.pageCount,
      currentPage: 1,
      document: loaded.document,
    });
    renderPanelList();

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

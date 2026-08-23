import { decodeImageBlob } from "./panel-image-provider.js?v=m10-2";

export const DRAWING_WIDTH = 1280;
export const DRAWING_HEIGHT = 720;
export const DRAWING_MIME = "image/png";

const MAX_EDITOR_HISTORY = 40;
const PEN_SIZES = [4, 10, 20];
const SIZE_LABELS = ["細", "中", "太"];
const DEFAULT_ONION_OPACITY = 0.35;
const ONION_HINT_NO_CONTEXT =
  "前後の絵を表示するには、Timelineの［絵を編集］から開いてください";

function canvasToPngBlob(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error("描画画像を保存できませんでした。"));
        return;
      }
      resolve(blob);
    }, DRAWING_MIME);
  });
}

function pointFromPointer(event, canvas) {
  const rect = canvas.getBoundingClientRect();
  const width = Math.max(1, rect.width);
  const height = Math.max(1, rect.height);
  return {
    x: ((event.clientX - rect.left) / width) * canvas.width,
    y: ((event.clientY - rect.top) / height) * canvas.height,
  };
}

function paintStroke(ctx, stroke) {
  const points = stroke.points ?? [];
  if (points.length === 0) {
    return;
  }
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.lineWidth = stroke.size;
  if (stroke.tool === "eraser") {
    ctx.globalCompositeOperation = "destination-out";
    ctx.strokeStyle = "rgba(0,0,0,1)";
  } else {
    ctx.globalCompositeOperation = "source-over";
    ctx.strokeStyle = "#000000";
  }
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  if (points.length === 1) {
    ctx.lineTo(points[0].x + 0.01, points[0].y);
  } else {
    for (let index = 1; index < points.length; index += 1) {
      ctx.lineTo(points[index].x, points[index].y);
    }
  }
  ctx.stroke();
  ctx.restore();
}

function disposeImage(image) {
  if (image && typeof image.close === "function") {
    image.close();
  }
}

function drawContained(ctx, image, alpha) {
  const width = image.width || image.naturalWidth || 0;
  const height = image.height || image.naturalHeight || 0;
  if (width < 1 || height < 1) {
    return;
  }
  const scale = Math.min(DRAWING_WIDTH / width, DRAWING_HEIGHT / height);
  const dw = width * scale;
  const dh = height * scale;
  const dx = (DRAWING_WIDTH - dw) / 2;
  const dy = (DRAWING_HEIGHT - dh) / 2;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.drawImage(image, 0, 0, width, height, dx, dy, dw, dh);
  ctx.restore();
}

function applyCommand(ctx, command) {
  if (command.type === "clear") {
    ctx.clearRect(0, 0, DRAWING_WIDTH, DRAWING_HEIGHT);
    return;
  }
  paintStroke(ctx, command);
}

export function createDrawingEditor() {
  const overlay = document.createElement("div");
  overlay.className = "drawing-editor-overlay";
  overlay.hidden = true;
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.setAttribute("aria-label", "手描きPanel");

  overlay.innerHTML = `
    <div class="drawing-editor">
      <div class="drawing-editor-toolbar">
        <div class="drawing-editor-heading">
          <p class="drawing-editor-title" data-role="title">手描きPanel</p>
          <p class="drawing-editor-caption" data-role="caption" hidden></p>
        </div>
        <div class="drawing-editor-tools" role="group" aria-label="描画ツール">
          <button type="button" data-role="pen" aria-pressed="true">ペン</button>
          <button type="button" data-role="eraser" aria-pressed="false">消しゴム</button>
        </div>
        <div class="drawing-editor-sizes" role="group" aria-label="ペンサイズ">
          ${PEN_SIZES.map(
            (size, index) =>
              `<button type="button" data-role="size" data-size="${size}" aria-pressed="${
                index === 1 ? "true" : "false"
              }">${SIZE_LABELS[index]}</button>`,
          ).join("")}
        </div>
        <div class="drawing-editor-history">
          <button type="button" data-role="undo">Undo</button>
          <button type="button" data-role="redo">Redo</button>
          <button type="button" data-role="clear">全消去</button>
        </div>
        <div class="drawing-editor-actions">
          <button type="button" data-role="commit">Panelとして追加</button>
          <button type="button" data-role="cancel">キャンセル</button>
        </div>
      </div>
      <div class="drawing-editor-onion" data-role="onion">
        <div class="drawing-editor-onion-copy">
          <p class="drawing-editor-onion-title">前後の絵を透かして表示（Onion Skin）</p>
          <p class="drawing-editor-onion-lead">
            Timeline上の前後の絵を参照して、手描きするときのガイドとして表示します。
          </p>
          <p class="drawing-editor-onion-hint" data-role="onion-hint" hidden></p>
        </div>
        <div class="drawing-editor-onion-sides" data-role="onion-sides">
          <div class="drawing-editor-onion-side" data-role="onion-prev-side">
            <p class="drawing-editor-onion-side-title">
              前の絵 <span data-role="onion-prev-number"></span>
            </p>
            <div class="drawing-editor-onion-thumb" data-role="onion-prev-thumb"></div>
            <p class="drawing-editor-onion-empty" data-role="onion-prev-empty">
              前の絵はありません
            </p>
            <div class="drawing-editor-onion-controls" data-role="onion-prev-controls">
              <label>
                <input type="checkbox" data-role="onion-prev" checked />
                表示
              </label>
              <label>
                透明度
                <input
                  type="range"
                  data-role="onion-prev-opacity"
                  min="0"
                  max="100"
                  value="35"
                />
                <span data-role="onion-prev-opacity-label">35%</span>
              </label>
            </div>
          </div>
          <div class="drawing-editor-onion-side" data-role="onion-next-side">
            <p class="drawing-editor-onion-side-title">
              次の絵 <span data-role="onion-next-number"></span>
            </p>
            <div class="drawing-editor-onion-thumb" data-role="onion-next-thumb"></div>
            <p class="drawing-editor-onion-empty" data-role="onion-next-empty">
              次の絵はありません
            </p>
            <div class="drawing-editor-onion-controls" data-role="onion-next-controls">
              <label>
                <input type="checkbox" data-role="onion-next" checked />
                表示
              </label>
              <label>
                透明度
                <input
                  type="range"
                  data-role="onion-next-opacity"
                  min="0"
                  max="100"
                  value="35"
                />
                <span data-role="onion-next-opacity-label">35%</span>
              </label>
            </div>
          </div>
        </div>
      </div>
      <div class="drawing-editor-stage">
        <div class="drawing-editor-stack" data-role="stack">
          <canvas class="drawing-editor-paper" data-role="paper" width="${DRAWING_WIDTH}" height="${DRAWING_HEIGHT}"></canvas>
          <canvas class="drawing-editor-reference" data-role="reference" width="${DRAWING_WIDTH}" height="${DRAWING_HEIGHT}"></canvas>
          <canvas class="drawing-editor-layer" data-role="drawing" width="${DRAWING_WIDTH}" height="${DRAWING_HEIGHT}"></canvas>
        </div>
      </div>
    </div>
  `;

  document.body.append(overlay);

  const titleEl = overlay.querySelector('[data-role="title"]');
  const captionEl = overlay.querySelector('[data-role="caption"]');
  const penButton = overlay.querySelector('[data-role="pen"]');
  const eraserButton = overlay.querySelector('[data-role="eraser"]');
  const sizeButtons = [...overlay.querySelectorAll('[data-role="size"]')];
  const undoButton = overlay.querySelector('[data-role="undo"]');
  const redoButton = overlay.querySelector('[data-role="redo"]');
  const clearButton = overlay.querySelector('[data-role="clear"]');
  const commitButton = overlay.querySelector('[data-role="commit"]');
  const cancelButton = overlay.querySelector('[data-role="cancel"]');
  const onionHintEl = overlay.querySelector('[data-role="onion-hint"]');
  const onionSidesEl = overlay.querySelector('[data-role="onion-sides"]');
  const onionPrevSideEl = overlay.querySelector('[data-role="onion-prev-side"]');
  const onionNextSideEl = overlay.querySelector('[data-role="onion-next-side"]');
  const onionPrevNumberEl = overlay.querySelector('[data-role="onion-prev-number"]');
  const onionNextNumberEl = overlay.querySelector('[data-role="onion-next-number"]');
  const onionPrevThumbEl = overlay.querySelector('[data-role="onion-prev-thumb"]');
  const onionNextThumbEl = overlay.querySelector('[data-role="onion-next-thumb"]');
  const onionPrevEmptyEl = overlay.querySelector('[data-role="onion-prev-empty"]');
  const onionNextEmptyEl = overlay.querySelector('[data-role="onion-next-empty"]');
  const onionPrevControlsEl = overlay.querySelector(
    '[data-role="onion-prev-controls"]',
  );
  const onionNextControlsEl = overlay.querySelector(
    '[data-role="onion-next-controls"]',
  );
  const onionPrevInput = overlay.querySelector('[data-role="onion-prev"]');
  const onionNextInput = overlay.querySelector('[data-role="onion-next"]');
  const onionPrevOpacityInput = overlay.querySelector(
    '[data-role="onion-prev-opacity"]',
  );
  const onionNextOpacityInput = overlay.querySelector(
    '[data-role="onion-next-opacity"]',
  );
  const onionPrevOpacityLabel = overlay.querySelector(
    '[data-role="onion-prev-opacity-label"]',
  );
  const onionNextOpacityLabel = overlay.querySelector(
    '[data-role="onion-next-opacity-label"]',
  );
  const paperCanvas = overlay.querySelector('[data-role="paper"]');
  const referenceCanvas = overlay.querySelector('[data-role="reference"]');
  const drawingCanvas = overlay.querySelector('[data-role="drawing"]');

  const paperCtx = paperCanvas.getContext("2d", { alpha: false });
  const referenceCtx = referenceCanvas.getContext("2d");
  const drawingCtx = drawingCanvas.getContext("2d");
  const baselineCanvas = document.createElement("canvas");
  baselineCanvas.width = DRAWING_WIDTH;
  baselineCanvas.height = DRAWING_HEIGHT;
  const baselineCtx = baselineCanvas.getContext("2d");

  let open = false;
  let mode = "create";
  let tool = "pen";
  let size = PEN_SIZES[1];
  let commands = [];
  let redoCommands = [];
  let activeStroke = null;
  let activePointerId = null;
  let resolveClose = null;
  let opening = false;
  let onionToken = 0;
  let onionContext = null;
  let prevEnabled = true;
  let nextEnabled = true;
  let prevOpacity = DEFAULT_ONION_OPACITY;
  let nextOpacity = DEFAULT_ONION_OPACITY;
  let prevImage = null;
  let nextImage = null;
  const onionImageCache = new Map();

  function opacityFromInput(input) {
    const raw = Number(input.value);
    if (!Number.isFinite(raw)) {
      return DEFAULT_ONION_OPACITY;
    }
    return Math.min(1, Math.max(0, raw / 100));
  }

  function setOpacityLabel(labelEl, opacity) {
    labelEl.textContent = `${Math.round(opacity * 100)}%`;
  }

  function resetOnionUiState() {
    prevEnabled = true;
    nextEnabled = true;
    prevOpacity = DEFAULT_ONION_OPACITY;
    nextOpacity = DEFAULT_ONION_OPACITY;
    onionPrevInput.checked = true;
    onionNextInput.checked = true;
    onionPrevOpacityInput.value = String(Math.round(DEFAULT_ONION_OPACITY * 100));
    onionNextOpacityInput.value = String(Math.round(DEFAULT_ONION_OPACITY * 100));
    setOpacityLabel(onionPrevOpacityLabel, prevOpacity);
    setOpacityLabel(onionNextOpacityLabel, nextOpacity);
  }

  function fillOnionThumb(thumbEl, view) {
    thumbEl.replaceChildren();
    if (!view?.thumbUrl) {
      return;
    }
    const image = document.createElement("img");
    image.alt = "";
    image.src = view.thumbUrl;
    thumbEl.append(image);
  }

  function fillOnionSide({
    sideEl,
    numberEl,
    thumbEl,
    emptyEl,
    controlsEl,
    checkbox,
    opacityInput,
    view,
    emptyText,
  }) {
    const has = Boolean(view?.panelId);
    sideEl.classList.toggle("is-empty", !has);
    numberEl.textContent = has
      ? `${view.numberLabel || ""}${view.kindLabel ? ` ${view.kindLabel}` : ""}`.trim()
      : "";
    emptyEl.hidden = has;
    emptyEl.textContent = emptyText;
    controlsEl.hidden = !has;
    thumbEl.hidden = !has;
    fillOnionThumb(thumbEl, has ? view : null);
    checkbox.disabled = !has;
    opacityInput.disabled = !has;
    if (!has) {
      checkbox.checked = false;
    }
  }

  function updateOnionUi() {
    const hasContext = Boolean(onionContext);
    const hasPrev = Boolean(onionContext?.prevPanelId);
    const hasNext = Boolean(onionContext?.nextPanelId);
    onionHintEl.hidden = hasContext;
    onionHintEl.textContent = hasContext ? "" : ONION_HINT_NO_CONTEXT;
    onionSidesEl.hidden = !hasContext;
    if (!hasContext) {
      fillOnionSide({
        sideEl: onionPrevSideEl,
        numberEl: onionPrevNumberEl,
        thumbEl: onionPrevThumbEl,
        emptyEl: onionPrevEmptyEl,
        controlsEl: onionPrevControlsEl,
        checkbox: onionPrevInput,
        opacityInput: onionPrevOpacityInput,
        view: null,
        emptyText: "前の絵はありません",
      });
      fillOnionSide({
        sideEl: onionNextSideEl,
        numberEl: onionNextNumberEl,
        thumbEl: onionNextThumbEl,
        emptyEl: onionNextEmptyEl,
        controlsEl: onionNextControlsEl,
        checkbox: onionNextInput,
        opacityInput: onionNextOpacityInput,
        view: null,
        emptyText: "次の絵はありません",
      });
      onionPrevEmptyEl.hidden = true;
      onionNextEmptyEl.hidden = true;
      return;
    }
    fillOnionSide({
      sideEl: onionPrevSideEl,
      numberEl: onionPrevNumberEl,
      thumbEl: onionPrevThumbEl,
      emptyEl: onionPrevEmptyEl,
      controlsEl: onionPrevControlsEl,
      checkbox: onionPrevInput,
      opacityInput: onionPrevOpacityInput,
      view: hasPrev ? onionContext.prevView : null,
      emptyText: "前の絵はありません",
    });
    fillOnionSide({
      sideEl: onionNextSideEl,
      numberEl: onionNextNumberEl,
      thumbEl: onionNextThumbEl,
      emptyEl: onionNextEmptyEl,
      controlsEl: onionNextControlsEl,
      checkbox: onionNextInput,
      opacityInput: onionNextOpacityInput,
      view: hasNext ? onionContext.nextView : null,
      emptyText: "次の絵はありません",
    });
  }

  function paintReference() {
    referenceCtx.clearRect(0, 0, DRAWING_WIDTH, DRAWING_HEIGHT);
    if (prevEnabled && prevImage) {
      drawContained(referenceCtx, prevImage, prevOpacity);
    }
    if (nextEnabled && nextImage) {
      drawContained(referenceCtx, nextImage, nextOpacity);
    }
  }

  function clearOnionImages() {
    disposeImage(prevImage);
    disposeImage(nextImage);
    prevImage = null;
    nextImage = null;
    for (const value of onionImageCache.values()) {
      if (value && typeof value.then !== "function") {
        disposeImage(value);
      }
    }
    onionImageCache.clear();
  }

  async function loadOnionImage(panelId) {
    if (!panelId || !onionContext?.loadImage) {
      return null;
    }
    if (onionImageCache.has(panelId)) {
      return onionImageCache.get(panelId);
    }
    const pending = Promise.resolve()
      .then(() => onionContext.loadImage(panelId))
      .catch((error) => {
        console.error(error);
        onionImageCache.delete(panelId);
        return null;
      });
    onionImageCache.set(panelId, pending);
    return pending;
  }

  async function refreshOnionImages() {
    const token = (onionToken += 1);
    const prevId = onionContext?.prevPanelId ?? null;
    const nextId = onionContext?.nextPanelId ?? null;
    const [prev, next] = await Promise.all([
      prevId ? loadOnionImage(prevId) : null,
      nextId ? loadOnionImage(nextId) : null,
    ]);
    if (token !== onionToken) {
      const stale = new Set();
      if (prev && prev !== prevImage && prev !== nextImage) {
        stale.add(prev);
      }
      if (next && next !== prevImage && next !== nextImage) {
        stale.add(next);
      }
      for (const image of stale) {
        disposeImage(image);
      }
      return;
    }
    prevImage = prev;
    nextImage = next;
    paintReference();
  }

  function fillPaper() {
    paperCtx.fillStyle = "#ffffff";
    paperCtx.fillRect(0, 0, DRAWING_WIDTH, DRAWING_HEIGHT);
  }

  function clearReference() {
    referenceCtx.clearRect(0, 0, DRAWING_WIDTH, DRAWING_HEIGHT);
  }

  function replay() {
    drawingCtx.clearRect(0, 0, DRAWING_WIDTH, DRAWING_HEIGHT);
    drawingCtx.drawImage(baselineCanvas, 0, 0);
    for (const command of commands) {
      applyCommand(drawingCtx, command);
    }
  }

  function bakeOldest() {
    while (commands.length > MAX_EDITOR_HISTORY) {
      const oldest = commands.shift();
      applyCommand(baselineCtx, oldest);
    }
  }

  function updateEditorButtons() {
    undoButton.disabled = commands.length === 0;
    redoButton.disabled = redoCommands.length === 0;
    penButton.setAttribute("aria-pressed", tool === "pen" ? "true" : "false");
    eraserButton.setAttribute(
      "aria-pressed",
      tool === "eraser" ? "true" : "false",
    );
    for (const button of sizeButtons) {
      button.setAttribute(
        "aria-pressed",
        Number(button.dataset.size) === size ? "true" : "false",
      );
    }
  }

  function commitCommand(command) {
    commands.push(command);
    redoCommands = [];
    bakeOldest();
    updateEditorButtons();
  }

  function undoStroke() {
    if (activeStroke || commands.length === 0) {
      return;
    }
    redoCommands.push(commands.pop());
    replay();
    updateEditorButtons();
  }

  function redoStroke() {
    if (activeStroke || redoCommands.length === 0) {
      return;
    }
    const command = redoCommands.pop();
    commands.push(command);
    bakeOldest();
    applyCommand(drawingCtx, command);
    updateEditorButtons();
  }

  function clearAll() {
    if (activeStroke) {
      return;
    }
    applyCommand(drawingCtx, { type: "clear" });
    commitCommand({ type: "clear" });
  }

  function finishClose(result) {
    if (!open && !resolveClose) {
      return;
    }
    onionToken += 1;
    onionContext = null;
    open = false;
    overlay.hidden = true;
    document.body.classList.remove("drawing-editor-open");
    activeStroke = null;
    activePointerId = null;
    commands = [];
    redoCommands = [];
    baselineCtx.clearRect(0, 0, DRAWING_WIDTH, DRAWING_HEIGHT);
    drawingCtx.clearRect(0, 0, DRAWING_WIDTH, DRAWING_HEIGHT);
    clearReference();
    clearOnionImages();
    resetOnionUiState();
    updateOnionUi();
    const resolve = resolveClose;
    resolveClose = null;
    resolve?.(result);
  }

  function cancel() {
    if (activeStroke && activePointerId !== null) {
      try {
        drawingCanvas.releasePointerCapture(activePointerId);
      } catch {
        // ignore
      }
    }
    finishClose(null);
  }

  async function commit() {
    if (opening || activeStroke) {
      return;
    }
    const flatten = document.createElement("canvas");
    flatten.width = DRAWING_WIDTH;
    flatten.height = DRAWING_HEIGHT;
    const flattenCtx = flatten.getContext("2d");
    flattenCtx.drawImage(paperCanvas, 0, 0);
    flattenCtx.drawImage(drawingCanvas, 0, 0);
    try {
      const blob = await canvasToPngBlob(flatten);
      finishClose({
        blob,
        mimeType: DRAWING_MIME,
        width: DRAWING_WIDTH,
        height: DRAWING_HEIGHT,
      });
    } finally {
      flatten.width = 0;
      flatten.height = 0;
    }
  }

  function onPointerDown(event) {
    if (!open || event.button !== 0 || activeStroke) {
      return;
    }
    event.preventDefault();
    drawingCanvas.setPointerCapture(event.pointerId);
    activePointerId = event.pointerId;
    const point = pointFromPointer(event, drawingCanvas);
    activeStroke = {
      type: "stroke",
      tool,
      size,
      points: [point],
    };
    paintStroke(drawingCtx, activeStroke);
  }

  function onPointerMove(event) {
    if (!activeStroke || event.pointerId !== activePointerId) {
      return;
    }
    event.preventDefault();
    const point = pointFromPointer(event, drawingCanvas);
    const last = activeStroke.points[activeStroke.points.length - 1];
    activeStroke.points.push(point);
    paintStroke(drawingCtx, {
      ...activeStroke,
      points: [last, point],
    });
  }

  function onPointerUp(event) {
    if (!activeStroke || event.pointerId !== activePointerId) {
      return;
    }
    event.preventDefault();
    try {
      drawingCanvas.releasePointerCapture(event.pointerId);
    } catch {
      // ignore
    }
    commitCommand(activeStroke);
    activeStroke = null;
    activePointerId = null;
  }

  function onKeyDown(event) {
    if (!open) {
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      cancel();
      return;
    }
    const key = event.key.toLowerCase();
    if (key !== "z" || !(event.metaKey || event.ctrlKey)) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    if (event.shiftKey) {
      redoStroke();
      return;
    }
    undoStroke();
  }

  drawingCanvas.addEventListener("pointerdown", onPointerDown);
  drawingCanvas.addEventListener("pointermove", onPointerMove);
  drawingCanvas.addEventListener("pointerup", onPointerUp);
  drawingCanvas.addEventListener("pointercancel", onPointerUp);
  window.addEventListener("keydown", onKeyDown, true);

  penButton.addEventListener("click", () => {
    tool = "pen";
    updateEditorButtons();
  });
  eraserButton.addEventListener("click", () => {
    tool = "eraser";
    updateEditorButtons();
  });
  for (const button of sizeButtons) {
    button.addEventListener("click", () => {
      size = Number(button.dataset.size);
      updateEditorButtons();
    });
  }
  undoButton.addEventListener("click", () => {
    undoStroke();
  });
  redoButton.addEventListener("click", () => {
    redoStroke();
  });
  clearButton.addEventListener("click", () => {
    clearAll();
  });
  commitButton.addEventListener("click", () => {
    commit();
  });
  cancelButton.addEventListener("click", () => {
    cancel();
  });
  onionPrevInput.addEventListener("change", () => {
    prevEnabled = onionPrevInput.checked;
    paintReference();
  });
  onionNextInput.addEventListener("change", () => {
    nextEnabled = onionNextInput.checked;
    paintReference();
  });
  onionPrevOpacityInput.addEventListener("input", () => {
    prevOpacity = opacityFromInput(onionPrevOpacityInput);
    setOpacityLabel(onionPrevOpacityLabel, prevOpacity);
    paintReference();
  });
  onionNextOpacityInput.addEventListener("input", () => {
    nextOpacity = opacityFromInput(onionNextOpacityInput);
    setOpacityLabel(onionNextOpacityLabel, nextOpacity);
    paintReference();
  });

  async function openEditor({
    mode: nextMode = "create",
    backgroundBlob = null,
    onion = null,
    caption = "",
  } = {}) {
    if (open || opening) {
      return null;
    }
    opening = true;
    try {
      mode = nextMode === "reedit" ? "reedit" : "create";
      tool = "pen";
      size = PEN_SIZES[1];
      commands = [];
      redoCommands = [];
      activeStroke = null;
      activePointerId = null;
      onionToken += 1;
      clearOnionImages();
      resetOnionUiState();
      onionContext =
        onion && typeof onion.loadImage === "function"
          ? {
              prevPanelId: onion.prevPanelId ?? null,
              nextPanelId: onion.nextPanelId ?? null,
              prevView: onion.prevView ?? null,
              nextView: onion.nextView ?? null,
              loadImage: onion.loadImage,
            }
          : null;
      prevEnabled = Boolean(onionContext?.prevPanelId);
      nextEnabled = Boolean(onionContext?.nextPanelId);
      onionPrevInput.checked = prevEnabled;
      onionNextInput.checked = nextEnabled;
      updateOnionUi();
      fillPaper();
      clearReference();
      baselineCtx.clearRect(0, 0, DRAWING_WIDTH, DRAWING_HEIGHT);
      if (backgroundBlob) {
        const image = await decodeImageBlob(backgroundBlob);
        paperCtx.drawImage(image, 0, 0, DRAWING_WIDTH, DRAWING_HEIGHT);
        if (typeof image.close === "function") {
          image.close();
        }
      }
      replay();
      titleEl.textContent = mode === "reedit" ? "手描きPanelを編集" : "手描きPanel";
      const captionText = String(caption ?? "").trim();
      captionEl.hidden = !captionText;
      captionEl.textContent = captionText;
      commitButton.textContent =
        mode === "reedit" ? "更新" : "Panelとして追加";
      updateEditorButtons();
      overlay.hidden = false;
      open = true;
      document.body.classList.add("drawing-editor-open");
      refreshOnionImages();
      return new Promise((resolve) => {
        resolveClose = resolve;
      });
    } catch (error) {
      onionToken += 1;
      onionContext = null;
      clearOnionImages();
      clearReference();
      resetOnionUiState();
      updateOnionUi();
      throw error;
    } finally {
      opening = false;
    }
  }

  function close() {
    cancel();
  }

  return {
    open: openEditor,
    close,
    isOpen() {
      return open;
    },
  };
}

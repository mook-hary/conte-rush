export const MIN_SIZE = 0.01;
export const ASPECT_WIDTH = 16;
export const ASPECT_HEIGHT = 9;
const ASPECT = ASPECT_WIDTH / ASPECT_HEIGHT;
const INITIAL_WIDTH = 0.45;

function clamp01(value) {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.min(1, Math.max(0, value));
}

function toPercent(value) {
  return `${value * 100}%`;
}

function normalizeRect(x0, y0, x1, y1) {
  const x = Math.min(x0, x1);
  const y = Math.min(y0, y1);
  return {
    x,
    y,
    width: Math.abs(x1 - x0),
    height: Math.abs(y1 - y0),
  };
}

function clampSize(width, height) {
  return {
    width: Math.min(1, Math.max(MIN_SIZE, width)),
    height: Math.min(1, Math.max(MIN_SIZE, height)),
  };
}

export function clampRect(x, y, width, height) {
  const size = clampSize(width, height);
  return {
    x: Math.min(Math.max(0, x), 1 - size.width),
    y: Math.min(Math.max(0, y), 1 - size.height),
    width: size.width,
    height: size.height,
  };
}

function overlaySize(overlayEl) {
  const bounds = overlayEl.getBoundingClientRect();
  return {
    width: Math.max(bounds.width, 1),
    height: Math.max(bounds.height, 1),
  };
}

export function heightForVisualAspect(width, overlayWidth, overlayHeight) {
  return (width * overlayWidth) / (ASPECT * overlayHeight);
}

export function widthForVisualAspect(height, overlayWidth, overlayHeight) {
  return (height * ASPECT * overlayHeight) / overlayWidth;
}

function cloneFrame(frame) {
  if (!frame) {
    return null;
  }
  return {
    x: frame.x,
    y: frame.y,
    width: frame.width,
    height: frame.height,
    aspectLocked: Boolean(frame.aspectLocked),
  };
}

export function createPanelOverlay(overlayEl, options) {
  let mode = "frame";
  let draft = null;
  let draftEl = null;
  let frame = null;
  let frameEl = null;
  let interaction = null;

  function isEnabled() {
    return Boolean(options.isEnabled?.());
  }

  function clientToRelative(event) {
    const bounds = overlayEl.getBoundingClientRect();
    const width = Math.max(bounds.width, 1);
    const height = Math.max(bounds.height, 1);
    return {
      x: clamp01((event.clientX - bounds.left) / width),
      y: clamp01((event.clientY - bounds.top) / height),
    };
  }

  function fitLockedRect(x, y, width, height) {
    const size = overlaySize(overlayEl);
    let nextWidth = width;
    let nextHeight = heightForVisualAspect(nextWidth, size.width, size.height);
    if (nextHeight > 1) {
      nextHeight = 1;
      nextWidth = widthForVisualAspect(nextHeight, size.width, size.height);
    }
    if (nextWidth > 1) {
      nextWidth = 1;
      nextHeight = heightForVisualAspect(nextWidth, size.width, size.height);
    }
    if (nextWidth < MIN_SIZE) {
      nextWidth = MIN_SIZE;
      nextHeight = heightForVisualAspect(nextWidth, size.width, size.height);
    }
    if (nextHeight < MIN_SIZE) {
      nextHeight = MIN_SIZE;
      nextWidth = widthForVisualAspect(nextHeight, size.width, size.height);
    }
    return clampRect(x, y, nextWidth, nextHeight);
  }

  function applyFrame(next) {
    if (!next) {
      frame = null;
      return;
    }
    frame = {
      ...clampRect(next.x, next.y, next.width, next.height),
      aspectLocked: Boolean(next.aspectLocked),
    };
  }

  function lockFromCurrentWidth() {
    if (!frame) {
      return;
    }
    const centerX = frame.x + frame.width / 2;
    const centerY = frame.y + frame.height / 2;
    const size = overlaySize(overlayEl);
    let width = frame.width;
    let height = heightForVisualAspect(width, size.width, size.height);
    if (height > 1) {
      height = 1;
      width = widthForVisualAspect(height, size.width, size.height);
    }
    if (width > 1) {
      width = 1;
      height = heightForVisualAspect(width, size.width, size.height);
    }
    const fitted = fitLockedRect(
      centerX - width / 2,
      centerY - height / 2,
      width,
      height,
    );
    applyFrame({
      ...fitted,
      aspectLocked: true,
    });
  }

  function createInitialFrame() {
    const size = overlaySize(overlayEl);
    const width = INITIAL_WIDTH;
    const height = heightForVisualAspect(width, size.width, size.height);
    const fitted = fitLockedRect(0.5 - width / 2, 0.5 - height / 2, width, height);
    return { ...fitted, aspectLocked: true };
  }

  function ensureFrameEl() {
    if (frameEl) {
      return frameEl;
    }
    frameEl = document.createElement("div");
    frameEl.className = "selection-frame";
    for (const corner of ["nw", "ne", "sw", "se"]) {
      const handle = document.createElement("span");
      handle.className = "selection-handle";
      handle.dataset.corner = corner;
      frameEl.append(handle);
    }
    overlayEl.append(frameEl);
    return frameEl;
  }

  function placeRect(element, rect) {
    element.style.left = toPercent(rect.x);
    element.style.top = toPercent(rect.y);
    element.style.width = toPercent(rect.width);
    element.style.height = toPercent(rect.height);
  }

  function updateFrameEl() {
    if (!frame || mode !== "frame") {
      if (frameEl) {
        frameEl.hidden = true;
      }
      return;
    }
    const element = ensureFrameEl();
    element.hidden = false;
    placeRect(element, frame);
  }

  function ensureDraftEl() {
    if (draftEl) {
      return draftEl;
    }
    draftEl = document.createElement("div");
    draftEl.className = "panel-draft";
    overlayEl.appendChild(draftEl);
    return draftEl;
  }

  function updateDraftEl() {
    if (!draft) {
      return;
    }
    placeRect(
      ensureDraftEl(),
      normalizeRect(draft.startX, draft.startY, draft.currentX, draft.currentY),
    );
  }

  function cancelDraft() {
    draft = null;
    if (draftEl) {
      draftEl.remove();
      draftEl = null;
    }
  }

  function resizeFromCorner(fixedX, fixedY, corner, point) {
    if (!frame) {
      return;
    }
    const attachLeft = corner.includes("e");
    const attachTop = corner.includes("s");
    const maxWidth = attachLeft ? 1 - fixedX : fixedX;
    const maxHeight = attachTop ? 1 - fixedY : fixedY;
    if (maxWidth < MIN_SIZE || maxHeight < MIN_SIZE) {
      return;
    }
    if (frame.aspectLocked) {
      const size = overlaySize(overlayEl);
      const desiredW = Math.abs(point.x - fixedX) * size.width;
      const desiredH = Math.abs(point.y - fixedY) * size.height;
      let pixelW = Math.max(desiredW, MIN_SIZE * size.width);
      let pixelH = pixelW / ASPECT;
      if (pixelH < desiredH) {
        pixelH = Math.max(desiredH, MIN_SIZE * size.height);
        pixelW = pixelH * ASPECT;
      }
      const scale = Math.min(
        1,
        (maxWidth * size.width) / pixelW,
        (maxHeight * size.height) / pixelH,
      );
      pixelW *= scale;
      pixelH *= scale;
      const width = Math.min(maxWidth, Math.max(MIN_SIZE, pixelW / size.width));
      const height = Math.min(
        maxHeight,
        Math.max(MIN_SIZE, pixelH / size.height),
      );
      applyFrame({
        x: attachLeft ? fixedX : fixedX - width,
        y: attachTop ? fixedY : fixedY - height,
        width,
        height,
        aspectLocked: true,
      });
      return;
    }
    const width = Math.min(
      maxWidth,
      Math.max(MIN_SIZE, attachLeft ? point.x - fixedX : fixedX - point.x),
    );
    const height = Math.min(
      maxHeight,
      Math.max(MIN_SIZE, attachTop ? point.y - fixedY : fixedY - point.y),
    );
    applyFrame({
      x: attachLeft ? fixedX : fixedX - width,
      y: attachTop ? fixedY : fixedY - height,
      width,
      height,
      aspectLocked: false,
    });
  }

  function setMode(nextMode) {
    mode = nextMode === "drag" ? "drag" : "frame";
    overlayEl.classList.toggle("is-frame", mode === "frame");
    overlayEl.classList.toggle("is-drag", mode === "drag");
    if (mode === "frame") {
      cancelDraft();
    }
    updateFrameEl();
  }

  function setEnabled(enabled) {
    overlayEl.classList.toggle("is-enabled", enabled);
    if (!enabled) {
      cancelDraft();
      interaction = null;
    }
  }

  function getFrame() {
    return cloneFrame(frame);
  }

  function resetFrame() {
    applyFrame(createInitialFrame());
    updateFrameEl();
    return getFrame();
  }

  function clampFrame() {
    if (!frame) {
      return getFrame();
    }
    applyFrame(frame);
    updateFrameEl();
    return getFrame();
  }

  function setAspectLocked(locked) {
    if (!frame) {
      return getFrame();
    }
    if (locked) {
      lockFromCurrentWidth();
    } else {
      frame = { ...frame, aspectLocked: false };
    }
    updateFrameEl();
    return getFrame();
  }

  function renderPanels(panels) {
    overlayEl.querySelectorAll(".panel-rect").forEach((element) => {
      element.remove();
    });
    for (const panel of panels) {
      const element = document.createElement("div");
      element.className = "panel-rect";
      element.dataset.panelId = panel.id;
      placeRect(element, panel);
      overlayEl.appendChild(element);
    }
    if (frameEl) {
      overlayEl.appendChild(frameEl);
    }
    if (draftEl) {
      overlayEl.appendChild(draftEl);
    }
    updateFrameEl();
  }

  function clear() {
    cancelDraft();
    interaction = null;
    frame = null;
    if (frameEl) {
      frameEl.remove();
      frameEl = null;
    }
    overlayEl.querySelectorAll(".panel-rect").forEach((element) => {
      element.remove();
    });
  }

  overlayEl.addEventListener("pointerdown", (event) => {
    if (event.button !== 0 || !isEnabled()) {
      return;
    }
    if (mode === "frame") {
      const handle = event.target.closest?.(".selection-handle");
      const onFrame = event.target.closest?.(".selection-frame");
      if (!frame || (!handle && !onFrame)) {
        return;
      }
      event.preventDefault();
      const point = clientToRelative(event);
      if (handle) {
        const corner = handle.dataset.corner;
        interaction = {
          type: "resize",
          pointerId: event.pointerId,
          corner,
          fixedX: corner.includes("e") ? frame.x : frame.x + frame.width,
          fixedY: corner.includes("s") ? frame.y : frame.y + frame.height,
        };
      } else {
        interaction = {
          type: "move",
          pointerId: event.pointerId,
          offsetX: point.x - frame.x,
          offsetY: point.y - frame.y,
        };
        frameEl?.classList.add("is-dragging");
      }
      overlayEl.setPointerCapture(event.pointerId);
      return;
    }

    event.preventDefault();
    const point = clientToRelative(event);
    draft = {
      pointerId: event.pointerId,
      startX: point.x,
      startY: point.y,
      currentX: point.x,
      currentY: point.y,
    };
    overlayEl.setPointerCapture(event.pointerId);
    updateDraftEl();
  });

  overlayEl.addEventListener("pointermove", (event) => {
    if (interaction && event.pointerId === interaction.pointerId && frame) {
      const point = clientToRelative(event);
      if (interaction.type === "move") {
        applyFrame({
          ...frame,
          x: point.x - interaction.offsetX,
          y: point.y - interaction.offsetY,
        });
      } else {
        resizeFromCorner(
          interaction.fixedX,
          interaction.fixedY,
          interaction.corner,
          point,
        );
      }
      updateFrameEl();
      return;
    }
    if (!draft || event.pointerId !== draft.pointerId) {
      return;
    }
    const point = clientToRelative(event);
    draft.currentX = point.x;
    draft.currentY = point.y;
    updateDraftEl();
  });

  overlayEl.addEventListener("pointerup", (event) => {
    if (interaction && event.pointerId === interaction.pointerId) {
      frameEl?.classList.remove("is-dragging");
      interaction = null;
      return;
    }
    if (!draft || event.pointerId !== draft.pointerId) {
      return;
    }
    const point = clientToRelative(event);
    const rect = normalizeRect(draft.startX, draft.startY, point.x, point.y);
    cancelDraft();
    if (!isEnabled() || mode !== "drag") {
      return;
    }
    if (rect.width < MIN_SIZE || rect.height < MIN_SIZE) {
      return;
    }
    const pageNumber = options.getPageNumber?.();
    if (!pageNumber) {
      return;
    }
    options.onCreate?.({
      pageNumber,
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height,
    });
  });

  overlayEl.addEventListener("pointercancel", (event) => {
    if (interaction && event.pointerId === interaction.pointerId) {
      frameEl?.classList.remove("is-dragging");
      interaction = null;
      return;
    }
    if (!draft || event.pointerId !== draft.pointerId) {
      return;
    }
    cancelDraft();
  });

  setMode("frame");

  // SelectionFrame の正本。app.js は複製を持たず、下記 API だけで読む / 指示する。
  return {
    setEnabled,
    setMode,
    renderPanels,
    clear,
    getFrame,
    resetFrame,
    clampFrame,
    setAspectLocked,
  };
}

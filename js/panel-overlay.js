const MIN_SIZE = 0.01;

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

export function createPanelOverlay(overlayEl, options) {
  let draft = null;
  let draftEl = null;

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

  function ensureDraftEl() {
    if (draftEl) {
      return draftEl;
    }
    draftEl = document.createElement("div");
    draftEl.className = "panel-draft";
    overlayEl.appendChild(draftEl);
    return draftEl;
  }

  function placeRect(element, rect) {
    element.style.left = toPercent(rect.x);
    element.style.top = toPercent(rect.y);
    element.style.width = toPercent(rect.width);
    element.style.height = toPercent(rect.height);
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

  function setEnabled(enabled) {
    overlayEl.classList.toggle("is-enabled", enabled);
    if (!enabled) {
      cancelDraft();
    }
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
  }

  function clear() {
    cancelDraft();
    overlayEl.querySelectorAll(".panel-rect").forEach((element) => {
      element.remove();
    });
  }

  overlayEl.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) {
      return;
    }
    if (!isEnabled()) {
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
    if (!draft || event.pointerId !== draft.pointerId) {
      return;
    }
    const point = clientToRelative(event);
    draft.currentX = point.x;
    draft.currentY = point.y;
    updateDraftEl();
  });

  overlayEl.addEventListener("pointerup", (event) => {
    if (!draft || event.pointerId !== draft.pointerId) {
      return;
    }
    const point = clientToRelative(event);
    const rect = normalizeRect(draft.startX, draft.startY, point.x, point.y);
    cancelDraft();
    if (!isEnabled()) {
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
    if (!draft || event.pointerId !== draft.pointerId) {
      return;
    }
    cancelDraft();
  });

  return {
    setEnabled,
    renderPanels,
    clear,
  };
}

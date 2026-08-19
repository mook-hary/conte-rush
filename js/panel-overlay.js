export const MIN_SIZE = 0.01;

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

function clampRect(x, y, width, height) {
  const size = clampSize(width, height);
  return {
    x: Math.min(Math.max(0, x), 1 - size.width),
    y: Math.min(Math.max(0, y), 1 - size.height),
    width: size.width,
    height: size.height,
  };
}

export function createPanelOverlay(overlayEl, options) {
  let mode = "drag";
  let draft = null;
  let draftEl = null;
  let candidate = null;
  let candidateEl = null;

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

  function ensureCandidateEl() {
    if (candidateEl) {
      return candidateEl;
    }
    candidateEl = document.createElement("div");
    candidateEl.className = "panel-candidate";
    overlayEl.appendChild(candidateEl);
    return candidateEl;
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

  function notifyCandidateChange() {
    options.onCandidateChange?.(candidate);
  }

  function updateCandidateEl() {
    if (!candidate) {
      return;
    }
    placeRect(ensureCandidateEl(), candidate);
  }

  function cancelDraft() {
    draft = null;
    if (draftEl) {
      draftEl.remove();
      draftEl = null;
    }
  }

  function clearCandidate() {
    candidate = null;
    if (candidateEl) {
      candidateEl.remove();
      candidateEl = null;
    }
    notifyCandidateChange();
  }

  function getCandidate() {
    return candidate ? { ...candidate } : null;
  }

  function hasCandidate() {
    return Boolean(candidate);
  }

  function placeCandidateAt(cx, cy, size) {
    if (!size) {
      return null;
    }
    candidate = clampRect(
      cx - size.width / 2,
      cy - size.height / 2,
      size.width,
      size.height,
    );
    updateCandidateEl();
    notifyCandidateChange();
    return getCandidate();
  }

  function resizeCandidate(size) {
    if (!candidate || !size) {
      return getCandidate();
    }
    const centerX = candidate.x + candidate.width / 2;
    const centerY = candidate.y + candidate.height / 2;
    candidate = clampRect(
      centerX - size.width / 2,
      centerY - size.height / 2,
      size.width,
      size.height,
    );
    updateCandidateEl();
    notifyCandidateChange();
    return getCandidate();
  }

  function setMode(nextMode) {
    mode = nextMode === "stamp" ? "stamp" : "drag";
    overlayEl.classList.toggle("is-stamp", mode === "stamp");
    if (mode === "drag") {
      clearCandidate();
    } else {
      cancelDraft();
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
    if (candidateEl) {
      overlayEl.appendChild(candidateEl);
    }
  }

  function clear() {
    cancelDraft();
    clearCandidate();
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
    if (mode === "stamp") {
      event.preventDefault();
      const point = clientToRelative(event);
      const size = options.getTemplate?.();
      if (!size) {
        return;
      }
      placeCandidateAt(point.x, point.y, size);
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
    if (!draft || event.pointerId !== draft.pointerId) {
      return;
    }
    cancelDraft();
  });

  return {
    setEnabled,
    setMode,
    renderPanels,
    clear,
    clearCandidate,
    getCandidate,
    hasCandidate,
    placeCandidateAt,
    resizeCandidate,
  };
}

import { formatFrameTime, formatFrameTimeLabel } from "./duration.js?v=m54-3";

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

const DRAG_THRESHOLD_PX = 4;

export function frameToRatio(startFrame, durationFrames) {
  if (!Number.isFinite(durationFrames) || durationFrames <= 0) {
    return 0;
  }
  return startFrame / durationFrames;
}

export function xToFrame(x, width, durationFrames) {
  if (!Number.isFinite(durationFrames) || durationFrames <= 1) {
    return 0;
  }
  const ratio = clamp(x / Math.max(width, 1), 0, 1);
  const rounded = Math.round(ratio * durationFrames);
  return clamp(rounded, 0, durationFrames - 1);
}

export function createTimelineEditor(rootEl, options) {
  const emptyEl = rootEl.querySelector("[data-role='empty']");
  const bodyEl = rootEl.querySelector("[data-role='body']");
  const metaEl = rootEl.querySelector("[data-role='meta']");
  const statusEl = rootEl.querySelector("[data-role='status']");
  const startEl = rootEl.querySelector("[data-role='start']");
  const endEl = rootEl.querySelector("[data-role='end']");
  const trackEl = rootEl.querySelector("[data-role='track']");
  const rangesEl = rootEl.querySelector("[data-role='ranges']");

  let view = null;
  let drag = null;
  let trackGesture = null;
  let placePreviewEl = null;

  function isDragging() {
    return Boolean(drag?.moved);
  }

  function isBusy() {
    return Boolean(drag || trackGesture);
  }

  function markerLeft(startFrame, durationFrames) {
    return `${frameToRatio(startFrame, durationFrames) * 100}%`;
  }

  function clientXToFrame(clientX) {
    if (!view) {
      return 0;
    }
    const bounds = trackEl.getBoundingClientRect();
    return xToFrame(clientX - bounds.left, bounds.width, view.durationFrames);
  }

  function isPointOnTrack(clientX, clientY) {
    const bounds = trackEl.getBoundingClientRect();
    return (
      clientX >= bounds.left &&
      clientX <= bounds.right &&
      clientY >= bounds.top &&
      clientY <= bounds.bottom
    );
  }

  function fillRulerLabel(element, frame) {
    if (!element) {
      return;
    }
    element.replaceChildren();
    const timeEl = document.createElement("span");
    timeEl.textContent = formatFrameTime(frame);
    const framesEl = document.createElement("span");
    framesEl.textContent = `${frame}f`;
    element.append(timeEl, framesEl);
  }

  function fillMarkerTime(element, startFrame) {
    const timeEl = element.querySelector("[data-role='time']");
    const frameEl = element.querySelector("[data-role='frame']");
    if (timeEl) {
      timeEl.textContent = formatFrameTime(startFrame);
    }
    if (frameEl) {
      frameEl.textContent = `${startFrame}f`;
    }
    const label = element.querySelector(".cut-timeline-label")?.textContent ?? "";
    element.title = `${label} ${formatFrameTimeLabel(startFrame)}`.trim();
  }

  function updateMarkerEl(element, startFrame) {
    if (!view) {
      return;
    }
    element.style.left = markerLeft(startFrame, view.durationFrames);
    fillMarkerTime(element, startFrame);
  }

  function findMarker(panelId) {
    return trackEl.querySelector(`[data-panel-id="${CSS.escape(panelId)}"]`);
  }

  function restoreSavedMarker() {
    if (!drag || !view) {
      return;
    }
    const marker = findMarker(drag.panelId);
    if (marker) {
      updateMarkerEl(marker, drag.savedFrame);
    }
  }

  function capturePointer(element, pointerId) {
    try {
      element.setPointerCapture(pointerId);
    } catch {
      // 実ポインタがない合成イベントでは失敗する。
    }
  }

  function endDragSession() {
    if (!drag) {
      return null;
    }
    const ended = drag;
    drag = null;
    if (ended.element.hasPointerCapture?.(ended.pointerId)) {
      ended.element.releasePointerCapture(ended.pointerId);
    }
    return ended;
  }

  function cancelDrag() {
    if (!drag) {
      return false;
    }
    const { panelId, savedFrame, moved } = drag;
    restoreSavedMarker();
    drag.element.classList.remove("is-dragging");
    endDragSession();
    if (moved) {
      options.onCancel?.({ panelId, savedFrame });
    }
    return true;
  }

  function clearPlacePreview() {
    if (placePreviewEl) {
      placePreviewEl.remove();
      placePreviewEl = null;
    }
  }

  function setPlacePreview(frame) {
    if (!view || !Number.isInteger(frame)) {
      clearPlacePreview();
      return;
    }
    if (!placePreviewEl) {
      placePreviewEl = document.createElement("div");
      placePreviewEl.className = "cut-timeline-place-preview";
      trackEl.append(placePreviewEl);
    }
    placePreviewEl.style.left = markerLeft(frame, view.durationFrames);
    placePreviewEl.dataset.frame = String(frame);
  }

  function applySelectedClass() {
    const selectedId = view?.selectedPanelId ?? null;
    trackEl.querySelectorAll(".cut-timeline-marker").forEach((element) => {
      element.classList.toggle(
        "is-selected",
        Boolean(selectedId) && element.dataset.panelId === selectedId,
      );
    });
  }

  function createMarkerEl(marker) {
    const element = document.createElement("button");
    element.type = "button";
    element.className = "cut-timeline-marker";
    element.dataset.panelId = marker.panelId;
    element.style.left = markerLeft(marker.startFrame, view.durationFrames);

    const tick = document.createElement("span");
    tick.className = "cut-timeline-tick";

    const card = document.createElement("span");
    card.className = "cut-timeline-card";

    if (marker.thumbUrl) {
      const image = document.createElement("img");
      image.alt = "";
      image.src = marker.thumbUrl;
      card.append(image);
    }

    const labelEl = document.createElement("span");
    labelEl.className = "cut-timeline-label";
    labelEl.textContent = marker.label;

    const timeEl = document.createElement("span");
    timeEl.className = "cut-timeline-time";
    timeEl.dataset.role = "time";

    const frameEl = document.createElement("span");
    frameEl.className = "cut-timeline-frame";
    frameEl.dataset.role = "frame";

    card.append(labelEl, timeEl, frameEl);
    element.append(tick, card);
    fillMarkerTime(element, marker.startFrame);

    element.addEventListener("pointerdown", (event) => {
      if (event.button !== 0 || !view) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      if (drag) {
        cancelDrag();
      }
      trackGesture = null;
      drag = {
        panelId: marker.panelId,
        savedFrame: marker.startFrame,
        pointerId: event.pointerId,
        element,
        startX: event.clientX,
        startY: event.clientY,
        moved: false,
      };
      capturePointer(element, event.pointerId);
      options.onSelect?.({ panelId: marker.panelId });
    });

    element.addEventListener("pointermove", (event) => {
      if (!drag || event.pointerId !== drag.pointerId || drag.element !== element || !view) {
        return;
      }
      const distance = Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY);
      if (!drag.moved && distance < DRAG_THRESHOLD_PX) {
        return;
      }
      drag.moved = true;
      element.classList.add("is-dragging");
      const candidateFrame = clientXToFrame(event.clientX);
      updateMarkerEl(element, candidateFrame);
      options.onPreview?.({
        panelId: drag.panelId,
        candidateFrame,
      });
    });

    element.addEventListener("pointerup", (event) => {
      if (!drag || event.pointerId !== drag.pointerId || drag.element !== element || !view) {
        return;
      }
      const { panelId, savedFrame, moved } = drag;
      element.classList.remove("is-dragging");
      endDragSession();
      if (!moved) {
        return;
      }
      const candidateFrame = clientXToFrame(event.clientX);
      options.onCommit?.({
        cutId: view.cutId,
        panelId,
        candidateFrame,
        savedFrame,
      });
    });

    element.addEventListener("pointercancel", (event) => {
      if (!drag || event.pointerId !== drag.pointerId || drag.element !== element) {
        return;
      }
      cancelDrag();
    });

    return element;
  }

  function render(nextView) {
    if (isBusy()) {
      return;
    }
    view = nextView;
    if (!view) {
      emptyEl.hidden = false;
      bodyEl.hidden = true;
      trackEl.replaceChildren();
      rangesEl.replaceChildren();
      metaEl.textContent = "";
      statusEl.textContent = "";
      startEl?.replaceChildren();
      endEl?.replaceChildren();
      clearPlacePreview();
      return;
    }

    emptyEl.hidden = true;
    bodyEl.hidden = false;
    metaEl.textContent = view.metaText;
    statusEl.textContent = view.statusText;
    statusEl.classList.toggle("is-complete", view.complete);
    statusEl.classList.toggle("is-incomplete", !view.complete);
    fillRulerLabel(startEl, 0);
    fillRulerLabel(endEl, view.durationFrames);
    trackEl.classList.toggle("is-placing", Boolean(view.placing));

    trackEl.replaceChildren();
    for (const marker of view.markers) {
      trackEl.append(createMarkerEl(marker));
    }
    applySelectedClass();

    rangesEl.replaceChildren();
    if (view.ranges.length === 0) {
      const empty = document.createElement("li");
      empty.textContent = "配置はまだありません";
      rangesEl.append(empty);
      return;
    }
    for (const range of view.ranges) {
      const item = document.createElement("li");
      item.textContent = range.text;
      rangesEl.append(item);
    }
  }

  function clear() {
    if (drag) {
      endDragSession();
    }
    trackGesture = null;
    render(null);
  }

  trackEl.addEventListener("pointerdown", (event) => {
    if (event.button !== 0 || !view) {
      return;
    }
    if (event.target.closest(".cut-timeline-marker")) {
      return;
    }
    trackGesture = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
    };
    capturePointer(trackEl, event.pointerId);
    const frame = clientXToFrame(event.clientX);
    setPlacePreview(frame);
    options.onTrackPreview?.({ frame });
  });

  trackEl.addEventListener("pointermove", (event) => {
    if (!trackGesture || event.pointerId !== trackGesture.pointerId || !view) {
      return;
    }
    const frame = clientXToFrame(event.clientX);
    setPlacePreview(frame);
    options.onTrackPreview?.({ frame });
  });

  trackEl.addEventListener("pointerup", (event) => {
    if (!trackGesture || event.pointerId !== trackGesture.pointerId) {
      return;
    }
    trackGesture = null;
    if (trackEl.hasPointerCapture?.(event.pointerId)) {
      trackEl.releasePointerCapture(event.pointerId);
    }
    if (!view || drag) {
      clearPlacePreview();
      return;
    }
    const frame = clientXToFrame(event.clientX);
    clearPlacePreview();
    options.onTrackPlace?.({ frame });
  });

  trackEl.addEventListener("pointercancel", (event) => {
    if (!trackGesture || event.pointerId !== trackGesture.pointerId) {
      return;
    }
    trackGesture = null;
    clearPlacePreview();
  });

  window.addEventListener(
    "keydown",
    (event) => {
      if (event.key !== "Escape") {
        return;
      }
      if (drag) {
        event.preventDefault();
        event.stopImmediatePropagation();
        cancelDrag();
        return;
      }
      if (trackGesture) {
        event.preventDefault();
        trackGesture = null;
        clearPlacePreview();
      }
    },
    true,
  );

  return {
    render,
    clear,
    isDragging,
    isBusy,
    cancelDrag,
    frameAtClientX: clientXToFrame,
    isPointOnTrack,
    setPlacePreview,
  };
}

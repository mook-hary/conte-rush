function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

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
  const endEl = rootEl.querySelector("[data-role='end']");
  const trackEl = rootEl.querySelector("[data-role='track']");
  const rangesEl = rootEl.querySelector("[data-role='ranges']");

  let view = null;
  let drag = null;

  function isDragging() {
    return Boolean(drag);
  }

  function markerLeft(startFrame, durationFrames) {
    return `${frameToRatio(startFrame, durationFrames) * 100}%`;
  }

  function clientXToFrame(clientX) {
    const bounds = trackEl.getBoundingClientRect();
    return xToFrame(clientX - bounds.left, bounds.width, view.durationFrames);
  }

  function updateMarkerEl(element, startFrame) {
    element.style.left = markerLeft(startFrame, view.durationFrames);
    const frameEl = element.querySelector("[data-role='frame']");
    if (frameEl) {
      frameEl.textContent = `${startFrame}f`;
    }
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
    const { panelId, savedFrame } = drag;
    restoreSavedMarker();
    endDragSession();
    options.onCancel?.({ panelId, savedFrame });
    return true;
  }

  function createMarkerEl(marker) {
    const element = document.createElement("button");
    element.type = "button";
    element.className = "cut-timeline-marker";
    element.dataset.panelId = marker.panelId;
    element.style.left = markerLeft(marker.startFrame, view.durationFrames);
    element.title = `${marker.label} ${marker.startFrame}f`;

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

    const frameEl = document.createElement("span");
    frameEl.className = "cut-timeline-frame";
    frameEl.dataset.role = "frame";
    frameEl.textContent = `${marker.startFrame}f`;

    card.append(labelEl, frameEl);
    element.append(tick, card);

    element.addEventListener("pointerdown", (event) => {
      if (event.button !== 0 || !view) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      if (drag) {
        cancelDrag();
      }
      drag = {
        panelId: marker.panelId,
        savedFrame: marker.startFrame,
        pointerId: event.pointerId,
        element,
      };
      element.classList.add("is-dragging");
      element.setPointerCapture(event.pointerId);
      const candidateFrame = clientXToFrame(event.clientX);
      updateMarkerEl(element, candidateFrame);
      options.onPreview?.({
        panelId: marker.panelId,
        candidateFrame,
      });
    });

    element.addEventListener("pointermove", (event) => {
      if (!drag || event.pointerId !== drag.pointerId || drag.element !== element || !view) {
        return;
      }
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
      const candidateFrame = clientXToFrame(event.clientX);
      const { panelId, savedFrame } = drag;
      element.classList.remove("is-dragging");
      endDragSession();
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
      element.classList.remove("is-dragging");
      cancelDrag();
    });

    return element;
  }

  function render(nextView) {
    if (drag) {
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
      endEl.textContent = "";
      return;
    }

    emptyEl.hidden = true;
    bodyEl.hidden = false;
    metaEl.textContent = view.metaText;
    statusEl.textContent = view.statusText;
    statusEl.classList.toggle("is-complete", view.complete);
    statusEl.classList.toggle("is-incomplete", !view.complete);
    endEl.textContent = view.endLabel;

    trackEl.replaceChildren();
    for (const marker of view.markers) {
      trackEl.append(createMarkerEl(marker));
    }

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
    render(null);
  }

  window.addEventListener(
    "keydown",
    (event) => {
      if (event.key !== "Escape" || !drag) {
        return;
      }
      event.preventDefault();
      event.stopImmediatePropagation();
      drag.element.classList.remove("is-dragging");
      cancelDrag();
    },
    true,
  );

  return {
    render,
    clear,
    isDragging,
    cancelDrag,
  };
}

import { formatDuration } from "./duration.js?v=m8-1";
import { parseFixFrames } from "./motion-store.js?v=m9-3";
import {
  OUTPUT_ASPECT,
  clampPose,
  poseToSourceRect,
  presetPoses,
  sourceRectToPose,
} from "./frame-renderer.js";

function clonePose(pose) {
  if (!pose) {
    return null;
  }
  return { x: pose.x, y: pose.y, scale: pose.scale };
}

function pointerToNorm(event, imageEl) {
  const bounds = imageEl.getBoundingClientRect();
  return {
    x: (event.clientX - bounds.left) / Math.max(bounds.width, 1),
    y: (event.clientY - bounds.top) / Math.max(bounds.height, 1),
  };
}

function applyRect(element, sx, sy, sw, sh, imageWidth, imageHeight) {
  element.style.left = `${(sx / imageWidth) * 100}%`;
  element.style.top = `${(sy / imageHeight) * 100}%`;
  element.style.width = `${(sw / imageWidth) * 100}%`;
  element.style.height = `${(sh / imageHeight) * 100}%`;
}

function resizePose(pose, imageWidth, imageHeight, corner, point) {
  const rect = poseToSourceRect(pose, imageWidth, imageHeight);
  const attachLeft = corner.includes("e");
  const attachTop = corner.includes("s");
  const fixedX = attachLeft ? rect.sx : rect.sx + rect.sw;
  const fixedY = attachTop ? rect.sy : rect.sy + rect.sh;
  const px = point.x * imageWidth;
  const py = point.y * imageHeight;
  const maxWidth = attachLeft ? imageWidth - fixedX : fixedX;
  const maxHeight = attachTop ? imageHeight - fixedY : fixedY;
  if (maxWidth < 2 || maxHeight < 2) {
    return pose;
  }
  let pixelW = Math.max(2, Math.abs(px - fixedX));
  let pixelH = pixelW / OUTPUT_ASPECT;
  if (pixelH < Math.abs(py - fixedY)) {
    pixelH = Math.max(2, Math.abs(py - fixedY));
    pixelW = pixelH * OUTPUT_ASPECT;
  }
  const fit = Math.min(1, maxWidth / pixelW, maxHeight / pixelH);
  pixelW *= fit;
  pixelH *= fit;
  const sx = attachLeft ? fixedX : fixedX - pixelW;
  const sy = attachTop ? fixedY : fixedY - pixelH;
  return sourceRectToPose(sx, sy, pixelW, pixelH, imageWidth, imageHeight);
}

export function createMotionEditor(rootEl, options) {
  const statusEl = rootEl.querySelector("[data-role='status']");
  const rowsEl = rootEl.querySelector("[data-role='rows']");
  const stageWrapEl = rootEl.querySelector("[data-role='stage-wrap']");
  const emptyEl = rootEl.querySelector("[data-role='empty']");
  const imageEl = rootEl.querySelector("[data-role='image']");
  const startEl = rootEl.querySelector("[data-role='start']");
  const endEl = rootEl.querySelector("[data-role='end']");
  const hintEl = rootEl.querySelector("[data-role='hint']");
  const targetStatusEl = rootEl.querySelector("[data-role='target-status']");
  const preFixInput = rootEl.querySelector("[data-role='pre-fix']");
  const postFixInput = rootEl.querySelector("[data-role='post-fix']");
  const preFixHintEl = rootEl.querySelector("[data-role='pre-fix-hint']");
  const postFixHintEl = rootEl.querySelector("[data-role='post-fix-hint']");
  const fixMessageEl = rootEl.querySelector("[data-role='fix-message']");
  const presetButtons = [...rootEl.querySelectorAll("[data-preset]")];
  const targetButtons = [...rootEl.querySelectorAll("[data-target]")];

  let view = null;
  let draftFrom = null;
  let draftTo = null;
  let activeKey = "start";
  let lastPanelId = null;
  let drag = null;

  function currentFrom() {
    return draftFrom ?? view?.from ?? null;
  }

  function currentTo() {
    return draftTo ?? view?.to ?? null;
  }

  function isBusy() {
    return Boolean(drag);
  }

  function imageSize() {
    const width = imageEl.naturalWidth || view?.imageWidth || 0;
    const height = imageEl.naturalHeight || view?.imageHeight || 0;
    return { width, height };
  }

  function placeFrame(element, pose) {
    const { width, height } = imageSize();
    if (!view || !pose || width < 1 || height < 1) {
      element.hidden = true;
      return;
    }
    const rect = poseToSourceRect(pose, width, height);
    applyRect(element, rect.sx, rect.sy, rect.sw, rect.sh, width, height);
    element.hidden = false;
  }

  function updateTargetUi() {
    const editingStart = activeKey === "start";
    startEl.classList.toggle("is-editing", editingStart);
    startEl.classList.toggle("is-idle", !editingStart);
    endEl.classList.toggle("is-editing", !editingStart);
    endEl.classList.toggle("is-idle", editingStart);
    startEl.classList.toggle("is-active", editingStart);
    endEl.classList.toggle("is-active", !editingStart);
    if (targetStatusEl) {
      targetStatusEl.textContent = editingStart ? "編集中: START" : "編集中: END";
    }
    for (const button of targetButtons) {
      const selected = button.dataset.target === activeKey;
      button.setAttribute("aria-pressed", selected ? "true" : "false");
      button.classList.toggle("is-selected", selected);
    }
  }

  function setActiveKey(nextKey) {
    activeKey = nextKey === "end" ? "end" : "start";
    updateTargetUi();
  }

  function updateFrames() {
    const from = currentFrom();
    const to = currentTo();
    const show = Boolean(view?.imageUrl && from && to);
    updateTargetUi();
    if (!show) {
      startEl.hidden = true;
      endEl.hidden = true;
      return;
    }
    placeFrame(startEl, from);
    placeFrame(endEl, to);
  }

  function emitSelect(panelId) {
    options.onSelect?.({ panelId });
  }

  function commitDraft() {
    if (!view || view.blocked || !view.editable) {
      return;
    }
    const from = currentFrom();
    const to = currentTo();
    if (!from || !to) {
      return;
    }
    options.onCommit?.({
      cutId: view.cutId,
      panelId: view.panelId,
      from,
      to,
      preFixFrames: view.preFixFrames ?? 0,
      postFixFrames: view.postFixFrames ?? 0,
    });
  }

  function fixHint(value) {
    return `= ${formatDuration(Number.isInteger(value) ? value : 0)}`;
  }

  function storedFixValue(key) {
    return Number.isInteger(view?.[key]) && view[key] >= 0 ? view[key] : 0;
  }

  function syncFixInputs() {
    const enabled = Boolean(view?.hasMotion && view.editable && !view.blocked);
    for (const input of [preFixInput, postFixInput]) {
      if (!input) {
        continue;
      }
      input.disabled = !enabled;
    }
    if (preFixHintEl) {
      preFixHintEl.textContent = fixHint(storedFixValue("preFixFrames"));
    }
    if (postFixHintEl) {
      postFixHintEl.textContent = fixHint(storedFixValue("postFixFrames"));
    }
    if (preFixInput && document.activeElement !== preFixInput) {
      preFixInput.value = String(storedFixValue("preFixFrames"));
    }
    if (postFixInput && document.activeElement !== postFixInput) {
      postFixInput.value = String(storedFixValue("postFixFrames"));
    }
    if (fixMessageEl && document.activeElement !== preFixInput && document.activeElement !== postFixInput) {
      fixMessageEl.textContent = view?.fixMessage ?? "";
    }
  }

  function commitFixFromInputs() {
    if (!view || view.blocked || !view.editable || !view.hasMotion) {
      syncFixInputs();
      return;
    }
    const pre = parseFixFrames(preFixInput?.value);
    const post = parseFixFrames(postFixInput?.value);
    if (!pre.ok || !post.ok) {
      if (fixMessageEl) {
        fixMessageEl.textContent = pre.ok ? post.message : pre.message;
      }
      syncFixInputs();
      return;
    }
    if (preFixHintEl) {
      preFixHintEl.textContent = fixHint(pre.value);
    }
    if (postFixHintEl) {
      postFixHintEl.textContent = fixHint(post.value);
    }
    options.onCommit?.({
      cutId: view.cutId,
      panelId: view.panelId,
      from: currentFrom() ?? view.from,
      to: currentTo() ?? view.to,
      preFixFrames: pre.value,
      postFixFrames: post.value,
    });
  }

  function onPointerDown(event) {
    if (!view?.editable || view.blocked || !view.imageUrl) {
      return;
    }
    const handle = event.target.closest?.("[data-corner]");
    const frameEl = event.target.closest?.("[data-frame]");
    if (!frameEl || event.button !== 0) {
      return;
    }
    if (frameEl.dataset.frame !== activeKey) {
      return;
    }
    event.preventDefault();
    const pose = activeKey === "start" ? currentFrom() : currentTo();
    if (!pose) {
      return;
    }
    drag = {
      key: activeKey,
      mode: handle ? "resize" : "move",
      corner: handle?.dataset.corner ?? null,
      origin: pointerToNorm(event, imageEl),
      startPose: clonePose(pose),
    };
    frameEl.classList.add("is-dragging");
    try {
      frameEl.setPointerCapture(event.pointerId);
    } catch {
      // capture is optional
    }
    updateFrames();
  }

  function onPointerMove(event) {
    if (!drag || !view) {
      return;
    }
    const { width, height } = imageSize();
    if (width < 1 || height < 1) {
      return;
    }
    const point = pointerToNorm(event, imageEl);
    let next;
    if (drag.mode === "move") {
      next = clampPose(
        {
          x: drag.startPose.x + (point.x - drag.origin.x),
          y: drag.startPose.y + (point.y - drag.origin.y),
          scale: drag.startPose.scale,
        },
        width,
        height,
      );
    } else {
      next = resizePose(
        drag.startPose,
        width,
        height,
        drag.corner,
        point,
      );
    }
    if (drag.key === "start") {
      draftFrom = next;
    } else {
      draftTo = next;
    }
    updateFrames();
  }

  function endDrag(event, cancelled) {
    if (!drag) {
      return;
    }
    const frameEl = drag.key === "start" ? startEl : endEl;
    frameEl.classList.remove("is-dragging");
    if (event && frameEl.hasPointerCapture?.(event.pointerId)) {
      try {
        frameEl.releasePointerCapture(event.pointerId);
      } catch {
        // ignore
      }
    }
    drag = null;
    if (cancelled) {
      draftFrom = null;
      draftTo = null;
      updateFrames();
      return;
    }
    commitDraft();
    draftFrom = null;
    draftTo = null;
  }

  function render(nextView) {
    if (drag) {
      return;
    }
    view = nextView;
    draftFrom = null;
    draftTo = null;
    if (!nextView?.panelId || nextView.panelId !== lastPanelId) {
      activeKey = "start";
      lastPanelId = nextView?.panelId ?? null;
    }
    statusEl.textContent = nextView?.statusText ?? "";
    hintEl.textContent = nextView?.hintText ?? "";
    rowsEl.replaceChildren();
    if (!nextView) {
      emptyEl.hidden = false;
      stageWrapEl.hidden = true;
      imageEl.removeAttribute("src");
      startEl.hidden = true;
      endEl.hidden = true;
      syncFixInputs();
      return;
    }
    emptyEl.hidden = true;
    stageWrapEl.hidden = false;
    for (const row of nextView.rows ?? []) {
      const item = document.createElement("li");
      item.className = "motion-row";
      if (row.panelId === nextView.panelId) {
        item.classList.add("is-selected");
      }
      item.tabIndex = 0;
      const name = document.createElement("span");
      name.textContent = row.label;
      const kind = document.createElement("span");
      kind.className = "motion-row-kind";
      kind.textContent = row.kind;
      item.append(name, kind);
      item.addEventListener("click", () => emitSelect(row.panelId));
      item.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          emitSelect(row.panelId);
        }
      });
      rowsEl.append(item);
    }
    for (const button of presetButtons) {
      const preset = button.dataset.preset;
      const none = preset === "none";
      button.disabled = nextView.blocked || (!nextView.editable && !none);
      if (none) {
        button.disabled = nextView.blocked || !nextView.hasMotion;
      }
    }
    if (nextView.imageUrl && imageEl.dataset.url !== nextView.imageUrl) {
      imageEl.dataset.url = nextView.imageUrl;
      imageEl.src = nextView.imageUrl;
    }
    if (!nextView.imageUrl) {
      imageEl.removeAttribute("src");
      delete imageEl.dataset.url;
    }
    updateFrames();
    syncFixInputs();
  }

  startEl.addEventListener("pointerdown", onPointerDown);
  endEl.addEventListener("pointerdown", onPointerDown);
  startEl.addEventListener("pointermove", onPointerMove);
  endEl.addEventListener("pointermove", onPointerMove);
  startEl.addEventListener("pointerup", (event) => endDrag(event, false));
  endEl.addEventListener("pointerup", (event) => endDrag(event, false));
  startEl.addEventListener("pointercancel", (event) => endDrag(event, true));
  endEl.addEventListener("pointercancel", (event) => endDrag(event, true));
  imageEl.addEventListener("load", () => {
    updateFrames();
  });

  for (const button of targetButtons) {
    button.addEventListener("click", () => {
      setActiveKey(button.dataset.target);
    });
  }

  function onFixInput(input, hintEl) {
    const parsed = parseFixFrames(input.value);
    if (hintEl) {
      hintEl.textContent = parsed.ok ? fixHint(parsed.value) : "= —";
    }
  }

  preFixInput?.addEventListener("input", () => {
    onFixInput(preFixInput, preFixHintEl);
  });
  postFixInput?.addEventListener("input", () => {
    onFixInput(postFixInput, postFixHintEl);
  });
  preFixInput?.addEventListener("change", () => {
    commitFixFromInputs();
  });
  postFixInput?.addEventListener("change", () => {
    commitFixFromInputs();
  });
  preFixInput?.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      preFixInput.blur();
    }
  });
  postFixInput?.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      postFixInput.blur();
    }
  });

  for (const button of presetButtons) {
    button.addEventListener("click", () => {
      if (!view || view.blocked) {
        return;
      }
      const preset = button.dataset.preset;
      if (preset === "none") {
        options.onDelete?.({ cutId: view.cutId, panelId: view.panelId });
        return;
      }
      if (!view.editable) {
        return;
      }
      const { width, height } = imageSize();
      if (width < 1 || height < 1) {
        return;
      }
      const poses = presetPoses(preset, width, height);
      options.onCommit?.({
        cutId: view.cutId,
        panelId: view.panelId,
        from: poses.from,
        to: poses.to,
        preFixFrames: view.preFixFrames ?? 0,
        postFixFrames: view.postFixFrames ?? 0,
      });
    });
  }

  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && drag) {
      endDrag(null, true);
    }
  });

  return {
    render,
    isBusy,
    clear() {
      drag = null;
      activeKey = "start";
      lastPanelId = null;
      render(null);
    },
  };
}

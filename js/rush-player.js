import { FRAMES_PER_SECOND } from "./duration.js";
import { isTimelineComplete } from "./timeline-store.js";

function clonePlacement(placement) {
  return {
    panelId: placement.panelId,
    startFrame: placement.startFrame,
  };
}

function sortPlacements(placements) {
  return placements.map(clonePlacement).sort((a, b) => a.startFrame - b.startFrame);
}

export function describeIncomplete(cut, timeline) {
  if (!cut) {
    return "Cutが見つかりません。";
  }
  if (cut.panelIds.length === 0) {
    return "所属Panelがありません。";
  }
  if (!timeline) {
    return "Timelineが未作成です。";
  }

  const placedIds = new Set(timeline.placements.map((item) => item.panelId));
  if (cut.panelIds.some((panelId) => !placedIds.has(panelId))) {
    return "未配置のPanelがあります。";
  }
  if (timeline.placements.some((item) => !cut.panelIds.includes(item.panelId))) {
    return "所属外のPanelが配置されています。";
  }
  if (!timeline.placements.some((item) => item.startFrame === 0)) {
    return "0fの配置がありません。";
  }
  if (!isTimelineComplete(cut, timeline)) {
    return "Timelineが未完成です。";
  }
  return null;
}

export function inspectCuts(cuts, getTimelineByCutId) {
  if (!cuts || cuts.length === 0) {
    return {
      ok: false,
      issues: [{ cutNumber: null, reason: "Cutがありません。" }],
    };
  }

  const issues = [];
  for (const cut of cuts) {
    const timeline = getTimelineByCutId(cut.id);
    if (isTimelineComplete(cut, timeline)) {
      continue;
    }
    issues.push({
      cutId: cut.id,
      cutNumber: cut.cutNumber,
      reason: describeIncomplete(cut, timeline) ?? "Timelineが未完成です。",
    });
  }

  if (issues.length > 0) {
    return { ok: false, issues };
  }
  return { ok: true, issues: [] };
}

export function buildSnapshot(cuts, getTimelineByCutId) {
  let globalStart = 0;
  const segments = [];

  for (const cut of cuts) {
    const timeline = getTimelineByCutId(cut.id);
    const durationFrames = cut.durationFrames;
    segments.push({
      cutId: cut.id,
      cutNumber: cut.cutNumber,
      durationFrames,
      globalStart,
      globalEndExclusive: globalStart + durationFrames,
      placements: sortPlacements(timeline?.placements ?? []),
    });
    globalStart += durationFrames;
  }

  return {
    totalFrames: globalStart,
    segments,
  };
}

export function uniquePanelIds(snapshot) {
  const ids = [];
  const seen = new Set();
  if (!snapshot) {
    return ids;
  }
  for (const segment of snapshot.segments) {
    for (const placement of segment.placements) {
      if (seen.has(placement.panelId)) {
        continue;
      }
      seen.add(placement.panelId);
      ids.push(placement.panelId);
    }
  }
  return ids;
}

export function cutNumberForPanel(snapshot, panelId) {
  if (!snapshot) {
    return null;
  }
  const segment = snapshot.segments.find((item) =>
    item.placements.some((placement) => placement.panelId === panelId),
  );
  return segment?.cutNumber ?? null;
}

export function resolveFrame(snapshot, globalFrame) {
  if (!snapshot || snapshot.totalFrames < 1 || snapshot.segments.length === 0) {
    return null;
  }

  const clamped = Math.min(
    Math.max(0, globalFrame),
    snapshot.totalFrames - 1,
  );
  const segment = snapshot.segments.find(
    (item) => clamped >= item.globalStart && clamped < item.globalEndExclusive,
  );
  if (!segment) {
    return null;
  }

  const localFrame = clamped - segment.globalStart;
  let chosen = null;
  for (const placement of segment.placements) {
    if (placement.startFrame <= localFrame) {
      chosen = placement;
    } else {
      break;
    }
  }
  if (!chosen) {
    return null;
  }

  return {
    globalFrame: clamped,
    localFrame,
    totalFrames: snapshot.totalFrames,
    cutId: segment.cutId,
    cutNumber: segment.cutNumber,
    durationFrames: segment.durationFrames,
    panelId: chosen.panelId,
  };
}

export function createRushPlayer({ onFrame } = {}) {
  let snapshot = null;
  let currentFrame = 0;
  let playing = false;
  let dirty = false;
  let ended = false;
  let originMs = 0;
  let rafId = 0;

  function emit() {
    if (typeof onFrame !== "function") {
      return;
    }
    onFrame(resolveFrame(snapshot, currentFrame));
  }

  function stopClock() {
    playing = false;
    if (rafId) {
      cancelAnimationFrame(rafId);
      rafId = 0;
    }
  }

  function tick(now) {
    if (!playing || !snapshot) {
      return;
    }
    const elapsedFrames = Math.floor(
      ((now - originMs) * FRAMES_PER_SECOND) / 1000,
    );
    if (elapsedFrames >= snapshot.totalFrames) {
      currentFrame = snapshot.totalFrames - 1;
      ended = true;
      stopClock();
      emit();
      return;
    }
    if (elapsedFrames !== currentFrame) {
      currentFrame = elapsedFrames;
      emit();
    }
    rafId = requestAnimationFrame(tick);
  }

  function replaceSnapshot(nextSnapshot) {
    stopClock();
    snapshot = nextSnapshot;
    currentFrame = 0;
    dirty = false;
    ended = false;
  }

  function markDirty() {
    dirty = true;
  }

  function pause() {
    stopClock();
  }

  function resume() {
    if (!snapshot || snapshot.totalFrames < 1 || ended || dirty) {
      return false;
    }
    playing = true;
    originMs =
      performance.now() - (currentFrame * 1000) / FRAMES_PER_SECOND;
    emit();
    rafId = requestAnimationFrame(tick);
    return true;
  }

  function reset() {
    stopClock();
    ended = false;
    currentFrame = 0;
    if (snapshot) {
      emit();
    }
  }

  function discard() {
    stopClock();
    snapshot = null;
    currentFrame = 0;
    dirty = false;
    ended = false;
  }

  return {
    replaceSnapshot,
    markDirty,
    pause,
    resume,
    reset,
    discard,
    getSnapshot: () => snapshot,
    getCurrentFrame: () => currentFrame,
    isPlaying: () => playing,
    isDirty: () => dirty,
    hasEnded: () => ended,
    hasSnapshot: () => Boolean(snapshot),
  };
}

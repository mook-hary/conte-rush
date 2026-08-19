function clonePlacement(placement) {
  return {
    panelId: placement.panelId,
    startFrame: placement.startFrame,
  };
}

function cloneTimeline(timeline) {
  return {
    cutId: timeline.cutId,
    placements: timeline.placements.map(clonePlacement),
  };
}

function comparePlacements(a, b) {
  if (a.startFrame !== b.startFrame) {
    return a.startFrame - b.startFrame;
  }
  return 0;
}

function sortPlacements(placements) {
  return placements.map(clonePlacement).sort(comparePlacements);
}

export function parseStartFrameInput(raw) {
  const trimmed = String(raw ?? "").trim();
  if (!trimmed) {
    return { ok: false, message: "開始フレームを入力してください。" };
  }
  if (!/^-?[0-9]+$/.test(trimmed)) {
    return { ok: false, message: "開始フレームは整数で入力してください。" };
  }
  const startFrame = Number(trimmed);
  if (!Number.isInteger(startFrame)) {
    return { ok: false, message: "開始フレームは整数で入力してください。" };
  }
  return { ok: true, startFrame };
}

const EVEN_PLACE_FAIL_MESSAGE = "総尺が短いためPanelを均等配置できません";

export function evenPlacements(durationFrames, panelIds) {
  const count = panelIds.length;
  if (count < 1 || !Number.isInteger(durationFrames) || durationFrames < 1) {
    return { ok: false, message: EVEN_PLACE_FAIL_MESSAGE };
  }
  if (durationFrames < count) {
    return { ok: false, message: EVEN_PLACE_FAIL_MESSAGE };
  }

  const placements = panelIds.map((panelId, index) => ({
    panelId,
    startFrame: Math.floor((durationFrames * index) / count),
  }));
  const used = new Set();
  for (const item of placements) {
    if (
      !Number.isInteger(item.startFrame) ||
      item.startFrame < 0 ||
      item.startFrame >= durationFrames ||
      used.has(item.startFrame)
    ) {
      return { ok: false, message: EVEN_PLACE_FAIL_MESSAGE };
    }
    used.add(item.startFrame);
  }
  return { ok: true, placements };
}

export function validatePlacement({
  cut,
  timeline,
  panelId,
  startFrame,
  exceptPanelId = null,
}) {
  if (!cut) {
    return { ok: false, message: "Cutが見つかりません。" };
  }
  if (!Number.isInteger(startFrame)) {
    return { ok: false, message: "開始フレームは整数で入力してください。" };
  }
  if (startFrame < 0) {
    return { ok: false, message: "開始フレームは 0 以上にしてください。" };
  }
  if (startFrame >= cut.durationFrames) {
    return {
      ok: false,
      message: `開始フレームは総尺（${cut.durationFrames}f）未満にしてください。`,
    };
  }
  if (!cut.panelIds.includes(panelId)) {
    return { ok: false, message: "このCutに所属していないPanelです。" };
  }

  const placements = timeline?.placements ?? [];
  const others = placements.filter((item) => item.panelId !== exceptPanelId);
  if (others.some((item) => item.panelId === panelId)) {
    return { ok: false, message: "このPanelはすでに配置されています。" };
  }
  const duplicate = others.find((item) => item.startFrame === startFrame);
  if (duplicate) {
    return {
      ok: false,
      message: `開始フレーム ${startFrame}f は他のPanelと同じです。`,
    };
  }

  return { ok: true };
}

export function deriveRanges(cut, timeline) {
  if (!cut || !timeline) {
    return [];
  }
  const sorted = sortPlacements(timeline.placements);
  return sorted.map((placement, index) => {
    const endExclusive =
      index + 1 < sorted.length
        ? sorted[index + 1].startFrame
        : cut.durationFrames;
    return {
      panelId: placement.panelId,
      startFrame: placement.startFrame,
      endExclusive,
      lastFrame: endExclusive - 1,
    };
  });
}

export function isTimelineComplete(cut, timeline) {
  if (!cut || !timeline) {
    return false;
  }

  const { panelIds, durationFrames } = cut;
  const { placements } = timeline;

  if (placements.some((item) => !panelIds.includes(item.panelId))) {
    return false;
  }
  if (placements.length !== panelIds.length) {
    return false;
  }

  const placedIds = new Set();
  const startFrames = new Set();
  let hasZero = false;

  for (const placement of placements) {
    if (placedIds.has(placement.panelId)) {
      return false;
    }
    placedIds.add(placement.panelId);

    if (!Number.isInteger(placement.startFrame)) {
      return false;
    }
    if (placement.startFrame < 0 || placement.startFrame >= durationFrames) {
      return false;
    }
    if (startFrames.has(placement.startFrame)) {
      return false;
    }
    startFrames.add(placement.startFrame);
    if (placement.startFrame === 0) {
      hasZero = true;
    }
  }

  if (panelIds.some((panelId) => !placedIds.has(panelId))) {
    return false;
  }
  return hasZero;
}

export function createTimelineStore() {
  const timelines = new Map();

  function getByCutId(cutId) {
    const timeline = timelines.get(cutId);
    return timeline ? cloneTimeline(timeline) : null;
  }

  function create(cutId, placements = []) {
    if (timelines.has(cutId)) {
      return cloneTimeline(timelines.get(cutId));
    }
    const timeline = {
      cutId,
      placements: sortPlacements(placements),
    };
    timelines.set(cutId, timeline);
    return cloneTimeline(timeline);
  }

  function clear() {
    timelines.clear();
  }

  function removeByCutId(cutId) {
    return timelines.delete(cutId);
  }

  function addPlacement(cutId, { panelId, startFrame }, cut) {
    const current = timelines.get(cutId) ?? { cutId, placements: [] };
    const result = validatePlacement({
      cut,
      timeline: current,
      panelId,
      startFrame,
      exceptPanelId: null,
    });
    if (!result.ok) {
      return result;
    }
    current.placements.push({ panelId, startFrame });
    current.placements = sortPlacements(current.placements);
    timelines.set(cutId, current);
    return { ok: true, timeline: cloneTimeline(current) };
  }

  function updatePlacement(cutId, panelId, startFrame, cut) {
    const current = timelines.get(cutId);
    if (!current) {
      return { ok: false, message: "Timelineがありません。" };
    }
    const existing = current.placements.find((item) => item.panelId === panelId);
    if (!existing) {
      return { ok: false, message: "このPanelの配置がありません。" };
    }
    const result = validatePlacement({
      cut,
      timeline: current,
      panelId,
      startFrame,
      exceptPanelId: panelId,
    });
    if (!result.ok) {
      return result;
    }
    existing.startFrame = startFrame;
    current.placements = sortPlacements(current.placements);
    return { ok: true, timeline: cloneTimeline(current) };
  }

  function removePlacement(cutId, panelId) {
    const current = timelines.get(cutId);
    if (!current) {
      return false;
    }
    const next = current.placements.filter((item) => item.panelId !== panelId);
    if (next.length === current.placements.length) {
      return false;
    }
    current.placements = next;
    return true;
  }

  function removePanelFromAll(panelId) {
    for (const timeline of timelines.values()) {
      timeline.placements = timeline.placements.filter(
        (item) => item.panelId !== panelId,
      );
    }
  }

  function listPlacements(cutId) {
    const timeline = timelines.get(cutId);
    if (!timeline) {
      return [];
    }
    return sortPlacements(timeline.placements);
  }

  function isComplete(cut) {
    if (!cut) {
      return false;
    }
    return isTimelineComplete(cut, getByCutId(cut.id));
  }

  function rangesFor(cut) {
    if (!cut) {
      return [];
    }
    return deriveRanges(cut, getByCutId(cut.id));
  }

  function placementsBlockingDuration(cutId, durationFrames) {
    const timeline = timelines.get(cutId);
    if (!timeline) {
      return [];
    }
    return timeline.placements
      .filter((item) => item.startFrame >= durationFrames)
      .map(clonePlacement)
      .sort(comparePlacements);
  }

  return {
    getByCutId,
    create,
    clear,
    removeByCutId,
    addPlacement,
    updatePlacement,
    removePlacement,
    removePanelFromAll,
    listPlacements,
    isComplete,
    rangesFor,
    placementsBlockingDuration,
  };
}

let placementSerial = 0;

export function createPlacementId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  placementSerial += 1;
  return `placement-${placementSerial}`;
}

function hasPlacementId(id) {
  return typeof id === "string" && id.length > 0;
}

function clonePlacement(placement) {
  return {
    id: hasPlacementId(placement?.id) ? placement.id : createPlacementId(),
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
  return String(a.id ?? "").localeCompare(String(b.id ?? ""));
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
    id: createPlacementId(),
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
  exceptPlacementId = null,
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
  const others = placements.filter((item) => item.id !== exceptPlacementId);
  const duplicate = others.find((item) => item.startFrame === startFrame);
  if (duplicate) {
    return {
      ok: false,
      message: `開始フレーム ${startFrame}f は他の配置と同じです。`,
    };
  }

  return { ok: true };
}

export function validatePlacements(cut, placements) {
  const normalized = [];
  const seenIds = new Set();
  for (const raw of placements ?? []) {
    const item = clonePlacement(raw);
    if (!hasPlacementId(item.id)) {
      return { ok: false, message: "placementにidがありません。" };
    }
    if (seenIds.has(item.id)) {
      return { ok: false, message: "placement idが重複しています。" };
    }
    seenIds.add(item.id);
    const result = validatePlacement({
      cut,
      timeline: { placements: normalized },
      panelId: item.panelId,
      startFrame: item.startFrame,
      exceptPlacementId: item.id,
    });
    if (!result.ok) {
      return result;
    }
    normalized.push(item);
  }
  return { ok: true, placements: sortPlacements(normalized) };
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
      id: placement.id,
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

  if (placements.length < 1) {
    return false;
  }

  const startFrames = new Set();
  let hasZero = false;

  for (const placement of placements) {
    if (!hasPlacementId(placement.id)) {
      return false;
    }
    if (!panelIds.includes(placement.panelId)) {
      return false;
    }
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

  return hasZero;
}

export function createTimelineStore() {
  const timelines = new Map();

  function getByCutId(cutId) {
    const timeline = timelines.get(cutId);
    return timeline ? cloneTimeline(timeline) : null;
  }

  function ensureTimeline(cutId) {
    const current = timelines.get(cutId);
    if (current) {
      return current;
    }
    const created = { cutId, placements: [] };
    timelines.set(cutId, created);
    return created;
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

  function getPlacementById(cutId, placementId) {
    const current = timelines.get(cutId);
    const found = current?.placements.find((item) => item.id === placementId);
    return found ? clonePlacement(found) : null;
  }

  function addPlacement(cutId, { id, panelId, startFrame }, cut) {
    const current = ensureTimeline(cutId);
    const placement = clonePlacement({ id, panelId, startFrame });
    if (current.placements.some((item) => item.id === placement.id)) {
      return { ok: false, message: "placement idが重複しています。" };
    }
    const result = validatePlacement({
      cut,
      timeline: current,
      panelId: placement.panelId,
      startFrame: placement.startFrame,
      exceptPlacementId: placement.id,
    });
    if (!result.ok) {
      return result;
    }
    current.placements.push(placement);
    current.placements = sortPlacements(current.placements);
    timelines.set(cutId, current);
    return {
      ok: true,
      placement: clonePlacement(placement),
      timeline: cloneTimeline(current),
    };
  }

  function updatePlacement(cutId, placementId, startFrame, cut) {
    const current = timelines.get(cutId);
    if (!current) {
      return { ok: false, message: "Timelineがありません。" };
    }
    const existing = current.placements.find((item) => item.id === placementId);
    if (!existing) {
      return { ok: false, message: "この配置がありません。" };
    }
    const result = validatePlacement({
      cut,
      timeline: current,
      panelId: existing.panelId,
      startFrame,
      exceptPlacementId: placementId,
    });
    if (!result.ok) {
      return result;
    }
    existing.startFrame = startFrame;
    current.placements = sortPlacements(current.placements);
    return { ok: true, timeline: cloneTimeline(current) };
  }

  function removePlacement(cutId, placementId) {
    const current = timelines.get(cutId);
    if (!current) {
      return { ok: false, message: "Timelineがありません。" };
    }
    const index = current.placements.findIndex((item) => item.id === placementId);
    if (index === -1) {
      return { ok: false, message: "この配置がありません。" };
    }
    const [removed] = current.placements.splice(index, 1);
    return { ok: true, placement: clonePlacement(removed) };
  }

  function removePlacementsByPanelId(cutId, panelId) {
    const current = timelines.get(cutId);
    if (!current) {
      return [];
    }
    const removed = current.placements.filter((item) => item.panelId === panelId);
    current.placements = current.placements.filter(
      (item) => item.panelId !== panelId,
    );
    return removed.map(clonePlacement);
  }

  function replacePlacements(cutId, placements, cut) {
    const validated = validatePlacements(cut, placements);
    if (!validated.ok) {
      return validated;
    }
    const current = ensureTimeline(cutId);
    current.placements = validated.placements;
    timelines.set(cutId, current);
    return { ok: true, timeline: cloneTimeline(current) };
  }

  function restorePlacements(cutId, placements, cut) {
    return replacePlacements(cutId, placements, cut);
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
    getPlacementById,
    create,
    clear,
    removeByCutId,
    addPlacement,
    updatePlacement,
    removePlacement,
    removePlacementsByPanelId,
    replacePlacements,
    restorePlacements,
    removePanelFromAll,
    listPlacements,
    isComplete,
    rangesFor,
    placementsBlockingDuration,
  };
}

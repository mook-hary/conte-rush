import { createPlacementId } from "./timeline-store.js?v=m8-1";

export function parseHoldFrames(raw) {
  const trimmed = String(raw ?? "").trim();
  if (!trimmed) {
    return { ok: false, message: "holdFramesを入力してください。" };
  }
  if (!/^[0-9]+$/.test(trimmed)) {
    return {
      ok: false,
      message: "holdFramesは1以上の整数で入力してください。",
    };
  }
  const holdFrames = Number(trimmed);
  if (!Number.isInteger(holdFrames) || holdFrames < 1) {
    return {
      ok: false,
      message: "holdFramesは1以上の整数で入力してください。",
    };
  }
  return { ok: true, holdFrames };
}

export function collapseConsecutive(placements) {
  const sorted = [...(placements ?? [])].sort((a, b) => {
    if (a.startFrame !== b.startFrame) {
      return a.startFrame - b.startFrame;
    }
    return String(a.id ?? "").localeCompare(String(b.id ?? ""));
  });
  const collapsed = [];
  for (const placement of sorted) {
    const previous = collapsed[collapsed.length - 1];
    if (previous && previous.panelId === placement.panelId) {
      continue;
    }
    collapsed.push(placement);
  }
  return collapsed;
}

export function expandRepeat(sequence, holdFrames, durationFrames) {
  if (!Array.isArray(sequence) || sequence.length === 0) {
    return { ok: false, message: "所属Panelがありません。" };
  }
  if (!Number.isInteger(holdFrames) || holdFrames < 1) {
    return {
      ok: false,
      message: "holdFramesは1以上の整数で入力してください。",
    };
  }
  if (!Number.isInteger(durationFrames) || durationFrames < 1) {
    return { ok: false, message: "総尺が不正です。" };
  }

  const generated = [];
  let t = 0;
  let index = 0;
  while (t < durationFrames) {
    generated.push({
      id: createPlacementId(),
      panelId: sequence[index % sequence.length],
      startFrame: t,
    });
    t += holdFrames;
    index += 1;
  }

  return { ok: true, placements: collapseConsecutive(generated) };
}

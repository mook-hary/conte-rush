function clonePose(pose) {
  return {
    x: pose.x,
    y: pose.y,
    scale: pose.scale,
  };
}

export function fixFramesOf(motion) {
  const pre = motion?.preFixFrames;
  const post = motion?.postFixFrames;
  return {
    preFixFrames: Number.isInteger(pre) && pre >= 0 ? pre : 0,
    postFixFrames: Number.isInteger(post) && post >= 0 ? post : 0,
  };
}

function cloneMotion(motion) {
  const { preFixFrames, postFixFrames } = fixFramesOf(motion);
  return {
    panelId: motion.panelId,
    from: clonePose(motion.from),
    to: clonePose(motion.to),
    preFixFrames,
    postFixFrames,
  };
}

function cloneSet(set) {
  return {
    cutId: set.cutId,
    motions: set.motions.map(cloneMotion),
  };
}

function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

export function validatePose(pose) {
  if (!pose) {
    return { ok: false, message: "画角がありません。" };
  }
  if (!isFiniteNumber(pose.x) || !isFiniteNumber(pose.y)) {
    return { ok: false, message: "画角の位置が不正です。" };
  }
  if (pose.x < 0 || pose.x > 1 || pose.y < 0 || pose.y > 1) {
    return { ok: false, message: "画角の位置は 0〜1 にしてください。" };
  }
  if (!isFiniteNumber(pose.scale) || pose.scale < 1) {
    return { ok: false, message: "scale は 1 以上にしてください。" };
  }
  return { ok: true };
}

export function parseFixFrames(raw) {
  const trimmed = String(raw ?? "").trim();
  if (!trimmed) {
    return { ok: false, message: "FIXは0以上の整数で入力してください。" };
  }
  if (!/^[0-9]+$/.test(trimmed)) {
    return { ok: false, message: "FIXは0以上の整数で入力してください。" };
  }
  const value = Number(trimmed);
  if (!Number.isInteger(value) || value < 0) {
    return { ok: false, message: "FIXは0以上の整数で入力してください。" };
  }
  return { ok: true, value };
}

export function deriveMotionWindow(panelStart, panelLast, motion) {
  const { preFixFrames, postFixFrames } = fixFramesOf(motion);
  return {
    panelStart,
    panelLast,
    preFixFrames,
    postFixFrames,
    motionStart: panelStart + preFixFrames,
    motionLast: panelLast - postFixFrames,
  };
}

export function canFitMotionWindow(panelStart, panelLast, motion) {
  if (!canSampleMotion(panelStart, panelLast)) {
    return false;
  }
  const { motionStart, motionLast } = deriveMotionWindow(
    panelStart,
    panelLast,
    motion,
  );
  return canSampleMotion(motionStart, motionLast);
}

export function validateMotionWindowForRanges(ranges, motion) {
  const applicable = (ranges ?? []).filter((range) =>
    canSampleMotion(range.startFrame, range.lastFrame),
  );
  for (const range of applicable) {
    if (!canFitMotionWindow(range.startFrame, range.lastFrame, motion)) {
      return {
        ok: false,
        message:
          "Motion本体が2フレーム未満になるため、前FIX/後FIXを保存できません。",
      };
    }
  }
  return { ok: true };
}

export function validateMotion(motion) {
  if (!motion?.panelId) {
    return { ok: false, message: "Panelが見つかりません。" };
  }
  const from = validatePose(motion.from);
  if (!from.ok) {
    return from;
  }
  const to = validatePose(motion.to);
  if (!to.ok) {
    return to;
  }
  if (
    motion.preFixFrames !== undefined &&
    motion.preFixFrames !== null &&
    !(Number.isInteger(motion.preFixFrames) && motion.preFixFrames >= 0)
  ) {
    return { ok: false, message: "前FIXは0以上の整数にしてください。" };
  }
  if (
    motion.postFixFrames !== undefined &&
    motion.postFixFrames !== null &&
    !(Number.isInteger(motion.postFixFrames) && motion.postFixFrames >= 0)
  ) {
    return { ok: false, message: "後FIXは0以上の整数にしてください。" };
  }
  return { ok: true };
}

export function posesEqual(a, b, epsilon = 0.0001) {
  if (!a || !b) {
    return false;
  }
  return (
    Math.abs(a.x - b.x) <= epsilon &&
    Math.abs(a.y - b.y) <= epsilon &&
    Math.abs(a.scale - b.scale) <= epsilon
  );
}

export function motionsEqual(a, b) {
  if (!a || !b) {
    return false;
  }
  const af = fixFramesOf(a);
  const bf = fixFramesOf(b);
  return (
    a.panelId === b.panelId &&
    posesEqual(a.from, b.from) &&
    posesEqual(a.to, b.to) &&
    af.preFixFrames === bf.preFixFrames &&
    af.postFixFrames === bf.postFixFrames
  );
}

export function motionLabel(from, to) {
  if (!from || !to) {
    return "Motionなし";
  }
  const pan = Math.hypot(to.x - from.x, to.y - from.y) > 0.02;
  const zoomIn = to.scale > from.scale + 0.04;
  const zoomOut = to.scale < from.scale - 0.04;
  if (pan && zoomIn) {
    return "PAN+TU";
  }
  if (pan && zoomOut) {
    return "PAN+TB";
  }
  if (zoomIn) {
    return "TU";
  }
  if (zoomOut) {
    return "TB";
  }
  if (pan) {
    return "PAN";
  }
  return "静止";
}

export function canSampleMotion(startFrame, lastFrame) {
  return (
    Number.isInteger(startFrame) &&
    Number.isInteger(lastFrame) &&
    lastFrame - startFrame >= 1
  );
}

export function samplePose(from, to, localFrame, startFrame, lastFrame) {
  if (!canSampleMotion(startFrame, lastFrame) || !from || !to) {
    return null;
  }
  let t = (localFrame - startFrame) / (lastFrame - startFrame);
  if (t < 0) {
    t = 0;
  }
  if (t > 1) {
    t = 1;
  }
  return {
    x: from.x + (to.x - from.x) * t,
    y: from.y + (to.y - from.y) * t,
    scale: from.scale + (to.scale - from.scale) * t,
  };
}

export function sampleMotionOnRange(
  from,
  to,
  localFrame,
  panelStart,
  panelLast,
  motion,
) {
  if (!canFitMotionWindow(panelStart, panelLast, motion) || !from || !to) {
    return null;
  }
  const { motionStart, motionLast } = deriveMotionWindow(
    panelStart,
    panelLast,
    motion,
  );
  if (localFrame < motionStart) {
    return clonePose(from);
  }
  if (localFrame > motionLast) {
    return clonePose(to);
  }
  return samplePose(from, to, localFrame, motionStart, motionLast);
}

export function createMotionStore() {
  const sets = new Map();

  function ensureSet(cutId) {
    let current = sets.get(cutId);
    if (!current) {
      current = { cutId, motions: [] };
      sets.set(cutId, current);
    }
    return current;
  }

  function prune(cutId) {
    const current = sets.get(cutId);
    if (current && current.motions.length === 0) {
      sets.delete(cutId);
    }
  }

  function get(cutId, panelId) {
    const current = sets.get(cutId);
    const motion = current?.motions.find((item) => item.panelId === panelId);
    return motion ? cloneMotion(motion) : null;
  }

  function listByCutId(cutId) {
    const current = sets.get(cutId);
    return current ? current.motions.map(cloneMotion) : [];
  }

  function listAll() {
    return [...sets.values()].map(cloneSet);
  }

  function upsert(cutId, motion) {
    const checked = validateMotion(motion);
    if (!checked.ok) {
      return checked;
    }
    const current = ensureSet(cutId);
    const next = cloneMotion(motion);
    const index = current.motions.findIndex((item) => item.panelId === next.panelId);
    if (index === -1) {
      current.motions.push(next);
    } else {
      current.motions[index] = next;
    }
    return { ok: true, motion: cloneMotion(next) };
  }

  function remove(cutId, panelId) {
    const current = sets.get(cutId);
    if (!current) {
      return false;
    }
    const next = current.motions.filter((item) => item.panelId !== panelId);
    if (next.length === current.motions.length) {
      return false;
    }
    current.motions = next;
    prune(cutId);
    return true;
  }

  function removeByCutId(cutId) {
    return sets.delete(cutId);
  }

  function removePanelFromAll(panelId) {
    for (const cutId of [...sets.keys()]) {
      remove(cutId, panelId);
    }
  }

  function clear() {
    sets.clear();
  }

  return {
    get,
    listByCutId,
    listAll,
    upsert,
    remove,
    removeByCutId,
    removePanelFromAll,
    clear,
  };
}

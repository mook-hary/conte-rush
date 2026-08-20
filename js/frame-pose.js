import { deriveRanges } from "./timeline-store.js?v=m8-1";
import { sampleMotionOnRange } from "./motion-store.js?v=m9-3";

function rangesFromSegment(segment) {
  if (!segment) {
    return [];
  }
  return deriveRanges(
    {
      durationFrames: segment.durationFrames,
      panelIds: segment.placements.map((item) => item.panelId),
    },
    { placements: segment.placements },
  );
}

function findMotion(motions, cutId, panelId) {
  const set = motions?.find((item) => item.cutId === cutId);
  return set?.motions.find((item) => item.panelId === panelId) ?? null;
}

function rangeContainsFrame(range, localFrame) {
  return (
    Number.isInteger(localFrame) &&
    localFrame >= range.startFrame &&
    localFrame <= range.lastFrame
  );
}

function rangeForView(ranges, view) {
  if (view.placementId) {
    const byId = ranges.find((item) => item.id === view.placementId);
    if (byId) {
      return byId;
    }
  }
  const containing = ranges.find((item) =>
    rangeContainsFrame(item, view.localFrame),
  );
  if (containing) {
    return containing;
  }
  return (
    ranges.find(
      (item) =>
        item.panelId === view.panelId &&
        rangeContainsFrame(item, view.localFrame),
    ) ?? null
  );
}

export function poseForResolvedFrame(snapshot, motions, view) {
  if (!view) {
    return null;
  }
  const motion = findMotion(motions, view.cutId, view.panelId);
  if (!motion) {
    return null;
  }
  const segment = snapshot?.segments.find((item) => item.cutId === view.cutId);
  if (!segment) {
    return null;
  }
  const range = rangeForView(rangesFromSegment(segment), view);
  if (!range) {
    return null;
  }
  return sampleMotionOnRange(
    motion.from,
    motion.to,
    view.localFrame,
    range.startFrame,
    range.lastFrame,
    motion,
  );
}

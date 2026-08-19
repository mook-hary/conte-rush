import { deriveRanges } from "./timeline-store.js";
import { canSampleMotion, samplePose } from "./motion-store.js";

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
  const range = rangesFromSegment(segment).find(
    (item) => item.panelId === view.panelId,
  );
  if (!range || !canSampleMotion(range.startFrame, range.lastFrame)) {
    return null;
  }
  return samplePose(
    motion.from,
    motion.to,
    view.localFrame,
    range.startFrame,
    range.lastFrame,
  );
}

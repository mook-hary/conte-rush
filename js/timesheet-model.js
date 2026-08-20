import { FRAMES_PER_SECOND, formatDuration } from "./duration.js?v=m9-1";
import { deriveRanges, isTimelineComplete } from "./timeline-store.js?v=m8-1";
import { collapseConsecutive } from "./timeline-repeat.js?v=m8-1";
import {
  canFitMotionWindow,
  canSampleMotion,
  deriveMotionWindow,
  motionLabel,
} from "./motion-store.js?v=m9-3";

export const TIMESHEET_SECONDS_PER_SHEET = 6;
export const TIMESHEET_FRAMES_PER_SHEET =
  FRAMES_PER_SECOND * TIMESHEET_SECONDS_PER_SHEET;

export function sheetCountForDuration(durationFrames) {
  if (!Number.isInteger(durationFrames) || durationFrames < 1) {
    return 0;
  }
  return Math.ceil(durationFrames / TIMESHEET_FRAMES_PER_SHEET);
}

export function cutFrameToSheet(cutFrame) {
  const sheetIndex = Math.floor(cutFrame / TIMESHEET_FRAMES_PER_SHEET);
  const sheetLocal = cutFrame - sheetIndex * TIMESHEET_FRAMES_PER_SHEET;
  return {
    sheetIndex,
    sheetLocal,
    displayRow: sheetLocal + 1,
  };
}

export function sheetCutFrameRange(sheetIndex) {
  const startFrame = sheetIndex * TIMESHEET_FRAMES_PER_SHEET;
  return {
    startFrame,
    lastFrame: startFrame + TIMESHEET_FRAMES_PER_SHEET - 1,
  };
}

export function panelNumberMap(panelIds) {
  const map = new Map();
  (panelIds ?? []).forEach((panelId, index) => {
    if (!map.has(panelId)) {
      map.set(panelId, index + 1);
    }
  });
  return map;
}

function runContaining(runs, cutFrame) {
  return (
    runs.find(
      (run) => cutFrame >= run.startFrame && cutFrame <= run.lastFrame,
    ) ?? null
  );
}

function clipRunToSheet(run, sheetStart, sheetLast) {
  const startFrame = Math.max(run.startFrame, sheetStart);
  const lastFrame = Math.min(run.lastFrame, sheetLast);
  if (lastFrame < startFrame) {
    return null;
  }
  return {
    ...run,
    startFrame,
    lastFrame,
    continuesFromPrev: run.startFrame < sheetStart,
    continuesToNext: run.lastFrame > sheetLast,
    isTrueStart: run.startFrame >= sheetStart && run.startFrame <= sheetLast,
    isTrueEnd: run.lastFrame >= sheetStart && run.lastFrame <= sheetLast,
  };
}

export function buildTimesheetModel({
  cut,
  timeline,
  motions = [],
  episodeNumber = "",
  title = "",
}) {
  if (!cut) {
    return { ok: false, message: "Cutが見つかりません。" };
  }
  if (!isTimelineComplete(cut, timeline)) {
    return { ok: false, message: "Timelineが未完成です。" };
  }

  const collapsed = collapseConsecutive(timeline.placements);
  const ranges = deriveRanges(cut, { placements: collapsed });
  const numbers = panelNumberMap(cut.panelIds);
  const motionByPanelId = new Map(
    (motions ?? []).map((item) => [item.panelId, item]),
  );

  const cellRuns = ranges.map((range) => ({
    panelId: range.panelId,
    panelNumber: numbers.get(range.panelId) ?? 0,
    startFrame: range.startFrame,
    lastFrame: range.lastFrame,
  }));

  const cameraRuns = [];
  for (const range of ranges) {
    const motion = motionByPanelId.get(range.panelId);
    if (!motion) {
      continue;
    }
    if (!canSampleMotion(range.startFrame, range.lastFrame)) {
      continue;
    }
    const label = motionLabel(motion.from, motion.to);
    if (!label || label === "静止" || label === "Motionなし") {
      continue;
    }
    if (!canFitMotionWindow(range.startFrame, range.lastFrame, motion)) {
      continue;
    }
    const window = deriveMotionWindow(range.startFrame, range.lastFrame, motion);
    const segments = [];
    if (window.preFixFrames > 0) {
      segments.push({
        kind: "fix",
        label: "FIX",
        startFrame: range.startFrame,
        lastFrame: window.motionStart - 1,
      });
    }
    segments.push({
      kind: "motion",
      label,
      startFrame: window.motionStart,
      lastFrame: window.motionLast,
    });
    if (window.postFixFrames > 0) {
      segments.push({
        kind: "fix",
        label: "FIX",
        startFrame: window.motionLast + 1,
        lastFrame: range.lastFrame,
      });
    }
    cameraRuns.push({
      panelId: range.panelId,
      label,
      startFrame: range.startFrame,
      lastFrame: range.lastFrame,
      motionStart: window.motionStart,
      motionLast: window.motionLast,
      segments,
    });
  }

  const sheetTotal = sheetCountForDuration(cut.durationFrames);
  return {
    ok: true,
    durationFrames: cut.durationFrames,
    sheetTotal,
    header: {
      episodeNumber: String(episodeNumber ?? ""),
      title: String(title ?? ""),
      cutNumber: cut.cutNumber,
      durationLabel: formatDuration(cut.durationFrames),
      sheetTotal,
    },
    cellRuns,
    cameraRuns,
  };
}

export function cellMarkForCutFrame(cellRuns, cutFrame, durationFrames, sheetIndex) {
  if (!Number.isInteger(cutFrame) || cutFrame < 0 || cutFrame >= durationFrames) {
    return { kind: "empty" };
  }
  const run = runContaining(cellRuns, cutFrame);
  if (!run) {
    return { kind: "empty" };
  }
  const { sheetLocal } = cutFrameToSheet(cutFrame);
  const sheetStart = sheetIndex * TIMESHEET_FRAMES_PER_SHEET;
  const isSheetHead = sheetLocal === 0 && cutFrame === sheetStart;
  const showNumber = cutFrame === run.startFrame || isSheetHead;
  if (showNumber) {
    return { kind: "number", panelNumber: run.panelNumber, panelId: run.panelId };
  }
  return { kind: "continue", panelNumber: run.panelNumber, panelId: run.panelId };
}

export function cameraClipsForSheet(cameraRuns, sheetIndex, durationFrames) {
  const { startFrame, lastFrame } = sheetCutFrameRange(sheetIndex);
  const sheetLast = Math.min(lastFrame, durationFrames - 1);
  const clips = [];
  for (const run of cameraRuns) {
    for (const segment of run.segments ?? []) {
      const clipped = clipRunToSheet(segment, startFrame, sheetLast);
      if (!clipped) {
        continue;
      }
      const startRow = cutFrameToSheet(clipped.startFrame).displayRow;
      const isMotion = segment.kind === "motion";
      clips.push({
        kind: segment.kind,
        label: segment.label,
        panelId: run.panelId,
        startFrame: clipped.startFrame,
        lastFrame: clipped.lastFrame,
        startRow,
        lastRow: cutFrameToSheet(clipped.lastFrame).displayRow,
        showLabel: isMotion
          ? clipped.isTrueStart
          : clipped.isTrueStart || clipped.continuesFromPrev,
        showA: isMotion && clipped.isTrueStart,
        showHead: isMotion && clipped.isTrueEnd,
        showB: isMotion && clipped.isTrueEnd,
        continuesToNext: clipped.continuesToNext,
        continuesFromPrev: clipped.continuesFromPrev,
      });
    }
  }
  return clips;
}

export function buildSheetView(model, sheetIndex) {
  if (!model?.ok) {
    return null;
  }
  if (sheetIndex < 0 || sheetIndex >= model.sheetTotal) {
    return null;
  }
  const { startFrame, lastFrame } = sheetCutFrameRange(sheetIndex);
  const marks = [];
  for (let local = 0; local < TIMESHEET_FRAMES_PER_SHEET; local += 1) {
    const cutFrame = startFrame + local;
    marks.push(cellMarkForCutFrame(model.cellRuns, cutFrame, model.durationFrames, sheetIndex));
  }
  return {
    sheetIndex,
    sheetNumber: sheetIndex + 1,
    sheetTotal: model.sheetTotal,
    startFrame,
    lastFrame,
    header: {
      ...model.header,
      sheetLabel: `${sheetIndex + 1} / ${model.sheetTotal}`,
    },
    marks,
    cameraClips: cameraClipsForSheet(
      model.cameraRuns,
      sheetIndex,
      model.durationFrames,
    ),
  };
}

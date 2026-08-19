export const FRAMES_PER_SECOND = 24;

const DURATION_PATTERN = /^([0-9]+)\+([0-9]+)$/;

export function parseDurationInput(raw) {
  const trimmed = String(raw ?? "").trim();
  if (!trimmed) {
    return { ok: false, message: "尺を入力してください。例: 3+12" };
  }
  const match = DURATION_PATTERN.exec(trimmed);
  if (!match) {
    return {
      ok: false,
      message: "尺は「秒+コマ」で入力してください。例: 3+12",
    };
  }

  const seconds = Number(match[1]);
  const frames = Number(match[2]);
  if (!Number.isInteger(seconds) || !Number.isInteger(frames)) {
    return { ok: false, message: "秒とコマは整数で入力してください。" };
  }
  if (seconds < 0) {
    return { ok: false, message: "秒は 0 以上の整数にしてください。" };
  }
  if (frames < 0 || frames > 23) {
    return { ok: false, message: "コマは 0〜23 の整数にしてください。" };
  }

  const durationFrames = seconds * FRAMES_PER_SECOND + frames;
  if (durationFrames < 1) {
    return { ok: false, message: "総尺は 1 フレーム以上にしてください。" };
  }

  return { ok: true, durationFrames, seconds, frames };
}

export function framesToParts(durationFrames) {
  return {
    seconds: Math.floor(durationFrames / FRAMES_PER_SECOND),
    frames: durationFrames % FRAMES_PER_SECOND,
  };
}

export function formatDuration(durationFrames) {
  const parts = framesToParts(durationFrames);
  return `${parts.seconds}+${String(parts.frames).padStart(2, "0")}`;
}

export function formatDurationLabel(durationFrames) {
  return `${formatDuration(durationFrames)}（${durationFrames}f）`;
}

export function formatFrameTime(frame) {
  return formatDuration(frame);
}

export function formatFrameTimeLabel(frame) {
  return formatDurationLabel(frame);
}

export function formatFrameRange(startFrame, lastFrame) {
  return `${formatFrameTime(startFrame)}–${formatFrameTime(lastFrame)}（${startFrame}–${lastFrame}f）`;
}

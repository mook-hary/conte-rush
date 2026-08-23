import { FRAMES_PER_SECOND } from "./duration.js";
import {
  EXPORT_HEIGHT,
  EXPORT_WIDTH,
  createExportImageCache,
  motionMaxScaleForPanel,
} from "./export-image-cache.js?v=m10-0";
import { poseForResolvedFrame } from "./frame-pose.js?v=m9-3";
import { renderFrame } from "./frame-renderer.js";
import {
  cutNumberForPanel,
  resolveFrame,
  uniquePanelIds,
} from "./rush-player.js?v=m8-1";

export const MEDIABUNNY_VERSION = "1.51.0";
export const KEYFRAME_INTERVAL_SECONDS = 2;
const YIELD_EVERY_FRAMES = 8;
const MEDIABUNNY_URL = `https://cdn.jsdelivr.net/npm/mediabunny@${MEDIABUNNY_VERSION}/+esm`;

export class ExportError extends Error {
  constructor(code, message, extras = {}) {
    super(message);
    this.name = "ExportError";
    this.code = code;
    this.panelId = extras.panelId ?? null;
    this.cutNumber = extras.cutNumber ?? null;
  }
}

let mediabunnyModule = null;

async function loadMediabunny() {
  if (mediabunnyModule) {
    return mediabunnyModule;
  }
  try {
    mediabunnyModule = await import(MEDIABUNNY_URL);
    return mediabunnyModule;
  } catch (error) {
    mediabunnyModule = null;
    throw new ExportError(
      "init",
      `Mediabunnyの初期化に失敗しました。${error?.message ?? ""}`.trim(),
    );
  }
}

function pad2(value) {
  return String(value).padStart(2, "0");
}

export function exportFileName(pdfFileName) {
  const raw = String(pdfFileName ?? "");
  const withoutExt = raw.replace(/\.pdf$/i, "");
  const cleaned = withoutExt.replace(/[\\/:*?"<>|]+/g, "_").trim();
  if (cleaned) {
    return `${cleaned}-rush.mp4`;
  }
  const now = new Date();
  return `conte-rush-${now.getFullYear()}${pad2(now.getMonth() + 1)}${pad2(now.getDate())}-${pad2(now.getHours())}${pad2(now.getMinutes())}.mp4`;
}

export function timestampUs(globalFrame) {
  return Math.round((globalFrame * 1_000_000) / FRAMES_PER_SECOND);
}

export function durationUs(globalFrame) {
  return timestampUs(globalFrame + 1) - timestampUs(globalFrame);
}

function timestampSec(globalFrame) {
  return timestampUs(globalFrame) / 1_000_000;
}

function durationSec(globalFrame) {
  return durationUs(globalFrame) / 1_000_000;
}

function yieldToUi() {
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}

function throwIfCancelled(shouldCancel) {
  if (shouldCancel?.()) {
    throw new ExportError("cancelled", "書き出しをキャンセルしました");
  }
}

export async function checkExportSupport() {
  if (typeof VideoEncoder === "undefined") {
    throw new ExportError(
      "webcodecs",
      "このブラウザでは MP4 書き出しに未対応です。",
    );
  }
  const { canEncodeVideo, QUALITY_HIGH } = await loadMediabunny();
  let supported = false;
  try {
    supported = await canEncodeVideo("avc", {
      width: EXPORT_WIDTH,
      height: EXPORT_HEIGHT,
      bitrate: QUALITY_HIGH,
    });
  } catch (error) {
    if (error instanceof ExportError) {
      throw error;
    }
    throw new ExportError(
      "init",
      `Mediabunnyの初期化に失敗しました。${error?.message ?? ""}`.trim(),
    );
  }
  if (!supported) {
    throw new ExportError(
      "avc",
      "この環境では H.264 書き出しに未対応です。",
    );
  }
}

function createExportCanvas() {
  const canvas = document.createElement("canvas");
  canvas.width = EXPORT_WIDTH;
  canvas.height = EXPORT_HEIGHT;
  return canvas;
}

async function prepareExportImages({
  snapshot,
  motions,
  panels,
  pdfDocument,
  cache,
  onProgress,
  shouldCancel,
}) {
  const panelIds = uniquePanelIds(snapshot);
  const total = panelIds.length;
  let prepared = 0;
  onProgress?.({
    phase: "preparing",
    preparedCount: 0,
    prepareTotal: total,
    currentFrame: 0,
    totalFrames: snapshot.totalFrames,
  });

  for (const panelId of panelIds) {
    throwIfCancelled(shouldCancel);
    const panel = panels.get(panelId);
    if (!panel) {
      throw new ExportError(
        "image",
        `Panel ${panelId} の画像を準備できませんでした。`,
        {
          panelId,
          cutNumber: cutNumberForPanel(snapshot, panelId),
        },
      );
    }
    try {
      await cache.prepare(
        pdfDocument,
        panel,
        motionMaxScaleForPanel(motions, panelId),
      );
    } catch (error) {
      if (error instanceof ExportError) {
        throw error;
      }
      throw new ExportError(
        "image",
        `CUT ${cutNumberForPanel(snapshot, panelId) ?? "?"} の Panel 画像を準備できませんでした。`,
        {
          panelId,
          cutNumber: cutNumberForPanel(snapshot, panelId),
        },
      );
    }
    prepared += 1;
    onProgress?.({
      phase: "preparing",
      preparedCount: prepared,
      prepareTotal: total,
      currentFrame: 0,
      totalFrames: snapshot.totalFrames,
    });
    await yieldToUi();
  }
}

async function cancelOutput(output) {
  if (!output) {
    return;
  }
  if (output.state === "canceled" || output.state === "finalized") {
    return;
  }
  try {
    await output.cancel();
  } catch (error) {
    console.warn("MP4出力のキャンセルに失敗しました。", error);
  }
}

export async function exportMp4({
  snapshot,
  motions,
  panels,
  pdfDocument,
  getRenderable,
  onProgress,
  shouldCancel,
} = {}) {
  if (!pdfDocument) {
    throw new ExportError("pdf", "PDFが読み込まれていません。");
  }
  if (!snapshot || snapshot.totalFrames < 1 || snapshot.segments.length === 0) {
    throw new ExportError("empty", "書き出せるCutがありません。");
  }

  await checkExportSupport();
  throwIfCancelled(shouldCancel);

  const cache = createExportImageCache({ getRenderable });
  const canvas = createExportCanvas();
  let output = null;

  try {
    await prepareExportImages({
      snapshot,
      motions,
      panels,
      pdfDocument,
      cache,
      onProgress,
      shouldCancel,
    });
    throwIfCancelled(shouldCancel);

    let canvasSource;
    try {
      const {
        BufferTarget,
        CanvasSource,
        Mp4OutputFormat,
        Output,
        QUALITY_HIGH,
      } = await loadMediabunny();
      output = new Output({
        format: new Mp4OutputFormat({
          fastStart: "in-memory",
        }),
        target: new BufferTarget(),
      });
      canvasSource = new CanvasSource(canvas, {
        codec: "avc",
        bitrate: QUALITY_HIGH,
        keyFrameInterval: KEYFRAME_INTERVAL_SECONDS,
        latencyMode: "quality",
      });
      output.addVideoTrack(canvasSource, {
        maximumPacketCount: snapshot.totalFrames,
      });
      await output.start();
    } catch (error) {
      if (error instanceof ExportError) {
        throw error;
      }
      throw new ExportError(
        "init",
        `Mediabunnyの初期化に失敗しました。${error?.message ?? ""}`.trim(),
      );
    }

    const totalFrames = snapshot.totalFrames;
    onProgress?.({
      phase: "encoding",
      preparedCount: uniquePanelIds(snapshot).length,
      prepareTotal: uniquePanelIds(snapshot).length,
      currentFrame: 0,
      totalFrames,
    });

    for (let globalFrame = 0; globalFrame < totalFrames; globalFrame += 1) {
      throwIfCancelled(shouldCancel);
      const view = resolveFrame(snapshot, globalFrame);
      const image = view?.panelId ? cache.get(view.panelId)?.image : null;
      renderFrame({
        canvas,
        image: image ?? null,
        pose: poseForResolvedFrame(snapshot, motions, view),
      });
      try {
        const encodeOptions =
          globalFrame === 0 ? { keyFrame: true } : undefined;
        await canvasSource.add(
          timestampSec(globalFrame),
          durationSec(globalFrame),
          encodeOptions,
        );
      } catch (error) {
        if (error instanceof ExportError) {
          throw error;
        }
        throw new ExportError(
          "encoder",
          `エンコードに失敗しました。${error?.message ?? ""}`.trim(),
        );
      }
      onProgress?.({
        phase: "encoding",
        currentFrame: globalFrame + 1,
        totalFrames,
      });
      if ((globalFrame + 1) % YIELD_EVERY_FRAMES === 0) {
        await yieldToUi();
      }
    }

    throwIfCancelled(shouldCancel);
    try {
      canvasSource.close();
      await output.finalize();
    } catch (error) {
      if (error instanceof ExportError) {
        throw error;
      }
      throw new ExportError(
        "muxer",
        `MP4の組み立てに失敗しました。${error?.message ?? ""}`.trim(),
      );
    }

    const buffer = output.target.buffer;
    if (!buffer) {
      throw new ExportError("muxer", "MP4の組み立てに失敗しました。");
    }
    return new Blob([buffer], { type: "video/mp4" });
  } catch (error) {
    await cancelOutput(output);
    if (error instanceof ExportError) {
      throw error;
    }
    throw new ExportError(
      "other",
      `書き出しに失敗しました。${error?.message ?? ""}`.trim(),
    );
  } finally {
    cache.clear();
    canvas.width = 0;
    canvas.height = 0;
  }
}

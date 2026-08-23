import {
  computeOnionPdfScale,
  cropPanelImage,
  PREVIEW_SCALE,
} from "./panel-image.js?v=m10-2";
import { isPdfPanel } from "./panel-store.js?v=m10-1";
import { RUSH_SCALE } from "./rush-image-cache.js?v=m10-0";

export const IMAGE_PURPOSE = {
  THUMBNAIL: "thumbnail",
  RUSH: "rush",
  EXPORT: "export",
  MOTION: "motion",
  ONION: "onion",
};

function defaultScaleForPurpose(purpose) {
  if (purpose === IMAGE_PURPOSE.RUSH) {
    return RUSH_SCALE;
  }
  if (purpose === IMAGE_PURPOSE.EXPORT) {
    return null;
  }
  return PREVIEW_SCALE;
}

export async function decodeImageBlob(blob) {
  if (typeof createImageBitmap === "function") {
    try {
      return await createImageBitmap(blob, { imageOrientation: "from-image" });
    } catch {
      return await createImageBitmap(blob);
    }
  }
  const url = URL.createObjectURL(blob);
  try {
    const image = await new Promise((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error("画像を読み込めませんでした。"));
      element.src = url;
    });
    return image;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function renderableFromCanvas(canvas) {
  return {
    image: canvas,
    canvas,
    width: canvas.width,
    height: canvas.height,
  };
}

function renderableFromDecoded(image) {
  return {
    image,
    width: image.width || image.naturalWidth || 0,
    height: image.height || image.naturalHeight || 0,
  };
}

export function createPanelImageProvider({
  getPdfDocument = () => null,
  mediaStore,
} = {}) {
  async function getRenderable(panel, options = {}) {
    if (!panel?.id) {
      throw new Error("Panelがありません。");
    }
    const source = panel.source ?? "manual";
    if (source === "manual" || source === "auto") {
      if (!isPdfPanel(panel)) {
        throw new Error("PDF Panelの座標がありません。");
      }
      const pdfDocument = options.pdfDocument ?? getPdfDocument?.();
      if (!pdfDocument) {
        throw new Error("PDFが読み込まれていません。");
      }
      let scale = options.scale;
      if (scale == null && options.purpose === IMAGE_PURPOSE.ONION) {
        scale = await computeOnionPdfScale(pdfDocument, panel);
      }
      scale = scale ?? defaultScaleForPurpose(options.purpose) ?? PREVIEW_SCALE;
      const canvas = await cropPanelImage(pdfDocument, panel, { scale });
      return renderableFromCanvas(canvas);
    }
    if (source === "drawing" || source === "upload") {
      const media = mediaStore?.get(panel.id);
      if (!media?.blob) {
        throw new Error("Panel画像がありません。");
      }
      const decoded = await decodeImageBlob(media.blob);
      return renderableFromDecoded(decoded);
    }
    throw new Error(`未対応のPanel source: ${source}`);
  }

  return {
    getRenderable,
  };
}

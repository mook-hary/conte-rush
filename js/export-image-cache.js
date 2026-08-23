import { baseViewportSize } from "./frame-renderer.js";
import { cropPanelImage } from "./panel-image.js?v=m10-0";
import { isPdfPanel } from "./panel-store.js?v=m10-0";

export const EXPORT_WIDTH = 1280;
export const EXPORT_HEIGHT = 720;
export const EXPORT_PDF_SCALE_CAP = 8;

function revoke(entry) {
  if (entry?.url) {
    URL.revokeObjectURL(entry.url);
  }
  const canvas = entry?.canvas;
  if (canvas) {
    canvas.width = 0;
    canvas.height = 0;
  }
}

export function motionMaxScaleForPanel(motions, panelId) {
  let maxScale = 1;
  if (!motions) {
    return maxScale;
  }
  for (const set of motions) {
    const motion = set.motions.find((item) => item.panelId === panelId);
    if (!motion) {
      continue;
    }
    maxScale = Math.max(maxScale, motion.from.scale, motion.to.scale, 1);
  }
  return maxScale;
}

export async function computeExportPdfScale(pdfDocument, panel, motionMaxScale) {
  const page = await pdfDocument.getPage(panel.pageNumber);
  const viewport = page.getViewport({ scale: 1 });
  const panelWidth = Math.max(1, panel.width * viewport.width);
  const panelHeight = Math.max(1, panel.height * viewport.height);
  const base = baseViewportSize(panelWidth, panelHeight);
  const needed =
    (EXPORT_WIDTH * Math.max(1, motionMaxScale)) / Math.max(base.width, 1);
  return Math.min(EXPORT_PDF_SCALE_CAP, Math.max(1, needed));
}

function canvasFromRenderable(rendered) {
  if (rendered?.canvas) {
    return rendered.canvas;
  }
  const image = rendered?.image;
  if (image instanceof HTMLCanvasElement) {
    return image;
  }
  if (!image) {
    throw new Error("書き出し画像を作れませんでした。");
  }
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, rendered.width || image.width || image.naturalWidth || 1);
  canvas.height = Math.max(1, rendered.height || image.height || image.naturalHeight || 1);
  canvas.getContext("2d").drawImage(image, 0, 0);
  return canvas;
}

async function rasterizePanel(pdfDocument, panel, scale, getRenderable) {
  if (getRenderable) {
    const rendered = await getRenderable(panel, {
      purpose: "export",
      scale,
      pdfDocument,
    });
    return canvasFromRenderable(rendered);
  }
  return cropPanelImage(pdfDocument, panel, { scale });
}

export function createExportImageCache({ getRenderable } = {}) {
  const items = new Map();

  function get(panelId) {
    return items.get(panelId) ?? null;
  }

  function has(panelId) {
    return items.has(panelId);
  }

  async function prepare(pdfDocument, panel, motionMaxScale) {
    const previous = items.get(panel.id);
    if (previous) {
      revoke(previous);
      items.delete(panel.id);
    }
    let scale = null;
    let canvas;
    if (isPdfPanel(panel)) {
      scale = await computeExportPdfScale(pdfDocument, panel, motionMaxScale);
      canvas = await rasterizePanel(pdfDocument, panel, scale, getRenderable);
    } else {
      canvas = await rasterizePanel(pdfDocument, panel, undefined, getRenderable);
    }
    const entry = { canvas, image: canvas, scale };
    items.set(panel.id, entry);
    return entry;
  }

  function clear() {
    for (const entry of items.values()) {
      revoke(entry);
    }
    items.clear();
  }

  return {
    get,
    has,
    prepare,
    clear,
  };
}

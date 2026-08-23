export const PREVIEW_SCALE = 1.5;
export const ONION_TARGET_SIZE = 1280;
export const ONION_PDF_SCALE_CAP = 3;

export async function computeOnionPdfScale(pdfDocument, panel) {
  const page = await pdfDocument.getPage(panel.pageNumber);
  const viewport = page.getViewport({ scale: 1 });
  const panelWidth = Math.max(1, panel.width * viewport.width);
  const panelHeight = Math.max(1, panel.height * viewport.height);
  const longest = Math.max(panelWidth, panelHeight);
  const needed = ONION_TARGET_SIZE / longest;
  return Math.min(ONION_PDF_SCALE_CAP, Math.max(1, needed));
}

function toCropPixels(x, y, width, height, canvasWidth, canvasHeight) {
  let sx = Math.floor(x * canvasWidth);
  let sy = Math.floor(y * canvasHeight);
  let sw = Math.ceil(width * canvasWidth);
  let sh = Math.ceil(height * canvasHeight);

  if (sx < 0) {
    sw += sx;
    sx = 0;
  }
  if (sy < 0) {
    sh += sy;
    sy = 0;
  }

  sw = Math.min(sw, canvasWidth - sx);
  sh = Math.min(sh, canvasHeight - sy);
  sw = Math.max(1, sw);
  sh = Math.max(1, sh);

  if (sx + sw > canvasWidth) {
    sx = Math.max(0, canvasWidth - sw);
  }
  if (sy + sh > canvasHeight) {
    sy = Math.max(0, canvasHeight - sh);
  }

  return { sx, sy, sw, sh };
}

export async function cropPanelImage(pdfDocument, panel, options = {}) {
  const scale = options.scale ?? PREVIEW_SCALE;
  const page = await pdfDocument.getPage(panel.pageNumber);
  const viewport = page.getViewport({ scale });

  const pageCanvas = document.createElement("canvas");
  pageCanvas.width = Math.max(1, Math.floor(viewport.width));
  pageCanvas.height = Math.max(1, Math.floor(viewport.height));
  const pageContext = pageCanvas.getContext("2d");

  await page.render({
    canvasContext: pageContext,
    viewport,
  }).promise;

  const { sx, sy, sw, sh } = toCropPixels(
    panel.x,
    panel.y,
    panel.width,
    panel.height,
    pageCanvas.width,
    pageCanvas.height,
  );

  const cropCanvas = document.createElement("canvas");
  cropCanvas.width = sw;
  cropCanvas.height = sh;
  cropCanvas.getContext("2d").drawImage(pageCanvas, sx, sy, sw, sh, 0, 0, sw, sh);

  pageCanvas.width = 0;
  pageCanvas.height = 0;

  return cropCanvas;
}

export function canvasToObjectUrl(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error("プレビュー画像を作れませんでした。"));
        return;
      }
      resolve(URL.createObjectURL(blob));
    }, "image/png");
  });
}

export async function renderableToObjectUrl(renderable) {
  const source = renderable?.canvas ?? renderable?.image;
  if (source instanceof HTMLCanvasElement) {
    return canvasToObjectUrl(source);
  }
  if (!source) {
    throw new Error("プレビュー画像を作れませんでした。");
  }
  const width = Math.max(
    1,
    renderable.width || source.width || source.naturalWidth || 1,
  );
  const height = Math.max(
    1,
    renderable.height || source.height || source.naturalHeight || 1,
  );
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  canvas.getContext("2d").drawImage(source, 0, 0);
  try {
    return await canvasToObjectUrl(canvas);
  } finally {
    canvas.width = 0;
    canvas.height = 0;
  }
}

export const PREVIEW_SCALE = 1.5;

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

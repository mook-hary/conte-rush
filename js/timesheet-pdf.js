import { PDFDocument } from "https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/+esm";
import { PAGE_HEIGHT_MM, PAGE_WIDTH_MM, renderTimesheetSheet } from "./timesheet-renderer.js?v=m9-3";
import { buildSheetView } from "./timesheet-model.js?v=m9-3";

export const PDF_LIB_VERSION = "1.17.1";
export const PRINT_PX_PER_MM = 8;

const MM_TO_PT = 72 / 25.4;
export const PAGE_WIDTH_PT = PAGE_WIDTH_MM * MM_TO_PT;
export const PAGE_HEIGHT_PT = PAGE_HEIGHT_MM * MM_TO_PT;

function pad2(value) {
  return String(value).padStart(2, "0");
}

function sanitizePart(raw) {
  return String(raw ?? "")
    .replace(/[\\/:*?"<>|]+/g, "_")
    .replace(/\s+/g, " ")
    .trim();
}

export function timesheetFileName(pdfFileName, cutNumber) {
  const withoutExt = sanitizePart(String(pdfFileName ?? "").replace(/\.pdf$/i, ""));
  let cut = sanitizePart(cutNumber);
  if (/^\d+$/.test(cut)) {
    cut = cut.padStart(3, "0");
  }
  if (!cut) {
    cut = "cut";
  }
  if (withoutExt) {
    return `${withoutExt}-cut${cut}-timesheet.pdf`;
  }
  const now = new Date();
  return `conte-rush-${now.getFullYear()}${pad2(now.getMonth() + 1)}${pad2(now.getDate())}-cut${cut}-timesheet.pdf`;
}

function canvasToPngBytes(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error("タイムシート画像を作れませんでした。"));
          return;
        }
        blob.arrayBuffer().then(resolve, reject);
      },
      "image/png",
    );
  });
}

export async function buildTimesheetPdf(model, { onProgress } = {}) {
  if (!model?.ok) {
    throw new Error(model?.message ?? "タイムシートを作れません。");
  }
  const pdfDoc = await PDFDocument.create();
  for (let sheetIndex = 0; sheetIndex < model.sheetTotal; sheetIndex += 1) {
    onProgress?.({ sheetIndex, sheetTotal: model.sheetTotal });
    const view = buildSheetView(model, sheetIndex);
    const canvas = renderTimesheetSheet(view, PRINT_PX_PER_MM);
    const png = await canvasToPngBytes(canvas);
    const image = await pdfDoc.embedPng(png);
    const page = pdfDoc.addPage([PAGE_WIDTH_PT, PAGE_HEIGHT_PT]);
    page.drawImage(image, {
      x: 0,
      y: 0,
      width: PAGE_WIDTH_PT,
      height: PAGE_HEIGHT_PT,
    });
  }
  const bytes = await pdfDoc.save();
  return new Blob([bytes], { type: "application/pdf" });
}

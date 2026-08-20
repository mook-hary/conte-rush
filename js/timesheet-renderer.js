import { FRAMES_PER_SECOND } from "./duration.js?v=m9-1";
import { TIMESHEET_FRAMES_PER_SHEET } from "./timesheet-model.js?v=m9-3";

export const PAGE_WIDTH_MM = 257;
export const PAGE_HEIGHT_MM = 364;

const PAPER = "#f6e7b8";
const INK = "#9a3a24";
const INK_DARK = "#6e2416";
const TEXT = "#4a1c12";

export const LAYOUT = {
  margin: 6,
  headerHeight: 16,
  headerGap: 1.6,
  gutterSec: 3.4,
  gutterFrame: 4.2,
  actionCol: 3.6,
  sCol: 3.4,
  cellCol: 5.0,
  colHeader: 6.2,
};

function mm(ctx) {
  return ctx.__mm ?? 1;
}

function setMmScale(ctx, pxPerMm) {
  ctx.__mm = pxPerMm;
}

function xpt(ctx, mmValue) {
  return mmValue * mm(ctx);
}

function lineWidth(ctx, mmValue) {
  return Math.max(0.6, mmValue * mm(ctx));
}

function strokeRect(ctx, x, y, w, h, widthMm = 0.18) {
  ctx.strokeStyle = INK;
  ctx.lineWidth = lineWidth(ctx, widthMm);
  ctx.strokeRect(xpt(ctx, x), xpt(ctx, y), xpt(ctx, w), xpt(ctx, h));
}

function fillPaper(ctx) {
  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, xpt(ctx, PAGE_WIDTH_MM), xpt(ctx, PAGE_HEIGHT_MM));
}

function drawText(ctx, text, xMm, yMm, { sizeMm = 2.4, align = "center", bold = false, color = TEXT } = {}) {
  const px = sizeMm * mm(ctx);
  ctx.fillStyle = color;
  ctx.font = `${bold ? "700" : "400"} ${px}px "Hiragino Sans", "Hiragino Kaku Gothic ProN", "Noto Sans JP", "Yu Gothic", sans-serif`;
  ctx.textAlign = align;
  ctx.textBaseline = "middle";
  ctx.fillText(String(text ?? ""), xpt(ctx, xMm), xpt(ctx, yMm));
}

function blockGeometry(side) {
  const { margin, headerHeight, headerGap } = LAYOUT;
  const gap = 2.4;
  const top = margin + headerHeight + headerGap;
  const height = PAGE_HEIGHT_MM - margin - top;
  const width = (PAGE_WIDTH_MM - margin * 2 - gap) / 2;
  const x = side === "left" ? margin : margin + width + gap;
  return { x, y: top, width, height };
}

function columnLayout(block) {
  const actionWidth = LAYOUT.actionCol * 6;
  const cellWidth = LAYOUT.cellCol * 6;
  const used =
    LAYOUT.gutterSec +
    LAYOUT.gutterFrame +
    actionWidth +
    LAYOUT.sCol +
    cellWidth;
  const cameraWidth = Math.max(18, block.width - used);
  let x = block.x;
  const sec = { x, width: LAYOUT.gutterSec };
  x += LAYOUT.gutterSec;
  const frame = { x, width: LAYOUT.gutterFrame };
  x += LAYOUT.gutterFrame;
  const action = { x, width: actionWidth, col: LAYOUT.actionCol };
  x += actionWidth;
  const s = { x, width: LAYOUT.sCol };
  x += LAYOUT.sCol;
  const cell = { x, width: cellWidth, col: LAYOUT.cellCol };
  x += cellWidth;
  const camera = { x, width: cameraWidth };
  return { sec, frame, action, s, cell, camera };
}

function rowBox(block, displayRow) {
  const bodyY = block.y + LAYOUT.colHeader;
  const bodyH = block.height - LAYOUT.colHeader;
  const local = displayRow - 1;
  const inBlock = local % 72;
  const rowH = bodyH / 72;
  return {
    y: bodyY + inBlock * rowH,
    height: rowH,
  };
}

export function createTimesheetCanvas(pxPerMm) {
  const canvas = document.createElement("canvas");
  const scale = Math.max(1, pxPerMm);
  canvas.width = Math.round(PAGE_WIDTH_MM * scale);
  canvas.height = Math.round(PAGE_HEIGHT_MM * scale);
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = true;
  setMmScale(ctx, scale);
  return { canvas, ctx };
}

function drawHeader(ctx, header) {
  const { margin, headerHeight } = LAYOUT;
  const y = margin;
  const w = PAGE_WIDTH_MM - margin * 2;
  const x = margin;
  const cols = [
    { key: "episode", label: "話数", width: 16 },
    { key: "title", label: "タイトル", width: 0 },
    { key: "cut", label: "カット", width: 26 },
    { key: "sec", label: "秒数", width: 22 },
    { key: "genga", label: "原画", width: 20 },
    { key: "satsuei", label: "撮影", width: 20 },
    { key: "sheet", label: "シート", width: 22 },
  ];
  const fixed = cols.reduce((sum, col) => sum + col.width, 0);
  cols[1].width = w - fixed;
  strokeRect(ctx, x, y, w, headerHeight, 0.35);
  let cx = x;
  const labelY = y + 3.8;
  const valueY = y + 10.8;
  const values = {
    episode: header.episodeNumber,
    title: header.title,
    cut: header.cutNumber,
    sec: header.durationLabel,
    genga: "",
    satsuei: "",
    sheet: header.sheetLabel,
  };
  for (const col of cols) {
    if (cx > x) {
      ctx.strokeStyle = INK;
      ctx.lineWidth = lineWidth(ctx, 0.18);
      ctx.beginPath();
      ctx.moveTo(xpt(ctx, cx), xpt(ctx, y));
      ctx.lineTo(xpt(ctx, cx), xpt(ctx, y + headerHeight));
      ctx.stroke();
    }
    drawText(ctx, col.label, cx + col.width / 2, labelY, { sizeMm: 1.8 });
    drawText(ctx, values[col.key], cx + col.width / 2, valueY, {
      sizeMm: col.key === "title" ? 2.6 : 2.5,
      bold: true,
    });
    cx += col.width;
  }
  ctx.strokeStyle = INK;
  ctx.lineWidth = lineWidth(ctx, 0.15);
  ctx.beginPath();
  ctx.moveTo(xpt(ctx, x), xpt(ctx, y + 6.6));
  ctx.lineTo(xpt(ctx, x + w), xpt(ctx, y + 6.6));
  ctx.stroke();
}

function drawColHeaders(ctx, cols, block) {
  const y = block.y;
  const h = LAYOUT.colHeader;
  strokeRect(ctx, block.x, y, block.width, h, 0.28);
  const labels = [
    { box: cols.action, text: "ACTION" },
    { box: cols.s, text: "S" },
    { box: cols.cell, text: "CELL" },
    { box: cols.camera, text: "CAMERA" },
  ];
  for (const item of labels) {
    strokeRect(ctx, item.box.x, y, item.box.width, h, 0.18);
    drawText(ctx, item.text, item.box.x + item.box.width / 2, y + h * 0.38, {
      sizeMm: 1.7,
      bold: true,
    });
  }
  const subY = y + h * 0.72;
  for (let i = 0; i < 6; i += 1) {
    const letter = String.fromCharCode(65 + i);
    drawText(ctx, letter, cols.action.x + (i + 0.5) * cols.action.col, subY, {
      sizeMm: 1.5,
    });
    drawText(ctx, letter, cols.cell.x + (i + 0.5) * cols.cell.col, subY, {
      sizeMm: 1.5,
    });
  }
}

function drawBlockGrid(ctx, block, cols, side) {
  const bodyY = block.y + LAYOUT.colHeader;
  const bodyH = block.height - LAYOUT.colHeader;
  const rowH = bodyH / 72;
  strokeRect(ctx, block.x, block.y, block.width, block.height, 0.32);

  for (let i = 0; i <= 72; i += 1) {
    const y = bodyY + i * rowH;
    const thick = i % FRAMES_PER_SECOND === 0;
    ctx.strokeStyle = INK;
    ctx.lineWidth = lineWidth(ctx, thick ? 0.32 : 0.09);
    ctx.beginPath();
    ctx.moveTo(xpt(ctx, block.x), xpt(ctx, y));
    ctx.lineTo(xpt(ctx, block.x + block.width), xpt(ctx, y));
    ctx.stroke();
  }

  const verticals = [
    cols.frame.x,
    cols.action.x,
    cols.s.x,
    cols.cell.x,
    cols.camera.x,
    block.x + block.width,
  ];
  ctx.strokeStyle = INK;
  for (const vx of verticals) {
    ctx.lineWidth = lineWidth(ctx, 0.18);
    ctx.beginPath();
    ctx.moveTo(xpt(ctx, vx), xpt(ctx, block.y));
    ctx.lineTo(xpt(ctx, vx), xpt(ctx, block.y + block.height));
    ctx.stroke();
  }
  for (let i = 1; i < 6; i += 1) {
    ctx.lineWidth = lineWidth(ctx, 0.08);
    const ax = cols.action.x + i * cols.action.col;
    const cx = cols.cell.x + i * cols.cell.col;
    for (const vx of [ax, cx]) {
      ctx.beginPath();
      ctx.moveTo(xpt(ctx, vx), xpt(ctx, bodyY));
      ctx.lineTo(xpt(ctx, vx), xpt(ctx, block.y + block.height));
      ctx.stroke();
    }
  }

  const secondBase = side === "left" ? 1 : 4;
  for (let group = 0; group < 3; group += 1) {
    const secY = bodyY + (group * 24 + 12) * rowH;
    drawText(ctx, String(secondBase + group), cols.sec.x + cols.sec.width / 2, secY, {
      sizeMm: 2.8,
      bold: true,
      color: INK_DARK,
    });
    for (let f = 0; f < 24; f += 1) {
      const row = group * 24 + f;
      const fy = bodyY + (row + 0.5) * rowH;
      if (f === 0 || f === 5 || f === 11 || f === 17 || f === 23) {
        drawText(ctx, String(f + 1), cols.frame.x + cols.frame.width / 2, fy, {
          sizeMm: 1.55,
        });
      }
    }
  }
}

function drawCircledNumber(ctx, number, cxMm, cyMm, diameterMm) {
  const r = diameterMm / 2;
  ctx.strokeStyle = INK_DARK;
  ctx.lineWidth = lineWidth(ctx, 0.22);
  ctx.beginPath();
  ctx.arc(xpt(ctx, cxMm), xpt(ctx, cyMm), xpt(ctx, r), 0, Math.PI * 2);
  ctx.stroke();
  const digits = String(number);
  const sizeMm = digits.length >= 3 ? diameterMm * 0.38 : digits.length === 2 ? diameterMm * 0.48 : diameterMm * 0.58;
  drawText(ctx, digits, cxMm, cyMm, { sizeMm, bold: true, color: INK_DARK });
}

function cellABox(cols, row) {
  return {
    x: cols.cell.x,
    y: row.y,
    width: cols.cell.col,
    height: row.height,
  };
}

function drawCellMarks(ctx, sheetView, leftCols, rightCols, leftBlock, rightBlock) {
  for (let displayRow = 1; displayRow <= TIMESHEET_FRAMES_PER_SHEET; displayRow += 1) {
    const mark = sheetView.marks[displayRow - 1];
    if (!mark || mark.kind === "empty") {
      continue;
    }
    const side = displayRow <= 72 ? "left" : "right";
    const block = side === "left" ? leftBlock : rightBlock;
    const cols = side === "left" ? leftCols : rightCols;
    const localRow = side === "left" ? displayRow : displayRow - 72;
    const row = rowBox(block, localRow);
    const box = cellABox(cols, row);
    const cx = box.x + box.width / 2;
    if (mark.kind === "number") {
      drawCircledNumber(ctx, mark.panelNumber, cx, row.y + row.height / 2, Math.min(box.width * 0.86, row.height * 0.72, 4.2));
    } else if (mark.kind === "continue") {
      ctx.strokeStyle = INK_DARK;
      ctx.lineWidth = lineWidth(ctx, 0.28);
      ctx.beginPath();
      ctx.moveTo(xpt(ctx, cx), xpt(ctx, row.y));
      ctx.lineTo(xpt(ctx, cx), xpt(ctx, row.y + row.height));
      ctx.stroke();
    }
  }
}

function cameraAnchor(cols, block, displayRow) {
  const side = displayRow <= 72 ? "left" : "right";
  const localRow = side === "left" ? displayRow : displayRow - 72;
  const row = rowBox(block, localRow);
  return {
    x: cols.camera.x + cols.camera.width * 0.38,
    y: row.y + row.height / 2,
    row,
    cols,
  };
}

function drawCameraStroke(ctx, xMm, y1Mm, y2Mm, { head = false } = {}) {
  if (y2Mm - y1Mm < 0.25) {
    if (head) {
      drawArrowHead(ctx, xMm, Math.max(y1Mm, y2Mm));
    }
    return;
  }
  ctx.strokeStyle = INK_DARK;
  ctx.lineWidth = lineWidth(ctx, 0.26);
  ctx.beginPath();
  ctx.moveTo(xpt(ctx, xMm), xpt(ctx, y1Mm));
  ctx.lineTo(xpt(ctx, xMm), xpt(ctx, y2Mm));
  ctx.stroke();
  if (head) {
    drawArrowHead(ctx, xMm, y2Mm);
  }
}

function drawArrowHead(ctx, xMm, yMm) {
  const head = 1.35;
  ctx.strokeStyle = INK_DARK;
  ctx.lineWidth = lineWidth(ctx, 0.26);
  ctx.beginPath();
  ctx.moveTo(xpt(ctx, xMm), xpt(ctx, yMm));
  ctx.lineTo(xpt(ctx, xMm - head * 0.55), xpt(ctx, yMm - head));
  ctx.moveTo(xpt(ctx, xMm), xpt(ctx, yMm));
  ctx.lineTo(xpt(ctx, xMm + head * 0.55), xpt(ctx, yMm - head));
  ctx.stroke();
}

function splitCameraClip(clip) {
  if (clip.startRow <= 72 && clip.lastRow > 72) {
    const isFix = clip.kind === "fix";
    return [
      {
        ...clip,
        startRow: clip.startRow,
        lastRow: 72,
        showA: clip.showA,
        showB: false,
        showHead: false,
        showLabel: clip.showLabel,
        continuesToNext: true,
      },
      {
        ...clip,
        startRow: 73,
        lastRow: clip.lastRow,
        showA: false,
        showB: clip.showB,
        showHead: clip.showHead,
        showLabel: isFix,
        continuesFromPrev: true,
      },
    ];
  }
  return [clip];
}

function drawCameraClips(ctx, sheetView, leftCols, rightCols, leftBlock, rightBlock) {
  for (const clip of sheetView.cameraClips) {
    for (const segment of splitCameraClip(clip)) {
      const block = segment.startRow <= 72 ? leftBlock : rightBlock;
      const cols = segment.startRow <= 72 ? leftCols : rightCols;
      const start = cameraAnchor(cols, block, segment.startRow);
      const end = cameraAnchor(cols, block, segment.lastRow);
      const textX = cols.camera.x + cols.camera.width * 0.72;
      const isMotion = segment.kind === "motion";
      if (segment.showLabel) {
        drawText(ctx, segment.label, textX, start.y - start.row.height * 0.12, {
          sizeMm: isMotion ? 1.85 : 1.7,
          bold: true,
          align: "center",
        });
      }
      if (segment.showA) {
        drawText(ctx, "A", start.x, start.y, { sizeMm: 2.1, bold: true });
      }
      if (segment.showB) {
        drawText(ctx, "B", end.x, end.y, { sizeMm: 2.1, bold: true });
      }
      const fromTop = segment.continuesFromPrev || (!segment.showA && !segment.showLabel);
      const y1 = fromTop ? start.row.y : start.y + (isMotion ? 1.05 : 0.7);
      const y2 = segment.showHead
        ? end.y - 1.05
        : end.row.y + end.row.height;
      drawCameraStroke(ctx, start.x, y1, Math.max(y1, y2), {
        head: Boolean(segment.showHead),
      });
    }
  }
}

export function drawTimesheetSheet(ctx, sheetView) {
  fillPaper(ctx);
  drawHeader(ctx, sheetView.header);
  const leftBlock = blockGeometry("left");
  const rightBlock = blockGeometry("right");
  const leftCols = columnLayout(leftBlock);
  const rightCols = columnLayout(rightBlock);
  drawColHeaders(ctx, leftCols, leftBlock);
  drawColHeaders(ctx, rightCols, rightBlock);
  drawBlockGrid(ctx, leftBlock, leftCols, "left");
  drawBlockGrid(ctx, rightBlock, rightCols, "right");
  drawCellMarks(ctx, sheetView, leftCols, rightCols, leftBlock, rightBlock);
  drawCameraClips(ctx, sheetView, leftCols, rightCols, leftBlock, rightBlock);
}

export function paintTimesheetOnto(canvas, sheetView, pxPerMm = 2.4) {
  const scale = Math.max(1, pxPerMm);
  canvas.width = Math.round(PAGE_WIDTH_MM * scale);
  canvas.height = Math.round(PAGE_HEIGHT_MM * scale);
  const ctx = canvas.getContext("2d");
  setMmScale(ctx, scale);
  drawTimesheetSheet(ctx, sheetView);
}

export function renderTimesheetSheet(sheetView, pxPerMm = 3) {
  const { canvas, ctx } = createTimesheetCanvas(pxPerMm);
  drawTimesheetSheet(ctx, sheetView);
  return canvas;
}

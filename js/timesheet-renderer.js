import { FRAMES_PER_SECOND } from "./duration.js?v=m9-1";
import { TIMESHEET_FRAMES_PER_SHEET } from "./timesheet-model.js?v=m9-3";

export const PAGE_WIDTH_MM = 257;
export const PAGE_HEIGHT_MM = 364;

const IMG_W = 1455;
const IMG_H = 2048;

function mmX(px) {
  return (px / IMG_W) * PAGE_WIDTH_MM;
}

function mmY(py) {
  return (py / IMG_H) * PAGE_HEIGHT_MM;
}

const PAPER = "#f4e3b3";
const INK = "#b85a3c";
const INK_DARK = "#7a2c1c";
const TEXT = "#4e1c12";

const LINE_HAIR = 0.07;
const LINE_COL = 0.2;
const LINE_24 = 0.42;
const LINE_OUTER = 0.58;

const BLOCK_PX = 665;
const ACTION_PX = 170;
const S_PX = 49;
const CELL_PX = 296;
const CAMERA_PX = 150;

export const LAYOUT = {
  marginLeft: mmX(47),
  marginRight: mmX(48),
  blockGap: mmX(28),
  leftBlockWidth: mmX(665),
  rightBlockWidth: mmX(667),
  headerTop: mmY(31),
  headerBottom: mmY(137),
  gridTop: mmY(324),
  bodyTop: mmY(373),
  bottomMargin: mmY(35),
  gutterSec: 2.4,
  gutterFrame: 3.05,
  actionShare: ACTION_PX / BLOCK_PX,
  sShare: S_PX / BLOCK_PX,
  cellShare: CELL_PX / BLOCK_PX,
  cameraShare: CAMERA_PX / BLOCK_PX,
  headerBoundsPx: [47, 195, 532, 741, 952, 1084, 1218],
  headerRightPx: 1407,
};

LAYOUT.headerHeight = LAYOUT.headerBottom - LAYOUT.headerTop;
LAYOUT.colHeader = LAYOUT.bodyTop - LAYOUT.gridTop;

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
  return Math.max(0.55, mmValue * mm(ctx));
}

function strokeRect(ctx, x, y, w, h, widthMm = LINE_COL, color = INK) {
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth(ctx, widthMm);
  ctx.strokeRect(xpt(ctx, x), xpt(ctx, y), xpt(ctx, w), xpt(ctx, h));
}

function vline(ctx, xMm, y1Mm, y2Mm, widthMm, color = INK) {
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth(ctx, widthMm);
  ctx.beginPath();
  ctx.moveTo(xpt(ctx, xMm), xpt(ctx, y1Mm));
  ctx.lineTo(xpt(ctx, xMm), xpt(ctx, y2Mm));
  ctx.stroke();
}

function hline(ctx, x1Mm, x2Mm, yMm, widthMm, color = INK) {
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth(ctx, widthMm);
  ctx.beginPath();
  ctx.moveTo(xpt(ctx, x1Mm), xpt(ctx, yMm));
  ctx.lineTo(xpt(ctx, x2Mm), xpt(ctx, yMm));
  ctx.stroke();
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
  const y = LAYOUT.gridTop;
  const height = PAGE_HEIGHT_MM - LAYOUT.bottomMargin - y;
  if (side === "left") {
    return { x: LAYOUT.marginLeft, y, width: LAYOUT.leftBlockWidth, height };
  }
  return {
    x: LAYOUT.marginLeft + LAYOUT.leftBlockWidth + LAYOUT.blockGap,
    y,
    width: LAYOUT.rightBlockWidth,
    height,
  };
}

function columnLayout(block) {
  const timeWidth = LAYOUT.gutterSec + LAYOUT.gutterFrame;
  const contentWidth = block.width - timeWidth;
  const actionWidth = contentWidth * LAYOUT.actionShare;
  const sWidth = contentWidth * LAYOUT.sShare;
  const cellWidth = contentWidth * LAYOUT.cellShare;
  const cameraWidth = contentWidth * LAYOUT.cameraShare;
  let x = block.x;
  const sec = { x, width: LAYOUT.gutterSec };
  x += LAYOUT.gutterSec;
  const frame = { x, width: LAYOUT.gutterFrame };
  x += LAYOUT.gutterFrame;
  const action = { x, width: actionWidth, col: actionWidth / 6 };
  x += actionWidth;
  const s = { x, width: sWidth };
  x += sWidth;
  const cell = { x, width: cellWidth, col: cellWidth / 6 };
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

function headerColumns() {
  const xs = LAYOUT.headerBoundsPx.map(mmX);
  const cols = [
    { key: "episode", label: "話数" },
    { key: "title", label: "タイトル" },
    { key: "cut", label: "カット" },
    { key: "sec", label: "秒数" },
    { key: "genga", label: "原画" },
    { key: "satsuei", label: "撮影" },
  ];
  return cols.map((col, i) => ({
    ...col,
    x: xs[i],
    width: xs[i + 1] - xs[i],
  }));
}

function sheetBox() {
  const x = mmX(LAYOUT.headerBoundsPx[LAYOUT.headerBoundsPx.length - 1]);
  const right = mmX(LAYOUT.headerRightPx);
  return { x, width: right - x };
}

function drawHeader(ctx, header) {
  const y = LAYOUT.headerTop;
  const h = LAYOUT.headerHeight;
  const cols = headerColumns();
  const mainX = cols[0].x;
  const mainW = cols[cols.length - 1].x + cols[cols.length - 1].width - mainX;
  const sheet = sheetBox();
  strokeRect(ctx, mainX, y, mainW, h, LINE_OUTER, INK_DARK);
  strokeRect(ctx, sheet.x, y, sheet.width, h, LINE_OUTER, INK_DARK);
  const labelY = y + h * 0.28;
  const valueY = y + h * 0.68;
  const splitY = y + h * 0.46;
  const values = {
    episode: header.episodeNumber,
    title: header.title,
    cut: header.cutNumber,
    sec: header.durationLabel,
    genga: "",
    satsuei: "",
  };
  hline(ctx, mainX, mainX + mainW, splitY, LINE_HAIR, INK);
  hline(ctx, sheet.x, sheet.x + sheet.width, splitY, LINE_HAIR, INK);
  for (let i = 0; i < cols.length; i += 1) {
    const col = cols[i];
    if (i > 0) {
      vline(ctx, col.x, y, y + h, LINE_COL, INK);
    }
    drawText(ctx, col.label, col.x + col.width / 2, labelY, { sizeMm: 1.55 });
    drawText(ctx, values[col.key], col.x + col.width / 2, valueY, {
      sizeMm: col.key === "title" ? 3.05 : 2.95,
      bold: true,
    });
  }
  drawText(ctx, "シート", sheet.x + sheet.width / 2, labelY, { sizeMm: 1.55 });
  drawText(ctx, header.sheetLabel, sheet.x + sheet.width / 2, valueY, {
    sizeMm: 2.95,
    bold: true,
  });
}

function drawColHeaders(ctx, cols, block) {
  const y = block.y;
  const h = LAYOUT.colHeader;
  const labels = [
    { box: cols.action, text: "ACTION" },
    { box: cols.s, text: "S" },
    { box: cols.cell, text: "CELL" },
    { box: cols.camera, text: "CAMERA" },
  ];
  for (const item of labels) {
    strokeRect(ctx, item.box.x, y, item.box.width, h, LINE_COL, INK);
    drawText(ctx, item.text, item.box.x + item.box.width / 2, y + h * 0.34, {
      sizeMm: 1.42,
      bold: true,
    });
  }
  const subY = y + h * 0.74;
  for (let i = 0; i < 6; i += 1) {
    const letter = String.fromCharCode(65 + i);
    drawText(ctx, letter, cols.action.x + (i + 0.5) * cols.action.col, subY, {
      sizeMm: 1.32,
    });
    drawText(ctx, letter, cols.cell.x + (i + 0.5) * cols.cell.col, subY, {
      sizeMm: 1.32,
    });
  }
}

function drawBlockGrid(ctx, block, cols, side) {
  const bodyY = block.y + LAYOUT.colHeader;
  const bodyH = block.height - LAYOUT.colHeader;
  const rowH = bodyH / 72;
  strokeRect(ctx, block.x, block.y, block.width, block.height, LINE_OUTER, INK_DARK);

  for (let i = 0; i <= 72; i += 1) {
    const y = bodyY + i * rowH;
    const thick = i % FRAMES_PER_SECOND === 0;
    if (thick) {
      hline(ctx, block.x, block.x + block.width, y, LINE_24, INK_DARK);
      continue;
    }
    hline(ctx, block.x, cols.s.x, y, LINE_HAIR, INK);
    hline(ctx, cols.cell.x, block.x + block.width, y, LINE_HAIR, INK);
  }

  vline(ctx, cols.frame.x, block.y, block.y + block.height, LINE_COL, INK);
  vline(ctx, cols.action.x, block.y, block.y + block.height, LINE_COL, INK);
  vline(ctx, cols.s.x, block.y, block.y + block.height, LINE_COL, INK);
  vline(ctx, cols.cell.x, block.y, block.y + block.height, LINE_COL, INK);
  vline(ctx, cols.camera.x, block.y, block.y + block.height, LINE_COL, INK);

  for (let i = 1; i < 6; i += 1) {
    const ax = cols.action.x + i * cols.action.col;
    const cx = cols.cell.x + i * cols.cell.col;
    vline(ctx, ax, bodyY, block.y + block.height, LINE_HAIR, INK);
    vline(ctx, cx, bodyY, block.y + block.height, LINE_HAIR, INK);
  }

  const secondBase = side === "left" ? 1 : 4;
  for (let group = 0; group < 3; group += 1) {
    const secY = bodyY + (group * 24 + 12) * rowH;
    drawText(ctx, String(secondBase + group), cols.sec.x + cols.sec.width / 2, secY, {
      sizeMm: 2.35,
      bold: true,
      color: INK_DARK,
    });
    for (let f = 0; f < 24; f += 1) {
      const row = group * 24 + f;
      const fy = bodyY + (row + 0.5) * rowH;
      if (f === 0 || f === 5 || f === 11 || f === 17 || f === 23) {
        drawText(ctx, String(f + 1), cols.frame.x + cols.frame.width / 2, fy, {
          sizeMm: 1.28,
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
      drawCircledNumber(
        ctx,
        mark.panelNumber,
        cx,
        row.y + row.height / 2,
        Math.min(box.width * 0.72, row.height * 0.78, 3.35),
      );
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
    x: cols.camera.x + cols.camera.width * 0.34,
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
          sizeMm: isMotion ? 1.72 : 1.58,
          bold: true,
          align: "center",
        });
      }
      if (segment.showA) {
        drawText(ctx, "A", start.x, start.y, { sizeMm: 1.95, bold: true });
      }
      if (segment.showB) {
        drawText(ctx, "B", end.x, end.y, { sizeMm: 1.95, bold: true });
      }
      const fromTop = segment.continuesFromPrev || (!segment.showA && !segment.showLabel);
      const y1 = fromTop ? start.row.y : start.y + (isMotion ? 1.05 : 0.7);
      const y2 = segment.showHead ? end.y - 1.05 : end.row.y + end.row.height;
      drawCameraStroke(ctx, start.x, y1, Math.max(y1, y2), {
        head: Boolean(segment.showHead),
      });
    }
  }
}

export function getTimesheetLayoutInfo() {
  const left = blockGeometry("left");
  const right = blockGeometry("right");
  const leftCols = columnLayout(left);
  const rightCols = columnLayout(right);
  const headerCols = headerColumns();
  const sheet = sheetBox();
  const bodyH = left.height - LAYOUT.colHeader;
  return {
    page: { width: PAGE_WIDTH_MM, height: PAGE_HEIGHT_MM },
    conversion: {
      imagePx: { width: IMG_W, height: IMG_H },
      mmPerPxX: PAGE_WIDTH_MM / IMG_W,
      mmPerPxY: PAGE_HEIGHT_MM / IMG_H,
    },
    margins: {
      left: LAYOUT.marginLeft,
      right: LAYOUT.marginRight,
      bottom: LAYOUT.bottomMargin,
      gap: LAYOUT.blockGap,
    },
    header: {
      top: LAYOUT.headerTop,
      bottom: LAYOUT.headerBottom,
      height: LAYOUT.headerHeight,
      cols: headerCols.map((col) => ({
        key: col.key,
        label: col.label,
        x: col.x,
        width: col.width,
      })),
      sheet,
    },
    grid: {
      top: LAYOUT.gridTop,
      bodyTop: LAYOUT.bodyTop,
      colHeader: LAYOUT.colHeader,
      bottom: PAGE_HEIGHT_MM - LAYOUT.bottomMargin,
      bodyHeight: bodyH,
      rowHeight: bodyH / 72,
      line24: LAYOUT.bodyTop + (bodyH / 72) * 24,
      line48: LAYOUT.bodyTop + (bodyH / 72) * 48,
      line72: LAYOUT.bodyTop + bodyH,
    },
    left: {
      x: left.x,
      width: left.width,
      cols: {
        action: leftCols.action.width,
        actionCol: leftCols.action.col,
        s: leftCols.s.width,
        cell: leftCols.cell.width,
        cellCol: leftCols.cell.col,
        camera: leftCols.camera.width,
        time: leftCols.sec.width + leftCols.frame.width,
      },
    },
    right: {
      x: right.x,
      width: right.width,
      cols: {
        action: rightCols.action.width,
        actionCol: rightCols.action.col,
        s: rightCols.s.width,
        cell: rightCols.cell.width,
        cellCol: rightCols.cell.col,
        camera: rightCols.camera.width,
        time: rightCols.sec.width + rightCols.frame.width,
      },
    },
  };
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

export function paintTimesheetOnto(canvas, sheetView, pxPerMm = 4) {
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

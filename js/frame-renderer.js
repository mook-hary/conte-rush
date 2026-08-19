export const OUTPUT_ASPECT_WIDTH = 16;
export const OUTPUT_ASPECT_HEIGHT = 9;
export const OUTPUT_ASPECT = OUTPUT_ASPECT_WIDTH / OUTPUT_ASPECT_HEIGHT;
export const RUSH_CANVAS_WIDTH = 640;
export const RUSH_CANVAS_HEIGHT = 360;

export function rushCanvasPixelSize(devicePixelRatio = 1) {
  const scale = Math.min(Math.max(1, devicePixelRatio), 2);
  const width = Math.round(RUSH_CANVAS_WIDTH * scale);
  const height = Math.round((width * OUTPUT_ASPECT_HEIGHT) / OUTPUT_ASPECT_WIDTH);
  return { width, height };
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function baseViewportSize(imageWidth, imageHeight) {
  const width = Math.max(1, imageWidth);
  const height = Math.max(1, imageHeight);
  if (width / height >= OUTPUT_ASPECT) {
    return { width: height * OUTPUT_ASPECT, height };
  }
  return { width, height: width / OUTPUT_ASPECT };
}

export function clampPose(pose, imageWidth, imageHeight) {
  const scale = Math.max(1, Number(pose?.scale) || 1);
  const base = baseViewportSize(imageWidth, imageHeight);
  const viewWidth = base.width / scale;
  const viewHeight = base.height / scale;
  const minX = viewWidth / 2 / imageWidth;
  const maxX = 1 - minX;
  const minY = viewHeight / 2 / imageHeight;
  const maxY = 1 - minY;
  return {
    x: clamp(Number(pose?.x) || 0, Math.min(minX, maxX), Math.max(minX, maxX)),
    y: clamp(Number(pose?.y) || 0, Math.min(minY, maxY), Math.max(minY, maxY)),
    scale,
  };
}

export function poseToSourceRect(pose, imageWidth, imageHeight) {
  const clamped = clampPose(pose, imageWidth, imageHeight);
  const base = baseViewportSize(imageWidth, imageHeight);
  const viewWidth = base.width / clamped.scale;
  const viewHeight = base.height / clamped.scale;
  const sx = clamp(
    clamped.x * imageWidth - viewWidth / 2,
    0,
    Math.max(0, imageWidth - viewWidth),
  );
  const sy = clamp(
    clamped.y * imageHeight - viewHeight / 2,
    0,
    Math.max(0, imageHeight - viewHeight),
  );
  return { sx, sy, sw: viewWidth, sh: viewHeight };
}

export function sourceRectToPose(sx, sy, sw, sh, imageWidth, imageHeight) {
  const base = baseViewportSize(imageWidth, imageHeight);
  const scale = Math.max(1, base.width / Math.max(sw, 1));
  return clampPose(
    {
      x: (sx + sw / 2) / imageWidth,
      y: (sy + sh / 2) / imageHeight,
      scale,
    },
    imageWidth,
    imageHeight,
  );
}

export function presetPoses(kind, imageWidth, imageHeight) {
  if (kind === "tu") {
    return {
      from: clampPose({ x: 0.5, y: 0.5, scale: 1 }, imageWidth, imageHeight),
      to: clampPose({ x: 0.5, y: 0.5, scale: 1.5 }, imageWidth, imageHeight),
    };
  }
  if (kind === "tb") {
    return {
      from: clampPose({ x: 0.5, y: 0.5, scale: 1.5 }, imageWidth, imageHeight),
      to: clampPose({ x: 0.5, y: 0.5, scale: 1 }, imageWidth, imageHeight),
    };
  }

  let scale = 1;
  let from = clampPose({ x: 0.28, y: 0.5, scale }, imageWidth, imageHeight);
  let to = clampPose({ x: 0.72, y: 0.5, scale }, imageWidth, imageHeight);
  if (Math.hypot(to.x - from.x, to.y - from.y) < 0.02) {
    scale = 1.25;
    from = clampPose({ x: 0.28, y: 0.5, scale }, imageWidth, imageHeight);
    to = clampPose({ x: 0.72, y: 0.5, scale }, imageWidth, imageHeight);
  }
  return { from, to };
}

function drawContain(ctx, image, width, height) {
  const scale = Math.min(width / image.width, height / image.height);
  const dw = image.width * scale;
  const dh = image.height * scale;
  const dx = (width - dw) / 2;
  const dy = (height - dh) / 2;
  ctx.drawImage(image, 0, 0, image.width, image.height, dx, dy, dw, dh);
}

// Caller supplies a 16:9 canvas (Rush / 将来 MP4). pose null = contain, pose = crop fill.
export function renderFrame({ canvas, image, pose }) {
  if (!canvas) {
    return;
  }
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return;
  }
  const width = canvas.width;
  const height = canvas.height;
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, width, height);
  if (!image || image.width < 1 || image.height < 1) {
    return;
  }
  if (!pose) {
    drawContain(ctx, image, width, height);
    return;
  }
  const source = poseToSourceRect(pose, image.width, image.height);
  ctx.drawImage(
    image,
    source.sx,
    source.sy,
    source.sw,
    source.sh,
    0,
    0,
    width,
    height,
  );
}

import { decodeImageBlob } from "./panel-image-provider.js?v=m10-1";

export const ALLOWED_UPLOAD_MIMES = ["image/png", "image/jpeg", "image/webp"];

const EXTENSION_MIME = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
};

export function resolveUploadMime(file) {
  const type = String(file?.type ?? "")
    .trim()
    .toLowerCase();
  if (ALLOWED_UPLOAD_MIMES.includes(type)) {
    return type;
  }
  const name = String(file?.name ?? "").toLowerCase();
  const match = name.match(/\.([a-z0-9]+)$/);
  return match ? (EXTENSION_MIME[match[1]] ?? "") : "";
}

export async function decodeUploadedFile(file) {
  if (!file) {
    throw new Error("画像ファイルを選んでください。");
  }
  const mimeType = resolveUploadMime(file);
  if (!mimeType) {
    throw new Error("PNG / JPEG / WebP のみ読み込めます。");
  }
  const image = await decodeImageBlob(file);
  const width = image.width || image.naturalWidth || 0;
  const height = image.height || image.naturalHeight || 0;
  if (width < 1 || height < 1) {
    throw new Error("画像を読み込めませんでした。");
  }
  return {
    blob: file,
    mimeType,
    width,
    height,
    image,
  };
}

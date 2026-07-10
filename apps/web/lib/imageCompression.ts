/**
 * Client-side image compression for receipt uploads. Downscales and
 * re-encodes images as JPEG so a phone photo (~4–12 MB) lands well under the
 * 5 MB server limit. PDFs and non-images pass through untouched.
 */
import { ATTACHMENT_MAX_SIZE_BYTES, isAllowedAttachmentMimeType } from "./attachments";

const DEFAULT_MAX_DIMENSION = 2000;
const DEFAULT_TARGET_BYTES = 1024 * 1024;
const QUALITY_STEPS = [0.85, 0.7, 0.6, 0.5];

export class UnsupportedAttachmentError extends Error {
  constructor(fileName: string) {
    super(`Unsupported attachment type: ${fileName}`);
    this.name = "UnsupportedAttachmentError";
  }
}

async function decodeImage(file: File): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === "function") {
    try {
      return await createImageBitmap(file);
    } catch {
      // Fall through to the <img> fallback below.
    }
  }
  return await new Promise<HTMLImageElement>((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Image decode failed"));
    };
    img.src = url;
  });
}

function toBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
}

/**
 * Compress an image file to JPEG. Returns the original file for PDFs and
 * non-image types. If the image cannot be decoded (e.g. HEIC outside Safari),
 * the original is returned when its type is whitelisted and small enough —
 * otherwise an UnsupportedAttachmentError is thrown.
 */
export async function compressImage(
  file: File,
  opts?: { maxDimension?: number; targetBytes?: number }
): Promise<File> {
  if (!file.type.startsWith("image/")) return file;

  const maxDimension = opts?.maxDimension ?? DEFAULT_MAX_DIMENSION;
  const targetBytes = opts?.targetBytes ?? DEFAULT_TARGET_BYTES;

  let source: ImageBitmap | HTMLImageElement;
  try {
    source = await decodeImage(file);
  } catch {
    if (isAllowedAttachmentMimeType(file.type) && file.size <= ATTACHMENT_MAX_SIZE_BYTES) {
      return file;
    }
    throw new UnsupportedAttachmentError(file.name);
  }

  const sourceWidth = "naturalWidth" in source ? source.naturalWidth : source.width;
  const sourceHeight = "naturalHeight" in source ? source.naturalHeight : source.height;
  const scale = Math.min(1, maxDimension / Math.max(sourceWidth, sourceHeight));

  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(sourceWidth * scale));
  canvas.height = Math.max(1, Math.round(sourceHeight * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    if (isAllowedAttachmentMimeType(file.type) && file.size <= ATTACHMENT_MAX_SIZE_BYTES) {
      return file;
    }
    throw new UnsupportedAttachmentError(file.name);
  }
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  if ("close" in source) source.close();

  let blob: Blob | null = null;
  for (const quality of QUALITY_STEPS) {
    blob = await toBlob(canvas, quality);
    if (blob && blob.size <= targetBytes) break;
  }
  if (!blob) {
    if (isAllowedAttachmentMimeType(file.type) && file.size <= ATTACHMENT_MAX_SIZE_BYTES) {
      return file;
    }
    throw new UnsupportedAttachmentError(file.name);
  }

  const baseName = file.name.replace(/\.[^.]+$/, "") || "beleg";
  return new File([blob], `${baseName}.jpg`, { type: "image/jpeg" });
}

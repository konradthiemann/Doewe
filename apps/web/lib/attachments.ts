/**
 * Shared constants and helpers for transaction receipt attachments (Belege).
 * Isomorphic: imported by API route handlers and client components.
 */

export const ATTACHMENT_ALLOWED_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf"
] as const;

export const ATTACHMENT_MAX_SIZE_BYTES = 5 * 1024 * 1024;

export const ATTACHMENTS_MAX_PER_TRANSACTION = 5;

export function isAllowedAttachmentMimeType(mimeType: string): boolean {
  return (ATTACHMENT_ALLOWED_MIME_TYPES as readonly string[]).includes(mimeType);
}

/**
 * Strip characters that would break the Content-Disposition header or allow
 * path traversal. Falls back to "beleg" for empty results.
 */
export function sanitizeAttachmentFileName(name: string): string {
  const cleaned = name
    .replace(/[/\\]/g, "_")
    .replace(/["\r\n]/g, "")
    .trim()
    .slice(0, 200);
  return cleaned || "beleg";
}

export interface AttachmentMeta {
  id: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  createdAt?: string;
}

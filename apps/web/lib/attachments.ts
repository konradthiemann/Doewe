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

/** Hard budget for the total receipt bytes embedded in one tax PDF export (F2). */
export const TAX_EXPORT_MAX_RECEIPT_BYTES = 50 * 1024 * 1024;

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

/** Human-readable file size, e.g. "482 KB" / "1.3 MB". */
export function formatAttachmentBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export interface AttachmentMeta {
  id: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  createdAt?: string;
}

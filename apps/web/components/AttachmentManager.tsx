"use client";

import { useQueryClient } from "@tanstack/react-query";
import React, { useRef, useState } from "react";

import { useApiQuery } from "../lib/api/useApiQuery";
import {
  ATTACHMENTS_MAX_PER_TRANSACTION,
  ATTACHMENT_MAX_SIZE_BYTES,
  formatAttachmentBytes,
  isAllowedAttachmentMimeType,
  type AttachmentMeta,
} from "../lib/attachments";
import { useI18n } from "../lib/i18n";
import { compressImage, UnsupportedAttachmentError } from "../lib/imageCompression";

import { Spinner } from "./ui/Spinner";

type Props = {
  mode: "create" | "edit";
  transactionId?: string;
  pendingFiles: File[];
  onPendingFilesChange: (files: File[]) => void;
};

export async function uploadAttachment(transactionId: string, file: File): Promise<Response> {
  const body = new FormData();
  body.append("file", file);
  return fetch(`/api/transactions/${transactionId}/attachments`, { method: "POST", body });
}

function FileIcon({ mimeType }: { mimeType: string }) {
  const isPdf = mimeType === "application/pdf";
  return (
    <svg aria-hidden viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="h-4 w-4 shrink-0">
      {isPdf ? (
        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m6.75 12H9m1.5-15H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
      ) : (
        <path strokeLinecap="round" strokeLinejoin="round" d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 0 0 1.5-1.5V6a1.5 1.5 0 0 0-1.5-1.5H3.75A1.5 1.5 0 0 0 2.25 6v12a1.5 1.5 0 0 0 1.5 1.5Zm10.5-11.25h.008v.008h-.008V8.25Z" />
      )}
    </svg>
  );
}

/**
 * Beleg-Verwaltung im Transaktionsformular. Im Edit-Mode werden Dateien sofort
 * hochgeladen/gelöscht; im Create-Mode werden sie gequeued (pendingFiles) und
 * vom Formular nach erfolgreichem Anlegen der Transaktion hochgeladen.
 */
export default function AttachmentManager({ mode, transactionId, pendingFiles, onPendingFilesChange }: Props) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Nur im Edit-Mode laden; Ladefehler sind wie zuvor unkritisch (leere Liste).
  const attachmentsKey = ["attachments", transactionId] as const;
  const attachmentsQuery = useApiQuery<AttachmentMeta[]>(
    attachmentsKey,
    `/api/transactions/${transactionId}/attachments`,
    { enabled: mode === "edit" && Boolean(transactionId) }
  );
  const existing = attachmentsQuery.data ?? [];

  const totalCount = existing.length + pendingFiles.length;

  async function handleSelected(fileList: FileList | null) {
    setError(null);
    if (!fileList || fileList.length === 0) return;

    const files = Array.from(fileList);
    if (totalCount + files.length > ATTACHMENTS_MAX_PER_TRANSACTION) {
      setError(t("transactionForm.attachmentsLimit", { max: ATTACHMENTS_MAX_PER_TRANSACTION }));
      return;
    }

    setBusy(true);
    try {
      const prepared: File[] = [];
      for (const file of files) {
        let processed: File;
        try {
          processed = await compressImage(file);
        } catch (err) {
          setError(
            err instanceof UnsupportedAttachmentError
              ? t("transactionForm.attachmentsBadType")
              : t("transactionForm.attachmentsError")
          );
          return;
        }
        if (!isAllowedAttachmentMimeType(processed.type)) {
          setError(t("transactionForm.attachmentsBadType"));
          return;
        }
        if (processed.size > ATTACHMENT_MAX_SIZE_BYTES) {
          setError(t("transactionForm.attachmentsTooLarge"));
          return;
        }
        prepared.push(processed);
      }

      if (mode === "create") {
        onPendingFilesChange([...pendingFiles, ...prepared]);
        return;
      }

      // Edit-Mode: sofort hochladen
      let uploadedCount = 0;
      for (const file of prepared) {
        const res = await uploadAttachment(transactionId as string, file);
        if (!res.ok) {
          setError(t("transactionForm.attachmentsUploadFailed", { status: res.status }));
          break;
        }
        uploadedCount += 1;
      }
      if (uploadedCount > 0) {
        // Belege erscheinen auch auf der Steuer-Seite → beide Ressourcen invalidieren
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: attachmentsKey }),
          queryClient.invalidateQueries({ queryKey: ["tax"] })
        ]);
      }
    } finally {
      setBusy(false);
    }
  }

  async function handleDeleteExisting(id: string) {
    setError(null);
    // Optimistisch aus dem Cache entfernen, bei Fehlschlag zurückrollen
    const previous = queryClient.getQueryData<AttachmentMeta[]>(attachmentsKey);
    queryClient.setQueryData<AttachmentMeta[]>(attachmentsKey, (current) =>
      current?.filter((a) => a.id !== id)
    );
    try {
      const res = await fetch(`/api/attachments/${id}`, { method: "DELETE" });
      if (!res.ok && res.status !== 204) {
        queryClient.setQueryData(attachmentsKey, previous);
        setError(t("transactionForm.attachmentsDeleteFailed", { status: res.status }));
        return;
      }
      // Belege erscheinen auch auf der Steuer-Seite → beide Ressourcen invalidieren
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: attachmentsKey }),
        queryClient.invalidateQueries({ queryKey: ["tax"] })
      ]);
    } catch {
      queryClient.setQueryData(attachmentsKey, previous);
      setError(t("transactionForm.attachmentsDeleteFailed", { status: 0 }));
    }
  }

  function handleRemovePending(index: number) {
    onPendingFilesChange(pendingFiles.filter((_, i) => i !== index));
  }

  const chipClass =
    "flex items-center gap-2 rounded-field border border-line bg-surface-2 px-2 py-1.5 text-xs text-ink";
  const removeButtonClass =
    "ml-auto rounded p-0.5 text-ink-muted hover:bg-surface-2 hover:text-danger focus:outline-none focus-visible:ring focus-visible:ring-danger";

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">{t("transactionForm.attachmentsTitle")}</p>
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(event) => {
          void handleSelected(event.target.files);
          event.target.value = "";
        }}
      />
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,application/pdf"
        multiple
        className="hidden"
        onChange={(event) => {
          void handleSelected(event.target.files);
          event.target.value = "";
        }}
      />
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => cameraInputRef.current?.click()}
          disabled={busy || totalCount >= ATTACHMENTS_MAX_PER_TRANSACTION}
          className="inline-flex items-center gap-1.5 rounded-field border border-line-strong px-3 py-1.5 text-sm font-medium text-ink hover:bg-surface-2 disabled:opacity-50 focus:outline-none focus-visible:ring focus-visible:ring-brand"
        >
          <svg aria-hidden viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="h-4 w-4">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 0 1 5.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 0 0-1.134-.175 2.31 2.31 0 0 1-1.64-1.055l-.822-1.316a2.192 2.192 0 0 0-1.736-1.039 48.774 48.774 0 0 0-5.232 0 2.192 2.192 0 0 0-1.736 1.039l-.821 1.316Z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 1 1-9 0 4.5 4.5 0 0 1 9 0Z" />
          </svg>
          {t("transactionForm.attachmentsTakePhoto")}
        </button>
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={busy || totalCount >= ATTACHMENTS_MAX_PER_TRANSACTION}
          className="inline-flex items-center gap-1.5 rounded-field border border-line-strong px-3 py-1.5 text-sm font-medium text-ink hover:bg-surface-2 disabled:opacity-50 focus:outline-none focus-visible:ring focus-visible:ring-brand"
        >
          <svg aria-hidden viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="h-4 w-4">
            <path strokeLinecap="round" strokeLinejoin="round" d="m18.375 12.739-7.693 7.693a4.5 4.5 0 0 1-6.364-6.364l10.94-10.94A3 3 0 1 1 19.5 7.372L8.552 18.32m.009-.01-.01.01m5.699-9.941-7.81 7.81a1.5 1.5 0 0 0 2.112 2.13" />
          </svg>
          {t("transactionForm.attachmentsChooseFile")}
        </button>
      </div>
      {busy && (
        <p className="flex items-center gap-2 text-xs text-ink-muted" role="status">
          <Spinner size="sm" />
          {t("transactionForm.attachmentsUploading")}
        </p>
      )}
      {(existing.length > 0 || pendingFiles.length > 0) && (
        <ul className="space-y-1.5">
          {existing.map((attachment) => (
            <li key={attachment.id} className={chipClass}>
              <FileIcon mimeType={attachment.mimeType} />
              <a
                href={`/api/attachments/${attachment.id}`}
                target="_blank"
                rel="noreferrer"
                className="truncate font-medium text-brand hover:underline"
                title={t("transactionForm.attachmentsOpen")}
              >
                {attachment.fileName}
              </a>
              <span className="shrink-0 text-ink-faint">{formatAttachmentBytes(attachment.sizeBytes)}</span>
              <button
                type="button"
                onClick={() => handleDeleteExisting(attachment.id)}
                aria-label={t("transactionForm.attachmentsDelete")}
                className={removeButtonClass}
              >
                ×
              </button>
            </li>
          ))}
          {pendingFiles.map((file, index) => (
            <li key={`${file.name}-${index}`} className={chipClass}>
              <FileIcon mimeType={file.type} />
              <span className="truncate font-medium">{file.name}</span>
              <span className="shrink-0 text-ink-faint">{formatAttachmentBytes(file.size)}</span>
              <button
                type="button"
                onClick={() => handleRemovePending(index)}
                aria-label={t("transactionForm.attachmentsDelete")}
                className={removeButtonClass}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

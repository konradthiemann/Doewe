"use client";

import { useRef, useState } from "react";

import { useI18n } from "../lib/i18n";

import { Button } from "./ui/Button";
import { useToast } from "./ui/Toast";

interface ScanResult {
  merchant: string | null;
  date: string;
  items: Array<{
    name: string;
    quantity: number;
    unitPriceCents: number;
    totalCents: number;
    suggestedCategory?: string;
  }>;
  totalCents: number;
  _stub?: boolean;
}

interface Props {
  onScanResult: (result: ScanResult, image: File) => void;
  categories: Array<{ id: string; name: string }>;
}

type Translate = (key: string, vars?: Record<string, string | number>) => string;

/** Maps POST /api/receipt-scan error codes to translated, user-facing messages. */
function mapScanErrorToMessage(errorCode: unknown, t: Translate): string {
  if (errorCode === "AI_UNAVAILABLE") return t("receiptScanner.errorAiUnavailable");
  if (errorCode === "RATE_LIMITED") return t("receiptScanner.errorRateLimited");
  return t("receiptScanner.error");
}

export default function ReceiptScanner({ onScanResult }: Props) {
  const { t } = useI18n();
  const toast = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [scanning, setScanning] = useState(false);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setSelectedFile(file);
    const url = URL.createObjectURL(file);
    setPreview(url);
  };

  const handleScan = async () => {
    if (!selectedFile) return;
    setScanning(true);

    try {
      const formData = new FormData();
      formData.append("file", selectedFile);

      const res = await fetch("/api/receipt-scan", { method: "POST", body: formData });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Unknown error" }));
        toast.error(mapScanErrorToMessage(err.error, t));
        return;
      }

      const result: ScanResult = await res.json();

      if (result._stub) {
        toast.info(t("receiptScanner.manualMode"));
      }

      onScanResult(result, selectedFile);
    } catch {
      toast.error(t("receiptScanner.error"));
    } finally {
      setScanning(false);
    }
  };

  const handleClear = () => {
    setPreview(null);
    setSelectedFile(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (cameraInputRef.current) cameraInputRef.current.value = "";
  };

  return (
    <div className="space-y-6">
      {!preview ? (
        <div className="flex flex-col items-center gap-4 rounded-card border-2 border-dashed border-line p-8">
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            className="h-12 w-12 text-ink-faint"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
            <circle cx="12" cy="13" r="4" />
          </svg>
          <p className="text-center text-sm text-ink-muted">
            {t("receiptScanner.uploadHint")}
          </p>
          <div className="flex gap-3">
            <Button
              variant="primary"
              size="md"
              onClick={() => cameraInputRef.current?.click()}
            >
              {t("receiptScanner.takePhoto")}
            </Button>
            <Button
              variant="secondary"
              size="md"
              onClick={() => fileInputRef.current?.click()}
            >
              {t("receiptScanner.chooseFile")}
            </Button>
          </div>
          <input
            ref={cameraInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={handleFileChange}
          />
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,application/pdf"
            className="hidden"
            onChange={handleFileChange}
          />
        </div>
      ) : (
        <div className="space-y-4">
          <div className="relative overflow-hidden rounded-card border border-line">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={preview}
              alt={t("receiptScanner.previewAlt")}
              className="max-h-80 w-full object-contain bg-surface-2"
            />
          </div>

          <div className="flex gap-3">
            <Button variant="secondary" size="md" onClick={handleClear}>
              {t("receiptScanner.retake")}
            </Button>
            <Button
              variant="primary"
              size="md"
              loading={scanning}
              onClick={handleScan}
              className="flex-1"
            >
              {scanning ? t("receiptScanner.analyzing") : t("receiptScanner.analyze")}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

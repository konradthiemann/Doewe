"use client";

import { useQuery } from "@tanstack/react-query";
import { redirect } from "next/navigation";
import { useRouter } from "next/navigation";
import { useState } from "react";

import ReceiptReview from "../../components/ReceiptReview";
import ReceiptScanner from "../../components/ReceiptScanner";
import { useI18n } from "../../lib/i18n";

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

const isEnabled = process.env.NEXT_PUBLIC_RECEIPT_SCANNER_ENABLED === "1";

export default function ScanPage() {
  if (!isEnabled) redirect("/");

  const { t } = useI18n();
  const router = useRouter();
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [receiptImage, setReceiptImage] = useState<File | null>(null);

  const { data: categories } = useQuery({
    queryKey: ["categories"],
    queryFn: () => fetch("/api/categories").then((r) => r.json())
  });

  const { data: accounts } = useQuery({
    queryKey: ["accounts"],
    queryFn: () => fetch("/api/accounts").then((r) => r.json())
  });

  if (scanResult && categories?.length && accounts?.length) {
    return (
      <ReceiptReview
        scanResult={scanResult}
        categories={categories}
        accounts={accounts}
        receiptImage={receiptImage}
        onBack={() => setScanResult(null)}
        onComplete={() => router.push("/transactions")}
      />
    );
  }

  return (
    <div className="mx-auto max-w-lg px-4 py-6">
      <h1 className="mb-6 text-xl font-bold text-ink">
        {t("receiptScanner.title")}
      </h1>
      <ReceiptScanner
        onScanResult={(result, image) => {
          setScanResult(result);
          setReceiptImage(image);
        }}
        categories={categories ?? []}
      />
    </div>
  );
}

"use client";

import { signOut, useSession } from "next-auth/react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { useI18n } from "../../lib/i18n";

type Category = { id: string; name: string; isIncome: boolean };

export default function SettingsPage() {
  const { data } = useSession();
  const { locale, setLocale, t } = useI18n();

  const [categories, setCategories] = useState<Category[]>([]);
  const [catLoading, setCatLoading] = useState(false);
  const [catError, setCatError] = useState<string | null>(null);
  const [catMessage, setCatMessage] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState<Record<string, string>>({});
  const [mergeTarget, setMergeTarget] = useState<Record<string, string>>({});
  const [fallbackTarget, setFallbackTarget] = useState<Record<string, string>>({});
  const [fallbackName, setFallbackName] = useState<Record<string, string>>({});
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set());

  const setBusy = useCallback((id: string, busy: boolean) => {
    setBusyIds((current) => {
      const next = new Set(current);
      if (busy) {
        next.add(id);
      } else {
        next.delete(id);
      }
      return next;
    });
  }, []);

  const refreshCategories = useCallback(async () => {
    setCatLoading(true);
    setCatError(null);
    try {
      const res = await fetch("/api/categories", { cache: "no-store" });
      if (!res.ok) {
        setCatError(t("settings.categories.errorLoad", { status: res.status }));
        setCategories([]);
        return;
      }
      const data: Category[] = await res.json();
      const sorted = [...data].sort((a, b) => a.name.localeCompare(b.name));
      setCategories(sorted);
      setRenameDraft(Object.fromEntries(sorted.map((c) => [c.id, c.name])));
    } catch {
      setCatError(t("settings.categories.errorLoadFallback"));
    } finally {
      setCatLoading(false);
    }
  }, [t]);

  useEffect(() => {
    refreshCategories();
  }, [refreshCategories]);

  const otherCategories = useCallback(
    (currentId: string) => categories.filter((c) => c.id !== currentId),
    [categories]
  );

  const handleRename = async (id: string) => {
    const name = (renameDraft[id] || "").trim();
    if (!name) {
      setCatError(t("settings.categories.errorNameRequired"));
      return;
    }
    setBusy(id, true);
    setCatError(null);
    setCatMessage(null);
    try {
      const res = await fetch(`/api/categories/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name })
      });
      if (!res.ok) {
        setCatError(t("settings.categories.errorUpdate", { status: res.status }));
        return;
      }
      setCatMessage(t("settings.categories.messageUpdated"));
      await refreshCategories();
    } finally {
      setBusy(id, false);
    }
  };

  const handleMerge = async (id: string) => {
    const targetId = mergeTarget[id];
    if (!targetId) {
      setCatError(t("settings.categories.errorMergeTarget"));
      return;
    }
    setBusy(id, true);
    setCatError(null);
    setCatMessage(null);
    try {
      const res = await fetch(`/api/categories/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mergeIntoCategoryId: targetId })
      });
      if (!res.ok) {
        setCatError(t("settings.categories.errorMerge", { status: res.status }));
        return;
      }
      setCatMessage(t("settings.categories.messageMerged"));
      await refreshCategories();
    } finally {
      setBusy(id, false);
    }
  };

  const handleDelete = async (id: string) => {
    const fallbackId = fallbackTarget[id];
    const fallbackNewName = (fallbackName[id] || "").trim();
    if (!fallbackId && !fallbackNewName) {
      setCatError(t("settings.categories.errorFallbackRequired"));
      return;
    }
    if (fallbackId === id) {
      setCatError(t("settings.categories.errorFallbackSame"));
      return;
    }
    setBusy(id, true);
    setCatError(null);
    setCatMessage(null);
    try {
      const res = await fetch(`/api/categories/${id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fallbackCategoryId: fallbackId || undefined, fallbackName: fallbackNewName || undefined })
      });
      if (!res.ok) {
        setCatError(t("settings.categories.errorDelete", { status: res.status }));
        return;
      }
      setCatMessage(t("settings.categories.messageDeleted"));
      await refreshCategories();
    } finally {
      setBusy(id, false);
    }
  };

  const isBusy = useCallback((id: string) => busyIds.has(id), [busyIds]);

  const noCategories = useMemo(() => !catLoading && categories.length === 0, [catLoading, categories.length]);

  return (
    <main id="maincontent" className="p-6 space-y-6">
      <div className="rounded-xl border border-gray-200 bg-white/95 p-4 shadow-sm dark:border-neutral-700 dark:bg-neutral-900/95">
        <h2 className="text-lg font-medium">{t("settings.accountTitle")}</h2>
        <p className="text-sm text-gray-600 dark:text-neutral-300">
          {t("settings.signedInAs", { email: data?.user?.email ?? t("settings.unknown") })}
        </p>
        <button
          type="button"
          onClick={() => signOut({ callbackUrl: "/login" })}
          className="mt-3 inline-flex items-center rounded-md bg-red-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-red-500 focus:outline-none focus-visible:ring focus-visible:ring-red-500 focus-visible:ring-offset-2"
        >
          {t("auth.signOut")}
        </button>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white/95 p-4 shadow-sm dark:border-neutral-700 dark:bg-neutral-900/95">
        <h2 className="text-lg font-medium">{t("settings.languageTitle")}</h2>
        <p className="text-sm text-gray-600 dark:text-neutral-300">{t("settings.languageDescription")}</p>
        <div className="mt-3">
          <label htmlFor="settings-language" className="sr-only">
            {t("settings.languageTitle")}
          </label>
          <select
            id="settings-language"
            value={locale}
            onChange={(event) => setLocale(event.target.value === "en" ? "en" : "de")}
            className="w-full max-w-xs rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-indigo-500 focus:outline-none focus-visible:ring focus-visible:ring-indigo-500 focus-visible:ring-offset-2 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
          >
            <option value="de">{t("settings.languageOptionDe")}</option>
            <option value="en">{t("settings.languageOptionEn")}</option>
          </select>
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white/95 p-4 shadow-sm space-y-4 dark:border-neutral-700 dark:bg-neutral-900/95">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-medium">{t("settings.categories.title")}</h2>
            <p className="text-sm text-gray-600 dark:text-neutral-300">{t("settings.categories.subtitle")}</p>
          </div>
          <button
            type="button"
            onClick={refreshCategories}
            className="inline-flex items-center rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 transition hover:bg-gray-50 focus:outline-none focus-visible:ring focus-visible:ring-indigo-500 focus-visible:ring-offset-2 dark:border-neutral-600 dark:text-neutral-100 dark:hover:bg-neutral-800"
          >
            {catLoading ? t("settings.categories.loading") : t("settings.categories.refresh")}
          </button>
        </div>

        {catError && <p className="text-sm text-red-600" role="alert">{catError}</p>}
        {catMessage && <p className="text-sm text-green-700" role="status">{catMessage}</p>}

        {catLoading && <p className="text-sm text-gray-600 dark:text-neutral-300">{t("settings.categories.loading")}</p>}
        {noCategories && <p className="text-sm text-gray-600 dark:text-neutral-300">{t("settings.categories.listEmpty")}</p>}

        <div className="space-y-3">
          {categories.map((category) => (
            <div key={category.id} className="rounded-lg border border-gray-200 bg-white/80 p-3 shadow-sm dark:border-neutral-700 dark:bg-neutral-900/80">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold text-gray-900 dark:text-neutral-100">{category.name}</p>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                    category.isIncome ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-200" : "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200"
                  }`}>
                    {category.isIncome ? t("settings.categories.badgeIncome") : t("settings.categories.badgeOutcome")}
                  </span>
                </div>
                {isBusy(category.id) && (
                  <span className="text-xs text-gray-500 dark:text-neutral-400">{t("settings.categories.working")}</span>
                )}
              </div>

              <div className="mt-3 grid gap-2 sm:grid-cols-3">
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium text-gray-700 dark:text-neutral-200" htmlFor={`rename-${category.id}`}>
                    {t("settings.categories.renameLabel")}
                  </label>
                  <div className="flex gap-2">
                    <input
                      id={`rename-${category.id}`}
                      value={renameDraft[category.id] ?? category.name}
                      onChange={(event) => setRenameDraft((current) => ({ ...current, [category.id]: event.target.value }))}
                      className="w-full rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
                    />
                    <button
                      type="button"
                      onClick={() => handleRename(category.id)}
                      disabled={isBusy(category.id)}
                      className="inline-flex items-center rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-indigo-500 focus:outline-none focus-visible:ring focus-visible:ring-indigo-500 focus-visible:ring-offset-2 disabled:opacity-60"
                    >
                      {t("settings.categories.renameSubmit")}
                    </button>
                  </div>
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium text-gray-700 dark:text-neutral-200" htmlFor={`merge-${category.id}`}>
                    {t("settings.categories.mergeLabel")}
                  </label>
                  <div className="flex gap-2">
                    <select
                      id={`merge-${category.id}`}
                      value={mergeTarget[category.id] ?? ""}
                      onChange={(event) => setMergeTarget((current) => ({ ...current, [category.id]: event.target.value }))}
                      className="w-full rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
                    >
                      <option value="">{t("settings.categories.selectPlaceholder")}</option>
                      {otherCategories(category.id).map((option) => (
                        <option key={option.id} value={option.id}>
                          {option.name}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => handleMerge(category.id)}
                      disabled={isBusy(category.id)}
                      className="inline-flex items-center rounded-md border border-gray-300 px-3 py-1.5 text-xs font-semibold text-gray-800 shadow-sm transition hover:bg-gray-50 focus:outline-none focus-visible:ring focus-visible:ring-indigo-500 focus-visible:ring-offset-2 disabled:opacity-60 dark:border-neutral-600 dark:text-neutral-100 dark:hover:bg-neutral-800"
                    >
                      {t("settings.categories.mergeSubmit")}
                    </button>
                  </div>
                  <p className="text-xs text-gray-500 dark:text-neutral-400">{t("settings.categories.mergeHint")}</p>
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium text-gray-700 dark:text-neutral-200" htmlFor={`fallback-${category.id}`}>
                    {t("settings.categories.deleteLabel")}
                  </label>
                  <div className="flex gap-2">
                    <select
                      id={`fallback-${category.id}`}
                      value={fallbackTarget[category.id] ?? ""}
                      onChange={(event) => setFallbackTarget((current) => ({ ...current, [category.id]: event.target.value }))}
                      className="w-1/2 rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
                    >
                      <option value="">{t("settings.categories.selectPlaceholder")}</option>
                      {otherCategories(category.id).map((option) => (
                        <option key={option.id} value={option.id}>
                          {option.name}
                        </option>
                      ))}
                    </select>
                    <input
                      placeholder={t("settings.categories.fallbackNamePlaceholder")}
                      value={fallbackName[category.id] ?? ""}
                      onChange={(event) => setFallbackName((current) => ({ ...current, [category.id]: event.target.value }))}
                      className="w-full rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
                    />
                    <button
                      type="button"
                      onClick={() => handleDelete(category.id)}
                      disabled={isBusy(category.id)}
                      className="inline-flex items-center rounded-md bg-red-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-red-500 focus:outline-none focus-visible:ring focus-visible:ring-red-500 focus-visible:ring-offset-2 disabled:opacity-60"
                    >
                      {t("settings.categories.deleteSubmit")}
                    </button>
                  </div>
                  <p className="text-xs text-gray-500 dark:text-neutral-400">{t("settings.categories.deleteHint")}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}

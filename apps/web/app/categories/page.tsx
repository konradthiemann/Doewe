"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo, useState } from "react";

import PageContainer from "../../components/PageContainer";
import { useApiQuery } from "../../lib/api/useApiQuery";
import { useI18n } from "../../lib/i18n";

type Category = { id: string; name: string; isIncome: boolean; isTaxRelevant: boolean };

// Protected category names that cannot be modified or deleted
const PROTECTED_CATEGORY_NAMES = ["savings", "sparen"];

function isProtectedCategory(name: string): boolean {
  return PROTECTED_CATEGORY_NAMES.includes(name.toLowerCase().trim());
}

export default function CategoriesPage() {
  const { t } = useI18n();

  const queryClient = useQueryClient();
  // Mutationsfehler laufen nicht über die Query — separat halten
  const [mutationError, setMutationError] = useState<string | null>(null);
  const [catMessage, setCatMessage] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState<Record<string, string>>({});
  const [mergeTarget, setMergeTarget] = useState<Record<string, string>>({});
  const [fallbackTarget, setFallbackTarget] = useState<Record<string, string>>({});
  const [fallbackName, setFallbackName] = useState<Record<string, string>>({});
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set());
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());

  const toggleCategoryExpanded = useCallback((id: string) => {
    setExpandedCategories((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

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

  // Phase 2 „Offline lesen": Kategorien aus dem persistierten Query-Cache —
  // offline zeigt die Seite den letzten geladenen Stand.
  const categoriesQuery = useApiQuery<Category[]>(["categories"], "/api/categories");
  const categories = useMemo(
    () => [...(categoriesQuery.data ?? [])].sort((a, b) => a.name.localeCompare(b.name)),
    [categoriesQuery.data]
  );
  const catLoading = categoriesQuery.isFetching;
  const loadError = categoriesQuery.isError
    ? (() => {
        const match =
          categoriesQuery.error instanceof Error
            ? /failed with status (\d+)/.exec(categoriesQuery.error.message)
            : null;
        return match
          ? t("settings.categories.errorLoad", { status: Number(match[1]) })
          : t("settings.categories.errorLoadFallback");
      })()
    : null;
  const catError = loadError ?? mutationError;

  // Nach Kategorie-Mutationen alle abhängigen Ansichten aktualisieren
  // (Merge/Delete hängen Transaktionen um, Tax-Flag wirkt auf die Steuer-Seite).
  const invalidateCategories = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ["categories"] });
    void queryClient.invalidateQueries({ queryKey: ["analytics"] });
    void queryClient.invalidateQueries({ queryKey: ["transactions"] });
    void queryClient.invalidateQueries({ queryKey: ["tax"] });
  }, [queryClient]);

  const otherCategories = useCallback(
    (currentId: string) => categories.filter((c) => c.id !== currentId),
    [categories]
  );

  const handleRename = async (id: string) => {
    const name = (renameDraft[id] || "").trim();
    if (!name) {
      setMutationError(t("settings.categories.errorNameRequired"));
      return;
    }
    setBusy(id, true);
    setMutationError(null);
    setCatMessage(null);
    try {
      const res = await fetch(`/api/categories/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name })
      });
      if (!res.ok) {
        setMutationError(t("settings.categories.errorUpdate", { status: res.status }));
        return;
      }
      setCatMessage(t("settings.categories.messageUpdated"));
      invalidateCategories();
    } finally {
      setBusy(id, false);
    }
  };

  const handleTaxToggle = async (id: string, isTaxRelevant: boolean) => {
    setBusy(id, true);
    setMutationError(null);
    setCatMessage(null);
    try {
      const res = await fetch(`/api/categories/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isTaxRelevant })
      });
      if (!res.ok) {
        setMutationError(t("settings.categories.errorUpdate", { status: res.status }));
        return;
      }
      setCatMessage(t("settings.categories.messageUpdated"));
      invalidateCategories();
    } finally {
      setBusy(id, false);
    }
  };

  const handleMerge = async (id: string) => {
    const targetId = mergeTarget[id];
    if (!targetId) {
      setMutationError(t("settings.categories.errorMergeTarget"));
      return;
    }
    setBusy(id, true);
    setMutationError(null);
    setCatMessage(null);
    try {
      const res = await fetch(`/api/categories/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mergeIntoCategoryId: targetId })
      });
      if (!res.ok) {
        setMutationError(t("settings.categories.errorMerge", { status: res.status }));
        return;
      }
      setCatMessage(t("settings.categories.messageMerged"));
      invalidateCategories();
    } finally {
      setBusy(id, false);
    }
  };

  const handleDelete = async (id: string) => {
    const fallbackId = fallbackTarget[id];
    const fallbackNewName = (fallbackName[id] || "").trim();
    if (!fallbackId && !fallbackNewName) {
      setMutationError(t("settings.categories.errorFallbackRequired"));
      return;
    }
    if (fallbackId === id) {
      setMutationError(t("settings.categories.errorFallbackSame"));
      return;
    }
    setBusy(id, true);
    setMutationError(null);
    setCatMessage(null);
    try {
      const res = await fetch(`/api/categories/${id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fallbackCategoryId: fallbackId || undefined, fallbackName: fallbackNewName || undefined })
      });
      if (!res.ok) {
        setMutationError(t("settings.categories.errorDelete", { status: res.status }));
        return;
      }
      setCatMessage(t("settings.categories.messageDeleted"));
      invalidateCategories();
    } finally {
      setBusy(id, false);
    }
  };

  const isBusy = useCallback((id: string) => busyIds.has(id), [busyIds]);

  const noCategories = useMemo(() => !catLoading && categories.length === 0, [catLoading, categories.length]);

  return (
    <main id="maincontent" className="py-6 md:py-8">
      <PageContainer className="max-w-4xl space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-lg font-medium">{t("settings.categories.title")}</h1>
            <p className="text-sm text-gray-600 dark:text-neutral-300">{t("settings.categories.subtitle")}</p>
          </div>
          <button
            type="button"
            onClick={() => void categoriesQuery.refetch()}
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
          {categories.map((category) => {
            const isExpanded = expandedCategories.has(category.id);
            const isProtected = isProtectedCategory(category.name);
            return (
            <div key={category.id} className="rounded-lg border border-gray-200 bg-white/80 shadow-sm dark:border-neutral-700 dark:bg-neutral-900/80">
              <button
                type="button"
                onClick={() => toggleCategoryExpanded(category.id)}
                aria-expanded={isExpanded}
                aria-controls={`category-content-${category.id}`}
                className="flex w-full items-center justify-between p-3 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 rounded-lg"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-semibold text-gray-900 dark:text-neutral-100">{category.name}</p>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                    category.isIncome ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-200" : "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200"
                  }`}>
                    {category.isIncome ? t("settings.categories.badgeIncome") : t("settings.categories.badgeOutcome")}
                  </span>
                  {category.isTaxRelevant && (
                    <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-semibold text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-200">
                      {t("settings.categories.badgeTax")}
                    </span>
                  )}
                  {isProtected && (
                    <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-semibold text-blue-700 dark:bg-blue-900/40 dark:text-blue-200">
                      {t("settings.categories.badgeProtected")}
                    </span>
                  )}
                  {isBusy(category.id) && (
                    <span className="text-xs text-gray-500 dark:text-neutral-400">{t("settings.categories.working")}</span>
                  )}
                </div>
                <svg
                  className={`h-4 w-4 text-gray-500 transition-transform duration-200 dark:text-neutral-400 ${isExpanded ? "rotate-180" : ""}`}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  aria-hidden="true"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              <div
                id={`category-content-${category.id}`}
                className={`overflow-hidden transition-all duration-200 ${isExpanded ? "p-3 pt-0" : "max-h-0"}`}
                hidden={!isExpanded}
              >
                {isProtected ? (
                  <p className="text-sm text-gray-500 dark:text-neutral-400">{t("settings.categories.protectedHint")}</p>
                ) : (
              <>
              <div className="mt-3 flex items-start gap-2">
                <input
                  id={`tax-${category.id}`}
                  type="checkbox"
                  checked={category.isTaxRelevant}
                  disabled={isBusy(category.id)}
                  onChange={(event) => handleTaxToggle(category.id, event.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 dark:border-neutral-600 dark:bg-neutral-800"
                />
                <label htmlFor={`tax-${category.id}`} className="flex flex-col">
                  <span className="text-xs font-medium text-gray-700 dark:text-neutral-200">
                    {t("settings.categories.taxToggleLabel")}
                  </span>
                  <span className="text-xs text-gray-500 dark:text-neutral-400">
                    {t("settings.categories.taxToggleHint")}
                  </span>
                </label>
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
              </>
              )}
              </div>
            </div>
          );
          })}
        </div>
      </PageContainer>
    </main>
  );
}

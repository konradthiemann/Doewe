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
            <p className="text-sm text-ink-muted">{t("settings.categories.subtitle")}</p>
          </div>
          <button
            type="button"
            onClick={() => void categoriesQuery.refetch()}
            className="inline-flex items-center rounded-field border border-line-strong px-3 py-1.5 text-xs font-medium text-ink transition hover:bg-surface-2 focus:outline-none focus-visible:ring focus-visible:ring-brand focus-visible:ring-offset-2"
          >
            {catLoading ? t("settings.categories.loading") : t("settings.categories.refresh")}
          </button>
        </div>

        {catError && <p className="text-sm text-danger" role="alert">{catError}</p>}
        {catMessage && <p className="text-sm text-success" role="status">{catMessage}</p>}

        {catLoading && <p className="text-sm text-ink-muted">{t("settings.categories.loading")}</p>}
        {noCategories && <p className="text-sm text-ink-muted">{t("settings.categories.listEmpty")}</p>}

        <div className="space-y-3">
          {categories.map((category) => {
            const isExpanded = expandedCategories.has(category.id);
            const isProtected = isProtectedCategory(category.name);
            return (
            <div key={category.id} className="rounded-card border border-line bg-surface/80 shadow-card">
              <button
                type="button"
                onClick={() => toggleCategoryExpanded(category.id)}
                aria-expanded={isExpanded}
                aria-controls={`category-content-${category.id}`}
                className="flex w-full items-center justify-between p-3 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 rounded-card"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-semibold text-ink">{category.name}</p>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                    category.isIncome ? "bg-income-soft text-income" : "bg-expense-soft text-expense"
                  }`}>
                    {category.isIncome ? t("settings.categories.badgeIncome") : t("settings.categories.badgeOutcome")}
                  </span>
                  {category.isTaxRelevant && (
                    <span className="rounded-full bg-warning-soft px-2 py-0.5 text-xs font-semibold text-warning">
                      {t("settings.categories.badgeTax")}
                    </span>
                  )}
                  {isProtected && (
                    <span className="rounded-full bg-info-soft px-2 py-0.5 text-xs font-semibold text-info">
                      {t("settings.categories.badgeProtected")}
                    </span>
                  )}
                  {isBusy(category.id) && (
                    <span className="text-xs text-ink-muted">{t("settings.categories.working")}</span>
                  )}
                </div>
                <svg
                  className={`h-4 w-4 text-ink-muted transition-transform duration-200 ${isExpanded ? "rotate-180" : ""}`}
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
                  <p className="text-sm text-ink-muted">{t("settings.categories.protectedHint")}</p>
                ) : (
              <>
              <div className="mt-3 flex items-start gap-2">
                <input
                  id={`tax-${category.id}`}
                  type="checkbox"
                  checked={category.isTaxRelevant}
                  disabled={isBusy(category.id)}
                  onChange={(event) => handleTaxToggle(category.id, event.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-line-strong text-brand focus:ring-brand"
                />
                <label htmlFor={`tax-${category.id}`} className="flex flex-col">
                  <span className="text-xs font-medium text-ink">
                    {t("settings.categories.taxToggleLabel")}
                  </span>
                  <span className="text-xs text-ink-muted">
                    {t("settings.categories.taxToggleHint")}
                  </span>
                </label>
              </div>
              <div className="mt-3 grid gap-2 sm:grid-cols-3">
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium text-ink" htmlFor={`rename-${category.id}`}>
                    {t("settings.categories.renameLabel")}
                  </label>
                  <div className="flex gap-2">
                    <input
                      id={`rename-${category.id}`}
                      value={renameDraft[category.id] ?? category.name}
                      onChange={(event) => setRenameDraft((current) => ({ ...current, [category.id]: event.target.value }))}
                      className="w-full rounded-field border border-line-strong bg-surface px-2 py-1.5 text-sm text-ink shadow-card focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
                    />
                    <button
                      type="button"
                      onClick={() => handleRename(category.id)}
                      disabled={isBusy(category.id)}
                      className="inline-flex items-center rounded-field bg-brand px-3 py-1.5 text-xs font-semibold text-brand-on shadow-card transition hover:bg-brand-hover focus:outline-none focus-visible:ring focus-visible:ring-brand focus-visible:ring-offset-2 disabled:opacity-60"
                    >
                      {t("settings.categories.renameSubmit")}
                    </button>
                  </div>
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium text-ink" htmlFor={`merge-${category.id}`}>
                    {t("settings.categories.mergeLabel")}
                  </label>
                  <div className="flex gap-2">
                    <select
                      id={`merge-${category.id}`}
                      value={mergeTarget[category.id] ?? ""}
                      onChange={(event) => setMergeTarget((current) => ({ ...current, [category.id]: event.target.value }))}
                      className="w-full rounded-field border border-line-strong bg-surface px-2 py-1.5 text-sm text-ink shadow-card focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
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
                      className="inline-flex items-center rounded-field border border-line-strong px-3 py-1.5 text-xs font-semibold text-ink shadow-card transition hover:bg-surface-2 focus:outline-none focus-visible:ring focus-visible:ring-brand focus-visible:ring-offset-2 disabled:opacity-60"
                    >
                      {t("settings.categories.mergeSubmit")}
                    </button>
                  </div>
                  <p className="text-xs text-ink-muted">{t("settings.categories.mergeHint")}</p>
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium text-ink" htmlFor={`fallback-${category.id}`}>
                    {t("settings.categories.deleteLabel")}
                  </label>
                  <div className="flex gap-2">
                    <select
                      id={`fallback-${category.id}`}
                      value={fallbackTarget[category.id] ?? ""}
                      onChange={(event) => setFallbackTarget((current) => ({ ...current, [category.id]: event.target.value }))}
                      className="w-1/2 rounded-field border border-line-strong bg-surface px-2 py-1.5 text-sm text-ink shadow-card focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
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
                      className="w-full rounded-field border border-line-strong bg-surface px-2 py-1.5 text-sm text-ink shadow-card focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
                    />
                    <button
                      type="button"
                      onClick={() => handleDelete(category.id)}
                      disabled={isBusy(category.id)}
                      className="inline-flex items-center rounded-field bg-danger px-3 py-1.5 text-xs font-semibold text-brand-on shadow-card transition hover:opacity-90 focus:outline-none focus-visible:ring focus-visible:ring-danger focus-visible:ring-offset-2 disabled:opacity-60"
                    >
                      {t("settings.categories.deleteSubmit")}
                    </button>
                  </div>
                  <p className="text-xs text-ink-muted">{t("settings.categories.deleteHint")}</p>
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

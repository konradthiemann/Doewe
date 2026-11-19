"use client";

import { useRef, useState } from "react";

import { cn } from "../../lib/cn";
import { useI18n } from "../../lib/i18n";

import { Button } from "./Button";
import { Dialog, DialogTitle } from "./Dialog";

export interface InfoTipProps {
  /**
   * Explanation to show. The texts live in the locale files as
   * `info.<topic>.title`, `info.<topic>.body` and (optional)
   * `info.<topic>.example`.
   *
   * Body: paragraphs separated by a blank line. Example: one line per row;
   * `label | amount` becomes a row of a small sum, a label starting with `=`
   * is the result row, a line without `|` is plain text.
   */
  topic: string;
  className?: string;
}

/**
 * Small round "i" button that opens an explanation in a dialog. A dialog, not
 * a hover tooltip: the app is used on phones, where hover does not exist.
 *
 * The visible circle is 20 px so it fits next to a label in a dense card; the
 * tappable area is extended to 40 px with a pseudo-element, which does not
 * take part in the layout.
 */
export function InfoTip({ topic, className }: InfoTipProps) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const title = t(`info.${topic}.title`);
  const paragraphs = t(`info.${topic}.body`).split("\n\n");
  const exampleKey = `info.${topic}.example`;
  const exampleText = t(exampleKey);
  // `t` returns the key itself for a missing message: no example for this topic.
  const exampleLines = exampleText === exampleKey ? [] : exampleText.split("\n");

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        aria-label={t("info.buttonLabel", { title })}
        aria-haspopup="dialog"
        onClick={(event) => {
          // The button may sit inside a <summary> or next to a <label>: opening
          // the explanation must not toggle or activate what is around it.
          event.preventDefault();
          event.stopPropagation();
          setOpen(true);
        }}
        className={cn(
          "relative inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full align-middle text-ink-muted transition duration-quick ease-calm hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-bg",
          "before:absolute before:-inset-2.5 before:content-['']",
          className
        )}
      >
        <svg
          aria-hidden="true"
          viewBox="0 0 20 20"
          className="h-5 w-5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        >
          <circle cx="10" cy="10" r="8.25" />
          <path d="M10 9.25v4.5" />
          <circle cx="10" cy="6.4" r="0.6" fill="currentColor" />
        </svg>
      </button>
      <Dialog
        open={open}
        onOpenChange={setOpen}
        dismissOnBackdrop
        className="max-w-md sm:max-w-md"
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          buttonRef.current?.focus();
        }}
      >
        {/* Events of the portal bubble through the React tree: keep taps inside
            the explanation away from handlers around the button. */}
        <div
          onClick={(event) => event.stopPropagation()}
          className="max-h-[calc(100dvh-2rem)] overflow-y-auto rounded-card border border-line bg-surface p-5 text-left text-ink shadow-raised"
        >
          <DialogTitle className="text-base font-semibold text-ink">{title}</DialogTitle>
          <div className="mt-2 space-y-2 text-sm leading-relaxed text-ink">
            {paragraphs.map((paragraph, index) => (
              <p key={index}>{paragraph}</p>
            ))}
          </div>
          {exampleLines.length > 0 && (
            <div className="mt-3 rounded-field border border-line bg-surface-2 p-3 text-sm text-ink">
              <p className="text-xs font-medium uppercase tracking-wide text-ink-muted">{t("info.exampleLabel")}</p>
              <div className="mt-1 space-y-1">
                {exampleLines.map((line, index) => {
                  const separator = line.lastIndexOf("|");
                  if (separator === -1) return <p key={index}>{line}</p>;
                  const label = line.slice(0, separator).trim();
                  const value = line.slice(separator + 1).trim();
                  const isResult = label.startsWith("=");
                  return (
                    <p
                      key={index}
                      className={cn(
                        "flex items-baseline justify-between gap-3",
                        isResult && "border-t border-line-strong pt-1 font-semibold"
                      )}
                    >
                      <span className="min-w-0">{label}</span>
                      <span className="shrink-0 whitespace-nowrap tabular-nums">{value}</span>
                    </p>
                  );
                })}
              </div>
            </div>
          )}
          <div className="mt-4 flex justify-end">
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
              {t("common.close")}
            </Button>
          </div>
        </div>
      </Dialog>
    </>
  );
}

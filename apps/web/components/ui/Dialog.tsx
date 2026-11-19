"use client";

import * as RadixDialog from "@radix-ui/react-dialog";
import { type ReactNode } from "react";

import { cn } from "../../lib/cn";

/**
 * Accessible modal dialog built on @radix-ui/react-dialog.
 * Handles focus trapping, scroll locking, and Escape key automatically.
 *
 * Reference: https://www.radix-ui.com/primitives/docs/components/dialog
 */

export interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: ReactNode;
  children: ReactNode;
  className?: string;
  /**
   * Called when focus is about to leave the closing dialog. The dialog has no
   * Radix trigger, so nothing is focused by default: call
   * `event.preventDefault()` and focus the element that opened it.
   */
  onCloseAutoFocus?: (event: Event) => void;
  /** Close when the area around the dialog body is tapped (off by default: forms keep their input). */
  dismissOnBackdrop?: boolean;
}

export function Dialog({
  open,
  onOpenChange,
  title,
  children,
  className,
  onCloseAutoFocus,
  dismissOnBackdrop = false
}: DialogProps) {
  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
      <RadixDialog.Portal>
        {/* Backdrop */}
        <RadixDialog.Overlay
          className={cn(
            "fixed inset-0 z-overlay bg-black/50 backdrop-blur-sm",
            "data-[state=open]:animate-in data-[state=closed]:animate-out",
            "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0"
          )}
        />
        {/* Content */}
        <RadixDialog.Content
          className={cn(
            "fixed inset-0 z-modal flex items-center justify-center p-4",
            "data-[state=open]:animate-in data-[state=closed]:animate-out",
            "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
            "data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95"
          )}
          // Let Radix own the a11y wiring:
          // - it auto-links aria-labelledby to the <Dialog.Title> below; overriding
          //   the title's generated id would break Radix's own title-presence check.
          // - opt out of the description requirement — the title conveys the purpose.
          aria-describedby={undefined}
          onCloseAutoFocus={onCloseAutoFocus}
          // The content element spans the viewport; only a tap on itself (not on
          // the dialog body inside) is a tap "outside".
          onClick={
            dismissOnBackdrop
              ? (event) => {
                  if (event.target === event.currentTarget) onOpenChange(false);
                }
              : undefined
          }
        >
          <div className={cn("w-full max-w-lg sm:max-w-xl", className)}>
            {title && (
              <RadixDialog.Title className="sr-only">
                {title}
              </RadixDialog.Title>
            )}
            {children}
          </div>
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}

export const DialogClose = RadixDialog.Close;
/** Visible title for dialogs that render their own heading (instead of the sr-only `title` prop). */
export const DialogTitle = RadixDialog.Title;

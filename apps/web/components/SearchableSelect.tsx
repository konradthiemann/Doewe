"use client";

import { useEffect, useRef, useState, useCallback, useMemo } from "react";

type Option = {
  id: string;
  label: string;
  usageCount?: number;
};

type Props = {
  id: string;
  name: string;
  value: string;
  options: Option[];
  placeholder?: string;
  searchPlaceholder?: string;
  noResultsText?: string;
  addNewLabel?: string;
  onChange: (value: string) => void;
  onAddNew?: () => void;
  disabled?: boolean;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean;
};

/**
 * A searchable select component with keyboard navigation.
 * Accessibility: Uses combobox pattern with listbox.
 */
export default function SearchableSelect({
  id,
  name,
  value,
  options,
  placeholder = "Select...",
  searchPlaceholder = "Search...",
  noResultsText = "No results",
  addNewLabel,
  onChange,
  onAddNew,
  disabled,
  "aria-describedby": ariaDescribedBy,
  "aria-invalid": ariaInvalid
}: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listboxRef = useRef<HTMLUListElement>(null);

  // Filter options based on search
  const filteredOptions = useMemo(() => {
    if (!search.trim()) return options;
    const term = search.toLowerCase();
    return options.filter((opt) => opt.label.toLowerCase().includes(term));
  }, [options, search]);

  // Add "Add new" option if provided
  const displayOptions = useMemo(() => {
    const base = filteredOptions.map((opt) => ({ ...opt, isAddNew: false }));
    if (addNewLabel && onAddNew) {
      base.push({ id: "__new__", label: addNewLabel, isAddNew: true });
    }
    return base;
  }, [filteredOptions, addNewLabel, onAddNew]);

  // Get selected option label
  const selectedOption = options.find((opt) => opt.id === value);
  const displayValue = selectedOption?.label ?? "";

  // Reset highlight when options change
  useEffect(() => {
    setHighlightedIndex(0);
  }, [displayOptions.length]);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setSearch("");
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Scroll highlighted item into view
  useEffect(() => {
    if (isOpen && listboxRef.current) {
      const highlighted = listboxRef.current.children[highlightedIndex] as HTMLElement;
      highlighted?.scrollIntoView({ block: "nearest" });
    }
  }, [highlightedIndex, isOpen]);

  const handleSelect = useCallback((optionId: string, isAddNew: boolean) => {
    if (isAddNew) {
      onAddNew?.();
    } else {
      onChange(optionId);
    }
    setIsOpen(false);
    setSearch("");
  }, [onChange, onAddNew]);

  const handleKeyDown = useCallback((event: React.KeyboardEvent) => {
    if (!isOpen) {
      if (event.key === "Enter" || event.key === " " || event.key === "ArrowDown") {
        event.preventDefault();
        setIsOpen(true);
      }
      return;
    }

    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        setHighlightedIndex((prev) => Math.min(prev + 1, displayOptions.length - 1));
        break;
      case "ArrowUp":
        event.preventDefault();
        setHighlightedIndex((prev) => Math.max(prev - 1, 0));
        break;
      case "Enter":
        event.preventDefault();
        if (displayOptions[highlightedIndex]) {
          const opt = displayOptions[highlightedIndex];
          handleSelect(opt.id, opt.isAddNew ?? false);
        }
        break;
      case "Escape":
        event.preventDefault();
        setIsOpen(false);
        setSearch("");
        break;
      case "Tab":
        setIsOpen(false);
        setSearch("");
        break;
    }
  }, [isOpen, displayOptions, highlightedIndex, handleSelect]);

  return (
    <div ref={containerRef} className="relative">
      {/* Hidden input for form submission */}
      <input type="hidden" name={name} value={value} />

      {/* Trigger button */}
      <button
        type="button"
        id={id}
        disabled={disabled}
        onClick={() => {
          setIsOpen((prev) => !prev);
          if (!isOpen) {
            setTimeout(() => inputRef.current?.focus(), 0);
          }
        }}
        onKeyDown={handleKeyDown}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-describedby={ariaDescribedBy}
        data-invalid={ariaInvalid || undefined}
        className="flex w-full items-center justify-between rounded-field border border-line-strong bg-surface px-3 py-2 text-left text-sm text-ink shadow-card focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand disabled:opacity-50"
      >
        <span className={displayValue ? "" : "text-ink-faint"}>
          {displayValue || placeholder}
        </span>
        <svg
          className={`h-4 w-4 text-ink-faint transition-transform ${isOpen ? "rotate-180" : ""}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Dropdown */}
      {isOpen && (
        <div className="absolute z-modal mt-1 w-full rounded-field border border-line bg-surface shadow-raised">
          {/* Search input */}
          <div className="border-b border-line p-2">
            <input
              ref={inputRef}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={searchPlaceholder}
              className="w-full rounded-field border border-line-strong bg-surface px-2 py-1.5 text-sm text-ink focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
              aria-label={searchPlaceholder}
            />
          </div>

          {/* Options list */}
          <ul
            ref={listboxRef}
            role="listbox"
            aria-label={placeholder}
            className="max-h-60 overflow-y-auto py-1"
          >
            {displayOptions.length === 0 ? (
              <li className="px-3 py-2 text-sm text-ink-muted">
                {noResultsText}
              </li>
            ) : (
              displayOptions.map((opt, index) => (
                <li
                  key={opt.id}
                  role="option"
                  aria-selected={opt.id === value}
                  onClick={() => handleSelect(opt.id, opt.isAddNew ?? false)}
                  onMouseEnter={() => setHighlightedIndex(index)}
                  className={`flex cursor-pointer items-center justify-between px-3 py-2 text-sm ${
                    index === highlightedIndex
                      ? "bg-brand-soft text-brand"
                      : "text-ink"
                  } ${opt.id === value ? "font-semibold" : ""} ${
                    opt.isAddNew ? "border-t border-line text-brand" : ""
                  }`}
                >
                  <span className="flex items-center gap-2">
                    {opt.isAddNew && (
                      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                      </svg>
                    )}
                    {opt.label}
                  </span>
                  {opt.usageCount !== undefined && opt.usageCount > 0 && !opt.isAddNew && (
                    <span className="text-xs text-ink-faint">
                      {opt.usageCount}×
                    </span>
                  )}
                  {opt.id === value && !opt.isAddNew && (
                    <svg className="h-4 w-4 text-brand" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  )}
                </li>
              ))
            )}
          </ul>
        </div>
      )}
    </div>
  );
}

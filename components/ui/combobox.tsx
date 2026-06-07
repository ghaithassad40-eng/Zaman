"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronsUpDown, X } from "lucide-react";
import { cn } from "@/lib/utils";

export type ComboItem = {
  value: string;
  label: string;
  /** Optional extra fields searched alongside the label (sku, brand, etc.). */
  search?: string;
  /** Optional small caption shown under the label. */
  caption?: string;
};

/** Typeahead combobox. Filters as you type across `label` + `search`.
 *  Press Enter on the highlighted row to pick, Esc to close. */
export function Combobox({
  value,
  onChange,
  items,
  placeholder = "Search…",
  emptyLabel = "No matches",
  clearLabel,
  className,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  items: ComboItem[];
  placeholder?: string;
  emptyLabel?: string;
  /** When set, an extra row at the top lets the user clear / pick "new". */
  clearLabel?: string;
  className?: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [highlight, setHighlight] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  const selected = items.find((i) => i.value === value);
  const display = selected?.label ?? "";

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return items.slice(0, 60);
    return items
      .filter((it) => {
        const hay = `${it.label} ${it.search ?? ""}`.toLowerCase();
        return hay.includes(needle);
      })
      .slice(0, 60);
  }, [items, q]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  // Reset highlight when filter changes
  useEffect(() => { setHighlight(0); }, [q]);

  function pick(v: string) {
    onChange(v);
    setOpen(false);
    setQ("");
  }

  return (
    <div ref={wrapRef} className={cn("relative", className)}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => {
          setOpen((o) => !o);
          setTimeout(() => inputRef.current?.focus(), 0);
        }}
        className={cn(
          "flex h-9 w-full items-center justify-between rounded-md border border-input bg-background px-3 text-sm shadow-xs",
          "ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          "disabled:cursor-not-allowed disabled:opacity-50",
        )}
      >
        <span className={cn("truncate", !display && "text-muted-foreground")}>
          {display || placeholder}
        </span>
        <ChevronsUpDown className="ms-2 size-4 shrink-0 opacity-50" />
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-full min-w-[18rem] rounded-md border border-border bg-popover shadow-lg">
          <div className="flex items-center border-b px-2">
            <input
              ref={inputRef}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "ArrowDown") { e.preventDefault(); setHighlight((h) => Math.min(h + 1, filtered.length - 1 + (clearLabel ? 1 : 0))); }
                else if (e.key === "ArrowUp") { e.preventDefault(); setHighlight((h) => Math.max(0, h - 1)); }
                else if (e.key === "Enter") {
                  e.preventDefault();
                  if (clearLabel && highlight === 0) pick("");
                  else {
                    const row = filtered[clearLabel ? highlight - 1 : highlight];
                    if (row) pick(row.value);
                  }
                } else if (e.key === "Escape") { setOpen(false); }
              }}
              placeholder={placeholder}
              className="h-9 w-full bg-transparent px-2 text-sm outline-none placeholder:text-muted-foreground"
            />
            {q && (
              <button type="button" onClick={() => setQ("")} className="text-muted-foreground hover:text-foreground">
                <X className="size-4" />
              </button>
            )}
          </div>
          <div className="max-h-72 overflow-y-auto py-1">
            {clearLabel && (
              <Row
                active={highlight === 0}
                selected={!value}
                onClick={() => pick("")}
                onMouseEnter={() => setHighlight(0)}
              >
                <span className="text-primary">{clearLabel}</span>
              </Row>
            )}
            {filtered.length === 0 && !clearLabel && (
              <div className="px-3 py-2 text-sm text-muted-foreground">{emptyLabel}</div>
            )}
            {filtered.map((it, i) => {
              const idx = clearLabel ? i + 1 : i;
              return (
                <Row
                  key={it.value}
                  active={highlight === idx}
                  selected={it.value === value}
                  onClick={() => pick(it.value)}
                  onMouseEnter={() => setHighlight(idx)}
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate">{it.label}</div>
                    {it.caption && <div className="truncate text-[11px] text-muted-foreground">{it.caption}</div>}
                  </div>
                  {it.value === value && <Check className="ms-2 size-4 shrink-0 text-primary" />}
                </Row>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function Row({
  children, active, selected, onClick, onMouseEnter,
}: {
  children: React.ReactNode;
  active?: boolean;
  selected?: boolean;
  onClick?: () => void;
  onMouseEnter?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      className={cn(
        "flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-sm",
        active ? "bg-accent text-accent-foreground" : "",
        selected ? "font-medium" : "",
      )}
    >
      {children}
    </button>
  );
}

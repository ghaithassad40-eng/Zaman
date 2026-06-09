"use client";

import { useMemo, useState } from "react";
import { ArrowUp, ArrowDown, ArrowUpDown } from "lucide-react";
import { TableHead } from "@/components/ui/table";
import { cn } from "@/lib/utils";

export type SortDir = "asc" | "desc";

/** Tiny header-driven sort hook. Click a column to sort asc, click again for
 *  desc, click a different column to switch. Pass any row shape; the accessor
 *  pulls the value to compare. Strings sort case-insensitive, numbers numerically,
 *  null/undefined always last. Pass `defaultKey` to get a stable initial order. */
export function useSort<T>(defaultKey?: string, defaultDir: SortDir = "asc") {
  const [sortKey, setSortKey] = useState<string | null>(defaultKey ?? null);
  const [sortDir, setSortDir] = useState<SortDir>(defaultDir);

  function toggle(key: string) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  function applyTo(rows: T[] | undefined, accessor: (row: T, key: string) => unknown): T[] {
    if (!rows) return [];
    if (!sortKey) return rows;
    const dir = sortDir === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
      const av = accessor(a, sortKey);
      const bv = accessor(b, sortKey);
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (typeof av === "number" && typeof bv === "number") return (av - bv) * dir;
      // Treat boolean as 0/1
      if (typeof av === "boolean" && typeof bv === "boolean") return (Number(av) - Number(bv)) * dir;
      const as = String(av).toLowerCase();
      const bs = String(bv).toLowerCase();
      // Fall back to lexicographic
      return as.localeCompare(bs) * dir;
    });
  }

  return { sortKey, sortDir, toggle, applyTo, set: (k: string, d: SortDir) => { setSortKey(k); setSortDir(d); } };
}

/** Drop-in replacement for <TableHead> that becomes a sort button. Pass the
 *  shared sort state + key. Caller wires applyTo on the data side. */
export function SortableHead({
  sortKey,
  current,
  dir,
  onToggle,
  className,
  align = "start",
  children,
}: {
  sortKey: string;
  current: string | null;
  dir: SortDir;
  onToggle: (key: string) => void;
  className?: string;
  align?: "start" | "end" | "center";
  children: React.ReactNode;
}) {
  const active = current === sortKey;
  const Icon = !active ? ArrowUpDown : dir === "asc" ? ArrowUp : ArrowDown;
  const justify = align === "end" ? "justify-end" : align === "center" ? "justify-center" : "justify-start";
  const textAlign = align === "end" ? "text-end" : align === "center" ? "text-center" : "text-start";
  return (
    <TableHead className={cn("p-0", textAlign, className)}>
      <button
        type="button"
        onClick={() => onToggle(sortKey)}
        className={cn(
          "group inline-flex w-full items-center gap-1 px-3 py-2 text-xs font-medium uppercase tracking-wider transition-colors",
          justify,
          active ? "text-primary" : "text-muted-foreground hover:text-foreground",
        )}
      >
        <span>{children}</span>
        {/* Sort glyph: always rendered so users see at a glance that the
            column is sortable; brightens on hover, becomes full opacity
            (and switches to the directional arrow) when active. */}
        <Icon
          aria-hidden
          className={cn("size-3 shrink-0", active ? "opacity-100" : "opacity-60 group-hover:opacity-100")}
        />
      </button>
    </TableHead>
  );
}

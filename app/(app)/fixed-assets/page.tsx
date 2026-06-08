"use client";

import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { Boxes, Building2, Search } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useI18n } from "@/lib/i18n/provider";
import { PageHeader } from "@/components/page-header";
import { ExportButton } from "@/components/export-button";
import { SortableHead, useSort } from "@/components/ui/sortable-head";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatJOD, round3 } from "@/lib/utils";
import type { Tables } from "@/types/database.types";

type AssetRow = Tables<"v_assets">;

export default function FixedAssetsPage() {
  const { t, locale } = useI18n();
  const supabase = createClient();
  const [q, setQ] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["fixed-assets"],
    queryFn: async (): Promise<AssetRow[]> => {
      const { data, error } = await supabase
        .from("v_assets")
        .select("*")
        .order("start_date", { ascending: false });
      if (error) throw error;
      return (data ?? []) as AssetRow[];
    },
  });

  const sort = useSort<AssetRow>();
  const filtered = useMemo(() => {
    if (!data) return [];
    const needle = q.trim().toLowerCase();
    const f = !needle ? data : data.filter((r) =>
      [r.name, r.vendor_name].filter(Boolean).some((s) => (s as string).toLowerCase().includes(needle)),
    );
    return sort.applyTo(f, (r, k) => {
      switch (k) {
        case "name": return r.name ?? "";
        case "vendor": return r.vendor_name ?? "";
        case "start": return r.start_date ?? "";
        case "cost": return Number(r.cost ?? 0);
        case "years": return Number(r.years ?? 0);
        case "monthly": return Number(r.monthly_depreciation ?? 0);
        case "accumulated": return Number(r.accumulated_depreciation ?? 0);
        case "book": return Number(r.book_value ?? 0);
        case "progress": return Number(r.months_total ?? 0) > 0 ? Number(r.months_elapsed ?? 0) / Number(r.months_total) : 0;
        default: return null;
      }
    });
  }, [data, q, sort]);

  const totals = useMemo(() => {
    const rows = filtered;
    const cost = round3(rows.reduce((s, r) => s + Number(r.cost ?? 0), 0));
    const acc = round3(rows.reduce((s, r) => s + Number(r.accumulated_depreciation ?? 0), 0));
    const book = round3(rows.reduce((s, r) => s + Number(r.book_value ?? 0), 0));
    const monthly = round3(rows.reduce((s, r) => s + Number(r.monthly_depreciation ?? 0), 0));
    return { cost, acc, book, monthly };
  }, [filtered]);

  return (
    <>
      <PageHeader
        title={t("fixedAssets.title")}
        description={t("fixedAssets.subtitle")}
        action={
          <ExportButton
            filename="fixed-assets"
            rows={filtered}
            cols={[
              { header: "Name", accessor: (r) => r.name ?? "" },
              { header: "Vendor", accessor: (r) => r.vendor_name ?? "" },
              { header: "Start date", accessor: (r) => r.start_date ?? "" },
              { header: "Cost (JOD)", accessor: (r) => Number(r.cost ?? 0) },
              { header: "Salvage value", accessor: (r) => Number(r.salvage_value ?? 0) },
              { header: "Years", accessor: (r) => Number(r.years ?? 0) },
              { header: "Months elapsed", accessor: (r) => Number(r.months_elapsed ?? 0) },
              { header: "Months total", accessor: (r) => Number(r.months_total ?? 0) },
              { header: "Monthly depreciation", accessor: (r) => Number(r.monthly_depreciation ?? 0) },
              { header: "Accumulated depreciation", accessor: (r) => Number(r.accumulated_depreciation ?? 0) },
              { header: "Book value", accessor: (r) => Number(r.book_value ?? 0) },
            ]}
          />
        }
      />

      {/* KPI strip */}
      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label={t("fixedAssets.totalCost")} value={formatJOD(totals.cost, locale)} />
        <KpiCard label={t("fixedAssets.totalBookValue")} value={formatJOD(totals.book, locale)} accent />
        <KpiCard label={t("fixedAssets.accumulatedDep")} value={formatJOD(totals.acc, locale)} />
        <KpiCard label={t("fixedAssets.monthlyDep")} value={formatJOD(totals.monthly, locale)} />
      </div>

      <div className="mb-4 flex items-center gap-2">
        <div className="relative flex-1 max-w-sm">
          <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="ps-9"
            placeholder={t("fixedAssets.search")}
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="space-y-2 p-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : filtered.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <SortableHead sortKey="name" current={sort.sortKey} dir={sort.sortDir} onToggle={sort.toggle}>{t("common.name")}</SortableHead>
                  <SortableHead sortKey="vendor" current={sort.sortKey} dir={sort.sortDir} onToggle={sort.toggle}>{t("vendors.title")}</SortableHead>
                  <SortableHead sortKey="start" current={sort.sortKey} dir={sort.sortDir} onToggle={sort.toggle}>{t("fixedAssets.startDate")}</SortableHead>
                  <SortableHead sortKey="cost" current={sort.sortKey} dir={sort.sortDir} onToggle={sort.toggle} align="end">{t("fixedAssets.cost")}</SortableHead>
                  <SortableHead sortKey="years" current={sort.sortKey} dir={sort.sortDir} onToggle={sort.toggle} align="end">{t("fixedAssets.years")}</SortableHead>
                  <SortableHead sortKey="monthly" current={sort.sortKey} dir={sort.sortDir} onToggle={sort.toggle} align="end">{t("fixedAssets.monthly")}</SortableHead>
                  <SortableHead sortKey="accumulated" current={sort.sortKey} dir={sort.sortDir} onToggle={sort.toggle} align="end">{t("fixedAssets.accumulated")}</SortableHead>
                  <SortableHead sortKey="book" current={sort.sortKey} dir={sort.sortDir} onToggle={sort.toggle} align="end">{t("fixedAssets.bookValue")}</SortableHead>
                  <SortableHead sortKey="progress" current={sort.sortKey} dir={sort.sortDir} onToggle={sort.toggle}>{t("fixedAssets.progress")}</SortableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((r) => {
                  const total = Number(r.months_total ?? 0);
                  const elapsed = Number(r.months_elapsed ?? 0);
                  const pct = total > 0 ? Math.min(100, Math.round((elapsed / total) * 100)) : 0;
                  const fullyDepreciated = pct >= 100;
                  return (
                    <TableRow key={r.id}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <div className="flex size-9 items-center justify-center rounded-md bg-accent text-primary">
                            <Building2 className="size-4" />
                          </div>
                          <div className="font-medium">{r.name ?? "—"}</div>
                        </div>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {r.purchase_id ? (
                          <Link href={`/purchases`} className="hover:underline">
                            {r.vendor_name ?? "—"}
                          </Link>
                        ) : (
                          (r.vendor_name ?? "—")
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground">{r.start_date ?? "—"}</TableCell>
                      <TableCell className="text-end font-medium">{formatJOD(r.cost ?? 0, locale)}</TableCell>
                      <TableCell className="text-end text-muted-foreground">{Number(r.years ?? 0)}</TableCell>
                      <TableCell className="text-end">{formatJOD(r.monthly_depreciation ?? 0, locale)}</TableCell>
                      <TableCell className="text-end text-destructive">−{formatJOD(r.accumulated_depreciation ?? 0, locale)}</TableCell>
                      <TableCell className="text-end font-semibold">{formatJOD(r.book_value ?? 0, locale)}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 w-24 overflow-hidden rounded-full bg-muted">
                            <div
                              className={"h-full " + (fullyDepreciated ? "bg-destructive" : "bg-primary")}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <Badge variant={fullyDepreciated ? "warning" : "secondary"} className="text-[10px]">
                            {pct}%
                          </Badge>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          ) : (
            <div className="flex flex-col items-center gap-3 p-12 text-center">
              <Boxes className="size-10 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">{t("fixedAssets.empty")}</p>
              <p className="max-w-md text-xs text-muted-foreground">{t("fixedAssets.emptyHint")}</p>
              <Link href="/purchases/new" className={buttonVariants({ variant: "outline" })}>
                {t("purchases.add")}
              </Link>
            </div>
          )}
        </CardContent>
      </Card>
    </>
  );
}

function KpiCard({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <Card className={accent ? "border-primary/30 bg-primary/5" : ""}>
      <CardContent className="p-4">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className={"mt-1 text-xl font-bold " + (accent ? "text-primary" : "")}>{value}</div>
      </CardContent>
    </Card>
  );
}

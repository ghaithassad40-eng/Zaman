"use client";

import { useState, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import Link from "next/link";
import { Boxes, Building2, CalendarClock, Loader2, Search } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useI18n } from "@/lib/i18n/provider";
import { PageHeader } from "@/components/page-header";
import { ExportButton } from "@/components/export-button";
import { SortableHead, useSort } from "@/components/ui/sortable-head";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
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

      {/* Monthly depreciation processor — pick a month and book the entries */}
      <DepreciationProcessor />


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

/**
 * Monthly depreciation processor.
 *
 * The operator picks a year + month and clicks "Process". An RPC runs through
 * every active asset (from v_assets) whose start date is on/before the end of
 * the chosen month and whose depreciable life hasn't been exhausted yet, then
 * inserts one depreciation_postings row per asset/month. The same period can
 * be re-run safely — already-posted (asset, year, month) tuples are skipped,
 * never duplicated.
 *
 * The recent-postings table below the picker is the audit trail.
 */
function DepreciationProcessor() {
  const { t, locale } = useI18n();
  const supabase = createClient();
  const qc = useQueryClient();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);

  type Posting = {
    id: string;
    asset_ref: string;
    asset_name: string;
    period_year: number;
    period_month: number;
    amount: number;
    posted_at: string;
  };

  const { data: postings } = useQuery({
    queryKey: ["depreciation-postings"],
    queryFn: async (): Promise<Posting[]> => {
      const { data, error } = await supabase
        .from("depreciation_postings")
        .select("id, asset_ref, asset_name, period_year, period_month, amount, posted_at")
        .order("period_year", { ascending: false })
        .order("period_month", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as Posting[];
    },
  });

  // Group postings by period for the summary line.
  const byPeriod = useMemo(() => {
    const m = new Map<string, { year: number; month: number; count: number; total: number; postedAt: string }>();
    for (const p of postings ?? []) {
      const k = `${p.period_year}-${p.period_month}`;
      const cur = m.get(k) ?? { year: p.period_year, month: p.period_month, count: 0, total: 0, postedAt: p.posted_at };
      cur.count += 1;
      cur.total += Number(p.amount);
      if (p.posted_at > cur.postedAt) cur.postedAt = p.posted_at;
      m.set(k, cur);
    }
    return Array.from(m.values()).sort((a, b) =>
      b.year !== a.year ? b.year - a.year : b.month - a.month,
    );
  }, [postings]);

  const run = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("process_depreciation", {
        p_year: year,
        p_month: month,
      });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      return {
        posted: Number(row?.posted_count ?? 0),
        total: Number(row?.total_amount ?? 0),
        skipped: Number(row?.skipped_count ?? 0),
      };
    },
    onSuccess: (r) => {
      if (r.posted > 0) {
        toast.success(
          t("fixedAssets.processOk")
            .replace("{n}", String(r.posted))
            .replace("{amt}", formatJOD(r.total, locale)),
        );
      } else if (r.skipped > 0) {
        toast.info(t("fixedAssets.processAllSkipped").replace("{n}", String(r.skipped)));
      } else {
        toast.info(t("fixedAssets.processNothing"));
      }
      qc.invalidateQueries({ queryKey: ["depreciation-postings"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Generate options once — last 5 years + next 1 keep the dropdown small.
  const years = useMemo(() => {
    const y0 = now.getFullYear();
    return [y0 - 4, y0 - 3, y0 - 2, y0 - 1, y0, y0 + 1];
  }, [now]);

  return (
    <Card className="mb-6">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CalendarClock className="size-4" aria-hidden />
          {t("fixedAssets.processTitle")}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="mb-3 text-sm text-muted-foreground">{t("fixedAssets.processHint")}</p>
        <div className="grid items-end gap-3 sm:grid-cols-[1fr_1fr_auto]">
          <div className="space-y-1.5">
            <Label>{t("common.year") || "Year"}</Label>
            <Select value={String(year)} onChange={(e) => setYear(Number(e.target.value))}>
              {years.map((y) => <option key={y} value={y}>{y}</option>)}
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>{t("common.month") || "Month"}</Label>
            <Select value={String(month)} onChange={(e) => setMonth(Number(e.target.value))}>
              {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                <option key={m} value={m}>
                  {new Date(2000, m - 1, 1).toLocaleString(locale === "ar" ? "ar-JO" : "en", { month: "long" })}
                </option>
              ))}
            </Select>
          </div>
          <Button onClick={() => run.mutate()} disabled={run.isPending}>
            {run.isPending && <Loader2 className="size-4 animate-spin" />}
            <CalendarClock className="size-4" />
            {t("fixedAssets.processBtn")}
          </Button>
        </div>

        {byPeriod.length > 0 && (
          <div className="mt-5">
            <div className="mb-2 text-xs font-semibold uppercase text-muted-foreground">
              {t("fixedAssets.recentPostings")}
            </div>
            <div className="overflow-x-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("fixedAssets.period")}</TableHead>
                    <TableHead className="text-end">{t("fixedAssets.assetsCount")}</TableHead>
                    <TableHead className="text-end">{t("fixedAssets.totalAmount")}</TableHead>
                    <TableHead className="text-end">{t("fixedAssets.postedAt")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {byPeriod.slice(0, 12).map((p) => (
                    <TableRow key={`${p.year}-${p.month}`}>
                      <TableCell className="font-medium">
                        {new Date(p.year, p.month - 1, 1).toLocaleString(locale === "ar" ? "ar-JO" : "en", {
                          month: "long",
                          year: "numeric",
                        })}
                      </TableCell>
                      <TableCell className="text-end">{p.count}</TableCell>
                      <TableCell className="text-end font-medium">{formatJOD(p.total, locale)}</TableCell>
                      <TableCell className="text-end text-xs text-muted-foreground">
                        {new Date(p.postedAt).toLocaleDateString()}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

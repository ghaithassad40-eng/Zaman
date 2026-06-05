"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
} from "recharts";
import { TrendingUp, Crown, PackageX, RefreshCw, Watch } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useI18n } from "@/lib/i18n/provider";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { formatJOD, round3 } from "@/lib/utils";

type Stat = { id: string; name: string; nameAr: string | null; units: number; revenue: number; stock: number };

const GOLD = "#9a7426";

function useAnalytics() {
  const supabase = createClient();
  return useQuery({
    queryKey: ["analytics"],
    queryFn: async () => {
      const [products, saleItems, sales] = await Promise.all([
        supabase
          .from("products")
          .select("id, name, name_ar, historical_units_sold, historical_revenue, inventory(qty_on_hand)")
          .is("deleted_at", null),
        supabase
          .from("sale_items")
          .select("product_id, qty, line_total, sales(status, deleted_at, sale_date)")
          .not("product_id", "is", null),
        supabase
          .from("sales")
          .select("sale_date, total, status, deleted_at")
          .is("deleted_at", null),
      ]);

      // real per-product sales (going forward)
      const realByProduct = new Map<string, { units: number; revenue: number }>();
      for (const si of saleItems.data ?? []) {
        const s = si.sales as { status: string; deleted_at: string | null } | null;
        if (!s || s.deleted_at || s.status === "cancelled" || s.status === "returned") continue;
        const cur = realByProduct.get(si.product_id as string) ?? { units: 0, revenue: 0 };
        cur.units += Number(si.qty);
        cur.revenue += Number(si.line_total);
        realByProduct.set(si.product_id as string, cur);
      }

      const stats: Stat[] = (products.data ?? []).map((p) => {
        const real = realByProduct.get(p.id) ?? { units: 0, revenue: 0 };
        return {
          id: p.id,
          name: p.name,
          nameAr: p.name_ar,
          units: Number(p.historical_units_sold) + real.units,
          revenue: round3(Number(p.historical_revenue) + real.revenue),
          stock: (p.inventory as { qty_on_hand: number } | null)?.qty_on_hand ?? 0,
        };
      });

      // monthly trend (season)
      const byMonth = new Map<string, number>();
      for (const s of sales.data ?? []) {
        if (s.status === "cancelled" || s.status === "returned") continue;
        const m = String(s.sale_date).slice(0, 7);
        byMonth.set(m, round3((byMonth.get(m) ?? 0) + Number(s.total)));
      }
      const monthly = [...byMonth.entries()].sort().map(([m, total]) => ({ month: m, total }));

      return { stats, monthly };
    },
  });
}

export default function AnalyticsPage() {
  const { t, locale } = useI18n();
  const { data, isLoading } = useAnalytics();

  const view = useMemo(() => {
    const stats = data?.stats ?? [];
    const sold = stats.filter((s) => s.units > 0);
    const topSellers = [...sold].sort((a, b) => b.units - a.units).slice(0, 8);
    const slowMovers = stats.filter((s) => s.stock > 0).sort((a, b) => a.units - b.units).slice(0, 8);
    const reorder = stats.filter((s) => s.units >= 2 && s.stock <= 2).sort((a, b) => b.units - a.units);
    const totalSold = sold.reduce((s, x) => s + x.units, 0);
    return { topSellers, slowMovers, reorder, totalSold, best: topSellers[0] };
  }, [data]);

  const nm = (s: Stat) => (locale === "ar" && s.nameAr ? s.nameAr : s.name);
  const short = (s: string) => (s.length > 20 ? s.slice(0, 19) + "…" : s);

  if (isLoading) {
    return (
      <>
        <PageHeader title={t("analytics.title")} description={t("analytics.subtitle")} />
        <div className="grid gap-4 sm:grid-cols-3"><Skeleton className="h-24" /><Skeleton className="h-24" /><Skeleton className="h-24" /></div>
        <Skeleton className="mt-6 h-72" />
      </>
    );
  }

  if (!data || view.totalSold === 0) {
    return (
      <>
        <PageHeader title={t("analytics.title")} description={t("analytics.subtitle")} />
        <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed p-12 text-center">
          <Watch className="size-10 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">{t("analytics.noSales")}</p>
        </div>
      </>
    );
  }

  const chartData = view.topSellers.map((s) => ({ name: short(nm(s)), units: s.units, id: s.id }));

  return (
    <>
      <PageHeader title={t("analytics.title")} description={t("analytics.subtitle")} />

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card><CardContent className="flex items-center gap-4 p-5">
          <div className="flex size-11 items-center justify-center rounded-lg bg-primary/10 text-primary"><TrendingUp className="size-5" /></div>
          <div><div className="text-sm text-muted-foreground">{t("analytics.totalSold")}</div><div className="text-xl font-bold">{view.totalSold}</div></div>
        </CardContent></Card>
        <Card className="sm:col-span-2"><CardContent className="flex items-center gap-4 p-5">
          <div className="flex size-11 items-center justify-center rounded-lg bg-primary/10 text-primary"><Crown className="size-5" /></div>
          <div className="min-w-0"><div className="text-sm text-muted-foreground">{t("analytics.bestSeller")}</div>
            <div className="truncate text-xl font-bold">{view.best ? nm(view.best) : "—"}{view.best ? ` · ${view.best.units}` : ""}</div></div>
        </CardContent></Card>
      </div>

      {/* Best sellers chart */}
      <Card className="mb-6">
        <CardHeader><CardTitle className="flex items-center gap-2"><Crown className="size-4 text-primary" />{t("analytics.topSellers")}</CardTitle></CardHeader>
        <CardContent>
          <div style={{ width: "100%", height: Math.max(220, chartData.length * 38) }}>
            <ResponsiveContainer>
              <BarChart data={chartData} layout="vertical" margin={{ left: 8, right: 24 }}>
                <XAxis type="number" allowDecimals={false} tick={{ fontSize: 12 }} />
                <YAxis type="category" dataKey="name" width={160} tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v) => [`${v}`, t("analytics.unitsSold")]} />
                <Bar dataKey="units" radius={[0, 4, 4, 0]}>
                  {chartData.map((_, i) => <Cell key={i} fill={GOLD} fillOpacity={1 - i * 0.07} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Season / monthly */}
      <Card className="mb-6">
        <CardHeader><CardTitle className="flex items-center gap-2"><TrendingUp className="size-4 text-primary" />{t("analytics.monthly")}</CardTitle></CardHeader>
        <CardContent>
          <div style={{ width: "100%", height: 260 }}>
            <ResponsiveContainer>
              <BarChart data={data.monthly} margin={{ left: 8, right: 8 }}>
                <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v) => [formatJOD(Number(v), locale), t("analytics.revenue")]} />
                <Bar dataKey="total" fill={GOLD} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Reorder */}
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><RefreshCw className="size-4 text-primary" />{t("analytics.reorder")}</CardTitle></CardHeader>
          <CardContent className="p-0">
            {view.reorder.length ? (
              <Table>
                <TableHeader><TableRow>
                  <TableHead>{t("common.name")}</TableHead>
                  <TableHead className="text-end">{t("analytics.unitsSold")}</TableHead>
                  <TableHead className="text-end">{t("analytics.inStock")}</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {view.reorder.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell className="font-medium">{nm(s)}</TableCell>
                      <TableCell className="text-end">{s.units}</TableCell>
                      <TableCell className="text-end"><Badge variant="warning">{s.stock}</Badge></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : <div className="p-8 text-center text-sm text-muted-foreground">{t("common.empty")}</div>}
          </CardContent>
        </Card>

        {/* Slow movers */}
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><PackageX className="size-4 text-muted-foreground" />{t("analytics.slowMovers")}</CardTitle></CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader><TableRow>
                <TableHead>{t("common.name")}</TableHead>
                <TableHead className="text-end">{t("analytics.unitsSold")}</TableHead>
                <TableHead className="text-end">{t("analytics.inStock")}</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {view.slowMovers.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="font-medium">{nm(s)}</TableCell>
                    <TableCell className="text-end text-muted-foreground">{s.units}</TableCell>
                    <TableCell className="text-end"><Badge variant="secondary">{s.stock}</Badge></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </>
  );
}

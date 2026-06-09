"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, Legend,
} from "recharts";
import { TrendingUp, Crown, PackageX, RefreshCw, Watch, Receipt, Coins, Repeat } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useI18n } from "@/lib/i18n/provider";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { ProductCell } from "@/components/product-cell";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { formatJOD, round3 } from "@/lib/utils";

type Stat = { id: string; name: string; nameAr: string | null; image: string | null; units: number; revenue: number; cogs: number; profit: number; margin: number; stock: number; turnover: number };
type PeriodRow = { period: string; revenue: number; expenses: number; profit: number };
type ExpenseRow = { category: string; total: number };
type Gran = "month" | "quarter" | "year";

const GOLD = "#9a7426";
const RED = "#b54848";

function bucket(date: string, gran: Gran): string {
  const d = new Date(date);
  const y = d.getFullYear();
  const m = d.getMonth();
  if (gran === "year") return String(y);
  if (gran === "quarter") return `${y}-Q${Math.floor(m / 3) + 1}`;
  return `${y}-${String(m + 1).padStart(2, "0")}`;
}

function useAnalytics() {
  const supabase = createClient();
  return useQuery({
    queryKey: ["analytics-v2"],
    queryFn: async () => {
      const [products, saleItems, sales, expenses] = await Promise.all([
        supabase
          .from("products")
          .select("id, name, name_ar, image_urls, inventory(qty_on_hand)")
          .is("deleted_at", null),
        supabase
          .from("sale_items")
          .select("product_id, qty, unit_price, unit_cost, line_total, sales(status, deleted_at, sale_date)")
          .not("product_id", "is", null),
        supabase
          .from("sales")
          .select("sale_date, subtotal, discount, total_cost, status, deleted_at")
          .is("deleted_at", null),
        supabase
          .from("cash_transactions")
          .select("txn_date, amount, category, direction")
          .eq("direction", "out")
          .in("category", ["expense", "marketing", "ads", "fee", "return_delivery"]),
      ]);

      // Per-product aggregates: real sales only (excludes cancelled/returned).
      const byProduct = new Map<string, { units: number; revenue: number; cogs: number }>();
      for (const si of saleItems.data ?? []) {
        const s = si.sales as { status: string; deleted_at: string | null } | null;
        if (!s || s.deleted_at || s.status === "cancelled" || s.status === "returned") continue;
        const cur = byProduct.get(si.product_id as string) ?? { units: 0, revenue: 0, cogs: 0 };
        cur.units += Number(si.qty);
        cur.revenue += Number(si.line_total);
        cur.cogs += Number(si.qty) * Number(si.unit_cost ?? 0);
        byProduct.set(si.product_id as string, cur);
      }

      const stats: Stat[] = (products.data ?? []).map((p) => {
        const a = byProduct.get(p.id) ?? { units: 0, revenue: 0, cogs: 0 };
        const stock = (p.inventory as { qty_on_hand: number } | null)?.qty_on_hand ?? 0;
        const profit = round3(a.revenue - a.cogs);
        const margin = a.revenue > 0 ? round3((profit / a.revenue) * 100) : 0;
        // Inventory turnover (simple): units sold ÷ (current stock + units sold)/2 — average stock proxy.
        const avg = (stock + a.units) / 2;
        const turnover = avg > 0 ? round3(a.units / avg) : 0;
        return {
          id: p.id,
          name: p.name,
          nameAr: p.name_ar,
          image: ((p.image_urls as string[] | null) ?? [])[0] ?? null,
          units: a.units,
          revenue: round3(a.revenue),
          cogs: round3(a.cogs),
          profit,
          margin,
          stock,
          turnover,
        };
      });

      return { stats, sales: sales.data ?? [], expenses: expenses.data ?? [] };
    },
  });
}

export default function AnalyticsPage() {
  const { t, locale } = useI18n();
  const { data, isLoading } = useAnalytics();
  const [gran, setGran] = useState<Gran>("month");

  // Per-period revenue + expenses + profit.
  const periodData = useMemo<PeriodRow[]>(() => {
    if (!data) return [];
    const rev = new Map<string, { revenue: number; cogs: number }>();
    for (const s of data.sales as { sale_date: string; subtotal: number; discount: number; total_cost: number; status: string }[]) {
      if (s.status === "cancelled" || s.status === "returned") continue;
      const k = bucket(s.sale_date, gran);
      const cur = rev.get(k) ?? { revenue: 0, cogs: 0 };
      cur.revenue += Number(s.subtotal) - Number(s.discount);
      cur.cogs += Number(s.total_cost ?? 0);
      rev.set(k, cur);
    }
    const exp = new Map<string, number>();
    for (const e of data.expenses as { txn_date: string; amount: number }[]) {
      const k = bucket(e.txn_date, gran);
      exp.set(k, (exp.get(k) ?? 0) + Number(e.amount));
    }
    const keys = new Set<string>([...rev.keys(), ...exp.keys()]);
    return [...keys].sort().map((k) => {
      const r = rev.get(k) ?? { revenue: 0, cogs: 0 };
      const e = exp.get(k) ?? 0;
      return {
        period: k,
        revenue: round3(r.revenue),
        expenses: round3(e),
        profit: round3(r.revenue - r.cogs - e),
      };
    });
  }, [data, gran]);

  // Expense breakdown by category (period-aggregated for clarity).
  const expenseByCategory = useMemo<ExpenseRow[]>(() => {
    if (!data) return [];
    const m = new Map<string, number>();
    for (const e of data.expenses as { category: string; amount: number }[]) {
      const cat = e.category || "other";
      m.set(cat, (m.get(cat) ?? 0) + Number(e.amount));
    }
    return [...m.entries()].map(([category, total]) => ({ category, total: round3(total) })).sort((a, b) => b.total - a.total);
  }, [data]);

  const view = useMemo(() => {
    const stats = data?.stats ?? [];
    const sold = stats.filter((s) => s.units > 0);
    const topSellers = [...sold].sort((a, b) => b.units - a.units).slice(0, 8);
    const slowMovers = stats.filter((s) => s.stock > 0).sort((a, b) => a.units - b.units).slice(0, 8);
    const reorder = stats.filter((s) => s.units >= 2 && s.stock <= 2).sort((a, b) => b.units - a.units);
    const totalSold = sold.reduce((s, x) => s + x.units, 0);
    const profitability = [...sold].sort((a, b) => b.profit - a.profit).slice(0, 10);
    const turnover = [...sold].sort((a, b) => b.turnover - a.turnover).slice(0, 10);
    const totalRevenue = round3(stats.reduce((s, x) => s + x.revenue, 0));
    const totalProfit = round3(stats.reduce((s, x) => s + x.profit, 0));
    const totalExpenses = round3(expenseByCategory.reduce((s, x) => s + x.total, 0));
    return { topSellers, slowMovers, reorder, totalSold, totalRevenue, totalProfit, totalExpenses, profitability, turnover, best: topSellers[0] };
  }, [data, expenseByCategory]);

  const nm = (s: Stat) => (locale === "ar" && s.nameAr ? s.nameAr : s.name);
  const short = (s: string) => (s.length > 24 ? s.slice(0, 23) + "…" : s);

  if (isLoading) {
    return (
      <>
        <PageHeader title={t("analytics.title")} description={t("analytics.subtitle")} />
        <div className="grid gap-4 sm:grid-cols-4"><Skeleton className="h-24" /><Skeleton className="h-24" /><Skeleton className="h-24" /><Skeleton className="h-24" /></div>
        <Skeleton className="mt-6 h-72" />
      </>
    );
  }

  if (!data || (view.totalSold === 0 && view.totalRevenue === 0)) {
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
      <PageHeader
        title={t("analytics.title")}
        description={t("analytics.subtitle")}
        action={
          <div className="flex items-center gap-2 no-print">
            <Select value={gran} onChange={(e) => setGran(e.target.value as Gran)} className="w-32">
              <option value="month">{t("reports.monthly")}</option>
              <option value="quarter">{t("reports.quarterly")}</option>
              <option value="year">{t("reports.yearly")}</option>
            </Select>
          </div>
        }
      />

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card><CardContent className="flex items-center gap-4 p-5">
          <div className="flex size-11 items-center justify-center rounded-lg bg-primary/10 text-primary"><TrendingUp className="size-5" /></div>
          <div><div className="text-sm text-muted-foreground">{t("analytics.totalRevenue")}</div>
            <div className="text-xl font-bold">{formatJOD(view.totalRevenue, locale)}</div></div>
        </CardContent></Card>
        <Card><CardContent className="flex items-center gap-4 p-5">
          <div className="flex size-11 items-center justify-center rounded-lg bg-success/10 text-success"><Coins className="size-5" /></div>
          <div><div className="text-sm text-muted-foreground">{t("analytics.totalProfit")}</div>
            <div className="text-xl font-bold">{formatJOD(view.totalProfit, locale)}</div></div>
        </CardContent></Card>
        <Card><CardContent className="flex items-center gap-4 p-5">
          <div className="flex size-11 items-center justify-center rounded-lg bg-destructive/10 text-destructive"><Receipt className="size-5" /></div>
          <div><div className="text-sm text-muted-foreground">{t("analytics.totalExpenses")}</div>
            <div className="text-xl font-bold">{formatJOD(view.totalExpenses, locale)}</div></div>
        </CardContent></Card>
        <Card><CardContent className="flex items-center gap-4 p-5">
          <div className="flex size-11 items-center justify-center rounded-lg bg-amber-100 text-amber-700"><Crown className="size-5" /></div>
          <div className="min-w-0"><div className="text-sm text-muted-foreground">{t("analytics.bestSeller")}</div>
            <div className="truncate text-xl font-bold">{view.best ? nm(view.best) : "—"}</div></div>
        </CardContent></Card>
      </div>

      {/* Revenue + Expenses per period */}
      <Card className="mb-6">
        <CardHeader><CardTitle className="flex items-center gap-2"><TrendingUp className="size-4 text-primary" />{t("analytics.revenueExpenses")}</CardTitle></CardHeader>
        <CardContent>
          {periodData.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">{t("common.empty")}</div>
          ) : (
            <div style={{ width: "100%", height: 320 }}>
              <ResponsiveContainer>
                <BarChart data={periodData} margin={{ left: 8, right: 8 }}>
                  <XAxis dataKey="period" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v, name) => [formatJOD(Number(v), locale), t(`analytics.${String(name)}` as never)]} />
                  <Legend wrapperStyle={{ fontSize: 12 }} formatter={(value) => t(`analytics.${String(value)}` as never)} />
                  <Bar dataKey="revenue" fill={GOLD} radius={[4, 4, 0, 0]} />
                  <Bar dataKey="expenses" fill={RED} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("reports.period")}</TableHead>
                <TableHead className="text-end">{t("analytics.revenue")}</TableHead>
                <TableHead className="text-end">{t("analytics.expenses")}</TableHead>
                <TableHead className="text-end">{t("analytics.profit")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {periodData.map((r) => (
                <TableRow key={r.period}>
                  <TableCell className="font-medium">{r.period}</TableCell>
                  <TableCell className="text-end">{formatJOD(r.revenue, locale)}</TableCell>
                  <TableCell className="text-end text-destructive">{formatJOD(r.expenses, locale)}</TableCell>
                  <TableCell className={`text-end font-semibold ${r.profit >= 0 ? "text-success" : "text-destructive"}`}>{formatJOD(r.profit, locale)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <div className="mb-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Expenses by category */}
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Receipt className="size-4 text-destructive" />{t("analytics.expensesReport")}</CardTitle></CardHeader>
          <CardContent className="p-0">
            {expenseByCategory.length === 0 ? (
              <div className="p-8 text-center text-sm text-muted-foreground">{t("common.empty")}</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("assets.category")}</TableHead>
                    <TableHead className="text-end">{t("common.total")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {expenseByCategory.map((r) => (
                    <TableRow key={r.category}>
                      <TableCell className="font-medium capitalize">{r.category}</TableCell>
                      <TableCell className="text-end font-medium">{formatJOD(r.total, locale)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Product profitability */}
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Coins className="size-4 text-success" />{t("analytics.profitability")}</CardTitle></CardHeader>
          <CardContent className="p-0">
            {view.profitability.length === 0 ? (
              <div className="p-8 text-center text-sm text-muted-foreground">{t("common.empty")}</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("common.name")}</TableHead>
                    <TableHead className="text-end">{t("analytics.revenue")}</TableHead>
                    <TableHead className="text-end">{t("analytics.profit")}</TableHead>
                    <TableHead className="text-end">{t("analytics.margin")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {view.profitability.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell><ProductCell image={s.image} name={nm(s)} size="sm" /></TableCell>
                      <TableCell className="text-end text-muted-foreground">{formatJOD(s.revenue, locale)}</TableCell>
                      <TableCell className={`text-end font-medium ${s.profit >= 0 ? "text-success" : "text-destructive"}`}>{formatJOD(s.profit, locale)}</TableCell>
                      <TableCell className="text-end">{s.margin}%</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Product turnover */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Repeat className="size-4 text-primary" />{t("analytics.turnover")}</CardTitle>
          <p className="text-xs text-muted-foreground">{t("analytics.turnoverHint")}</p>
        </CardHeader>
        <CardContent className="p-0">
          {view.turnover.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">{t("common.empty")}</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("common.name")}</TableHead>
                  <TableHead className="text-end">{t("analytics.unitsSold")}</TableHead>
                  <TableHead className="text-end">{t("analytics.inStock")}</TableHead>
                  <TableHead className="text-end">{t("analytics.turnoverRatio")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {view.turnover.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell><ProductCell image={s.image} name={nm(s)} size="sm" /></TableCell>
                    <TableCell className="text-end">{s.units}</TableCell>
                    <TableCell className="text-end text-muted-foreground">{s.stock}</TableCell>
                    <TableCell className="text-end font-semibold">{s.turnover}×</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Best sellers chart */}
      <Card className="mb-6">
        <CardHeader><CardTitle className="flex items-center gap-2"><Crown className="size-4 text-primary" />{t("analytics.topSellers")}</CardTitle></CardHeader>
        <CardContent>
          <div style={{ width: "100%", height: Math.max(220, chartData.length * 38) }}>
            <ResponsiveContainer>
              <BarChart data={chartData} layout="vertical" margin={{ left: 8, right: 24 }}>
                <XAxis type="number" allowDecimals={false} tick={{ fontSize: 12 }} />
                <YAxis type="category" dataKey="name" width={180} tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v) => [`${v}`, t("analytics.unitsSold")]} />
                <Bar dataKey="units" radius={[0, 4, 4, 0]}>
                  {chartData.map((_, i) => <Cell key={i} fill={GOLD} fillOpacity={1 - i * 0.07} />)}
                </Bar>
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
                      <TableCell><ProductCell image={s.image} name={nm(s)} size="sm" /></TableCell>
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
                    <TableCell><ProductCell image={s.image} name={nm(s)} size="sm" /></TableCell>
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

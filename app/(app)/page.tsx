"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  TrendingUp, ShoppingBag, Boxes, Coins, Landmark, Megaphone, Target, Plus, Loader2,
  Package, AlertTriangle, Receipt, Truck, ChevronRight, Wallet, Scale, ArrowUpRight,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useI18n } from "@/lib/i18n/provider";
import { PageHeader } from "@/components/page-header";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn, formatJOD, round3 } from "@/lib/utils";
import type { DictKey } from "@/lib/i18n/dictionaries";
import type { Tables } from "@/types/database.types";

type Fin = {
  pl: { net_profit: number };
  gst: { net_due: number };
  balance_sheet: { cash: number; inventory: number; packaging_inventory: number; courier_receivable: number; vendor_payable?: number; total_equity: number };
};

function useDashboard() {
  const supabase = createClient();
  return useQuery({
    queryKey: ["dashboard"],
    queryFn: async () => {
      const today = new Date().toISOString().slice(0, 10);
      // Headline tiles are Year-to-Date so they include opening-balance
      // historical sales (imported from the products template, dated Jan 1).
      const since = `${new Date().getFullYear()}-01-01`;

      const [sales, inventory, recent, marketing, toPack, fin, hist] = await Promise.all([
        supabase.from("sales").select("total, gross_profit").gte("sale_date", since)
          .neq("status", "cancelled").neq("status", "returned").is("deleted_at", null),
        supabase.from("inventory").select("qty_on_hand, avg_unit_cost, products(expected_selling_price, default_selling_price)"),
        supabase.from("sales").select("sale_no, total, gross_profit, sale_date, status, customers(name)")
          .is("deleted_at", null).order("created_at", { ascending: false }).limit(8),
        supabase.from("cash_transactions").select("amount").eq("direction", "out").in("category", ["marketing", "ads"]).gte("txn_date", since),
        supabase.from("sales").select("id", { count: "exact", head: true }).eq("status", "confirmed").is("deleted_at", null),
        supabase.rpc("get_financials", { p_from: "2000-01-01", p_to: today }),
        // Historical (imported) totals from the product upload: pre-system sales.
        supabase.from("products").select("historical_units_sold, historical_revenue, actual_cost").is("deleted_at", null),
      ]);

      const revenue = (sales.data ?? []).reduce((s, r) => s + Number(r.total), 0);
      const profit = (sales.data ?? []).reduce((s, r) => s + Number(r.gross_profit), 0);
      const orders = (sales.data ?? []).length;
      const expectedRevenue = (inventory.data ?? []).reduce((s, r) => {
        const pr = r.products as { expected_selling_price: number | null; default_selling_price: number | null } | null;
        const exp = pr?.expected_selling_price ?? pr?.default_selling_price ?? 0;
        return s + Number(r.qty_on_hand) * Number(exp);
      }, 0);
      const lowStock = (inventory.data ?? []).filter((r) => Number(r.qty_on_hand) <= 2).length;
      const marketing30 = (marketing.data ?? []).reduce((s, r) => s + Number(r.amount), 0);
      const roas = marketing30 > 0 ? revenue / marketing30 : null;
      const f = (fin.data ?? null) as Fin | null;

      // Historical (imported) totals: pre-system sales the user entered via the products template.
      const hRows = (hist.data ?? []) as { historical_units_sold: number; historical_revenue: number; actual_cost: number | null }[];
      const histUnits = hRows.reduce((s, r) => s + Number(r.historical_units_sold ?? 0), 0);
      const histRevenue = hRows.reduce((s, r) => s + Number(r.historical_revenue ?? 0), 0);
      const histCost = hRows.reduce((s, r) => s + Number(r.historical_units_sold ?? 0) * Number(r.actual_cost ?? 0), 0);
      const histProfit = histRevenue - histCost;
      const hasHist = histUnits > 0 || histRevenue > 0;

      return {
        revenue, profit, orders, expectedRevenue, lowStock, marketing30, roas,
        toPack: toPack.count ?? 0,
        cash: f?.balance_sheet.cash ?? 0,
        stockValue: f?.balance_sheet.inventory ?? 0,
        packagingStock: f?.balance_sheet.packaging_inventory ?? 0,
        gstDue: f?.gst.net_due ?? 0,
        vendorRecv: f?.balance_sheet.courier_receivable ?? 0,
        equity: f?.balance_sheet.total_equity ?? 0,
        recent: recent.data ?? [],
        hasHist, histUnits, histRevenue, histProfit,
      };
    },
  });
}

const TONES: Record<string, string> = {
  primary: "bg-primary/10 text-primary",
  green: "bg-success/12 text-success",
  amber: "bg-amber-100 text-amber-700",
  red: "bg-destructive/10 text-destructive",
  blue: "bg-sky-100 text-sky-700",
  slate: "bg-muted text-foreground/70",
};

function Kpi({ icon: Icon, label, value, sub, tone = "primary", loading }: {
  icon: React.ElementType; label: string; value?: string; sub?: string; tone?: string; loading?: boolean;
}) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-center justify-between">
          <span className={cn("flex size-10 items-center justify-center rounded-lg", TONES[tone])}>
            <Icon className="size-5" />
          </span>
          {sub && <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{sub}</span>}
        </div>
        <div className="mt-3 text-sm text-muted-foreground">{label}</div>
        {loading ? <Skeleton className="mt-1 h-7 w-24" /> : <div className="text-2xl font-bold tracking-tight">{value}</div>}
      </CardContent>
    </Card>
  );
}

function ActionCard({ href, icon: Icon, label, value, tone, loading, alert }: {
  href: string; icon: React.ElementType; label: string; value?: string; tone: string; loading?: boolean; alert?: boolean;
}) {
  return (
    <Link href={href} className="group">
      <Card className={cn("transition hover:border-primary/40 hover:shadow-sm", alert && "border-destructive/30")}>
        <CardContent className="flex items-center gap-3 p-4">
          <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-lg", TONES[tone])}>
            <Icon className="size-5" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-xs text-muted-foreground">{label}</div>
            {loading ? <Skeleton className="mt-1 h-5 w-16" /> : <div className="text-lg font-bold tracking-tight">{value}</div>}
          </div>
          <ChevronRight className="size-4 text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-primary rtl:rotate-180" />
        </CardContent>
      </Card>
    </Link>
  );
}

function statusBadge(status: string, t: (k: DictKey) => string) {
  const variant = status === "cancelled" ? "destructive" : status === "returned" ? "warning" : status === "confirmed" ? "secondary" : "success";
  const label = status === "returned" ? t("sales.returned") : status === "packed" ? t("sales.packed") : status;
  return <Badge variant={variant as never}>{label}</Badge>;
}

export default function DashboardPage() {
  const { t, locale } = useI18n();
  const { data, isLoading } = useDashboard();
  const [expenseOpen, setExpenseOpen] = useState(false);
  const j = (n?: number) => (data ? formatJOD(n ?? 0, locale) : undefined);

  return (
    <>
      <PageHeader
        title={t("dashboard.title")}
        description={t("app.tagline")}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" onClick={() => setExpenseOpen(true)}>
              <Plus className="size-4" /> {t("dashboard.addExpense")}
            </Button>
            <Link href="/sell" className={buttonVariants()}>
              <ShoppingBag className="size-4" /> {t("sales.newSale")}
            </Link>
          </div>
        }
      />

      {/* 30-day performance */}
      <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-muted-foreground">
        <ArrowUpRight className="size-4" /> {t("dashboard.ytd")}
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi icon={TrendingUp} label={t("dashboard.revenue")} value={j(data?.revenue)} sub={t("dashboard.ytdShort")} tone="primary" loading={isLoading} />
        <Kpi icon={Coins} label={t("dashboard.profit")} value={j(data?.profit)} sub={t("dashboard.ytdShort")} tone="green" loading={isLoading} />
        <Kpi icon={ShoppingBag} label={t("dashboard.orders")} value={data?.orders?.toString()} sub={t("dashboard.ytdShort")} tone="blue" loading={isLoading} />
        <Kpi icon={Target} label={t("dashboard.roas")} value={data ? (data.roas != null ? `${data.roas.toFixed(1)}×` : "—") : undefined} sub={t("dashboard.marketing")} tone="amber" loading={isLoading} />
      </div>

      {/* Needs attention */}
      <div className="mb-2 mt-6 flex items-center gap-2 text-sm font-semibold text-muted-foreground">
        <AlertTriangle className="size-4" /> {t("dashboard.attention")}
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <ActionCard href="/sales" icon={Package} label={t("dashboard.toPack")} value={data?.toPack?.toString()} tone={data && data.toPack > 0 ? "amber" : "slate"} loading={isLoading} alert={!!data && data.toPack > 0} />
        <ActionCard href="/products" icon={AlertTriangle} label={t("dashboard.lowStock")} value={data?.lowStock?.toString()} tone={data && data.lowStock > 0 ? "red" : "slate"} loading={isLoading} alert={!!data && data.lowStock > 0} />
        <ActionCard href="/vendors" icon={Truck} label={t("dashboard.codToCollect")} value={j(data?.vendorRecv)} tone="green" loading={isLoading} />
        <ActionCard href="/reports" icon={Receipt} label={t("dashboard.gstDue")} value={j(data?.gstDue)} tone="blue" loading={isLoading} />
      </div>

      {/* Position */}
      <div className="mb-2 mt-6 flex items-center gap-2 text-sm font-semibold text-muted-foreground">
        <Scale className="size-4" /> {t("dashboard.position")}
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi icon={Wallet} label={t("banks.expectedTotal")} value={j(data?.cash)} tone="green" loading={isLoading} />
        <Kpi icon={Boxes} label={t("dashboard.stockValue")} value={j(data?.stockValue)} tone="primary" loading={isLoading} />
        <Kpi icon={Megaphone} label={t("dashboard.marketing")} value={j(data?.marketing30)} sub={t("dashboard.ytdShort")} tone="amber" loading={isLoading} />
        <Kpi icon={Landmark} label={t("reports.totalEquity")} value={j(data?.equity)} tone="slate" loading={isLoading} />
      </div>

      {/* Recent sales */}
      <Card className="mt-6">
        <CardContent className="p-0">
          <div className="flex items-center justify-between border-b p-4">
            <span className="font-semibold">{t("dashboard.recentSales")}</span>
            <Link href="/sales" className="text-sm text-primary hover:underline">{t("common.viewAll")}</Link>
          </div>
          {isLoading ? (
            <div className="space-y-2 p-4">
              {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : data && data.recent.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("sales.no")}</TableHead>
                  <TableHead>{t("sell.customer")}</TableHead>
                  <TableHead className="hidden sm:table-cell">{t("common.date")}</TableHead>
                  <TableHead>{t("common.status")}</TableHead>
                  <TableHead className="text-end">{t("common.total")}</TableHead>
                  <TableHead className="hidden text-end sm:table-cell">{t("common.profit")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.recent.map((r) => (
                  <TableRow key={r.sale_no}>
                    <TableCell className="font-medium">{r.sale_no}</TableCell>
                    <TableCell>{(r.customers as { name: string } | null)?.name ?? "—"}</TableCell>
                    <TableCell className="hidden text-muted-foreground sm:table-cell">{r.sale_date}</TableCell>
                    <TableCell>{statusBadge(r.status, t)}</TableCell>
                    <TableCell className="text-end font-medium">{formatJOD(r.total, locale)}</TableCell>
                    <TableCell className="hidden text-end text-success sm:table-cell">{formatJOD(r.gross_profit, locale)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="p-10 text-center text-sm text-muted-foreground">{t("common.empty")}</div>
          )}
        </CardContent>
      </Card>

      <ExpenseDialog open={expenseOpen} onClose={() => setExpenseOpen(false)} />
    </>
  );
}

function ExpenseDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t, locale } = useI18n();
  const supabase = createClient();
  const qc = useQueryClient();

  const { data: accounts } = useQuery({
    queryKey: ["accounts-min"],
    queryFn: async (): Promise<Tables<"accounts">[]> => {
      const { data } = await supabase
        .from("accounts").select("*").eq("is_courier", false).is("deleted_at", null)
        .order("is_default", { ascending: false }).order("created_at");
      return data ?? [];
    },
  });

  const [form, setForm] = useState({ amount: "", category: "marketing", account_id: "", note: "", date: new Date().toISOString().slice(0, 10) });
  const accountId = form.account_id || accounts?.[0]?.id || "";

  const add = useMutation({
    mutationFn: async () => {
      if (!accountId) throw new Error("Add a cash/bank account first (Banks → Add account)");
      const { data: userData } = await supabase.auth.getUser();
      const { error } = await supabase.from("cash_transactions").insert({
        account_id: accountId,
        direction: "out",
        amount: round3(Number(form.amount) || 0),
        category: form.category,
        note: form.note.trim() || null,
        txn_date: form.date,
        created_by: userData.user?.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(t("dashboard.addExpense"));
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      qc.invalidateQueries({ queryKey: ["banks"] });
      qc.invalidateQueries({ queryKey: ["financials"] });
      setForm({ amount: "", category: "marketing", account_id: "", note: "", date: new Date().toISOString().slice(0, 10) });
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent onClose={onClose}>
        <DialogHeader>
          <DialogTitle>{t("dashboard.addExpense")}</DialogTitle>
        </DialogHeader>
        <form onSubmit={(e) => { e.preventDefault(); add.mutate(); }} className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label>{t("banks.amount")} (JOD) *</Label>
            <Input required type="number" step="0.001" dir="ltr" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label>{t("assets.category")}</Label>
            <Select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
              <option value="marketing">{t("reports.marketing")}</option>
              <option value="expense">{t("reports.expenses")}</option>
              <option value="fee">Fee</option>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>{t("banks.account")}</Label>
            <Select value={accountId} onChange={(e) => setForm({ ...form, account_id: e.target.value })}>
              {(accounts ?? []).map((a) => (
                <option key={a.id} value={a.id}>{locale === "ar" && a.name_ar ? a.name_ar : a.name}{a.is_default ? " ★" : ""}</option>
              ))}
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>{t("common.date")}</Label>
            <Input type="date" dir="ltr" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
          </div>
          <div className="col-span-2 space-y-1.5">
            <Label>{t("common.notes")}</Label>
            <Input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="e.g. Instagram ads – June" />
          </div>
          <div className="col-span-2 flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose}>{t("common.cancel")}</Button>
            <Button type="submit" disabled={add.isPending}>
              {add.isPending && <Loader2 className="size-4 animate-spin" />}
              {t("common.save")}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

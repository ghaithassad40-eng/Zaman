"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { TrendingUp, ShoppingBag, Boxes, Coins, Landmark, Megaphone, Target, Plus, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useI18n } from "@/lib/i18n/provider";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { formatJOD, round3 } from "@/lib/utils";
import type { Tables } from "@/types/database.types";

function useDashboard() {
  const supabase = createClient();
  return useQuery({
    queryKey: ["dashboard"],
    queryFn: async () => {
      const since = new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10);

      const [sales, inventory, recent, accounts, marketing] = await Promise.all([
        supabase
          .from("sales")
          .select("total, gross_profit, status")
          .gte("sale_date", since)
          .neq("status", "cancelled")
          .neq("status", "returned")
          .is("deleted_at", null),
        supabase.from("inventory").select("qty_on_hand, avg_unit_cost, products(name, expected_selling_price, default_selling_price)"),
        supabase
          .from("sales")
          .select("sale_no, total, gross_profit, sale_date, status, customers(name)")
          .is("deleted_at", null)
          .order("created_at", { ascending: false })
          .limit(8),
        supabase.from("accounts").select("opening_balance, is_courier, cash_transactions(direction, amount)").is("deleted_at", null),
        supabase.from("cash_transactions").select("amount").eq("direction", "out").in("category", ["marketing", "ads"]).gte("txn_date", since),
      ]);

      const revenue = (sales.data ?? []).reduce((s, r) => s + Number(r.total), 0);
      const profit = (sales.data ?? []).reduce((s, r) => s + Number(r.gross_profit), 0);
      const orders = (sales.data ?? []).length;
      const stockValue = (inventory.data ?? []).reduce(
        (s, r) => s + Number(r.qty_on_hand) * Number(r.avg_unit_cost),
        0,
      );
      const expectedRevenue = (inventory.data ?? []).reduce((s, r) => {
        const pr = r.products as { expected_selling_price: number | null; default_selling_price: number | null } | null;
        const exp = pr?.expected_selling_price ?? pr?.default_selling_price;
        return s + (exp ? Number(r.qty_on_hand) * Number(exp) : 0);
      }, 0);
      const lowStock = (inventory.data ?? []).filter((r) => Number(r.qty_on_hand) <= 2).length;

      const expectedCash = (accounts.data ?? [])
        .filter((a) => !a.is_courier)
        .reduce((s, a) => {
          const net = ((a.cash_transactions as { direction: string; amount: number }[]) ?? []).reduce(
            (n, x) => n + (x.direction === "in" ? Number(x.amount) : -Number(x.amount)),
            0,
          );
          return s + Number(a.opening_balance) + net;
        }, 0);

      const marketing30 = (marketing.data ?? []).reduce((s, r) => s + Number(r.amount), 0);
      const roas = marketing30 > 0 ? revenue / marketing30 : null;

      return {
        revenue, profit, orders, stockValue, lowStock, expectedCash, expectedRevenue,
        marketing30, roas, recent: recent.data ?? [],
      };
    },
  });
}

export default function DashboardPage() {
  const { t, locale } = useI18n();
  const { data, isLoading } = useDashboard();
  const [expenseOpen, setExpenseOpen] = useState(false);

  const stats = [
    { key: "dashboard.revenue", icon: TrendingUp, value: data && formatJOD(data.revenue, locale) },
    { key: "dashboard.profit", icon: Coins, value: data && formatJOD(data.profit, locale) },
    { key: "dashboard.orders", icon: ShoppingBag, value: data?.orders?.toString() },
    { key: "dashboard.stockValue", icon: Boxes, value: data && formatJOD(data.stockValue, locale) },
    { key: "products.expectedRevenue", icon: TrendingUp, value: data && formatJOD(data.expectedRevenue, locale) },
    { key: "banks.expectedTotal", icon: Landmark, value: data && formatJOD(data.expectedCash, locale) },
    { key: "dashboard.marketing", icon: Megaphone, value: data && formatJOD(data.marketing30, locale) },
    { key: "dashboard.roas", icon: Target, value: data ? (data.roas != null ? `${data.roas.toFixed(1)}×` : "—") : undefined },
  ] as const;

  return (
    <>
      <PageHeader
        title={t("dashboard.title")}
        description={t("app.tagline")}
        action={
          <Button onClick={() => setExpenseOpen(true)}>
            <Plus className="size-4" /> {t("dashboard.addExpense")}
          </Button>
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map(({ key, icon: Icon, value }) => (
          <Card key={key}>
            <CardContent className="flex items-center gap-4 p-5">
              <div className="flex size-11 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Icon className="size-5" />
              </div>
              <div className="min-w-0">
                <div className="text-sm text-muted-foreground">{t(key)}</div>
                {isLoading ? (
                  <Skeleton className="mt-1 h-6 w-24" />
                ) : (
                  <div className="text-xl font-bold">{value}</div>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="mt-6">
        <CardContent className="p-0">
          <div className="border-b p-4 font-semibold">{t("dashboard.recentSales")}</div>
          {isLoading ? (
            <div className="space-y-2 p-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : data && data.recent.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("sales.no")}</TableHead>
                  <TableHead>{t("sell.customer")}</TableHead>
                  <TableHead>{t("common.date")}</TableHead>
                  <TableHead>{t("common.status")}</TableHead>
                  <TableHead className="text-end">{t("common.total")}</TableHead>
                  <TableHead className="text-end">{t("common.profit")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.recent.map((r) => (
                  <TableRow key={r.sale_no}>
                    <TableCell className="font-medium">{r.sale_no}</TableCell>
                    <TableCell>{(r.customers as { name: string } | null)?.name ?? "—"}</TableCell>
                    <TableCell className="text-muted-foreground">{r.sale_date}</TableCell>
                    <TableCell>
                      <Badge variant={r.status === "cancelled" ? "destructive" : r.status === "returned" ? "warning" : "success"}>
                        {r.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-end font-medium">{formatJOD(r.total, locale)}</TableCell>
                    <TableCell className="text-end text-success">{formatJOD(r.gross_profit, locale)}</TableCell>
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

  // default the account to the first (default) account
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

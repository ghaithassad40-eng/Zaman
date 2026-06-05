"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Printer, TrendingUp, Coins, Percent, Landmark, CheckCircle2, XCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useI18n } from "@/lib/i18n/provider";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatJOD } from "@/lib/utils";

type Financials = {
  pl: { revenue: number; cogs: number; gross_profit: number; delivery_income: number; delivery_expense: number; marketing: number; expenses: number; net_profit: number };
  gst: { rate: number; taxable_sales: number; output_gst: number; input_gst: number; net_due: number };
  balance_sheet: {
    cash: number; courier_receivable: number; inventory: number; equipment: number; packaging_inventory: number; total_assets: number;
    gst_payable: number; total_liabilities: number;
    contributed_capital: number; opening_capital: number; retained_earnings: number; drawings: number; total_equity: number;
  };
  roe: number;
  partners: { id: string; name: string; name_ar: string | null; pct: number; capital: number; profit_share: number; drawings: number; equity: number }[];
  audits: { key: string; label: string; pass: boolean; detail: string }[];
};

function periodRange(period: string): { from: string; to: string } {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  switch (period) {
    case "thisMonth":
      return { from: iso(new Date(y, m, 1)), to: iso(new Date(y, m + 1, 0)) };
    case "lastMonth":
      return { from: iso(new Date(y, m - 1, 1)), to: iso(new Date(y, m, 0)) };
    case "thisYear":
      return { from: `${y}-01-01`, to: `${y}-12-31` };
    default:
      return { from: "2000-01-01", to: "2100-12-31" };
  }
}

export default function ReportsPage() {
  const { t, locale } = useI18n();
  const supabase = createClient();
  const [period, setPeriod] = useState("thisYear");
  const range = useMemo(() => periodRange(period), [period]);

  const { data, isLoading } = useQuery({
    queryKey: ["financials", range.from, range.to],
    queryFn: async (): Promise<Financials> => {
      const { data, error } = await supabase.rpc("get_financials", { p_from: range.from, p_to: range.to });
      if (error) throw error;
      return data as unknown as Financials;
    },
  });

  const money = (n: number) => formatJOD(n, locale);

  return (
    <>
      <PageHeader
        title={t("reports.title")}
        description={t("reports.subtitle")}
        action={
          <div className="flex items-center gap-2 no-print">
            <Select value={period} onChange={(e) => setPeriod(e.target.value)} className="w-40">
              <option value="thisMonth">{t("reports.thisMonth")}</option>
              <option value="lastMonth">{t("reports.lastMonth")}</option>
              <option value="thisYear">{t("reports.thisYear")}</option>
              <option value="allTime">{t("reports.allTime")}</option>
            </Select>
            <Button variant="outline" onClick={() => window.print()}>
              <Printer className="size-4" /> {t("reports.print")}
            </Button>
          </div>
        }
      />

      {isLoading || !data ? (
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24" />)}
          </div>
          <Skeleton className="h-64" />
        </div>
      ) : (
        <div className="space-y-6">
          {/* KPIs */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Kpi icon={Coins} label={t("reports.netProfit")} value={money(data.pl.net_profit)} accent={data.pl.net_profit >= 0} />
            <Kpi icon={TrendingUp} label={t("reports.grossProfit")} value={money(data.pl.gross_profit)} />
            <Kpi icon={Percent} label={t("reports.roe")} value={`${data.roe}%`} />
            <Kpi icon={Landmark} label={t("reports.netGstDue")} value={money(data.gst.net_due)} />
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {/* Income statement */}
            <Card>
              <CardHeader><CardTitle>{t("reports.incomeStatement")}</CardTitle></CardHeader>
              <CardContent className="space-y-1.5 text-sm">
                <Line label={t("reports.revenue")} value={money(data.pl.revenue)} />
                <Line label={t("reports.cogs")} value={`(${money(data.pl.cogs)})`} muted />
                <Line label={t("reports.grossProfit")} value={money(data.pl.gross_profit)} strong />
                <Line label={t("reports.deliveryIncome")} value={money(data.pl.delivery_income)} muted />
                <Line label={t("reports.deliveryExpense")} value={`(${money(data.pl.delivery_expense)})`} muted />
                <Line label={t("reports.marketing")} value={`(${money(data.pl.marketing)})`} muted />
                <Line label={t("reports.expenses")} value={`(${money(data.pl.expenses)})`} muted />
                <div className="my-1 border-t" />
                <Line label={t("reports.netProfit")} value={money(data.pl.net_profit)} strong accent />
              </CardContent>
            </Card>

            {/* Tax manager */}
            <Card>
              <CardHeader><CardTitle>{t("reports.taxManager")}</CardTitle></CardHeader>
              <CardContent className="space-y-1.5 text-sm">
                <Line label={t("reports.taxableSales")} value={money(data.gst.taxable_sales)} />
                <Line label={`${t("reports.outputGst")} (${data.gst.rate}%)`} value={money(data.gst.output_gst)} />
                <Line label={t("reports.inputGst")} value={`(${money(data.gst.input_gst)})`} muted />
                <div className="my-1 border-t" />
                <Line label={t("reports.netGstDue")} value={money(data.gst.net_due)} strong accent />
                <p className="pt-2 text-xs text-muted-foreground">
                  {locale === "ar"
                    ? "ضريبة المبيعات العامة 16٪ تُحصّل على المبيعات وتُورّد لدائرة ضريبة الدخل والمبيعات."
                    : "16% GST is collected on sales and remitted to the Jordan Income & Sales Tax Dept."}
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Balance sheet */}
          <Card>
            <CardHeader><CardTitle>{t("reports.balanceSheet")}</CardTitle></CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
                <div>
                  <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("reports.assets")}</div>
                  <div className="space-y-1.5 text-sm">
                    <Line label={t("reports.cash")} value={money(data.balance_sheet.cash)} />
                    {data.balance_sheet.courier_receivable > 0 && (
                      <Line label={t("reports.courierReceivable")} value={money(data.balance_sheet.courier_receivable)} />
                    )}
                    <Line label={t("reports.inventory")} value={money(data.balance_sheet.inventory)} />
                    <Line label={t("reports.equipment")} value={money(data.balance_sheet.equipment)} />
                    <Line label={t("reports.packagingInventory")} value={money(data.balance_sheet.packaging_inventory)} />
                    <div className="my-1 border-t" />
                    <Line label={t("reports.totalAssets")} value={money(data.balance_sheet.total_assets)} strong accent />
                  </div>
                </div>
                <div>
                  <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("reports.liabilities")}</div>
                  <div className="space-y-1.5 text-sm">
                    <Line label={t("reports.gstPayable")} value={money(data.balance_sheet.gst_payable)} />
                    <div className="my-1 border-t" />
                    <Line label={t("reports.totalLiabilities")} value={money(data.balance_sheet.total_liabilities)} strong />
                  </div>
                </div>
                <div>
                  <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("reports.equity")}</div>
                  <div className="space-y-1.5 text-sm">
                    <Line label={t("reports.contributedCapital")} value={money(data.balance_sheet.contributed_capital)} />
                    <Line label={t("reports.openingCapital")} value={money(data.balance_sheet.opening_capital)} />
                    <Line label={t("reports.retainedEarnings")} value={money(data.balance_sheet.retained_earnings)} />
                    <Line label={t("reports.drawings")} value={`(${money(data.balance_sheet.drawings)})`} muted />
                    <div className="my-1 border-t" />
                    <Line label={t("reports.totalEquity")} value={money(data.balance_sheet.total_equity)} strong accent />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Partner equity */}
          <Card>
            <CardHeader><CardTitle>{t("reports.partnerEquity")}</CardTitle></CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("reports.partner")}</TableHead>
                    <TableHead className="text-end">%</TableHead>
                    <TableHead className="text-end">{t("reports.capital")}</TableHead>
                    <TableHead className="text-end">{t("reports.profitShare")}</TableHead>
                    <TableHead className="text-end">{t("reports.drawings")}</TableHead>
                    <TableHead className="text-end">{t("reports.equityCol")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.partners.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="font-medium">{locale === "ar" && p.name_ar ? p.name_ar : p.name}</TableCell>
                      <TableCell className="text-end">{p.pct}%</TableCell>
                      <TableCell className="text-end">{money(p.capital)}</TableCell>
                      <TableCell className="text-end text-success">{money(p.profit_share)}</TableCell>
                      <TableCell className="text-end text-muted-foreground">({money(p.drawings)})</TableCell>
                      <TableCell className="text-end font-semibold">{money(p.equity)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* Audit */}
          <Card>
            <CardHeader><CardTitle>{t("reports.audit")}</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {data.audits.map((a) => (
                <div key={a.key} className="flex items-center justify-between rounded-md border p-3">
                  <div className="flex items-center gap-2">
                    {a.pass ? (
                      <CheckCircle2 className="size-5 text-success" />
                    ) : (
                      <XCircle className="size-5 text-destructive" />
                    )}
                    <span className="text-sm font-medium">{a.label}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    {a.detail && <span className="hidden text-xs text-muted-foreground sm:inline">{a.detail}</span>}
                    <Badge variant={a.pass ? "success" : "destructive"}>{a.pass ? "OK" : "!"}</Badge>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      )}
    </>
  );
}

function Kpi({ icon: Icon, label, value, accent }: { icon: React.ElementType; label: string; value: string; accent?: boolean }) {
  return (
    <Card>
      <CardContent className="flex items-center gap-4 p-5">
        <div className="flex size-11 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Icon className="size-5" />
        </div>
        <div className="min-w-0">
          <div className="text-sm text-muted-foreground">{label}</div>
          <div className={"text-xl font-bold " + (accent === false ? "text-destructive" : "")}>{value}</div>
        </div>
      </CardContent>
    </Card>
  );
}

function Line({ label, value, strong, muted, accent }: { label: string; value: string; strong?: boolean; muted?: boolean; accent?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className={muted ? "text-muted-foreground" : strong ? "font-semibold" : ""}>{label}</span>
      <span className={(strong ? "font-bold " : "") + (accent ? "text-primary" : muted ? "text-muted-foreground" : "")}>{value}</span>
    </div>
  );
}

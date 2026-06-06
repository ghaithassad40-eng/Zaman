"use client";

import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Printer, TrendingUp, Coins, Percent, Landmark, CheckCircle2, XCircle, FileText, Loader2, Users, Truck, Lock, LockOpen } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useI18n } from "@/lib/i18n/provider";
import { useCompanySettings, useCustomers } from "@/lib/hooks";
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
import { formatJOD, round3 } from "@/lib/utils";
import { downloadFinancialReport, type ReportSection } from "@/lib/pdf/report";
import { downloadStatementPdf, type StatementLine } from "@/lib/pdf/statement";
import { downloadCustomerStatement } from "@/lib/statements";
import { downloadAuditorReport, type FinSnapshot } from "@/lib/pdf/auditor-report";
import { ScrollText } from "lucide-react";

type Financials = {
  pl: { revenue: number; cogs: number; gross_profit: number; delivery_income: number; delivery_expense: number; marketing: number; expenses: number; net_profit: number };
  gst: { rate: number; taxable_sales: number; output_gst: number; input_gst: number; net_due: number };
  balance_sheet: {
    cash: number; courier_receivable: number; inventory: number; equipment: number; packaging_inventory: number; total_assets: number;
    gst_payable: number; vendor_payable?: number; total_liabilities: number;
    contributed_capital: number; opening_capital: number; retained_earnings: number; drawings: number; total_equity: number;
  };
  roe: number;
  partners: { id: string; name: string; name_ar: string | null; pct: number; capital: number; profit_share: number; drawings: number; equity: number }[];
  audits: { key: string; label: string; pass: boolean; detail: string }[];
};

type Gran = "month" | "quarter" | "year";
type Period = { value: string; label: string; from: string; to: string };

const pad = (n: number) => String(n).padStart(2, "0");
const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const today = () => iso(new Date());
const pdfMoney = (n: number) => Number(n ?? 0).toFixed(3);

function buildPeriods(gran: Gran, locale: string): Period[] {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const out: Period[] = [];
  if (gran === "month") {
    const fmt = new Intl.DateTimeFormat(locale === "ar" ? "ar" : "en", { month: "long", year: "numeric" });
    for (let i = 0; i < 24; i++) {
      const d = new Date(y, m - i, 1);
      out.push({
        value: `${d.getFullYear()}-${pad(d.getMonth() + 1)}`,
        label: fmt.format(d),
        from: iso(new Date(d.getFullYear(), d.getMonth(), 1)),
        to: iso(new Date(d.getFullYear(), d.getMonth() + 1, 0)),
      });
    }
  } else if (gran === "quarter") {
    const q0 = Math.floor(m / 3);
    for (let i = 0; i < 8; i++) {
      let cq = q0 - i;
      let cy = y;
      while (cq < 0) { cq += 4; cy -= 1; }
      const sm = cq * 3;
      out.push({
        value: `${cy}-Q${cq + 1}`,
        label: `Q${cq + 1} ${cy}`,
        from: iso(new Date(cy, sm, 1)),
        to: iso(new Date(cy, sm + 3, 0)),
      });
    }
  } else {
    for (let i = 0; i < 5; i++) {
      const cy = y - i;
      out.push({ value: `${cy}`, label: `${cy}`, from: `${cy}-01-01`, to: `${cy}-12-31` });
    }
  }
  return out;
}

export default function ReportsPage() {
  const { t, locale } = useI18n();
  const supabase = createClient();
  const { data: company } = useCompanySettings();
  const { data: customers } = useCustomers();

  const [gran, setGran] = useState<Gran>("month");
  const periods = useMemo(() => buildPeriods(gran, locale), [gran, locale]);
  const [periodValue, setPeriodValue] = useState(periods[0]?.value ?? "");
  const period = periods.find((p) => p.value === periodValue) ?? periods[0];
  const range = { from: period?.from ?? "2000-01-01", to: period?.to ?? "2100-12-31" };

  function onGranChange(g: Gran) {
    setGran(g);
    setPeriodValue(buildPeriods(g, locale)[0]?.value ?? "");
  }

  const { data: vendors } = useQuery({
    queryKey: ["vendors-list-mini"],
    queryFn: async () => {
      const { data } = await supabase.from("vendors").select("id, name, name_ar, phone, opening_balance").is("deleted_at", null).order("name");
      return data ?? [];
    },
  });

  const { data, isLoading } = useQuery({
    queryKey: ["financials", range.from, range.to],
    queryFn: async (): Promise<Financials> => {
      const { data, error } = await supabase.rpc("get_financials", { p_from: range.from, p_to: range.to });
      if (error) throw error;
      return data as unknown as Financials;
    },
  });

  const money = (n: number) => formatJOD(n, locale);
  const [busy, setBusy] = useState<string | null>(null);
  const qc = useQueryClient();

  const { data: isAdmin } = useQuery({
    queryKey: ["is-admin-partner"],
    queryFn: async () => (await supabase.rpc("is_admin_partner")).data ?? false,
  });

  const { data: closes } = useQuery({
    queryKey: ["fiscal-closes"],
    queryFn: async () => {
      const { data } = await supabase.from("fiscal_closes").select("*").order("period_to", { ascending: false });
      return data ?? [];
    },
  });

  const todayStr = today();
  const periodEnded = range.to < todayStr;
  const alreadyClosed = (closes ?? []).some((c) => c.status === "closed" && c.period_to >= range.to);

  async function closePeriod() {
    if (!window.confirm(`${t("reports.closeConfirm")} (${period.label})`)) return;
    setBusy("close");
    try {
      const { error } = await supabase.rpc("close_fiscal_year", { p_from: range.from, p_to: range.to, p_label: period.label });
      if (error) throw error;
      toast.success(t("reports.closed"));
      qc.invalidateQueries({ queryKey: ["fiscal-closes"] });
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(null); }
  }

  async function reopenPeriod(id: string, label: string) {
    if (!window.confirm(`${t("reports.reopenConfirm")} (${label})`)) return;
    setBusy(id);
    try {
      const { error } = await supabase.rpc("reopen_fiscal_year", { p_id: id });
      if (error) throw error;
      toast.success(t("reports.reopened"));
      qc.invalidateQueries({ queryKey: ["fiscal-closes"] });
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(null); }
  }

  async function downloadStatements(from: string, to: string, label: string) {
    const cur = (await supabase.rpc("get_financials", { p_from: from, p_to: to })).data;
    if (!cur) throw new Error("No data");
    const d0 = new Date(from + "T00:00:00Z").getTime();
    const d1 = new Date(to + "T00:00:00Z").getTime();
    const days = Math.round((d1 - d0) / 864e5) + 1;
    const isoOf = (ms: number) => new Date(ms).toISOString().slice(0, 10);
    const pTo = isoOf(d0 - 864e5);
    const pFrom = isoOf(d0 - days * 864e5);
    const prior = (await supabase.rpc("get_financials", { p_from: pFrom, p_to: pTo })).data;
    const method: [string, string] = days >= 350 ? ["Annual", "السنوية"] : days >= 80 ? ["Quarterly", "الربع سنوية"] : ["Monthly", "الشهرية"];
    await downloadAuditorReport({
      company: company ?? null,
      current: cur as unknown as FinSnapshot,
      prior: (prior ?? null) as unknown as FinSnapshot | null,
      period: { from, to, label, priorLabel: null, closingMethodEn: method[0], closingMethodAr: method[1] },
      generatedOn: todayStr,
    });
  }

  // ---- PDF: Taxation report ----
  async function taxPdf() {
    if (!data) return;
    setBusy("tax");
    try {
      const g = data.gst;
      const sections: ReportSection[] = [
        {
          heading: "GST / ضريبة المبيعات العامة",
          rows: [
            { label: "Taxable sales / المبيعات الخاضعة", value: pdfMoney(g.taxable_sales) },
            { label: `Output GST (${g.rate}%) / ضريبة المخرجات`, value: pdfMoney(g.output_gst) },
            { label: "Input GST / ضريبة المدخلات", value: `(${pdfMoney(g.input_gst)})`, muted: true },
            { label: "Net GST payable / صافي الضريبة المستحقة", value: pdfMoney(g.net_due), strong: true, accent: true },
          ],
        },
      ];
      await downloadFinancialReport({
        filename: `tax-report-${period.value}.pdf`,
        titleEn: "Taxation Report",
        titleAr: "التقرير الضريبي",
        periodLabel: period.label,
        company: company ?? null,
        sections,
        note: "16% GST is collected on sales and remitted to the Jordan Income & Sales Tax Department.",
        generatedOn: today(),
      });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  // ---- PDF: Balance sheet ----
  async function balancePdf() {
    if (!data) return;
    setBusy("balance");
    try {
      const b = data.balance_sheet;
      const sections: ReportSection[] = [
        {
          heading: "Assets / الأصول",
          rows: [
            { label: "Cash & bank / النقد والبنوك", value: pdfMoney(b.cash), indent: true },
            { label: "Vendor receivable / ذمم الموردين", value: pdfMoney(b.courier_receivable), indent: true },
            { label: "Inventory / المخزون", value: pdfMoney(b.inventory), indent: true },
            { label: "Equipment / المعدات", value: pdfMoney(b.equipment), indent: true },
            { label: "Packaging stock / مخزون التغليف", value: pdfMoney(b.packaging_inventory), indent: true },
            { label: "Total assets / إجمالي الأصول", value: pdfMoney(b.total_assets), strong: true, accent: true },
          ],
        },
        {
          heading: "Liabilities / الالتزامات",
          rows: [
            { label: "GST payable / ضريبة مستحقة", value: pdfMoney(b.gst_payable), indent: true },
            ...(b.vendor_payable ? [{ label: "Vendor payable / مستحقات الموردين", value: pdfMoney(b.vendor_payable), indent: true }] : []),
            { label: "Total liabilities / إجمالي الالتزامات", value: pdfMoney(b.total_liabilities), strong: true },
          ],
        },
        {
          heading: "Equity / حقوق الملكية",
          rows: [
            { label: "Contributed capital / رأس المال المدفوع", value: pdfMoney(b.contributed_capital), indent: true },
            { label: "Opening capital / رأس المال الافتتاحي", value: pdfMoney(b.opening_capital), indent: true },
            { label: "Retained earnings / الأرباح المحتجزة", value: pdfMoney(b.retained_earnings), indent: true },
            { label: "Drawings / المسحوبات", value: `(${pdfMoney(b.drawings)})`, muted: true, indent: true },
            { label: "Total equity / إجمالي حقوق الملكية", value: pdfMoney(b.total_equity), strong: true, accent: true },
          ],
        },
      ];
      await downloadFinancialReport({
        filename: `balance-sheet-${period.value}.pdf`,
        titleEn: "Balance Sheet",
        titleAr: "الميزانية العمومية",
        periodLabel: period.label,
        company: company ?? null,
        sections,
        generatedOn: today(),
      });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  // ---- PDF: Audited financial statements (auditor's report) ----
  async function auditorPdf() {
    if (!data) return;
    setBusy("auditor");
    try {
      await downloadStatements(range.from, range.to, period.label);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  // ---- PDF: Customer statement ----
  const [custId, setCustId] = useState("");
  async function customerPdf() {
    if (!custId) { toast.error(t("reports.selectCustomer")); return; }
    setBusy("customer");
    try {
      const cust = (customers ?? []).find((c) => c.id === custId);
      if (!cust) throw new Error("Customer not found");
      await downloadCustomerStatement({
        customer: cust,
        company: company ?? null,
        from: range.from,
        to: range.to,
        periodLabel: period.label,
        filenameSuffix: period.value,
      });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  // ---- PDF: Vendor statement ----
  const [vendId, setVendId] = useState("");
  async function vendorPdf() {
    if (!vendId) { toast.error(t("reports.selectVendor")); return; }
    setBusy("vendor");
    try {
      const vend = (vendors ?? []).find((v) => v.id === vendId);
      const { data: txns, error } = await supabase
        .from("vendor_transactions")
        .select("txn_date, category, debit, credit, note")
        .eq("vendor_id", vendId)
        .order("txn_date")
        .order("created_at");
      if (error) throw error;

      const openBal = Number(vend?.opening_balance ?? 0);
      const before = (txns ?? []).filter((x) => x.txn_date < range.from);
      const opening = round3(openBal + before.reduce((a, x) => a + Number(x.debit) - Number(x.credit), 0));
      const within = (txns ?? []).filter((x) => x.txn_date >= range.from && x.txn_date <= range.to);
      let run = opening;
      const lines: StatementLine[] = within.map((x) => {
        run = round3(run + Number(x.debit) - Number(x.credit));
        return { txn_date: x.txn_date, label: x.note || x.category || "—", debit: Number(x.debit), credit: Number(x.credit), balance: run };
      });
      const totalDebit = round3(within.reduce((a, x) => a + Number(x.debit), 0));
      const totalCredit = round3(within.reduce((a, x) => a + Number(x.credit), 0));
      const closing = round3(opening + totalDebit - totalCredit);

      await downloadStatementPdf({
        filename: `vendor-statement-${period.value}.pdf`,
        party: { name: vend?.name ?? "Vendor", name_ar: vend?.name_ar ?? null, phone: vend?.phone ?? null },
        titleEn: "Vendor Statement",
        titleAr: "كشف حساب المورّد",
        partyLabel: "Vendor / المورّد",
        oweLabel: "owes you",
        oweReverseLabel: "you owe",
        company: company ?? null,
        lines,
        opening,
        totalDebit,
        totalCredit,
        closing,
        generatedOn: today(),
        periodLabel: period.label,
      });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <PageHeader
        title={t("reports.title")}
        description={t("reports.subtitle")}
        action={
          <div className="flex flex-wrap items-center gap-2 no-print">
            <Select value={gran} onChange={(e) => onGranChange(e.target.value as Gran)} className="w-32">
              <option value="month">{t("reports.monthly")}</option>
              <option value="quarter">{t("reports.quarterly")}</option>
              <option value="year">{t("reports.yearly")}</option>
            </Select>
            <Select value={periodValue} onChange={(e) => setPeriodValue(e.target.value)} className="w-44">
              {periods.map((p) => (
                <option key={p.value} value={p.value}>{p.label}</option>
              ))}
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

          {/* Audited financial statements */}
          <Card className="border-primary/30 bg-primary/5">
            <CardContent className="flex flex-wrap items-center justify-between gap-3 p-5">
              <div className="flex items-start gap-3">
                <div className="flex size-11 items-center justify-center rounded-lg bg-primary/15 text-primary">
                  <ScrollText className="size-5" />
                </div>
                <div>
                  <div className="font-semibold">{t("reports.auditorReport")}</div>
                  <div className="text-sm text-muted-foreground">{t("reports.auditorHint")}</div>
                </div>
              </div>
              <Button onClick={auditorPdf} disabled={busy === "auditor"}>
                {busy === "auditor" ? <Loader2 className="size-4 animate-spin" /> : <FileText className="size-4" />}
                {t("reports.generate")}
              </Button>
            </CardContent>
          </Card>

          {/* Financial year close */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <CardTitle className="flex items-center gap-2"><Lock className="size-4" /> {t("reports.closeTitle")}</CardTitle>
              {isAdmin && (
                <Button
                  variant={periodEnded && !alreadyClosed ? "default" : "outline"}
                  size="sm"
                  onClick={closePeriod}
                  disabled={busy === "close" || !periodEnded || alreadyClosed}
                >
                  {busy === "close" ? <Loader2 className="size-4 animate-spin" /> : <Lock className="size-4" />}
                  {alreadyClosed ? t("reports.alreadyClosed") : !periodEnded ? t("reports.notEnded") : `${t("reports.closePeriod")} · ${period.label}`}
                </Button>
              )}
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">{t("reports.closeHint")}</p>
              {(closes ?? []).length === 0 ? (
                <p className="text-sm text-muted-foreground">{t("reports.noCloses")}</p>
              ) : (
                <div className="divide-y rounded-md border">
                  {(closes ?? []).map((c) => (
                    <div key={c.id} className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm">
                      <div className="flex items-center gap-3">
                        <Badge variant={c.status === "closed" ? "success" : "secondary"}>
                          {c.status === "closed" ? t("reports.statusClosed") : t("reports.statusReopened")}
                        </Badge>
                        <div>
                          <div className="font-medium">{c.label}</div>
                          <div className="text-xs text-muted-foreground">{c.period_from} → {c.period_to}</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="text-end">
                          <div className="text-xs text-muted-foreground">{t("reports.netProfit")}</div>
                          <div className="font-medium">{money(Number(c.net_profit ?? 0))}</div>
                        </div>
                        <Button size="sm" variant="outline" onClick={() => downloadStatements(c.period_from, c.period_to, c.label)}>
                          <FileText className="size-4" /> {t("reports.statements")}
                        </Button>
                        {isAdmin && c.status === "closed" && (
                          <Button size="sm" variant="ghost" disabled={busy === c.id} onClick={() => reopenPeriod(c.id, c.label)}>
                            {busy === c.id ? <Loader2 className="size-4 animate-spin" /> : <LockOpen className="size-4" />} {t("reports.reopen")}
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Statement generators */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Card>
              <CardHeader><CardTitle className="flex items-center gap-2"><Users className="size-4" /> {t("reports.customerStatement")}</CardTitle></CardHeader>
              <CardContent className="flex flex-wrap items-end gap-2">
                <Select value={custId} onChange={(e) => setCustId(e.target.value)} className="min-w-48 flex-1">
                  <option value="">{t("reports.selectCustomer")}</option>
                  {(customers ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </Select>
                <Button onClick={customerPdf} disabled={busy === "customer"}>
                  {busy === "customer" ? <Loader2 className="size-4 animate-spin" /> : <FileText className="size-4" />}
                  {t("reports.generate")}
                </Button>
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="flex items-center gap-2"><Truck className="size-4" /> {t("reports.vendorStatement")}</CardTitle></CardHeader>
              <CardContent className="flex flex-wrap items-end gap-2">
                <Select value={vendId} onChange={(e) => setVendId(e.target.value)} className="min-w-48 flex-1">
                  <option value="">{t("reports.selectVendor")}</option>
                  {(vendors ?? []).map((v) => <option key={v.id} value={v.id}>{locale === "ar" && v.name_ar ? v.name_ar : v.name}</option>)}
                </Select>
                <Button onClick={vendorPdf} disabled={busy === "vendor"}>
                  {busy === "vendor" ? <Loader2 className="size-4 animate-spin" /> : <FileText className="size-4" />}
                  {t("reports.generate")}
                </Button>
              </CardContent>
            </Card>
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

            {/* Tax manager / Taxation report */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0">
                <CardTitle>{t("reports.taxReport")}</CardTitle>
                <Button size="sm" variant="outline" onClick={taxPdf} disabled={busy === "tax"} className="no-print">
                  {busy === "tax" ? <Loader2 className="size-4 animate-spin" /> : <FileText className="size-4" />}
                  {t("reports.pdf")}
                </Button>
              </CardHeader>
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
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <CardTitle>{t("reports.balanceSheet")}</CardTitle>
              <Button size="sm" variant="outline" onClick={balancePdf} disabled={busy === "balance"} className="no-print">
                {busy === "balance" ? <Loader2 className="size-4 animate-spin" /> : <FileText className="size-4" />}
                {t("reports.pdf")}
              </Button>
            </CardHeader>
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
                    {data.balance_sheet.vendor_payable ? (
                      <Line label={t("reports.vendorStatement")} value={money(data.balance_sheet.vendor_payable)} />
                    ) : null}
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

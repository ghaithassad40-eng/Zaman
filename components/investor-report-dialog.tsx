"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlertTriangle, FileText, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useI18n } from "@/lib/i18n/provider";
import { useCompanySettings } from "@/lib/hooks";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { formatJOD } from "@/lib/utils";
import { Select } from "@/components/ui/select";
import { convertInvestorReport, loadInvestorReport } from "@/lib/investor-report";
import { downloadInvestorReportPdf } from "@/lib/pdf/investor-report";

const ABOUT_KEY = "zw_investor_about";
const DEFAULT_ABOUT =
  "Zaman Watch is a Jordan-based watch retailer. We source watches from international suppliers, " +
  "sell online through Instagram, and deliver to customers across Jordan with cash on delivery.";

function localISODate(d: Date) {
  const pad = (x: number) => String(x).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

const RATE_KEY = "zw_investor_rate_";
const CURRENCIES = ["JOD", "USD", "EUR", "GBP", "SAR", "AED", "KWD", "QAR", "BHD", "OMR", "EGP", "TRY"];
// JOD is pegged to the US dollar; other currencies start empty so the user enters today's rate.
const DEFAULT_RATES: Record<string, string> = { USD: "1.41" };

function readRate(code: string) {
  if (code === "JOD") return "1";
  try {
    return localStorage.getItem(RATE_KEY + code) ?? DEFAULT_RATES[code] ?? "";
  } catch {
    return DEFAULT_RATES[code] ?? "";
  }
}

function readAbout() {
  try {
    return localStorage.getItem(ABOUT_KEY) ?? DEFAULT_ABOUT;
  } catch {
    return DEFAULT_ABOUT;
  }
}

/** Business profile & financial position for presenting the company to a prospective partner/investor. */
export function InvestorReportDialog({
  open,
  defaultFrom,
  defaultTo,
  onClose,
}: {
  open: boolean;
  defaultFrom: string;
  defaultTo: string;
  onClose: () => void;
}) {
  const { t, locale } = useI18n();
  const supabase = createClient();
  const { data: company } = useCompanySettings();
  const today = localISODate(new Date());
  const [from, setFrom] = useState(defaultFrom);
  const [to, setTo] = useState(defaultTo < today ? defaultTo : today);
  const [preparedFor, setPreparedFor] = useState("");
  const [about, setAbout] = useState(readAbout);
  const [includeOwnership, setIncludeOwnership] = useState(true);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [currency, setCurrency] = useState("JOD");
  const [rateText, setRateText] = useState("1");
  const rate = currency === "JOD" ? 1 : Number(rateText);
  const rateOk = Number.isFinite(rate) && rate > 0;

  const { data: report, isFetching, error } = useQuery({
    queryKey: ["investor-report", from, to],
    enabled: open && !!from && !!to && from <= to,
    queryFn: () => loadInvestorReport(supabase, from, to),
  });

  function saveAbout(v: string) {
    setAbout(v);
    try { localStorage.setItem(ABOUT_KEY, v); } catch { /* ignore */ }
  }

  function pickCurrency(code: string) {
    setCurrency(code);
    setRateText(readRate(code));
  }

  function saveRate(v: string) {
    setRateText(v);
    try { localStorage.setItem(RATE_KEY + currency, v); } catch { /* ignore */ }
  }

  async function makePdf() {
    if (!report || !rateOk) return;
    setPdfBusy(true);
    try {
      await downloadInvestorReportPdf({
        company: company ?? null,
        report: shown!,
        preparedFor: preparedFor.trim(),
        about: about.trim(),
        includeOwnership,
        generatedOn: today,
        currency,
        rate,
      });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setPdfBusy(false);
    }
  }

  const shown = report && rateOk ? convertInvestorReport(report, rate) : report;
  const m = (v: number) =>
    !rateOk
      ? "—"
      : currency === "JOD"
      ? formatJOD(v, locale)
      : new Intl.NumberFormat(locale === "ar" ? "ar-JO" : "en-US", { style: "currency", currency }).format(v);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent onClose={onClose} className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("investor.title")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-5 py-1">
          <p className="text-sm text-muted-foreground">{t("investor.hint")}</p>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label>{t("investor.preparedFor")}</Label>
              <Input value={preparedFor} placeholder={t("investor.preparedForPh")} onChange={(e) => setPreparedFor(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>{t("investor.from")}</Label>
              <Input type="date" dir="ltr" value={from} max={to} onChange={(e) => setFrom(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>{t("investor.to")}</Label>
              <Input type="date" dir="ltr" value={to} min={from} onChange={(e) => setTo(e.target.value)} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>{t("investor.about")}</Label>
            <textarea
              rows={3}
              value={about}
              onChange={(e) => saveAbout(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label>{t("investor.currency")}</Label>
              <Select value={currency} onChange={(e) => pickCurrency(e.target.value)}>
                {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </Select>
            </div>
            {currency !== "JOD" && (
              <div className="space-y-1.5 sm:col-span-2">
                <Label>{t("investor.rate")} · 1 JOD = ? {currency}</Label>
                <Input
                  type="number"
                  step="any"
                  min="0"
                  dir="ltr"
                  value={rateText}
                  placeholder="0.0000"
                  onChange={(e) => saveRate(e.target.value)}
                  className={rateOk ? "" : "border-destructive"}
                />
                {!rateOk && <p className="text-xs text-destructive">{t("investor.rateMissing")}</p>}
              </div>
            )}
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" className="size-4 accent-[var(--primary)]" checked={includeOwnership} onChange={(e) => setIncludeOwnership(e.target.checked)} />
            {t("investor.includeOwnership")}
          </label>

          {error ? (
            <p className="text-sm text-destructive">{(error as Error).message}</p>
          ) : !report ? (
            <Skeleton className="h-48" />
          ) : (
            <div className={"space-y-4 " + (isFetching ? "opacity-60" : "")}>
              {report.warnings.length > 0 && (
                <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
                  <div className="mb-1 flex items-center gap-2 font-semibold">
                    <AlertTriangle className="size-4" /> {t("investor.warnTitle")}
                  </div>
                  <ul className="list-disc space-y-0.5 ps-5">
                    {report.warnings.map((w, i) => <li key={i}>{w}</li>)}
                  </ul>
                </div>
              )}
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Stat label={t("investor.revenue")} value={m(shown!.kpis.revenue)} />
                <Stat label={t("investor.grossProfit")} value={m(shown!.kpis.grossProfit)} sub={`${shown!.kpis.grossMargin}%`} />
                <Stat label={t("investor.netProfit")} value={m(shown!.kpis.netProfit)} sub={`${shown!.kpis.netMargin}%`} negative={shown!.kpis.netProfit < 0} />
                <Stat label={t("investor.orders")} value={String(shown!.kpis.orders)} />
                <Stat label={t("investor.totalAssets")} value={m(shown!.position.totalAssets)} negative={shown!.position.totalAssets < 0} />
                <Stat label={t("investor.cash")} value={m(shown!.position.cash)} negative={shown!.position.cash < 0} />
                <Stat label={t("investor.equity")} value={m(shown!.position.totalEquity)} negative={shown!.position.totalEquity < 0} />
                <Stat label={t("investor.stockRetail")} value={m(shown!.stock.atRetail)} sub={`${shown!.stock.units} ${t("investor.units")}`} />
              </div>
            </div>
          )}

          <div className="flex justify-end">
            <Button onClick={makePdf} disabled={pdfBusy || !report || isFetching || !rateOk}>
              {pdfBusy ? <Loader2 className="size-4 animate-spin" /> : <FileText className="size-4" />}
              {t("investor.download")}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Stat({ label, value, sub, negative }: { label: string; value: string; sub?: string; negative?: boolean }) {
  return (
    <div className="rounded-md bg-muted/40 p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={"font-semibold " + (negative ? "text-destructive" : "")}>{value}</div>
      {sub ? <div className="text-xs text-muted-foreground">{sub}</div> : null}
    </div>
  );
}

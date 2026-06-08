"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import QRCode from "qrcode";
import { createClient } from "@/lib/supabase/client";

type Fin = {
  pl: { revenue: number; cogs: number; gross_profit: number; delivery_income: number; delivery_expense: number; marketing: number; expenses: number; depreciation: number; net_profit: number };
  gst: { rate: number; taxable_sales: number; output_gst: number; net_due: number };
  balance_sheet: {
    cash: number; courier_receivable: number; vendor_payable: number; inventory: number;
    equipment: number; fixed_assets: number; accumulated_depreciation: number;
    packaging_inventory: number; total_assets: number; gst_payable: number; total_liabilities: number;
    contributed_capital: number; opening_capital: number; retained_earnings: number; drawings: number; total_equity: number;
  };
  roe: number;
  audits: Array<{ key: string; label: string; pass: boolean; detail: string }>;
  partners: Array<{ id: string; name: string; pct: number; equity: number; profit_share: number; drawings: number }>;
};

function j(n: number | null | undefined) { return `${Number(n ?? 0).toFixed(3)} JOD`; }
function pct(n: number | null | undefined) { return `${(Number(n ?? 0)).toFixed(1)}%`; }
function safeDiv(a: number, b: number): number { return b !== 0 ? a / b : 0; }

/** Bilingual rule-based recommendations derived from the period's numbers. */
function buildRecommendations(fin: Fin): Array<{ tone: "warn" | "info" | "good"; en: string; ar: string }> {
  const out: Array<{ tone: "warn" | "info" | "good"; en: string; ar: string }> = [];
  const { pl, balance_sheet: bs } = fin;
  const gpMargin = pl.revenue > 0 ? (pl.gross_profit / pl.revenue) * 100 : 0;
  const netMargin = pl.revenue > 0 ? (pl.net_profit / pl.revenue) * 100 : 0;
  const equityRatio = bs.total_assets > 0 ? (bs.total_equity / bs.total_assets) * 100 : 0;
  const inventoryShare = bs.total_assets > 0 ? (bs.inventory / bs.total_assets) * 100 : 0;
  const totalOpex = pl.expenses + pl.marketing;

  if (gpMargin < 30 && pl.revenue > 0) {
    out.push({
      tone: "warn",
      en: `Gross margin of ${gpMargin.toFixed(1)}% is below the 30% benchmark for retail. Review selling prices on slow-margin SKUs or negotiate lower landed costs with suppliers.`,
      ar: `هامش الربح الإجمالي ${gpMargin.toFixed(1)}% أقل من معيار التجزئة (30%). راجع أسعار البيع للأصناف ذات الهامش المنخفض أو تفاوض على تخفيض تكلفة الشراء مع المورّدين.`,
    });
  } else if (gpMargin >= 50) {
    out.push({
      tone: "good",
      en: `Gross margin of ${gpMargin.toFixed(1)}% is healthy. Sustain pricing discipline as inventory turns.`,
      ar: `هامش الربح الإجمالي ${gpMargin.toFixed(1)}% صحّي. حافظ على انضباط التسعير مع دوران المخزون.`,
    });
  }

  if (netMargin < 0) {
    out.push({
      tone: "warn",
      en: `Operating at a net loss of ${j(Math.abs(pl.net_profit))}. Cut discretionary marketing and review operating expenses item-by-item before next period.`,
      ar: `يعمل بخسارة صافية قدرها ${j(Math.abs(pl.net_profit))}. خفّض التسويق غير الضروري وراجع المصاريف التشغيلية بنداً بنداً قبل الفترة القادمة.`,
    });
  }

  if (bs.gst_payable > 0) {
    out.push({
      tone: "info",
      en: `Outstanding GST of ${j(bs.gst_payable)} is due to the tax authority. File and settle before the period deadline to avoid penalties.`,
      ar: `ضريبة المبيعات المستحقة (${j(bs.gst_payable)}) واجبة الدفع لدائرة الضريبة. أعدّ الإقرار وسدّد قبل الموعد لتجنّب الغرامات.`,
    });
  }

  if (inventoryShare > 60) {
    out.push({
      tone: "warn",
      en: `Inventory is ${inventoryShare.toFixed(0)}% of total assets — high concentration. Consider promotions on slow movers to free up cash.`,
      ar: `المخزون يمثّل ${inventoryShare.toFixed(0)}% من إجمالي الأصول — تركيز مرتفع. فكّر في عروض على البطيء الحركة لتحرير السيولة.`,
    });
  }

  if (equityRatio < 30 && bs.total_assets > 0) {
    out.push({
      tone: "warn",
      en: `Equity ratio of ${equityRatio.toFixed(0)}% indicates the business is highly leveraged. Reinvest retained earnings rather than declare drawings.`,
      ar: `نسبة حقوق الملكية ${equityRatio.toFixed(0)}% تعني أن المنشأة معتمدة على الديون. أعد استثمار الأرباح المحتجزة بدلاً من السحوبات.`,
    });
  } else if (equityRatio >= 70) {
    out.push({
      tone: "good",
      en: `Equity ratio of ${equityRatio.toFixed(0)}% shows a financially sound, self-funded business.`,
      ar: `نسبة حقوق الملكية ${equityRatio.toFixed(0)}% تعكس وضعاً مالياً سليماً ممولاً ذاتياً.`,
    });
  }

  if (bs.cash > 0 && totalOpex > 0) {
    const runwayMonths = bs.cash / (totalOpex);
    if (runwayMonths < 2) {
      out.push({
        tone: "warn",
        en: `Cash on hand covers approximately ${runwayMonths.toFixed(1)} month(s) of operating costs. Build a 3-month reserve before scaling marketing.`,
        ar: `النقد المتاح يغطي ${runwayMonths.toFixed(1)} شهراً تقريباً من التكاليف التشغيلية. كوّن احتياطياً لـ3 أشهر قبل توسيع التسويق.`,
      });
    }
  }

  if (out.length === 0) {
    out.push({
      tone: "info",
      en: "No material observations for the period. Continue current operating discipline.",
      ar: "لا توجد ملاحظات جوهرية للفترة. استمر في الانضباط التشغيلي الحالي.",
    });
  }

  return out;
}

function PrintStatementsInner() {
  const params = useSearchParams();
  const from = params.get("from") ?? "2000-01-01";
  const to = params.get("to") ?? new Date().toISOString().slice(0, 10);
  const label = params.get("label") ?? `${from} – ${to}`;
  const supabase = createClient();
  const [qrDataUrl, setQrDataUrl] = useState<string>("");

  const { data } = useQuery({
    queryKey: ["print-statements", from, to],
    queryFn: async () => {
      const [fin, company] = await Promise.all([
        supabase.rpc("get_financials", { p_from: from, p_to: to }),
        supabase.from("company_settings").select("*").limit(1).maybeSingle(),
      ]);
      return { fin: fin.data as unknown as Fin | null, company: company.data };
    },
  });

  useEffect(() => {
    if (!data?.fin) return;
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const payload = JSON.stringify({
      type: "zaman-statements", period: label, from, to,
      revenue: data.fin.pl.revenue, net_profit: data.fin.pl.net_profit,
      total_assets: data.fin.balance_sheet.total_assets,
      url: `${origin}/print/statements?from=${from}&to=${to}`,
    });
    QRCode.toDataURL(payload, { errorCorrectionLevel: "M", margin: 1, width: 220, color: { dark: "#221c10", light: "#ffffff" } })
      .then(setQrDataUrl)
      .catch(() => setQrDataUrl(""));
  }, [data?.fin, from, to, label]);

  useEffect(() => {
    if (!data?.fin) return;
    const tm = setTimeout(() => window.print(), 500);
    return () => clearTimeout(tm);
  }, [data?.fin]);

  if (!data) return <div className="p-10 text-center text-muted-foreground">Loading…</div>;
  const { fin, company } = data;
  if (!fin) return <div className="p-10 text-center text-destructive">No data</div>;
  const { pl, gst, balance_sheet: bs, roe } = fin;

  return (
    <>
      <style jsx global>{`
        body { background: #f3efe6; }
        .a4-sheet {
          width: 210mm;
          min-height: 297mm;
          margin: 12mm auto;
          padding: 16mm 14mm 18mm;
          background: white;
          color: #221c10;
          position: relative;
          box-shadow: 0 4px 24px rgba(0,0,0,0.12);
          font-size: 10.5pt;
          line-height: 1.35;
          overflow: hidden;
        }
        .watermark {
          position: absolute;
          left: 5%; right: 5%; top: 35%; height: 40%;
          background-image: url('/logo.png'), url('/brand-watermark.svg');
          background-repeat: no-repeat; background-position: center;
          background-size: contain;
          opacity: 0.11;
          pointer-events: none; z-index: 0;
        }
        .a4-sheet > .sheet-body { position: relative; z-index: 1; }
        @media print {
          @page { size: A4; margin: 0; }
          html, body { background: white !important; }
          .no-print, aside, header.app-topbar { display: none !important; }
          main { padding: 0 !important; margin: 0 !important; }
          .a4-sheet { margin: 0; box-shadow: none; page-break-after: always; }
        }
      `}</style>

      <div className="no-print mx-auto mb-4 flex max-w-[210mm] items-center justify-between px-4 pt-4">
        <div className="text-sm text-muted-foreground">{company?.name ?? "Zaman Watch"} · {label}</div>
        <div className="flex gap-2">
          <button onClick={() => window.print()} className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">
            Print / Save as PDF
          </button>
          <button onClick={() => window.close()} className="rounded-md border px-4 py-2 text-sm">Close</button>
        </div>
      </div>

      <div className="a4-sheet">
        {/* Background watermark — always the system Zaman brand mark */}
        <div className="watermark" />

        <div className="sheet-body">
          {/* Header */}
          <header className="mb-5 flex items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              {company?.logo_url && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={company.logo_url} alt="" className="h-14 w-14 object-contain" />
              )}
              <div>
                <div className="text-2xl font-bold text-[#9a7426]">{company?.name ?? "Zaman Watch"}</div>
                {company?.name_ar && <div className="text-[#9a7426]">{company.name_ar}</div>}
                <div className="mt-1 text-[9pt] text-[#7a6e57]">
                  {[company?.address, company?.phone, company?.email].filter(Boolean).join(" · ")}
                </div>
              </div>
            </div>
            <div className="text-right">
              <div className="text-xl font-bold tracking-wide">FINANCIAL STATEMENTS</div>
              <div className="mt-1 text-sm font-medium">{label}</div>
              <div className="text-[9pt] text-[#7a6e57]">{from} → {to}</div>
            </div>
          </header>

          {/* P&L */}
          <section className="mb-5">
            <h2 className="mb-2 border-b-2 border-[#9a7426] pb-1 text-base font-bold text-[#9a7426]">Income Statement</h2>
            <Row label="Revenue" value={j(pl.revenue)} />
            <Row label="Cost of goods sold" value={`(${j(pl.cogs)})`} />
            <Row label="Gross profit" value={j(pl.gross_profit)} bold />
            <Row label="Delivery income" value={j(pl.delivery_income)} />
            <Row label="Delivery expense" value={`(${j(pl.delivery_expense)})`} />
            <Row label="Marketing" value={`(${j(pl.marketing)})`} />
            <Row label="Operating expenses" value={`(${j(pl.expenses)})`} />
            <Row label="Depreciation" value={`(${j(pl.depreciation)})`} />
            <Row label="Net profit" value={j(pl.net_profit)} bold accent />
          </section>

          {/* Balance Sheet */}
          <section className="mb-5">
            <h2 className="mb-2 border-b-2 border-[#9a7426] pb-1 text-base font-bold text-[#9a7426]">Balance Sheet</h2>
            <div className="mb-1 text-[8pt] uppercase tracking-wider text-[#7a6e57]">Assets</div>
            <Row label="Cash & banks" value={j(bs.cash)} />
            <Row label="Courier receivable" value={j(bs.courier_receivable)} />
            <Row label="Inventory" value={j(bs.inventory)} />
            <Row label="Packaging inventory" value={j(bs.packaging_inventory)} />
            <Row label="Equipment & fixed assets (net)" value={j(bs.equipment)} />
            {bs.accumulated_depreciation > 0 && <Row label="  Accumulated depreciation" value={`(${j(bs.accumulated_depreciation)})`} muted />}
            <Row label="Total assets" value={j(bs.total_assets)} bold />

            <div className="mb-1 mt-3 text-[8pt] uppercase tracking-wider text-[#7a6e57]">Liabilities</div>
            <Row label="GST payable" value={j(bs.gst_payable)} />
            <Row label="Vendor payable" value={j(bs.vendor_payable)} />
            <Row label="Total liabilities" value={j(bs.total_liabilities)} bold />

            <div className="mb-1 mt-3 text-[8pt] uppercase tracking-wider text-[#7a6e57]">Equity</div>
            <Row label="Contributed capital" value={j(bs.contributed_capital)} />
            {bs.opening_capital !== 0 && <Row label="Opening capital adjustment" value={j(bs.opening_capital)} />}
            <Row label="Retained earnings" value={j(bs.retained_earnings)} />
            <Row label="Drawings" value={`(${j(bs.drawings)})`} />
            <Row label="Total equity" value={j(bs.total_equity)} bold accent />
            <Row label="Return on equity" value={`${roe.toFixed(2)}%`} muted />
          </section>

          {/* GST + QR side by side */}
          <div className="grid grid-cols-3 gap-6">
            <section className="col-span-2">
              <h2 className="mb-2 border-b-2 border-[#9a7426] pb-1 text-base font-bold text-[#9a7426]">GST Summary</h2>
              <Row label={`Taxable sales @ ${gst.rate}%`} value={j(gst.taxable_sales)} />
              <Row label="Output GST" value={j(gst.output_gst)} />
              <Row label="Net GST due" value={j(gst.net_due)} bold />
            </section>
            <div className="flex flex-col items-end">
              {qrDataUrl && (
                <>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={qrDataUrl} alt="QR" className="h-28 w-28 rounded-md border border-[#e7e0d1] p-1" />
                  <div className="mt-1 text-[8pt] text-[#7a6e57]">Verify document</div>
                </>
              )}
            </div>
          </div>

          <footer className="absolute bottom-10 left-14 right-14 border-t border-[#e7e0d1] pt-3 text-center text-[8pt] text-[#7a6e57]">
            Page 1 of 2 · Prepared by {company?.name ?? "Zaman Watch"} · Generated {new Date().toISOString().slice(0, 10)}
          </footer>
        </div>
      </div>

      {/* PAGE 2 — Auditor commentary, indicators, observations, recommendations */}
      <AuditorCommentaryPage
        fin={fin}
        company={company}
        from={from}
        to={to}
        label={label}
      />
    </>
  );
}

function AuditorCommentaryPage({
  fin, company, from, to, label,
}: {
  fin: Fin;
  company: { name: string | null; name_ar: string | null; auditor_name?: string | null; auditor_name_ar?: string | null; auditor_firm?: string | null; auditor_license?: string | null } | null;
  from: string; to: string; label: string;
}) {
  const { pl, gst, balance_sheet: bs, roe } = fin;
  const gpMargin = pl.revenue > 0 ? (pl.gross_profit / pl.revenue) * 100 : 0;
  const netMargin = pl.revenue > 0 ? (pl.net_profit / pl.revenue) * 100 : 0;
  const equityRatio = bs.total_assets > 0 ? (bs.total_equity / bs.total_assets) * 100 : 0;
  const debtToEquity = bs.total_equity > 0 ? safeDiv(bs.total_liabilities, bs.total_equity) : 0;
  const currentRatio = bs.total_liabilities > 0 ? safeDiv(bs.cash + bs.courier_receivable + bs.inventory + bs.packaging_inventory, bs.total_liabilities) : 0;
  const quickRatio = bs.total_liabilities > 0 ? safeDiv(bs.cash + bs.courier_receivable, bs.total_liabilities) : 0;
  const invTurnover = bs.inventory > 0 ? safeDiv(pl.cogs, bs.inventory) : 0;
  const assetTurnover = bs.total_assets > 0 ? safeDiv(pl.revenue, bs.total_assets) : 0;

  const recs = buildRecommendations(fin);

  return (
    <div className="a4-sheet">
      <div className="watermark" />
      <div className="sheet-body">
        {/* Header */}
        <header className="mb-4 flex items-end justify-between border-b-2 border-[#9a7426] pb-2">
          <div>
            <div className="text-[15pt] font-bold leading-tight text-[#9a7426]">
              Auditor's Commentary <span style={{ fontFamily: "var(--font-arabic)" }}>· تعليقات المدقّق</span>
            </div>
            <div className="mt-0.5 text-[8pt] text-[#7a6e57]">
              Discussion of financial position, key indicators, observations, and recommendations · مناقشة المركز المالي والمؤشرات والملاحظات والتوصيات
            </div>
          </div>
          <div className="text-right text-[8pt] text-[#7a6e57]">
            <div>{company?.name ?? "Zaman Watch"}</div>
            <div>{label}</div>
          </div>
        </header>

        {/* Executive Summary */}
        <section className="mb-3">
          <h3 className="mb-1 text-[10pt] font-bold uppercase tracking-wider text-[#4a3a18]">Management Discussion · مناقشة الإدارة</h3>
          <p className="text-[9pt] leading-snug">
            During the period <strong>{from}</strong> to <strong>{to}</strong>, the business generated revenue of{" "}
            <strong>{j(pl.revenue)}</strong> and incurred cost of goods sold of <strong>{j(pl.cogs)}</strong>, producing a gross profit of{" "}
            <strong>{j(pl.gross_profit)}</strong> (<strong>{gpMargin.toFixed(1)}%</strong> margin). After operating expenses (<strong>{j(pl.expenses)}</strong>),
            marketing (<strong>{j(pl.marketing)}</strong>), and depreciation (<strong>{j(pl.depreciation)}</strong>), the period closed with a{" "}
            net {pl.net_profit >= 0 ? "profit" : "loss"} of <strong>{j(Math.abs(pl.net_profit))}</strong> ({netMargin.toFixed(1)}% of revenue).
            The balance sheet at the period end shows total assets of <strong>{j(bs.total_assets)}</strong>, financed by total liabilities of{" "}
            <strong>{j(bs.total_liabilities)}</strong> and total equity of <strong>{j(bs.total_equity)}</strong> ({equityRatio.toFixed(0)}% equity ratio).
            Return on equity for the period stands at <strong>{pct(roe)}</strong>.
          </p>
          <p className="mt-1.5 text-[9pt] leading-snug" dir="rtl" style={{ fontFamily: "var(--font-arabic)" }}>
            خلال الفترة من <strong>{from}</strong> إلى <strong>{to}</strong>، حقّقت المنشأة إيرادات بمقدار{" "}
            <strong>{j(pl.revenue)}</strong> وتكبّدت تكلفة بضاعة مباعة قدرها <strong>{j(pl.cogs)}</strong>، ينتج عنها هامش ربح إجمالي{" "}
            <strong>{j(pl.gross_profit)}</strong> (نسبة <strong>{gpMargin.toFixed(1)}%</strong>). وبعد المصاريف التشغيلية (<strong>{j(pl.expenses)}</strong>)،
            والتسويق (<strong>{j(pl.marketing)}</strong>)، والاستهلاك (<strong>{j(pl.depreciation)}</strong>)، أُغلقت الفترة بصافي{" "}
            {pl.net_profit >= 0 ? "ربح" : "خسارة"} قدره <strong>{j(Math.abs(pl.net_profit))}</strong> (نسبة {netMargin.toFixed(1)}% من الإيراد).
            ويُظهر المركز المالي في نهاية الفترة إجمالي أصول قدره <strong>{j(bs.total_assets)}</strong>، مموَّلة بإجمالي مطلوبات{" "}
            <strong>{j(bs.total_liabilities)}</strong> وإجمالي حقوق ملكية <strong>{j(bs.total_equity)}</strong> ({equityRatio.toFixed(0)}% نسبة الملكية).
            بلغ العائد على حقوق الملكية للفترة <strong>{pct(roe)}</strong>.
          </p>
        </section>

        {/* Key Financial Indicators */}
        <section className="mb-3">
          <h3 className="mb-1 text-[10pt] font-bold uppercase tracking-wider text-[#4a3a18]">Key Financial Indicators · المؤشرات المالية الرئيسية</h3>
          <table className="w-full border-collapse text-[9pt]">
            <thead>
              <tr className="bg-[#f3efe6] text-[8pt] uppercase tracking-wider text-[#4a3a18]">
                <th className="border border-[#e7e0d1] p-1 text-left">Indicator · المؤشر</th>
                <th className="border border-[#e7e0d1] p-1 text-right">Value · القيمة</th>
                <th className="border border-[#e7e0d1] p-1 text-left">Reading · التفسير</th>
              </tr>
            </thead>
            <tbody>
              <KpiRow label="Gross margin · هامش الربح الإجمالي" value={pct(gpMargin)} reading={gpMargin >= 50 ? "Healthy · صحّي" : gpMargin >= 30 ? "Acceptable · مقبول" : "Below benchmark · دون المعيار"} />
              <KpiRow label="Net margin · هامش الربح الصافي" value={pct(netMargin)} reading={netMargin >= 15 ? "Strong · قوي" : netMargin >= 0 ? "Profitable · مربح" : "Loss · خسارة"} />
              <KpiRow label="Return on equity (ROE) · العائد على الملكية" value={pct(roe)} reading={roe >= 20 ? "Excellent · ممتاز" : roe > 0 ? "Positive · إيجابي" : "Negative · سلبي"} />
              <KpiRow label="Equity ratio · نسبة حقوق الملكية" value={pct(equityRatio)} reading={equityRatio >= 50 ? "Solid · متين" : "Leveraged · مرتفع الاعتماد على الديون"} />
              <KpiRow label="Debt-to-equity · المديونية إلى الملكية" value={debtToEquity.toFixed(2) + "x"} reading={debtToEquity <= 0.5 ? "Conservative · محافظ" : debtToEquity <= 1.5 ? "Moderate · معتدل" : "High · مرتفع"} />
              <KpiRow label="Current ratio · نسبة التداول" value={currentRatio.toFixed(2) + "x"} reading={currentRatio >= 1.5 ? "Liquid · سيولة جيدة" : currentRatio >= 1 ? "Adequate · كافٍ" : "Tight · ضيق"} />
              <KpiRow label="Quick ratio · النسبة السريعة" value={quickRatio.toFixed(2) + "x"} reading={quickRatio >= 1 ? "Strong · قوي" : "Inventory-dependent · معتمد على المخزون"} />
              <KpiRow label="Inventory turnover · دوران المخزون" value={invTurnover.toFixed(2) + "x"} reading={invTurnover >= 4 ? "Fast · سريع" : invTurnover >= 2 ? "Moderate · متوسط" : "Slow · بطيء"} />
              <KpiRow label="Asset turnover · دوران الأصول" value={assetTurnover.toFixed(2) + "x"} reading={assetTurnover >= 1 ? "Efficient · كفؤ" : "Sub-scale · دون الكفاءة"} />
            </tbody>
          </table>
        </section>

        {/* Audit observations from the existing audits[] array */}
        <section className="mb-3">
          <h3 className="mb-1 text-[10pt] font-bold uppercase tracking-wider text-[#4a3a18]">Audit Observations · ملاحظات التدقيق</h3>
          <div className="space-y-1">
            {(fin.audits ?? []).map((a) => (
              <div key={a.key} className="flex items-start gap-2 text-[9pt]">
                <span className={"mt-0.5 inline-flex size-4 shrink-0 items-center justify-center rounded-full text-[10px] font-bold " + (a.pass ? "bg-success/20 text-success" : "bg-destructive/20 text-destructive")}>
                  {a.pass ? "✓" : "✗"}
                </span>
                <div>
                  <div className="font-medium">{a.label}</div>
                  {a.detail && <div className="text-[8.5pt] text-[#7a6e57]">{a.detail}</div>}
                </div>
              </div>
            ))}
            {(fin.audits ?? []).length === 0 && (
              <p className="text-[9pt] italic text-[#7a6e57]">No audit checks recorded for this period.</p>
            )}
          </div>
        </section>

        {/* Recommendations */}
        <section className="mb-3">
          <h3 className="mb-1 text-[10pt] font-bold uppercase tracking-wider text-[#4a3a18]">Recommendations · التوصيات</h3>
          <ol className="space-y-1.5 text-[9pt]">
            {recs.map((r, i) => (
              <li key={i} className={"rounded-md border p-2 leading-snug " + (
                r.tone === "warn" ? "border-amber-200 bg-amber-50" :
                r.tone === "good" ? "border-emerald-200 bg-emerald-50" :
                "border-sky-200 bg-sky-50"
              )}>
                <div><strong>{i + 1}.</strong> {r.en}</div>
                <div className="mt-0.5" dir="rtl" style={{ fontFamily: "var(--font-arabic)" }}><strong>.{i + 1}</strong> {r.ar}</div>
              </li>
            ))}
          </ol>
        </section>

        {/* GST reminder if any payable */}
        {gst.net_due > 0 && (
          <section className="mb-3 rounded-md border border-[#e7e0d1] bg-white/70 p-2 text-[8.5pt]">
            <strong>GST payable for the period:</strong> {j(gst.net_due)} at {gst.rate}%. File the return and settle before the legal deadline to remain compliant with the General Sales Tax Law of Jordan.<br />
            <span dir="rtl" style={{ fontFamily: "var(--font-arabic)" }}><strong>ضريبة المبيعات المستحقة:</strong> {j(gst.net_due)} بنسبة {gst.rate}%. أعدّ الإقرار وسدّد قبل الموعد القانوني للالتزام بقانون الضريبة العامة على المبيعات في الأردن.</span>
          </section>
        )}

        {/* Auditor signature block */}
        <section className="mt-4">
          <h3 className="mb-1 text-[10pt] font-bold uppercase tracking-wider text-[#4a3a18]">Auditor's Note · ملاحظة المدقّق</h3>
          <p className="text-[8.5pt] italic text-[#7a6e57]">
            The above commentary is derived from the books and records of the business as recorded in its accounting system for the period stated.
            Indicators are computed using standard ratio analysis methodology. Recommendations are advisory.
            <br />
            <span dir="rtl" style={{ fontFamily: "var(--font-arabic)" }}>
              تستند التعليقات أعلاه إلى دفاتر وسجلات المنشأة كما هي مُسجّلة في نظامها المحاسبي للفترة المذكورة.
              تُحتسب المؤشرات وفق منهجية التحليل المالي القياسية. التوصيات استرشادية.
            </span>
          </p>
          <div className="mt-6 grid grid-cols-2 gap-8 text-[9pt]">
            <div>
              <div className="border-t border-[#7a6e57]/40 pt-1 text-center">
                <div className="font-medium">{company?.auditor_name ?? "_____________________"}</div>
                {company?.auditor_name_ar && <div className="text-[8pt]" dir="rtl" style={{ fontFamily: "var(--font-arabic)" }}>{company.auditor_name_ar}</div>}
                <div className="text-[8pt] text-[#7a6e57]">
                  {company?.auditor_firm ?? "Auditor"}{company?.auditor_license ? ` · License ${company.auditor_license}` : ""}
                </div>
              </div>
            </div>
            <div>
              <div className="border-t border-[#7a6e57]/40 pt-1 text-center">
                <div className="font-medium">{company?.name ?? "Zaman Watch"}</div>
                {company?.name_ar && <div className="text-[8pt]" dir="rtl" style={{ fontFamily: "var(--font-arabic)" }}>{company.name_ar}</div>}
                <div className="text-[8pt] text-[#7a6e57]">Management Representative · ممثّل الإدارة</div>
              </div>
            </div>
          </div>
        </section>
      </div>

      <footer className="absolute bottom-10 left-14 right-14 border-t border-[#e7e0d1] pt-3 text-center text-[8pt] text-[#7a6e57]">
        Page 2 of 2 · Auditor's Commentary · {company?.name ?? "Zaman Watch"}
      </footer>
    </div>
  );
}

function KpiRow({ label, value, reading }: { label: string; value: string; reading: string }) {
  return (
    <tr className="bg-white/70 align-top">
      <td className="border border-[#f1ead9] p-1">{label}</td>
      <td className="border border-[#f1ead9] p-1 text-right font-mono">{value}</td>
      <td className="border border-[#f1ead9] p-1 text-[#7a6e57]">{reading}</td>
    </tr>
  );
}

function Row({ label, value, bold, accent, muted }: { label: string; value: string; bold?: boolean; accent?: boolean; muted?: boolean }) {
  return (
    <div className={
      "flex justify-between py-0.5 text-[10.5pt] " +
      (bold ? "font-bold border-t border-[#e7e0d1] mt-0.5 pt-1.5 " : "") +
      (accent ? "text-[#9a7426] " : "") +
      (muted ? "text-[#7a6e57] text-[9pt] " : "")
    }>
      <span>{label}</span>
      <span className="font-mono">{value}</span>
    </div>
  );
}

export default function PrintStatementsPage() {
  return (
    <Suspense fallback={<div className="p-10 text-center text-muted-foreground">Loading…</div>}>
      <PrintStatementsInner />
    </Suspense>
  );
}

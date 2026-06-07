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
};

function j(n: number | null | undefined) { return `${Number(n ?? 0).toFixed(3)} JOD`; }

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
            Prepared by {company?.name ?? "Zaman Watch"} · Generated {new Date().toISOString().slice(0, 10)}
          </footer>
        </div>
      </div>
    </>
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

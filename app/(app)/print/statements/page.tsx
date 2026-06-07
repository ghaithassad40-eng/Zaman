"use client";

import { useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
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
    const tm = setTimeout(() => window.print(), 400);
    return () => clearTimeout(tm);
  }, [data?.fin]);

  if (!data) return <div className="p-10 text-center text-muted-foreground">Loading…</div>;
  const { fin, company } = data;
  if (!fin) return <div className="p-10 text-center text-destructive">No data</div>;
  const { pl, gst, balance_sheet: bs, roe } = fin;

  return (
    <>
      <style jsx global>{`
        @media print {
          html, body { background: white !important; }
          .no-print, aside, header.app-topbar { display: none !important; }
          main { padding: 0 !important; }
          @page { size: A4; margin: 14mm; }
          .page-break { break-after: page; }
        }
      `}</style>

      <div className="no-print mb-4 flex items-center justify-between border-b pb-3">
        <div className="text-sm text-muted-foreground">{company?.name ?? "Zaman Watch"} · {label}</div>
        <div className="flex gap-2">
          <button onClick={() => window.print()} className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">
            Print / Save as PDF
          </button>
          <button onClick={() => window.close()} className="rounded-md border px-4 py-2 text-sm">Close</button>
        </div>
      </div>

      <div className="mx-auto max-w-[800px] bg-white p-8 text-[#221c10]">
        <header className="mb-6 flex items-start justify-between">
          <div>
            <div className="text-2xl font-bold text-[#9a7426]">{company?.name ?? "Zaman Watch"}</div>
            {company?.name_ar && <div className="text-[#9a7426]">{company.name_ar}</div>}
            <div className="mt-1 text-xs text-[#7a6e57]">
              {[company?.address, company?.phone, company?.email].filter(Boolean).join(" · ")}
            </div>
          </div>
          <div className="text-right">
            <div className="text-xl font-bold">FINANCIAL STATEMENTS</div>
            <div className="mt-1 text-sm">{label}</div>
            <div className="text-xs text-[#7a6e57]">{from} → {to}</div>
          </div>
        </header>

        {/* P&L */}
        <section className="mb-8">
          <h2 className="mb-3 border-b border-[#e7e0d1] pb-1 text-lg font-bold text-[#9a7426]">Income Statement</h2>
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
        <section className="mb-8">
          <h2 className="mb-3 border-b border-[#e7e0d1] pb-1 text-lg font-bold text-[#9a7426]">Balance Sheet</h2>
          <div className="mb-2 text-xs uppercase text-[#7a6e57]">Assets</div>
          <Row label="Cash & banks" value={j(bs.cash)} />
          <Row label="Courier receivable" value={j(bs.courier_receivable)} />
          <Row label="Inventory" value={j(bs.inventory)} />
          <Row label="Packaging inventory" value={j(bs.packaging_inventory)} />
          <Row label="Equipment & fixed assets (net)" value={j(bs.equipment)} />
          {bs.accumulated_depreciation > 0 && <Row label="  Accumulated depreciation" value={`(${j(bs.accumulated_depreciation)})`} muted />}
          <Row label="Total assets" value={j(bs.total_assets)} bold />

          <div className="mb-2 mt-4 text-xs uppercase text-[#7a6e57]">Liabilities</div>
          <Row label="GST payable" value={j(bs.gst_payable)} />
          <Row label="Vendor payable" value={j(bs.vendor_payable)} />
          <Row label="Total liabilities" value={j(bs.total_liabilities)} bold />

          <div className="mb-2 mt-4 text-xs uppercase text-[#7a6e57]">Equity</div>
          <Row label="Contributed capital" value={j(bs.contributed_capital)} />
          {bs.opening_capital !== 0 && <Row label="Opening capital adjustment" value={j(bs.opening_capital)} />}
          <Row label="Retained earnings" value={j(bs.retained_earnings)} />
          <Row label="Drawings" value={`(${j(bs.drawings)})`} />
          <Row label="Total equity" value={j(bs.total_equity)} bold accent />
          <Row label="Return on equity" value={`${roe.toFixed(2)}%`} muted />
        </section>

        {/* GST */}
        <section className="mb-8">
          <h2 className="mb-3 border-b border-[#e7e0d1] pb-1 text-lg font-bold text-[#9a7426]">GST Summary</h2>
          <Row label={`Taxable sales @ ${gst.rate}%`} value={j(gst.taxable_sales)} />
          <Row label="Output GST" value={j(gst.output_gst)} />
          <Row label="Net GST due" value={j(gst.net_due)} bold />
        </section>

        <footer className="mt-10 border-t border-[#e7e0d1] pt-3 text-center text-[10px] text-[#7a6e57]">
          Prepared by {company?.name ?? "Zaman Watch"} · Generated {new Date().toISOString().slice(0, 10)}
        </footer>
      </div>
    </>
  );
}

function Row({ label, value, bold, accent, muted }: { label: string; value: string; bold?: boolean; accent?: boolean; muted?: boolean }) {
  return (
    <div className={
      "flex justify-between py-1 text-sm " +
      (bold ? "font-bold border-t border-[#e7e0d1] mt-1 pt-2 " : "") +
      (accent ? "text-[#9a7426] " : "") +
      (muted ? "text-[#7a6e57] text-xs " : "")
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

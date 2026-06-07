"use client";

import { use, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import type { Tables } from "@/types/database.types";

type SaleItem = { description: string | null; qty: number; unit_price: number; line_total: number };

export default function PrintInvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const supabase = createClient();

  const { data } = useQuery({
    queryKey: ["print-invoice", id],
    queryFn: async () => {
      const [inv, company] = await Promise.all([
        supabase.from("invoices").select("*, customers(*)").eq("id", id).maybeSingle(),
        supabase.from("company_settings").select("*").limit(1).maybeSingle(),
      ]);
      const invoice = inv.data as (Tables<"invoices"> & { customers: Tables<"customers"> | null }) | null;
      let items: SaleItem[] = [];
      if (invoice?.sale_id) {
        const { data: si } = await supabase
          .from("sale_items")
          .select("description, qty, unit_price, line_total")
          .eq("sale_id", invoice.sale_id);
        items = (si ?? []) as SaleItem[];
      }
      return { invoice, items, company: company.data as Tables<"company_settings"> | null };
    },
  });

  // Auto-trigger the print dialog once content is rendered.
  useEffect(() => {
    if (!data?.invoice) return;
    const tm = setTimeout(() => window.print(), 400);
    return () => clearTimeout(tm);
  }, [data?.invoice?.id, data?.invoice]);

  if (!data) return <div className="p-10 text-center text-muted-foreground">Loading…</div>;
  const { invoice, items, company } = data;
  if (!invoice) return <div className="p-10 text-center text-destructive">Invoice not found</div>;

  const j = (n: number | null | undefined) => `${Number(n ?? 0).toFixed(3)} JOD`;
  const subtotal = Number(invoice.subtotal);
  const gst = Number(invoice.gst_amount);
  const delivery = Number(invoice.delivery_fee);
  const discount = Number(invoice.discount);
  const total = Number(invoice.total);

  return (
    <>
      {/* Print stylesheet: hide sidebar/topbar, full page, no margins */}
      <style jsx global>{`
        @media print {
          html, body { background: white !important; }
          .no-print, aside, header.app-topbar { display: none !important; }
          main { padding: 0 !important; }
          @page { size: A4; margin: 14mm; }
        }
      `}</style>

      <div className="no-print mb-4 flex items-center justify-between border-b pb-3">
        <div className="text-sm text-muted-foreground">{invoice.invoice_no} · {invoice.issue_date}</div>
        <div className="flex gap-2">
          <button onClick={() => window.print()} className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">
            Print / Save as PDF
          </button>
          <button onClick={() => window.close()} className="rounded-md border px-4 py-2 text-sm">Close</button>
        </div>
      </div>

      <div className="mx-auto max-w-[800px] bg-white p-8 text-[#221c10]">
        {/* Header */}
        <div className="mb-6 flex items-start justify-between">
          <div>
            <div className="text-2xl font-bold text-[#9a7426]">{company?.name ?? "Zaman Watch"}</div>
            {company?.name_ar && <div className="text-base text-[#9a7426]">{company.name_ar}</div>}
            <div className="mt-1 text-xs text-[#7a6e57]">
              {[company?.address, company?.phone, company?.email].filter(Boolean).join(" · ")}
            </div>
            {company?.tax_number && <div className="text-xs text-[#7a6e57]">Tax No: {company.tax_number}</div>}
          </div>
          <div className="text-right">
            <div className="text-xl font-bold">TAX INVOICE</div>
            <div className="mt-1 text-sm">{invoice.invoice_no}</div>
          </div>
        </div>

        {/* Meta */}
        <div className="grid grid-cols-2 gap-6 rounded-md border border-[#e7e0d1] p-4 text-sm">
          <div>
            <div className="text-[10px] uppercase text-[#7a6e57]">Bill To</div>
            <div className="mt-1 font-medium">{invoice.customers?.name ?? "—"}</div>
            {invoice.customers?.phone && <div className="text-xs text-[#7a6e57]">{invoice.customers.phone}</div>}
            {invoice.customers?.address && <div className="text-xs text-[#7a6e57]">{invoice.customers.address}</div>}
          </div>
          <div className="text-right">
            <div className="text-[10px] uppercase text-[#7a6e57]">Issue Date</div>
            <div className="mt-1">{invoice.issue_date}</div>
            {invoice.due_date && (<><div className="mt-2 text-[10px] uppercase text-[#7a6e57]">Due Date</div><div>{invoice.due_date}</div></>)}
          </div>
        </div>

        {/* Items */}
        <table className="mt-6 w-full border-collapse text-sm">
          <thead>
            <tr className="bg-[#f3efe6] text-left text-xs text-[#4a3a18]">
              <th className="border border-[#e7e0d1] p-2">Description</th>
              <th className="border border-[#e7e0d1] p-2 text-center">Qty</th>
              <th className="border border-[#e7e0d1] p-2 text-right">Unit price</th>
              <th className="border border-[#e7e0d1] p-2 text-right">Total</th>
            </tr>
          </thead>
          <tbody>
            {items.map((it, i) => (
              <tr key={i}>
                <td className="border border-[#f1ead9] p-2">{it.description ?? "—"}</td>
                <td className="border border-[#f1ead9] p-2 text-center">{it.qty}</td>
                <td className="border border-[#f1ead9] p-2 text-right">{j(it.unit_price)}</td>
                <td className="border border-[#f1ead9] p-2 text-right">{j(it.line_total)}</td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr><td colSpan={4} className="border border-[#f1ead9] p-4 text-center text-[#7a6e57]">No items</td></tr>
            )}
          </tbody>
        </table>

        {/* Totals */}
        <div className="mt-4 flex justify-end">
          <div className="w-full max-w-xs space-y-1 text-sm">
            <div className="flex justify-between"><span>Subtotal</span><span>{j(subtotal)}</span></div>
            {discount > 0 && <div className="flex justify-between"><span>Discount</span><span>−{j(discount)}</span></div>}
            {delivery > 0 && <div className="flex justify-between"><span>Delivery</span><span>{j(delivery)}</span></div>}
            <div className="flex justify-between"><span>GST ({Math.round(Number(invoice.gst_rate))}%)</span><span>{j(gst)}</span></div>
            <div className="mt-2 flex justify-between border-t border-[#e7e0d1] pt-2 text-base font-bold text-[#9a7426]">
              <span>Total</span><span>{j(total)}</span>
            </div>
          </div>
        </div>

        {invoice.notes && (
          <div className="mt-6 rounded-md border border-[#e7e0d1] p-3 text-sm">
            <div className="text-[10px] uppercase text-[#7a6e57]">Notes</div>
            <div className="mt-1">{invoice.notes}</div>
          </div>
        )}

        <div className="mt-10 border-t border-[#e7e0d1] pt-3 text-center text-[10px] text-[#7a6e57]">
          Thank you for your business · {company?.name_ar ?? company?.name ?? "Zaman Watch"}
        </div>
      </div>
    </>
  );
}

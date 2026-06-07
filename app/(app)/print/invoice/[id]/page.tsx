"use client";

import { use, useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import QRCode from "qrcode";
import { createClient } from "@/lib/supabase/client";
import type { Tables } from "@/types/database.types";

type SaleItem = { description: string | null; qty: number; unit_price: number; line_total: number };

export default function PrintInvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const supabase = createClient();
  const [qrDataUrl, setQrDataUrl] = useState<string>("");

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

  // Generate a QR code that encodes the verification URL for this invoice.
  useEffect(() => {
    if (!data?.invoice) return;
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const payload = JSON.stringify({
      type: "zaman-invoice",
      no: data.invoice.invoice_no,
      total: Number(data.invoice.total).toFixed(3),
      currency: "JOD",
      issued: data.invoice.issue_date,
      tax: data.company?.tax_number ?? null,
      url: `${origin}/print/invoice/${data.invoice.id}`,
    });
    QRCode.toDataURL(payload, { errorCorrectionLevel: "M", margin: 1, width: 220, color: { dark: "#221c10", light: "#ffffff" } })
      .then(setQrDataUrl)
      .catch(() => setQrDataUrl(""));
  }, [data?.invoice, data?.company]);

  // Auto-trigger the print dialog once content is rendered.
  useEffect(() => {
    if (!data?.invoice) return;
    const tm = setTimeout(() => window.print(), 500);
    return () => clearTimeout(tm);
  }, [data?.invoice]);

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
      <style jsx global>{`
        /* On-screen preview: white sheet with A4 proportions, centered. */
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
          font-size: 11pt;
          line-height: 1.35;
          overflow: hidden;
        }
        .watermark {
          position: absolute;
          left: 0;
          right: 0;
          bottom: 18%;
          height: 40%;
          background-repeat: no-repeat;
          background-position: center;
          background-size: 80% auto;
          opacity: 0.10;
          pointer-events: none;
          z-index: 0;
        }
        .a4-sheet > .sheet-body { position: relative; z-index: 1; }

        @media print {
          @page { size: A4; margin: 0; }
          html, body { background: white !important; }
          .no-print, aside, header.app-topbar { display: none !important; }
          main { padding: 0 !important; margin: 0 !important; }
          .a4-sheet {
            margin: 0; box-shadow: none;
            page-break-after: always;
          }
        }
      `}</style>

      <div className="no-print mx-auto mb-4 flex max-w-[210mm] items-center justify-between px-4 pt-4">
        <div className="text-sm text-muted-foreground">{invoice.invoice_no} · {invoice.issue_date}</div>
        <div className="flex gap-2">
          <button onClick={() => window.print()} className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">
            Print / Save as PDF
          </button>
          <button onClick={() => window.close()} className="rounded-md border px-4 py-2 text-sm">Close</button>
        </div>
      </div>

      <div className="a4-sheet">
        {/* Background watermark logo */}
        {company?.logo_url && (
          <div className="watermark" style={{ backgroundImage: `url(${company.logo_url})` }} />
        )}

        <div className="sheet-body">
          {/* Header */}
          <div className="mb-6 flex items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              {company?.logo_url && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={company.logo_url} alt="" className="h-14 w-14 object-contain" />
              )}
              <div>
                <div className="text-2xl font-bold text-[#9a7426]">{company?.name ?? "Zaman Watch"}</div>
                {company?.name_ar && <div className="text-base text-[#9a7426]">{company.name_ar}</div>}
                <div className="mt-1 text-[9pt] text-[#7a6e57]">
                  {[company?.address, company?.phone, company?.email].filter(Boolean).join(" · ")}
                </div>
                {company?.tax_number && <div className="text-[9pt] text-[#7a6e57]">Tax No: {company.tax_number}</div>}
              </div>
            </div>
            <div className="text-right">
              <div className="text-xl font-bold tracking-wide">TAX INVOICE</div>
              <div className="mt-1 text-sm font-medium">{invoice.invoice_no}</div>
              <div className="text-[9pt] text-[#7a6e57]">{invoice.issue_date}</div>
            </div>
          </div>

          {/* Bill-to + meta */}
          <div className="grid grid-cols-2 gap-6 rounded-md border border-[#e7e0d1] p-4 text-sm">
            <div>
              <div className="text-[8pt] uppercase tracking-wider text-[#7a6e57]">Bill To</div>
              <div className="mt-1 font-medium">{invoice.customers?.name ?? "—"}</div>
              {invoice.customers?.phone && <div className="text-[9pt] text-[#7a6e57]">{invoice.customers.phone}</div>}
              {invoice.customers?.address && <div className="text-[9pt] text-[#7a6e57]">{invoice.customers.address}</div>}
            </div>
            <div className="text-right">
              <div className="text-[8pt] uppercase tracking-wider text-[#7a6e57]">Issue Date</div>
              <div className="mt-1">{invoice.issue_date}</div>
              {invoice.due_date && (<><div className="mt-2 text-[8pt] uppercase tracking-wider text-[#7a6e57]">Due Date</div><div>{invoice.due_date}</div></>)}
            </div>
          </div>

          {/* Items */}
          <table className="mt-6 w-full border-collapse text-[10pt]">
            <thead>
              <tr className="bg-[#f3efe6] text-left text-[9pt] text-[#4a3a18]">
                <th className="border border-[#e7e0d1] p-2">Description</th>
                <th className="w-16 border border-[#e7e0d1] p-2 text-center">Qty</th>
                <th className="w-32 border border-[#e7e0d1] p-2 text-right">Unit price</th>
                <th className="w-32 border border-[#e7e0d1] p-2 text-right">Total</th>
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

          {/* Totals + QR side by side */}
          <div className="mt-4 grid grid-cols-2 gap-6">
            {/* QR + verify */}
            <div className="flex items-start gap-3">
              {qrDataUrl && (
                <>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={qrDataUrl} alt="QR" className="h-28 w-28 rounded-md border border-[#e7e0d1] p-1" />
                  <div className="text-[9pt] text-[#7a6e57]">
                    <div className="font-medium text-[#4a3a18]">Verify this invoice</div>
                    <div className="mt-1">Scan the code to view the source record on file.</div>
                  </div>
                </>
              )}
            </div>

            <div className="space-y-1 text-sm">
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
              <div className="text-[8pt] uppercase tracking-wider text-[#7a6e57]">Notes</div>
              <div className="mt-1">{invoice.notes}</div>
            </div>
          )}

          {/* Footer */}
          <div className="absolute bottom-10 left-14 right-14 border-t border-[#e7e0d1] pt-3 text-center text-[8pt] text-[#7a6e57]">
            Thank you for your business · {company?.name_ar ?? company?.name ?? "Zaman Watch"}
            {company?.instagram_handle && <span> · @{company.instagram_handle}</span>}
          </div>
        </div>
      </div>
    </>
  );
}

"use client";

/**
 * Print one of four purchase-side documents from a single Purchase Order.
 *
 *   ?doc=order   — Purchase Order      (default)
 *   ?doc=receive — Goods Receipt note  (signs off the qty actually received)
 *   ?doc=qc      — QC Inspection Report (quality / working / repackage flags)
 *   ?doc=return  — Purchase Return note (items flagged to_return)
 *
 * Same A4 sheet, same brand watermark, same QR. Each doc swaps headline,
 * column layout, and the totals/signature block to match its purpose.
 *
 * The column layout per doc:
 *   - order:   description | qty | unit cost | line total
 *   - receive: image | description | ordered | received | notes
 *   - qc:      image | description | qty | quality | working | repackage
 *   - return:  image | description | qty | unit cost | reason
 */

import { use, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import QRCode from "qrcode";
import { createClient } from "@/lib/supabase/client";
import type { Tables } from "@/types/database.types";

type Doc = "order" | "receive" | "qc" | "return";

type Item = {
  id: string;
  name: string | null;
  qty: number;
  unit_cost_jod: number;
  landed_unit_cost: number;
  received: boolean | null;
  qc_quality: boolean | null;
  qc_working: boolean | null;
  qc_repackage: boolean | null;
  to_return: boolean | null;
  is_asset: boolean | null;
  image_url: string | null;
  product_image: string | null;
};

const DOC_LABELS: Record<Doc, { title: string; titleAr: string }> = {
  order: { title: "PURCHASE ORDER", titleAr: "أمر شراء" },
  receive: { title: "GOODS RECEIPT", titleAr: "إيصال استلام" },
  qc: { title: "QC INSPECTION", titleAr: "تقرير فحص الجودة" },
  return: { title: "PURCHASE RETURN", titleAr: "مرتجع مشتريات" },
};

export default function PrintPurchasePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const search = useSearchParams();
  const doc = (search.get("doc") as Doc) || "order";
  const supabase = createClient();
  const [qrDataUrl, setQrDataUrl] = useState<string>("");

  const { data } = useQuery({
    queryKey: ["print-purchase", id],
    queryFn: async () => {
      const [pur, company] = await Promise.all([
        supabase.from("purchases").select("*, vendors(*)").eq("id", id).maybeSingle(),
        supabase.from("company_settings").select("*").limit(1).maybeSingle(),
      ]);
      const purchase = pur.data as
        | (Tables<"purchases"> & { vendors: Tables<"vendors"> | null })
        | null;
      let items: Item[] = [];
      if (purchase) {
        const { data: si } = await supabase
          .from("purchase_items")
          .select("id, name, sku, qty, unit_cost_jod, landed_unit_cost, received, qc_quality, qc_working, qc_repackage, to_return, is_asset, image_url, products(name, sku, image_urls)")
          .eq("purchase_id", purchase.id)
          .order("created_at");
        items = (si ?? []).map((r) => {
          const product = (r as { products?: { name?: string | null; sku?: string | null; image_urls?: string[] | null } | null }).products ?? null;
          const prodImages = product?.image_urls ?? null;
          // Fall back to the linked product's name when the purchase_item
          // doesn't carry its own (Shein imports + auto-created lines often
          // leave purchase_items.name null — the readable name lives on the
          // product). SKU is appended as a hint if both names are missing.
          const resolvedName =
            (r.name && r.name.trim()) ||
            (product?.name && product.name.trim()) ||
            (r.sku && `SKU ${r.sku}`) ||
            (product?.sku && `SKU ${product.sku}`) ||
            null;
          return {
            id: r.id,
            name: resolvedName,
            qty: Number(r.qty),
            unit_cost_jod: Number(r.unit_cost_jod ?? 0),
            landed_unit_cost: Number(r.landed_unit_cost ?? 0),
            received: r.received,
            qc_quality: r.qc_quality,
            qc_working: r.qc_working,
            qc_repackage: r.qc_repackage,
            to_return: r.to_return,
            is_asset: r.is_asset,
            image_url: r.image_url,
            product_image: prodImages?.[0] ?? null,
          } as Item;
        });
      }
      return { purchase, items, company: company.data as Tables<"company_settings"> | null };
    },
  });

  useEffect(() => {
    if (!data?.purchase) return;
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const payload = JSON.stringify({
      type: `zaman-${doc}`,
      no: data.purchase.doc_no,
      ref: data.purchase.reference ?? null,
      total: Number(data.purchase.total_landed).toFixed(3),
      currency: "JOD",
      date: data.purchase.order_date,
      url: `${origin}/print/purchase/${data.purchase.id}?doc=${doc}`,
    });
    QRCode.toDataURL(payload, { errorCorrectionLevel: "M", margin: 1, width: 220, color: { dark: "#221c10", light: "#ffffff" } })
      .then(setQrDataUrl)
      .catch(() => setQrDataUrl(""));
  }, [data?.purchase, doc]);

  useEffect(() => {
    if (!data?.purchase) return;
    const tm = setTimeout(() => window.print(), 500);
    return () => clearTimeout(tm);
  }, [data?.purchase]);

  // For the Return document filter the items to those flagged to_return only.
  // Other docs show everything.
  const docItems = useMemo(() => {
    if (!data) return [];
    return doc === "return" ? data.items.filter((i) => i.to_return) : data.items;
  }, [data, doc]);

  if (!data) return <div className="p-10 text-center text-muted-foreground">Loading…</div>;
  const { purchase, company } = data;
  if (!purchase) return <div className="p-10 text-center text-destructive">Purchase not found</div>;

  const j = (n: number | null | undefined) => `${Number(n ?? 0).toFixed(3)} JOD`;
  const titles = DOC_LABELS[doc];

  return (
    <>
      <style jsx global>{`
        body { background: #f3efe6; }
        .a4-sheet {
          width: 210mm; min-height: 297mm; margin: 12mm auto;
          padding: 16mm 14mm 18mm; background: white; color: #221c10;
          position: relative; box-shadow: 0 4px 24px rgba(0,0,0,0.12);
          font-size: 11pt; line-height: 1.4;
          display: flex; flex-direction: column; overflow: hidden;
        }
        .watermark {
          position: absolute; left: 5%; right: 5%; top: 35%; height: 40%;
          background-image: url('/logo.png'), url('/brand-watermark.svg');
          background-repeat: no-repeat; background-position: center; background-size: contain;
          opacity: 0.13; pointer-events: none; z-index: 0;
        }
        .sheet-body { position: relative; z-index: 1; flex: 1; display: flex; flex-direction: column; }
        .sheet-footer { position: relative; z-index: 1; margin-top: auto; }
        @media print {
          @page { size: A4; margin: 0; }
          html, body { background: white !important; }
          .no-print, aside, header.app-topbar { display: none !important; }
          main { padding: 0 !important; margin: 0 !important; }
          .a4-sheet { margin: 0; box-shadow: none; page-break-after: always; }
          .watermark { opacity: 0.10; }
        }
      `}</style>

      <div className="no-print mx-auto mb-4 flex max-w-[210mm] items-center justify-between px-4 pt-4">
        <div className="text-sm text-muted-foreground">
          {purchase.doc_no}{purchase.reference ? ` · ${purchase.reference}` : ""} · {purchase.order_date}
        </div>
        <div className="flex gap-2">
          <DocSwitcher id={id} active={doc} />
          <button onClick={() => window.print()} className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">
            Print / Save as PDF
          </button>
          <button onClick={() => window.close()} className="rounded-md border px-4 py-2 text-sm">Close</button>
        </div>
      </div>

      <div className="a4-sheet">
        <div className="watermark" />
        <div className="sheet-body">

          {/* Header — Zaman logo on the left, doc title on the right.
              The logo is the gold wordmark shipped at /public/logo.png; the
              vendor contact info sits below to keep the band clean. */}
          <div className="mb-6 flex items-start justify-between gap-4">
            <div className="flex items-start gap-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/logo.png"
                alt="Zaman Watch"
                className="h-20 w-auto object-contain"
              />
              <div>
                <div className="mt-1 text-[9pt] text-[#7a6e57]">
                  {[company?.address, company?.phone, company?.email].filter(Boolean).join(" · ")}
                </div>
                {company?.tax_number && <div className="text-[9pt] text-[#7a6e57]">Tax No: {company.tax_number}</div>}
              </div>
            </div>
            <div className="text-right">
              <div className="text-xl font-bold tracking-wide">{titles.title}</div>
              <div className="text-[10pt] text-[#7a6e57]" style={{ fontFamily: "var(--font-arabic)" }}>{titles.titleAr}</div>
              <div className="mt-1 text-sm font-medium">{purchase.doc_no}{purchase.reference ? ` · ${purchase.reference}` : ""}</div>
              <div className="text-[9pt] text-[#7a6e57]">{purchase.order_date}</div>
            </div>
          </div>

          {/* Vendor block. Receive/QC/Return add a per-doc badge underneath. */}
          <div className="grid grid-cols-2 gap-6 rounded-md border border-[#e7e0d1] bg-white/70 p-4 text-sm">
            <div>
              <div className="text-[8pt] uppercase tracking-wider text-[#7a6e57]">Vendor</div>
              <div className="mt-1 font-medium">{purchase.vendors?.name ?? "—"}</div>
              {purchase.vendors?.phone && <div className="text-[9pt] text-[#7a6e57]">{purchase.vendors.phone}</div>}
              {purchase.vendors?.email && <div className="text-[9pt] text-[#7a6e57]">{purchase.vendors.email}</div>}
            </div>
            <div className="text-right">
              <div className="text-[8pt] uppercase tracking-wider text-[#7a6e57]">Order date</div>
              <div className="mt-1">{purchase.order_date}</div>
              <div className="mt-2 text-[8pt] uppercase tracking-wider text-[#7a6e57]">Status</div>
              <div className="text-[10pt] capitalize">{purchase.status}</div>
            </div>
          </div>

          {/* Per-doc item table */}
          <ItemsTable doc={doc} items={docItems} fmtMoney={j} />

          {/* Totals box only on PO + Return — Receive & QC are about counts, not money */}
          {(doc === "order" || doc === "return") && (
            <div className="mt-4 flex justify-end">
              <div className="w-72 space-y-1 text-sm">
                <div className="flex justify-between"><span>Items total</span><span>{j(purchase.items_total)}</span></div>
                {Number(purchase.shipping_cost) > 0 && <div className="flex justify-between"><span>Shipping</span><span>{j(purchase.shipping_cost)}</span></div>}
                {Number(purchase.customs_cost) > 0 && <div className="flex justify-between"><span>Customs</span><span>{j(purchase.customs_cost)}</span></div>}
                {Number(purchase.clearance_cost) > 0 && <div className="flex justify-between"><span>Clearance</span><span>{j(purchase.clearance_cost)}</span></div>}
                {Number(purchase.other_cost) > 0 && <div className="flex justify-between"><span>Other</span><span>{j(purchase.other_cost)}</span></div>}
                <div className="mt-2 flex justify-between border-t border-[#e7e0d1] pt-2 text-base font-bold text-[#9a7426]">
                  <span>Landed total</span><span>{j(purchase.total_landed)}</span>
                </div>
              </div>
            </div>
          )}

          {/* QC + Receive add a quick summary line of counts at the bottom */}
          {doc === "receive" && (
            <div className="mt-4 rounded-md border border-[#e7e0d1] bg-white/70 p-3 text-[10pt]">
              <strong>Received:</strong>{" "}
              {docItems.filter(i => i.received).length} of {docItems.length} lines ·
              total qty {docItems.reduce((s, i) => s + (i.received ? i.qty : 0), 0)}
            </div>
          )}
          {doc === "qc" && (
            <div className="mt-4 rounded-md border border-[#e7e0d1] bg-white/70 p-3 text-[10pt]">
              <strong>QC summary:</strong>{" "}
              Quality {docItems.filter(i => i.qc_quality).length}/{docItems.length} ·
              Working {docItems.filter(i => i.qc_working).length}/{docItems.length} ·
              Needs re-packaging {docItems.filter(i => i.qc_repackage).length}
            </div>
          )}

          {purchase.notes && (
            <div className="mt-6 rounded-md border border-[#e7e0d1] bg-white/70 p-3 text-sm">
              <div className="text-[8pt] uppercase tracking-wider text-[#7a6e57]">Notes</div>
              <div className="mt-1 whitespace-pre-wrap">{purchase.notes}</div>
            </div>
          )}
        </div>

        {/* Footer — QR + signature line. For Receive/QC/Return we change the
            signature label so the person signing knows what they're signing. */}
        <div className="sheet-footer mt-10 border-t border-[#e7e0d1] pt-4">
          <div className="flex items-end justify-between gap-6">
            <div className="flex items-start gap-3">
              {qrDataUrl && (
                <>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={qrDataUrl} alt="QR" className="h-24 w-24 rounded-md border border-[#e7e0d1] bg-white p-1" />
                  <div className="text-[9pt] text-[#7a6e57]">
                    <div className="font-medium text-[#4a3a18]">Verify on file</div>
                    <div className="mt-1 max-w-[180px]">Scan to open this document in the system.</div>
                  </div>
                </>
              )}
            </div>
            <div className="grid grid-cols-2 gap-8 text-right text-[9pt] text-[#7a6e57]">
              <div>
                <div className="mb-8 text-[8pt] uppercase tracking-wider">{
                  doc === "receive" ? "Received by" :
                  doc === "qc" ? "Inspected by" :
                  doc === "return" ? "Returned by" : "Issued by"
                }</div>
                <div className="border-t border-[#7a6e57]/40 pt-1">{company?.name ?? "Zaman Watch"}</div>
              </div>
              <div>
                <div className="mb-8 text-[8pt] uppercase tracking-wider">{
                  doc === "receive" ? "Delivered by (vendor)" :
                  doc === "qc" ? "Vendor acknowledgement" :
                  doc === "return" ? "Vendor acknowledgement" : "Vendor signature"
                }</div>
                <div className="border-t border-[#7a6e57]/40 pt-1">{purchase.vendors?.name ?? "—"}</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

/** Inline toolbar that switches between the four documents without
 *  re-fetching the purchase — react-query caches by id. */
function DocSwitcher({ id, active }: { id: string; active: Doc }) {
  const docs: { value: Doc; label: string }[] = [
    { value: "order", label: "PO" },
    { value: "receive", label: "Receive" },
    { value: "qc", label: "QC" },
    { value: "return", label: "Return" },
  ];
  return (
    <div className="inline-flex rounded-md border bg-card p-0.5">
      {docs.map((d) => (
        <a
          key={d.value}
          href={`/print/purchase/${id}?doc=${d.value}`}
          className={
            "px-3 py-1.5 text-xs font-medium " +
            (d.value === active ? "rounded bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")
          }
        >
          {d.label}
        </a>
      ))}
    </div>
  );
}

function ItemsTable({ doc, items, fmtMoney }: { doc: Doc; items: Item[]; fmtMoney: (n: number) => string }) {
  const cell = "border border-[#f1ead9] p-2";
  const thumb = (it: Item) => it.product_image ?? it.image_url ?? null;

  function renderRow(it: Item, i: number) {
    const img = thumb(it);
    const imgCell = (
      <td className={`${cell} text-center align-middle`} style={{ width: 56 }}>
        {img ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={img} alt="" referrerPolicy="no-referrer" className="mx-auto size-10 rounded border border-[#e7e0d1] object-cover" />
        ) : (
          <span className="text-[#cdbf9a]">⌚</span>
        )}
      </td>
    );
    const tick = (b: boolean | null) =>
      b ? <span className="text-success">✓</span> : <span className="text-[#cdbf9a]">☐</span>;
    const name = (
      <td className={cell}>
        {it.name ?? "—"}
        {it.is_asset && <span className="ms-2 rounded-full bg-amber-100 px-1.5 text-[9px] font-medium text-amber-800">FIXED ASSET</span>}
      </td>
    );

    if (doc === "order") {
      return (
        <tr key={i} className="bg-white/70">
          {imgCell}
          {name}
          <td className={`${cell} text-center`} style={{ width: 64 }}>{it.qty}</td>
          <td className={`${cell} text-right`} style={{ width: 120 }}>{fmtMoney(it.unit_cost_jod)}</td>
          <td className={`${cell} text-right`} style={{ width: 120 }}>{fmtMoney(it.qty * it.landed_unit_cost)}</td>
        </tr>
      );
    }
    if (doc === "receive") {
      return (
        <tr key={i} className="bg-white/70">
          {imgCell}
          {name}
          <td className={`${cell} text-center`} style={{ width: 84 }}>{it.qty}</td>
          <td className={`${cell} text-center`} style={{ width: 84 }}>{tick(it.received)}</td>
          <td className={cell} style={{ width: 180 }}>&nbsp;</td>
        </tr>
      );
    }
    if (doc === "qc") {
      return (
        <tr key={i} className="bg-white/70">
          {imgCell}
          {name}
          <td className={`${cell} text-center`} style={{ width: 60 }}>{it.qty}</td>
          <td className={`${cell} text-center`} style={{ width: 80 }}>{tick(it.qc_quality)}</td>
          <td className={`${cell} text-center`} style={{ width: 80 }}>{tick(it.qc_working)}</td>
          <td className={`${cell} text-center`} style={{ width: 110 }}>{tick(it.qc_repackage)}</td>
        </tr>
      );
    }
    // return
    return (
      <tr key={i} className="bg-white/70">
        {imgCell}
        {name}
        <td className={`${cell} text-center`} style={{ width: 64 }}>{it.qty}</td>
        <td className={`${cell} text-right`} style={{ width: 120 }}>{fmtMoney(it.unit_cost_jod)}</td>
        <td className={cell} style={{ width: 200 }}>&nbsp;</td>
      </tr>
    );
  }

  let headers: React.ReactNode = null;
  if (doc === "order") headers = (
    <tr className="bg-[#f3efe6] text-left text-[9pt] text-[#4a3a18]">
      <th className="w-14 border border-[#e7e0d1] p-2"></th>
      <th className="border border-[#e7e0d1] p-2">Name</th>
      <th className="w-16 border border-[#e7e0d1] p-2 text-center">Qty</th>
      <th className="w-32 border border-[#e7e0d1] p-2 text-right">Unit cost</th>
      <th className="w-32 border border-[#e7e0d1] p-2 text-right">Line total</th>
    </tr>
  );
  else if (doc === "receive") headers = (
    <tr className="bg-[#f3efe6] text-left text-[9pt] text-[#4a3a18]">
      <th className="border border-[#e7e0d1] p-2" style={{ width: 56 }}></th>
      <th className="border border-[#e7e0d1] p-2">Name</th>
      <th className="border border-[#e7e0d1] p-2 text-center" style={{ width: 84 }}>Ordered</th>
      <th className="border border-[#e7e0d1] p-2 text-center" style={{ width: 84 }}>Received</th>
      <th className="border border-[#e7e0d1] p-2" style={{ width: 180 }}>Notes</th>
    </tr>
  );
  else if (doc === "qc") headers = (
    <tr className="bg-[#f3efe6] text-left text-[9pt] text-[#4a3a18]">
      <th className="border border-[#e7e0d1] p-2" style={{ width: 56 }}></th>
      <th className="border border-[#e7e0d1] p-2">Name</th>
      <th className="border border-[#e7e0d1] p-2 text-center" style={{ width: 60 }}>Qty</th>
      <th className="border border-[#e7e0d1] p-2 text-center" style={{ width: 80 }}>Quality</th>
      <th className="border border-[#e7e0d1] p-2 text-center" style={{ width: 80 }}>Working</th>
      <th className="border border-[#e7e0d1] p-2 text-center" style={{ width: 110 }}>Re-package</th>
    </tr>
  );
  else headers = (
    <tr className="bg-[#f3efe6] text-left text-[9pt] text-[#4a3a18]">
      <th className="border border-[#e7e0d1] p-2" style={{ width: 56 }}></th>
      <th className="border border-[#e7e0d1] p-2">Name</th>
      <th className="border border-[#e7e0d1] p-2 text-center" style={{ width: 64 }}>Qty</th>
      <th className="border border-[#e7e0d1] p-2 text-right" style={{ width: 120 }}>Unit cost</th>
      <th className="border border-[#e7e0d1] p-2" style={{ width: 200 }}>Reason</th>
    </tr>
  );

  return (
    <table className="mt-6 w-full border-collapse text-[10pt]">
      <thead>{headers}</thead>
      <tbody>
        {items.map(renderRow)}
        {items.length === 0 && (
          <tr><td colSpan={6} className="border border-[#f1ead9] p-4 text-center text-[#7a6e57]">
            {doc === "return" ? "No items flagged for return on this purchase." : "No items"}
          </td></tr>
        )}
      </tbody>
    </table>
  );
}

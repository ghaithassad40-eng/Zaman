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
  const ig = (company?.instagram_handle ?? "").replace(/^@+/, "");

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
          font-size: 11pt;
          line-height: 1.4;
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }
        /* Big brand watermark across the lower middle of the page.
           Prefers /logo.png (real artwork) and falls back to the inline SVG
           so a user just drops their PNG into /public/logo.png to switch. */
        .watermark {
          position: absolute;
          left: 5%; right: 5%;
          top: 35%;
          height: 40%;
          background-image: url('/logo.png'), url('/brand-watermark.svg');
          background-repeat: no-repeat;
          background-position: center;
          background-size: contain;
          opacity: 0.13;
          pointer-events: none;
          z-index: 0;
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
        <div className="text-sm text-muted-foreground">{invoice.invoice_no} · {invoice.issue_date}</div>
        <div className="flex gap-2">
          <button onClick={() => window.print()} className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">
            Print / Save as PDF
          </button>
          <button onClick={() => window.close()} className="rounded-md border px-4 py-2 text-sm">Close</button>
        </div>
      </div>

      <div className="a4-sheet">
        <div className="watermark" />

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

          {/* Bill-to */}
          <div className="grid grid-cols-2 gap-6 rounded-md border border-[#e7e0d1] bg-white/70 p-4 text-sm">
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
                <tr key={i} className="bg-white/70">
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

          {/* Totals — right-aligned, narrow box */}
          <div className="mt-4 flex justify-end">
            <div className="w-72 space-y-1 text-sm">
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
            <div className="mt-6 rounded-md border border-[#e7e0d1] bg-white/70 p-3 text-sm">
              <div className="text-[8pt] uppercase tracking-wider text-[#7a6e57]">Notes</div>
              <div className="mt-1">{invoice.notes}</div>
            </div>
          )}
        </div>

        {/* Footer area: QR on the left, signature + thank-you on the right.
            Lives in mt-auto so it's pushed to the bottom of the A4 sheet. */}
        <div className="sheet-footer mt-10 border-t border-[#e7e0d1] pt-4">
          <div className="flex items-end justify-between gap-6">
            <div className="flex items-start gap-3">
              {qrDataUrl && (
                <>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={qrDataUrl} alt="QR" className="h-24 w-24 rounded-md border border-[#e7e0d1] bg-white p-1" />
                  <div className="text-[9pt] text-[#7a6e57]">
                    <div className="font-medium text-[#4a3a18]">Verify this invoice</div>
                    <div className="mt-1 max-w-[180px]">Scan the QR to view this invoice on file.</div>
                  </div>
                </>
              )}
            </div>
            <div className="text-right text-[9pt] text-[#7a6e57]">
              <div className="mb-8 text-[8pt] uppercase tracking-wider">Authorised signature</div>
              <div className="border-t border-[#7a6e57]/40 pt-1">{company?.name ?? "Zaman Watch"}</div>
            </div>
          </div>
          <div className="mt-4 text-center text-[8pt] text-[#7a6e57]">
            Thank you for your business · {company?.name_ar ?? company?.name ?? "Zaman Watch"}
            {ig && <> · @{ig}</>}
          </div>
        </div>
      </div>

      {/* PAGE 2 — Terms & Conditions (bilingual side-by-side) */}
      <TermsPage company={company} invoiceNo={invoice.invoice_no} />
    </>
  );
}

/** Terms & Conditions drawn from Jordanian Consumer Protection Law No. 7 of
 *  2017 and the Civil Code (No. 43/1976). The warranty period is configurable
 *  per business via company_settings.warranty_months. */
function TermsPage({ company, invoiceNo }: { company: Tables<"company_settings"> | null; invoiceNo: string }) {
  const warrantyMonths = company?.warranty_months ?? 12;
  const seller = company?.name ?? "Zaman Watch";
  const sellerAr = company?.name_ar ?? "زمن";

  const clauses: { en: string; ar: string }[] = [
    {
      en: `Warranty. Each watch sold is covered by a ${warrantyMonths}-month manufacturer warranty against defects in workmanship, calculated from the issue date of this invoice. The warranty covers the movement only; it does not cover the battery, glass, strap, case appearance, water damage, or damage caused by misuse, accident, or unauthorised service.`,
      ar: `الضمان. تستفيد كل ساعة مباعة من ضمان المصنّع لمدة ${warrantyMonths} شهراً ضد عيوب الصناعة، يُحتسب من تاريخ هذه الفاتورة. يشمل الضمان الحركة الداخلية فقط ولا يشمل البطارية أو الزجاج أو السوار أو مظهر الجسم أو أضرار المياه أو التلف الناتج عن سوء الاستعمال أو الحوادث أو الصيانة من جهة غير مُعتمَدة.`,
    },
    {
      en: `Hidden defects. In accordance with Article 524 of the Jordanian Civil Code, the buyer may notify the seller of any hidden defect within six (6) months from the date of delivery. After this period the seller bears no liability for defects not previously disclosed.`,
      ar: `العيوب الخفية. وفقاً للمادة 524 من القانون المدني الأردني، يحق للمشتري إبلاغ البائع بأي عيب خفي خلال ستة (6) أشهر من تاريخ التسليم. بعد انقضاء هذه المدة، لا يتحمّل البائع أي مسؤولية عن عيوب لم يُكشف عنها مسبقاً.`,
    },
    {
      en: `Returns & exchanges. Under Consumer Protection Law No. 7 of 2017, the buyer may return a non-conforming product within seven (7) working days from receipt, provided the watch is unused, in original packaging, with this invoice. Items damaged by the buyer or with broken seals are excluded.`,
      ar: `الاسترجاع والاستبدال. وفقاً لقانون حماية المستهلك رقم 7 لسنة 2017، يحق للمشتري استرجاع المنتج غير المطابق للمواصفات خلال سبعة (7) أيام عمل من تاريخ الاستلام، شريطة أن تكون الساعة غير مستعمَلة، في تغليفها الأصلي، ومرفقة بهذه الفاتورة. تُستثنى البنود المتضرّرة من قِبل المشتري أو التي كُسرت أختامها.`,
    },
    {
      en: `Authorised service. Repairs and battery replacement must be performed by ${seller} or by a service provider expressly authorised by us. Opening the watch by any other party voids the warranty immediately.`,
      ar: `الصيانة المعتمَدة. يجب أن تتم الإصلاحات وتبديل البطارية لدى ${sellerAr} أو لدى مزوّد خدمة معتمَد منّا صراحةً. يؤدي فتح الساعة من قِبل أي طرف آخر إلى إبطال الضمان فوراً.`,
    },
    {
      en: `Pricing & taxes. All prices are quoted in Jordanian Dinars (JOD) and include the applicable General Sales Tax (GST) at the rate prevailing at the date of sale, in accordance with the GST Law of the Hashemite Kingdom of Jordan.`,
      ar: `الأسعار والضرائب. جميع الأسعار بالدينار الأردني (JOD) وتشمل ضريبة المبيعات العامة (GST) بالنسبة السارية بتاريخ البيع وفقاً لقانون الضريبة العامة على المبيعات في المملكة الأردنية الهاشمية.`,
    },
    {
      en: `Risk transfer. Risk in the goods passes to the buyer upon delivery or upon handover to the delivery carrier, whichever occurs first. The buyer is responsible for inspecting the product at the point of delivery and noting any visible damage on the courier's record.`,
      ar: `انتقال المخاطر. تنتقل تبعة المخاطر إلى المشتري عند التسليم أو عند تسليم البضاعة لشركة الشحن، أيّهما أسبق. يلتزم المشتري بفحص المنتج عند استلامه وتوثيق أي ضرر ظاهر في سجل شركة التوصيل.`,
    },
    {
      en: `Title retention. Ownership of the goods remains with the seller until payment of the full invoice amount has been received and cleared.`,
      ar: `الاحتفاظ بالملكية. تبقى ملكية البضاعة لدى البائع حتى استيفاء كامل مبلغ الفاتورة وتحصيله نهائياً.`,
    },
    {
      en: `Personal data. Buyer information is collected solely for the purpose of executing this sale, providing after-sales service, and fulfilling tax-record obligations. Data is not shared with third parties except as required by Jordanian law.`,
      ar: `البيانات الشخصية. تُجمع بيانات المشتري حصراً لأغراض تنفيذ عملية البيع، وتقديم خدمات ما بعد البيع، والالتزام بمتطلبات السجلات الضريبية. لا تُشارك البيانات مع أي طرف ثالث إلا وفقاً لما تستوجبه القوانين الأردنية.`,
    },
    {
      en: `Governing law & jurisdiction. This sale is governed by the laws of the Hashemite Kingdom of Jordan. Any dispute shall be referred exclusively to the competent courts of Amman, without prejudice to consumer rights under Law No. 7 of 2017.`,
      ar: `القانون الواجب التطبيق والاختصاص القضائي. يخضع هذا البيع لقوانين المملكة الأردنية الهاشمية، ويُختصّ بالنظر في أي نزاع محاكم عمّان المختصة حصراً، دون المساس بحقوق المستهلك المقرّرة بموجب القانون رقم 7 لسنة 2017.`,
    },
    {
      en: `Force majeure. The seller is not liable for delays or non-performance caused by events beyond reasonable control, including but not limited to acts of God, civil unrest, customs delays, or interruptions in shipping.`,
      ar: `القوة القاهرة. لا يكون البائع مسؤولاً عن أي تأخير أو إخلال ينجم عن أحداث خارجة عن السيطرة المعقولة، ومن ذلك على سبيل المثال لا الحصر القضاء والقدر، أو الاضطرابات الأهلية، أو تأخّر التخليص الجمركي، أو انقطاع خدمات الشحن.`,
    },
    {
      en: `Acceptance. By accepting delivery and signing or otherwise acknowledging this invoice, the buyer confirms agreement to all terms set out above.`,
      ar: `القبول. باستلام البضاعة والتوقيع على هذه الفاتورة أو الإقرار بها بأي شكل، يقرّ المشتري بموافقته على جميع الشروط الواردة أعلاه.`,
    },
  ];

  // Optional extra clauses added by the merchant via /settings.
  if (company?.terms_extra_en?.trim() || company?.terms_extra_ar?.trim()) {
    clauses.push({
      en: company.terms_extra_en?.trim() || "",
      ar: company.terms_extra_ar?.trim() || "",
    });
  }

  return (
    <div className="a4-sheet">
      <div className="watermark" />
      <div className="sheet-body">
        {/* Header */}
        <div className="mb-4 flex items-end justify-between border-b-2 border-[#9a7426] pb-2">
          <div>
            <div className="text-xl font-bold text-[#9a7426]">Terms & Conditions</div>
            <div className="text-base text-[#9a7426]" style={{ fontFamily: "var(--font-arabic)" }}>الشروط والأحكام</div>
          </div>
          <div className="text-right text-[9pt] text-[#7a6e57]">
            <div>Invoice {invoiceNo}</div>
            <div>Warranty: {warrantyMonths} months · {warrantyMonths} شهراً</div>
          </div>
        </div>

        <p className="mb-3 text-[9pt] italic text-[#7a6e57]">
          The following terms govern this sale under the laws of the Hashemite Kingdom of Jordan, including Consumer Protection Law No. 7 of 2017, the Jordanian Civil Code (No. 43/1976), and the Commercial Code (No. 12/1966). · تخضع هذه الشروط لقوانين المملكة الأردنية الهاشمية، ومنها قانون حماية المستهلك رقم 7 لسنة 2017، والقانون المدني الأردني رقم 43 لسنة 1976، وقانون التجارة رقم 12 لسنة 1966.
        </p>

        <table className="w-full border-collapse text-[8.5pt]">
          <colgroup>
            <col style={{ width: "4%" }} />
            <col style={{ width: "48%" }} />
            <col style={{ width: "48%" }} />
          </colgroup>
          <thead>
            <tr className="bg-[#f3efe6] text-[8pt] uppercase tracking-wider text-[#4a3a18]">
              <th className="border border-[#e7e0d1] p-1.5 text-center">#</th>
              <th className="border border-[#e7e0d1] p-1.5 text-left">English</th>
              <th className="border border-[#e7e0d1] p-1.5 text-right" style={{ fontFamily: "var(--font-arabic)" }}>عربي</th>
            </tr>
          </thead>
          <tbody>
            {clauses.map((c, i) => (
              <tr key={i} className="bg-white/70 align-top">
                <td className="border border-[#f1ead9] p-1.5 text-center text-[#7a6e57]">{i + 1}</td>
                <td className="border border-[#f1ead9] p-1.5 leading-snug" dir="ltr">{c.en}</td>
                <td className="border border-[#f1ead9] p-1.5 leading-snug" dir="rtl" style={{ fontFamily: "var(--font-arabic)" }}>{c.ar}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="sheet-footer mt-6 border-t border-[#e7e0d1] pt-3 text-center text-[8pt] text-[#7a6e57]">
        Page 2 of 2 · Terms & Conditions · {seller} · {sellerAr}
      </div>
    </div>
  );
}

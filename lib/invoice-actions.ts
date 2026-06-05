import { createClient } from "@/lib/supabase/client";
import type { Tables } from "@/types/database.types";
import type { InvoiceItem } from "@/lib/pdf/invoice";

export type InvoiceBundle = {
  invoice: Tables<"invoices">;
  items: InvoiceItem[];
  company: Tables<"company_settings"> | null;
  customer: Tables<"customers"> | null;
};

/** Ensure an invoice exists for a sale (create on first request), return the
 *  data needed to render the PDF. */
export async function ensureInvoiceForSale(saleId: string): Promise<InvoiceBundle> {
  const supabase = createClient();

  const { data: sale, error: saleErr } = await supabase
    .from("sales")
    .select("*, sale_items(description, qty, unit_price, line_total), customers(*)")
    .eq("id", saleId)
    .single();
  if (saleErr) throw saleErr;

  const company = (
    await supabase.from("company_settings").select("*").limit(1).maybeSingle()
  ).data;

  const items: InvoiceItem[] = (sale.sale_items ?? []).map((i) => ({
    description: i.description ?? "",
    qty: i.qty,
    unit_price: Number(i.unit_price),
    line_total: Number(i.line_total),
  }));
  const customer = (sale.customers as Tables<"customers"> | null) ?? null;

  // Existing invoice?
  const { data: existing } = await supabase
    .from("invoices")
    .select("*")
    .eq("sale_id", saleId)
    .is("deleted_at", null)
    .maybeSingle();

  if (existing) return { invoice: existing, items, company, customer };

  const { data: docNo } = await supabase.rpc("next_doc_no", { p_type: "invoice" });
  const { data: userData } = await supabase.auth.getUser();

  const { data: invoice, error: invErr } = await supabase
    .from("invoices")
    .insert({
      invoice_no: docNo as string,
      sale_id: saleId,
      customer_id: sale.customer_id,
      subtotal: sale.subtotal,
      discount: sale.discount,
      delivery_fee: sale.delivery_billed,
      gst_rate: sale.gst_rate,
      gst_amount: sale.gst_amount,
      total: sale.total,
      tax_number: company?.tax_number ?? null,
      status: "issued",
      created_by: userData.user?.id,
    })
    .select("*")
    .single();
  if (invErr) throw invErr;

  return { invoice, items, company, customer };
}

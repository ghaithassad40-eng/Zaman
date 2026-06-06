import { createClient } from "@/lib/supabase/client";
import { round3 } from "@/lib/utils";
import { downloadStatementPdf, type StatementLine } from "@/lib/pdf/statement";
import type { Tables } from "@/types/database.types";

const todayIso = () => {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

/**
 * Build & download a customer's statement of account as PDF.
 * Each sale is a debit (customer owes); payment / return is a credit.
 * Opening balance is carried forward from activity before `from`.
 */
export async function downloadCustomerStatement(opts: {
  customer: Pick<Tables<"customers">, "id" | "name" | "phone">;
  company: Tables<"company_settings"> | null;
  from?: string;
  to?: string;
  periodLabel?: string;
  filenameSuffix?: string;
}) {
  const supabase = createClient();
  const from = opts.from ?? "0000-01-01";
  const to = opts.to ?? "9999-12-31";

  const { data: sales, error } = await supabase
    .from("sales")
    .select("sale_no, sale_date, total, payment_status, status")
    .eq("customer_id", opts.customer.id)
    .neq("status", "cancelled")
    .is("deleted_at", null)
    .order("sale_date");
  if (error) throw error;

  type Entry = { date: string; label: string; debit: number; credit: number };
  const entries: Entry[] = [];
  for (const s of sales ?? []) {
    const total = Number(s.total);
    entries.push({ date: s.sale_date, label: `${s.sale_no}`, debit: total, credit: 0 });
    const settled = s.payment_status === "paid" || s.payment_status === "refunded" || s.status === "returned";
    if (settled) {
      entries.push({
        date: s.sale_date,
        label: s.status === "returned" ? `Return · ${s.sale_no}` : `Payment · ${s.sale_no}`,
        debit: 0,
        credit: total,
      });
    }
  }

  const opening = round3(entries.filter((e) => e.date < from).reduce((a, e) => a + e.debit - e.credit, 0));
  const within = entries.filter((e) => e.date >= from && e.date <= to);
  let run = opening;
  const lines: StatementLine[] = within.map((e) => {
    run = round3(run + e.debit - e.credit);
    return { txn_date: e.date, label: e.label, debit: e.debit, credit: e.credit, balance: run };
  });
  const totalDebit = round3(within.reduce((a, e) => a + e.debit, 0));
  const totalCredit = round3(within.reduce((a, e) => a + e.credit, 0));
  const closing = round3(opening + totalDebit - totalCredit);

  await downloadStatementPdf({
    filename: `customer-statement-${opts.filenameSuffix ?? opts.customer.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.pdf`,
    party: { name: opts.customer.name, phone: opts.customer.phone ?? null },
    titleEn: "Customer Statement",
    titleAr: "كشف حساب العميل",
    partyLabel: "Customer / العميل",
    oweLabel: "owes you",
    oweReverseLabel: "credit",
    company: opts.company ?? null,
    lines,
    opening,
    totalDebit,
    totalCredit,
    closing,
    generatedOn: todayIso(),
    periodLabel: opts.periodLabel,
  });
}

"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Download, FileText, Loader2, Printer } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useI18n } from "@/lib/i18n/provider";
import { downloadInvoicePdf, type InvoiceItem } from "@/lib/pdf/invoice";
import { PageHeader } from "@/components/page-header";
import { ExportButton } from "@/components/export-button";
import { SortableHead, useSort } from "@/components/ui/sortable-head";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatJOD } from "@/lib/utils";
import type { Tables } from "@/types/database.types";

type InvoiceRow = Tables<"invoices"> & { customers: { name: string } | null };

export default function InvoicesPage() {
  const { t, locale } = useI18n();
  const supabase = createClient();
  const [busy, setBusy] = useState<string | null>(null);
  const sort = useSort<InvoiceRow>();

  const { data, isLoading } = useQuery({
    queryKey: ["invoices-list"],
    queryFn: async (): Promise<InvoiceRow[]> => {
      const { data, error } = await supabase
        .from("invoices")
        .select("*, customers(name)")
        .is("deleted_at", null)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as InvoiceRow[];
    },
  });

  const sorted = sort.applyTo(data, (i, k) => {
    switch (k) {
      case "no": return i.invoice_no;
      case "customer": return i.customers?.name ?? "";
      case "issue": return i.issue_date;
      case "gst": return Number(i.gst_amount);
      case "total": return Number(i.total);
      default: return null;
    }
  });

  async function download(inv: InvoiceRow) {
    setBusy(inv.id);
    try {
      const company = (
        await supabase.from("company_settings").select("*").limit(1).maybeSingle()
      ).data;
      const customer = inv.customer_id
        ? (await supabase.from("customers").select("*").eq("id", inv.customer_id).maybeSingle()).data
        : null;
      let items: InvoiceItem[] = [];
      if (inv.sale_id) {
        const { data: si } = await supabase
          .from("sale_items")
          .select("description, qty, unit_price, line_total")
          .eq("sale_id", inv.sale_id);
        items = (si ?? []).map((i) => ({
          description: i.description ?? "",
          qty: i.qty,
          unit_price: Number(i.unit_price),
          line_total: Number(i.line_total),
        }));
      }
      await downloadInvoicePdf({ invoice: inv, items, company, customer });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <PageHeader
        title={t("invoices.title")}
        action={
          <ExportButton
            filename="invoices"
            rows={data}
            cols={[
              { header: "Invoice no", accessor: (i) => i.invoice_no },
              { header: "Customer", accessor: (i) => i.customers?.name ?? "" },
              { header: "Issue date", accessor: (i) => i.issue_date },
              { header: "Due date", accessor: (i) => i.due_date ?? "" },
              { header: "Subtotal", accessor: (i) => Number(i.subtotal) },
              { header: "Discount", accessor: (i) => Number(i.discount) },
              { header: "Delivery", accessor: (i) => Number(i.delivery_fee) },
              { header: "GST rate", accessor: (i) => Number(i.gst_rate) },
              { header: "GST amount", accessor: (i) => Number(i.gst_amount) },
              { header: "Total", accessor: (i) => Number(i.total) },
              { header: "Status", accessor: (i) => i.status },
            ]}
          />
        }
      />
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="space-y-2 p-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : data && data.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <SortableHead sortKey="no" current={sort.sortKey} dir={sort.sortDir} onToggle={sort.toggle}>{t("invoices.no")}</SortableHead>
                  <SortableHead sortKey="customer" current={sort.sortKey} dir={sort.sortDir} onToggle={sort.toggle}>{t("invoices.billTo")}</SortableHead>
                  <SortableHead sortKey="issue" current={sort.sortKey} dir={sort.sortDir} onToggle={sort.toggle}>{t("invoices.issue")}</SortableHead>
                  <SortableHead sortKey="gst" current={sort.sortKey} dir={sort.sortDir} onToggle={sort.toggle} align="end">{t("sell.gst")}</SortableHead>
                  <SortableHead sortKey="total" current={sort.sortKey} dir={sort.sortDir} onToggle={sort.toggle} align="end">{t("common.total")}</SortableHead>
                  <TableHead className="text-end">{t("common.actions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sorted.map((inv) => (
                  <TableRow key={inv.id}>
                    <TableCell className="font-medium">{inv.invoice_no}</TableCell>
                    <TableCell>{inv.customers?.name ?? "—"}</TableCell>
                    <TableCell className="text-muted-foreground">{inv.issue_date}</TableCell>
                    <TableCell className="text-end text-muted-foreground">
                      {formatJOD(inv.gst_amount, locale)}
                    </TableCell>
                    <TableCell className="text-end font-medium">{formatJOD(inv.total, locale)}</TableCell>
                    <TableCell className="text-end">
                      <div className="flex justify-end gap-1">
                        <Button
                          size="sm"
                          onClick={() => window.open(`/print/invoice/${inv.id}`, "_blank")}
                        >
                          <Printer className="size-4" /> {t("invoices.print")}
                        </Button>
                        <Button size="sm" variant="outline" disabled={busy === inv.id} onClick={() => download(inv)} title={t("invoices.download")}>
                          {busy === inv.id ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="flex flex-col items-center gap-3 p-12 text-center">
              <FileText className="size-10 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">{t("common.empty")}</p>
            </div>
          )}
        </CardContent>
      </Card>
    </>
  );
}

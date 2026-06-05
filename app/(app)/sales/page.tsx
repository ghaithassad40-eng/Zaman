"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { FileText, Loader2, Receipt, Undo2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useI18n } from "@/lib/i18n/provider";
import { ensureInvoiceForSale } from "@/lib/invoice-actions";
import { downloadInvoicePdf } from "@/lib/pdf/invoice";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatJOD } from "@/lib/utils";

type SaleRow = {
  id: string;
  sale_no: string;
  sale_date: string;
  status: string;
  total: number;
  gross_profit: number;
  customers: { name: string } | null;
};

export default function SalesPage() {
  const { t, locale } = useI18n();
  const supabase = createClient();
  const qc = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);

  const returnSale = useMutation({
    mutationFn: async (saleId: string) => {
      const { error } = await supabase.rpc("return_sale", { p_sale_id: saleId });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(t("sales.returned"));
      qc.invalidateQueries();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const { data, isLoading } = useQuery({
    queryKey: ["sales-list"],
    queryFn: async (): Promise<SaleRow[]> => {
      const { data, error } = await supabase
        .from("sales")
        .select("id, sale_no, sale_date, status, total, gross_profit, customers(name)")
        .is("deleted_at", null)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as SaleRow[];
    },
  });

  async function makeInvoice(saleId: string) {
    setBusy(saleId);
    try {
      const bundle = await ensureInvoiceForSale(saleId);
      await downloadInvoicePdf(bundle);
      toast.success(bundle.invoice.invoice_no);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <PageHeader title={t("sales.title")} />
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
                  <TableHead>{t("sales.no")}</TableHead>
                  <TableHead>{t("sell.customer")}</TableHead>
                  <TableHead>{t("common.date")}</TableHead>
                  <TableHead>{t("common.status")}</TableHead>
                  <TableHead className="text-end">{t("common.total")}</TableHead>
                  <TableHead className="text-end">{t("common.profit")}</TableHead>
                  <TableHead className="text-end">{t("common.actions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="font-medium">{s.sale_no}</TableCell>
                    <TableCell>{s.customers?.name ?? "—"}</TableCell>
                    <TableCell className="text-muted-foreground">{s.sale_date}</TableCell>
                    <TableCell>
                      <Badge variant={s.status === "cancelled" ? "destructive" : s.status === "returned" ? "warning" : "success"}>
                        {s.status === "returned" ? t("sales.returned") : s.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-end font-medium">{formatJOD(s.total, locale)}</TableCell>
                    <TableCell className="text-end text-success">{formatJOD(s.gross_profit, locale)}</TableCell>
                    <TableCell className="text-end">
                      <div className="flex justify-end gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={busy === s.id}
                          onClick={() => makeInvoice(s.id)}
                        >
                          {busy === s.id ? (
                            <Loader2 className="size-4 animate-spin" />
                          ) : (
                            <FileText className="size-4" />
                          )}
                          {t("sales.makeInvoice")}
                        </Button>
                        {s.status !== "returned" && s.status !== "cancelled" && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-destructive hover:text-destructive"
                            disabled={returnSale.isPending}
                            onClick={() => {
                              if (confirm(t("sales.confirmReturn"))) returnSale.mutate(s.id);
                            }}
                          >
                            <Undo2 className="size-4" /> {t("sales.return")}
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="flex flex-col items-center gap-3 p-12 text-center">
              <Receipt className="size-10 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">{t("common.empty")}</p>
            </div>
          )}
        </CardContent>
      </Card>
    </>
  );
}

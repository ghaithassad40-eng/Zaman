"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import Link from "next/link";
import { FileText, Loader2, Receipt, Undo2, Plus, ListChecks, CheckCircle2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useI18n } from "@/lib/i18n/provider";
import { ensureInvoiceForSale } from "@/lib/invoice-actions";
import { downloadInvoicePdf } from "@/lib/pdf/invoice";
import { PageHeader } from "@/components/page-header";
import { Stepper } from "@/components/stepper";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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
  fulfillment_stage: number;
  return_stage: number;
  customers: { name: string } | null;
};

export default function SalesPage() {
  const { t, locale } = useI18n();
  const supabase = createClient();
  const qc = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);
  const [fulSale, setFulSale] = useState<SaleRow | null>(null);
  const [retSale, setRetSale] = useState<SaleRow | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["sales-list"],
    queryFn: async (): Promise<SaleRow[]> => {
      const { data, error } = await supabase
        .from("sales")
        .select("id, sale_no, sale_date, status, total, gross_profit, fulfillment_stage, return_stage, customers(name)")
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
      <PageHeader
        title={t("sales.title")}
        action={
          <Link href="/sell" className={buttonVariants()}>
            <Plus className="size-4" /> {t("sales.newSale")}
          </Link>
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
                      <div className="flex flex-wrap justify-end gap-2">
                        {s.status !== "returned" && s.status !== "cancelled" && (
                          <Button size="sm" variant="outline" onClick={() => setFulSale(s)}>
                            <ListChecks className="size-4" /> {t("wf.fulfillment")} {s.fulfillment_stage}/5
                          </Button>
                        )}
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
                            onClick={() => setRetSale(s)}
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

      <FulfillmentDialog sale={fulSale} onClose={() => setFulSale(null)} />
      <ReturnDialog sale={retSale} onClose={() => setRetSale(null)} />
    </>
  );
}

function FulfillmentDialog({ sale, onClose }: { sale: SaleRow | null; onClose: () => void }) {
  const { t } = useI18n();
  const supabase = createClient();
  const qc = useQueryClient();
  const steps = [t("wf.fulCustomer"), t("wf.fulPrepare"), t("wf.fulContact"), t("wf.fulHandover"), t("wf.fulCollect")];
  const stage = sale?.fulfillment_stage ?? 0;

  const advance = useMutation({
    mutationFn: async () => {
      if (!sale) return;
      const { error } = await supabase.from("sales").update({ fulfillment_stage: Math.min(5, stage + 1) }).eq("id", sale.id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["sales-list"] }); onClose(); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={!!sale} onOpenChange={(o) => !o && onClose()}>
      <DialogContent onClose={onClose} className="max-w-2xl">
        <DialogHeader><DialogTitle>{t("wf.fulfillment")} · {sale?.sale_no}</DialogTitle></DialogHeader>
        {sale && (
          <div className="space-y-6 py-2">
            <Stepper steps={steps} current={stage} />
            {stage >= 5 ? (
              <div className="flex items-center justify-center gap-2 font-medium text-success"><CheckCircle2 className="size-5" /> {t("wf.completed")}</div>
            ) : (
              <div className="text-center">
                <p className="mb-3 text-sm text-muted-foreground">→ {steps[stage]}</p>
                <Button onClick={() => advance.mutate()} disabled={advance.isPending}>
                  {advance.isPending && <Loader2 className="size-4 animate-spin" />} {t("wf.markDone")}
                </Button>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function ReturnDialog({ sale, onClose }: { sale: SaleRow | null; onClose: () => void }) {
  const { t } = useI18n();
  const supabase = createClient();
  const qc = useQueryClient();
  const steps = [t("wf.retCase"), t("wf.retContact"), t("wf.retPickup"), t("wf.retUnpack")];
  const stage = sale?.return_stage ?? 0;

  const advance = useMutation({
    mutationFn: async () => {
      if (!sale) return;
      const { error } = await supabase.from("sales").update({ return_stage: Math.min(4, stage + 1) }).eq("id", sale.id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["sales-list"] }); onClose(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const finish = useMutation({
    mutationFn: async () => {
      if (!sale) return;
      await supabase.from("sales").update({ return_stage: 4 }).eq("id", sale.id);
      const { error } = await supabase.rpc("return_sale", { p_sale_id: sale.id });
      if (error) throw error;
    },
    onSuccess: () => { toast.success(t("sales.returned")); qc.invalidateQueries(); onClose(); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={!!sale} onOpenChange={(o) => !o && onClose()}>
      <DialogContent onClose={onClose} className="max-w-2xl">
        <DialogHeader><DialogTitle>{t("wf.startReturn")} · {sale?.sale_no}</DialogTitle></DialogHeader>
        {sale && (
          <div className="space-y-6 py-2">
            <Stepper steps={steps} current={stage} />
            {stage < 3 ? (
              <div className="text-center">
                <p className="mb-3 text-sm text-muted-foreground">→ {steps[stage]}</p>
                <Button onClick={() => advance.mutate()} disabled={advance.isPending}>
                  {advance.isPending && <Loader2 className="size-4 animate-spin" />} {t("wf.markDone")}
                </Button>
              </div>
            ) : (
              <div className="text-center">
                <p className="mb-3 text-sm text-muted-foreground">→ {steps[3]}</p>
                <Button variant="destructive" onClick={() => finish.mutate()} disabled={finish.isPending}>
                  {finish.isPending && <Loader2 className="size-4 animate-spin" />} {t("wf.finishReturn")}
                </Button>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

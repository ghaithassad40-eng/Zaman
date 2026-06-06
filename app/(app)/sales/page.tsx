"use client";

import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import Link from "next/link";
import { FileText, Loader2, Receipt, Undo2, Plus, ListChecks, CheckCircle2, Truck, ArrowLeft, Pencil, Trash2, Search } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useI18n } from "@/lib/i18n/provider";
import { useCustomers } from "@/lib/hooks";
import { ensureInvoiceForSale } from "@/lib/invoice-actions";
import { downloadInvoicePdf } from "@/lib/pdf/invoice";
import { PageHeader } from "@/components/page-header";
import { Stepper } from "@/components/stepper";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
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
import { formatJOD, round3 } from "@/lib/utils";

type SaleItemMini = {
  description: string | null;
  products: { name: string | null; sku: string | null; color: string | null } | null;
};
type SaleRow = {
  id: string;
  sale_no: string;
  sale_date: string;
  status: string;
  total: number;
  gross_profit: number;
  fulfillment_stage: number;
  return_stage: number;
  delivery_vendor_id: string | null;
  customers: { name: string } | null;
  sale_items: SaleItemMini[];
};

export default function SalesPage() {
  const { t, locale } = useI18n();
  const supabase = createClient();
  const qc = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);
  const [fulSale, setFulSale] = useState<SaleRow | null>(null);
  const [retSale, setRetSale] = useState<SaleRow | null>(null);
  const [editSale, setEditSale] = useState<SaleRow | null>(null);
  const [search, setSearch] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["sales-list"],
    queryFn: async (): Promise<SaleRow[]> => {
      const { data, error } = await supabase
        .from("sales")
        .select("id, sale_no, sale_date, status, total, gross_profit, fulfillment_stage, return_stage, delivery_vendor_id, customers(name), sale_items(description, products(name, sku, color))")
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
      try {
        await downloadInvoicePdf(bundle);
      } catch (renderErr) {
        // Invoice row was created — surface a focused message so user knows
        // the books recorded the invoice even if the PDF render failed.
        const msg = (renderErr as Error).message ?? "PDF render failed";
        toast.error(`${t("sales.invoiceSavedPdfFailed")} · ${bundle.invoice.invoice_no} — ${msg}`);
        return;
      }
      toast.success(bundle.invoice.invoice_no);
    } catch (e) {
      const err = e as { message?: string; code?: string; details?: string };
      toast.error(err.details || err.message || t("sales.invoiceFailed"));
    } finally {
      setBusy(null);
    }
  }

  const q = search.trim().toLowerCase();
  const filtered = !q ? (data ?? []) : (data ?? []).filter((s) => {
    if (s.sale_no.toLowerCase().includes(q)) return true;
    if ((s.customers?.name ?? "").toLowerCase().includes(q)) return true;
    if (Number(s.total).toString().includes(q)) return true;
    if (s.sale_date.includes(q)) return true;
    for (const it of s.sale_items ?? []) {
      if ((it.description ?? "").toLowerCase().includes(q)) return true;
      if ((it.products?.name ?? "").toLowerCase().includes(q)) return true;
      if ((it.products?.sku ?? "").toLowerCase().includes(q)) return true;
      if ((it.products?.color ?? "").toLowerCase().includes(q)) return true;
    }
    return false;
  });

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
      <div className="relative mb-4 max-w-md">
        <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          className="ps-9"
          placeholder={t("sales.searchPlaceholder")}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="space-y-2 p-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : filtered.length > 0 ? (
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
                {filtered.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="font-medium">{s.sale_no}</TableCell>
                    <TableCell>{s.customers?.name ?? "—"}</TableCell>
                    <TableCell className="text-muted-foreground">{s.sale_date}</TableCell>
                    <TableCell>
                      <Badge variant={s.status === "cancelled" ? "destructive" : s.status === "returned" ? "warning" : "success"}>
                        {s.status === "returned" ? t("sales.returned") : s.status === "packed" ? t("sales.packed") : s.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-end font-medium">{formatJOD(s.total, locale)}</TableCell>
                    <TableCell className="text-end text-success">{formatJOD(s.gross_profit, locale)}</TableCell>
                    <TableCell className="text-end">
                      <div className="flex flex-wrap justify-end gap-2">
                        {s.status !== "returned" && s.status !== "cancelled" && (
                          <>
                            <Button size="sm" variant="outline" onClick={() => setFulSale(s)}>
                              <ListChecks className="size-4" /> {t("wf.fulfillment")} {s.fulfillment_stage}/6
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => setEditSale(s)} title={t("common.edit")}>
                              <Pencil className="size-4" />
                            </Button>
                          </>
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
      <EditSaleDialog sale={editSale} onClose={() => setEditSale(null)} />
    </>
  );
}

function FulfillmentDialog({ sale, onClose }: { sale: SaleRow | null; onClose: () => void }) {
  const { t, locale } = useI18n();
  const supabase = createClient();
  const qc = useQueryClient();
  const steps = [
    t("wf.fulCustomer"), t("wf.fulPrepare"), t("wf.fulContact"),
    t("wf.fulInvoice"), t("wf.fulHandover"), t("wf.fulCollect"),
  ];
  const stage = sale?.fulfillment_stage ?? 0;
  const [vendorId, setVendorId] = useState("");
  const [seeded, setSeeded] = useState(false);

  const { data: vendors } = useQuery({
    queryKey: ["delivery-vendors"],
    enabled: !!sale && stage === 2,
    queryFn: async () => {
      const { data } = await supabase
        .from("vendors")
        .select("id, name, name_ar, is_default_delivery")
        .is("deleted_at", null).eq("is_active", true).order("name");
      return data ?? [];
    },
  });
  if (sale && vendors && !seeded) {
    setSeeded(true);
    setVendorId(sale.delivery_vendor_id ?? vendors.find((v) => v.is_default_delivery)?.id ?? vendors[0]?.id ?? "");
  }

  const advance = useMutation({
    mutationFn: async () => {
      if (!sale) return;
      const next = Math.min(6, stage + 1);
      const patch: { fulfillment_stage: number; status?: "completed" } = { fulfillment_stage: next };
      if (next >= 6) patch.status = "completed";
      const { error } = await supabase.from("sales").update(patch).eq("id", sale.id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["sales-list"] }); onClose(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const goBack = useMutation({
    mutationFn: async () => {
      if (!sale) return;
      const prev = Math.max(0, stage - 1);
      // If we step back from completed → uncomplete the sale status too.
      const patch: { fulfillment_stage: number; status?: "packed" | "confirmed" } = { fulfillment_stage: prev };
      if (stage >= 6) patch.status = "packed";
      const { error } = await supabase.from("sales").update(patch).eq("id", sale.id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["sales-list"] }); onClose(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const assign = useMutation({
    mutationFn: async () => {
      if (!sale) return;
      if (!vendorId) throw new Error(t("reports.selectVendor"));
      const { error } = await supabase.rpc("assign_delivery_vendor", { p_sale_id: sale.id, p_vendor_id: vendorId });
      if (error) throw error;
    },
    onSuccess: () => { toast.success(t("wf.contacted")); qc.invalidateQueries(); onClose(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const invoice = useMutation({
    mutationFn: async () => {
      if (!sale) return;
      const bundle = await ensureInvoiceForSale(sale.id);
      await downloadInvoicePdf(bundle);
      const { error } = await supabase.from("sales").update({ fulfillment_stage: Math.max(4, stage + 1) }).eq("id", sale.id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success(t("sales.makeInvoice")); qc.invalidateQueries(); onClose(); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={!!sale} onOpenChange={(o) => !o && onClose()}>
      <DialogContent onClose={onClose} className="max-w-2xl">
        <DialogHeader><DialogTitle>{t("wf.fulfillment")} · {sale?.sale_no}</DialogTitle></DialogHeader>
        {sale && (
          <div className="space-y-6 py-2">
            <Stepper steps={steps} current={stage} />
            {stage >= 6 ? (
              <div className="flex items-center justify-center gap-2 font-medium text-success"><CheckCircle2 className="size-5" /> {t("wf.completed")}</div>
            ) : stage === 2 ? (
              <div className="space-y-3">
                <div className="flex items-center gap-2 font-medium"><Truck className="size-4 text-primary" /> {t("wf.fulContact")}</div>
                <Select value={vendorId} onChange={(e) => setVendorId(e.target.value)}>
                  <option value="">—</option>
                  {(vendors ?? []).map((v) => (
                    <option key={v.id} value={v.id}>{locale === "ar" && v.name_ar ? v.name_ar : v.name}{v.is_default_delivery ? " ★" : ""}</option>
                  ))}
                </Select>
                <div className="flex justify-end">
                  <Button onClick={() => assign.mutate()} disabled={assign.isPending}>
                    {assign.isPending ? <Loader2 className="size-4 animate-spin" /> : <Truck className="size-4" />} {t("wf.markContacted")}
                  </Button>
                </div>
              </div>
            ) : stage === 3 ? (
              <div className="space-y-3 text-center">
                <p className="text-sm text-muted-foreground">→ {steps[3]}</p>
                <Button onClick={() => invoice.mutate()} disabled={invoice.isPending}>
                  {invoice.isPending ? <Loader2 className="size-4 animate-spin" /> : <FileText className="size-4" />} {t("sales.makeInvoice")}
                </Button>
              </div>
            ) : (
              <div className="text-center">
                <p className="mb-3 text-sm text-muted-foreground">→ {steps[stage]}</p>
                <Button onClick={() => advance.mutate()} disabled={advance.isPending}>
                  {advance.isPending && <Loader2 className="size-4 animate-spin" />} {t("wf.markDone")}
                </Button>
              </div>
            )}
            {stage > 0 && (
              <div className="border-t pt-3">
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-muted-foreground"
                  onClick={() => goBack.mutate()}
                  disabled={goBack.isPending}
                >
                  {goBack.isPending ? <Loader2 className="size-4 animate-spin" /> : <ArrowLeft className="size-4" />}
                  {t("wf.goBack")} · {steps[Math.max(0, stage - 1)]}
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

type SaleItemEdit = { id: string; description: string; qty: number; unit_price: number };

function EditSaleDialog({ sale, onClose }: { sale: SaleRow | null; onClose: () => void }) {
  const { t, locale } = useI18n();
  const supabase = createClient();
  const qc = useQueryClient();
  const { data: customers } = useCustomers();

  const [customerId, setCustomerId] = useState<string>("");
  const [saleDate, setSaleDate] = useState<string>("");
  const [discount, setDiscount] = useState<string>("0");
  const [deliveryBilled, setDeliveryBilled] = useState<string>("0");
  const [deliveryFee, setDeliveryFee] = useState<string>("0");
  const [notes, setNotes] = useState<string>("");
  const [items, setItems] = useState<SaleItemEdit[]>([]);
  const [loadedId, setLoadedId] = useState<string | null>(null);
  const [gstRate, setGstRate] = useState<number>(0);

  // Load full sale details when opened.
  useEffect(() => {
    if (!sale) { setLoadedId(null); return; }
    if (loadedId === sale.id) return;
    (async () => {
      const { data: full } = await supabase
        .from("sales")
        .select("id, customer_id, sale_date, discount, delivery_billed, delivery_fee, notes, gst_rate, sale_items(id, description, qty, unit_price)")
        .eq("id", sale.id).single();
      if (!full) return;
      setLoadedId(sale.id);
      setCustomerId(full.customer_id ?? "");
      setSaleDate(full.sale_date);
      setDiscount(String(full.discount ?? 0));
      setDeliveryBilled(String(full.delivery_billed ?? 0));
      setDeliveryFee(String(full.delivery_fee ?? 0));
      setNotes(full.notes ?? "");
      setGstRate(Number(full.gst_rate ?? 0));
      setItems((full.sale_items ?? []).map((i) => ({
        id: i.id, description: i.description ?? "", qty: Number(i.qty), unit_price: Number(i.unit_price),
      })));
    })();
  }, [sale, supabase, loadedId]);

  const subtotal = round3(items.reduce((s, i) => s + i.qty * i.unit_price, 0));
  const disc = round3(Number(discount) || 0);
  const taxable = Math.max(0, round3(subtotal - disc));
  const gst = round3((taxable * gstRate) / 100);
  const billed = round3(Number(deliveryBilled) || 0);
  const total = round3(taxable + gst + billed);

  const save = useMutation({
    mutationFn: async () => {
      if (!sale) return;
      // Update each line.
      for (const it of items) {
        const lineTotal = round3(it.qty * it.unit_price);
        const { error } = await supabase.from("sale_items").update({
          description: it.description.trim() || null,
          qty: Math.max(1, Math.round(it.qty)),
          unit_price: it.unit_price,
          line_total: lineTotal,
        }).eq("id", it.id);
        if (error) throw error;
      }
      // Update the sale.
      const { error } = await supabase.from("sales").update({
        customer_id: customerId || null,
        sale_date: saleDate,
        discount: disc,
        delivery_billed: billed,
        delivery_fee: round3(Number(deliveryFee) || 0),
        notes: notes.trim() || null,
        subtotal,
        gst_amount: gst,
        total,
      }).eq("id", sale.id);
      if (error) throw error;
      // Re-sync the matching cash inflow if it exists.
      const { data: ct } = await supabase
        .from("cash_transactions").select("id, amount")
        .eq("ref_table", "sales").eq("ref_id", sale.id)
        .eq("direction", "in").eq("category", "sale");
      if (ct && ct.length === 1) {
        await supabase.from("cash_transactions").update({ amount: total, txn_date: saleDate }).eq("id", ct[0].id);
      }
    },
    onSuccess: () => {
      toast.success(t("sales.saved"));
      qc.invalidateQueries();
      onClose();
    },
    onError: (e: { message?: string; details?: string }) => toast.error(e.details || e.message || t("common.saveFailed")),
  });

  function updateItem(id: string, patch: Partial<SaleItemEdit>) {
    setItems((p) => p.map((i) => (i.id === id ? { ...i, ...patch } : i)));
  }
  function removeItem(id: string) {
    setItems((p) => p.filter((i) => i.id !== id));
  }

  return (
    <Dialog open={!!sale} onOpenChange={(o) => !o && onClose()}>
      <DialogContent onClose={onClose} className="max-w-3xl">
        <DialogHeader><DialogTitle>{t("common.edit")} · {sale?.sale_no}</DialogTitle></DialogHeader>
        {sale && (
          <div className="space-y-4 py-1">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>{t("sell.customer")}</Label>
                <Select value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
                  <option value="">—</option>
                  {(customers ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>{t("common.date")}</Label>
                <Input type="date" dir="ltr" value={saleDate} onChange={(e) => setSaleDate(e.target.value)} />
              </div>
            </div>

            <div className="space-y-2">
              <Label>{t("sell.cart")}</Label>
              <div className="space-y-2 rounded-md border p-2">
                {items.length === 0 ? (
                  <p className="p-4 text-center text-sm text-muted-foreground">{t("common.empty")}</p>
                ) : items.map((it) => (
                  <div key={it.id} className="grid grid-cols-12 items-center gap-2 text-sm">
                    <Input className="col-span-6" value={it.description}
                      onChange={(e) => updateItem(it.id, { description: e.target.value })} />
                    <Input className="col-span-2" type="number" min={1} dir="ltr" value={it.qty}
                      onChange={(e) => updateItem(it.id, { qty: Math.max(1, Number(e.target.value)) })} />
                    <Input className="col-span-3" type="number" step="0.001" dir="ltr" value={it.unit_price}
                      onChange={(e) => updateItem(it.id, { unit_price: Number(e.target.value) })} />
                    <button type="button" onClick={() => removeItem(it.id)} className="col-span-1 text-muted-foreground hover:text-destructive">
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="space-y-1.5"><Label>{t("common.discount")}</Label>
                <Input type="number" step="0.001" dir="ltr" value={discount} onChange={(e) => setDiscount(e.target.value)} /></div>
              <div className="space-y-1.5"><Label>{t("sell.deliveryBilled")}</Label>
                <Input type="number" step="0.001" dir="ltr" value={deliveryBilled} onChange={(e) => setDeliveryBilled(e.target.value)} /></div>
              <div className="space-y-1.5"><Label>{t("sell.delivery")}</Label>
                <Input type="number" step="0.001" dir="ltr" value={deliveryFee} onChange={(e) => setDeliveryFee(e.target.value)} /></div>
            </div>

            <div className="space-y-1.5">
              <Label>{t("common.notes")}</Label>
              <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>

            <div className="space-y-1 rounded-md bg-muted/50 p-3 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">{t("common.subtotal")}</span><span>{formatJOD(subtotal, locale)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">{t("sell.gst")} ({gstRate}%)</span><span>{formatJOD(gst, locale)}</span></div>
              <div className="flex justify-between border-t pt-1 font-bold"><span>{t("common.total")}</span><span className="text-primary">{formatJOD(total, locale)}</span></div>
            </div>

            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={onClose}>{t("common.cancel")}</Button>
              <Button onClick={() => save.mutate()} disabled={save.isPending}>
                {save.isPending && <Loader2 className="size-4 animate-spin" />} {t("common.save")}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

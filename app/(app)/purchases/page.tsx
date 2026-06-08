"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, PackageOpen, PackageCheck, Loader2, Pencil, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useI18n } from "@/lib/i18n/provider";
import { PageHeader } from "@/components/page-header";
import { ExportButton } from "@/components/export-button";
import { SortableHead, useSort } from "@/components/ui/sortable-head";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatJOD, round3 } from "@/lib/utils";
import type { Tables } from "@/types/database.types";
import { ImportControls } from "@/components/import-controls";
import { numOr, type Col } from "@/lib/xlsx-utils";

const PUR_COLS: Col[] = [
  { key: "sku", header: "SKU" },
  { key: "name", header: "Name" },
  { key: "qty", header: "Quantity" },
  { key: "unit_cost_src", header: "Unit Cost (source currency)" },
  { key: "reference", header: "Order Reference (first row)" },
  { key: "currency", header: "Source Currency (first row)" },
  { key: "fx_rate", header: "FX to JOD (first row)" },
  { key: "shipping", header: "Shipping JOD (first row)" },
  { key: "customs", header: "Customs JOD (first row)" },
  { key: "clearance", header: "Clearance JOD (first row)" },
];
const PUR_EXAMPLE = [
  { sku: "sj2401234567", name: "BIDEN Mens Watch", qty: 3, unit_cost_src: 9.2, reference: "Shein order #12345", currency: "USD", fx_rate: 0.709, shipping: 6, customs: 4, clearance: 2 },
  { sku: "st2409876543", name: "Leather strap", qty: 10, unit_cost_src: 1.5, reference: "", currency: "", fx_rate: "", shipping: "", customs: "", clearance: "" },
];

type PurchaseRow = Tables<"purchases"> & { vendors: { name: string; name_ar: string | null } | null };

export default function PurchasesPage() {
  const { t, locale } = useI18n();
  const supabase = createClient();
  const qc = useQueryClient();

  const [editRow, setEditRow] = useState<PurchaseRow | null>(null);
  const [delBusy, setDelBusy] = useState<string | null>(null);
  const sort = useSort<PurchaseRow>();

  const { data, isLoading } = useQuery({
    queryKey: ["purchases"],
    queryFn: async (): Promise<PurchaseRow[]> => {
      const { data, error } = await supabase
        .from("purchases")
        .select("*, vendors(name, name_ar)")
        .is("deleted_at", null)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as PurchaseRow[];
    },
  });

  const sorted = sort.applyTo(data, (p, k) => {
    switch (k) {
      case "ref": return p.reference ?? p.doc_no ?? "";
      case "vendor": return p.vendors?.name ?? "";
      case "date": return p.order_date;
      case "landed": return Number(p.total_landed);
      case "status": return p.status;
      default: return null;
    }
  });

  const receive = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc("receive_purchase", { p_purchase_id: id });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(t("purchases.received"));
      qc.invalidateQueries();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  async function deletePurchase(p: PurchaseRow) {
    const isReceived = p.status === "received";
    const msg = isReceived ? t("purchases.deleteReceivedConfirm") : t("purchases.deleteConfirm");
    if (!window.confirm(msg)) return;
    setDelBusy(p.id);
    try {
      // Reverse inventory + cash impact first (safe for any status).
      const { error: rErr } = await supabase.rpc("reverse_purchase", { p_purchase_id: p.id });
      if (rErr) throw rErr;
      const { error } = await supabase
        .from("purchases")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", p.id);
      if (error) throw error;
      toast.success(t("purchases.deleted"));
      qc.invalidateQueries();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setDelBusy(null);
    }
  }

  async function importPurchase(rows: Record<string, string>[]) {
    const items = rows.filter((r) => r.sku && r.name && numOr(r.qty) > 0);
    if (items.length === 0) throw new Error("No item rows (need SKU, Name, Quantity)");
    const h = rows[0];
    const fx = numOr(h.fx_rate, 1) || 1;
    const shipping = round3(numOr(h.shipping));
    const customs = round3(numOr(h.customs));
    const clearance = round3(numOr(h.clearance));
    const overhead = round3(shipping + customs + clearance);

    const lines = items.map((it) => {
      const qty = Math.max(1, Math.round(numOr(it.qty, 1)));
      const unitSrc = round3(numOr(it.unit_cost_src));
      const unitJod = round3(unitSrc * fx);
      return { sku: it.sku, name: it.name, qty, unitSrc, unitJod, value: round3(qty * unitJod) };
    });
    const itemsTotal = round3(lines.reduce((s, l) => s + l.value, 0));

    const { data: userData } = await supabase.auth.getUser();
    const { data: docNo } = await supabase.rpc("next_doc_no", { p_type: "purchase" });
    const { data: purchase, error } = await supabase
      .from("purchases")
      .insert({
        doc_no: docNo as string,
        reference: h.reference || "Excel import",
        source: "manual",
        src_currency: h.currency || "USD",
        fx_rate: fx,
        items_total: itemsTotal,
        shipping_cost: shipping,
        customs_cost: customs,
        clearance_cost: clearance,
        total_landed: round3(itemsTotal + overhead),
        status: "ordered",
        created_by: userData.user?.id,
      })
      .select("id")
      .single();
    if (error || !purchase) throw new Error(error?.message ?? "could not create purchase");

    for (const l of lines) {
      let { data: prod } = await supabase.from("products").select("id").eq("sku", l.sku).is("deleted_at", null).order("created_at").limit(1).maybeSingle();
      let productId = prod?.id as string | undefined;
      if (!productId) {
        const ins = await supabase.from("products").insert({ sku: l.sku, name: l.name, source: "manual", created_by: userData.user?.id }).select("id").single();
        if (ins.error) throw new Error(ins.error.message);
        productId = ins.data.id;
        await supabase.from("inventory").insert({ product_id: productId });
      }
      const alloc = itemsTotal > 0 ? round3(overhead * (l.value / itemsTotal)) : 0;
      const landedUnit = round3(l.unitJod + (l.qty > 0 ? alloc / l.qty : 0));
      const { error: itErr } = await supabase.from("purchase_items").insert({
        purchase_id: purchase.id, product_id: productId, sku: l.sku, name: l.name,
        qty: l.qty, unit_cost_src: l.unitSrc, unit_cost_jod: l.unitJod, allocated_overhead: alloc, landed_unit_cost: landedUnit,
      });
      if (itErr) throw new Error(itErr.message);
    }
    qc.invalidateQueries({ queryKey: ["purchases"] });
    qc.invalidateQueries({ queryKey: ["products"] });
    return { created: lines.length };
  }

  return (
    <>
      <PageHeader
        title={t("purchases.title")}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <ImportControls templateName="zaman-purchase-template.xlsx" cols={PUR_COLS} examples={PUR_EXAMPLE} onImport={importPurchase} size="sm" />
            <ExportButton
              filename="purchases"
              rows={data}
              cols={[
                { header: "Doc no", accessor: (p) => p.doc_no ?? "" },
                { header: "Reference", accessor: (p) => p.reference ?? "" },
                { header: "Vendor", accessor: (p) => p.vendors?.name ?? "" },
                { header: "Date", accessor: (p) => p.order_date },
                { header: "Status", accessor: (p) => p.status },
                { header: "Source currency", accessor: (p) => p.src_currency },
                { header: "FX rate", accessor: (p) => Number(p.fx_rate) },
                { header: "Items (JOD)", accessor: (p) => Number(p.items_total) },
                { header: "Shipping", accessor: (p) => Number(p.shipping_cost) },
                { header: "Customs", accessor: (p) => Number(p.customs_cost) },
                { header: "Clearance", accessor: (p) => Number(p.clearance_cost) },
                { header: "Landed total (JOD)", accessor: (p) => Number(p.total_landed) },
                { header: "Asset PO", accessor: (p) => p.is_asset },
              ]}
            />
            <Link href="/purchases/new" className={buttonVariants()}>
              <Plus className="size-4" /> {t("purchases.add")}
            </Link>
          </div>
        }
      />

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="space-y-2 p-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : data && data.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <SortableHead sortKey="ref" current={sort.sortKey} dir={sort.sortDir} onToggle={sort.toggle}>{t("purchases.reference")}</SortableHead>
                  <SortableHead sortKey="vendor" current={sort.sortKey} dir={sort.sortDir} onToggle={sort.toggle}>{t("vendors.title")}</SortableHead>
                  <SortableHead sortKey="date" current={sort.sortKey} dir={sort.sortDir} onToggle={sort.toggle}>{t("common.date")}</SortableHead>
                  <SortableHead sortKey="landed" current={sort.sortKey} dir={sort.sortDir} onToggle={sort.toggle} align="end">{t("purchases.landed")}</SortableHead>
                  <SortableHead sortKey="status" current={sort.sortKey} dir={sort.sortDir} onToggle={sort.toggle}>{t("common.status")}</SortableHead>
                  <TableHead className="text-end">{t("common.actions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sorted.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-1.5">
                        <span>{p.reference || p.doc_no || "—"}</span>
                        {p.is_asset && (
                          <Badge variant="secondary" className="text-[10px]">{t("purchases.asset")}</Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {p.vendors ? (locale === "ar" && p.vendors.name_ar ? p.vendors.name_ar : p.vendors.name) : "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{p.order_date}</TableCell>
                    <TableCell className="text-end font-medium">
                      {formatJOD(p.total_landed, locale)}
                    </TableCell>
                    <TableCell>
                      <Badge variant={p.status === "received" ? "success" : "warning"}>
                        {p.status === "received" ? t("purchases.received") : p.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-end">
                      <div className="flex justify-end gap-1">
                        {p.status !== "received" && (
                          <Link href={`/purchases/${p.id}/receive`} className={buttonVariants({ variant: "outline", size: "sm" })}>
                            <PackageCheck className="size-4" /> {t("purchases.receive")}
                          </Link>
                        )}
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setEditRow(p)}
                          title={t("common.edit")}
                        >
                          <Pencil className="size-4" />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => deletePurchase(p)}
                          disabled={delBusy === p.id}
                          title={t("common.delete")}
                        >
                          {delBusy === p.id ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4 text-red-600" />}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="flex flex-col items-center gap-3 p-12 text-center">
              <PackageOpen className="size-10 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">{t("common.empty")}</p>
              <Link href="/purchases/new" className={buttonVariants({ variant: "outline" })}>
                <Plus className="size-4" /> {t("purchases.add")}
              </Link>
            </div>
          )}
        </CardContent>
      </Card>

      <EditPurchaseDialog row={editRow} onClose={() => setEditRow(null)} />
    </>
  );
}

type ItemEdit = {
  id: string;
  name: string;
  qty: number;
  landed_unit_cost: number;
  is_asset: boolean;
  asset_name: string;
  depreciation_years: string;
  depreciation_start_date: string;
  salvage_value: string;
};

function EditPurchaseDialog({ row, onClose }: { row: PurchaseRow | null; onClose: () => void }) {
  const { t } = useI18n();
  const supabase = createClient();
  const qc = useQueryClient();
  const [form, setForm] = useState({
    reference: "",
    vendor_id: "",
    paid_account_id: "",
    order_date: "",
    notes: "",
  });
  const [items, setItems] = useState<ItemEdit[]>([]);
  const [loadedFor, setLoadedFor] = useState<string | null>(null);

  const { data: vendors } = useQuery({
    queryKey: ["vendors-edit-pur"],
    queryFn: async () => {
      const { data } = await supabase.from("vendors").select("id, name").is("deleted_at", null).order("name");
      return data ?? [];
    },
  });
  const { data: accounts } = useQuery({
    queryKey: ["accounts-edit-pur"],
    queryFn: async () => {
      const { data } = await supabase.from("accounts").select("id, name").is("deleted_at", null).order("created_at");
      return data ?? [];
    },
  });
  const { data: purItems } = useQuery({
    queryKey: ["purchase-items", row?.id],
    enabled: !!row?.id,
    queryFn: async (): Promise<Tables<"purchase_items">[]> => {
      const { data, error } = await supabase
        .from("purchase_items")
        .select("*")
        .eq("purchase_id", row!.id)
        .order("created_at");
      if (error) throw error;
      return data ?? [];
    },
  });

  if (row && row.id !== loadedFor) {
    setLoadedFor(row.id);
    setForm({
      reference: row.reference ?? "",
      vendor_id: row.vendor_id ?? "",
      paid_account_id: row.paid_account_id ?? "",
      order_date: row.order_date ?? "",
      notes: row.notes ?? "",
    });
  }
  // Sync items state when query returns data for this row. Compare by length
  // + first id so we re-sync when switching between purchases, but skip when
  // the user has already loaded the items for this row.
  const purItemsKey = (purItems ?? []).map((x) => x.id).join("|");
  const itemsKey = items.map((x) => x.id).join("|");
  if (row && purItems && purItemsKey !== itemsKey) {
    setItems(
      purItems.map((pi) => ({
        id: pi.id,
        name: pi.name ?? "",
        qty: pi.qty,
        landed_unit_cost: Number(pi.landed_unit_cost),
        is_asset: pi.is_asset,
        asset_name: pi.asset_name ?? "",
        depreciation_years: pi.depreciation_years != null ? String(pi.depreciation_years) : "5",
        depreciation_start_date: pi.depreciation_start_date ?? row.order_date,
        salvage_value: pi.salvage_value != null ? String(pi.salvage_value) : "0",
      })),
    );
  }

  function updateItem(id: string, patch: Partial<ItemEdit>) {
    setItems((p) => p.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  }

  const save = useMutation({
    mutationFn: async () => {
      if (!row) return;
      const { error } = await supabase
        .from("purchases")
        .update({
          reference: form.reference.trim() || null,
          vendor_id: form.vendor_id || null,
          paid_account_id: form.paid_account_id || null,
          order_date: form.order_date || undefined,
          notes: form.notes.trim() || null,
        })
        .eq("id", row.id);
      if (error) throw error;

      // Persist per-line asset / depreciation changes.
      for (const it of items) {
        const { error: iErr } = await supabase
          .from("purchase_items")
          .update({
            is_asset: it.is_asset,
            asset_name: it.is_asset ? (it.asset_name.trim() || it.name || null) : null,
            depreciation_years: it.is_asset ? (Number(it.depreciation_years) || null) : null,
            depreciation_start_date: it.is_asset ? (it.depreciation_start_date || row.order_date) : null,
            salvage_value: it.is_asset ? round3(Number(it.salvage_value) || 0) : 0,
          })
          .eq("id", it.id);
        if (iErr) throw iErr;
      }
    },
    onSuccess: () => {
      toast.success(t("common.save"));
      qc.invalidateQueries({ queryKey: ["purchases"] });
      qc.invalidateQueries({ queryKey: ["purchase-items"] });
      qc.invalidateQueries({ queryKey: ["fixed-assets"] });
      setItems([]);
      setLoadedFor(null);
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={!!row} onOpenChange={(o) => !o && onClose()}>
      <DialogContent onClose={onClose} className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("common.edit")} · {row?.reference || row?.doc_no}</DialogTitle>
        </DialogHeader>
        {row && (
          <form onSubmit={(e) => { e.preventDefault(); save.mutate(); }} className="grid grid-cols-2 gap-4">
            <p className="col-span-2 rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800">
              {t("purchases.editScopeNote")}
            </p>
            <div className="col-span-2 space-y-1.5">
              <Label>{t("purchases.reference")}</Label>
              <Input value={form.reference} onChange={(e) => setForm({ ...form, reference: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>{t("vendors.title")}</Label>
              <Select value={form.vendor_id} onChange={(e) => setForm({ ...form, vendor_id: e.target.value })}>
                <option value="">—</option>
                {(vendors ?? []).map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>{t("purchases.paidFrom")}</Label>
              <Select value={form.paid_account_id} onChange={(e) => setForm({ ...form, paid_account_id: e.target.value })}>
                <option value="">—</option>
                {(accounts ?? []).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>{t("common.date")}</Label>
              <Input type="date" dir="ltr" value={form.order_date} onChange={(e) => setForm({ ...form, order_date: e.target.value })} />
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label>{t("common.notes")}</Label>
              <Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </div>

            {/* Per-line asset toggle */}
            <div className="col-span-2 space-y-2">
              <Label>{t("purchases.lineAssets")}</Label>
              <p className="text-xs text-muted-foreground">{t("purchases.lineAssetsHint")}</p>
              <div className="space-y-2">
                {items.map((it) => (
                  <div key={it.id} className={"rounded-md border p-2.5 " + (it.is_asset ? "border-primary/40 bg-primary/5" : "")}>
                    <label className="flex items-center justify-between gap-2 text-sm">
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          className="size-4 accent-[var(--primary)]"
                          checked={it.is_asset}
                          onChange={(e) => updateItem(it.id, { is_asset: e.target.checked })}
                        />
                        <span className={it.is_asset ? "font-medium text-primary" : ""}>{it.name || "—"}</span>
                      </div>
                      <span className="text-xs text-muted-foreground">
                        ×{it.qty} · {formatJOD(round3(it.qty * it.landed_unit_cost), "en")}
                      </span>
                    </label>
                    {it.is_asset && (
                      <div className="mt-2 grid grid-cols-3 gap-2">
                        <div className="space-y-1 col-span-3">
                          <Label className="text-xs">{t("purchases.assetName")}</Label>
                          <Input value={it.asset_name} placeholder={it.name} onChange={(e) => updateItem(it.id, { asset_name: e.target.value })} />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">{t("purchases.depYears")}</Label>
                          <Input type="number" step="0.5" min={0.5} dir="ltr" value={it.depreciation_years} onChange={(e) => updateItem(it.id, { depreciation_years: e.target.value })} />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">{t("purchases.depStart")}</Label>
                          <Input type="date" dir="ltr" value={it.depreciation_start_date} onChange={(e) => updateItem(it.id, { depreciation_start_date: e.target.value })} />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">{t("purchases.salvageValue")}</Label>
                          <Input type="number" step="0.001" dir="ltr" value={it.salvage_value} onChange={(e) => updateItem(it.id, { salvage_value: e.target.value })} />
                        </div>
                      </div>
                    )}
                  </div>
                ))}
                {items.length === 0 && (
                  <p className="text-xs text-muted-foreground">{t("common.empty")}</p>
                )}
              </div>
            </div>

            <div className="col-span-2 flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={onClose}>{t("common.cancel")}</Button>
              <Button type="submit" disabled={save.isPending}>
                {save.isPending && <Loader2 className="size-4 animate-spin" />}
                {t("common.save")}
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

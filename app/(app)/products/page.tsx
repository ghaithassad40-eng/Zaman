"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Loader2, Watch, Upload, Search, Pencil, X, SlidersHorizontal, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useI18n } from "@/lib/i18n/provider";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { formatJOD, num3, round3 } from "@/lib/utils";
import type { TablesUpdate } from "@/types/database.types";
import { ImportControls } from "@/components/import-controls";
import { numOr, type Col } from "@/lib/xlsx-utils";

const PROD_COLS: Col[] = [
  { key: "sku", header: "SKU" },
  { key: "brand", header: "Brand" },
  { key: "model", header: "Model" },
  { key: "color", header: "Color" },
  { key: "feature", header: "Feature (Smart / Battery / Automatic)" },
  { key: "gender", header: "Gender (Men / Women)" },
  { key: "description", header: "Description" },
  { key: "opening_qty", header: "Opening Balance Qty" },
  { key: "actual_cost", header: "Actual Cost (JOD)" },
  { key: "sold_qty", header: "Sold Qty" },
  { key: "avg_selling_price", header: "Avg Selling Price (JOD)" },
  { key: "selling_price", header: "Selling Price (JOD)" },
  { key: "expected_price", header: "Expected Selling Price (JOD)" },
];
const PROD_EXAMPLE = [
  { sku: "ml500", brand: "Casio", model: "ML500", color: "Black", feature: "Battery", gender: "Men", description: "Stainless steel, quartz", opening_qty: 10, actual_cost: 6.5, sold_qty: 3, avg_selling_price: 18, selling_price: 18, expected_price: 20 },
  { sku: "ml500", brand: "Casio", model: "ML500", color: "Silver", feature: "Battery", gender: "Men", description: "Stainless steel, quartz", opening_qty: 5, actual_cost: 6.5, sold_qty: 1, avg_selling_price: 18, selling_price: 18, expected_price: 20 },
];

type ProductRow = {
  id: string;
  sku: string;
  name: string;
  name_ar: string | null;
  color: string;
  brand: string | null;
  model: string | null;
  feature: string | null;
  gender: string | null;
  description: string | null;
  source_url: string | null;
  image_urls: string[];
  default_selling_price: number | null;
  expected_selling_price: number | null;
  opening_qty: number;
  actual_cost: number | null;
  avg_selling_price: number | null;
  historical_units_sold: number;
  is_active: boolean;
  inventory: { qty_on_hand: number; avg_unit_cost: number } | null;
};

/** Build the product name from structured fields, in the form
 *  "Brand Model Color Feature Gender" — e.g. "Casio ML500 Black Battery Men". */
export function buildProductName(p: { brand?: string; model?: string; color?: string; feature?: string; gender?: string; name?: string }): string {
  const parts = [p.brand, p.model, p.color, p.feature, p.gender]
    .map((x) => (x ?? "").trim())
    .filter(Boolean);
  return parts.length > 0 ? parts.join(" ") : (p.name ?? "").trim();
}

function useProducts() {
  const supabase = createClient();
  return useQuery({
    queryKey: ["products"],
    queryFn: async (): Promise<ProductRow[]> => {
      const { data, error } = await supabase
        .from("products")
        .select(
          "id, sku, name, name_ar, color, brand, model, feature, gender, description, source_url, image_urls, default_selling_price, expected_selling_price, opening_qty, actual_cost, avg_selling_price, historical_units_sold, is_active, inventory(qty_on_hand, avg_unit_cost)",
        )
        .is("deleted_at", null)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as ProductRow[];
    },
  });
}

export default function ProductsPage() {
  const { t, locale } = useI18n();
  const supabase = createClient();
  const qc = useQueryClient();
  const { data, isLoading } = useProducts();
  const [dialog, setDialog] = useState<{ open: boolean; product: ProductRow | null }>({ open: false, product: null });
  const [adjust, setAdjust] = useState<ProductRow | null>(null);
  const [search, setSearch] = useState("");
  const [colorFilter, setColorFilter] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  async function remove(p: ProductRow) {
    const stock = p.inventory?.qty_on_hand ?? 0;
    if (stock > 0) {
      toast.error(t("products.hasStock"));
      return;
    }
    if (!window.confirm(`${t("products.deleteConfirm")}\n\n${p.name}`)) return;
    setBusyId(p.id);
    try {
      const { error } = await supabase.from("products").update({ deleted_at: new Date().toISOString() }).eq("id", p.id);
      if (error) throw error;
      toast.success(t("products.deleted"));
      qc.invalidateQueries({ queryKey: ["products"] });
      qc.invalidateQueries({ queryKey: ["sellable_products"] });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusyId(null);
    }
  }

  const colors = useMemo(() => {
    const set = new Set<string>();
    for (const p of data ?? []) if (p.color?.trim()) set.add(p.color.trim());
    return Array.from(set).sort();
  }, [data]);

  async function importProducts(rows: Record<string, string>[]) {
    const { data: userData } = await supabase.auth.getUser();
    let created = 0;
    const errors: string[] = [];
    for (const r of rows) {
      const derivedName = buildProductName({
        brand: r.brand, model: r.model, color: r.color, feature: r.feature, gender: r.gender, name: r.name,
      });
      if (!r.sku || !derivedName) { errors.push("Row missing SKU or product details (brand/model/…)"); continue; }
      const opening = Math.max(0, Math.round(numOr(r.opening_qty)));
      const sold = Math.max(0, Math.round(numOr(r.sold_qty)));
      const actualCost = numOr(r.actual_cost);
      const avgSell = numOr(r.avg_selling_price);
      const sellingPrice = r.selling_price ? numOr(r.selling_price) : null;
      const expectedPrice = r.expected_price ? numOr(r.expected_price) : null;
      const { data: prod, error } = await supabase
        .from("products")
        .upsert(
          {
            sku: r.sku,
            name: derivedName,
            color: (r.color ?? "").trim(),
            brand: r.brand || null,
            model: r.model || null,
            feature: r.feature || null,
            gender: r.gender || null,
            description: r.description || null,
            source: "manual",
            opening_qty: opening,
            actual_cost: r.actual_cost ? actualCost : null,
            avg_selling_price: r.avg_selling_price ? avgSell : null,
            historical_units_sold: 0,
            historical_revenue: 0,
            default_selling_price: sellingPrice,
            expected_selling_price: expectedPrice,
            created_by: userData.user?.id,
          },
          { onConflict: "sku,color" },
        )
        .select("id")
        .single();
      if (error || !prod) { errors.push(`${r.sku}: ${error?.message ?? "failed"}`); continue; }
      const { error: invErr } = await supabase
        .from("inventory")
        .upsert({ product_id: prod.id, qty_on_hand: Math.max(0, opening - sold), avg_unit_cost: actualCost }, { onConflict: "product_id" });
      if (invErr) { errors.push(`${r.sku}: ${invErr.message}`); continue; }

      // Convert historical sold qty into a real sale dated 2026-01-01 so it
      // flows through Revenue, Profit, and reports like a normal sale.
      if (sold > 0) {
        const unitPrice = avgSell || sellingPrice || expectedPrice || 0;
        if (unitPrice > 0) {
          const subtotal = round3(sold * unitPrice);
          const totalCost = round3(sold * actualCost);
          const gp = round3(subtotal - totalCost);
          const { data: saleNo } = await supabase.rpc("next_doc_no", { p_type: "sale" });
          await supabase.from("sales").insert({
            sale_no: saleNo as string,
            sale_date: "2026-01-01",
            customer_id: null,
            status: "completed",
            payment_status: "paid",
            subtotal, discount: 0, delivery_fee: 0, delivery_billed: 0,
            gst_rate: 0, gst_amount: 0, total: subtotal,
            total_cost: totalCost, packaging_cost: 0, gross_profit: gp,
            fulfillment_stage: 6,
            notes: `Historical (imported) — ${r.sku}`,
            created_by: userData.user?.id,
          }).select("id").single().then(async ({ data: s }) => {
            if (!s) return;
            await supabase.from("sale_items").insert({
              sale_id: s.id, product_id: prod.id, description: derivedName,
              qty: sold, unit_price: unitPrice, line_total: subtotal, unit_cost: actualCost,
            });
          });
        }
      }
      created++;
    }
    qc.invalidateQueries({ queryKey: ["products"] });
    qc.invalidateQueries({ queryKey: ["sellable_products"] });
    qc.invalidateQueries({ queryKey: ["analytics"] });
    return { created, skipped: errors.length, errors };
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (data ?? []).filter((p) => {
      if (colorFilter && (p.color ?? "") !== colorFilter) return false;
      if (!q) return true;
      return (
        p.name.toLowerCase().includes(q) ||
        p.sku.toLowerCase().includes(q) ||
        (p.name_ar ?? "").includes(search.trim()) ||
        (p.color ?? "").toLowerCase().includes(q) ||
        (p.brand ?? "").toLowerCase().includes(q) ||
        (p.model ?? "").toLowerCase().includes(q) ||
        (p.feature ?? "").toLowerCase().includes(q) ||
        (p.gender ?? "").toLowerCase().includes(q)
      );
    });
  }, [data, search, colorFilter]);

  const forecast = useMemo(() => {
    let rev = 0, cost = 0;
    for (const p of data ?? []) {
      const qty = p.inventory?.qty_on_hand ?? 0;
      const exp = p.expected_selling_price ?? p.default_selling_price;
      if (qty > 0 && exp) {
        rev += qty * Number(exp);
        cost += qty * Number(p.inventory?.avg_unit_cost ?? 0);
      }
    }
    return { rev: round3(rev), profit: round3(rev - cost) };
  }, [data]);

  return (
    <>
      <PageHeader
        title={t("products.title")}
        description={t("products.import")}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <ImportControls templateName="zaman-products-template.xlsx" cols={PROD_COLS} examples={PROD_EXAMPLE} onImport={importProducts} size="sm" />
            <Button onClick={() => setDialog({ open: true, product: null })}>
              <Plus className="size-4" /> {t("products.add")}
            </Button>
          </div>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative w-full max-w-sm flex-1">
          <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="ps-9"
            placeholder={t("common.search")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        {colors.length > 0 && (
          <Select className="w-40" value={colorFilter} onChange={(e) => setColorFilter(e.target.value)}>
            <option value="">{t("products.allColors")}</option>
            {colors.map((c) => <option key={c} value={c}>{c}</option>)}
          </Select>
        )}
      </div>

      {forecast.rev > 0 && (
        <div className="mb-4 grid grid-cols-2 gap-4 sm:max-w-md">
          <Card className="border-primary/30 bg-primary/5">
            <CardContent className="p-4">
              <div className="text-xs text-muted-foreground">{t("products.expectedRevenue")}</div>
              <div className="text-xl font-bold text-primary">{formatJOD(forecast.rev, locale)}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="text-xs text-muted-foreground">{t("products.expectedProfit")}</div>
              <div className="text-xl font-bold text-success">{formatJOD(forecast.profit, locale)}</div>
            </CardContent>
          </Card>
        </div>
      )}

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
                  <TableHead>{t("common.name")}</TableHead>
                  <TableHead>{t("products.sku")}</TableHead>
                  <TableHead className="text-end">{t("products.openingQty")}</TableHead>
                  <TableHead className="text-end">{t("products.soldQty")}</TableHead>
                  <TableHead className="text-end">{t("products.onHand")}</TableHead>
                  <TableHead className="text-end">{t("products.actualCost")}</TableHead>
                  <TableHead className="text-end">{t("products.avgSellPrice")}</TableHead>
                  <TableHead className="text-end">{t("products.sellingPrice")}</TableHead>
                  <TableHead className="text-end">{t("common.actions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((p) => (
                  <TableRow
                    key={p.id}
                    className="cursor-pointer"
                    onClick={() => setDialog({ open: true, product: p })}
                  >
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-muted">
                          {p.image_urls?.[0] ? (
                            <Image
                              src={p.image_urls[0]}
                              alt={p.name}
                              width={40}
                              height={40}
                              className="size-10 object-cover"
                              unoptimized
                            />
                          ) : (
                            <Watch className="size-5 text-muted-foreground" />
                          )}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="truncate font-medium">{locale === "ar" && p.name_ar ? p.name_ar : p.name}</span>
                            {p.color && <Badge variant="outline" className="shrink-0 text-[10px]">{p.color}</Badge>}
                          </div>
                          {p.brand && (
                            <div className="truncate text-xs text-muted-foreground">{p.brand}</div>
                          )}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="font-mono text-xs">{p.sku}</TableCell>
                    <TableCell className="text-end text-muted-foreground">{p.opening_qty}</TableCell>
                    <TableCell className="text-end text-muted-foreground">{p.historical_units_sold}</TableCell>
                    <TableCell className="text-end">
                      <Badge variant={(p.inventory?.qty_on_hand ?? 0) > 0 ? "success" : "secondary"}>
                        {p.inventory?.qty_on_hand ?? 0}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-end text-muted-foreground">
                      {p.actual_cost != null ? num3(p.actual_cost) : num3(p.inventory?.avg_unit_cost ?? 0)}
                    </TableCell>
                    <TableCell className="text-end text-muted-foreground">
                      {p.avg_selling_price ? num3(p.avg_selling_price) : "—"}
                    </TableCell>
                    <TableCell className="text-end font-medium">
                      {p.default_selling_price ? formatJOD(p.default_selling_price, locale) : "—"}
                    </TableCell>
                    <TableCell className="text-end">
                      <div className="flex justify-end gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={(e) => { e.stopPropagation(); setDialog({ open: true, product: p }); }}
                        >
                          <Pencil className="size-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={(e) => { e.stopPropagation(); setAdjust(p); }}
                          title={t("inventory.adjust")}
                        >
                          <SlidersHorizontal className="size-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-destructive hover:text-destructive"
                          disabled={busyId === p.id}
                          onClick={(e) => { e.stopPropagation(); remove(p); }}
                          title={t("common.delete")}
                        >
                          {busyId === p.id ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="flex flex-col items-center gap-3 p-12 text-center">
              <Watch className="size-10 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                {search ? t("common.empty") : t("common.empty")}
              </p>
              {!search && (
                <Button onClick={() => setDialog({ open: true, product: null })} variant="outline">
                  <Plus className="size-4" /> {t("products.add")}
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <ProductDialog
        open={dialog.open}
        product={dialog.product}
        onClose={() => setDialog({ open: false, product: null })}
      />
      <AdjustDialog product={adjust} onClose={() => setAdjust(null)} />
    </>
  );
}

function AdjustDialog({ product, onClose }: { product: ProductRow | null; onClose: () => void }) {
  const { t, locale } = useI18n();
  const supabase = createClient();
  const qc = useQueryClient();
  const [qty, setQty] = useState("");
  const [reason, setReason] = useState("");
  const [loadedFor, setLoadedFor] = useState<string | null>(null);

  const onHand = product?.inventory?.qty_on_hand ?? 0;
  if (product && product.id !== loadedFor) {
    setLoadedFor(product.id);
    setQty(String(onHand));
    setReason("");
  }
  const change = product ? (Number(qty) || 0) - onHand : 0;

  const adjust = useMutation({
    mutationFn: async () => {
      if (!product) return;
      const { error } = await supabase.rpc("adjust_inventory", {
        p_product_id: product.id,
        p_new_qty: Math.max(0, Math.round(Number(qty) || 0)),
        p_note: reason.trim() || undefined,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(t("inventory.adjusted"));
      qc.invalidateQueries({ queryKey: ["products"] });
      qc.invalidateQueries({ queryKey: ["sellable_products"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={!!product} onOpenChange={(o) => !o && onClose()}>
      <DialogContent onClose={onClose}>
        <DialogHeader>
          <DialogTitle>{t("inventory.adjustTitle")}</DialogTitle>
        </DialogHeader>
        {product && (
          <form onSubmit={(e) => { e.preventDefault(); adjust.mutate(); }} className="space-y-4">
            <div className="rounded-md border bg-muted/40 p-3 text-sm">
              <div className="font-medium">{locale === "ar" && product.name_ar ? product.name_ar : product.name}</div>
              <div className="text-muted-foreground">{t("inventory.currentQty")}: <span className="font-semibold text-foreground">{onHand}</span></div>
            </div>
            <div className="space-y-1.5">
              <Label>{t("inventory.newQty")} *</Label>
              <Input required type="number" min={0} dir="ltr" value={qty} onChange={(e) => setQty(e.target.value)} />
              {change !== 0 && (
                <p className={"text-xs " + (change > 0 ? "text-success" : "text-destructive")}>
                  {t("inventory.change")}: {change > 0 ? "+" : ""}{change}
                </p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label>{t("inventory.reason")}</Label>
              <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t("inventory.reasonPlaceholder")} />
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={onClose}>{t("common.cancel")}</Button>
              <Button type="submit" disabled={adjust.isPending || change === 0}>
                {adjust.isPending && <Loader2 className="size-4 animate-spin" />}
                {t("common.save")}
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

function ProductDialog({
  open,
  product,
  onClose,
}: {
  open: boolean;
  product: ProductRow | null;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const supabase = createClient();
  const qc = useQueryClient();
  const isEdit = !!product;

  const [form, setForm] = useState({
    sku: "",
    name: "",
    name_ar: "",
    brand: "",
    model: "",
    color: "",
    feature: "",
    gender: "",
    description: "",
    source_url: "",
    price: "",
    expected: "",
    opening: "0",
    actual: "",
    sold: "0",
    avgSell: "",
    is_active: true,
  });
  const [files, setFiles] = useState<File[]>([]);
  const [existingImages, setExistingImages] = useState<string[]>([]);
  // Sync form whenever the dialog opens for a (different) product.
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  if (open && (product?.id ?? "new") !== loadedFor) {
    setLoadedFor(product?.id ?? "new");
    setForm({
      sku: product?.sku ?? "",
      name: product?.name ?? "",
      name_ar: product?.name_ar ?? "",
      brand: product?.brand ?? "",
      model: product?.model ?? "",
      color: product?.color ?? "",
      feature: product?.feature ?? "",
      gender: product?.gender ?? "",
      description: product?.description ?? "",
      source_url: product?.source_url ?? "",
      price: product?.default_selling_price != null ? String(product.default_selling_price) : "",
      expected: product?.expected_selling_price != null ? String(product.expected_selling_price) : "",
      opening: product?.opening_qty != null ? String(product.opening_qty) : "0",
      actual: product?.actual_cost != null ? String(product.actual_cost) : "",
      sold: product?.historical_units_sold != null ? String(product.historical_units_sold) : "0",
      avgSell: product?.avg_selling_price != null ? String(product.avg_selling_price) : "",
      is_active: product?.is_active ?? true,
    });
    setFiles([]);
    setExistingImages(product?.image_urls ?? []);
  }

  const mutation = useMutation({
    mutationFn: async () => {
      // Upload any newly-selected photos.
      const newUrls: string[] = [];
      for (const f of files) {
        const path = `${crypto.randomUUID()}-${f.name.replace(/[^\w.\-]/g, "_")}`;
        const { error: upErr } = await supabase.storage.from("product-images").upload(path, f, { upsert: false });
        if (upErr) throw upErr;
        newUrls.push(supabase.storage.from("product-images").getPublicUrl(path).data.publicUrl);
      }
      const imageUrls = [...existingImages, ...newUrls];
      const { data: userData } = await supabase.auth.getUser();

      const opening = Math.max(0, Math.round(numOr(form.opening)));
      const sold = Math.max(0, Math.round(numOr(form.sold)));
      const actualCost = form.actual ? numOr(form.actual) : null;
      const avgSell = form.avgSell ? numOr(form.avgSell) : null;

      const derivedName = buildProductName({
        brand: form.brand, model: form.model, color: form.color, feature: form.feature, gender: form.gender, name: form.name,
      });
      if (!derivedName) throw new Error("Enter at least the Brand or Model to build the product name.");

      if (isEdit && product) {
        const patch: TablesUpdate<"products"> = {
          sku: form.sku.trim(),
          name: derivedName,
          name_ar: form.name_ar.trim() || null,
          color: form.color.trim(),
          brand: form.brand.trim() || null,
          model: form.model.trim() || null,
          feature: form.feature.trim() || null,
          gender: form.gender.trim() || null,
          description: form.description.trim() || null,
          source_url: form.source_url.trim() || null,
          image_urls: imageUrls,
          default_selling_price: form.price ? Number(form.price) : null,
          expected_selling_price: form.expected ? Number(form.expected) : null,
          opening_qty: opening,
          actual_cost: actualCost,
          avg_selling_price: avgSell,
          historical_units_sold: sold,
          historical_revenue: round3((avgSell ?? 0) * sold),
          is_active: form.is_active,
          updated_by: userData.user?.id,
        };
        const { error } = await supabase.from("products").update(patch).eq("id", product.id);
        if (error) throw error;
        if (actualCost != null) {
          await supabase.from("inventory").update({ avg_unit_cost: actualCost }).eq("product_id", product.id);
        }
      } else {
        const { data: created, error } = await supabase
          .from("products")
          .insert({
            sku: form.sku.trim(),
            name: derivedName,
            name_ar: form.name_ar.trim() || null,
            color: form.color.trim(),
            brand: form.brand.trim() || null,
            model: form.model.trim() || null,
            feature: form.feature.trim() || null,
            gender: form.gender.trim() || null,
            description: form.description.trim() || null,
            source: "manual",
            source_url: form.source_url.trim() || null,
            image_urls: imageUrls,
            default_selling_price: form.price ? Number(form.price) : null,
            expected_selling_price: form.expected ? Number(form.expected) : null,
            opening_qty: opening,
            actual_cost: actualCost,
            avg_selling_price: avgSell,
            historical_units_sold: sold,
            historical_revenue: round3((avgSell ?? 0) * sold),
            created_by: userData.user?.id,
          })
          .select("id")
          .single();
        if (error) throw error;
        await supabase.from("inventory").insert({
          product_id: created.id,
          qty_on_hand: Math.max(0, opening - sold),
          avg_unit_cost: actualCost ?? 0,
        });
      }
    },
    onSuccess: () => {
      toast.success(isEdit ? t("common.save") : t("products.add"));
      qc.invalidateQueries({ queryKey: ["products"] });
      qc.invalidateQueries({ queryKey: ["sellable_products"] });
      qc.invalidateQueries({ queryKey: ["inventory"] });
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent onClose={onClose} className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{isEdit ? t("common.edit") : t("products.add")}</DialogTitle>
          <DialogDescription>{isEdit ? form.name : t("products.import")}</DialogDescription>
        </DialogHeader>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            mutation.mutate();
          }}
          className="grid grid-cols-1 gap-4 sm:grid-cols-2"
        >
          <div className="space-y-1.5 sm:col-span-2">
            <Label>{t("products.sku")} *</Label>
            <Input required dir="ltr" value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label>{t("products.brand")}</Label>
            <Input list="brand-list" value={form.brand} onChange={(e) => setForm({ ...form, brand: e.target.value })} placeholder="Casio" />
            <datalist id="brand-list">
              <option value="Casio" /><option value="Citizen" /><option value="Seiko" /><option value="Rolex" /><option value="BIDEN" /><option value="Fossil" />
            </datalist>
          </div>
          <div className="space-y-1.5">
            <Label>{t("products.model")}</Label>
            <Input value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} placeholder="ML500" />
          </div>
          <div className="space-y-1.5">
            <Label>{t("products.color")}</Label>
            <Input list="color-list" value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })} placeholder="Black" />
            <datalist id="color-list">
              <option value="Black" /><option value="Silver" /><option value="Gold" /><option value="Rose Gold" /><option value="Blue" /><option value="Brown" /><option value="White" />
            </datalist>
          </div>
          <div className="space-y-1.5">
            <Label>{t("products.feature")}</Label>
            <Select value={form.feature} onChange={(e) => setForm({ ...form, feature: e.target.value })}>
              <option value="">—</option>
              <option value="Smart">Smart</option>
              <option value="Battery">Battery</option>
              <option value="Automatic">Automatic</option>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>{t("products.gender")}</Label>
            <Select value={form.gender} onChange={(e) => setForm({ ...form, gender: e.target.value })}>
              <option value="">—</option>
              <option value="Men">Men</option>
              <option value="Women">Women</option>
              <option value="Unisex">Unisex</option>
            </Select>
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label>{t("products.namePreview")}</Label>
            <div className="rounded-md border bg-muted/50 px-3 py-2 text-sm font-medium">
              {buildProductName(form) || <span className="text-muted-foreground">{t("products.namePreviewHint")}</span>}
            </div>
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label>{t("common.name")} (ع)</Label>
            <Input dir="rtl" value={form.name_ar} onChange={(e) => setForm({ ...form, name_ar: e.target.value })} placeholder="اختياري" />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label>{t("products.description")}</Label>
            <Textarea
              rows={3}
              placeholder="e.g. movement, strap material, size, color…"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Shein URL</Label>
            <Input dir="ltr" placeholder="https://shein.com/..." value={form.source_url} onChange={(e) => setForm({ ...form, source_url: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label>{t("products.sellingPrice")} (JOD)</Label>
            <Input type="number" step="0.001" dir="ltr" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label>{t("products.expectedPrice")} (JOD)</Label>
            <Input type="number" step="0.001" dir="ltr" value={form.expected} onChange={(e) => setForm({ ...form, expected: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label>{t("products.openingQty")}</Label>
            <Input type="number" dir="ltr" value={form.opening} onChange={(e) => setForm({ ...form, opening: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label>{t("products.soldQty")}</Label>
            <Input type="number" dir="ltr" value={form.sold} onChange={(e) => setForm({ ...form, sold: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label>{t("products.actualCost")} (JOD)</Label>
            <Input type="number" step="0.001" dir="ltr" value={form.actual} onChange={(e) => setForm({ ...form, actual: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label>{t("products.avgSellPrice")} (JOD)</Label>
            <Input type="number" step="0.001" dir="ltr" value={form.avgSell} onChange={(e) => setForm({ ...form, avgSell: e.target.value })} />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label>{t("products.photos")}</Label>
            <div className="flex flex-wrap gap-2">
              {existingImages.map((url, i) => (
                <div key={url} className="group relative size-20 overflow-hidden rounded-md border bg-muted">
                  <Image src={url} alt="" width={80} height={80} className="size-20 object-cover" unoptimized />
                  <button
                    type="button"
                    onClick={() => setExistingImages((p) => p.filter((_, idx) => idx !== i))}
                    className="absolute end-0.5 top-0.5 rounded-full bg-black/60 p-0.5 text-white opacity-0 transition group-hover:opacity-100"
                    aria-label="remove"
                  >
                    <X className="size-3.5" />
                  </button>
                </div>
              ))}
              {files.map((f, i) => (
                <div key={i} className="group relative size-20 overflow-hidden rounded-md border bg-muted">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={URL.createObjectURL(f)} alt="" className="size-20 object-cover" />
                  <button
                    type="button"
                    onClick={() => setFiles((p) => p.filter((_, idx) => idx !== i))}
                    className="absolute end-0.5 top-0.5 rounded-full bg-black/60 p-0.5 text-white opacity-0 transition group-hover:opacity-100"
                    aria-label="remove"
                  >
                    <X className="size-3.5" />
                  </button>
                </div>
              ))}
              <label className="flex size-20 cursor-pointer flex-col items-center justify-center gap-1 rounded-md border border-dashed text-xs text-muted-foreground hover:bg-accent">
                <Upload className="size-4" />
                <span>{t("products.addPhotos")}</span>
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={(e) => setFiles((p) => [...p, ...Array.from(e.target.files ?? [])])}
                />
              </label>
            </div>
          </div>

          {isEdit && (
            <label className="flex items-center gap-2 text-sm font-medium sm:col-span-2">
              <input type="checkbox" className="size-4 accent-[var(--primary)]" checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} />
              {t("products.active")}
            </label>
          )}

          <div className="mt-2 flex justify-end gap-2 sm:col-span-2">
            <Button type="button" variant="outline" onClick={onClose}>{t("common.cancel")}</Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending && <Loader2 className="size-4 animate-spin" />}
              {t("common.save")}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

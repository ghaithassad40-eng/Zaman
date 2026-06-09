"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Boxes, Search, SlidersHorizontal, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useI18n } from "@/lib/i18n/provider";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
} from "@/components/ui/dialog";
import { formatJOD, round3 } from "@/lib/utils";
import { ImportControls } from "@/components/import-controls";
import { ProductCell } from "@/components/product-cell";
import { numOr, type Col } from "@/lib/xlsx-utils";

const INV_COLS: Col[] = [
  { key: "sku", header: "SKU" },
  { key: "name", header: "Name" },
  { key: "name_ar", header: "Name (Arabic)" },
  { key: "brand", header: "Brand" },
  { key: "description", header: "Description" },
  { key: "selling_price", header: "Selling Price (JOD)" },
  { key: "expected_price", header: "Expected Price (JOD)" },
  { key: "qty", header: "Quantity" },
  { key: "unit_cost", header: "Unit Cost (JOD)" },
];
const INV_EXAMPLE = [
  { sku: "sj2401234567", name: "BIDEN Mens Watch Black", name_ar: "ساعة بايدن رجالي اسود", brand: "BIDEN", description: "Stainless steel, quartz", selling_price: 18, expected_price: 20, qty: 5, unit_cost: 6.5 },
];

type Row = {
  product_id: string;
  qty_on_hand: number;
  avg_unit_cost: number;
  products: { name: string; name_ar: string | null; sku: string; image_urls: string[] | null } | null;
};

export default function InventoryPage() {
  const { t, locale } = useI18n();
  const supabase = createClient();
  const qc = useQueryClient();
  const [adjust, setAdjust] = useState<Row | null>(null);

  async function importInventory(rows: Record<string, string>[]) {
    const { data: userData } = await supabase.auth.getUser();
    let created = 0;
    const errors: string[] = [];
    for (const r of rows) {
      if (!r.sku || !r.name) { errors.push("Row missing SKU or Name"); continue; }
      const { data: prod, error } = await supabase
        .from("products")
        .upsert(
          {
            sku: r.sku,
            name: r.name,
            name_ar: r.name_ar || null,
            brand: r.brand || null,
            description: r.description || null,
            source: "manual",
            default_selling_price: r.selling_price ? numOr(r.selling_price) : null,
            expected_selling_price: r.expected_price ? numOr(r.expected_price) : null,
            created_by: userData.user?.id,
          },
          { onConflict: "sku" },
        )
        .select("id")
        .single();
      if (error || !prod) { errors.push(`${r.sku}: ${error?.message ?? "failed"}`); continue; }
      const { error: invErr } = await supabase
        .from("inventory")
        .upsert(
          { product_id: prod.id, qty_on_hand: Math.max(0, Math.round(numOr(r.qty))), avg_unit_cost: numOr(r.unit_cost) },
          { onConflict: "product_id" },
        );
      if (invErr) { errors.push(`${r.sku}: ${invErr.message}`); continue; }
      created++;
    }
    qc.invalidateQueries({ queryKey: ["inventory"] });
    qc.invalidateQueries({ queryKey: ["products"] });
    qc.invalidateQueries({ queryKey: ["sellable_products"] });
    return { created, skipped: errors.length, errors };
  }

  const { data, isLoading } = useQuery({
    queryKey: ["inventory"],
    queryFn: async (): Promise<Row[]> => {
      const { data, error } = await supabase
        .from("inventory")
        .select("product_id, qty_on_hand, avg_unit_cost, products(name, name_ar, sku, image_urls)")
        .order("qty_on_hand", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as Row[];
    },
  });

  const totalValue = round3(
    (data ?? []).reduce((s, r) => s + Number(r.qty_on_hand) * Number(r.avg_unit_cost), 0),
  );

  const [search, setSearch] = useState("");
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return data ?? [];
    return (data ?? []).filter(
      (r) =>
        (r.products?.name ?? "").toLowerCase().includes(q) ||
        (r.products?.name ?? "").includes(search.trim()) ||
        (r.products?.sku ?? "").toLowerCase().includes(q),
    );
  }, [data, search]);

  const nm = (r: Row) => (locale === "ar" && r.products?.name_ar ? r.products.name_ar : r.products?.name ?? "—");

  return (
    <>
      <PageHeader
        title={t("nav.inventory")}
        description={`${t("dashboard.stockValue")}: ${formatJOD(totalValue, locale)}`}
        action={<ImportControls templateName="zaman-inventory-template.xlsx" cols={INV_COLS} examples={INV_EXAMPLE} onImport={importInventory} />}
      />
      <div className="relative mb-4 max-w-sm">
        <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input className="ps-9" placeholder={t("common.search")} value={search} onChange={(e) => setSearch(e.target.value)} />
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
                  <TableHead>{t("common.name")}</TableHead>
                  <TableHead className="hidden md:table-cell">{t("products.sku")}</TableHead>
                  <TableHead className="text-end">{t("products.onHand")}</TableHead>
                  <TableHead className="text-end">{t("products.avgCost")}</TableHead>
                  <TableHead className="text-end">{t("dashboard.stockValue")}</TableHead>
                  <TableHead className="text-end">{t("common.actions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((r) => (
                  <TableRow key={r.product_id}>
                    <TableCell>
                      <ProductCell
                        image={r.products?.image_urls?.[0]}
                        name={nm(r)}
                        meta={<span className="font-mono">{r.products?.sku ?? "—"}</span>}
                      />
                    </TableCell>
                    <TableCell className="hidden font-mono text-xs md:table-cell">{r.products?.sku ?? "—"}</TableCell>
                    <TableCell className="text-end">
                      <Badge variant={r.qty_on_hand > 2 ? "success" : r.qty_on_hand > 0 ? "warning" : "secondary"}>
                        {r.qty_on_hand}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-end text-muted-foreground">
                      {formatJOD(r.avg_unit_cost, locale)}
                    </TableCell>
                    <TableCell className="text-end font-medium">
                      {formatJOD(round3(r.qty_on_hand * r.avg_unit_cost), locale)}
                    </TableCell>
                    <TableCell className="text-end">
                      <Button size="sm" variant="outline" onClick={() => setAdjust(r)}>
                        <SlidersHorizontal className="size-4" /> {t("inventory.adjust")}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="flex flex-col items-center gap-3 p-12 text-center">
              <Boxes className="size-10 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">{t("common.empty")}</p>
            </div>
          )}
        </CardContent>
      </Card>

      <AdjustDialog row={adjust} onClose={() => setAdjust(null)} />
    </>
  );
}

function AdjustDialog({ row, onClose }: { row: Row | null; onClose: () => void }) {
  const { t, locale } = useI18n();
  const supabase = createClient();
  const qc = useQueryClient();
  const [qty, setQty] = useState("");
  const [reason, setReason] = useState("");
  const [loadedFor, setLoadedFor] = useState<string | null>(null);

  if (row && row.product_id !== loadedFor) {
    setLoadedFor(row.product_id);
    setQty(String(row.qty_on_hand));
    setReason("");
  }

  const change = row ? (Number(qty) || 0) - row.qty_on_hand : 0;

  const adjust = useMutation({
    mutationFn: async () => {
      if (!row) return;
      const { error } = await supabase.rpc("adjust_inventory", {
        p_product_id: row.product_id,
        p_new_qty: Math.max(0, Math.round(Number(qty) || 0)),
        p_note: reason.trim() || undefined,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(t("inventory.adjusted"));
      qc.invalidateQueries({ queryKey: ["inventory"] });
      qc.invalidateQueries({ queryKey: ["products"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      qc.invalidateQueries({ queryKey: ["sellable_products"] });
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={!!row} onOpenChange={(o) => !o && onClose()}>
      <DialogContent onClose={onClose}>
        <DialogHeader>
          <DialogTitle>{t("inventory.adjustTitle")}</DialogTitle>
        </DialogHeader>
        {row && (
          <form onSubmit={(e) => { e.preventDefault(); adjust.mutate(); }} className="space-y-4">
            <div className="rounded-md border bg-muted/40 p-3 text-sm">
              <div className="font-medium">{locale === "ar" && row.products?.name_ar ? row.products.name_ar : row.products?.name}</div>
              <div className="text-muted-foreground">
                {t("inventory.currentQty")}: <span className="font-semibold text-foreground">{row.qty_on_hand}</span>
              </div>
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

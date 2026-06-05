"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Loader2, Watch, Upload, Search, Pencil } from "lucide-react";
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
  DialogDescription,
} from "@/components/ui/dialog";
import { formatJOD, round3 } from "@/lib/utils";
import type { TablesUpdate } from "@/types/database.types";

type ProductRow = {
  id: string;
  sku: string;
  name: string;
  name_ar: string | null;
  brand: string | null;
  source_url: string | null;
  image_urls: string[];
  default_selling_price: number | null;
  expected_selling_price: number | null;
  is_active: boolean;
  inventory: { qty_on_hand: number; avg_unit_cost: number } | null;
};

function useProducts() {
  const supabase = createClient();
  return useQuery({
    queryKey: ["products"],
    queryFn: async (): Promise<ProductRow[]> => {
      const { data, error } = await supabase
        .from("products")
        .select(
          "id, sku, name, name_ar, brand, source_url, image_urls, default_selling_price, expected_selling_price, is_active, inventory(qty_on_hand, avg_unit_cost)",
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
  const { data, isLoading } = useProducts();
  const [dialog, setDialog] = useState<{ open: boolean; product: ProductRow | null }>({ open: false, product: null });
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return data ?? [];
    return (data ?? []).filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.sku.toLowerCase().includes(q) ||
        (p.name_ar ?? "").includes(search.trim()) ||
        (p.brand ?? "").toLowerCase().includes(q),
    );
  }, [data, search]);

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
          <Button onClick={() => setDialog({ open: true, product: null })}>
            <Plus className="size-4" /> {t("products.add")}
          </Button>
        }
      />

      <div className="relative mb-4 max-w-sm">
        <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          className="ps-9"
          placeholder={t("common.search")}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
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
                  <TableHead className="text-end">{t("products.onHand")}</TableHead>
                  <TableHead className="text-end">{t("products.avgCost")}</TableHead>
                  <TableHead className="text-end">{t("products.sellingPrice")}</TableHead>
                  <TableHead className="text-end">{t("products.expectedPrice")}</TableHead>
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
                          <div className="truncate font-medium">
                            {locale === "ar" && p.name_ar ? p.name_ar : p.name}
                          </div>
                          {p.brand && (
                            <div className="truncate text-xs text-muted-foreground">{p.brand}</div>
                          )}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="font-mono text-xs">{p.sku}</TableCell>
                    <TableCell className="text-end">
                      <Badge variant={(p.inventory?.qty_on_hand ?? 0) > 0 ? "success" : "secondary"}>
                        {p.inventory?.qty_on_hand ?? 0}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-end text-muted-foreground">
                      {formatJOD(p.inventory?.avg_unit_cost ?? 0, locale)}
                    </TableCell>
                    <TableCell className="text-end font-medium">
                      {p.default_selling_price ? formatJOD(p.default_selling_price, locale) : "—"}
                    </TableCell>
                    <TableCell className="text-end text-muted-foreground">
                      {p.expected_selling_price ? formatJOD(p.expected_selling_price, locale) : "—"}
                    </TableCell>
                    <TableCell className="text-end">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={(e) => { e.stopPropagation(); setDialog({ open: true, product: p }); }}
                      >
                        <Pencil className="size-4" /> {t("common.edit")}
                      </Button>
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
    </>
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
    source_url: "",
    price: "",
    expected: "",
    is_active: true,
  });
  const [file, setFile] = useState<File | null>(null);
  // Sync form whenever the dialog opens for a (different) product.
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  if (open && (product?.id ?? "new") !== loadedFor) {
    setLoadedFor(product?.id ?? "new");
    setForm({
      sku: product?.sku ?? "",
      name: product?.name ?? "",
      name_ar: product?.name_ar ?? "",
      brand: product?.brand ?? "",
      source_url: product?.source_url ?? "",
      price: product?.default_selling_price != null ? String(product.default_selling_price) : "",
      expected: product?.expected_selling_price != null ? String(product.expected_selling_price) : "",
      is_active: product?.is_active ?? true,
    });
    setFile(null);
  }

  const mutation = useMutation({
    mutationFn: async () => {
      let imageUrl: string | null = null;
      if (file) {
        const path = `${crypto.randomUUID()}-${file.name.replace(/[^\w.\-]/g, "_")}`;
        const { error: upErr } = await supabase.storage.from("product-images").upload(path, file, { upsert: false });
        if (upErr) throw upErr;
        imageUrl = supabase.storage.from("product-images").getPublicUrl(path).data.publicUrl;
      }
      const { data: userData } = await supabase.auth.getUser();

      if (isEdit && product) {
        const patch: TablesUpdate<"products"> = {
          sku: form.sku.trim(),
          name: form.name.trim(),
          name_ar: form.name_ar.trim() || null,
          brand: form.brand.trim() || null,
          source_url: form.source_url.trim() || null,
          default_selling_price: form.price ? Number(form.price) : null,
          expected_selling_price: form.expected ? Number(form.expected) : null,
          is_active: form.is_active,
          updated_by: userData.user?.id,
        };
        if (imageUrl) patch.image_urls = [imageUrl];
        const { error } = await supabase.from("products").update(patch).eq("id", product.id);
        if (error) throw error;
      } else {
        const { data: created, error } = await supabase
          .from("products")
          .insert({
            sku: form.sku.trim(),
            name: form.name.trim(),
            name_ar: form.name_ar.trim() || null,
            brand: form.brand.trim() || null,
            source: "shein",
            source_url: form.source_url.trim() || null,
            image_urls: imageUrl ? [imageUrl] : [],
            default_selling_price: form.price ? Number(form.price) : null,
            expected_selling_price: form.expected ? Number(form.expected) : null,
            created_by: userData.user?.id,
          })
          .select("id")
          .single();
        if (error) throw error;
        await supabase.from("inventory").insert({ product_id: created.id });
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
          <div className="space-y-1.5">
            <Label>{t("products.sku")} *</Label>
            <Input required dir="ltr" value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label>{t("products.brand")}</Label>
            <Input value={form.brand} onChange={(e) => setForm({ ...form, brand: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label>{t("common.name")} (EN) *</Label>
            <Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label>{t("common.name")} (ع)</Label>
            <Input dir="rtl" value={form.name_ar} onChange={(e) => setForm({ ...form, name_ar: e.target.value })} />
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
            <Label>{t("products.images")}</Label>
            <label className="flex h-10 cursor-pointer items-center gap-2 rounded-md border border-dashed px-3 text-sm text-muted-foreground hover:bg-accent">
              <Upload className="size-4" />
              <span className="truncate">{file ? file.name : (isEdit ? t("common.edit") : t("products.images"))}</span>
              <input type="file" accept="image/*" className="hidden" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            </label>
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

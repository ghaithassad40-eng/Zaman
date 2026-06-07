"use client";

import { useMemo, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { Search, Watch, X, Send, Loader2, Phone } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useI18n } from "@/lib/i18n/provider";
import type { DictKey } from "@/lib/i18n/dictionaries";
import { Brand } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatJOD } from "@/lib/utils";
type ShopProduct = {
  id: string;
  name: string;
  name_ar: string | null;
  brand: string | null;
  model: string | null;
  color: string;
  gender: string | null;
  watch_type: string | null;
  image_urls: string[];
  default_selling_price: number | null;
  expected_selling_price: number | null;
  description: string | null;
  inventory: { qty_on_hand: number } | null;
};

export default function ShopPage() {
  const { t, locale } = useI18n();
  const supabase = createClient();

  const [q, setQ] = useState("");
  const [gender, setGender] = useState("");
  const [watchType, setWatchType] = useState("");
  const [color, setColor] = useState("");
  const [requested, setRequested] = useState<ShopProduct | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["shop-products"],
    queryFn: async (): Promise<ShopProduct[]> => {
      const { data, error } = await supabase
        .from("products")
        .select("id, name, name_ar, brand, model, color, gender, watch_type, image_urls, default_selling_price, expected_selling_price, description, inventory(qty_on_hand)")
        .eq("is_active", true)
        .is("deleted_at", null)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return ((data ?? []) as unknown as ShopProduct[]).filter((p) => (p.inventory?.qty_on_hand ?? 0) > 0);
    },
  });

  const filtered = useMemo(() => {
    if (!data) return [];
    const needle = q.trim().toLowerCase();
    return data.filter((p) => {
      if (gender && (p.gender ?? "").toLowerCase() !== gender) return false;
      if (watchType && (p.watch_type ?? "") !== watchType) return false;
      if (color && (p.color ?? "").toLowerCase() !== color.toLowerCase()) return false;
      if (needle) {
        const hay = [p.name, p.name_ar, p.brand, p.model, p.color].filter(Boolean).join(" ").toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
  }, [data, q, gender, watchType, color]);

  const colors = useMemo(() => {
    const set = new Set<string>();
    (data ?? []).forEach((p) => p.color && set.add(p.color));
    return Array.from(set).sort();
  }, [data]);

  const clearFilters = () => { setQ(""); setGender(""); setWatchType(""); setColor(""); };
  const hasFilters = q || gender || watchType || color;

  return (
    <>
      {/* Header */}
      <header className="sticky top-0 z-10 border-b bg-background/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <Brand />
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        {/* Hero */}
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold sm:text-4xl">{t("shop.heroTitle")}</h1>
          <p className="mt-2 text-sm text-muted-foreground sm:text-base">{t("shop.heroSubtitle")}</p>
        </div>

        {/* Filters */}
        <Card className="mb-6">
          <CardContent className="grid gap-3 p-4 sm:grid-cols-4">
            <div className="relative">
              <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input className="ps-9" placeholder={t("shop.searchPlaceholder")} value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
            <Select value={gender} onChange={(e) => setGender(e.target.value)}>
              <option value="">{t("shop.allGenders")}</option>
              <option value="men">{t("shop.men")}</option>
              <option value="women">{t("shop.women")}</option>
              <option value="unisex">{t("shop.unisex")}</option>
            </Select>
            <Select value={watchType} onChange={(e) => setWatchType(e.target.value)}>
              <option value="">{t("shop.allTypes")}</option>
              <option value="battery">{t("shop.battery")}</option>
              <option value="automatic">{t("shop.automatic")}</option>
              <option value="smartwatch">{t("shop.smartwatch")}</option>
              <option value="other">{t("shop.otherType")}</option>
            </Select>
            <Select value={color} onChange={(e) => setColor(e.target.value)}>
              <option value="">{t("shop.allColors")}</option>
              {colors.map((c) => <option key={c} value={c}>{c}</option>)}
            </Select>
          </CardContent>
        </Card>

        {hasFilters && (
          <div className="mb-4 flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">{t("shop.resultsCount").replace("{n}", String(filtered.length))}</span>
            <Button variant="ghost" size="sm" onClick={clearFilters}>
              <X className="size-4" /> {t("shop.clearFilters")}
            </Button>
          </div>
        )}

        {/* Grid */}
        {isLoading ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-72" />)}
          </div>
        ) : filtered.length > 0 ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {filtered.map((p) => {
              const img = p.image_urls?.[0];
              const price = p.default_selling_price ?? p.expected_selling_price ?? null;
              const displayName = locale === "ar" && p.name_ar ? p.name_ar : p.name;
              return (
                <Card key={p.id} className="overflow-hidden transition-shadow hover:shadow-lg">
                  <div className="relative aspect-square w-full bg-muted">
                    {img ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={img} alt={p.name} className="size-full object-cover" referrerPolicy="no-referrer" />
                    ) : (
                      <div className="flex size-full items-center justify-center text-muted-foreground">
                        <Watch className="size-16" />
                      </div>
                    )}
                  </div>
                  <CardContent className="space-y-2 p-4">
                    <div>
                      <div className="line-clamp-2 font-medium" title={displayName}>{displayName}</div>
                      {(p.brand || p.model) && (
                        <div className="text-xs text-muted-foreground">{[p.brand, p.model].filter(Boolean).join(" · ")}</div>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {p.watch_type && <Badge variant="secondary" className="text-[10px]">{t(`shop.${p.watch_type}` as DictKey)}</Badge>}
                      {p.gender && <Badge variant="outline" className="text-[10px]">{t(`shop.${p.gender}` as DictKey)}</Badge>}
                      {p.color && <Badge variant="outline" className="text-[10px]">{p.color}</Badge>}
                    </div>
                    <div className="flex items-end justify-between pt-1">
                      <div>
                        {price != null ? (
                          <div className="text-lg font-bold text-primary">{formatJOD(price, locale)}</div>
                        ) : (
                          <div className="text-sm text-muted-foreground">{t("shop.contactForPrice")}</div>
                        )}
                      </div>
                      <Button size="sm" onClick={() => setRequested(p)}>
                        <Send className="size-3.5" /> {t("shop.request")}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed p-12 text-center">
            <Watch className="size-12 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">{t("shop.noResults")}</p>
            {hasFilters && (
              <Button variant="outline" onClick={clearFilters}>
                <X className="size-4" /> {t("shop.clearFilters")}
              </Button>
            )}
          </div>
        )}
      </main>

      <footer className="mt-12 border-t bg-card">
        <div className="mx-auto max-w-7xl px-4 py-6 text-center text-xs text-muted-foreground sm:px-6">
          <Phone className="me-1 inline size-3" /> {t("shop.footerContact")}
        </div>
      </footer>

      <RequestDialog product={requested} onClose={() => setRequested(null)} />
    </>
  );
}

function RequestDialog({ product, onClose }: { product: ShopProduct | null; onClose: () => void }) {
  const { t, locale } = useI18n();
  const supabase = createClient();
  const [form, setForm] = useState({ name: "", phone: "", email: "", address: "", notes: "" });

  const submit = useMutation({
    mutationFn: async () => {
      if (!product) return;
      const { error } = await supabase.from("product_requests").insert({
        product_id: product.id,
        product_name_snapshot: product.name,
        customer_name: form.name.trim(),
        customer_phone: form.phone.trim(),
        customer_email: form.email.trim() || null,
        customer_address: form.address.trim() || null,
        notes: form.notes.trim() || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(t("shop.requestSent"));
      setForm({ name: "", phone: "", email: "", address: "", notes: "" });
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={!!product} onOpenChange={(o) => !o && onClose()}>
      <DialogContent onClose={onClose}>
        <DialogHeader>
          <DialogTitle>{t("shop.requestTitle")}</DialogTitle>
        </DialogHeader>
        {product && (
          <form onSubmit={(e) => { e.preventDefault(); submit.mutate(); }} className="grid grid-cols-2 gap-4">
            <div className="col-span-2 rounded-md border bg-muted/40 p-3">
              <div className="font-medium">{locale === "ar" && product.name_ar ? product.name_ar : product.name}</div>
              {(product.default_selling_price ?? product.expected_selling_price) != null && (
                <div className="mt-0.5 text-sm text-primary">{formatJOD(product.default_selling_price ?? product.expected_selling_price!, locale)}</div>
              )}
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label>{t("shop.yourName")} *</Label>
              <Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>{t("shop.phone")} *</Label>
              <Input required type="tel" dir="ltr" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="07XXXXXXXX" />
            </div>
            <div className="space-y-1.5">
              <Label>{t("shop.email")}</Label>
              <Input type="email" dir="ltr" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label>{t("shop.address")}</Label>
              <Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label>{t("shop.notes")}</Label>
              <Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder={t("shop.notesPlaceholder")} />
            </div>
            <div className="col-span-2 flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={onClose}>{t("common.cancel")}</Button>
              <Button type="submit" disabled={submit.isPending}>
                {submit.isPending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
                {t("shop.sendRequest")}
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

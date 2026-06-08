"use client";

import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Search, Watch, X, Send, Loader2, Phone, MessageCircle, Star, MessageSquare } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useI18n } from "@/lib/i18n/provider";
import type { DictKey } from "@/lib/i18n/dictionaries";
import { Brand } from "@/components/brand";
import { LanguageToggle } from "@/components/language-toggle";
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
  /** Computed: on_hand minus the qty already in pending requests. */
  available: number;
};

type ProductReview = {
  id: string;
  product_id: string | null;
  customer_name: string;
  rating: number;
  comment: string | null;
  created_at: string;
};

type CompanyContact = {
  name: string | null;
  name_ar: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  address_ar: string | null;
  instagram_handle: string | null;
  whatsapp_number: string | null;
  facebook_url: string | null;
  tiktok_url: string | null;
};

export default function ShopPage() {
  const { t, locale } = useI18n();
  const supabase = createClient();

  const [q, setQ] = useState("");
  const [gender, setGender] = useState("");
  const [watchType, setWatchType] = useState("");
  const [color, setColor] = useState("");
  const [requested, setRequested] = useState<ShopProduct | null>(null);
  const [reviewing, setReviewing] = useState<ShopProduct | null>(null);
  const [readingReviews, setReadingReviews] = useState<ShopProduct | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["shop-products"],
    queryFn: async (): Promise<ShopProduct[]> => {
      // Pull products + availability map in parallel. The view computes
      // available = on_hand − sum(pending request qty).
      // Anon no longer has direct SELECT on the inventory table (cost basis
      // protection). Read availability from the v_shop_availability view,
      // which only exposes (product_id, on_hand, reserved, available).
      const [prodRes, availRes] = await Promise.all([
        supabase
          .from("products")
          .select("id, name, name_ar, brand, model, color, gender, watch_type, image_urls, default_selling_price, expected_selling_price, description")
          .eq("is_active", true)
          .eq("visible_on_shop", true)
          .is("deleted_at", null)
          .order("created_at", { ascending: false }),
        supabase.from("v_shop_availability").select("product_id, on_hand, available"),
      ]);
      if (prodRes.error) throw prodRes.error;
      const availMap = new Map<string, { on_hand: number; available: number }>();
      for (const r of availRes.data ?? []) {
        if (r.product_id) availMap.set(r.product_id, {
          on_hand: Number(r.on_hand ?? 0),
          available: Number(r.available ?? 0),
        });
      }
      const rows = (prodRes.data ?? []).map((p) => ({
        ...p,
        inventory: { qty_on_hand: availMap.get(p.id)?.on_hand ?? 0 },
      })) as unknown as ShopProduct[];
      // Drop fully reserved / out-of-stock items from the grid.
      return rows
        .map((p) => ({ ...p, available: availMap.get(p.id)?.available ?? 0 }))
        .filter((p) => p.available > 0);
    },
    // Refetch when window regains focus so a customer sees up-to-date
    // availability if they switched tabs while someone else was buying.
    refetchOnWindowFocus: true,
  });

  const { data: company } = useQuery({
    queryKey: ["shop-company"],
    queryFn: async (): Promise<CompanyContact | null> => {
      const { data } = await supabase
        .from("company_settings")
        .select("name, name_ar, phone, email, address, address_ar, instagram_handle, whatsapp_number, facebook_url, tiktok_url")
        .limit(1)
        .maybeSingle();
      return data as CompanyContact | null;
    },
  });

  // All approved reviews — let the UI bucket per-product. Anon RLS already
  // filters to status=approved.
  const { data: reviews } = useQuery({
    queryKey: ["shop-reviews"],
    queryFn: async (): Promise<ProductReview[]> => {
      const { data } = await supabase
        .from("product_reviews")
        .select("id, product_id, customer_name, rating, comment, created_at")
        .eq("status", "approved")
        .order("created_at", { ascending: false });
      return (data ?? []) as ProductReview[];
    },
  });

  const reviewByProduct = useMemo(() => {
    const map = new Map<string, { count: number; avg: number; rows: ProductReview[] }>();
    for (const r of reviews ?? []) {
      if (!r.product_id) continue;
      const cur = map.get(r.product_id) ?? { count: 0, avg: 0, rows: [] };
      cur.count += 1;
      cur.avg = ((cur.avg * (cur.count - 1)) + r.rating) / cur.count;
      cur.rows.push(r);
      map.set(r.product_id, cur);
    }
    return map;
  }, [reviews]);

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

  const phoneClean = (company?.phone ?? "").replace(/[^\d+]/g, "");
  const waNumber = ((company?.whatsapp_number ?? "") || phoneClean).replace(/[^\d+]/g, "").replace(/^\+/, "");
  const ig = (company?.instagram_handle ?? "").replace(/^@+/, "");

  return (
    <>
      {/* Header */}
      <header className="sticky top-0 z-10 border-b bg-background/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <Brand />
          <div className="flex items-center gap-1.5">
            {/* Contact quick actions */}
            {phoneClean && (
              <a href={`tel:${phoneClean}`} className="hidden items-center gap-1 rounded-md px-2 py-1.5 text-sm text-foreground/80 hover:bg-accent sm:inline-flex" dir="ltr">
                <Phone className="size-4" /> {company?.phone}
              </a>
            )}
            {waNumber && (
              <a href={`https://wa.me/${waNumber}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-md px-2 py-1.5 text-sm text-success hover:bg-accent">
                <MessageCircle className="size-4" />
                <span className="hidden sm:inline">{t("shop.whatsapp")}</span>
              </a>
            )}
            <LanguageToggle />
          </div>
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
              const stats = reviewByProduct.get(p.id);
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
                    {/* Stock-low badge — for the urgency of "only 1 left" */}
                    {p.available <= 2 && (
                      <Badge
                        variant={p.available === 1 ? "destructive" : "warning"}
                        className="absolute end-2 top-2 text-[10px]"
                      >
                        {p.available === 1 ? t("shop.lastOne") : t("shop.fewLeft").replace("{n}", String(p.available))}
                      </Badge>
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
                      {p.watch_type && <Badge variant="secondary" className="text-[10px]">{t(`shop.${p.watch_type.toLowerCase()}` as DictKey)}</Badge>}
                      {p.gender && <Badge variant="outline" className="text-[10px]">{t(`shop.${p.gender.toLowerCase()}` as DictKey)}</Badge>}
                      {p.color && <Badge variant="outline" className="text-[10px]">{p.color}</Badge>}
                    </div>
                    {/* Star summary */}
                    <button
                      className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                      onClick={() => setReadingReviews(p)}
                      disabled={!stats?.count}
                    >
                      <Stars value={stats?.avg ?? 0} />
                      {stats?.count
                        ? <span>{stats.avg.toFixed(1)} · {stats.count} {t("shop.reviewsCount")}</span>
                        : <span>{t("shop.noReviewsYet")}</span>}
                    </button>
                    <div className="flex items-end justify-between pt-1">
                      <div>
                        {price != null ? (
                          <div className="text-lg font-bold text-primary">{formatJOD(price, locale)}</div>
                        ) : (
                          <div className="text-sm text-muted-foreground">{t("shop.contactForPrice")}</div>
                        )}
                      </div>
                      <div className="flex gap-1">
                        <Button size="sm" variant="ghost" onClick={() => setReviewing(p)} title={t("shop.writeReview")}>
                          <MessageSquare className="size-3.5" />
                        </Button>
                        <Button size="sm" onClick={() => setRequested(p)}>
                          <Send className="size-3.5" /> {t("shop.request")}
                        </Button>
                      </div>
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
        <div className="mx-auto grid max-w-7xl gap-6 px-4 py-8 sm:grid-cols-3 sm:px-6">
          <div>
            <div className="font-bold text-primary">{locale === "ar" && company?.name_ar ? company.name_ar : (company?.name ?? "Zaman Watch")}</div>
            {(locale === "ar" ? company?.address_ar : company?.address) && (
              <div className="mt-1 text-xs text-muted-foreground">{locale === "ar" ? company?.address_ar : company?.address}</div>
            )}
          </div>
          <div className="space-y-1 text-xs">
            <div className="mb-1 font-semibold uppercase text-muted-foreground">{t("shop.contact")}</div>
            {company?.phone && (
              <a href={`tel:${phoneClean}`} className="flex items-center gap-2 hover:text-primary" dir="ltr">
                <Phone className="size-3.5" /> {company.phone}
              </a>
            )}
            {waNumber && (
              <a href={`https://wa.me/${waNumber}`} target="_blank" rel="noreferrer" className="flex items-center gap-2 hover:text-primary">
                <MessageCircle className="size-3.5" /> {t("shop.whatsappFull")}
              </a>
            )}
            {company?.email && (
              <a href={`mailto:${company.email}`} className="flex items-center gap-2 hover:text-primary" dir="ltr">
                ✉ {company.email}
              </a>
            )}
          </div>
          <div className="space-y-1 text-xs">
            <div className="mb-1 font-semibold uppercase text-muted-foreground">{t("shop.followUs")}</div>
            {ig && (
              <a href={`https://instagram.com/${ig}`} target="_blank" rel="noreferrer" className="flex items-center gap-2 hover:text-primary">
                <span className="font-bold">IG</span> @{ig}
              </a>
            )}
            {company?.facebook_url && (
              <a href={company.facebook_url} target="_blank" rel="noreferrer" className="flex items-center gap-2 hover:text-primary">
                <span className="font-bold">f</span> Facebook
              </a>
            )}
            {company?.tiktok_url && (
              <a href={company.tiktok_url} target="_blank" rel="noreferrer" className="flex items-center gap-2 hover:text-primary">
                <span className="text-sm leading-none">♪</span> TikTok
              </a>
            )}
          </div>
        </div>
        <div className="border-t bg-background/50">
          <div className="mx-auto max-w-7xl px-4 py-4 text-center text-[11px] text-muted-foreground sm:px-6">
            © {new Date().getFullYear()} {locale === "ar" && company?.name_ar ? company.name_ar : (company?.name ?? "Zaman Watch")}
          </div>
        </div>
      </footer>

      <RequestDialog product={requested} onClose={() => setRequested(null)} />
      <ReviewDialog product={reviewing} onClose={() => setReviewing(null)} />
      <ReadReviewsDialog product={readingReviews} reviews={readingReviews ? reviewByProduct.get(readingReviews.id)?.rows ?? [] : []} onClose={() => setReadingReviews(null)} />
    </>
  );
}

function Stars({ value }: { value: number }) {
  const full = Math.round(value);
  return (
    <span className="inline-flex items-center" dir="ltr">
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          className={"size-3.5 " + (i <= full ? "fill-amber-400 text-amber-400" : "text-muted-foreground/40")}
        />
      ))}
    </span>
  );
}

function RequestDialog({ product, onClose }: { product: ShopProduct | null; onClose: () => void }) {
  const { t, locale } = useI18n();
  const supabase = createClient();
  const qc = useQueryClient();
  const [form, setForm] = useState({ qty: 1, name: "", phone: "", email: "", address: "", notes: "" });
  const max = product?.available ?? 1;

  // Reset qty whenever product changes
  if (product && form.qty > max) {
    setForm((f) => ({ ...f, qty: max }));
  }

  const submit = useMutation({
    mutationFn: async () => {
      if (!product) return;
      const { error } = await supabase.rpc("submit_product_request", {
        p_product_id: product.id,
        p_qty: form.qty,
        p_name: form.name.trim(),
        p_phone: form.phone.trim(),
        p_email: form.email.trim() || undefined,
        p_address: form.address.trim() || undefined,
        p_notes: form.notes.trim() || undefined,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(t("shop.requestSent"));
      // Refresh availability so other open tabs see the new reserved qty
      qc.invalidateQueries({ queryKey: ["shop-products"] });
      setForm({ qty: 1, name: "", phone: "", email: "", address: "", notes: "" });
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
              <div className="mt-0.5 flex items-center justify-between text-sm">
                {(product.default_selling_price ?? product.expected_selling_price) != null && (
                  <div className="text-primary">{formatJOD(product.default_selling_price ?? product.expected_selling_price!, locale)}</div>
                )}
                <div className={"text-xs " + (max <= 2 ? "font-medium text-amber-700" : "text-muted-foreground")}>
                  {t("shop.availableNow").replace("{n}", String(max))}
                </div>
              </div>
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label>{t("shop.qty")} *</Label>
              <div className="flex items-center gap-2">
                <Button
                  type="button" variant="outline" size="sm"
                  onClick={() => setForm({ ...form, qty: Math.max(1, form.qty - 1) })}
                  disabled={form.qty <= 1}
                  aria-label={t("shop.qtyMinus")}
                >−</Button>
                <Input
                  type="number" min={1} max={max} dir="ltr"
                  value={form.qty}
                  onChange={(e) => {
                    const n = Math.max(1, Math.min(max, Number(e.target.value) || 1));
                    setForm({ ...form, qty: n });
                  }}
                  className="w-20 text-center"
                />
                <Button
                  type="button" variant="outline" size="sm"
                  onClick={() => setForm({ ...form, qty: Math.min(max, form.qty + 1) })}
                  disabled={form.qty >= max}
                  aria-label={t("shop.qtyPlus")}
                >+</Button>
                <span className="text-xs text-muted-foreground">
                  {t("shop.maxIs").replace("{n}", String(max))}
                </span>
              </div>
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

function ReviewDialog({ product, onClose }: { product: ShopProduct | null; onClose: () => void }) {
  const { t, locale } = useI18n();
  const supabase = createClient();
  const qc = useQueryClient();
  const [form, setForm] = useState({ name: "", rating: 5, comment: "" });

  const submit = useMutation({
    mutationFn: async () => {
      if (!product) return;
      const { error } = await supabase.from("product_reviews").insert({
        product_id: product.id,
        customer_name: form.name.trim(),
        rating: form.rating,
        comment: form.comment.trim() || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(t("shop.reviewSubmitted"));
      qc.invalidateQueries({ queryKey: ["shop-reviews"] });
      setForm({ name: "", rating: 5, comment: "" });
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={!!product} onOpenChange={(o) => !o && onClose()}>
      <DialogContent onClose={onClose}>
        <DialogHeader>
          <DialogTitle>{t("shop.writeReviewTitle")}</DialogTitle>
        </DialogHeader>
        {product && (
          <form onSubmit={(e) => { e.preventDefault(); submit.mutate(); }} className="space-y-4">
            <div className="rounded-md border bg-muted/40 p-3 text-sm">
              <div className="font-medium">{locale === "ar" && product.name_ar ? product.name_ar : product.name}</div>
            </div>
            <p className="rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900">
              {t("shop.reviewModerated")}
            </p>
            <div className="space-y-1.5">
              <Label>{t("shop.rating")} *</Label>
              <div className="flex items-center gap-1" dir="ltr">
                {[1, 2, 3, 4, 5].map((i) => (
                  <button
                    type="button"
                    key={i}
                    onClick={() => setForm({ ...form, rating: i })}
                    className="p-0.5"
                  >
                    <Star className={"size-7 " + (i <= form.rating ? "fill-amber-400 text-amber-400" : "text-muted-foreground/40 hover:text-amber-300")} />
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>{t("shop.yourName")} *</Label>
              <Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>{t("shop.reviewComment")}</Label>
              <textarea
                value={form.comment}
                onChange={(e) => setForm({ ...form, comment: e.target.value })}
                rows={4}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-xs ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                placeholder={t("shop.reviewCommentPh")}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={onClose}>{t("common.cancel")}</Button>
              <Button type="submit" disabled={submit.isPending}>
                {submit.isPending ? <Loader2 className="size-4 animate-spin" /> : <Star className="size-4" />}
                {t("shop.submitReview")}
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

function ReadReviewsDialog({ product, reviews, onClose }: { product: ShopProduct | null; reviews: ProductReview[]; onClose: () => void }) {
  const { t, locale } = useI18n();
  return (
    <Dialog open={!!product} onOpenChange={(o) => !o && onClose()}>
      <DialogContent onClose={onClose}>
        <DialogHeader>
          <DialogTitle>
            {t("shop.reviewsFor")} · {product ? (locale === "ar" && product.name_ar ? product.name_ar : product.name) : ""}
          </DialogTitle>
        </DialogHeader>
        <div className="max-h-[60vh] space-y-3 overflow-y-auto">
          {reviews.length === 0 && (
            <p className="text-center text-sm text-muted-foreground">{t("shop.noReviewsYet")}</p>
          )}
          {reviews.map((r) => (
            <div key={r.id} className="rounded-md border p-3">
              <div className="flex items-center justify-between">
                <div className="font-medium">{r.customer_name}</div>
                <Stars value={r.rating} />
              </div>
              {r.comment && <p className="mt-1 text-sm text-muted-foreground">{r.comment}</p>}
              <div className="mt-1 text-[10px] text-muted-foreground">{r.created_at.slice(0, 10)}</div>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

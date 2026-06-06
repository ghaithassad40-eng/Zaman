"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Plus, Minus, Trash2, Watch, Loader2, Search, Box, ArrowLeft, ArrowRight,
  ShoppingCart, Settings2,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useI18n } from "@/lib/i18n/provider";
import { useCompanySettings, useCustomers, useSellableProducts, type SellableProduct } from "@/lib/hooks";
import { PageHeader } from "@/components/page-header";
import { Stepper } from "@/components/stepper";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatJOD, round3 } from "@/lib/utils";

type CartLine = { product: SellableProduct; qty: number; unitPrice: number };
type PackAsset = {
  id: string; name: string; name_ar: string | null; kind: "consumable" | "equipment";
  category: string | null; purchase_cost: number | string; qty_purchased: number;
  expected_uses: number | null; qty_remaining: number | null;
};

function packUnit(a: PackAsset): number {
  if (a.kind === "consumable" && a.qty_purchased > 0) return round3(Number(a.purchase_cost) / a.qty_purchased);
  if (a.kind === "equipment" && a.expected_uses && a.expected_uses > 0) return round3(Number(a.purchase_cost) / a.expected_uses);
  return 0;
}

export default function SellPage() {
  const { t, locale } = useI18n();
  const router = useRouter();
  const supabase = createClient();
  const qc = useQueryClient();

  const { data: products, isLoading } = useSellableProducts();
  const { data: customers } = useCustomers();
  const { data: settings } = useCompanySettings();

  const { data: assets, refetch: refetchAssets } = useQuery({
    queryKey: ["sell-pack-assets"],
    queryFn: async (): Promise<PackAsset[]> => {
      const { data } = await supabase
        .from("packaging_assets")
        .select("id, name, name_ar, kind, category, purchase_cost, qty_purchased, expected_uses, qty_remaining")
        .eq("is_active", true).is("deleted_at", null).order("kind").order("created_at");
      return (data ?? []) as PackAsset[];
    },
  });
  const assetById = useMemo(() => new Map((assets ?? []).map((a) => [a.id, a])), [assets]);

  const gstRate = Number(settings?.gst_rate ?? 16);
  const defaultDelivery = Number(settings?.default_delivery_fee ?? 2);

  const [step, setStep] = useState(0);
  const [search, setSearch] = useState("");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [customerId, setCustomerId] = useState("");
  const [newCustomer, setNewCustomer] = useState({ first_name: "", last_name: "", phone: "", instagram: "", address: "", city: "" });
  const [discount, setDiscount] = useState("0");
  const [deliveryFee, setDeliveryFee] = useState(String(defaultDelivery));
  const [deliveryBilled, setDeliveryBilled] = useState(String(defaultDelivery));
  const [packQty, setPackQty] = useState<Record<string, number>>({});
  const [packSeeded, setPackSeeded] = useState(false);

  // Seed default packaging (1 of each consumable) once assets load.
  if (assets && !packSeeded) {
    setPackSeeded(true);
    const init: Record<string, number> = {};
    for (const a of assets) init[a.id] = a.kind === "consumable" ? 1 : 0;
    setPackQty(init);
  }

  const steps = [t("sell.stepProducts"), t("sell.stepPrice"), t("sell.stepPack")];

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (products ?? []).filter((p) => !q || p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q) || (p.name_ar ?? "").includes(q));
  }, [products, search]);

  function addToCart(p: SellableProduct) {
    const stock = p.inventory?.qty_on_hand ?? 1;
    setCart((prev) => {
      const ex = prev.find((l) => l.product.id === p.id);
      if (ex) return prev.map((l) => (l.product.id === p.id ? { ...l, qty: Math.min(stock, l.qty + 1) } : l));
      return [...prev, { product: p, qty: 1, unitPrice: Number(p.default_selling_price ?? 0) }];
    });
  }
  const updateLine = (id: string, patch: Partial<CartLine>) => setCart((p) => p.map((l) => (l.product.id === id ? { ...l, ...patch } : l)));
  const removeLine = (id: string) => setCart((p) => p.filter((l) => l.product.id !== id));

  const subtotal = round3(cart.reduce((s, l) => s + l.qty * l.unitPrice, 0));
  const disc = round3(Number(discount) || 0);
  const taxable = Math.max(0, round3(subtotal - disc));
  const gst = round3((taxable * gstRate) / 100);
  const billedDelivery = round3(Number(deliveryBilled) || 0);
  const total = round3(taxable + gst + billedDelivery);
  const estCogs = round3(cart.reduce((s, l) => s + l.qty * Number(l.product.inventory?.avg_unit_cost ?? 0), 0));
  const packCost = round3(Object.entries(packQty).reduce((s, [id, q]) => {
    const a = assetById.get(id); return a ? s + packUnit(a) * q : s;
  }, 0));
  const estProfit = round3(subtotal - disc - estCogs - packCost);

  const customerName = `${newCustomer.first_name.trim()} ${newCustomer.last_name.trim()}`.trim();

  // Commit the order: create + confirm + pack + invoice, in that order.
  const commit = useMutation({
    mutationFn: async () => {
      if (cart.length === 0) throw new Error("No products selected");
      let custId: string | null = customerId || null;
      if (!custId && customerName) {
        const { data: c, error } = await supabase.from("customers").insert({
          first_name: newCustomer.first_name.trim() || null,
          last_name: newCustomer.last_name.trim() || null,
          name: customerName,
          phone: newCustomer.phone.trim() || null,
          instagram_handle: newCustomer.instagram.trim() || null,
          address: newCustomer.address.trim() || null,
          city: newCustomer.city.trim() || null,
        }).select("id").single();
        if (error) throw error;
        custId = c.id;
      }
      const { data: userData } = await supabase.auth.getUser();
      const { data: partner } = await supabase.from("partners").select("id").eq("user_id", userData.user?.id ?? "").maybeSingle();
      const { data: saleNo, error: noErr } = await supabase.rpc("next_doc_no", { p_type: "sale" });
      if (noErr) throw noErr;

      const { data: saleRow, error: saleErr } = await supabase.from("sales").insert({
        sale_no: saleNo as string, customer_id: custId, sold_by: partner?.id ?? null,
        status: "draft", payment_status: "paid", subtotal, discount: disc,
        delivery_fee: round3(Number(deliveryFee) || 0), delivery_billed: billedDelivery,
        gst_rate: gstRate, gst_amount: gst, total, created_by: userData.user?.id,
      }).select("id").single();
      if (saleErr) throw saleErr;

      const items = cart.map((l) => ({
        sale_id: saleRow.id, product_id: l.product.id, description: l.product.name,
        qty: l.qty, unit_price: l.unitPrice, line_total: round3(l.qty * l.unitPrice),
      }));
      const { error: itemsErr } = await supabase.from("sale_items").insert(items);
      if (itemsErr) throw itemsErr;

      const { error: confErr } = await supabase.rpc("confirm_sale", { p_sale_id: saleRow.id });
      if (confErr) {
        await supabase.from("sale_items").delete().eq("sale_id", saleRow.id);
        await supabase.from("sales").delete().eq("id", saleRow.id);
        throw confErr;
      }

      // Packaging — applied within the sale process (Prepare: Product & Packages).
      const packItems = Object.entries(packQty).filter(([, q]) => q > 0).map(([asset_id, qty]) => ({ asset_id, qty }));
      if (packItems.length) {
        const { error: packErr } = await supabase.rpc("pack_sale", { p_sale_id: saleRow.id, p_items: packItems });
        if (packErr) throw packErr;
      }
      return saleRow.id;
    },
    onSuccess: () => {
      toast.success(t("sell.orderCreated"));
      qc.invalidateQueries();
      router.push("/sales");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <>
      <PageHeader title={t("sell.title")} />

      <div className="mx-auto mb-6 max-w-3xl">
        <Stepper steps={steps} current={step} />
      </div>

      <div className="mx-auto max-w-4xl">
        {/* STEP 0 — Products */}
        {step === 0 && (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
            <div className="lg:col-span-3">
              <div className="relative mb-4">
                <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input className="ps-9" placeholder={t("common.search")} value={search} onChange={(e) => setSearch(e.target.value)} />
              </div>
              {isLoading ? (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {Array.from({ length: 6 }).map((_, i) => <Card key={i}><CardContent className="h-36 p-4" /></Card>)}
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {filtered.map((p) => {
                    const stock = p.inventory?.qty_on_hand ?? 0;
                    const out = stock <= 0;
                    return (
                      <button key={p.id} disabled={out} onClick={() => addToCart(p)}
                        className="group flex flex-col overflow-hidden rounded-lg border bg-card text-start shadow-sm transition hover:border-primary/40 hover:shadow disabled:opacity-50">
                        <div className="flex aspect-square items-center justify-center overflow-hidden bg-muted">
                          {p.image_urls?.[0] ? (
                            <Image src={p.image_urls[0]} alt={p.name} width={160} height={160} className="size-full object-cover transition group-hover:scale-105" unoptimized />
                          ) : <Watch className="size-8 text-muted-foreground" />}
                        </div>
                        <div className="flex flex-1 flex-col gap-1 p-2.5">
                          <div className="line-clamp-2 text-sm font-medium leading-snug">{locale === "ar" && p.name_ar ? p.name_ar : p.name}</div>
                          <div className="mt-auto flex items-center justify-between">
                            <span className="text-sm font-semibold text-primary">{formatJOD(p.default_selling_price ?? 0, locale)}</span>
                            <Badge variant={out ? "destructive" : "success"}>{out ? t("sell.outOfStock") : stock}</Badge>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
            <div className="lg:col-span-2">
              <Card className="lg:sticky lg:top-20">
                <CardContent className="space-y-3 p-5">
                  <div className="flex items-center gap-2 font-semibold"><ShoppingCart className="size-4" /> {t("sell.cart")}</div>
                  {cart.length === 0 ? (
                    <p className="py-6 text-center text-sm text-muted-foreground">{t("sell.pickProduct")}</p>
                  ) : cart.map((l) => (
                    <div key={l.product.id} className="flex items-center justify-between gap-2 rounded-md border p-2.5 text-sm">
                      <span className="min-w-0 flex-1 truncate font-medium">{l.product.name}</span>
                      <div className="flex items-center rounded-md border">
                        <button className="px-2 py-1 hover:bg-accent" onClick={() => updateLine(l.product.id, { qty: Math.max(1, l.qty - 1) })}><Minus className="size-3.5" /></button>
                        <span className="w-7 text-center">{l.qty}</span>
                        <button className="px-2 py-1 hover:bg-accent" onClick={() => updateLine(l.product.id, { qty: Math.min(l.product.inventory?.qty_on_hand ?? 1, l.qty + 1) })}><Plus className="size-3.5" /></button>
                      </div>
                      <button onClick={() => removeLine(l.product.id)} className="text-muted-foreground hover:text-destructive"><Trash2 className="size-4" /></button>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>
          </div>
        )}

        {/* STEP 1 — Price & customer */}
        {step === 1 && (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
            <Card className="lg:col-span-3">
              <CardContent className="space-y-3 p-5">
                <div className="font-semibold">{t("sell.stepPrice")}</div>
                {cart.map((l) => (
                  <div key={l.product.id} className="flex items-center justify-between gap-3 rounded-md border p-3">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium">{l.product.name}</div>
                      <div className="text-xs text-muted-foreground">× {l.qty}</div>
                    </div>
                    <div className="flex items-center gap-1">
                      <Input type="number" step="0.001" dir="ltr" className="h-9 w-28" value={l.unitPrice}
                        onChange={(e) => updateLine(l.product.id, { unitPrice: Number(e.target.value) })} aria-label={t("sell.sellingPrice")} />
                      <span className="text-xs text-muted-foreground">JOD</span>
                    </div>
                  </div>
                ))}
                <div className="grid grid-cols-2 gap-2 border-t pt-3">
                  <div className="space-y-1"><Label className="text-xs">{t("common.discount")}</Label>
                    <Input type="number" step="0.001" dir="ltr" className="h-9" value={discount} onChange={(e) => setDiscount(e.target.value)} /></div>
                  <div className="space-y-1"><Label className="text-xs">{t("sell.deliveryBilled")}</Label>
                    <Input type="number" step="0.001" dir="ltr" className="h-9" value={deliveryBilled} onChange={(e) => setDeliveryBilled(e.target.value)} /></div>
                  <div className="col-span-2 space-y-1"><Label className="text-xs">{t("sell.delivery")}</Label>
                    <Input type="number" step="0.001" dir="ltr" className="h-9" value={deliveryFee} onChange={(e) => setDeliveryFee(e.target.value)} /></div>
                </div>
              </CardContent>
            </Card>
            <Card className="lg:col-span-2 h-fit">
              <CardContent className="space-y-3 p-5">
                <div className="space-y-1.5">
                  <Label>{t("sell.customer")}</Label>
                  <Select value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
                    <option value="">{t("sell.newCustomer")}</option>
                    {(customers ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}{c.phone ? ` · ${c.phone}` : ""}</option>)}
                  </Select>
                  {!customerId && (
                    <div className="grid grid-cols-2 gap-2 pt-1">
                      <Input placeholder={t("common.firstName")} value={newCustomer.first_name} onChange={(e) => setNewCustomer({ ...newCustomer, first_name: e.target.value })} />
                      <Input placeholder={t("common.lastName")} value={newCustomer.last_name} onChange={(e) => setNewCustomer({ ...newCustomer, last_name: e.target.value })} />
                      <Input placeholder={t("common.phone")} dir="ltr" value={newCustomer.phone} onChange={(e) => setNewCustomer({ ...newCustomer, phone: e.target.value })} />
                      <Input placeholder={t("customers.instagram")} dir="ltr" value={newCustomer.instagram} onChange={(e) => setNewCustomer({ ...newCustomer, instagram: e.target.value })} />
                      <Input className="col-span-2" placeholder={t("common.address")} value={newCustomer.address} onChange={(e) => setNewCustomer({ ...newCustomer, address: e.target.value })} />
                      <Input className="col-span-2" placeholder={t("customers.city")} value={newCustomer.city} onChange={(e) => setNewCustomer({ ...newCustomer, city: e.target.value })} />
                    </div>
                  )}
                </div>
                <div className="space-y-1 border-t pt-3 text-sm">
                  <Row label={t("common.subtotal")} value={formatJOD(subtotal, locale)} />
                  {disc > 0 && <Row label={t("common.discount")} value={`- ${formatJOD(disc, locale)}`} />}
                  <Row label={`${t("sell.gst")} (${gstRate}%)`} value={formatJOD(gst, locale)} />
                  {billedDelivery > 0 && <Row label={t("sell.deliveryBilled")} value={formatJOD(billedDelivery, locale)} />}
                  <div className="flex items-center justify-between border-t pt-2 text-base font-bold">
                    <span>{t("common.total")}</span><span className="text-primary">{formatJOD(total, locale)}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* STEP 2 — Packaging */}
        {step === 2 && (
          <Card>
            <CardContent className="space-y-4 p-5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 font-semibold"><Box className="size-4 text-primary" /> {t("sell.stepPack")}</div>
                <Link href="/assets" className="inline-flex items-center gap-1 text-sm text-primary hover:underline">
                  <Settings2 className="size-3.5" /> {t("sell.manageMaterials")}
                </Link>
              </div>
              <p className="text-sm text-muted-foreground">{t("wf.packHint")}</p>
              <div className="space-y-2">
                {(assets ?? []).length === 0 ? (
                  <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">{t("sell.noMaterials")}</p>
                ) : (assets ?? []).map((a) => (
                  <div key={a.id} className="flex items-center justify-between gap-2 rounded-md border p-3 text-sm">
                    <div className="min-w-0">
                      <div className="font-medium">{locale === "ar" && a.name_ar ? a.name_ar : a.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {t(a.kind === "equipment" ? "assets.equipment" : "assets.consumable")} · {formatJOD(packUnit(a), locale)}
                        {a.kind === "consumable" && a.qty_remaining != null ? ` · ${t("assets.qtyRemaining")}: ${a.qty_remaining}` : ""}
                      </div>
                    </div>
                    <div className="flex items-center rounded-md border">
                      <button className="px-2 py-1 hover:bg-accent" onClick={() => setPackQty((p) => ({ ...p, [a.id]: Math.max(0, (p[a.id] ?? 0) - 1) }))}><Minus className="size-3.5" /></button>
                      <span className="w-8 text-center">{packQty[a.id] ?? 0}</span>
                      <button className="px-2 py-1 hover:bg-accent" onClick={() => setPackQty((p) => ({ ...p, [a.id]: (p[a.id] ?? 0) + 1 }))}><Plus className="size-3.5" /></button>
                    </div>
                  </div>
                ))}
              </div>
              <QuickAddMaterial onAdded={() => refetchAssets()} />
              <div className="flex items-center justify-between rounded-md bg-muted/50 p-3 text-sm">
                <span className="text-muted-foreground">{t("sell.packaging")}</span>
                <span className="font-semibold">{formatJOD(packCost, locale)}</span>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Footer nav */}
        <div className="mt-6 flex items-center justify-between">
          {step > 0 ? (
            <Button variant="outline" onClick={() => setStep((s) => Math.max(0, s - 1))}><ArrowLeft className="size-4" /> {t("common.back")}</Button>
          ) : <span />}
          {step < 2 ? (
            <Button disabled={step === 0 && cart.length === 0} onClick={() => setStep((s) => s + 1)}>{t("wf.next")} <ArrowRight className="size-4" /></Button>
          ) : (
            <Button size="lg" disabled={commit.isPending || cart.length === 0} onClick={() => commit.mutate()}>
              {commit.isPending ? <Loader2 className="size-4 animate-spin" /> : <ShoppingCart className="size-4" />} {t("sell.createOrder")}
            </Button>
          )}
        </div>
      </div>
    </>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-muted-foreground">
      <span>{label}</span><span className="font-medium text-foreground">{value}</span>
    </div>
  );
}

function QuickAddMaterial({ onAdded }: { onAdded: () => void }) {
  const { t } = useI18n();
  const supabase = createClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", purchase_cost: "", qty_purchased: "" });

  const add = useMutation({
    mutationFn: async () => {
      if (!form.name.trim()) throw new Error("Name required");
      const qty = Math.max(1, Math.round(Number(form.qty_purchased) || 1));
      const { data: userData } = await supabase.auth.getUser();
      const { error } = await supabase.from("packaging_assets").insert({
        name: form.name.trim(), kind: "consumable", category: "box",
        purchase_cost: round3(Number(form.purchase_cost) || 0),
        qty_purchased: qty, qty_remaining: qty, qty_per_order: 1, created_by: userData.user?.id,
      });
      if (error) throw error;
    },
    onSuccess: () => { toast.success(t("assets.add")); setForm({ name: "", purchase_cost: "", qty_purchased: "" }); setOpen(false); onAdded(); },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!open) return <Button variant="outline" size="sm" onClick={() => setOpen(true)}><Plus className="size-4" /> {t("sell.addMaterial")}</Button>;
  return (
    <form onSubmit={(e) => { e.preventDefault(); add.mutate(); }} className="grid grid-cols-1 gap-2 rounded-md border bg-muted/30 p-3 sm:grid-cols-4">
      <Input className="sm:col-span-2" placeholder={t("common.name")} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
      <Input type="number" step="0.001" dir="ltr" placeholder={t("assets.purchaseCost")} value={form.purchase_cost} onChange={(e) => setForm({ ...form, purchase_cost: e.target.value })} />
      <Input type="number" dir="ltr" placeholder={t("assets.qtyPurchased")} value={form.qty_purchased} onChange={(e) => setForm({ ...form, qty_purchased: e.target.value })} />
      <div className="flex gap-2 sm:col-span-4">
        <Button type="submit" size="sm" disabled={add.isPending}>{add.isPending && <Loader2 className="size-4 animate-spin" />} {t("common.save")}</Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>{t("common.cancel")}</Button>
      </div>
    </form>
  );
}

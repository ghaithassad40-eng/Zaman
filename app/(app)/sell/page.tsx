"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Minus, Trash2, Watch, Loader2, ShoppingCart, Search } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useI18n } from "@/lib/i18n/provider";
import {
  useCompanySettings,
  useCustomers,
  useSellableProducts,
  type SellableProduct,
} from "@/lib/hooks";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatJOD, round3 } from "@/lib/utils";

type CartLine = {
  product: SellableProduct;
  qty: number;
  unitPrice: number;
};

export default function SellPage() {
  const { t, locale } = useI18n();
  const router = useRouter();
  const supabase = createClient();
  const qc = useQueryClient();

  const { data: products, isLoading } = useSellableProducts();
  const { data: customers } = useCustomers();
  const { data: settings } = useCompanySettings();

  const gstRate = Number(settings?.gst_rate ?? 16);
  const defaultDelivery = Number(settings?.default_delivery_fee ?? 2);

  const [search, setSearch] = useState("");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [customerId, setCustomerId] = useState("");
  const [newCustomer, setNewCustomer] = useState({ first_name: "", last_name: "", phone: "", instagram: "", address: "", city: "" });
  const [discount, setDiscount] = useState("0");
  const [deliveryFee, setDeliveryFee] = useState(String(defaultDelivery));
  const [deliveryBilled, setDeliveryBilled] = useState(String(defaultDelivery));

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (products ?? []).filter(
      (p) =>
        !q ||
        p.name.toLowerCase().includes(q) ||
        p.sku.toLowerCase().includes(q) ||
        (p.name_ar ?? "").includes(q),
    );
  }, [products, search]);

  function addToCart(p: SellableProduct) {
    setCart((prev) => {
      const existing = prev.find((l) => l.product.id === p.id);
      if (existing) {
        return prev.map((l) =>
          l.product.id === p.id ? { ...l, qty: l.qty + 1 } : l,
        );
      }
      return [...prev, { product: p, qty: 1, unitPrice: Number(p.default_selling_price ?? 0) }];
    });
  }

  function updateLine(id: string, patch: Partial<CartLine>) {
    setCart((prev) => prev.map((l) => (l.product.id === id ? { ...l, ...patch } : l)));
  }

  function removeLine(id: string) {
    setCart((prev) => prev.filter((l) => l.product.id !== id));
  }

  const subtotal = round3(cart.reduce((s, l) => s + l.qty * l.unitPrice, 0));
  const disc = round3(Number(discount) || 0);
  const taxable = Math.max(0, round3(subtotal - disc));
  const gst = round3((taxable * gstRate) / 100);
  const billedDelivery = round3(Number(deliveryBilled) || 0);
  const total = round3(taxable + gst + billedDelivery);

  // Cost & profit preview (packaging folded in, per Phase 2)
  const estCogs = round3(
    cart.reduce((s, l) => s + l.qty * Number(l.product.inventory?.avg_unit_cost ?? 0), 0),
  );
  const packaging = round3(settings?.auto_packaging ? Number(settings?.packaging_cost_per_order ?? 0) : 0);
  const estProfit = round3(subtotal - disc - estCogs - packaging);

  const sale = useMutation({
    mutationFn: async () => {
      if (cart.length === 0) throw new Error("Cart is empty");

      // Resolve / create customer
      let custId: string | null = customerId || null;
      const fullName = `${newCustomer.first_name.trim()} ${newCustomer.last_name.trim()}`.trim();
      if (!custId && fullName) {
        const { data: c, error } = await supabase
          .from("customers")
          .insert({
            first_name: newCustomer.first_name.trim() || null,
            last_name: newCustomer.last_name.trim() || null,
            name: fullName,
            phone: newCustomer.phone.trim() || null,
            instagram_handle: newCustomer.instagram.trim() || null,
            address: newCustomer.address.trim() || null,
            city: newCustomer.city.trim() || null,
          })
          .select("id")
          .single();
        if (error) throw error;
        custId = c.id;
      }

      const { data: userData } = await supabase.auth.getUser();
      const { data: partner } = await supabase
        .from("partners")
        .select("id")
        .eq("user_id", userData.user?.id ?? "")
        .maybeSingle();

      const { data: saleNo, error: noErr } = await supabase.rpc("next_doc_no", { p_type: "sale" });
      if (noErr) throw noErr;

      const { data: saleRow, error: saleErr } = await supabase
        .from("sales")
        .insert({
          sale_no: saleNo as string,
          customer_id: custId,
          sold_by: partner?.id ?? null,
          status: "draft",
          payment_status: "paid",
          subtotal,
          discount: disc,
          delivery_fee: round3(Number(deliveryFee) || 0),
          delivery_billed: billedDelivery,
          gst_rate: gstRate,
          gst_amount: gst,
          total,
          created_by: userData.user?.id,
        })
        .select("id")
        .single();
      if (saleErr) throw saleErr;

      const items = cart.map((l) => ({
        sale_id: saleRow.id,
        product_id: l.product.id,
        description: l.product.name,
        qty: l.qty,
        unit_price: l.unitPrice,
        line_total: round3(l.qty * l.unitPrice),
      }));
      const { error: itemsErr } = await supabase.from("sale_items").insert(items);
      if (itemsErr) throw itemsErr;

      // Deduct stock + book COGS / profit atomically.
      const { error: confirmErr } = await supabase.rpc("confirm_sale", { p_sale_id: saleRow.id });
      if (confirmErr) throw confirmErr;

      return saleRow.id;
    },
    onSuccess: () => {
      toast.success(t("sell.complete"));
      qc.invalidateQueries();
      setCart([]);
      setCustomerId("");
      setNewCustomer({ first_name: "", last_name: "", phone: "", instagram: "", address: "", city: "" });
      setDiscount("0");
      router.push("/sales");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <>
      <PageHeader title={t("sell.title")} />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        {/* Product picker */}
        <div className="lg:col-span-3">
          <div className="relative mb-4">
            <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="ps-9"
              placeholder={t("common.search")}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          {isLoading ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <Card key={i}><CardContent className="h-36 p-4" /></Card>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {filtered.map((p) => {
                const stock = p.inventory?.qty_on_hand ?? 0;
                const out = stock <= 0;
                return (
                  <button
                    key={p.id}
                    disabled={out}
                    onClick={() => addToCart(p)}
                    className="group flex flex-col overflow-hidden rounded-lg border border-border bg-card text-start shadow-sm transition hover:border-primary/40 hover:shadow disabled:opacity-50"
                  >
                    <div className="flex aspect-square items-center justify-center overflow-hidden bg-muted">
                      {p.image_urls?.[0] ? (
                        <Image
                          src={p.image_urls[0]}
                          alt={p.name}
                          width={160}
                          height={160}
                          className="size-full object-cover transition group-hover:scale-105"
                          unoptimized
                        />
                      ) : (
                        <Watch className="size-8 text-muted-foreground" />
                      )}
                    </div>
                    <div className="flex flex-1 flex-col gap-1 p-2.5">
                      <div className="line-clamp-2 text-sm font-medium leading-snug">
                        {locale === "ar" && p.name_ar ? p.name_ar : p.name}
                      </div>
                      <div className="mt-auto flex items-center justify-between">
                        <span className="text-sm font-semibold text-primary">
                          {formatJOD(p.default_selling_price ?? 0, locale)}
                        </span>
                        <Badge variant={out ? "destructive" : "success"}>
                          {out ? t("sell.outOfStock") : stock}
                        </Badge>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Cart + checkout */}
        <div className="lg:col-span-2">
          <Card className="lg:sticky lg:top-20">
            <CardContent className="space-y-4 p-5">
              <div className="flex items-center gap-2 font-semibold">
                <ShoppingCart className="size-4" /> {t("sell.cart")}
              </div>

              {cart.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">{t("sell.pickProduct")}</p>
              ) : (
                <div className="space-y-3">
                  {cart.map((l) => (
                    <div key={l.product.id} className="rounded-md border p-3">
                      <div className="mb-2 flex items-start justify-between gap-2">
                        <div className="min-w-0 text-sm font-medium">{l.product.name}</div>
                        <button onClick={() => removeLine(l.product.id)} className="text-muted-foreground hover:text-destructive">
                          <Trash2 className="size-4" />
                        </button>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="flex items-center rounded-md border">
                          <button
                            className="px-2 py-1.5 hover:bg-accent"
                            onClick={() => updateLine(l.product.id, { qty: Math.max(1, l.qty - 1) })}
                          >
                            <Minus className="size-3.5" />
                          </button>
                          <span className="w-8 text-center text-sm">{l.qty}</span>
                          <button
                            className="px-2 py-1.5 hover:bg-accent"
                            onClick={() =>
                              updateLine(l.product.id, {
                                qty: Math.min(l.product.inventory?.qty_on_hand ?? 1, l.qty + 1),
                              })
                            }
                          >
                            <Plus className="size-3.5" />
                          </button>
                        </div>
                        <Input
                          type="number"
                          step="0.001"
                          dir="ltr"
                          className="h-9"
                          value={l.unitPrice}
                          onChange={(e) => updateLine(l.product.id, { unitPrice: Number(e.target.value) })}
                          aria-label={t("sell.sellingPrice")}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Customer */}
              <div className="space-y-1.5 border-t pt-4">
                <Label>{t("sell.customer")}</Label>
                <Select value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
                  <option value="">{t("sell.newCustomer")}</option>
                  {(customers ?? []).map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} {c.phone ? `· ${c.phone}` : ""}
                    </option>
                  ))}
                </Select>
                {!customerId && (
                  <div className="grid grid-cols-2 gap-2 pt-1">
                    <Input
                      placeholder={t("common.firstName")}
                      value={newCustomer.first_name}
                      onChange={(e) => setNewCustomer({ ...newCustomer, first_name: e.target.value })}
                    />
                    <Input
                      placeholder={t("common.lastName")}
                      value={newCustomer.last_name}
                      onChange={(e) => setNewCustomer({ ...newCustomer, last_name: e.target.value })}
                    />
                    <Input
                      placeholder={t("common.phone")}
                      dir="ltr"
                      value={newCustomer.phone}
                      onChange={(e) => setNewCustomer({ ...newCustomer, phone: e.target.value })}
                    />
                    <Input
                      placeholder={t("customers.instagram")}
                      dir="ltr"
                      value={newCustomer.instagram}
                      onChange={(e) => setNewCustomer({ ...newCustomer, instagram: e.target.value })}
                    />
                    <Input
                      className="col-span-2"
                      placeholder={t("common.address")}
                      value={newCustomer.address}
                      onChange={(e) => setNewCustomer({ ...newCustomer, address: e.target.value })}
                    />
                    <Input
                      className="col-span-2"
                      placeholder={t("customers.city")}
                      value={newCustomer.city}
                      onChange={(e) => setNewCustomer({ ...newCustomer, city: e.target.value })}
                    />
                  </div>
                )}
              </div>

              {/* Money */}
              <div className="grid grid-cols-2 gap-2 border-t pt-4">
                <div className="space-y-1">
                  <Label className="text-xs">{t("common.discount")}</Label>
                  <Input type="number" step="0.001" dir="ltr" className="h-9" value={discount} onChange={(e) => setDiscount(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">{t("sell.deliveryBilled")}</Label>
                  <Input type="number" step="0.001" dir="ltr" className="h-9" value={deliveryBilled} onChange={(e) => setDeliveryBilled(e.target.value)} />
                </div>
                <div className="space-y-1 col-span-2">
                  <Label className="text-xs">{t("sell.delivery")}</Label>
                  <Input type="number" step="0.001" dir="ltr" className="h-9" value={deliveryFee} onChange={(e) => setDeliveryFee(e.target.value)} />
                </div>
              </div>

              <div className="space-y-1.5 border-t pt-4 text-sm">
                <Row label={t("common.subtotal")} value={formatJOD(subtotal, locale)} />
                {disc > 0 && <Row label={t("common.discount")} value={`- ${formatJOD(disc, locale)}`} />}
                <Row label={`${t("sell.gst")} `} value={formatJOD(gst, locale)} />
                {billedDelivery > 0 && <Row label={t("sell.deliveryBilled")} value={formatJOD(billedDelivery, locale)} />}
                <div className="flex items-center justify-between border-t pt-2 text-base font-bold">
                  <span>{t("common.total")}</span>
                  <span className="text-primary">{formatJOD(total, locale)}</span>
                </div>
              </div>

              {/* Cost & profit preview */}
              <div className="space-y-1.5 rounded-md bg-muted/50 p-3 text-sm">
                <Row label={t("common.cost")} value={formatJOD(estCogs, locale)} />
                {packaging > 0 && <Row label={t("sell.packaging")} value={formatJOD(packaging, locale)} />}
                <div className="flex items-center justify-between font-semibold">
                  <span>{t("common.profit")}</span>
                  <span className={estProfit >= 0 ? "text-success" : "text-destructive"}>
                    {formatJOD(estProfit, locale)}
                  </span>
                </div>
              </div>

              <Button
                className="w-full"
                size="lg"
                disabled={cart.length === 0 || sale.isPending}
                onClick={() => sale.mutate()}
              >
                {sale.isPending && <Loader2 className="size-4 animate-spin" />}
                {t("sell.complete")}
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-muted-foreground">
      <span>{label}</span>
      <span className="font-medium text-foreground">{value}</span>
    </div>
  );
}

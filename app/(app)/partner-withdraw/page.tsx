"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Trash2, Loader2, Gift, AlertCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useI18n } from "@/lib/i18n/provider";
import { useSellableProducts } from "@/lib/hooks";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Combobox } from "@/components/ui/combobox";
import { Card, CardContent } from "@/components/ui/card";
import { formatJOD, round3 } from "@/lib/utils";

type Line = { key: string; productId: string; qty: number };

export default function PartnerWithdrawPage() {
  const { t, locale } = useI18n();
  const supabase = createClient();
  const qc = useQueryClient();
  const router = useRouter();
  const today = new Date().toISOString().slice(0, 10);
  const { data: products } = useSellableProducts();

  const { data: partners } = useQuery({
    queryKey: ["partners-active"],
    queryFn: async () => {
      const { data } = await supabase.from("partners")
        .select("id, full_name, name_ar, ownership_pct").is("deleted_at", null).order("created_at");
      return data ?? [];
    },
  });
  const { data: equityAccounts } = useQuery({
    queryKey: ["equity-accounts"],
    queryFn: async () => {
      const { data } = await supabase.from("accounts")
        .select("id, name, type").is("deleted_at", null)
        .in("type", ["equity", "cash", "bank", "wallet"])
        .order("type", { ascending: false }).order("created_at");
      return data ?? [];
    },
  });

  const [partnerId, setPartnerId] = useState("");
  const [accountId, setAccountId] = useState("");
  const [date, setDate] = useState(today);
  const [note, setNote] = useState("");
  const [lines, setLines] = useState<Line[]>([{ key: crypto.randomUUID(), productId: "", qty: 1 }]);

  // Auto-pick the first equity account when it loads.
  if (!accountId && equityAccounts && equityAccounts.length > 0) {
    const eq = equityAccounts.find((a) => a.type === "equity") ?? equityAccounts[0];
    setTimeout(() => setAccountId(eq.id), 0);
  }

  const computed = useMemo(() => {
    let totalCost = 0;
    const items = lines.map((l) => {
      const p = (products ?? []).find((x) => x.id === l.productId);
      const unitCost = Number(p?.inventory?.avg_unit_cost ?? 0);
      const lineCost = round3(unitCost * Math.max(0, l.qty));
      totalCost += lineCost;
      const onHand = Number(p?.inventory?.qty_on_hand ?? 0);
      return { ...l, name: p?.name ?? "", unitCost, lineCost, onHand, oversold: l.qty > onHand };
    });
    return { items, totalCost: round3(totalCost), hasOversold: items.some((i) => i.productId && i.oversold) };
  }, [lines, products]);

  const valid = partnerId && accountId && computed.totalCost > 0 && !computed.hasOversold
    && lines.some((l) => l.productId && l.qty > 0);

  const submit = useMutation({
    mutationFn: async () => {
      const items = lines.filter((l) => l.productId && l.qty > 0).map((l) => ({ product_id: l.productId, qty: l.qty }));
      const { error } = await supabase.rpc("issue_to_partner", {
        p_partner_id: partnerId,
        p_account_id: accountId,
        p_date: date,
        p_items: items,
        p_note: note.trim() || undefined,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(t("partnerWithdraw.done"));
      qc.invalidateQueries({ queryKey: ["banks"] });
      qc.invalidateQueries({ queryKey: ["sellable_products"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      router.push("/banks");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function updateLine(key: string, patch: Partial<Line>) {
    setLines((p) => p.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }

  return (
    <>
      <PageHeader title={t("partnerWithdraw.title")} description={t("partnerWithdraw.subtitle")} />

      <Card className="mb-4 border-amber-200 bg-amber-50">
        <CardContent className="flex items-start gap-2 p-3 text-xs text-amber-900">
          <AlertCircle className="mt-0.5 size-4 shrink-0" />
          <div>{t("partnerWithdraw.notice")}</div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-4 p-5">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label>{t("partnerWithdraw.partner")} *</Label>
              <Select value={partnerId} onChange={(e) => setPartnerId(e.target.value)}>
                <option value="">—</option>
                {(partners ?? []).map((p) => <option key={p.id} value={p.id}>{locale === "ar" && p.name_ar ? p.name_ar : p.full_name}</option>)}
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>{t("partnerWithdraw.account")} *</Label>
              <Select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
                <option value="">—</option>
                {(equityAccounts ?? []).map((a) => <option key={a.id} value={a.id}>{a.name} ({t(`banks.${a.type}`)})</option>)}
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>{t("common.date")}</Label>
              <Input type="date" dir="ltr" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
          </div>

          <div className="space-y-2">
            <Label>{t("partnerWithdraw.items")} *</Label>
            {computed.items.map((l) => (
              <div key={l.key} className="grid grid-cols-12 gap-2">
                <div className="col-span-7">
                  <Combobox
                    value={l.productId}
                    onChange={(v) => updateLine(l.key, { productId: v })}
                    placeholder={t("purchases.productPicker")}
                    items={(products ?? []).map((p) => ({
                      value: p.id,
                      label: p.name,
                      caption: `${p.sku} · ${t("common.qty")}: ${p.inventory?.qty_on_hand ?? 0} · ${t("partnerWithdraw.cost")}: ${formatJOD(p.inventory?.avg_unit_cost ?? 0, locale)}`,
                      search: [p.sku, p.color, p.brand, p.model, p.name_ar].filter(Boolean).join(" "),
                    }))}
                  />
                </div>
                <Input className="col-span-2" type="number" min={1} dir="ltr" value={l.qty}
                  onChange={(e) => updateLine(l.key, { qty: Math.max(1, Number(e.target.value) || 1) })}
                  aria-label={t("common.qty")} />
                <div className="col-span-2 flex items-center text-end text-sm">
                  <span className={l.oversold ? "text-destructive" : "text-muted-foreground"}>
                    {formatJOD(l.lineCost, locale)}
                  </span>
                </div>
                <div className="col-span-1 flex items-center justify-end">
                  <button
                    onClick={() => setLines((p) => p.length > 1 ? p.filter((x) => x.key !== l.key) : p)}
                    className="text-muted-foreground hover:text-destructive"
                    type="button"
                    aria-label={t("common.delete")}
                  >
                    <Trash2 className="size-4" />
                  </button>
                </div>
                {l.productId && l.oversold && (
                  <div className="col-span-12 text-xs text-destructive">
                    {t("partnerWithdraw.oversold").replace("{on_hand}", String(l.onHand))}
                  </div>
                )}
              </div>
            ))}
            <Button variant="outline" size="sm" onClick={() => setLines((p) => [...p, { key: crypto.randomUUID(), productId: "", qty: 1 }])}>
              <Plus className="size-4" /> {t("partnerWithdraw.addLine")}
            </Button>
          </div>

          <div className="space-y-1.5">
            <Label>{t("common.notes")}</Label>
            <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder={t("partnerWithdraw.notePlaceholder")} />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 rounded-md bg-muted/40 p-3">
            <div>
              <div className="text-xs uppercase text-muted-foreground">{t("partnerWithdraw.totalCost")}</div>
              <div className="text-2xl font-bold text-primary">{formatJOD(computed.totalCost, locale)}</div>
              <div className="text-xs text-muted-foreground">{t("partnerWithdraw.totalCostHint")}</div>
            </div>
            <Button size="lg" disabled={!valid || submit.isPending} onClick={() => submit.mutate()}>
              {submit.isPending ? <Loader2 className="size-4 animate-spin" /> : <Gift className="size-4" />}
              {t("partnerWithdraw.submit")}
            </Button>
          </div>
        </CardContent>
      </Card>
    </>
  );
}

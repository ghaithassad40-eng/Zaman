"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, ArrowRight, Loader2, CheckCircle2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useI18n } from "@/lib/i18n/provider";
import { PageHeader } from "@/components/page-header";
import { Stepper } from "@/components/stepper";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatJOD, num3 } from "@/lib/utils";
import type { Tables } from "@/types/database.types";

type Item = Tables<"purchase_items">;

export default function ReceiveWizard() {
  const { id } = useParams<{ id: string }>();
  const { t, locale } = useI18n();
  const router = useRouter();
  const supabase = createClient();
  const qc = useQueryClient();

  const [step, setStep] = useState(0);
  const [items, setItems] = useState<Item[]>([]);
  const [loadedFor, setLoadedFor] = useState<string | null>(null);

  const { data: purchase, isLoading } = useQuery({
    queryKey: ["purchase-receive", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("purchases")
        .select("*, purchase_items(*)")
        .eq("id", id)
        .single();
      if (error) throw error;
      return data;
    },
  });

  if (purchase && loadedFor !== id) {
    setLoadedFor(id);
    setStep(0);
    setItems((purchase.purchase_items as Item[]) ?? []);
  }

  function patch(itemId: string, p: Partial<Item>) {
    setItems((prev) => prev.map((it) => (it.id === itemId ? { ...it, ...p } : it)));
  }

  async function saveItems() {
    for (const it of items) {
      await supabase
        .from("purchase_items")
        .update({ received: it.received, qc_quality: it.qc_quality, qc_working: it.qc_working, qc_repackage: it.qc_repackage, to_return: it.to_return })
        .eq("id", it.id);
    }
  }

  const finalize = useMutation({
    mutationFn: async () => {
      await saveItems();
      const { error } = await supabase.rpc("finalize_receiving", { p_purchase_id: id });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(t("purchases.received"));
      qc.invalidateQueries();
      router.push("/purchases");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const steps = [t("wf.stepReceive"), t("wf.stepQc"), t("wf.stepReturns")];
  const nm = (it: Item) => it.name ?? it.sku ?? "—";

  async function next() {
    await saveItems();
    setStep((s) => Math.min(2, s + 1));
  }

  return (
    <>
      <PageHeader
        title={t("wf.receiveTitle")}
        description={purchase?.reference || purchase?.doc_no || ""}
        action={
          <Link href="/purchases" className={buttonVariants({ variant: "outline" })}>
            <ArrowLeft className="size-4" /> {t("common.back")}
          </Link>
        }
      />

      <div className="mx-auto mb-6 max-w-2xl">
        <Stepper steps={steps} current={step} />
      </div>

      {isLoading ? (
        <Skeleton className="h-64" />
      ) : (
        <Card className="mx-auto max-w-3xl">
          <CardContent className="p-5">
            {/* Step 0 — Receive + landed cost */}
            {step === 0 && (
              <div className="space-y-4">
                <div className="grid grid-cols-3 gap-3 rounded-md bg-muted/40 p-3 text-sm">
                  <Stat label={t("purchases.items")} value={formatJOD(purchase?.items_total ?? 0, locale)} />
                  <Stat label={`${t("purchases.shipping")}+`} value={formatJOD((Number(purchase?.shipping_cost) + Number(purchase?.customs_cost) + Number(purchase?.clearance_cost)) || 0, locale)} />
                  <Stat label={t("purchases.landed")} value={formatJOD(purchase?.total_landed ?? 0, locale)} accent />
                </div>
                <label className="flex items-center gap-2 text-sm font-medium">
                  <input type="checkbox" className="size-4 accent-[var(--primary)]"
                    checked={items.length > 0 && items.every((i) => i.received)}
                    onChange={(e) => setItems((prev) => prev.map((i) => ({ ...i, received: e.target.checked })))} />
                  {t("wf.markAll")}
                </label>
                {items.map((it) => (
                  <label key={it.id} className={"flex items-center justify-between gap-2 rounded-md border p-3 text-sm " + (it.is_asset ? "border-primary/40 bg-primary/5" : "")}>
                    <span className="flex items-center gap-3">
                      <input type="checkbox" className="size-4 accent-[var(--primary)]" checked={it.received} onChange={(e) => patch(it.id, { received: e.target.checked })} />
                      <span className="font-medium">{nm(it)}</span>
                      <span className="text-muted-foreground">×{it.qty}</span>
                      {it.is_asset && <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-medium text-primary">{t("purchases.asset")}</span>}
                    </span>
                    <span className="text-muted-foreground">{t("purchases.landedUnit")}: {num3(it.landed_unit_cost)}</span>
                  </label>
                ))}
              </div>
            )}

            {/* Step 1 — Quality control (skipped for assets) */}
            {step === 1 && (
              <div className="space-y-3">
                {items.map((it) => (
                  <div key={it.id} className={"rounded-md border p-3 " + (it.is_asset ? "border-primary/40 bg-primary/5" : "")}>
                    <div className="mb-2 text-sm font-medium">
                      {nm(it)} <span className="text-muted-foreground">×{it.qty}</span>
                      {it.is_asset && <span className="ms-2 rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-medium text-primary">{t("purchases.asset")}</span>}
                    </div>
                    {it.is_asset ? (
                      <p className="text-xs text-muted-foreground">{t("purchases.assetQcSkip")}</p>
                    ) : (
                      <div className="flex flex-wrap gap-4 text-sm">
                        <Check label={t("wf.qcQuality")} checked={it.qc_quality} onChange={(v) => patch(it.id, { qc_quality: v })} />
                        <Check label={t("wf.qcWorking")} checked={it.qc_working} onChange={(v) => patch(it.id, { qc_working: v })} />
                        <Check label={t("wf.qcRepackage")} checked={it.qc_repackage} onChange={(v) => patch(it.id, { qc_repackage: v })} />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Step 2 — Returns */}
            {step === 2 && (
              <div className="space-y-3">
                {items.map((it) => (
                  <label key={it.id} className={"flex items-center justify-between gap-2 rounded-md border p-3 text-sm " + (it.is_asset ? "border-primary/40 bg-primary/5" : "")}>
                    <span className="font-medium">
                      {nm(it)} <span className="text-muted-foreground">×{it.qty}</span>
                      {it.is_asset && <span className="ms-2 rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-medium text-primary">{t("purchases.asset")}</span>}
                    </span>
                    <Check label={t("wf.toReturn")} checked={it.to_return} onChange={(v) => patch(it.id, { to_return: v })} danger />
                  </label>
                ))}
                <p className="text-xs text-muted-foreground">
                  {locale === "ar" ? "سيتم إدخال الأصناف المستلمة وغير المرتجعة إلى المخزون." : "Received items not marked for return will be added to stock."}
                </p>
              </div>
            )}

            <div className="mt-6 flex items-center justify-between">
              <Button variant="outline" disabled={step === 0} onClick={() => setStep((s) => Math.max(0, s - 1))}>
                <ArrowLeft className="size-4" /> {t("common.back")}
              </Button>
              {step < 2 ? (
                <Button onClick={next}>{t("wf.next")} <ArrowRight className="size-4" /></Button>
              ) : (
                <Button onClick={() => finalize.mutate()} disabled={finalize.isPending}>
                  {finalize.isPending ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />}
                  {t("wf.finalize")}
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={"font-semibold " + (accent ? "text-primary" : "")}>{value}</div>
    </div>
  );
}

function Check({ label, checked, onChange, danger }: { label: string; checked: boolean; onChange: (v: boolean) => void; danger?: boolean }) {
  return (
    <label className="flex items-center gap-2">
      <input type="checkbox" className={"size-4 " + (danger ? "accent-[var(--destructive)]" : "accent-[var(--primary)]")} checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className={danger && checked ? "font-medium text-destructive" : ""}>{label}</span>
    </label>
  );
}

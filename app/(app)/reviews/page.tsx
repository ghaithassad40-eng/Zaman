"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Star, CheckCircle2, X, Loader2, Inbox } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useI18n } from "@/lib/i18n/provider";
import type { DictKey } from "@/lib/i18n/dictionaries";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import type { Tables } from "@/types/database.types";
import { ProductCell } from "@/components/product-cell";

type ReviewRow = Tables<"product_reviews"> & {
  products: { id: string; name: string; sku: string; image_urls: string[] | null } | null;
};

export default function ReviewsPage() {
  const { t } = useI18n();
  const supabase = createClient();
  const qc = useQueryClient();
  const [tab, setTab] = useState<"pending" | "approved" | "rejected">("pending");
  const [busy, setBusy] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["product-reviews", tab],
    queryFn: async (): Promise<ReviewRow[]> => {
      const { data, error } = await supabase
        .from("product_reviews")
        .select("*, products(id, name, sku, image_urls)")
        .eq("status", tab)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as ReviewRow[];
    },
  });

  const counts = useQuery({
    queryKey: ["product-reviews-counts"],
    queryFn: async () => {
      const { data } = await supabase.from("product_reviews").select("status");
      const c = { pending: 0, approved: 0, rejected: 0 };
      for (const r of data ?? []) c[r.status as keyof typeof c]++;
      return c;
    },
  });

  const setStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: "approved" | "rejected" }) => {
      setBusy(id);
      const { data: userData } = await supabase.auth.getUser();
      const { error } = await supabase
        .from("product_reviews")
        .update({
          status,
          approved_at: status === "approved" ? new Date().toISOString() : null,
          approved_by: status === "approved" ? userData.user?.id ?? null : null,
        })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(t("common.save"));
      qc.invalidateQueries({ queryKey: ["product-reviews"] });
      qc.invalidateQueries({ queryKey: ["product-reviews-counts"] });
      qc.invalidateQueries({ queryKey: ["shop-reviews"] });
    },
    onError: (e: Error) => toast.error(e.message),
    onSettled: () => setBusy(null),
  });

  return (
    <>
      <PageHeader title={t("reviews.title")} description={t("reviews.subtitle")} />

      <div className="mb-4 flex gap-1 rounded-md border bg-card p-1">
        {(["pending", "approved", "rejected"] as const).map((s) => (
          <button
            key={s}
            onClick={() => setTab(s)}
            className={
              "flex-1 rounded px-3 py-1.5 text-sm font-medium transition-colors " +
              (tab === s ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted")
            }
          >
            {t(`reviews.tab.${s}` as DictKey)}
            {counts.data?.[s] != null && counts.data[s] > 0 && (
              <span className="ms-2 rounded-full bg-background/30 px-1.5 py-0.5 text-[10px]">{counts.data[s]}</span>
            )}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-24" />)}</div>
      ) : data && data.length > 0 ? (
        <div className="space-y-3">
          {data.map((r) => (
            <Card key={r.id}>
              <CardContent className="p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <ProductCell
                      image={r.products?.image_urls?.[0]}
                      name={r.products?.name ?? "—"}
                      meta={
                        <span className="inline-flex items-center gap-1.5">
                          <Badge variant={r.status === "approved" ? "success" : r.status === "rejected" ? "destructive" : "warning"}>
                            {t(`reviews.status.${r.status}` as DictKey)}
                          </Badge>
                          <span>·</span>
                          <span>{r.customer_name}</span>
                          <span>·</span>
                          <span>{r.products?.sku ?? "—"}</span>
                          <span>·</span>
                          <span>{new Date(r.created_at).toLocaleString()}</span>
                        </span>
                      }
                    />
                    <div className="mt-2 flex items-center gap-1" dir="ltr">
                      {[1, 2, 3, 4, 5].map((i) => (
                        <Star
                          key={i}
                          className={"size-4 " + (i <= r.rating ? "fill-amber-400 text-amber-400" : "text-muted-foreground/40")}
                        />
                      ))}
                    </div>
                    {r.comment && <p className="mt-2 text-sm">{r.comment}</p>}
                  </div>
                  {r.status === "pending" && (
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" onClick={() => setStatus.mutate({ id: r.id, status: "rejected" })} disabled={busy === r.id}>
                        <X className="size-4" /> {t("reviews.reject")}
                      </Button>
                      <Button size="sm" onClick={() => setStatus.mutate({ id: r.id, status: "approved" })} disabled={busy === r.id}>
                        {busy === r.id ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />}
                        {t("reviews.approve")}
                      </Button>
                    </div>
                  )}
                  {r.status !== "pending" && (
                    <Button variant="ghost" size="sm" onClick={() => setStatus.mutate({ id: r.id, status: r.status === "approved" ? "rejected" : "approved" })}>
                      {t("reviews.flip")}
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed p-12 text-center">
          <Inbox className="size-12 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">{t("reviews.empty")}</p>
        </div>
      )}
    </>
  );
}

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Mail, MessageSquare, Phone, MapPin, CheckCircle2, X, Loader2, Inbox } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useI18n } from "@/lib/i18n/provider";
import type { DictKey } from "@/lib/i18n/dictionaries";
import { PageHeader } from "@/components/page-header";
import { ExportButton } from "@/components/export-button";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import type { Tables } from "@/types/database.types";

type RequestRow = Tables<"product_requests"> & {
  products: { id: string; name: string; default_selling_price: number | null; expected_selling_price: number | null } | null;
};

export default function RequestsPage() {
  const { t } = useI18n();
  const supabase = createClient();
  const qc = useQueryClient();
  const router = useRouter();
  const [tab, setTab] = useState<"pending" | "confirmed" | "rejected">("pending");
  const [busy, setBusy] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["product-requests", tab],
    queryFn: async (): Promise<RequestRow[]> => {
      const { data, error } = await supabase
        .from("product_requests")
        .select("*, products(id, name, default_selling_price, expected_selling_price)")
        .eq("status", tab)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as RequestRow[];
    },
  });

  const counts = useQuery({
    queryKey: ["product-requests-counts"],
    queryFn: async () => {
      const { data } = await supabase.from("product_requests").select("status");
      const c = { pending: 0, confirmed: 0, rejected: 0 };
      for (const r of data ?? []) c[r.status as keyof typeof c]++;
      return c;
    },
  });

  async function confirmRequest(r: RequestRow) {
    if (!r.product_id) {
      toast.error(t("requests.productMissing"));
      return;
    }
    setBusy(r.id);
    try {
      // 1. Find or create customer by phone.
      const { data: existing } = await supabase
        .from("customers")
        .select("id")
        .eq("phone", r.customer_phone)
        .is("deleted_at", null)
        .limit(1)
        .maybeSingle();
      let customerId = existing?.id;
      if (!customerId) {
        const { data: created, error: cErr } = await supabase
          .from("customers")
          .insert({
            name: r.customer_name,
            phone: r.customer_phone,
            address: r.customer_address,
          })
          .select("id")
          .single();
        if (cErr) throw cErr;
        customerId = created.id;
      }

      // 2. Mark request as confirmed (the sale_id link is set after sale creation).
      const { data: userData } = await supabase.auth.getUser();
      const { error: uErr } = await supabase
        .from("product_requests")
        .update({
          status: "confirmed",
          confirmed_at: new Date().toISOString(),
          confirmed_by: userData.user?.id ?? null,
        })
        .eq("id", r.id);
      if (uErr) throw uErr;

      toast.success(t("requests.confirmed"));
      qc.invalidateQueries({ queryKey: ["product-requests"] });
      qc.invalidateQueries({ queryKey: ["product-requests-counts"] });

      // 3. Hand off to the sell flow with the product + customer pre-populated.
      router.push(`/sell?product=${r.product_id}&customer=${customerId}&request=${r.id}`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function rejectRequest(r: RequestRow) {
    if (!window.confirm(t("requests.rejectConfirm"))) return;
    setBusy(r.id);
    try {
      const { error } = await supabase
        .from("product_requests")
        .update({ status: "rejected" })
        .eq("id", r.id);
      if (error) throw error;
      toast.success(t("requests.rejected"));
      qc.invalidateQueries({ queryKey: ["product-requests"] });
      qc.invalidateQueries({ queryKey: ["product-requests-counts"] });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <PageHeader
        title={t("requests.title")}
        description={t("requests.subtitle")}
        action={
          <ExportButton
            filename="customer-requests"
            rows={data}
            cols={[
              { header: "Date", accessor: (r) => r.created_at?.slice(0, 10) ?? "" },
              { header: "Status", accessor: (r) => r.status },
              { header: "Product", accessor: (r) => r.products?.name ?? r.product_name_snapshot },
              { header: "Customer", accessor: (r) => r.customer_name },
              { header: "Phone", accessor: (r) => r.customer_phone },
              { header: "Email", accessor: (r) => r.customer_email ?? "" },
              { header: "Address", accessor: (r) => r.customer_address ?? "" },
              { header: "Notes", accessor: (r) => r.notes ?? "" },
            ]}
          />
        }
      />

      <div className="mb-4 flex gap-1 rounded-md border bg-card p-1">
        {(["pending", "confirmed", "rejected"] as const).map((s) => (
          <button
            key={s}
            onClick={() => setTab(s)}
            className={
              "flex-1 rounded px-3 py-1.5 text-sm font-medium transition-colors " +
              (tab === s ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted")
            }
          >
            {t(`requests.tab.${s}` as DictKey)}
            {counts.data?.[s] != null && counts.data[s] > 0 && (
              <span className="ms-2 rounded-full bg-background/30 px-1.5 py-0.5 text-[10px]">{counts.data[s]}</span>
            )}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-32" />)}</div>
      ) : data && data.length > 0 ? (
        <div className="space-y-3">
          {data.map((r) => (
            <Card key={r.id}>
              <CardContent className="p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">{r.products?.name ?? r.product_name_snapshot}</span>
                      <Badge variant={r.status === "confirmed" ? "success" : r.status === "rejected" ? "destructive" : "warning"}>
                        {t(`requests.status.${r.status}` as DictKey)}
                      </Badge>
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">{new Date(r.created_at).toLocaleString()}</div>
                    <div className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{r.customer_name}</span>
                      </div>
                      <a href={`tel:${r.customer_phone}`} className="flex items-center gap-2 text-primary hover:underline">
                        <Phone className="size-3.5" /> {r.customer_phone}
                      </a>
                      {r.customer_email && (
                        <a href={`mailto:${r.customer_email}`} className="flex items-center gap-2 text-muted-foreground hover:text-primary">
                          <Mail className="size-3.5" /> {r.customer_email}
                        </a>
                      )}
                      {r.customer_address && (
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <MapPin className="size-3.5" /> {r.customer_address}
                        </div>
                      )}
                      {r.notes && (
                        <div className="sm:col-span-2 flex items-start gap-2 text-muted-foreground">
                          <MessageSquare className="mt-0.5 size-3.5 shrink-0" />
                          <span>{r.notes}</span>
                        </div>
                      )}
                    </div>
                  </div>
                  {r.status === "pending" && (
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" onClick={() => rejectRequest(r)} disabled={busy === r.id}>
                        <X className="size-4" /> {t("requests.reject")}
                      </Button>
                      <Button size="sm" onClick={() => confirmRequest(r)} disabled={busy === r.id}>
                        {busy === r.id ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />}
                        {t("requests.confirmAndSell")}
                      </Button>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed p-12 text-center">
          <Inbox className="size-12 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">{t("requests.empty")}</p>
          <p className="max-w-md text-xs text-muted-foreground">{t("requests.emptyHint")}</p>
        </div>
      )}
    </>
  );
}

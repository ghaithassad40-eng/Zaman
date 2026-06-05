"use client";

import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, Users } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useI18n } from "@/lib/i18n/provider";
import { useCompanySettings } from "@/lib/hooks";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { Tables } from "@/types/database.types";

export default function SettingsPage() {
  const { t } = useI18n();
  const supabase = createClient();
  const qc = useQueryClient();
  const { data: settings } = useCompanySettings();
  const [showKey, setShowKey] = useState(false);

  const [form, setForm] = useState({
    name: "",
    name_ar: "",
    tax_number: "",
    gst_rate: "16",
    default_delivery_fee: "2",
    instagram_handle: "",
    phone: "",
    email: "",
    address: "",
    auto_packaging: true,
  });

  useEffect(() => {
    if (settings) {
      setForm({
        name: settings.name ?? "",
        name_ar: settings.name_ar ?? "",
        tax_number: settings.tax_number ?? "",
        gst_rate: String(settings.gst_rate ?? 16),
        default_delivery_fee: String(settings.default_delivery_fee ?? 2),
        instagram_handle: settings.instagram_handle ?? "",
        phone: settings.phone ?? "",
        email: settings.email ?? "",
        address: settings.address ?? "",
        auto_packaging: settings.auto_packaging ?? true,
      });
    }
  }, [settings]);

  const { data: partners } = useQuery({
    queryKey: ["partners"],
    queryFn: async (): Promise<Tables<"partners">[]> => {
      const { data, error } = await supabase
        .from("partners")
        .select("*")
        .is("deleted_at", null)
        .order("created_at");
      if (error) throw error;
      return data ?? [];
    },
  });

  const save = useMutation({
    mutationFn: async () => {
      if (!settings) throw new Error("Settings not loaded");
      const { error } = await supabase
        .from("company_settings")
        .update({
          name: form.name,
          name_ar: form.name_ar,
          tax_number: form.tax_number || null,
          gst_rate: Number(form.gst_rate),
          default_delivery_fee: Number(form.default_delivery_fee),
          instagram_handle: form.instagram_handle || null,
          phone: form.phone || null,
          email: form.email || null,
          address: form.address || null,
          auto_packaging: form.auto_packaging,
        })
        .eq("id", settings.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(t("common.save"));
      qc.invalidateQueries({ queryKey: ["company_settings"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <>
      <PageHeader title={t("settings.title")} />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>{t("settings.company")}</CardTitle>
          </CardHeader>
          <CardContent>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                save.mutate();
              }}
              className="grid grid-cols-1 gap-4 sm:grid-cols-2"
            >
              <Field label={`${t("common.name")} (EN)`}>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </Field>
              <Field label={`${t("common.name")} (ع)`}>
                <Input dir="rtl" value={form.name_ar} onChange={(e) => setForm({ ...form, name_ar: e.target.value })} />
              </Field>
              <Field label={t("settings.taxNumber")}>
                <Input dir="ltr" value={form.tax_number} onChange={(e) => setForm({ ...form, tax_number: e.target.value })} />
              </Field>
              <Field label={t("customers.instagram")}>
                <Input dir="ltr" value={form.instagram_handle} onChange={(e) => setForm({ ...form, instagram_handle: e.target.value })} />
              </Field>
              <Field label={t("settings.gstRate")}>
                <Input type="number" step="0.01" dir="ltr" value={form.gst_rate} onChange={(e) => setForm({ ...form, gst_rate: e.target.value })} />
              </Field>
              <Field label={t("settings.deliveryFee")}>
                <Input type="number" step="0.001" dir="ltr" value={form.default_delivery_fee} onChange={(e) => setForm({ ...form, default_delivery_fee: e.target.value })} />
              </Field>
              <Field label={t("common.phone")}>
                <Input dir="ltr" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
              </Field>
              <Field label={t("common.email")}>
                <Input dir="ltr" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              </Field>
              <Field label="Address" className="sm:col-span-2">
                <Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
              </Field>
              <div className="sm:col-span-2 flex items-center justify-between rounded-md border bg-muted/40 p-3">
                <label className="flex items-center gap-2 text-sm font-medium">
                  <input
                    type="checkbox"
                    className="size-4 accent-[var(--primary)]"
                    checked={form.auto_packaging}
                    onChange={(e) => setForm({ ...form, auto_packaging: e.target.checked })}
                  />
                  {t("settings.autoPackaging")}
                </label>
                <div className="text-end">
                  <div className="text-xs text-muted-foreground">{t("settings.packagingCost")}</div>
                  <div className="font-semibold text-primary">
                    {Number(settings?.packaging_cost_per_order ?? 0).toFixed(3)} JOD
                  </div>
                </div>
              </div>
              <div className="flex justify-end sm:col-span-2">
                <Button type="submit" disabled={save.isPending}>
                  {save.isPending && <Loader2 className="size-4 animate-spin" />}
                  {t("common.save")}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        <Card className="h-fit">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="size-4" /> {t("settings.partners")}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {(partners ?? []).map((p) => (
              <div key={p.id} className="flex items-center justify-between rounded-md border p-3">
                <div>
                  <div className="font-medium">{p.full_name}</div>
                  <div className="text-xs text-muted-foreground" dir="ltr">{p.email}</div>
                </div>
                <Badge>{Number(p.ownership_pct)}%</Badge>
              </div>
            ))}
            {(!partners || partners.length === 0) && (
              <p className="text-sm text-muted-foreground">{t("common.empty")}</p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Shein cart import</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Configure the <strong>Zaman Shein Import</strong> browser extension with the endpoint and key below.
          </p>
          <div className="space-y-1.5">
            <Label>Import endpoint URL</Label>
            <div className="flex gap-2">
              <Input readOnly dir="ltr" value={`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/shein-import`} />
              <Button type="button" variant="outline" onClick={() => {
                navigator.clipboard.writeText(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/shein-import`);
                toast.success("Copied");
              }}>Copy</Button>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Import API key</Label>
            <div className="flex gap-2">
              <Input readOnly dir="ltr" type={showKey ? "text" : "password"} value={settings?.import_api_key ?? ""} />
              <Button type="button" variant="outline" onClick={() => setShowKey((s) => !s)}>{showKey ? "Hide" : "Show"}</Button>
              <Button type="button" variant="outline" onClick={() => {
                navigator.clipboard.writeText(settings?.import_api_key ?? "");
                toast.success("Copied");
              }}>Copy</Button>
            </div>
            <p className="text-xs text-muted-foreground">Keep this key private — anyone with it can add purchases.</p>
          </div>
        </CardContent>
      </Card>
    </>
  );
}

function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={"space-y-1.5 " + (className ?? "")}>
      <Label>{label}</Label>
      {children}
    </div>
  );
}

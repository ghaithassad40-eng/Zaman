"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useI18n } from "@/lib/i18n/provider";
import { Brand } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function OnboardingPage() {
  const { t } = useI18n();
  const router = useRouter();
  const supabase = createClient();

  const [fullName, setFullName] = useState("");
  const [nameAr, setNameAr] = useState("");
  const [loading, setLoading] = useState(false);

  // If not signed in, bounce to login.
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) router.replace("/login");
    });
  }, [router, supabase]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.rpc("claim_partner_seat", {
      p_full_name: fullName,
      p_name_ar: nameAr || undefined,
    });
    setLoading(false);
    if (error) return toast.error(error.message);
    toast.success(t("auth.onboarding.welcome"));
    router.push("/");
    router.refresh();
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-secondary/40 to-background p-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex justify-center">
          <Brand size={48} />
        </div>
        <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
          <h1 className="mb-1 text-lg font-semibold">{t("auth.onboarding.title")}</h1>
          <p className="mb-5 text-sm text-muted-foreground">{t("app.tagline")}</p>
          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="fullName">{t("auth.onboarding.fullName")}</Label>
              <Input
                id="fullName"
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="nameAr">{t("auth.onboarding.fullNameAr")}</Label>
              <Input
                id="nameAr"
                dir="rtl"
                value={nameAr}
                onChange={(e) => setNameAr(e.target.value)}
              />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading && <Loader2 className="size-4 animate-spin" />}
              {t("auth.onboarding.claim")}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}

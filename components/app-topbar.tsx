"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Menu, LogOut, User } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useI18n } from "@/lib/i18n/provider";
import { Button } from "@/components/ui/button";
import { LanguageToggle } from "@/components/language-toggle";
import { AppSidebar } from "@/components/app-sidebar";
import { Brand } from "@/components/brand";

export function AppTopbar({ partnerName }: { partnerName: string }) {
  const { t } = useI18n();
  const router = useRouter();
  const [drawer, setDrawer] = useState(false);

  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <>
      <header className="sticky top-0 z-30 flex h-16 items-center gap-2 border-b bg-card/80 px-4 backdrop-blur no-print">
        <Button
          variant="ghost"
          size="icon"
          className="lg:hidden"
          onClick={() => setDrawer(true)}
          aria-label="Menu"
        >
          <Menu className="size-5" />
        </Button>
        <div className="lg:hidden">
          <Brand showText={false} size={30} />
        </div>

        <div className="ms-auto flex items-center gap-1">
          <LanguageToggle />
          <div className="hidden items-center gap-2 rounded-md px-2 py-1 text-sm text-muted-foreground sm:flex">
            <User className="size-4" />
            <span className="font-medium text-foreground">{partnerName}</span>
          </div>
          <Button variant="ghost" size="sm" onClick={signOut} title={t("nav.signout")}>
            <LogOut className="size-4" />
            <span className="hidden sm:inline">{t("nav.signout")}</span>
          </Button>
        </div>
      </header>

      {/* Mobile drawer */}
      {drawer && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setDrawer(false)} />
          <div className="absolute inset-y-0 start-0 w-72 max-w-[80%] shadow-xl">
            <AppSidebar onNavigate={() => setDrawer(false)} />
          </div>
        </div>
      )}
    </>
  );
}

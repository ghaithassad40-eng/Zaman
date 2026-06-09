"use client";

import { Languages } from "lucide-react";
import { useI18n } from "@/lib/i18n/provider";
import { Button } from "@/components/ui/button";

export function LanguageToggle() {
  const { locale, setLocale } = useI18n();
  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={() => setLocale(locale === "ar" ? "en" : "ar")}
      title="Switch language"
      aria-label={locale === "ar" ? "Switch to English" : "التبديل إلى العربية"}
    >
      <Languages className="size-4" aria-hidden />
      <span className="font-medium">{locale === "ar" ? "EN" : "ع"}</span>
    </Button>
  );
}

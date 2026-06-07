"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Watch,
  PackageOpen,
  Landmark,
  Truck,
  Receipt,
  BarChart3,
  LineChart,
  Users,
  Settings,
  HandCoins,
  Building2,
  Inbox,
} from "lucide-react";
import { Brand } from "@/components/brand";
import { useI18n } from "@/lib/i18n/provider";
import type { DictKey } from "@/lib/i18n/dictionaries";
import { cn } from "@/lib/utils";

const NAV: { href: string; key: DictKey; icon: React.ElementType }[] = [
  { href: "/", key: "nav.dashboard", icon: LayoutDashboard },
  { href: "/products", key: "nav.products", icon: Watch },
  { href: "/purchases", key: "nav.purchases", icon: PackageOpen },
  { href: "/sales", key: "nav.sales", icon: Receipt },
  { href: "/requests", key: "nav.requests", icon: Inbox },
  { href: "/banks", key: "nav.banks", icon: Landmark },
  { href: "/vendors", key: "nav.vendors", icon: Truck },
  { href: "/fixed-assets", key: "nav.fixedAssets", icon: Building2 },
  { href: "/reports", key: "nav.reports", icon: BarChart3 },
  { href: "/dividends", key: "nav.dividends", icon: HandCoins },
  { href: "/analytics", key: "nav.analytics", icon: LineChart },
  { href: "/customers", key: "nav.customers", icon: Users },
  { href: "/settings", key: "nav.settings", icon: Settings },
];

export function AppSidebar({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const { t } = useI18n();

  return (
    <div className="flex h-full flex-col bg-sidebar text-sidebar-foreground">
      <div className="flex h-16 items-center border-b px-5">
        <Brand />
      </div>
      <nav className="flex-1 space-y-1 overflow-y-auto p-3">
        {NAV.map(({ href, key, icon: Icon }) => {
          const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              onClick={onNavigate}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-colors",
                active
                  ? "bg-primary/10 text-primary"
                  : "text-foreground/70 hover:bg-accent hover:text-accent-foreground",
              )}
            >
              <Icon className="size-[18px] shrink-0" />
              <span>{t(key)}</span>
            </Link>
          );
        })}
      </nav>
      <div className="border-t p-4 text-xs text-muted-foreground">
        {t("app.tagline")}
      </div>
    </div>
  );
}

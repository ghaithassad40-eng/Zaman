"use client";

/**
 * App-wide notification surface.
 *
 *   <NotificationBell />     — bell + unread badge in the top bar.
 *                              Click opens a dropdown with recent items;
 *                              clicking an item logs `clicked` to the audit
 *                              log and routes to the relevant page.
 *   <NotificationBanner />   — fixed banner under the top bar that shows
 *                              the SINGLE most-recent unread notification
 *                              until acknowledged. Stays visible across
 *                              page navigations because it lives in the
 *                              app layout.
 *
 * Both wire onto Supabase Realtime so new rows appear without a refresh.
 * Every life-cycle action (opened, clicked, dismissed) goes through
 * mark_notification() which writes the audit row server-side.
 */
import { useEffect, useId, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, Check, ChevronRight, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useI18n } from "@/lib/i18n/provider";
import { Button } from "@/components/ui/button";

type Notif = {
  id: string;
  user_id: string;
  kind: string;
  ref_request_id: string | null;
  title: string;
  body: string | null;
  payload: Record<string, unknown>;
  created_at: string;
  read_at: string | null;
  dismissed_at: string | null;
};

function useNotifications() {
  const supabase = createClient();
  const qc = useQueryClient();
  // Each hook instance gets a unique channel name. Multiple components
  // (Bell + Banner) call useNotifications() in the same tree, and Supabase
  // doesn't allow two channels with the same name on one client — the
  // duplicate would error and crash the React tree.
  const instanceId = useId();

  const q = useQuery({
    queryKey: ["notifications"],
    queryFn: async (): Promise<Notif[]> => {
      const { data, error } = await supabase
        .from("notifications")
        .select("id, user_id, kind, ref_request_id, title, body, payload, created_at, read_at, dismissed_at")
        .is("dismissed_at", null)
        .order("created_at", { ascending: false })
        .limit(30);
      if (error) throw error;
      return (data ?? []) as Notif[];
    },
    staleTime: 30_000,
  });

  // Subscribe to realtime inserts for the current user's notifications. The
  // RLS policy "user_reads_own" filters down to user_id = auth.uid(), so we
  // just react to anything that comes through and refetch. Anything that
  // can fail here (CSP blocking wss, websocket DNS, server-side rejection)
  // is swallowed silently — the bell falls back to the staleTime-driven
  // refresh. No console noise, no error boundary trip, no UI surface.
  useEffect(() => {
    let mounted = true;
    let channel: ReturnType<typeof supabase.channel> | null = null;
    // Tag the channel with a fresh random suffix per effect run so React
    // StrictMode's double-mount in dev never sees the same channel twice
    // (Supabase reuses by-name, and re-subscribing an already-subscribed
    // channel throws "cannot add postgres_changes after subscribe()").
    const suffix = `${instanceId}:${Math.floor(Math.random() * 1e9).toString(36)}`;
    try {
      channel = supabase.channel(`notif-${suffix}`);
      channel.on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications" },
        () => {
          if (!mounted) return;
          qc.invalidateQueries({ queryKey: ["notifications"] });
        },
      );
      // Catch async failures (websocket close, server error) so the
      // promise rejection doesn't reach window.onerror.
      Promise.resolve(channel.subscribe()).catch(() => {});
    } catch {
      // Sync failure — already silenced.
    }
    return () => {
      mounted = false;
      if (channel) {
        try { supabase.removeChannel(channel); } catch { /* ignore */ }
      }
    };
  }, [supabase, qc, instanceId]);

  async function mark(id: string, action: "opened" | "clicked" | "dismissed") {
    await supabase.rpc("mark_notification", { p_id: id, p_action: action });
    qc.invalidateQueries({ queryKey: ["notifications"] });
  }

  return { ...q, mark };
}

function fmt(n: Notif, locale: string) {
  // Pull the audit-grade fields straight out of payload.
  const p = n.payload || {};
  const date = new Date(n.created_at);
  return {
    customerName: String(p.customer_name ?? ""),
    requestNo: String(p.request_no ?? ""),
    kind: String(p.kind ?? n.kind),
    when: date.toLocaleString(locale === "ar" ? "ar-JO" : "en"),
    status: String(p.status ?? "new"),
    productName: String(p.product_name ?? ""),
    qty: Number(p.qty ?? 1),
  };
}

function targetHref(n: Notif): string {
  // All current notifications go to the requests page. Future kinds can
  // branch on n.kind to pick a different route.
  return n.ref_request_id ? `/requests?id=${n.ref_request_id}` : "/requests";
}

export function NotificationBell() {
  const { t, locale } = useI18n();
  const router = useRouter();
  const { data, mark } = useNotifications();
  const [open, setOpen] = useState(false);

  const unreadCount = useMemo(
    () => (data ?? []).filter((n) => !n.read_at).length,
    [data],
  );

  async function click(n: Notif) {
    await mark(n.id, "clicked");
    setOpen(false);
    router.push(targetHref(n));
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        onBlur={() => setTimeout(() => setOpen(false), 200)}
        className="relative inline-flex items-center justify-center rounded-md p-2 hover:bg-accent"
        aria-label={t("notif.title")}
      >
        <Bell className="size-5" aria-hidden />
        {unreadCount > 0 && (
          <span className="absolute -end-0.5 -top-0.5 grid h-4 min-w-[16px] place-items-center rounded-full bg-destructive px-1 text-[10px] font-semibold text-destructive-foreground">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>
      {open && (
        <div
          className="absolute end-0 z-40 mt-1 w-80 overflow-hidden rounded-md border bg-card shadow-lg"
          // Prevent the onBlur on the button from firing when clicks happen
          // inside the dropdown.
          onMouseDown={(e) => e.preventDefault()}
        >
          <div className="border-b px-3 py-2 text-xs font-semibold uppercase text-muted-foreground">
            {t("notif.title")}
          </div>
          <div className="max-h-80 overflow-y-auto">
            {(data ?? []).length === 0 ? (
              <div className="px-3 py-6 text-center text-sm text-muted-foreground">
                {t("notif.empty")}
              </div>
            ) : (
              (data ?? []).map((n) => {
                const f = fmt(n, locale);
                return (
                  <button
                    key={n.id}
                    type="button"
                    onClick={() => click(n)}
                    className={
                      "block w-full border-b px-3 py-2 text-start last:border-b-0 hover:bg-accent " +
                      (!n.read_at ? "bg-primary/5" : "")
                    }
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium">{n.title}</span>
                      {!n.read_at && (
                        <span className="size-2 shrink-0 rounded-full bg-primary" aria-hidden />
                      )}
                    </div>
                    <div className="mt-0.5 text-xs text-muted-foreground">{n.body}</div>
                    <div className="mt-0.5 text-[10px] text-muted-foreground">{f.when}</div>
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export function NotificationBanner() {
  const { t, locale } = useI18n();
  const router = useRouter();
  const { data, mark } = useNotifications();

  // Show only the newest unread + undismissed item. Keeps the surface calm
  // when many requests arrive at once — the bell drop-down has the rest.
  const top = useMemo(
    () => (data ?? []).find((n) => !n.read_at) ?? null,
    [data],
  );

  if (!top) return null;
  const f = fmt(top, locale);

  return (
    <div
      role="status"
      aria-live="polite"
      className="border-b border-amber-200 bg-amber-50 no-print"
    >
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-3 px-4 py-2 text-sm">
        <Bell className="size-4 shrink-0 text-amber-700" aria-hidden />
        <div className="min-w-0 flex-1">
          <span className="font-semibold">{t("notif.newRequest")}</span>
          <span className="mx-2 text-muted-foreground">·</span>
          <span className="font-mono">{f.requestNo}</span>
          <span className="mx-2 text-muted-foreground">·</span>
          <span>{f.customerName}</span>
          <span className="mx-2 text-muted-foreground">·</span>
          <span className="text-muted-foreground">{f.productName} × {f.qty}</span>
          <span className="mx-2 text-muted-foreground">·</span>
          <span className="text-xs text-muted-foreground">{f.when}</span>
          <span className="ms-2 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium uppercase text-amber-800">
            {t("notif.statusNew")}
          </span>
        </div>
        <Button
          size="sm"
          onClick={async () => {
            await mark(top.id, "clicked");
            router.push(targetHref(top));
          }}
        >
          {t("notif.view")} <ChevronRight className="size-3.5" aria-hidden />
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => mark(top.id, "opened")}
          aria-label={t("notif.acknowledge")}
          title={t("notif.acknowledge")}
        >
          <Check className="size-4" aria-hidden />
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => mark(top.id, "dismissed")}
          aria-label={t("notif.dismiss")}
          title={t("notif.dismiss")}
        >
          <X className="size-4" aria-hidden />
        </Button>
      </div>
    </div>
  );
}

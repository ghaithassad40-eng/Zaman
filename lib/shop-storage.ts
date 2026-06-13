/**
 * localStorage-backed cart + favorites for the anonymous public shop.
 *
 * We don't have customer accounts, so per-visitor state lives in the browser.
 * Two keys:
 *
 *   zw_cart       → { [productId]: qty }
 *   zw_favorites  → string[]  (product ids)
 *
 * The hook below subscribes to storage events too so the header counters
 * stay in sync if the customer opens the shop in two tabs.
 */
"use client";

import { useCallback, useEffect, useState } from "react";

const CART_KEY = "zw_cart";
const FAV_KEY = "zw_favorites";

export type CartMap = Record<string, number>;

function readCart(): CartMap {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(CART_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return {};
    const out: CartMap = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      const n = Math.max(0, Math.floor(Number(v) || 0));
      if (n > 0) out[k] = n;
    }
    return out;
  } catch {
    return {};
  }
}

function writeCart(c: CartMap) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(CART_KEY, JSON.stringify(c));
  // Storage events don't fire on the tab that wrote them — manual ping so
  // our own listeners across components react.
  window.dispatchEvent(new StorageEvent("storage", { key: CART_KEY }));
}

function readFavs(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(FAV_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function writeFavs(ids: string[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(FAV_KEY, JSON.stringify(ids));
  window.dispatchEvent(new StorageEvent("storage", { key: FAV_KEY }));
}

export function useShopCart() {
  const [cart, setCart] = useState<CartMap>({});
  useEffect(() => {
    setCart(readCart());
    const onStore = (e: StorageEvent) => {
      if (e.key === CART_KEY || e.key === null) setCart(readCart());
    };
    window.addEventListener("storage", onStore);
    return () => window.removeEventListener("storage", onStore);
  }, []);

  const add = useCallback((id: string, qty = 1) => {
    const c = readCart();
    c[id] = Math.max(1, (c[id] ?? 0) + qty);
    writeCart(c);
  }, []);
  const setQty = useCallback((id: string, qty: number) => {
    const c = readCart();
    if (qty <= 0) delete c[id];
    else c[id] = qty;
    writeCart(c);
  }, []);
  const remove = useCallback((id: string) => {
    const c = readCart();
    delete c[id];
    writeCart(c);
  }, []);
  const clear = useCallback(() => writeCart({}), []);
  const totalItems = Object.values(cart).reduce((s, n) => s + n, 0);

  return { cart, add, setQty, remove, clear, totalItems };
}

export function useShopFavorites() {
  const [ids, setIds] = useState<string[]>([]);
  useEffect(() => {
    setIds(readFavs());
    const onStore = (e: StorageEvent) => {
      if (e.key === FAV_KEY || e.key === null) setIds(readFavs());
    };
    window.addEventListener("storage", onStore);
    return () => window.removeEventListener("storage", onStore);
  }, []);

  const toggle = useCallback((id: string) => {
    const cur = readFavs();
    const next = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id];
    writeFavs(next);
  }, []);
  const has = useCallback((id: string) => ids.includes(id), [ids]);
  const clear = useCallback(() => writeFavs([]), []);

  return { ids, toggle, has, clear, count: ids.length };
}

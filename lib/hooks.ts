"use client";

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import type { Tables } from "@/types/database.types";

/** Company settings (singleton row) — GST rate, delivery fee, tax number. */
export function useCompanySettings() {
  const supabase = createClient();
  return useQuery({
    queryKey: ["company_settings"],
    queryFn: async (): Promise<Tables<"company_settings"> | null> => {
      const { data, error } = await supabase.from("company_settings").select("*").limit(1).maybeSingle();
      if (error) throw error;
      return data;
    },
    staleTime: 5 * 60_000,
  });
}

export type SellableProduct = {
  id: string;
  sku: string;
  name: string;
  name_ar: string | null;
  color: string | null;
  brand: string | null;
  model: string | null;
  feature: string | null;
  gender: string | null;
  image_urls: string[];
  default_selling_price: number | null;
  inventory: { qty_on_hand: number; avg_unit_cost: number } | null;
};

/** Products joined with their inventory row, for the sell screen. */
export function useSellableProducts() {
  const supabase = createClient();
  return useQuery({
    queryKey: ["sellable_products"],
    queryFn: async (): Promise<SellableProduct[]> => {
      const { data, error } = await supabase
        .from("products")
        .select(
          "id, sku, name, name_ar, color, brand, model, feature, gender, image_urls, default_selling_price, inventory(qty_on_hand, avg_unit_cost)",
        )
        .eq("is_active", true)
        .is("deleted_at", null)
        .order("name");
      if (error) throw error;
      return (data ?? []) as unknown as SellableProduct[];
    },
  });
}

export function useCustomers() {
  const supabase = createClient();
  return useQuery({
    queryKey: ["customers"],
    queryFn: async (): Promise<Tables<"customers">[]> => {
      const { data, error } = await supabase
        .from("customers")
        .select("*")
        .is("deleted_at", null)
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });
}

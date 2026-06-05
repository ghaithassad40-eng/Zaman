import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Tables } from "@/types/database.types";

/** Returns the signed-in auth user, or null. */
export async function getUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

/**
 * Returns the partner row for the signed-in user. Redirects to /login if not
 * signed in, or /onboarding if signed in but not yet a partner.
 */
export async function requirePartner(): Promise<Tables<"partners">> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: partner } = await supabase
    .from("partners")
    .select("*")
    .eq("user_id", user.id)
    .is("deleted_at", null)
    .maybeSingle();

  if (!partner) redirect("/onboarding");
  return partner;
}

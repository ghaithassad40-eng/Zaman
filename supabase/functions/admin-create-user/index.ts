// Zaman Watch — admin creates a new user (login + partner/staff record).
// Only an admin partner may call this. Uses the service role to create the
// auth account; the caller is authenticated via their JWT.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-client-info",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "missing authorization" }, 401);

  const url = Deno.env.get("SUPABASE_URL")!;
  const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  // Identify the caller from their JWT.
  const caller = createClient(url, anon, { global: { headers: { Authorization: authHeader } } });
  const { data: { user }, error: uErr } = await caller.auth.getUser();
  if (uErr || !user) return json({ error: "unauthorized" }, 401);

  const admin = createClient(url, service);

  // Caller must be an admin partner.
  const { data: me } = await admin
    .from("partners").select("is_admin, role").eq("user_id", user.id).is("deleted_at", null).maybeSingle();
  if (!me || (!me.is_admin && me.role !== "admin")) return json({ error: "admins only" }, 403);

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json({ error: "invalid JSON" }, 400); }

  const email = String(body.email ?? "").trim().toLowerCase();
  const password = String(body.password ?? "");
  const full_name = String(body.full_name ?? "").trim();
  const role = ["admin", "partner", "staff"].includes(String(body.role)) ? String(body.role) : "staff";
  const ownership_pct = Number(body.ownership_pct) || 0;

  if (!email || !password || !full_name) return json({ error: "name, email and password are required" }, 400);
  if (password.length < 6) return json({ error: "password must be at least 6 characters" }, 400);

  // Create the confirmed auth account.
  const { data: createdAuth, error: cErr } = await admin.auth.admin.createUser({
    email, password, email_confirm: true,
  });
  if (cErr || !createdAuth?.user) return json({ error: cErr?.message ?? "could not create user" }, 400);

  // Create the partner/user record.
  const { error: pErr } = await admin.from("partners").insert({
    user_id: createdAuth.user.id,
    full_name,
    name_ar: (body.name_ar as string) || null,
    email,
    phone: (body.phone as string) || null,
    ownership_pct,
    is_admin: role === "admin",
    role,
  });
  if (pErr) {
    // Roll back the auth account if the record fails.
    await admin.auth.admin.deleteUser(createdAuth.user.id);
    return json({ error: pErr.message }, 400);
  }

  return json({ ok: true, user_id: createdAuth.user.id, email, role });
});

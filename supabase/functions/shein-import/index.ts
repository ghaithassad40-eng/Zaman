// Zaman Watch — Shein cart import endpoint.
// Accepts cart JSON from the browser extension (api-key auth) and creates a
// draft Purchase with products, images, quantities and landed cost.
// Deployed with verify_jwt = false; auth is the per-business import key.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "content-type, x-api-key, authorization",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
const r3 = (n: number) => Math.round((Number(n) + Number.EPSILON) * 1000) / 1000;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  let payload: Record<string, unknown>;
  try { payload = await req.json(); } catch { return json({ error: "invalid JSON" }, 400); }

  const apiKey = req.headers.get("x-api-key") || (payload.apiKey as string);
  if (!apiKey) return json({ error: "missing api key" }, 401);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data: settings } = await supabase
    .from("company_settings").select("import_api_key").limit(1).maybeSingle();
  if (!settings?.import_api_key || settings.import_api_key !== apiKey) {
    return json({ error: "unauthorized" }, 401);
  }

  const rawItems = Array.isArray(payload.items) ? (payload.items as Record<string, unknown>[]) : [];
  if (rawItems.length === 0) return json({ error: "no items" }, 400);

  const fx = Number(payload.fx_rate) || 1;
  const shipping = r3(Number(payload.shipping_cost) || 0);
  const customs = r3(Number(payload.customs_cost) || 0);
  const clearance = r3(Number(payload.clearance_cost) || 0);
  const overhead = r3(shipping + customs + clearance);

  const lines = rawItems.map((it) => {
    const qty = Math.max(1, Math.round(Number(it.qty ?? it.quantity) || 1));
    const unitSrc = r3(Number(it.unit_cost_src ?? it.price ?? it.salePrice ?? 0));
    const unitJod = r3(unitSrc * fx);
    return {
      sku: String(it.sku ?? it.goods_sn ?? "").trim(),
      name: String(it.name ?? it.goods_name ?? "").trim(),
      image: (it.image_url ?? it.image ?? it.goods_img ?? null) as string | null,
      qty, unitSrc, unitJod, value: r3(qty * unitJod),
    };
  }).filter((l) => l.sku && l.name);
  if (lines.length === 0) return json({ error: "items missing sku/name" }, 400);

  const itemsTotal = r3(lines.reduce((s, l) => s + l.value, 0));
  const totalLanded = r3(itemsTotal + overhead);

  const { data: docNo } = await supabase.rpc("next_doc_no", { p_type: "purchase" });

  const { data: purchase, error: pErr } = await supabase.from("purchases").insert({
    doc_no: docNo, reference: (payload.reference as string) || "Shein cart", source: "shein",
    src_currency: (payload.src_currency as string) || "USD", fx_rate: fx,
    items_total: itemsTotal, shipping_cost: shipping, customs_cost: customs, clearance_cost: clearance,
    total_landed: totalLanded, status: "ordered", raw_json: payload.raw ?? null,
  }).select("id").single();
  if (pErr) return json({ error: pErr.message }, 500);

  let created = 0, linked = 0;
  for (const l of lines) {
    const { data: prod } = await supabase
      .from("products").select("id").eq("sku", l.sku).is("deleted_at", null).maybeSingle();
    let productId = prod?.id as string | undefined;
    if (!productId) {
      const ins = await supabase.from("products").insert({
        sku: l.sku, name: l.name, name_ar: l.name, source: "shein",
        image_urls: l.image ? [l.image] : [],
      }).select("id").single();
      if (ins.error) return json({ error: ins.error.message }, 500);
      productId = ins.data.id;
      await supabase.from("inventory").insert({ product_id: productId });
      created++;
    } else linked++;

    const alloc = itemsTotal > 0 ? r3(overhead * (l.value / itemsTotal)) : 0;
    const landedUnit = r3(l.unitJod + (l.qty > 0 ? alloc / l.qty : 0));
    const { error: itErr } = await supabase.from("purchase_items").insert({
      purchase_id: purchase.id, product_id: productId, sku: l.sku, name: l.name,
      image_url: l.image, qty: l.qty, unit_cost_src: l.unitSrc, unit_cost_jod: l.unitJod,
      allocated_overhead: r3(alloc), landed_unit_cost: landedUnit,
    });
    if (itErr) return json({ error: itErr.message }, 500);
  }

  return json({
    ok: true, purchase_id: purchase.id, doc_no: docNo,
    items: lines.length, products_created: created, products_linked: linked,
    total_landed: totalLanded,
  });
});

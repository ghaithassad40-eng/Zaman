// One-time upload of extracted product photos to Supabase Storage.
//
// Usage (PowerShell), from the zaman-watch folder:
//   $env:SUPABASE_SERVICE_ROLE_KEY="<your service_role secret>"
//   node scripts/upload-photos.mjs
//
// The service_role key is read from the environment only, never stored.
// Get it from: Supabase Dashboard -> Project Settings -> API -> service_role.

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const URL = "https://gbdktacfxleqgfxrsnfo.supabase.co";
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ROOT = "C:/Users/ghaith.assad/Documents/MVP/Zamman Software/zaman-watch/scripts";
const BUCKET = "product-images";

if (!KEY) {
  console.error("Missing SUPABASE_SERVICE_ROLE_KEY env var. Aborting.");
  process.exit(1);
}

const supabase = createClient(URL, KEY, { auth: { persistSession: false } });
const manifest = JSON.parse(readFileSync(`${ROOT}/photo-manifest.json`, "utf8"));

const contentType = (f) =>
  f.endsWith(".png") ? "image/png" : f.endsWith(".webp") ? "image/webp" : "image/jpeg";

let ok = 0, fail = 0;
for (const { sku, file } of manifest) {
  try {
    const bytes = readFileSync(`${ROOT}/photos/${file}`);
    const path = `imported/${file}`;
    const { error: upErr } = await supabase.storage
      .from(BUCKET)
      .upload(path, bytes, { contentType: contentType(file), upsert: true });
    if (upErr) throw upErr;

    const publicUrl = supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
    const { error: updErr } = await supabase
      .from("products")
      .update({ image_urls: [publicUrl] })
      .eq("sku", sku);
    if (updErr) throw updErr;
    ok++;
    if (ok % 10 === 0) console.log(`  ${ok}/${manifest.length} uploaded…`);
  } catch (e) {
    fail++;
    console.error(`  FAILED ${sku} (${file}): ${e.message}`);
  }
}
console.log(`Done. Uploaded & linked: ${ok}  | failed: ${fail}`);

# Zaman Watch — Shein Cart Import (Chrome extension)

Captures your Shein cart **inside your own logged-in browser session** and sends it
to Zaman Watch Purchasing (creates a draft Purchase with products, images,
quantities and landed cost). There is no official Shein buyer API, so this reads
Shein's own cart API response in the page — resilient to layout changes, but the
field mapping may occasionally need a tweak if Shein changes their data shape.

> ⚠️ For your own personal account use. Reading Shein in an automated way is a
> grey area under their Terms of Service.

## Install (one time)
1. In Zaman Watch open **Settings → Shein cart import** and copy the **endpoint URL**
   and **API key**.
2. In Chrome go to `chrome://extensions`, enable **Developer mode** (top-right).
3. Click **Load unpacked** and select this `shein-extension` folder.
4. Click the extension icon → **Settings** → paste the endpoint URL and API key → they save automatically.

## Use
1. Open your **Shein cart** (or order detail) page and let it load fully.
2. Click the extension icon → **↻ Capture cart from this tab**.
3. Review the items (edit qty/price, remove any), set **FX → JOD**, and shipping /
   customs / clearance if known.
4. Click **Send to Zaman Purchasing**.
5. In Zaman Watch → **Purchases (Shein)** you'll see the new draft purchase — open it,
   check the landed cost, and click **Receive into stock**.

## If "Capture" finds nothing
Shein loads the cart via background requests; if none were seen yet, scroll/refresh
the cart page and press Capture again. As a fallback, use **Paste cart manually**
in the popup with a JSON array like:

```json
[{ "sku": "sj2405243357100038", "name": "Automatic watch", "qty": 2, "price": 12.5, "image_url": "https://..." }]
```

## Security
The API key only allows creating draft purchases for your business. Keep it private.
You can rotate it anytime from Zaman Watch Settings (regenerate) — then update the
extension with the new key.

## Files
- `manifest.json` — MV3 manifest
- `content.js` — injects the page hook, relays captured items to storage
- `inject.js` — runs in the page, hooks fetch/XHR to read Shein's cart response
- `popup.html` / `popup.js` — review & send UI

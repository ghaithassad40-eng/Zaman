const $ = (id) => document.getElementById(id);
let items = [];

const CFG_KEYS = ["endpoint", "apikey", "cur", "fx", "ship", "cust", "clr"];

function loadConfig() {
  chrome.storage.local.get(["zamanCfg", "zamanCart"], (res) => {
    const cfg = res.zamanCfg || {};
    $("endpoint").value = cfg.endpoint || "https://gbdktacfxleqgfxrsnfo.supabase.co/functions/v1/shein-import";
    $("apikey").value = cfg.apikey || "";
    $("cur").value = cfg.cur || "USD";
    $("fx").value = cfg.fx || "0.709";
    if (!cfg.endpoint || !cfg.apikey) $("cfg").open = true;
    if (res.zamanCart && Array.isArray(res.zamanCart.items)) {
      items = res.zamanCart.items;
      render();
    }
  });
}

function saveConfig() {
  chrome.storage.local.set({
    zamanCfg: {
      endpoint: $("endpoint").value.trim(),
      apikey: $("apikey").value.trim(),
      cur: $("cur").value.trim(),
      fx: $("fx").value.trim(),
    },
  });
}
CFG_KEYS.forEach((k) => $(k) && $(k).addEventListener("change", saveConfig));

function render() {
  const tb = $("items").querySelector("tbody");
  tb.innerHTML = "";
  $("empty").style.display = items.length ? "none" : "block";
  if (items.length) {
    const head = document.createElement("tr");
    head.innerHTML = "<th>Item</th><th>Qty</th><th>Price</th><th></th>";
    tb.appendChild(head);
  }
  items.forEach((it, i) => {
    const tr = document.createElement("tr");
    tr.innerHTML =
      `<td title="${it.sku}">${(it.name || "").slice(0, 28)}</td>` +
      `<td><input class="qty" type="number" value="${it.qty || 1}" data-i="${i}" data-f="qty"/></td>` +
      `<td><input class="price" type="number" step="0.01" value="${it.price || 0}" data-i="${i}" data-f="price"/></td>` +
      `<td><span class="rm" data-rm="${i}">✕</span></td>`;
    tb.appendChild(tr);
  });
  tb.querySelectorAll("input").forEach((el) =>
    el.addEventListener("input", (e) => {
      const { i, f } = e.target.dataset;
      items[i][f] = Number(e.target.value);
    }));
  tb.querySelectorAll(".rm").forEach((el) =>
    el.addEventListener("click", (e) => { items.splice(Number(e.target.dataset.rm), 1); render(); }));
}

$("refresh").addEventListener("click", () => {
  chrome.storage.local.get("zamanCart", (res) => {
    if (res.zamanCart && res.zamanCart.items && res.zamanCart.items.length) {
      items = res.zamanCart.items;
      render();
      setStatus(`Captured ${items.length} item(s).`, "ok");
    } else {
      setStatus("No cart data seen yet — open/scroll your Shein cart page, then press again.", "err");
    }
  });
});

$("loadPaste").addEventListener("click", () => {
  try {
    const parsed = JSON.parse($("paste").value);
    if (!Array.isArray(parsed)) throw new Error("Expected a JSON array");
    items = parsed.map((x) => ({
      sku: String(x.sku || x.goods_sn || ""),
      name: String(x.name || x.goods_name || ""),
      qty: Number(x.qty || x.quantity || 1),
      price: Number(x.price || x.salePrice || 0),
      image_url: x.image_url || x.image || null,
    })).filter((x) => x.sku && x.name);
    render();
    setStatus(`Loaded ${items.length} pasted item(s).`, "ok");
  } catch (e) { setStatus("Paste error: " + e.message, "err"); }
});

function setStatus(msg, cls) {
  const el = $("status");
  el.textContent = msg;
  el.className = "status " + (cls || "");
}

$("send").addEventListener("click", async () => {
  const endpoint = $("endpoint").value.trim();
  const apikey = $("apikey").value.trim();
  if (!endpoint || !apikey) { setStatus("Set the endpoint URL and API key in Settings.", "err"); $("cfg").open = true; return; }
  if (!items.length) { setStatus("No items to send.", "err"); return; }
  saveConfig();
  setStatus("Sending…");
  const payload = {
    reference: $("ref").value.trim() || undefined,
    src_currency: $("cur").value.trim() || "USD",
    fx_rate: Number($("fx").value) || 1,
    shipping_cost: Number($("ship").value) || 0,
    customs_cost: Number($("cust").value) || 0,
    clearance_cost: Number($("clr").value) || 0,
    items: items.map((it) => ({
      sku: it.sku, name: it.name, image_url: it.image_url || null,
      qty: Number(it.qty) || 1, unit_cost_src: Number(it.price) || 0,
    })),
  };
  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": apikey },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok || !data.ok) throw new Error(data.error || ("HTTP " + res.status));
    setStatus(`✓ ${data.doc_no}: ${data.items} item(s), ${data.products_created} new. Landed ${data.total_landed} JOD. Review it in Purchasing → Receive.`, "ok");
    items = [];
    chrome.storage.local.remove("zamanCart");
    render();
  } catch (e) { setStatus("Failed: " + e.message, "err"); }
});

loadConfig();

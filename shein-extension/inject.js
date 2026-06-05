// Runs in the PAGE context. Hooks fetch + XHR so we can read Shein's own cart
// API responses (resilient to DOM/layout changes) and forward cart items to
// the content script via window.postMessage.
(function () {
  function priceOf(v) {
    if (v == null) return 0;
    if (typeof v === "object") return Number(v.amount ?? v.value ?? v.usdAmount ?? 0);
    return Number(String(v).replace(/[^\d.]/g, "")) || 0;
  }

  // Walk any JSON looking for arrays of cart-item-like objects.
  function extractItems(root) {
    const out = [];
    const seen = new Set();
    function looksLikeItem(el) {
      return el && typeof el === "object" &&
        (el.goods_sn || el.goodsSn || el.sku || el.productRelationID || el.goods_id) &&
        (el.goods_name || el.goodsName || el.name || (el.product && el.product.goods_name));
    }
    function pushItem(el) {
      const p = el.product || el;
      const sku = String(el.goods_sn || el.goodsSn || el.sku || el.productRelationID || el.goods_id || "");
      const name = String(p.goods_name || el.goodsName || el.name || "");
      if (!sku || !name) return;
      const key = sku + "|" + name;
      if (seen.has(key)) return;
      seen.add(key);
      out.push({
        sku,
        name,
        image_url: p.goods_img || p.goodsImg || el.goods_img || el.image || el.goods_thumb || null,
        qty: Number(el.quantity || el.qty || 1) || 1,
        price: priceOf(el.salePrice || el.unit_price || el.price || p.salePrice || p.unit_price),
      });
    }
    function walk(node, depth) {
      if (depth > 8 || node == null || typeof node !== "object") return;
      if (Array.isArray(node)) {
        for (const el of node) {
          if (looksLikeItem(el)) pushItem(el);
          else walk(el, depth + 1);
        }
      } else {
        for (const k in node) walk(node[k], depth + 1);
      }
    }
    try { walk(root, 0); } catch (_) {}
    return out;
  }

  function maybeEmit(data, url) {
    const items = extractItems(data);
    if (items.length) window.postMessage({ __zamanShein: true, items, url }, "*");
  }

  const origFetch = window.fetch;
  window.fetch = async function (...args) {
    const res = await origFetch.apply(this, args);
    try {
      const ct = res.headers.get("content-type") || "";
      if (ct.includes("json")) {
        res.clone().json().then((d) => maybeEmit(d, (args[0] && args[0].url) || String(args[0]))).catch(() => {});
      }
    } catch (_) {}
    return res;
  };

  const origOpen = XMLHttpRequest.prototype.open;
  const origSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (m, url) { this.__zurl = url; return origOpen.apply(this, arguments); };
  XMLHttpRequest.prototype.send = function () {
    this.addEventListener("load", function () {
      try {
        const ct = this.getResponseHeader("content-type") || "";
        if (ct.includes("json")) maybeEmit(JSON.parse(this.responseText), this.__zurl);
      } catch (_) {}
    });
    return origSend.apply(this, arguments);
  };
})();

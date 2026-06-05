// Isolated-world content script. Injects inject.js into the page and relays the
// captured cart items into extension storage for the popup to read.
(function () {
  const s = document.createElement("script");
  s.src = chrome.runtime.getURL("inject.js");
  (document.head || document.documentElement).appendChild(s);
  s.onload = () => s.remove();

  window.addEventListener("message", (e) => {
    if (e.source !== window) return;
    const d = e.data;
    if (d && d.__zamanShein && Array.isArray(d.items) && d.items.length) {
      chrome.storage.local.set({
        zamanCart: { items: d.items, capturedAt: Date.now(), url: d.url || "" },
      });
    }
  });
})();

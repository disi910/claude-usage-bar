(() => {
  const LIMIT = 45;
  const WINDOW_MS = 5 * 60 * 60 * 1000;
  const DEBOUNCE_MS = 800;

  let lastRecord = 0;
  let bar, fill, text;

  function injectBar() {
    if (document.getElementById("claude-usage-bar")) return;
    bar = document.createElement("div");
    bar.id = "claude-usage-bar";
    bar.innerHTML = `
      <div class="cub-fill"></div>
      <div class="cub-text">
        <span class="cub-count">0 / ${LIMIT}</span>
        <span class="cub-sep">·</span>
        <span class="cub-reset">resets —</span>
      </div>`;
    document.body.appendChild(bar);
    fill = bar.querySelector(".cub-fill");
    text = {
      count: bar.querySelector(".cub-count"),
      reset: bar.querySelector(".cub-reset"),
    };
  }

  function fmtDuration(ms) {
    if (ms <= 0) return "—";
    const total = Math.floor(ms / 1000);
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    if (h > 0) return `${h}h ${m}m`;
    if (m > 0) return `${m}m ${s.toString().padStart(2, "0")}s`;
    return `${s}s`;
  }

  async function getSends() {
    const { sends = [] } = await chrome.storage.local.get("sends");
    return sends;
  }

  async function setSends(sends) {
    await chrome.storage.local.set({ sends });
  }

  async function recordSend() {
    const now = Date.now();
    if (now - lastRecord < DEBOUNCE_MS) return;
    lastRecord = now;
    const sends = await getSends();
    sends.push(now);
    await setSends(sends);
    render();
  }

  async function render() {
    if (!bar) return;
    const now = Date.now();
    const sends = (await getSends()).filter((t) => now - t < WINDOW_MS);
    const used = sends.length;
    const pct = Math.min(100, (used / LIMIT) * 100);
    fill.style.width = pct + "%";
    text.count.textContent = `${used} / ${LIMIT}`;
    if (used === 0) {
      text.reset.textContent = "resets —";
    } else {
      const oldest = Math.min(...sends);
      const remaining = WINDOW_MS - (now - oldest);
      text.reset.textContent = `resets in ${fmtDuration(remaining)}`;
    }
  }

  function isComposer(el) {
    if (!el) return false;
    if (el.getAttribute && el.getAttribute("contenteditable") === "true") return true;
    return !!el.closest?.('div[contenteditable="true"]');
  }

  function hookEvents() {
    document.addEventListener(
      "keydown",
      (e) => {
        if (e.key === "Enter" && !e.shiftKey && isComposer(document.activeElement)) {
          recordSend();
        }
      },
      true
    );

    document.addEventListener(
      "click",
      (e) => {
        const btn = e.target.closest?.("button");
        if (!btn) return;
        const label = (btn.getAttribute("aria-label") || "").toLowerCase();
        if (label.includes("send")) recordSend();
      },
      true
    );
  }

  function start() {
    injectBar();
    hookEvents();
    render();
    setInterval(render, 1000);
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === "local" && changes.sends) render();
    });
    new MutationObserver(() => injectBar()).observe(document.body, {
      childList: true,
      subtree: false,
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
})();

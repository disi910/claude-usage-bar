(() => {
  const POLL_MS = 30 * 1000;
  let orgId = null;
  let bar, fill, text;
  let lastData = null;
  let enabled = true;

  function removeBar() {
    const existing = document.getElementById("claude-usage-bar");
    if (existing) existing.remove();
    bar = fill = text = null;
  }

  function injectBar() {
    if (!enabled) return;
    if (document.getElementById("claude-usage-bar")) return;
    bar = document.createElement("div");
    bar.id = "claude-usage-bar";
    bar.innerHTML = `
      <div class="cub-fill"></div>
      <div class="cub-text">
        <span class="cub-pct">— %</span>
        <span class="cub-sep">·</span>
        <span class="cub-reset">loading…</span>
      </div>`;
    document.body.appendChild(bar);
    fill = bar.querySelector(".cub-fill");
    text = {
      pct: bar.querySelector(".cub-pct"),
      reset: bar.querySelector(".cub-reset"),
    };
  }

  function fmtDuration(ms) {
    if (ms <= 0) return "now";
    const total = Math.floor(ms / 1000);
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m`;
  }

  async function discoverOrgId() {
    if (orgId) return orgId;
    try {
      const res = await fetch("/api/organizations", { credentials: "include" });
      if (!res.ok) return null;
      const orgs = await res.json();
      if (Array.isArray(orgs) && orgs.length > 0) {
        orgId = orgs[0].uuid || orgs[0].id;
        return orgId;
      }
    } catch (e) {
      console.warn("[usage-bar] org discovery failed", e);
    }
    return null;
  }

  async function fetchUsage() {
    const id = await discoverOrgId();
    if (!id) return null;
    try {
      const res = await fetch(`/api/organizations/${id}/usage`, {
        credentials: "include",
      });
      if (!res.ok) return null;
      return await res.json();
    } catch (e) {
      console.warn("[usage-bar] usage fetch failed", e);
      return null;
    }
  }

  function renderFromData(data) {
    if (!bar) return;
    if (!data || !data.five_hour) {
      text.pct.textContent = "— %";
      text.reset.textContent = "no data";
      fill.style.width = "0%";
      return;
    }
    const fh = data.five_hour;
    const pct = Math.max(0, Math.min(100, fh.utilization || 0));
    fill.style.width = pct + "%";
    text.pct.textContent = `${Math.round(pct)} %`;
    const resetMs = new Date(fh.resets_at).getTime() - Date.now();
    text.reset.textContent = `resets in ${fmtDuration(resetMs)}`;
    bar.classList.toggle("cub-full", pct >= 100);
  }

  async function tick() {
    const data = await fetchUsage();
    if (data) lastData = data;
    renderFromData(lastData);
  }

  function startCountdownLoop() {
    setInterval(() => {
      if (lastData) renderFromData(lastData);
    }, 1000);
  }

  async function start() {
    const stored = await chrome.storage.local.get("enabled");
    enabled = stored.enabled !== false;

    if (enabled) {
      injectBar();
      renderFromData(lastData);
    }

    tick();
    setInterval(tick, POLL_MS);
    startCountdownLoop();

    new MutationObserver(() => injectBar()).observe(document.body, {
      childList: true,
      subtree: false,
    });

    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== "local" || !changes.enabled) return;
      enabled = changes.enabled.newValue !== false;
      if (enabled) {
        injectBar();
        renderFromData(lastData);
      } else {
        removeBar();
      }
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
})();

(() => {
  const POLL_MS = 30 * 1000;
  const CACHE_TTL_MS = 5 * 60 * 1000;
  const CONTEXT_WINDOW = 200_000;
  const CHARS_PER_TOKEN = 4;

  let orgId = null;
  let root = null;
  let bar, fill, pctLabel, resetLabel, panel, donut, donutPct, donutTip, hourglass, hourglassLabel, hourglassTip;
  let lastUsage = null;
  let enabled = true;
  let cacheStartedAt = 0;
  let lastAssistantSignature = "";
  let composerObserver = null;
  let conversationObserver = null;

  // ---------- API ----------

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

  function currentConversationId() {
    const m = location.pathname.match(/\/chat\/([0-9a-f-]{36})/i);
    return m ? m[1] : null;
  }

  let lastConvFetch = { id: null, ts: 0, tokens: null };
  async function fetchConversationTokens() {
    const convId = currentConversationId();
    if (!convId) return null;
    const now = Date.now();
    // throttle: refetch at most every 4s for the same conversation
    if (lastConvFetch.id === convId && now - lastConvFetch.ts < 4000) {
      return lastConvFetch.tokens;
    }
    const id = await discoverOrgId();
    if (!id) return null;
    try {
      const url = `/api/organizations/${id}/chat_conversations/${convId}?tree=true&render_all_content=true`;
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) return null;
      const data = await res.json();
      const tokens = extractTokensFromConversation(data);
      lastConvFetch = { id: convId, ts: now, tokens };
      return tokens;
    } catch (e) {
      console.warn("[usage-bar] conversation fetch failed", e);
      return null;
    }
  }

  function extractTokensFromConversation(data) {
    // Walks the conversation tree and sums any token-count-shaped numeric fields.
    // Defensive: Anthropic's frontend payload shape is undocumented and may change,
    // so we look for several common field names.
    if (!data) return null;
    const messages =
      data.chat_messages ||
      data.messages ||
      (Array.isArray(data.tree) ? data.tree : null) ||
      [];
    if (!Array.isArray(messages) || messages.length === 0) return null;
    let total = 0;
    let foundAny = false;
    for (const m of messages) {
      const t = readMsgTokens(m);
      if (t != null) {
        total += t;
        foundAny = true;
      }
    }
    return foundAny ? total : null;
  }

  function readMsgTokens(m) {
    if (!m || typeof m !== "object") return null;
    const candidates = [
      m.token_count,
      m.num_tokens,
      m.tokens,
      m.input_tokens,
      m.usage && m.usage.input_tokens,
      m.usage && m.usage.output_tokens,
      m.metadata && m.metadata.tokens,
    ];
    let sum = 0;
    let any = false;
    for (const c of candidates) {
      if (typeof c === "number" && isFinite(c) && c >= 0) {
        sum += c;
        any = true;
      }
    }
    return any ? sum : null;
  }

  // ---------- formatting ----------

  function fmtDuration(ms) {
    if (ms <= 0) return "now";
    const total = Math.floor(ms / 1000);
    const d = Math.floor(total / 86400);
    const h = Math.floor((total % 86400) / 3600);
    const m = Math.floor((total % 3600) / 60);
    if (d > 0) return `${d}d`;
    if (h > 0) return `${h}h`;
    return `${m}m`;
  }

  function fmtClock(ms) {
    if (ms <= 0) return "0:00";
    const total = Math.floor(ms / 1000);
    const m = Math.floor(total / 60);
    const s = total % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  }

  function pickRow(data, ...keys) {
    if (!data) return null;
    for (const k of keys) {
      if (data[k]) return data[k];
    }
    return null;
  }

  function rowPct(row) {
    if (!row) return null;
    const v = row.utilization ?? row.usage ?? row.percent;
    return typeof v === "number" ? Math.max(0, Math.min(100, v)) : null;
  }

  function rowResetMs(row) {
    if (!row || !row.resets_at) return null;
    const t = new Date(row.resets_at).getTime() - Date.now();
    return isNaN(t) ? null : t;
  }

  // ---------- DOM ----------

  function buildRoot() {
    const el = document.createElement("div");
    el.id = "claude-usage-bar";
    el.innerHTML = `
      <div class="cub-bar" data-cub-bar>
        <div class="cub-fill"></div>
        <div class="cub-text">
          <span class="cub-pct">— %</span>
          <span class="cub-sep">·</span>
          <span class="cub-reset">loading…</span>
        </div>
        <div class="cub-panel" role="tooltip">
          <div class="cub-panel-head">
            <span>Plan usage</span>
          </div>
          <div class="cub-panel-row" data-row="five_hour">
            <div class="cub-panel-row-head"><span class="cub-panel-label">5-hour limit</span><span class="cub-panel-meta">—</span></div>
            <div class="cub-panel-track"><div class="cub-panel-fill"></div></div>
          </div>
          <div class="cub-panel-row" data-row="weekly_all">
            <div class="cub-panel-row-head"><span class="cub-panel-label">Weekly · all models</span><span class="cub-panel-meta">—</span></div>
            <div class="cub-panel-track"><div class="cub-panel-fill"></div></div>
          </div>
          <div class="cub-panel-row" data-row="weekly_opus">
            <div class="cub-panel-row-head"><span class="cub-panel-label">Weekly · Claude Opus</span><span class="cub-panel-meta">—</span></div>
            <div class="cub-panel-track"><div class="cub-panel-fill"></div></div>
          </div>
          <div class="cub-panel-row" data-row="routines">
            <div class="cub-panel-row-head"><span class="cub-panel-label">Routines</span><span class="cub-panel-meta">—</span></div>
            <div class="cub-panel-track"><div class="cub-panel-fill"></div></div>
          </div>
        </div>
      </div>
      <div class="cub-donut" data-cub-donut tabindex="0" aria-label="Context window usage">
        <svg viewBox="0 0 32 32" width="28" height="28" aria-hidden="true">
          <circle cx="16" cy="16" r="13" fill="none" stroke="currentColor" stroke-width="3" opacity="0.25"></circle>
          <circle class="cub-donut-arc" cx="16" cy="16" r="13" fill="none" stroke="currentColor" stroke-width="3"
                  stroke-linecap="round" stroke-dasharray="81.68" stroke-dashoffset="81.68"
                  transform="rotate(-90 16 16)"></circle>
        </svg>
        <span class="cub-donut-pct">0%</span>
        <div class="cub-tooltip" role="tooltip">
          <div>Context &amp; token usage:</div>
          <div data-tip="pct">0% of context window used</div>
          <div data-tip="ctx">0 / 200k context length</div>
          <div data-tip="total">0 total tokens used</div>
        </div>
      </div>
      <div class="cub-hourglass" data-cub-hourglass tabindex="0" hidden>
        <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
          <path fill="currentColor" d="M3 1.5a.5.5 0 0 1 .5-.5h9a.5.5 0 0 1 0 1H12v2a4 4 0 0 1-1.534 3.147L9.05 8l1.416 .853A4 4 0 0 1 12 12v2h.5a.5.5 0 0 1 0 1h-9a.5.5 0 0 1 0-1H4v-2a4 4 0 0 1 1.534-3.147L6.95 8 5.534 7.147A4 4 0 0 1 4 4V2h-.5a.5.5 0 0 1-.5-.5z"></path>
        </svg>
        <span class="cub-hourglass-label">5:00</span>
        <div class="cub-tooltip" role="tooltip">
          <div data-tip="cache">Prompt cache expires in 5:00</div>
          <div>Cached tokens save ~90% input cost</div>
        </div>
      </div>
    `;
    return el;
  }

  function findComposerRect() {
    const editor =
      document.querySelector('[contenteditable="true"][role="textbox"]') ||
      document.querySelector('[contenteditable="true"]');
    if (!editor) return null;
    return editor.getBoundingClientRect();
  }

  function mount() {
    if (!enabled) return;
    if (root && document.body.contains(root)) return;

    root = buildRoot();
    bindRefs();

    document.body.appendChild(root);
    syncPosition();

    renderUsage(lastUsage);
    renderContext();
    renderCache();
  }

  function syncPosition() {
    if (!root) return;
    const rect = findComposerRect();
    const composerWidth = rect && rect.width > 0 ? rect.width : 0;
    const composerCenterX = rect && rect.width > 0 ? rect.left + rect.width / 2 : window.innerWidth / 2;
    root.style.left = `${composerCenterX}px`;
    root.style.top = "10px";
    root.style.bottom = "auto";
    root.style.width = `${Math.min(760, Math.max(360, composerWidth || window.innerWidth * 0.6))}px`;
    root.style.transform = "translateX(-50%)";
    // Bar is at the top, so tooltips/panel must always flip downward.
    root.classList.add("cub-flip");
  }

  function unmount() {
    if (root && root.parentElement) root.parentElement.removeChild(root);
    root = null;
  }

  function bindRefs() {
    bar = root.querySelector("[data-cub-bar]");
    fill = root.querySelector(".cub-fill");
    pctLabel = root.querySelector(".cub-pct");
    resetLabel = root.querySelector(".cub-reset");
    panel = root.querySelector(".cub-panel");
    donut = root.querySelector("[data-cub-donut]");
    donutPct = root.querySelector(".cub-donut-pct");
    donutTip = root.querySelector("[data-cub-donut] .cub-tooltip");
    hourglass = root.querySelector("[data-cub-hourglass]");
    hourglassLabel = root.querySelector(".cub-hourglass-label");
    hourglassTip = root.querySelector("[data-cub-hourglass] .cub-tooltip");
  }

  // ---------- rendering ----------

  function setRow(name, pct, resetMs) {
    const row = panel.querySelector(`[data-row="${name}"]`);
    if (!row) return;
    const meta = row.querySelector(".cub-panel-meta");
    const fillEl = row.querySelector(".cub-panel-fill");
    if (pct == null) {
      meta.textContent = "—";
      fillEl.style.width = "0%";
      return;
    }
    const parts = [`${Math.round(pct)}%`];
    if (resetMs != null) parts.push(`resets ${fmtDuration(resetMs)}`);
    meta.textContent = parts.join(" · ");
    fillEl.style.width = `${pct}%`;
  }

  function renderUsage(data) {
    if (!root) return;
    const fh = pickRow(data, "five_hour");
    const fhPct = rowPct(fh);
    if (fhPct == null) {
      pctLabel.textContent = "— %";
      resetLabel.textContent = "no data";
      fill.style.width = "0%";
      bar.classList.remove("cub-full");
    } else {
      const resetMs = rowResetMs(fh);
      fill.style.width = `${fhPct}%`;
      pctLabel.textContent = `${Math.round(fhPct)} %`;
      resetLabel.textContent = resetMs != null ? `resets in ${fmtDuration(resetMs)}` : "5-hour limit";
      bar.classList.toggle("cub-full", fhPct >= 100);
    }

    setRow("five_hour", fhPct, rowResetMs(fh));
    const weeklyAll = pickRow(data, "seven_day");
    setRow("weekly_all", rowPct(weeklyAll), rowResetMs(weeklyAll));
    const weeklyOpus = pickRow(data, "seven_day_opus");
    setRow("weekly_opus", rowPct(weeklyOpus), rowResetMs(weeklyOpus));
    const routines = pickRow(data, "seven_day_omelette", "routines", "scheduled_tasks");
    setRow("routines", rowPct(routines), rowResetMs(routines));
  }

  function readConversationText() {
    const containers = document.querySelectorAll(
      '[data-testid^="message-"], [data-test-render-count], div[class*="font-claude-message"], div[class*="font-user-message"]'
    );
    let text = "";
    containers.forEach((n) => {
      const t = n.innerText || n.textContent || "";
      text += t + "\n";
    });
    return text;
  }

  function paintContext(tokens, source) {
    if (!root) return;
    const pct = Math.max(0, Math.min(100, (tokens / CONTEXT_WINDOW) * 100));
    const arc = root.querySelector(".cub-donut-arc");
    const circumference = 2 * Math.PI * 13;
    if (arc) arc.setAttribute("stroke-dashoffset", String(circumference * (1 - pct / 100)));
    if (donutPct) donutPct.textContent = `${Math.round(pct)}%`;
    const tk = formatTokens(tokens);
    const suffix = source === "estimate" ? " (estimate)" : "";
    setTip(donutTip, "pct", `${Math.round(pct)}% of context window used${suffix}`);
    setTip(donutTip, "ctx", `${tk} / 200k context length`);
    setTip(donutTip, "total", `${tk} total tokens used${suffix}`);
  }

  function renderContext() {
    if (!root) return;
    // 1. Paint the fast heuristic immediately so the donut never goes stale
    const text = readConversationText();
    const estTokens = Math.ceil(text.length / CHARS_PER_TOKEN);
    paintContext(estTokens, "estimate");
    // 2. In the background, try the conversation API for exact numbers
    fetchConversationTokens().then((exact) => {
      if (typeof exact === "number" && exact > 0) paintContext(exact, "exact");
    });
  }

  function formatTokens(n) {
    if (n < 1000) return `${n}`;
    return `${Math.round(n / 100) / 10}k`.replace(".0k", "k");
  }

  function setTip(scope, key, text) {
    if (!scope) return;
    const el = scope.querySelector(`[data-tip="${key}"]`);
    if (el) el.textContent = text;
  }

  function renderCache() {
    if (!root || !hourglass) return;
    if (!cacheStartedAt) {
      hourglass.hidden = true;
      return;
    }
    const remaining = CACHE_TTL_MS - (Date.now() - cacheStartedAt);
    if (remaining <= 0) {
      hourglass.hidden = true;
      cacheStartedAt = 0;
      return;
    }
    hourglass.hidden = false;
    hourglassLabel.textContent = fmtClock(remaining);
    setTip(hourglassTip, "cache", `Prompt cache expires in ${fmtClock(remaining)}`);
  }

  // ---------- observers ----------

  function watchConversation() {
    if (conversationObserver) conversationObserver.disconnect();
    const target = document.querySelector("main") || document.body;
    let pending = null;
    conversationObserver = new MutationObserver(() => {
      if (pending) cancelAnimationFrame(pending);
      pending = requestAnimationFrame(() => {
        renderContext();
        maybeTriggerCache();
      });
    });
    conversationObserver.observe(target, { childList: true, subtree: true, characterData: true });
  }

  function maybeTriggerCache() {
    const assistants = document.querySelectorAll('div[class*="font-claude-message"]');
    if (!assistants.length) return;
    const last = assistants[assistants.length - 1];
    const sig = `${assistants.length}:${(last.textContent || "").length}`;
    if (sig !== lastAssistantSignature) {
      lastAssistantSignature = sig;
      cacheStartedAt = Date.now();
      renderCache();
    }
  }

  function watchComposerHost() {
    if (composerObserver) composerObserver.disconnect();
    let pending = null;
    composerObserver = new MutationObserver(() => {
      if (!enabled) return;
      if (pending) return;
      pending = requestAnimationFrame(() => {
        pending = null;
        if (!root || !document.body.contains(root)) mount();
        else syncPosition();
      });
    });
    composerObserver.observe(document.body, { childList: true, subtree: true });
  }

  function rafLoop() {
    if (root && document.body.contains(root)) syncPosition();
    requestAnimationFrame(rafLoop);
  }

  // ---------- lifecycle ----------

  async function tick() {
    const data = await fetchUsage();
    if (data) lastUsage = data;
    renderUsage(lastUsage);
  }

  async function start() {
    const stored = await chrome.storage.local.get("enabled");
    enabled = stored.enabled !== false;

    if (enabled) mount();
    tick();
    setInterval(tick, POLL_MS);
    setInterval(() => {
      if (lastUsage) renderUsage(lastUsage);
      renderCache();
    }, 1000);
    window.addEventListener("resize", syncPosition);

    watchComposerHost();
    watchConversation();
    rafLoop();

    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== "local" || !changes.enabled) return;
      enabled = changes.enabled.newValue !== false;
      if (enabled) mount();
      else unmount();
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
})();

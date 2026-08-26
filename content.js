(() => {
  const POLL_MS = 30 * 1000;
  const CACHE_TTL_MS = 5 * 60 * 1000;
  const DEFAULT_CONTEXT_WINDOW = 200_000;

  // Heuristic tokenizer coefficients. CJK scripts tokenize near one token per
  // character; spaced scripts near 1.3 tokens per word; long unspaced runs
  // (code, URLs) split roughly every 3.5 characters.
  const TOKENS_PER_WORD = 1.32;
  const TOKENS_PER_CJK_CHAR = 1.0;
  const LONG_WORD_CHARS = 3.5;
  const MSG_OVERHEAD_TOKENS = 6;
  const IMAGE_TOKENS = 1500;

  let orgId = null;
  let root = null;
  let bar, fill, pctLabel, resetLabel, panel, donut, donutPct, donutTip, hourglass, hourglassLabel, hourglassTip;
  let lastUsage = null;
  let enabled = true;
  let position = "top"; // "top" | "composer"
  let mountedMode = null; // actual mode in the DOM ("top" | "inline")
  let cacheStartedAt = 0;

  // ---------- i18n ----------

  function t(key, subs) {
    const msg = chrome.i18n.getMessage(key, subs);
    return msg || key;
  }

  function esc(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
  }
  let lastAssistantSignature = "";
  let composerObserver = null;
  let conversationObserver = null;

  // ---------- API ----------

  let orgInfo = null;
  async function discoverOrgId() {
    if (orgId) return orgId;
    try {
      const res = await fetch("/api/organizations", { credentials: "include" });
      if (!res.ok) return null;
      const orgs = await res.json();
      if (Array.isArray(orgs) && orgs.length > 0) {
        orgInfo = orgs[0];
        orgId = orgs[0].uuid || orgs[0].id;
        return orgId;
      }
    } catch (e) {
      console.warn("[usage-bar] org discovery failed", e);
    }
    return null;
  }

  // Paid plans get larger context windows on claude.ai. The org payload
  // advertises the plan through capability/tier strings.
  function isPaidPlan() {
    if (!orgInfo) return false;
    const fields = []
      .concat(Array.isArray(orgInfo.capabilities) ? orgInfo.capabilities : [])
      .concat([orgInfo.rate_limit_tier, orgInfo.billing_type, orgInfo.plan_type, orgInfo.subscription_tier]);
    return fields.some(
      (f) => typeof f === "string" && /pro|max|team|enterprise|raven/i.test(f)
    );
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

  let lastConvFetch = { id: null, ts: 0, stats: null };
  async function fetchConversationStats() {
    const convId = currentConversationId();
    if (!convId) return null;
    const now = Date.now();
    // throttle: refetch at most every 4s for the same conversation
    if (lastConvFetch.id === convId && now - lastConvFetch.ts < 4000) {
      return lastConvFetch.stats;
    }
    const id = await discoverOrgId();
    if (!id) return null;
    try {
      // Query params mirror what the claude.ai frontend itself sends (July 2026).
      const url = `/api/organizations/${id}/chat_conversations/${convId}?tree=True&rendering_mode=messages&render_all_tools=true&consistency=eventual`;
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) return null;
      const data = await res.json();
      const stats = extractConversationStats(data);
      lastConvFetch = { id: convId, ts: now, stats };
      return stats;
    } catch (e) {
      console.warn("[usage-bar] conversation fetch failed", e);
      return null;
    }
  }

  // Returns { contextTokens, totalTokens, window, source } or null.
  // contextTokens covers only the current branch of the conversation tree
  // (what actually occupies the context window); totalTokens sums every
  // message ever sent, including abandoned branches after edits/retries.
  // The payload carries no token counts (verified July 2026), so both are
  // heuristic estimates over the full payload text, which, unlike the DOM,
  // includes tool calls/results, attachments and thinking blocks.
  // Thinking from earlier turns is stripped from Claude's context, so it
  // counts toward the total but only the latest turn's thinking counts
  // toward context occupancy.
  function extractConversationStats(data) {
    if (!data) return null;
    const messages =
      data.chat_messages ||
      data.messages ||
      (Array.isArray(data.tree) ? data.tree : null) ||
      [];
    if (!Array.isArray(messages) || messages.length === 0) return null;

    const branch = currentBranchMessages(data, messages);
    const branchCats = analyzeMessages(branch, "latest");
    const allCats = analyzeMessages(messages, "all");
    return {
      contextTokens: branchCats.total,
      totalTokens: allCats.total,
      window: detectContextWindow(data),
      cats: branchCats,
      source: "estimate",
    };
  }

  function detectContextWindow(data) {
    const candidates = [
      data.context_window,
      data.context_window_size,
      data.model_context_window,
      data.settings && data.settings.context_window,
    ];
    for (const c of candidates) {
      if (typeof c === "number" && isFinite(c) && c >= 10_000) return c;
    }
    // Per the Claude help center (July 2026), on claude.ai chat:
    //   - Sonnet 5 / Fable 5:            1M tokens on paid plans
    //   - Opus 4.6-4.8 and Sonnet 4.6:   500k tokens on paid plans
    //   - everything else, or free plan: 200k tokens
    // The payload carries the model slug (e.g. "claude-sonnet-5").
    const model = String(data.model || "");
    if (/1m|million|extended/i.test(model)) return 1_000_000;
    if (isPaidPlan()) {
      if (/sonnet-5|fable-5|mythos-5/i.test(model)) return 1_000_000;
      if (/opus-4-[678]|sonnet-4-6/i.test(model)) return 500_000;
    }
    return DEFAULT_CONTEXT_WINDOW;
  }

  // Follows parent links from the current leaf to isolate the active branch.
  // Falls back to all messages when the payload has no tree metadata.
  function currentBranchMessages(data, messages) {
    const leaf =
      data.current_leaf_message_uuid || data.current_leaf_uuid || data.current_leaf || null;
    if (!leaf) return messages;
    const byId = new Map();
    for (const m of messages) {
      const id = m && (m.uuid || m.id);
      if (id) byId.set(id, m);
    }
    const chain = [];
    let cur = byId.get(leaf);
    let guard = 0;
    while (cur && guard++ < 10_000) {
      chain.push(cur);
      cur = byId.get(cur.parent_message_uuid || cur.parent_uuid || cur.parent);
    }
    return chain.length ? chain : messages;
  }

  // Per-category token analysis. thinkingMode: "all" counts thinking in every
  // message; "latest" counts it only for the final assistant message (prior
  // thinking is stripped from Claude's context).
  // Returns { user, assistant, thinking, tools, files, total }.
  function analyzeMessages(messages, thinkingMode) {
    const cats = { user: 0, assistant: 0, thinking: 0, tools: 0, files: 0 };
    let lastAssistant = -1;
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i];
      if (m && (m.sender === "assistant" || m.role === "assistant")) {
        lastAssistant = i;
        break;
      }
    }
    for (let i = 0; i < messages.length; i++) {
      const m = messages[i];
      if (!m || typeof m !== "object") continue;
      const parts = collectMessageParts(m);
      const isUser = m.sender === "human" || m.role === "user" || m.role === "human";
      cats[isUser ? "user" : "assistant"] += MSG_OVERHEAD_TOKENS + estimateTokens(parts.text);
      if (thinkingMode === "all" || i === lastAssistant) {
        cats.thinking += estimateTokens(parts.thinking);
      }
      cats.tools += estimateTokens(parts.tools);
      cats.files += estimateTokens(parts.files) + IMAGE_TOKENS * countMessageImages(m);
    }
    cats.total = cats.user + cats.assistant + cats.thinking + cats.tools + cats.files;
    return cats;
  }

  // Splits a message's payload into token categories: visible text, thinking,
  // tool traffic (tool_use inputs + tool_result outputs), and file/attachment
  // content extracted server-side.
  function collectMessageParts(m) {
    const parts = { text: "", thinking: "", tools: "", files: "" };
    const push = (k, s) => {
      if (typeof s === "string" && s) parts[k] += s + "\n";
    };
    push("text", m.text);
    const blocks = Array.isArray(m.content) ? m.content : [];
    for (const b of blocks) {
      if (!b || typeof b !== "object") continue;
      push("thinking", b.thinking);
      if (b.input != null && typeof b.input === "object") push("tools", JSON.stringify(b.input));
      const isTool = b.type === "tool_use" || b.type === "tool_result";
      push(isTool ? "tools" : "text", b.text);
      if (typeof b.content === "string") push("tools", b.content);
      else if (Array.isArray(b.content)) {
        for (const n of b.content) {
          if (n && typeof n === "object") push("tools", n.text);
          else if (typeof n === "string") push("tools", n);
        }
      }
    }
    const atts = Array.isArray(m.attachments) ? m.attachments : [];
    for (const a of atts) {
      if (a && typeof a === "object") push("files", a.extracted_content || a.text);
    }
    return parts;
  }

  function countMessageImages(m) {
    const files = []
      .concat(Array.isArray(m.files) ? m.files : [])
      .concat(Array.isArray(m.files_v2) ? m.files_v2 : []);
    return files.filter((f) => {
      if (!f || typeof f !== "object") return false;
      const kind = f.file_kind || f.kind || f.type || "";
      const name = f.file_name || f.name || "";
      return /image/i.test(kind) || /\.(png|jpe?g|gif|webp|heic)$/i.test(name);
    }).length;
  }

  // Word/script-aware token estimate. Considerably closer to Claude's real
  // tokenizer than flat chars/4, especially for CJK text and code.
  function estimateTokens(text) {
    if (!text) return 0;
    const cjkRe = /[\u3000-\u9fff\uac00-\ud7af\u3040-\u30ff\uf900-\ufaff]/g;
    const cjk = (text.match(cjkRe) || []).length;
    const rest = text.replace(cjkRe, " ");
    let t = cjk * TOKENS_PER_CJK_CHAR;
    const words = rest.match(/\S+/g) || [];
    for (const w of words) {
      if (/^\d+$/.test(w)) {
        // Digit runs tokenize in small groups (~2-3 digits per token).
        t += Math.max(1, w.length / 2.7);
      } else if (w.length <= 9) {
        t += TOKENS_PER_WORD;
      } else {
        t += w.length / LONG_WORD_CHARS;
      }
    }
    return Math.round(t);
  }

  // ---------- formatting ----------

  function fmtDuration(ms) {
    if (ms <= 0) return t("now");
    const total = Math.floor(ms / 1000);
    const d = Math.floor(total / 86400);
    const h = Math.floor((total % 86400) / 3600);
    const m = Math.floor((total % 3600) / 60);
    if (d > 0) return t("unitDays", [String(d)]);
    if (h > 0) return t("unitHours", [String(h)]);
    return t("unitMinutes", [String(m)]);
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
    if (row.is_enabled === false) return null;
    const v = row.utilization ?? row.usage ?? row.percent;
    if (typeof v === "number" && isFinite(v)) return Math.max(0, Math.min(100, v));
    // Spending-shaped rows (extra credits): credits used vs. monthly limit.
    const used = row.used_credits ?? row.current_spending ?? row.amount_spent ?? row.spent ?? row.used;
    const limit = row.monthly_limit ?? row.budget_limit ?? row.spending_limit ?? row.budget ?? row.limit ?? row.total;
    if (typeof used === "number" && typeof limit === "number" && isFinite(used) && limit > 0) {
      return Math.max(0, Math.min(100, (used / limit) * 100));
    }
    return null;
  }

  function rowResetMs(row) {
    if (!row || !row.resets_at) return null;
    const t = new Date(row.resets_at).getTime() - Date.now();
    return isNaN(t) ? null : t;
  }

  // ---------- DOM ----------

  function panelTemplate() {
    const row = (name, label) => `
          <div class="cub-panel-row" data-row="${name}">
            <div class="cub-panel-row-head"><span class="cub-panel-label">${esc(label)}</span><span class="cub-panel-meta">—</span></div>
            <div class="cub-panel-track"><div class="cub-panel-fill"></div></div>
          </div>`;
    return `
        <div class="cub-panel" role="tooltip">
          <div class="cub-panel-head">
            <span>${esc(t("planUsage"))}</span>
          </div>
          ${row("five_hour", t("fiveHourLimit"))}
          ${row("weekly_all", t("weeklyAllModels"))}
          ${row("extra", t("extraCredits"))}
          ${row("routines", t("routines"))}
        </div>`;
  }

  const CAT_ORDER = ["user", "assistant", "thinking", "tools", "files"];

  function donutTemplate() {
    const catRow = (key, label) => `
          <div class="cub-cat" data-cat="${key}">
            <div class="cub-cat-head"><span class="cub-cat-dot"></span><span>${esc(label)}</span><span class="cub-cat-val">0</span></div>
            <div class="cub-cat-track"><div class="cub-cat-fill"></div></div>
          </div>`;
    // r = 100 / 2π so the circumference is exactly 100 and dasharray works in %.
    const seg = (key) => `<circle data-seg="${key}" cx="18" cy="18" r="15.9155" fill="none"
            stroke-width="4" stroke-dasharray="0 100" stroke-dashoffset="25"></circle>`;
    return `
      <div class="cub-donut" data-cub-donut tabindex="0" aria-label="${esc(t("contextAriaLabel"))}">
        <svg viewBox="0 0 32 32" width="28" height="28" aria-hidden="true">
          <circle cx="16" cy="16" r="13" fill="none" stroke="currentColor" stroke-width="3" opacity="0.25"></circle>
          <circle class="cub-donut-arc" cx="16" cy="16" r="13" fill="none" stroke="currentColor" stroke-width="3"
                  stroke-linecap="round" stroke-dasharray="81.68" stroke-dashoffset="81.68"
                  transform="rotate(-90 16 16)"></circle>
        </svg>
        <span class="cub-donut-badge" hidden>!</span>
        <span class="cub-donut-pct">0%</span>
        <div class="cub-tooltip cub-ctx-tip" role="tooltip">
          <div>${esc(t("contextTokenUsage"))}</div>
          <div class="cub-ctx-main">
            <svg class="cub-break" viewBox="0 0 36 36" aria-hidden="true">
              <circle class="cub-break-track" cx="18" cy="18" r="15.9155" fill="none" stroke-width="4"></circle>
              ${CAT_ORDER.map(seg).join("")}
            </svg>
            <div class="cub-ctx-lines">
              <div data-tip="pct">${esc(t("pctOfContext", ["0"]))}</div>
              <div data-tip="ctx">${esc(t("ctxLength", ["0", "200k"]))}</div>
              <div data-tip="total">${esc(t("totalTokens", ["0"]))}</div>
            </div>
          </div>
          <div class="cub-cats">
            ${catRow("user", t("catYou"))}
            ${catRow("assistant", t("catClaude"))}
            ${catRow("thinking", t("catThinking"))}
            ${catRow("tools", t("catTools"))}
            ${catRow("files", t("catFiles"))}
          </div>
          <div class="cub-advice" data-tip="advice" hidden><span class="cub-advice-icon">!</span><span>${esc(t("ctxAdvice"))}</span></div>
        </div>
      </div>`;
  }

  function hourglassTemplate() {
    return `
      <div class="cub-hourglass" data-cub-hourglass tabindex="0" hidden>
        <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
          <path fill="currentColor" d="M3 1.5a.5.5 0 0 1 .5-.5h9a.5.5 0 0 1 0 1H12v2a4 4 0 0 1-1.534 3.147L9.05 8l1.416 .853A4 4 0 0 1 12 12v2h.5a.5.5 0 0 1 0 1h-9a.5.5 0 0 1 0-1H4v-2a4 4 0 0 1 1.534-3.147L6.95 8 5.534 7.147A4 4 0 0 1 4 4V2h-.5a.5.5 0 0 1-.5-.5z"></path>
        </svg>
        <span class="cub-hourglass-label">5:00</span>
        <div class="cub-tooltip" role="tooltip">
          <div data-tip="cache">${esc(t("cacheExpiresIn", ["5:00"]))}</div>
          <div>${esc(t("cacheSavings"))}</div>
        </div>
      </div>`;
  }

  function buildRoot(mode) {
    const el = document.createElement("div");
    el.id = "claude-usage-bar";
    if (mode === "inline") {
      // Compact widget that sits inside the composer toolbar row:
      // [pct] [thin line w/ hover panel] [donut] [hourglass]
      el.classList.add("cub-inline");
      el.innerHTML = `
      <span class="cub-pct">— %</span>
      <div class="cub-bar" data-cub-bar>
        <div class="cub-fill"></div>
        <span class="cub-reset" hidden></span>
        ${panelTemplate()}
      </div>
      ${donutTemplate()}
      ${hourglassTemplate()}
    `;
    } else {
      // Numbers sit OUTSIDE the track: printed over the fill, their contrast
      // changed as the fill slid underneath them.
      el.innerHTML = `
      <span class="cub-pct">— %</span>
      <div class="cub-bar" data-cub-bar>
        <div class="cub-fill"></div>
        ${panelTemplate()}
      </div>
      <span class="cub-reset">${esc(t("loading"))}</span>
      ${donutTemplate()}
      ${hourglassTemplate()}
    `;
    }
    return el;
  }

  function findComposerEditor() {
    return (
      document.querySelector('[contenteditable="true"][role="textbox"]') ||
      document.querySelector('[contenteditable="true"]')
    );
  }

  function findComposerRect() {
    const editor = findComposerEditor();
    if (!editor) return null;
    return editor.getBoundingClientRect();
  }

  // Finds the composer's bottom toolbar row (the one with the "+" button and
  // model picker). Claude.ai's DOM is undocumented, so we walk up from the
  // editor and look for a sibling row below it that contains buttons.
  function findComposerToolbar() {
    const editor = findComposerEditor();
    if (!editor) return null;
    const eRect = editor.getBoundingClientRect();
    if (eRect.height === 0) return null;
    let container = editor.parentElement;
    for (let hops = 0; container && hops < 8; hops++, container = container.parentElement) {
      for (const child of container.children) {
        if (child.contains(editor) || child === root) continue;
        if (!child.querySelector("button")) continue;
        const rect = child.getBoundingClientRect();
        if (rect.height > 0 && rect.height < 80 && rect.top >= eRect.top) {
          return child;
        }
      }
    }
    return null;
  }

  function mount() {
    if (!enabled) return;
    if (root && document.body.contains(root)) return;

    if (position === "composer") {
      const toolbar = findComposerToolbar();
      if (toolbar) {
        root = buildRoot("inline");
        bindRefs();
        mountedMode = "inline";
        // Slot in after the leading button group (the "+" button) so the
        // widget sits between it and the model picker, like the native row.
        toolbar.insertBefore(root, toolbar.children[1] || null);
        // The composer clips overflow, so panel/tooltips use position:fixed
        // in inline mode and get anchored to their trigger on hover.
        bar.addEventListener("mouseenter", () => anchorFloating(bar, panel));
        donut.addEventListener("mouseenter", () => anchorFloating(donut, donutTip));
        hourglass.addEventListener("mouseenter", () => anchorFloating(hourglass, hourglassTip));
        renderUsage(lastUsage);
        renderContext();
        renderCache();
        return;
      }
      // Composer not found (yet), fall back to the top overlay. The
      // composer observer upgrades us to inline once the toolbar appears.
    }

    root = buildRoot("top");
    bindRefs();
    mountedMode = "top";
    document.body.appendChild(root);
    syncPosition();

    renderUsage(lastUsage);
    renderContext();
    renderCache();
  }

  function anchorFloating(trigger, el) {
    if (!el || mountedMode !== "inline") return;
    const r = trigger.getBoundingClientRect();
    el.style.left = `${r.left + r.width / 2}px`;
    el.style.top = "auto";
    el.style.bottom = `${window.innerHeight - r.top + 10}px`;
  }

  function syncPosition() {
    if (!root || mountedMode !== "top") return;
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
    mountedMode = null;
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
      // Row absent from the usage payload (plan feature not in use):
      // show an explicit zero state instead of a bare dash.
      meta.textContent = t("notUsed");
      fillEl.style.width = "0%";
      return;
    }
    const parts = [`${Math.round(pct)}%`];
    if (resetMs != null) parts.push(t("resets", [fmtDuration(resetMs)]));
    meta.textContent = parts.join(" · ");
    fillEl.style.width = `${pct}%`;
  }

  function renderUsage(data) {
    if (!root) return;
    const fh = pickRow(data, "five_hour");
    const fhPct = rowPct(fh);
    if (fhPct == null) {
      pctLabel.textContent = "— %";
      resetLabel.textContent = t("noData");
      fill.style.width = "0%";
      bar.classList.remove("cub-full");
    } else {
      const resetMs = rowResetMs(fh);
      fill.style.width = `${fhPct}%`;
      pctLabel.textContent = `${Math.round(fhPct)} %`;
      resetLabel.textContent = resetMs != null ? t("resetsIn", [fmtDuration(resetMs)]) : t("fiveHourLimit");
      bar.classList.toggle("cub-full", fhPct >= 100);
    }

    setRow("five_hour", fhPct, rowResetMs(fh));
    const weeklyAll = pickRow(data, "seven_day");
    setRow("weekly_all", rowPct(weeklyAll), rowResetMs(weeklyAll));
    const extra = pickRow(data, "extra_usage", "extraUsage", "extra_credits", "extra", "overage");
    setRow("extra", rowPct(extra), rowResetMs(extra));
    const routines = pickRow(data, "seven_day_omelette", "routines", "scheduled_tasks");
    setRow("routines", rowPct(routines), rowResetMs(routines));

    cacheSnapshot(fhPct, rowResetMs(fh), rowPct(weeklyAll), rowResetMs(weeklyAll));
  }

  // The popup holds no host permissions, so it cannot read the usage endpoint
  // itself. Stash the last-known numbers where it can reach them, keeping reset
  // times ABSOLUTE so the popup recomputes a live countdown whenever it opens.
  let lastSnapshotKey = "";

  function cacheSnapshot(fhPct, fhResetMs, weeklyPct, weeklyResetMs) {
    const key = `${fhPct}|${weeklyPct}`;
    if (key === lastSnapshotKey) return;  // usage polls often; storage need not
    lastSnapshotKey = key;
    try {
      chrome.storage.local.set({
        usageSnapshot: {
          fiveHourPct: fhPct,
          fiveHourResetAt: fhResetMs != null ? Date.now() + fhResetMs : null,
          weeklyPct: weeklyPct,
          weeklyResetAt: weeklyResetMs != null ? Date.now() + weeklyResetMs : null,
          at: Date.now(),
        },
      });
    } catch (e) {
      // Extension context can be invalidated mid-session (update/reload).
      // The bar itself keeps working; only the popup's cache goes stale.
    }
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

  function paintContext(contextTokens, totalTokens, win, cats) {
    if (!root) return;
    const pct = Math.max(0, Math.min(100, (contextTokens / win) * 100));
    const arc = root.querySelector(".cub-donut-arc");
    const circumference = 2 * Math.PI * 13;
    if (arc) arc.setAttribute("stroke-dashoffset", String(circumference * (1 - pct / 100)));
    if (donutPct) donutPct.textContent = `${Math.round(pct)}%`;
    setTip(donutTip, "pct", t("pctOfContext", [String(Math.round(pct))]));
    setTip(donutTip, "ctx", t("ctxLength", [formatTokens(contextTokens), formatTokens(win)]));
    setTip(donutTip, "total", t("totalTokens", [formatTokens(totalTokens)]));
    // Ring color: green below 50%, yellow below 75%, red from 75% up.
    // Alerts ("!" badge + advice line): yellow from 75%, red past 100%.
    const over = contextTokens > win;
    donut.classList.toggle("cub-green", pct < 50);
    donut.classList.toggle("cub-yellow", pct >= 50 && pct < 75);
    donut.classList.toggle("cub-red", pct >= 75);
    donut.classList.toggle("cub-over", over);
    const alert = pct >= 75;
    const badge = donut.querySelector(".cub-donut-badge");
    if (badge) badge.hidden = !alert;
    const advice = donutTip && donutTip.querySelector('[data-tip="advice"]');
    if (advice) advice.hidden = !alert;
    if (cats) paintBreakdown(cats, win);
  }

  // Segmented hollow pie + legend rows showing where the context tokens go.
  // Segments are proportional to the WHOLE window, so a quarter-full context
  // fills a quarter of the ring and the rest stays on the grey track.
  function paintBreakdown(cats, win) {
    if (!donutTip) return;
    const denom = Math.max(1, win);
    let acc = 0;
    for (const key of CAT_ORDER) {
      const v = Math.max(0, cats[key] || 0);
      const p = Math.max(0, Math.min(100 - acc, (v / denom) * 100));
      const seg = donutTip.querySelector(`[data-seg="${key}"]`);
      if (seg) {
        seg.setAttribute("stroke-dasharray", `${p} ${100 - p}`);
        seg.setAttribute("stroke-dashoffset", String(25 - acc));
      }
      const row = donutTip.querySelector(`.cub-cat[data-cat="${key}"]`);
      if (row) {
        row.querySelector(".cub-cat-val").textContent = formatTokens(Math.round(v));
        row.querySelector(".cub-cat-fill").style.width = `${p}%`;
      }
      acc += p;
    }
  }

  function renderContext() {
    if (!root) return;
    // API-based stats are authoritative. The DOM heuristic exists only to
    // bootstrap a brand-new conversation before the first fetch resolves,
    // claude.ai virtualizes long chats, so the DOM holds a fraction of the
    // conversation and repainting from it causes wild flicker.
    const convId = currentConversationId();
    const cached = convId && lastConvFetch.id === convId ? lastConvFetch.stats : null;
    if (cached && cached.contextTokens > 0) {
      paintContext(cached.contextTokens, cached.totalTokens, cached.window, cached.cats);
    } else {
      const estTokens = estimateTokens(readConversationText());
      paintContext(estTokens, estTokens, DEFAULT_CONTEXT_WINDOW, null);
    }
    // Refresh from the conversation API, a full-payload estimate that
    // includes tool traffic, attachments and thinking the DOM never shows.
    fetchConversationStats().then((stats) => {
      if (stats && stats.contextTokens > 0) {
        paintContext(stats.contextTokens, stats.totalTokens, stats.window, stats.cats);
      }
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
    setTip(hourglassTip, "cache", t("cacheExpiresIn", [fmtClock(remaining)]));
  }

  // ---------- observers ----------

  function watchConversation() {
    if (conversationObserver) conversationObserver.disconnect();
    const target = document.querySelector("main") || document.body;
    let pending = null;
    conversationObserver = new MutationObserver((records) => {
      // In composer mode our own widget lives inside <main>; ignore our own
      // mutations or every render would re-trigger this observer forever.
      if (root && records.every((r) => root.contains(r.target))) return;
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
      // New message content landed, bust the conversation-stats throttle so
      // the donut reflects the real token increase without a page refresh.
      lastConvFetch.ts = 0;
      renderContext();
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
        if (!root || !document.body.contains(root)) {
          mount();
        } else if (position === "composer" && mountedMode === "top" && findComposerToolbar()) {
          // We fell back to the top overlay before the composer existed,
          // upgrade to the inline placement now that it does.
          unmount();
          mount();
        } else {
          syncPosition();
        }
      });
    });
    composerObserver.observe(document.body, { childList: true, subtree: true });
  }

  // Position sync loop. Suspends entirely while the tab is hidden; the
  // visibilitychange listener in start() restarts it.
  function rafLoop() {
    if (document.hidden) return;
    if (root && document.body.contains(root)) syncPosition();
    requestAnimationFrame(rafLoop);
  }

  // ---------- lifecycle ----------

  async function tick() {
    const data = await fetchUsage();
    if (data) lastUsage = data;
    renderUsage(lastUsage);
    // Periodic context refresh, so the donut stays honest even when no DOM
    // mutations fire (e.g. a long streaming reply already settled).
    lastConvFetch.ts = 0;
    renderContext();
  }

  async function start() {
    const stored = await chrome.storage.local.get(["enabled", "position"]);
    enabled = stored.enabled !== false;
    position = stored.position === "composer" ? "composer" : "top";

    if (enabled) mount();
    tick();
    setInterval(() => {
      if (!document.hidden) tick();
    }, POLL_MS);
    setInterval(() => {
      if (document.hidden) return;
      if (lastUsage) renderUsage(lastUsage);
      renderCache();
    }, 1000);
    window.addEventListener("resize", syncPosition);
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) return;
      tick();
      requestAnimationFrame(rafLoop);
    });

    watchComposerHost();
    watchConversation();
    rafLoop();

    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== "local") return;
      if (!changes.enabled && !changes.position) return;
      if (changes.enabled) enabled = changes.enabled.newValue !== false;
      if (changes.position) position = changes.position.newValue === "composer" ? "composer" : "top";
      unmount();
      if (enabled) mount();
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
})();

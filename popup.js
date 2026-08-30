const t = (key, subs) => chrome.i18n.getMessage(key, subs);

document.querySelectorAll("[data-i18n]").forEach((el) => {
  el.textContent = t(el.dataset.i18n);
});
document.title = t("popupTitle");

// ---------- settings ----------

const enabledEl = document.getElementById("enabled");

enabledEl.addEventListener("change", () => {
  chrome.storage.local.set({ enabled: enabledEl.checked });
});

document.querySelectorAll('input[name="position"]').forEach((radio) => {
  radio.addEventListener("change", () => {
    if (radio.checked) chrome.storage.local.set({ position: radio.value });
  });
});

// ---------- usage readout ----------

// Same shape as the bar's own countdown, so the popup and the page never
// disagree about how long is left.
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

function paintRow(name, pct, resetAt) {
  const row = document.querySelector(`.usage-row[data-row="${name}"]`);
  if (!row) return;
  const pctEl = row.querySelector(".usage-pct");
  const fillEl = row.querySelector(".usage-fill");
  const metaEl = row.querySelector(".usage-meta");

  if (pct == null) {
    pctEl.textContent = "— %";
    fillEl.style.width = "0%";
    metaEl.textContent = t("noData");
    return;
  }
  pctEl.textContent = `${Math.round(pct)} %`;
  fillEl.style.width = `${Math.min(100, pct)}%`;
  metaEl.textContent = resetAt != null ? t("resetsIn", [fmtDuration(resetAt - Date.now())]) : "";
}

function paintUsage(snapshot) {
  const usageEl = document.getElementById("usage");
  const emptyEl = document.getElementById("usageEmpty");

  // A snapshot whose 5-hour window has already rolled over is telling us about
  // a window that no longer exists. Better to say nothing than to say something
  // wrong: the content script refreshes it the moment claude.ai is open again.
  const rolledOver =
    snapshot && snapshot.fiveHourResetAt != null && snapshot.fiveHourResetAt <= Date.now();

  if (!snapshot || snapshot.fiveHourPct == null || rolledOver) {
    usageEl.hidden = true;
    emptyEl.hidden = false;
    return;
  }

  paintRow("five_hour", snapshot.fiveHourPct, snapshot.fiveHourResetAt);
  paintRow("weekly_all", snapshot.weeklyPct, snapshot.weeklyResetAt);
  usageEl.hidden = false;
  emptyEl.hidden = true;
}

// ---------- review nudge ----------

const REVIEW_AFTER_MS = 7 * 24 * 60 * 60 * 1000;

function maybeShowReview(firstSeenAt) {
  if (!firstSeenAt || Date.now() - firstSeenAt < REVIEW_AFTER_MS) return;
  document.getElementById("reviewFooter").hidden = false;
}

// ---------- boot ----------

chrome.storage.local
  .get(["enabled", "position", "usageSnapshot", "firstSeenAt"])
  .then(({ enabled, position, usageSnapshot, firstSeenAt }) => {
    enabledEl.checked = enabled !== false;

    const value = position === "composer" ? "composer" : "top";
    const radio = document.querySelector(`input[name="position"][value="${value}"]`);
    if (radio) radio.checked = true;

    paintUsage(usageSnapshot);
    maybeShowReview(firstSeenAt);
  });

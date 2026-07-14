document.querySelectorAll("[data-i18n]").forEach((el) => {
  el.textContent = chrome.i18n.getMessage(el.dataset.i18n);
});
document.title = chrome.i18n.getMessage("extName");

const enabledEl = document.getElementById("enabled");

chrome.storage.local.get(["enabled", "position"]).then(({ enabled, position }) => {
  enabledEl.checked = enabled !== false;
  const value = position === "composer" ? "composer" : "top";
  const radio = document.querySelector(`input[name="position"][value="${value}"]`);
  if (radio) radio.checked = true;
});

enabledEl.addEventListener("change", () => {
  chrome.storage.local.set({ enabled: enabledEl.checked });
});

document.querySelectorAll('input[name="position"]').forEach((radio) => {
  radio.addEventListener("change", () => {
    if (radio.checked) chrome.storage.local.set({ position: radio.value });
  });
});

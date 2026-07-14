chrome.runtime.onInstalled.addListener(async () => {
  const { enabled, position } = await chrome.storage.local.get(["enabled", "position"]);
  const defaults = {};
  if (enabled === undefined) defaults.enabled = true;
  if (position === undefined) defaults.position = "top";
  if (Object.keys(defaults).length) {
    await chrome.storage.local.set(defaults);
  }
});

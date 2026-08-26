chrome.runtime.onInstalled.addListener(async () => {
  const { enabled, position, firstSeenAt } = await chrome.storage.local.get([
    "enabled",
    "position",
    "firstSeenAt",
  ]);
  const defaults = {};
  if (enabled === undefined) defaults.enabled = true;
  if (position === undefined) defaults.position = "top";
  // Stamped once, never updated: the review nudge waits a week from here.
  if (firstSeenAt === undefined) defaults.firstSeenAt = Date.now();
  if (Object.keys(defaults).length) {
    await chrome.storage.local.set(defaults);
  }
});

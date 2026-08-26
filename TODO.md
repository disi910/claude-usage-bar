# TODO: road to 1,000 users

Current: 420 users, 5.0 stars (2 ratings), v1.0.0.
Target: 1,000 users.
Budget: ~$100, allocated $40 to Reddit ads, rest held in reserve.

Nearest competitor: "Claude Usage Bar: Track Your Claude.ai Usage in Chat",
621 users, 3 ratings. Same concept, no context estimation. We lose on
packaging, not on product.

---

## Phase 1: design identity

The UI settles first, so screenshots are shot of the final thing.

- [x] Write `DESIGN.md` with the design philosophy and rules.
- [x] Migrate all type to Helvetica: `styles.css`, `popup.css`, `index.html`,
      `privacy-policy.html`. One shared stack, no per component overrides.
- [x] Apply `tabular-nums` to every number that updates in place, so
      percentages and countdowns stop jittering.
- [x] Popup polish pass against `DESIGN.md`: the position picker cards, the
      toggle row, spacing rhythm, focus states, dark mode contrast check.
- [x] Sharpen the position picker illustrations so "Top of page" and
      "In chat box" read instantly without the labels.
- [x] Audit the injected bar and tooltip for contrast in both Claude themes.
- [x] Design pass over the injected bar and context tooltip as one system.
      Shipped options A and B (see decisions below).
- [x] Sweep all locale strings for em dashes and remove them.

## Phase 2: icon and store visuals

- [x] New icon: the context ring, variant A. Coral tile, cream arc at 85%,
      geometry matched to the in-page donut. Reads at 16px.
- [x] Regenerate `icon16/48/128.png` from the new source via `scripts/icon.py`.
- [ ] Five new store screenshots on a consistent frame system, one message each:
      1. Bar inside the chat box, in situ
      2. Bar at top of page
      3. Context estimate tooltip, the feature the competitor lacks
      4. Position picker in the popup
      5. Privacy: no sign in, no tokens
- [ ] Refresh the 440x280 promo tile to match the new visual system.
- [ ] Lead screenshot must be a value shot, not the settings popup.

## Phase 3: store listing SEO

- [ ] Rename to `Claude Usage Bar: Track Limits, Context & Usage` in
      `_locales/*/messages.json` (`extName`) and rebuild locales.
      Fallback if Chrome Web Store rejects it as too similar to an existing
      listing: `Usage Bar for Claude: Limits & Context Tracker`.
- [ ] Rewrite the long description around the terms people actually search:
      claude usage tracker, claude limits, 5 hour limit, weekly limit,
      context window, opus usage. Keep it readable, not stuffed.
- [ ] Evaluate switching category from Tools to Workflow & Planning.
- [ ] Update `extDesc` short description to lead with the differentiator.

## Phase 4: distribution

- [ ] Post to r/ClaudeAI leading with the context estimate feature, with a
      short screen recording. Organic first, before any paid spend.
- [ ] Product Hunt launch on the back of v1.0.0.
- [ ] $40 Reddit ad targeted at r/ClaudeAI, only after the organic post shows
      the message lands.
- [ ] Reply where people complain about hitting Claude limits, on X and
      Reddit. Useful answers, not link drops.
- [ ] Short looping demo GIF, reusable across every channel.

## Phase 5: ratings flywheel

2 ratings is the weakest number in the listing. Going to 15 moves ranking
more than anything except the title.

- [x] Gate the popup review link so it appears only after roughly a week of
      active use, per `DESIGN.md`. `firstSeenAt` is stamped on install.
- [ ] Ask directly in the Reddit and Product Hunt posts.

## Later

- [ ] Improve context estimation accuracy. This is the moat; the competitor
      cannot copy what they do not have.
- [ ] Revisit whether anything is worth learning about users without adding
      any tracking. Chrome Web Store dashboard plus the existing Google
      Analytics property on the listing already give country, installs,
      uninstalls and retention.

---

## Decisions on record

- **No telemetry in the extension.** Users dislike it and it contradicts the
  privacy pitch, which is part of the product. Not revisiting.
- **Budget held.** Only Reddit ads are funded. Google Ads was considered and
  rejected: Chrome Web Store listings convert poorly from search ads and
  attribution is not workable.
- **Helvetica everywhere.** Owner preference, now a design rule.
- **Popup direction: Option A, "Status first".** The popup shows the 5-hour and
  weekly numbers before it offers settings. The content script caches a
  snapshot to `chrome.storage.local` with ABSOLUTE reset timestamps, because
  the popup holds no host permissions and cannot read the usage endpoint.
- **Icon: the context ring.** The old pill-and-knob read as a toggle switch.
- **Top bar: numbers outside the track (option B).** Printed over the fill,
  their contrast changed as the fill slid underneath. The pill survives as the
  CONTAINER; the bar inside it is now a plain 6px track. Both placements are
  now one component at two sizes.
- **Tooltip: one coral ramp (option A).** The five hues appeared nowhere else
  in the product and contradicted the single-accent rule. Accepted cost: the
  tooltip photographs less colourfully, so check the pie still reads as a
  feature when shooting store screenshots.
- **No em dashes anywhere**, in code, copy, docs or store listing.

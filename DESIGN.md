# Design Guidelines

Binding guidelines for anyone (human or AI) working on Usage Bar for Claude.
Read this before changing any UI. If a change violates something here, either
change this file first or do not make the change.

## Philosophy

**Simple. Intuitive. Clever.**

Three words, in that order of priority. Simplicity wins over cleverness every
time. A feature that needs an explanation has failed.

The product answers exactly one question: *how much do I have left?* Everything
that does not serve that question is a distraction. Feature requests get judged
against it, not against what competitors ship.

### Invisible until needed

The bar should feel like ambient information, not a widget. A user glancing at
the chat box should absorb their usage without deciding to look at it. Nothing
animates for attention. Nothing demands a click. The tooltip is where detail
lives, and detail is opt in.

### Native to both hosts

The extension lives in two visual worlds at once: Chrome's browser chrome, and
Claude's web app. It must look like it belongs to both.

- Inside claude.ai: match Claude's warm neutral palette, its border radii, its
  restraint. A user should not be able to tell where Claude ends and we begin.
- In the popup: match Chrome's surface conventions. Compact, square-ish cards,
  system-native controls, no marketing copy.

The test for any change: **would this pass as something Anthropic shipped?**
If the answer is no, it is not done.

### Honest by default

No sign in. No tokens. No account. No telemetry. No analytics beacons in the
extension. What the page already knows is all we read, and it never leaves the
browser. This is a product principle, not a compliance posture, and it is part
of the pitch. Do not add tracking of any kind.

## Typography

**Helvetica, everywhere.**

```css
font-family: "Helvetica Neue", Helvetica, Arial, sans-serif;
```

This stack applies to every surface: the injected bar, the tooltip, the popup,
the options page, the privacy policy page. No exceptions, no per component
overrides, no system font stacks.

Weights: 400 for body, 500 for labels, 600 for headings and numbers that carry
meaning. Never 700 or above. Never italic.

Numbers are the content. A percentage should be the most legible thing on the
surface. Use tabular figures where a number updates in place, so it does not
jitter:

```css
font-variant-numeric: tabular-nums;
```

Sizes step in whole pixels: 11, 12, 13, 14. Nothing smaller than 11px ships.

## Color

Coral is the brand and the only accent. It carries usage state and nothing
else. Neutrals do all remaining work.

| Token | Light | Dark | Use |
|---|---|---|---|
| `--pop-coral` | `#D97757` | `#D97757` | fill, accent |
| `--pop-coral-deep` | `#C96442` | `#C96442` | hover, pressed |
| `--pop-bg` | `#FAF9F4` | `#2C2A26` | page ground |
| `--pop-surface` | `#F0EEE6` | `#3A3631` | raised card |
| `--pop-border` | `rgba(0,0,0,.1)` | `rgba(255,255,255,.1)` | hairlines |
| `--pop-fg` | `#1F1B14` | `#F0EDE5` | primary text |
| `--pop-fg-muted` | `#6E6658` | `#B8B0A2` | secondary text |

The context breakdown uses five steps of the SAME coral, never five hues:

| Category | Light | Dark |
|---|---|---|
| You | `#A8452F` | `#F2B49E` |
| Claude | `#C96442` | `#E08E70` |
| Thinking | `#D97757` | `#D97757` |
| Tools | `#E08E70` | `#B85F42` |
| Files | `#E9AE95` | `#96442E` |

Every step stays clearly separated from the track it sits on (`#E8E6DC` light,
`#3A3631` dark). If a step is ever added, keep that true.

Rules:

- Never introduce a fourth hue. If a state needs distinguishing, use weight,
  opacity, or position, not a new color.
- Never use pure black or pure white. The warm neutrals are what make it read
  as Claude rather than as a generic extension.
- Every color is defined as a token on `:root`, and only redefined inside the
  dark media query. No color has its only definition inside a media query.

## Space and shape

- Spacing scale: 2, 4, 6, 8, 10, 12, 14, 18, 24. Nothing off scale.
- Radii: 4px for inline chips, 10px for cards, full pill for bars.
- Hairlines are 1px at 10% opacity. Never a solid 1px black border.
- The popup is 280px wide with 14px padding. Do not grow it. If content does
  not fit, the content is wrong.

## Motion

- Transitions are 120ms `ease-out`. Nothing longer.
- Only two properties may animate: `opacity` and `transform`. Never animate
  layout.
- The usage fill does not animate on load. It animates only when the value
  actually changes, and only if the change is visible to the user.
- No entrance animations. No spinners. No pulsing. Loading states are a muted
  label, not a moving thing.

## Copy

- Sentence case everywhere except the section labels, which are uppercase with
  letter spacing.
- No em dashes. Ever. Use a colon, a comma, or a full stop.
  - One exception: the em dash used as a *glyph* for an empty value, as in a
    plan row with no data and the `— %` placeholder shown before usage loads.
    That is the conventional typographic sign for "nothing here", not prose.
    Do not replace these.
- No exclamation marks.
- Short. "resets in 2h 14m" not "your session limit will reset in 2 hours".
- All user visible strings live in `_locales/en/messages.json` and are built
  out to every locale via `scripts/build_locales.py`. Never hardcode a string
  in markup or JS.

## Accessibility

- Text contrast meets 4.5:1 in both themes. Verify, do not assume.
- Never encode meaning in color alone. A percentage is always present as text
  next to any bar.
- Every interactive element has a visible focus ring and an accessible name.
- The bar is decorative to screen readers only when its value is also announced
  as text.

## What we do not do

- No dashboards. No history charts. No heatmaps. Competitors add these; that is
  their differentiation, not ours. Ours is that you never have to open anything.
- No accounts, no sync, no cloud.
- No upsells, no banners, no notification badges.
- No feature that requires a permission beyond `storage`.

## Review nudges

Ratings matter for discovery, so asking is legitimate. Asking badly is not.
The nudge is a single quiet footer link, shown once a user has actually used
the extension for a while. It never appears as a modal, a toast, or an
interruption inside claude.ai.

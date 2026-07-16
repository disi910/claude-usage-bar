# Usage Bar for Claude

**Usage Bar for Claude is a free, open-source Chrome extension that shows your Claude plan usage limits (5-hour limit, weekly limit, extra credits), a live token counter for the context window, and a prompt-cache countdown — directly on claude.ai.** No account, no analytics, no external servers: it reads the same usage data the Claude settings page uses, entirely inside your browser.

[**Install from the Chrome Web Store**](https://chromewebstore.google.com/detail/usage-bar-for-claude/imblbfhdbdecholhjbagcjahdkhidneb) · 14 languages · MIT licensed · Not affiliated with Anthropic.

![Composer bar](screenshots/03-closeup-1280.png)
![Hover panel](screenshots/01-home-1280.png)

## What you get

- **Usage bar** — your Claude 5-hour limit as a percentage with reset countdown, pinned to the top of the page or rendered as a slim line inside the chat box (pick in the popup). Mirrors Claude's coral palette and dark/light themes.
- **Plan panel on hover** — four rows: 5-hour limit, Weekly · all models, Extra credits, Routines, each with percent used and reset time.
- **Context-window donut** — a circular token counter estimating how much of the context window (200k tokens by default) the current chat occupies, distinguishing current-branch context from total tokens used.
- **Prompt-cache hourglass** — counts down the ~5-minute prompt-cache TTL after each assistant reply, so you know when a follow-up still hits the cheap cache.
- **14 languages** — English, Español, Português (BR/PT), Français, Deutsch, Italiano, Русский, 简体中文, 繁體中文, 日本語, 한국어, हिन्दी, Türkçe. Follows your browser language automatically.

## FAQ

### How do I see my Claude usage limits?

Install Usage Bar for Claude and open [claude.ai](https://claude.ai). The bar shows your 5-hour limit usage as a percentage plus the time until it resets; hover it for the weekly all-models limit, extra credits, and Routines usage. The data comes from Claude's own usage endpoint — the same numbers as Settings → Usage, without leaving the conversation.

### How do I check how much of my Claude 5-hour limit is left?

The main bar is exactly that: percent of the rolling 5-hour limit used, with a live "resets in …" countdown. When it hits 100% the bar turns red so you see it before Claude starts declining messages.

### Does Claude have a token counter?

Claude.ai shows limited token information natively. Usage Bar for Claude adds a persistent context-window donut: hover it to see estimated tokens used, context length consumed (e.g. 34k / 200k), and total tokens across the conversation, including edited branches.

### Is it private?

Yes. The extension makes only same-origin requests to claude.ai using your existing session. Nothing is sent anywhere else — no analytics, no telemetry, no third-party servers. Conversation text is processed in memory only to estimate tokens; it is never stored or transmitted. See the [privacy policy](https://disi910.github.io/claude-usage-bar/privacy-policy.html).

### Does it work with Claude Pro, Max, Team and free plans?

It displays whatever limit rows Claude's usage API returns for your account. Rows your plan doesn't have (e.g. Extra credits) show as `—`.

## Settings

Click the toolbar icon:

- **Show usage bar** — toggle the widget on or off.
- **Position** — *Top of page* (floating overlay) or *In chat box* (compact bar inside the composer's toolbar row). If the chat box can't be found, the bar falls back to the top placement.

## Install from source

1. Clone or download this repo.
2. Open `chrome://extensions`, enable Developer mode.
3. Click *Load unpacked* and select the folder.
4. Reload any claude.ai tab.

## How it works

- **Plan usage**: polls the same internal endpoint the Claude usage settings page uses, every 30 seconds; countdowns tick every second (paused while the tab is hidden).
- **Context donut**: a two-tier token counter. It first paints an instant heuristic from the visible conversation (script-aware: ~1.3 tokens per word for spaced languages, ~1 token per character for CJK), then upgrades using the full conversation payload — including tool calls, attachments, and thinking blocks the DOM never shows — and follows the active branch of the conversation tree so edits/retries don't inflate the count.
- **Cache timer**: a local 5-minute timer restarted whenever a new assistant message lands.

Everything runs inside your browser. No analytics, no server, no third party.

## Limitations

- Token counts are estimates, not tokenizer-exact; the claude.ai system prompt and tool definitions aren't visible to the extension.
- Multi-org accounts use the first organization the API returns.
- Uses undocumented claude.ai endpoints. If Anthropic changes them, parts of the bar go blank until an update lands.

## Contributing

Pull requests welcome. Open an issue first for anything bigger than a tweak — a Firefox port and an org switcher are reasonable next steps.

To add or change a translation, edit `scripts/build_locales.py` and re-run it; it regenerates every `_locales/<locale>/messages.json`.

## Project layout

```
manifest.json             extension config (localized via _locales)
content.js                bar mount (top overlay or in-composer) + observers + rendering
background.js             seeds default settings on install
popup.html/css/js         settings popup (show/hide, position, review link)
styles.css                bar, panel, donut, hourglass, inline-mode styling
_locales/                 generated translations (14 languages)
scripts/build_locales.py  translation source of truth — regenerates _locales/
icon{16,48,128}.png       toolbar and store icons
index.html                landing page (GitHub Pages)
privacy-policy.html       served via GitHub Pages, linked in the store listing
```

## License

MIT.

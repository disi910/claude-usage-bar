# Claude Usage Bar

A Chrome extension that adds a compact, native-feeling usage indicator to the Claude.ai composer. Keep an eye on your plan usage, current chat context, and prompt-cache TTL without leaving the conversation.

Not affiliated with Anthropic.

![Composer bar](screenshots/03-closeup-1280.png)
![Hover panel](screenshots/01-home-1280.png)

## What you get

- A usage bar that mirrors Claude's coral palette and dark/light themes — pinned to the top of the page, or rendered as a slim line inside the chat box itself. Pick the placement in the extension popup.
- A hover panel with four rows: 5-hour limit, Weekly · all models, Extra credits, Routines.
- A circular indicator that estimates how much of the 200k context window the current chat is using.
- A small hourglass next to the bar that counts down a 5-minute prompt-cache TTL after each assistant turn.
- 14 languages: English, Español, Português (BR/PT), Français, Deutsch, Italiano, Русский, 简体中文, 繁體中文, 日本語, 한국어, हिन्दी, Türkçe. The UI follows your browser language automatically.

## Settings

Click the toolbar icon to open the popup:

- **Show usage bar** — toggle the whole widget on or off.
- **Position** — *Top of page* (floating overlay) or *In chat box* (compact bar inside the composer's toolbar row). If the chat box can't be found on a page, the bar falls back to the top placement.

## Install

From the Chrome Web Store: [Claude Usage Bar](https://chromewebstore.google.com/detail/imblbfhdbdecholhjbagcjahdkhidneb).

## Install from source

1. Clone or download this repo.
2. Open `chrome://extensions`.
3. Enable Developer mode.
4. Click Load unpacked and select the folder.

Reload any Claude.ai tab.

## How it works

- **Plan usage**: same internal endpoint the Claude usage settings page uses. Polled every 30s; the countdown ticks every second.
- **Context donut**: reads visible conversation text from the DOM and divides character count by 4 for a coarse token estimate. No message content is stored.
- **Cache timer**: a local 5-minute timer that restarts every time a new assistant message appears.

Everything runs inside your browser. No analytics, no server, no third party.

## Privacy

Only same-origin Claude.ai calls. The extension stores sanitized usage metadata and numeric estimates locally for rendering. No prompt, response, cookie, or auth data is stored. Uninstalling removes every trace.

## Limitations

- If your usage payload doesn't include a particular row (e.g. Routines), the panel shows `—`.
- Token estimates are coarse — ~4 chars/token, no tokenizer.
- Multi-org accounts use the first organization the API returns.
- Uses an undocumented Claude.ai endpoint. If Anthropic changes it, the panel will go blank until an update lands.

## Contributing

Pull requests welcome. Open an issue first for anything bigger than a tweak — Firefox port and an org switcher are reasonable next steps.

To add or change a translation, edit `scripts/build_locales.py` and re-run it; it regenerates every `_locales/<locale>/messages.json`.

## Project layout

```
manifest.json             extension config (localized via _locales)
content.js                bar mount (top overlay or in-composer) + observers + rendering
background.js             seeds default settings on install
popup.html/css/js         settings popup (show/hide, position)
styles.css                bar, panel, donut, hourglass, inline-mode styling
_locales/                 generated translations (14 languages)
scripts/build_locales.py  translation source of truth — regenerates _locales/
store-assets/descriptions translated Chrome Web Store listings to paste in the dashboard
icon{16,48,128}.png       toolbar and store icons
privacy-policy.html       served via GitHub Pages, used in the store listing
```

## License

MIT.

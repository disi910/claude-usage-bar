# Claude Usage Bar

A Chrome extension that adds a compact, native-feeling usage indicator to the Claude.ai composer. Keep an eye on your plan usage, current chat context, and prompt-cache TTL without leaving the conversation.

Not affiliated with Anthropic.

![Composer bar](screenshots/03-closeup-1280.png)
![Hover panel](screenshots/01-home-1280.png)

## What you get

- A composer-anchored bar that mirrors Claude's coral palette and dark/light themes.
- A hover panel with four rows: 5-hour limit, Weekly · all models, Weekly · Claude Opus, Routines.
- A circular indicator that estimates how much of the 200k context window the current chat is using.
- A small hourglass next to the bar that counts down a 5-minute prompt-cache TTL after each assistant turn.

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

Pull requests welcome. Open an issue first for anything bigger than a tweak — Firefox port, org switcher, settings page are all reasonable next steps.

## Project layout

```
manifest.json         extension config
content.js            composer mount + observers + rendering
background.js         toolbar-icon toggle
styles.css            bar, panel, donut, hourglass styling
icon{16,48,128}.png   toolbar and store icons
privacy-policy.html   served via GitHub Pages, used in the store listing
```

## License

MIT.

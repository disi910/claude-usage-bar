# Chrome Web Store description

## Summary (under 132 chars)

See your Claude.ai 5-hour usage limit at the top of every page, with a live countdown to when it resets.

## Description

Ever been deep in a chat with Claude and suddenly hit your usage limit out of nowhere? This little extension makes sure that never happens again.

Once you install it, a small bar shows up at the top of every Claude.ai page. It tells you exactly how much of your 5-hour usage you have left, in the same percentage you would see if you opened the settings page yourself. Next to that, a live countdown shows when your window resets, so you can decide whether to slow down a bit or just keep going.

That is really all it does. No popups, no notifications, no settings to fiddle with. The bar is just there, quietly, until you do not want it anymore.

If you want to hide it for a while, click the extension icon in your Chrome toolbar. The bar disappears. Click again and it comes back. Your choice is remembered across tabs and reloads, so you do not have to keep toggling it.

## How it works

The extension reads from the same internal endpoint that the official Claude.ai usage page uses. When you load a Claude.ai tab, it asks Claude what your current 5-hour utilization is, and what time the window resets. It checks again every 30 seconds so the number stays fresh, and the countdown ticks every second on its own.

Everything happens inside your browser, using your existing Claude login. There are no external servers, no analytics, no accounts to create, no data collection of any kind. If you uninstall the extension, every trace of it is gone.

## Who it is for

Anyone on a Claude.ai paid plan who has ever been frustrated by hitting the limit unexpectedly. It is especially useful if you tend to leave Claude open in a tab all day, or if you switch between heavy and light tasks and want to spend your usage carefully.

## Good to know

The bar shows the 5-hour rolling window only. The 7-day weekly cap is not displayed in this version.

If you belong to more than one Claude organization, the extension uses the first one it finds. A switcher might come in a future update if there is demand.

This extension is not made by Anthropic and is not affiliated with Anthropic in any way. It just talks to your own Claude.ai session, the same way a browser tab does.

## Privacy

No data ever leaves your computer. The extension only talks to Claude.ai itself, using the cookie that is already in your browser from logging in. Nothing is sent anywhere else, nothing is stored on any server, and no third parties are involved.

## How to use it

1. Install the extension from the Chrome Web Store.
2. Open or refresh any Claude.ai page.
3. Look at the top of the page. The bar is there.

That is the whole thing. To toggle it off, click the extension icon next to your Chrome address bar. To turn it back on, click the icon again.

If the icon is not visible in your toolbar, click the puzzle piece icon in Chrome and pin "Usage Bar for Claude" so you can reach it easily.

## Source code

Open source under the MIT license. You can read every line at https://github.com/disi910/claude-usage-bar.

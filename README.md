# Jarvis — Desktop App

A desktop version of the Jarvis HUD assistant, built with Electron. Same orb UI,
voice in/out, and transcript log as the web version — but running as a real
`.exe`/app on your machine instead of inside a browser tab.

## 1. One-time setup

You need [Node.js](https://nodejs.org) installed (the LTS version is fine).
Check with:

```
node -v
```

Then, inside this folder:

```
npm install
```

This downloads Electron itself (~150–200MB the first time — it's a full
Chromium + Node runtime bundled into your app, which is why it's a bigger
download than a normal npm package).

## 2. Run it

```
npm start
```

A window titled "JARVIS" opens. The **first time**, it'll prompt you for an
Anthropic API key — click the "Settings" icon (top-right) any time to add or
change it.

### Getting an API key

This app talks to the real Anthropic API directly, so — unlike the browser
artifact version — it needs your own key:

1. Go to [console.anthropic.com](https://console.anthropic.com/settings/keys)
2. Create a key
3. Paste it into Jarvis's Settings panel

Note this uses **pay-as-you-go API billing**, separate from a claude.ai
subscription. Check current pricing on Anthropic's site before heavy use.
The key is saved only in a local config file in your OS's app-data folder
(never sent anywhere except directly to `api.anthropic.com` with each
request) — it isn't bundled if you share the app folder with someone else.

## 3. Package it into a standalone app (optional)

If you want a double-clickable `.exe` (Windows), `.dmg` (Mac), or `.AppImage`
(Linux) that doesn't need `npm start`:

```
npm run dist
```

This uses `electron-builder` and drops the packaged app in `dist/`. On
Windows it produces a portable `.exe` — no installer, just run it. First
build can take a few minutes, and building a Windows `.exe` from a
non-Windows machine may need extra setup (Wine); building on the target OS
itself is the reliable path.

## Notes / limitations

- **Voice input** uses Chromium's built-in speech recognition, which needs
  an internet connection regardless of platform. It works in Electron the
  same way it does in Chrome.
- **Voice output** uses your OS's text-to-speech voices via
  `speechSynthesis` — quality depends on what voices Windows/macOS/Linux has
  installed.
- Jarvis can chat, reason, draft, and plan — it can't browse the web, run
  code, or control your PC. That's by design in the system prompt; wiring
  up real actions (opening apps, reading files, etc.) is a separate,
  larger step with real security implications, so it's not included here.
- Electron apps are heavier than plain web pages (a bundled Chromium), so
  expect roughly the same footprint as running Chrome — on an older machine
  this will be noticeably heavier than the browser-artifact version.

## Project structure

```
jarvis-desktop/
├── package.json     — app metadata + build config
├── main.js          — Electron main process: window, settings storage, API calls
├── preload.js        — secure bridge between main.js and the UI
├── renderer/
│   └── index.html    — the HUD UI (orb, chat, settings) — all styles/JS inline
└── README.md
```

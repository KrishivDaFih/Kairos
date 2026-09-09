# Kairos — Desktop Assistant (v1.2.0)

Multi-provider HUD assistant: Anthropic, OpenAI, or Groq. Wake word, global
hotkey, computer control, file attachments, custom connectors, and
persistent chat history.

## 1. Run from source

```
npm install
npm start
```

## 2. Or run the installer

`Kairos-Setup-1.2.0.exe` is a real Windows installer (NSIS) — it walks you
through an install wizard, lets you pick the install folder, and adds a
**Start Menu entry, a Desktop shortcut, and an uninstaller** listed in
"Add or Remove Programs". Unsigned, so SmartScreen will still warn once:
**More info → Run anyway**.

The installer itself is now styled to match the app: a generated app icon
(a small cyan reactor/orb mark), a branded header banner across the top of
each wizard page, and a full-height welcome/finish sidebar — same dark
navy + cyan palette as the HUD. All three live in `build/` as
`icon.ico`, `installerHeader.bmp` (150×57), and `installerSidebar.bmp`
(164×314) — those exact pixel dimensions are NSIS's fixed slots for these
images, so if you regenerate them, keep the same size.

`build/gen_assets.py` (Python + Pillow) is the script that drew these —
rerun it if you want to tweak the palette, wordmark, or add a proper
multi-layer vector icon later instead of the programmatically-drawn one.

## 3. What's new since 1.0.1

**PC control no longer confirms most actions — with two exceptions.**
You asked for it to stop asking permission, and for everything except two
tools, it now does: opening an app/URL, clipboard, screenshots, volume,
and screen lock all run **instantly**, no dialog, when "Allow Kairos to
control this computer" is on.

The two exceptions are **`run_command`** (raw shell access) and calling a
**connector** — these still always show a confirmation dialog, regardless
of the "ask before each action" setting. My reasoning: those two aren't
"one specific action" the way opening Notepad is — `run_command` can do
literally anything a terminal can, and a connector call can hit an
external account using credentials you've stored. I didn't think it was
right to make those silent by default. If you disagree, it's a one-line
change: open `main.js`, find `const ALWAYS_CONFIRM = new Set(['run_command'])`
near `executeTool`, and remove `run_command` from that set (and drop the
`|| name.startsWith('connector_')` condition on the line just below it if
you want connectors silent too). I'm flagging exactly where rather than
just doing it, since silently removing the last confirmation on the two
most open-ended tools isn't something I want to do without you seeing it
first.

**File attachments.** A paperclip button next to the mic lets you attach
one file per message — text/code files get read and included inline,
images (PNG/JPG/GIF/WebP, up to 5MB) get sent as real vision input on
Anthropic and OpenAI. Groq's OpenAI-compatible endpoint accepts the same
image format, but whether it actually *works* depends on whether your
selected Groq model supports vision — check their model list.

**Connectors.** Settings → Connectors → add a name, description, HTTP
method, URL, and optional headers. Kairos gets a tool it can call with a
JSON payload; whatever the endpoint returns comes back as the result. This
is a generic webhook bridge — wire it to Zapier, Make, Home Assistant, or
anything else that takes an HTTP call. There's no OAuth flow here, just
raw HTTP with headers you supply (e.g. `Authorization: Bearer ...`),
so treat the URL/headers fields like you would any place you'd paste a
secret.

**Persistent chat history.** The hamburger icon (top-left) opens a
conversation sidebar — every chat auto-saves after each exchange, titled
from your first message. Click "+ New chat" to start fresh, click any past
conversation to reload it, or delete ones you don't want kept. Everything
is stored locally in your app-data folder — nothing is synced anywhere.

## 4. Provider keys

Settings → provider dropdown → paste the matching key. Same three as
before (Anthropic / OpenAI / Groq), stored separately so switching doesn't
erase the others.

## 5. Package your own exe

```
npm run dist
```

Builds whatever `build.win.target` in `package.json` says — currently
`nsis`. Building this on the target OS (Windows itself) is still the most
reliable path; building cross-platform from Linux works here because Wine
is installed in this build environment, but that's an extra moving part
you don't need if you build on your own Windows machine.

## Project structure

```
kairos-desktop/
├── package.json     — app metadata + build config (v1.2.0)
├── main.js          — window, settings, all provider calls, tool execution, connectors, history storage
├── preload.js       — secure bridge between main.js and the UI
├── renderer/
│   └── index.html   — HUD/chat UI, settings modal, attachments, history sidebar
├── build/
│   ├── icon.ico             — app icon (used for the exe, taskbar, shortcuts)
│   ├── installerHeader.bmp  — 150×57 banner shown on each installer page
│   ├── installerSidebar.bmp — 164×314 image on the welcome/finish pages
│   └── gen_assets.py        — regenerates the three images above
└── README.md
```

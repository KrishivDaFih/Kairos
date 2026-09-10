# Kairos — Desktop Assistant (v1.4.1)

Multi-provider HUD assistant: Anthropic, OpenAI, or Groq. Wake word, global
hotkey, computer control, file attachments, custom connectors, and
persistent chat history.

## 1. Run from source

```
npm install
npm start
```

## 2. Or run the installer

`Kairos-Setup-1.4.1.exe` is a real Windows installer (NSIS) — it walks you
through an install wizard, lets you pick the install folder, and adds a
**Start Menu entry, a Desktop shortcut, and an uninstaller** listed in
"Add or Remove Programs". Unsigned, so SmartScreen will still warn once:
**More info → Run anyway**.

The installer itself is styled to match the app: a generated app icon
(a small cyan reactor/orb mark), a branded header banner across the top of
each wizard page, and a full-height welcome/finish sidebar — same dark
navy + cyan palette as the HUD. All three live in `build/` as
`icon.ico`, `installerHeader.bmp` (150×57), and `installerSidebar.bmp`
(164×314) — those exact pixel dimensions are NSIS's fixed slots for these
images, so if you regenerate them, keep the same size.

`build/gen_assets.py` (Python + Pillow) is the script that drew these —
rerun it if you want to tweak the palette, wordmark, or add a proper
multi-layer vector icon later instead of the programmatically-drawn one.

### The orb is now real 3D, not a flat SVG

You asked for the UI to feel more 3D, in the spirit of Zoey OS's
"living world" — a real spatial workspace rather than a flat dashboard.
I didn't copy Zoey OS's specific look (their layout, wordmark, and colors
are their own, trademarked design), but I took the part of the idea that
generalizes cleanly: your assistant should read as an actual object with
depth, not a 2D icon.

The orb is now rendered with [three.js](https://threejs.org) (WebGL) —
a rotating wireframe icosahedron shell around a real lit sphere core with
specular highlight, two independent counter-rotating shells for
parallax, and a soft additive glow layer. It genuinely responds to
depth-based lighting (two point lights, one key, one rim), not a
pre-baked gradient, so it looks different from every angle the camera
implicitly "sees" it from as it turns. Its spin speed and glow
intensity still map to the same states as before — idle, listening,
thinking, speaking — now interpolated smoothly frame-to-frame instead of
snapping between CSS animation durations.

Also given a 3D-ish treatment: the Settings modal now opens with a real
`rotateX` + perspective entrance instead of a flat fade, and chat bubbles
sit on a layered drop shadow and lift slightly on hover — small touches,
but they're in the same direction (real depth cues, not flat cards)
rather than the orb being the only 3D element in an otherwise flat app.

**three.js is vendored locally**, not loaded from a CDN — `renderer/vendor/three.module.js`
and `three.core.js` (~2MB total, MIT licensed) ship inside the app, so
the 3D orb works completely offline. Only the actual AI chat calls need
internet.

### v1.4.0 — more spatial, more human

You said the orb was looking bad and asked to make the whole UI look
fully like Zoey OS, same color. Two honest notes on how I approached
that, plus what actually changed:

**On "fully like Zoey OS":** Zoey OS's specific layout, wordmark, and
exact visual system are their own product's trademarked design — I
didn't clone it wholesale (their companions-orbiting-you world view,
their exact panel arrangement, their branding). What I did take is the
part of the ask that isn't proprietary to them: the general idea that an
AI assistant's interface can feel like an actual spatial environment with
depth, rather than a flat 2D dashboard with a decorative icon. If there's
a specific structural piece of their design you want (a particular
panel behavior, a specific interaction), tell me exactly what and I'll
build Kairos's own version of it — just not a wholesale visual clone.

**What actually changed** (verified with real screenshots, since "make it
look better" only means something if I check rather than assume):

- The orb itself: smoother wireframe geometry, two tilted orbiting rings
  for a distinct silhouette, a glassy clearcoat material on the core so
  it has a real specular highlight instead of a flat gradient, and subtle
  parallax — it tilts slightly toward your cursor, like it's aware of you.
- A new drifting particle field runs behind the entire app (a second,
  separate 3D scene, kept dim and slow so it adds depth without fighting
  chat readability) — the "open space" feeling Zoey OS's world view is
  going for, done as Kairos's own ambient background rather than their
  literal orbiting-companions layout.
- Chat bubbles, the settings modal, and the history panel all got a
  genuine glass treatment (backdrop blur + translucency + layered
  shadows) instead of flat solid panels, so the depth language is
  consistent across the whole app, not just the orb.
- Same cyan/navy palette throughout, as asked — nothing about the color
  identity changed, only the materials and depth.

**Voice**: the TTS voice is no longer whatever the browser defaults to.
Settings → Voice → "Auto" now scores your OS's installed voices and
picks the deepest available male one (matching common good voices like
Daniel, Ryan, Guy, David across Windows/macOS naming conventions), and
speaks slightly slower and lower-pitched than default — aiming for calm
and human rather than a chipper assistant voice. You can also pick a
specific installed voice from the dropdown if you'd rather choose
yourself. Available voices depend entirely on what's installed on your
Windows machine — if the built-in options all sound thin, installing a
better Windows voice pack (Settings → Time & Language → Speech, on
Windows) will show up here automatically.

### v1.4.1 — activity readout + voice preview

Small follow-up pass:

- A small "Idle / Listening… / Thinking… / Speaking…" label now sits under
  the docked orb once you're in chat mode — a lightweight activity readout
  in Kairos's own style, not a copy of any specific product's widget chrome.
- Settings → Voice now has a **▶ Test** button next to the voice dropdown,
  so you can preview any installed voice immediately without saving
  first — useful since voice quality is entirely dependent on what's
  installed on your Windows machine and the only way to judge "does this
  sound human enough" is to actually hear it.

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
│   ├── index.html   — HUD/chat UI, settings modal, attachments, history sidebar, 3D orb setup
│   └── vendor/
│       ├── three.module.js — vendored three.js (MIT), no CDN dependency
│       └── three.core.js
├── build/
│   ├── icon.ico             — app icon (used for the exe, taskbar, shortcuts)
│   ├── installerHeader.bmp  — 150×57 banner shown on each installer page
│   ├── installerSidebar.bmp — 164×314 image on the welcome/finish pages
│   └── gen_assets.py        — regenerates the three images above
└── README.md
```

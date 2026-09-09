const { app, BrowserWindow, ipcMain, Menu, shell, dialog, clipboard, globalShortcut, desktopCapturer, screen } = require('electron');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { exec } = require('child_process');

const CONFIG_PATH = () => path.join(app.getPath('userData'), 'kairos-config.json');
const HISTORY_PATH = () => path.join(app.getPath('userData'), 'kairos-conversations.json');

const DEFAULT_CONFIG = {
  provider: 'anthropic',
  anthropic: { apiKey: '', model: 'claude-sonnet-5' },
  openai: { apiKey: '', model: 'gpt-4o' },
  groq: { apiKey: '', model: 'llama-3.3-70b-versatile' },
  wakeWord: 'kairos',
  alwaysListening: false,
  shortcut: 'CommandOrControl+Shift+K',
  controlEnabled: false,
  confirmActions: false,
  connectors: [] // { id, name, description, method, url, headers }
};

function loadConfig() {
  try {
    const raw = fs.readFileSync(CONFIG_PATH(), 'utf-8');
    return { ...DEFAULT_CONFIG, ...JSON.parse(raw) };
  } catch (e) {
    return { ...DEFAULT_CONFIG };
  }
}
function saveConfig(cfg) {
  fs.mkdirSync(path.dirname(CONFIG_PATH()), { recursive: true });
  fs.writeFileSync(CONFIG_PATH(), JSON.stringify(cfg, null, 2), 'utf-8');
}

function loadHistoryStore() {
  try { return JSON.parse(fs.readFileSync(HISTORY_PATH(), 'utf-8')); } catch (e) { return []; }
}
function saveHistoryStore(list) {
  fs.mkdirSync(path.dirname(HISTORY_PATH()), { recursive: true });
  fs.writeFileSync(HISTORY_PATH(), JSON.stringify(list, null, 2), 'utf-8');
}

const SYSTEM_PROMPT = `You are Kairos, a highly capable personal AI assistant living in a desktop HUD app.

Your purpose is to help the user think, plan, create, research, write, organize, and complete practical work. Be proactive, precise, calm, and dependable.

Core personality:
- Be intelligent, composed, concise, and warm. Never robotic, overly flattering, or theatrical.
- Lead with the outcome or most useful answer. Use plain language unless technical depth is useful.
- State uncertainty honestly. Never invent results, sources, or actions you have not actually taken.
- Keep responses reasonably concise by default, since they may be spoken aloud — expand only when asked or the topic needs it.

Computer control and connectors:
- You may have tools to act on the user's actual computer (open apps/URLs, clipboard, screenshots, volume, lock screen, run shell commands) and/or custom "connector" tools the user has wired up to their own services. These only exist when the user turned them on in Settings.
- Most of these run instantly without asking the user first, unless they've turned confirmation back on in Settings — so when a tool call is appropriate, just use it, but that means you carry real responsibility for each call being correct and something the user actually wants. Running a raw shell command or calling a connector always shows the user a confirmation dialog first regardless of that setting, since those two are unbounded rather than one specific action. Be conservative with both: prefer the narrowest, most specific tool for the job, don't chain destructive or irreversible commands, and if a request is ambiguous about what exactly to run, ask the user rather than guessing at a shell command.
- Files the user attaches (text or images) appear inline in their message — read them as part of understanding the request.`;

const TOOL_DEFS = [
  { name: 'open_app', description: 'Open a desktop application by name or path (e.g. "notepad", "calc", "chrome").', parameters: { type: 'object', properties: { app: { type: 'string' } }, required: ['app'] } },
  { name: 'open_url', description: 'Open a URL in the default web browser.', parameters: { type: 'object', properties: { url: { type: 'string' } }, required: ['url'] } },
  { name: 'get_clipboard', description: 'Read the current text on the system clipboard.', parameters: { type: 'object', properties: {} } },
  { name: 'set_clipboard', description: 'Write text to the system clipboard.', parameters: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] } },
  { name: 'take_screenshot', description: 'Capture the primary screen and save it as a PNG. Returns the saved file path.', parameters: { type: 'object', properties: {} } },
  { name: 'system_volume', description: 'Adjust system volume.', parameters: { type: 'object', properties: { action: { type: 'string', enum: ['up', 'down', 'mute'] } }, required: ['action'] } },
  { name: 'lock_screen', description: 'Lock the computer screen immediately.', parameters: { type: 'object', properties: {} } },
  { name: 'run_command', description: 'Run a raw shell command and return its output. Use only when no other tool fits.', parameters: { type: 'object', properties: { command: { type: 'string' } }, required: ['command'] } }
];

function connectorToolDefs(cfg) {
  return (cfg.connectors || []).map((c) => ({
    name: 'connector_' + c.id,
    description: c.description || `Call the "${c.name}" connector.`,
    parameters: { type: 'object', properties: { payload: { type: 'object', description: 'JSON payload to send to this connector.' } } }
  }));
}

function anthropicTools(defs) { return defs.map((t) => ({ name: t.name, description: t.description, input_schema: t.parameters })); }
function openaiTools(defs) { return defs.map((t) => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.parameters } })); }

function describeAction(name, input, cfg) {
  if (name.startsWith('connector_')) {
    const c = (cfg.connectors || []).find((x) => 'connector_' + x.id === name);
    return `Call connector "${c ? c.name : name}" with ${JSON.stringify(input.payload || {})}`;
  }
  switch (name) {
    case 'open_app': return `Open application: ${input.app}`;
    case 'open_url': return `Open URL: ${input.url}`;
    case 'get_clipboard': return 'Read the clipboard';
    case 'set_clipboard': return `Set clipboard to: ${(input.text || '').slice(0, 80)}`;
    case 'take_screenshot': return 'Take a screenshot';
    case 'system_volume': return `Change volume: ${input.action}`;
    case 'lock_screen': return 'Lock the screen';
    case 'run_command': return `Run command: ${input.command}`;
    default: return name;
  }
}

function execAsync(cmd) {
  return new Promise((resolve) => {
    exec(cmd, { timeout: 15000, windowsHide: true }, (error, stdout, stderr) => {
      if (error && !stdout && !stderr) resolve({ ok: false, output: error.message });
      else resolve({ ok: true, output: (stdout || stderr || 'Done.').toString().slice(0, 4000) });
    });
  });
}

function parseHeaders(headerText) {
  const headers = {};
  (headerText || '').split('\n').forEach((line) => {
    const idx = line.indexOf(':');
    if (idx > -1) headers[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
  });
  return headers;
}

async function callConnector(connector, input) {
  const method = (connector.method || 'GET').toUpperCase();
  const headers = parseHeaders(connector.headers);
  let url = connector.url;
  const opts = { method, headers };
  if (method === 'GET') {
    const qs = new URLSearchParams(Object.entries(input.payload || {}).map(([k, v]) => [k, typeof v === 'string' ? v : JSON.stringify(v)]));
    const sep = url.includes('?') ? '&' : '?';
    if ([...qs].length) url += sep + qs.toString();
  } else {
    headers['Content-Type'] = headers['Content-Type'] || 'application/json';
    opts.body = JSON.stringify(input.payload || {});
  }
  const res = await fetch(url, opts);
  const text = await res.text();
  return { ok: res.ok, output: text.slice(0, 4000) };
}

// These two stay behind a confirmation dialog no matter what confirmActions is
// set to: run_command is unbounded (it can do literally anything a terminal
// can), and connectors act on outside accounts using credentials you've
// stored. Every other action (open app/url, clipboard, screenshot, volume,
// lock screen) respects confirmActions and runs instantly when it's off.
const ALWAYS_CONFIRM = new Set(['run_command']);

async function executeTool(name, input, cfg, win) {
  const needsConfirm = cfg.confirmActions || ALWAYS_CONFIRM.has(name) || name.startsWith('connector_');
  if (needsConfirm) {
    const { response } = await dialog.showMessageBox(win, {
      type: 'question',
      buttons: ['Allow', 'Deny'],
      defaultId: 0,
      cancelId: 1,
      title: 'Kairos wants to take an action',
      message: describeAction(name, input, cfg),
      detail: 'Kairos is about to do this on your machine.'
    });
    if (response !== 0) return { ok: false, output: 'The user denied this action.' };
  }

  try {
    if (name.startsWith('connector_')) {
      const connector = (cfg.connectors || []).find((c) => 'connector_' + c.id === name);
      if (!connector) return { ok: false, output: 'That connector no longer exists.' };
      return await callConnector(connector, input);
    }

    switch (name) {
      case 'open_app': {
        const app_ = (input.app || '').replace(/"/g, '');
        return await execAsync(process.platform === 'win32' ? `start "" "${app_}"` : (process.platform === 'darwin' ? `open -a "${app_}"` : `${app_} &`));
      }
      case 'open_url': {
        await shell.openExternal(input.url);
        return { ok: true, output: 'Opened.' };
      }
      case 'get_clipboard':
        return { ok: true, output: clipboard.readText() || '(clipboard is empty)' };
      case 'set_clipboard':
        clipboard.writeText(input.text || '');
        return { ok: true, output: 'Clipboard updated.' };
      case 'take_screenshot': {
        const primary = screen.getPrimaryDisplay();
        const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: primary.size });
        const source = sources[0];
        if (!source) return { ok: false, output: 'No screen source available.' };
        const file = path.join(app.getPath('pictures'), `kairos-screenshot-${Date.now()}.png`);
        fs.writeFileSync(file, source.thumbnail.toPNG());
        return { ok: true, output: `Saved to ${file}` };
      }
      case 'system_volume': {
        const keyMap = { up: 175, down: 174, mute: 173 };
        const code = keyMap[input.action];
        if (!code) return { ok: false, output: 'Unknown volume action.' };
        if (process.platform !== 'win32') return { ok: false, output: 'Volume control is only wired up for Windows in this build.' };
        return await execAsync(`powershell -NoProfile -Command "$w = New-Object -ComObject WScript.Shell; $w.SendKeys([char]${code})"`);
      }
      case 'lock_screen': {
        if (process.platform === 'win32') return await execAsync('rundll32.exe user32.dll,LockWorkStation');
        if (process.platform === 'darwin') return await execAsync('pmset displaysleepnow');
        return { ok: false, output: 'Lock screen isn\u2019t wired up for this OS in this build.' };
      }
      case 'run_command':
        return await execAsync(input.command);
      default:
        return { ok: false, output: 'Unknown tool.' };
    }
  } catch (err) {
    return { ok: false, output: 'Error: ' + err.message };
  }
}

/* ---------------- content translation (text + image attachments) ---------------- */

function toAnthropicContent(content) {
  if (typeof content === 'string') return content;
  return content.map((b) => b.type === 'image'
    ? { type: 'image', source: { type: 'base64', media_type: b.mediaType, data: b.data } }
    : { type: 'text', text: b.text });
}
function toOpenAIContent(content) {
  if (typeof content === 'string') return content;
  return content.map((b) => b.type === 'image'
    ? { type: 'image_url', image_url: { url: `data:${b.mediaType};base64,${b.data}` } }
    : { type: 'text', text: b.text });
}

/* ---------------- provider calls ---------------- */

async function callAnthropic(cfg, messages, tools) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': cfg.anthropic.apiKey, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model: cfg.anthropic.model || 'claude-sonnet-5',
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages,
      ...(tools.length ? { tools: anthropicTools(tools) } : {})
    })
  });
  const data = await res.json();
  if (!res.ok) throw new Error((data.error && data.error.message) || `Anthropic error ${res.status}`);
  const toolUses = (data.content || []).filter((b) => b.type === 'tool_use');
  const text = (data.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim();
  return { text, toolUses, assistantBlocks: data.content };
}

async function callOpenAICompatible(baseUrl, cfg, providerKey, messages, tools) {
  const res = await fetch(baseUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg[providerKey].apiKey}` },
    body: JSON.stringify({
      model: cfg[providerKey].model,
      messages,
      ...(tools.length ? { tools: openaiTools(tools), tool_choice: 'auto' } : {})
    })
  });
  const data = await res.json();
  if (!res.ok) throw new Error((data.error && data.error.message) || `${providerKey} error ${res.status}`);
  const msg = data.choices[0].message;
  return { text: (msg.content || '').trim(), toolCalls: msg.tool_calls || [], rawMessage: msg };
}

async function runConversation(cfg, plainHistory, win) {
  const toolDefs = [
    ...(cfg.controlEnabled ? TOOL_DEFS : []),
    ...connectorToolDefs(cfg)
  ];
  const actions = [];

  if (cfg.provider === 'anthropic') {
    let msgs = plainHistory.map((h) => ({ role: h.role, content: toAnthropicContent(h.content) }));
    for (let i = 0; i < 6; i++) {
      const { text, toolUses, assistantBlocks } = await callAnthropic(cfg, msgs, toolDefs);
      if (!toolUses.length) return { ok: true, text: text || '…', actions };
      msgs.push({ role: 'assistant', content: assistantBlocks });
      const resultBlocks = [];
      for (const tu of toolUses) {
        const result = await executeTool(tu.name, tu.input || {}, cfg, win);
        actions.push(describeAction(tu.name, tu.input || {}, cfg) + (result.ok ? '' : ' — declined/failed'));
        resultBlocks.push({ type: 'tool_result', tool_use_id: tu.id, content: String(result.output).slice(0, 4000) });
      }
      msgs.push({ role: 'user', content: resultBlocks });
    }
    return { ok: false, error: 'Tool loop did not finish after several steps.' };
  }

  const baseUrl = cfg.provider === 'groq' ? 'https://api.groq.com/openai/v1/chat/completions' : 'https://api.openai.com/v1/chat/completions';
  let msgs = [{ role: 'system', content: SYSTEM_PROMPT }, ...plainHistory.map((h) => ({ role: h.role, content: toOpenAIContent(h.content) }))];
  for (let i = 0; i < 6; i++) {
    const { text, toolCalls, rawMessage } = await callOpenAICompatible(baseUrl, cfg, cfg.provider, msgs, toolDefs);
    if (!toolCalls.length) return { ok: true, text: text || '…', actions };
    msgs.push({ role: 'assistant', content: rawMessage.content, tool_calls: toolCalls });
    for (const tc of toolCalls) {
      let input = {};
      try { input = JSON.parse(tc.function.arguments || '{}'); } catch (e) { /* leave empty */ }
      const result = await executeTool(tc.function.name, input, cfg, win);
      actions.push(describeAction(tc.function.name, input, cfg) + (result.ok ? '' : ' — declined/failed'));
      msgs.push({ role: 'tool', tool_call_id: tc.id, content: String(result.output).slice(0, 4000) });
    }
  }
  return { ok: false, error: 'Tool loop did not finish after several steps.' };
}

/* ---------------- file reading ---------------- */

const TEXT_EXT = new Set(['.txt', '.md', '.csv', '.json', '.js', '.ts', '.py', '.html', '.css', '.log', '.xml', '.yaml', '.yml', '.c', '.cpp', '.java', '.sh', '.bat']);
const IMAGE_EXT = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp' };

async function readAttachment(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const name = path.basename(filePath);
  if (IMAGE_EXT[ext]) {
    const buf = fs.readFileSync(filePath);
    if (buf.length > 5 * 1024 * 1024) return { ok: false, error: 'Image is larger than 5MB.' };
    return { ok: true, kind: 'image', name, mediaType: IMAGE_EXT[ext], data: buf.toString('base64') };
  }
  if (TEXT_EXT.has(ext)) {
    let text = fs.readFileSync(filePath, 'utf-8');
    if (text.length > 20000) text = text.slice(0, 20000) + '\n…(truncated)';
    return { ok: true, kind: 'text', name, text };
  }
  return { ok: true, kind: 'unsupported', name };
}

/* ---------------- window & app lifecycle ---------------- */

let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1100, height: 720, minWidth: 640, minHeight: 480,
    backgroundColor: '#060a10', title: 'Kairos',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false }
  });
  Menu.setApplicationMenu(null);
  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
}

function registerShortcut(cfg) {
  globalShortcut.unregisterAll();
  if (!cfg.shortcut) return;
  try {
    globalShortcut.register(cfg.shortcut, () => {
      if (!mainWindow) return;
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
      mainWindow.webContents.send('kairos:trigger-listen');
    });
  } catch (e) { /* invalid accelerator string */ }
}

app.whenReady().then(() => {
  createWindow();
  registerShortcut(loadConfig());
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on('will-quit', () => globalShortcut.unregisterAll());
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });

/* ---------------- IPC: settings ---------------- */

ipcMain.handle('kairos:get-settings', () => {
  const cfg = loadConfig();
  return {
    provider: cfg.provider,
    hasKey: { anthropic: !!cfg.anthropic.apiKey, openai: !!cfg.openai.apiKey, groq: !!cfg.groq.apiKey },
    models: { anthropic: cfg.anthropic.model, openai: cfg.openai.model, groq: cfg.groq.model },
    wakeWord: cfg.wakeWord,
    alwaysListening: cfg.alwaysListening,
    shortcut: cfg.shortcut,
    controlEnabled: cfg.controlEnabled,
    confirmActions: cfg.confirmActions,
    connectors: cfg.connectors || []
  };
});

ipcMain.handle('kairos:set-settings', (_e, patch) => {
  const cfg = loadConfig();
  if (patch.provider) cfg.provider = patch.provider;
  for (const p of ['anthropic', 'openai', 'groq']) {
    if (patch.keys && typeof patch.keys[p] === 'string' && patch.keys[p].trim()) cfg[p].apiKey = patch.keys[p].trim();
    if (patch.models && typeof patch.models[p] === 'string' && patch.models[p].trim()) cfg[p].model = patch.models[p].trim();
  }
  if (typeof patch.wakeWord === 'string') cfg.wakeWord = patch.wakeWord.trim() || 'kairos';
  if (typeof patch.alwaysListening === 'boolean') cfg.alwaysListening = patch.alwaysListening;
  if (typeof patch.shortcut === 'string' && patch.shortcut.trim()) cfg.shortcut = patch.shortcut.trim();
  if (typeof patch.controlEnabled === 'boolean') cfg.controlEnabled = patch.controlEnabled;
  if (typeof patch.confirmActions === 'boolean') cfg.confirmActions = patch.confirmActions;
  if (Array.isArray(patch.connectors)) cfg.connectors = patch.connectors;
  saveConfig(cfg);
  registerShortcut(cfg);
  return { ok: true };
});

ipcMain.handle('kairos:add-connector', (_e, connector) => {
  const cfg = loadConfig();
  const id = crypto.randomBytes(4).toString('hex');
  cfg.connectors = cfg.connectors || [];
  cfg.connectors.push({ id, ...connector });
  saveConfig(cfg);
  return { ok: true, connectors: cfg.connectors };
});

ipcMain.handle('kairos:remove-connector', (_e, id) => {
  const cfg = loadConfig();
  cfg.connectors = (cfg.connectors || []).filter((c) => c.id !== id);
  saveConfig(cfg);
  return { ok: true, connectors: cfg.connectors };
});

/* ---------------- IPC: chat + files ---------------- */

ipcMain.handle('kairos:chat', async (_e, { history }) => {
  const cfg = loadConfig();
  if (!cfg[cfg.provider].apiKey) return { ok: false, error: `No ${cfg.provider} API key set. Open Settings and add one.` };
  try {
    return await runConversation(cfg, history, mainWindow);
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('kairos:pick-file', async () => {
  const result = await dialog.showOpenDialog(mainWindow, { properties: ['openFile'] });
  if (result.canceled || !result.filePaths[0]) return { ok: false, canceled: true };
  try {
    return await readAttachment(result.filePaths[0]);
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('kairos:open-external', (_e, url) => shell.openExternal(url));

/* ---------------- IPC: conversation history ---------------- */

ipcMain.handle('kairos:list-conversations', () => {
  return loadHistoryStore().map((c) => ({ id: c.id, title: c.title, updatedAt: c.updatedAt })).sort((a, b) => b.updatedAt - a.updatedAt);
});

ipcMain.handle('kairos:load-conversation', (_e, id) => {
  const conv = loadHistoryStore().find((c) => c.id === id);
  return conv || null;
});

ipcMain.handle('kairos:save-conversation', (_e, { id, title, messages }) => {
  const list = loadHistoryStore();
  const existingIdx = list.findIndex((c) => c.id === id);
  const record = { id: id || crypto.randomBytes(6).toString('hex'), title: title || 'New conversation', messages, updatedAt: Date.now() };
  if (existingIdx > -1) list[existingIdx] = record; else list.push(record);
  saveHistoryStore(list);
  return { id: record.id };
});

ipcMain.handle('kairos:delete-conversation', (_e, id) => {
  saveHistoryStore(loadHistoryStore().filter((c) => c.id !== id));
  return { ok: true };
});

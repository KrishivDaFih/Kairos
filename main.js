const { app, BrowserWindow, ipcMain, Menu, shell } = require('electron');
const path = require('path');
const fs = require('fs');

const CONFIG_PATH = () => path.join(app.getPath('userData'), 'jarvis-config.json');

function loadConfig() {
  try {
    const raw = fs.readFileSync(CONFIG_PATH(), 'utf-8');
    return JSON.parse(raw);
  } catch (e) {
    return { apiKey: '', model: 'claude-sonnet-5' };
  }
}

function saveConfig(config) {
  fs.mkdirSync(path.dirname(CONFIG_PATH()), { recursive: true });
  fs.writeFileSync(CONFIG_PATH(), JSON.stringify(config, null, 2), 'utf-8');
}

const SYSTEM_PROMPT = `You are Jarvis, a highly capable personal AI assistant.

Your purpose is to help the user think, plan, create, research, write, organize, and complete practical work. Be proactive, precise, calm, and dependable. Treat each request as a collaboration: understand the goal, make sensible assumptions, and clearly communicate the result.

Core personality:
- Be intelligent, composed, concise, and warm.
- Speak naturally, with quiet confidence — never robotic, overly flattering, or theatrical.
- Lead with the outcome or most useful answer.
- Use plain language unless technical depth is useful.
- State uncertainty honestly. Never invent results, sources, or actions you have not actually taken.
- You are a conversational voice/text assistant embedded in a desktop HUD app — you cannot browse the web, run code, or take real-world actions on this machine. If asked to do something outside that scope, say so plainly and offer the closest useful alternative.
- Keep responses reasonably concise by default, since they are read on a small HUD readout and may be spoken aloud — expand only when the user asks for depth or the topic requires it.
- Avoid excessive headings, repetition, disclaimers, or generic motivational language.`;

function createWindow() {
  const win = new BrowserWindow({
    width: 1100,
    height: 720,
    minWidth: 640,
    minHeight: 480,
    backgroundColor: '#060a10',
    title: 'JARVIS',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  Menu.setApplicationMenu(null);
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
}

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

/* ---------------- IPC: settings ---------------- */

ipcMain.handle('jarvis:get-settings', () => {
  const cfg = loadConfig();
  return { hasKey: !!cfg.apiKey, model: cfg.model || 'claude-sonnet-5' };
});

ipcMain.handle('jarvis:set-settings', (_event, { apiKey, model }) => {
  const cfg = loadConfig();
  if (typeof apiKey === 'string') cfg.apiKey = apiKey.trim();
  if (typeof model === 'string' && model.trim()) cfg.model = model.trim();
  saveConfig(cfg);
  return { ok: true };
});

/* ---------------- IPC: chat ---------------- */

ipcMain.handle('jarvis:chat', async (_event, { history }) => {
  const cfg = loadConfig();
  if (!cfg.apiKey) {
    return { ok: false, error: 'No API key set. Open Settings and paste your Anthropic API key.' };
  }

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': cfg.apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: cfg.model || 'claude-sonnet-5',
        max_tokens: 1000,
        system: SYSTEM_PROMPT,
        messages: history
      })
    });

    const data = await response.json();

    if (!response.ok) {
      const message = (data && data.error && data.error.message) || ('Request failed: ' + response.status);
      return { ok: false, error: message };
    }

    const text = (data.content || [])
      .filter((b) => b.type === 'text')
      .map((b) => b.text)
      .join('\n')
      .trim();

    return { ok: true, text: text || '…' };
  } catch (err) {
    return { ok: false, error: 'Network error: ' + err.message };
  }
});

ipcMain.handle('jarvis:open-external', (_event, url) => {
  shell.openExternal(url);
});

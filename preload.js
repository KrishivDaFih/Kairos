const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('jarvis', {
  chat: (history) => ipcRenderer.invoke('jarvis:chat', { history }),
  getSettings: () => ipcRenderer.invoke('jarvis:get-settings'),
  setSettings: (settings) => ipcRenderer.invoke('jarvis:set-settings', settings),
  openExternal: (url) => ipcRenderer.invoke('jarvis:open-external', url)
});

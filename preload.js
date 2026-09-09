const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('kairos', {
  chat: (history) => ipcRenderer.invoke('kairos:chat', { history }),
  getSettings: () => ipcRenderer.invoke('kairos:get-settings'),
  setSettings: (patch) => ipcRenderer.invoke('kairos:set-settings', patch),
  addConnector: (connector) => ipcRenderer.invoke('kairos:add-connector', connector),
  removeConnector: (id) => ipcRenderer.invoke('kairos:remove-connector', id),
  openExternal: (url) => ipcRenderer.invoke('kairos:open-external', url),
  onTriggerListen: (callback) => ipcRenderer.on('kairos:trigger-listen', callback),
  pickFile: () => ipcRenderer.invoke('kairos:pick-file'),
  listConversations: () => ipcRenderer.invoke('kairos:list-conversations'),
  loadConversation: (id) => ipcRenderer.invoke('kairos:load-conversation', id),
  saveConversation: (payload) => ipcRenderer.invoke('kairos:save-conversation', payload),
  deleteConversation: (id) => ipcRenderer.invoke('kairos:delete-conversation', id)
});

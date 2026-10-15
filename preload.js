const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('moyi', {
  hideWindow: () => ipcRenderer.invoke('window:hide'),
  quitApp: () => ipcRenderer.invoke('window:quit'),
  togglePin: () => ipcRenderer.invoke('window:toggle-pin'),
  notify: (title, body) => ipcRenderer.invoke('notify', { title, body }),
  resize: (width, height) => ipcRenderer.invoke('window:resize', { width, height }),
  pickAudio: () => ipcRenderer.invoke('music:pick'),
  exportData: (data, format) => ipcRenderer.invoke('data:export', { data, format }),
  importData: () => ipcRenderer.invoke('data:import'),
});
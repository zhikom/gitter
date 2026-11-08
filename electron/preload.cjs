const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  openDirectoryDialog: () => ipcRenderer.invoke('dialog:open-directory'),
  openExternalUrl: (url) => ipcRenderer.invoke('shell:open-external', url),
});

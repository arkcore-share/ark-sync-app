import { contextBridge, ipcRenderer } from 'electron'

export type ConnectionPayload = {
  baseUrl: string
  apiKey: string
  rejectUnauthorized: boolean
  localSession?: boolean
  guiUser?: string
  guiPassword?: string
}

contextBridge.exposeInMainWorld('syncWeb', {
  getConnection: (): Promise<ConnectionPayload | null> => ipcRenderer.invoke('connection:get'),
  setConnection: (c: ConnectionPayload): Promise<boolean> => ipcRenderer.invoke('connection:set', c),
  clearConnection: (): Promise<boolean> => ipcRenderer.invoke('connection:clear'),
  openPath: (p: string): Promise<string> => ipcRenderer.invoke('shell:openPath', p),
  showItemInFolder: (p: string): Promise<boolean> => ipcRenderer.invoke('shell:showItemInFolder', p),
  syncthingRest: (p: Record<string, unknown>): Promise<Record<string, unknown>> =>
    ipcRenderer.invoke('syncthing:rest', p),
  syncthingGetAsset: (p: Record<string, unknown>): Promise<Record<string, unknown>> =>
    ipcRenderer.invoke('syncthing:getAsset', p)
})

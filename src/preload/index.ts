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
  /** Node process.platform，用于渲染进程按平台留出标题栏/红绿灯区域 */
  electronPlatform: process.platform,
  windowMinimize: (): Promise<void> => ipcRenderer.invoke('window:minimize'),
  windowMaximizeToggle: (): Promise<boolean> => ipcRenderer.invoke('window:maximizeToggle'),
  windowClose: (): Promise<void> => ipcRenderer.invoke('window:close'),
  windowIsMaximized: (): Promise<boolean> => ipcRenderer.invoke('window:isMaximized'),
  onWindowMaximized: (listener: (maximized: boolean) => void): (() => void) => {
    const handler = (_e: unknown, maximized: boolean): void => {
      listener(maximized)
    }
    ipcRenderer.on('window:maximized', handler)
    return () => ipcRenderer.removeListener('window:maximized', handler)
  },
  getConnection: (): Promise<ConnectionPayload | null> => ipcRenderer.invoke('connection:get'),
  setConnection: (c: ConnectionPayload): Promise<boolean> => ipcRenderer.invoke('connection:set', c),
  clearConnection: (): Promise<boolean> => ipcRenderer.invoke('connection:clear'),
  openPath: (p: string): Promise<string> => ipcRenderer.invoke('shell:openPath', p),
  showItemInFolder: (p: string): Promise<boolean> => ipcRenderer.invoke('shell:showItemInFolder', p),
  openExternal: (url: string): Promise<boolean> => ipcRenderer.invoke('shell:openExternal', url),
  syncthingRest: (p: Record<string, unknown>): Promise<Record<string, unknown>> =>
    ipcRenderer.invoke('syncthing:rest', p),
  syncthingGetAsset: (p: Record<string, unknown>): Promise<Record<string, unknown>> =>
    ipcRenderer.invoke('syncthing:getAsset', p)
})

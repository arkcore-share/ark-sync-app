import { app } from 'electron'
import { join } from 'node:path'

/**
 * 与 electron-builder `extraResources` 中 `to: "backend"` 对应。
 * 开发：`<repo>/resources/backend`；安装包：`process.resourcesPath/backend`
 */
export function getBundledBackendRoot(): string {
  if (app.isPackaged) {
    return join(process.resourcesPath, 'backend')
  }
  return join(__dirname, '../../resources/backend')
}

/** 后端目录下文件的绝对路径，例如 `bundledBackendPath('arksync.exe')` */
export function bundledBackendPath(...segments: string[]): string {
  return join(getBundledBackendRoot(), ...segments)
}

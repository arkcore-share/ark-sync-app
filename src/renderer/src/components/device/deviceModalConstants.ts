import type { FolderConfiguration } from '../../api/types'
import { sameDeviceId } from '../../util/format'

export type DeviceModalTabId = 'general' | 'sharing' | 'advanced'

export const DEVICE_MODAL_TABS: { id: DeviceModalTabId; label: string; glyph: string }[] = [
  { id: 'general', label: '常规', glyph: '⚙' },
  { id: 'sharing', label: '共享', glyph: '⎘' },
  { id: 'advanced', label: '高级', glyph: '⛭' }
]

export function folderHasDevice(folder: FolderConfiguration, deviceId: string): boolean {
  return (folder.devices || []).some((d) => sameDeviceId(d.deviceID, deviceId))
}

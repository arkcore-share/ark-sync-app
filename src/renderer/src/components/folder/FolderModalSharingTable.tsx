import React from 'react'
import type { FolderConfiguration } from '../../api/types'
import FolderSharePwInput from './FolderSharePwInput'

export type FolderModalSharingMode = 'add' | 'edit'

export default function FolderModalSharingTable({
  mode,
  devices,
  folderType,
  isRemoteSelected,
  onToggleRemote,
  devicePasswords,
  setDevicePasswords,
  pwVisible,
  setPwVisible,
  onSelectAll,
  onDeselectAll
}: {
  mode: FolderModalSharingMode
  devices: { deviceID: string; name: string }[]
  folderType: FolderConfiguration['type']
  isRemoteSelected: (deviceId: string) => boolean
  onToggleRemote: (deviceId: string, on: boolean) => void
  devicePasswords: Record<string, string>
  setDevicePasswords: React.Dispatch<React.SetStateAction<Record<string, string>>>
  pwVisible: Record<string, boolean>
  setPwVisible: React.Dispatch<React.SetStateAction<Record<string, boolean>>>
  onSelectAll: () => void
  onDeselectAll: () => void
}): React.ReactElement {
  const isEdit = mode === 'edit'
  const title = isEdit ? '当前设备已共享' : '非共享设备'
  const desc = isEdit
    ? '取消选择要停止与之共享此文件夹的设备。'
    : '选择要与之共享此文件夹的其他设备。'

  const togglePwVis = (id: string) => {
    setPwVisible((m) => ({ ...m, [id]: !m[id] }))
  }

  return (
    <>
      <div className="sharing-folders-head folder-sharing-head">
        <div>
          <strong>{title}</strong>
          <p className="field-help" style={{ margin: '0.25rem 0 0' }}>
            {desc}
          </p>
        </div>
        <div className="sharing-folders-links">
          <button type="button" className="link-btn" onClick={onSelectAll}>
            全选
          </button>
          <span className="muted"> · </span>
          <button type="button" className="link-btn" onClick={onDeselectAll}>
            取消全选
          </button>
        </div>
      </div>
      <div className="folder-share-table">
        {isEdit && (
          <div className="folder-share-row folder-share-row-local">
            <label className="checkbox folder-share-check">
              <input type="checkbox" checked disabled /> 本机（始终共享）
            </label>
          </div>
        )}
        {devices.map((d, rowIdx) => {
          const devId = d.deviceID != null && d.deviceID !== '' ? String(d.deviceID) : ''
          const rowKey = devId || `row-${rowIdx}`
          const checked = devId ? isRemoteSelected(devId) : false
          const shortId = devId ? devId.slice(0, 7) : ''
          const labelText = (d.name && String(d.name).trim()) || shortId || '（未知设备）'
          return (
            <div key={rowKey} className="folder-share-row">
              <label className="checkbox folder-share-check">
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={!devId}
                  onChange={(e) => devId && onToggleRemote(devId, e.target.checked)}
                />
                {labelText}
              </label>
              {checked && devId ? (
                <FolderSharePwInput
                  value={devicePasswords[devId] ?? ''}
                  onChange={(v) => setDevicePasswords((m) => ({ ...m, [devId]: v }))}
                  visible={!!pwVisible[devId]}
                  onToggleVisible={() => togglePwVis(devId)}
                />
              ) : (
                <span className="muted" style={{ fontSize: '0.85rem' }}>
                  —
                </span>
              )}
            </div>
          )
        })}
        {devices.length === 0 && <p className="muted" style={{ padding: '0.5rem 0.85rem', margin: 0 }}>暂无远程设备</p>}
      </div>
      <p className="field-help" style={{ marginTop: '0.75rem' }}>
        {folderType === 'receiveencrypted'
          ? '保存配置时，会将各设备的加密密码一并写入（与官方「接收加密」行为一致）。'
          : '加密密码仅在文件夹类型为「接收加密」时才会写入配置；当前类型下可填写但不会生效。'}
      </p>
    </>
  )
}

import React from 'react'
import type { FolderConfiguration } from '../../api/types'
import FolderSharePwInput from '../folder/FolderSharePwInput'

export type DeviceModalSharingMode = 'add' | 'edit'

export default function DeviceModalSharingPanel({
  mode,
  introducer,
  onIntroducer,
  autoAccept,
  onAutoAccept,
  untrusted,
  folders,
  folderShare,
  setFolderShare,
  folderSharePasswords,
  setFolderSharePasswords,
  folderPwVisible,
  setFolderPwVisible,
  onSelectAllFolders,
  onDeselectAllFolders
}: {
  mode: DeviceModalSharingMode
  introducer: boolean
  onIntroducer: (v: boolean) => void
  autoAccept: boolean
  onAutoAccept: (v: boolean) => void
  untrusted: boolean
  folders: FolderConfiguration[]
  folderShare: Record<string, boolean>
  setFolderShare: React.Dispatch<React.SetStateAction<Record<string, boolean>>>
  folderSharePasswords: Record<string, string>
  setFolderSharePasswords: React.Dispatch<React.SetStateAction<Record<string, string>>>
  folderPwVisible: Record<string, boolean>
  setFolderPwVisible: React.Dispatch<React.SetStateAction<Record<string, boolean>>>
  onSelectAllFolders: () => void
  onDeselectAllFolders: () => void
}): React.ReactElement {
  const isEdit = mode === 'edit'
  const blockTitle = isEdit ? '共享文件夹' : '非共享文件夹'
  const blockHint = isEdit
    ? '取消选择文件夹以停止与此设备共享。'
    : '选择要与此设备共享的其他文件夹。'

  return (
    <div className="modal-tab-panel">
      <div className="device-sharing-cols">
        <div className="field checkbox">
          <label>
            <input
              type="checkbox"
              checked={introducer}
              disabled={untrusted}
              onChange={(e) => onIntroducer(e.target.checked)}
            />
            作为中介
          </label>
          <p className="field-help">将中介中的设备添加到我们的设备列表中，用于相互共享的文件夹。</p>
        </div>
        <div className="field checkbox">
          <label>
            <input
              type="checkbox"
              checked={autoAccept}
              disabled={untrusted}
              onChange={(e) => onAutoAccept(e.target.checked)}
            />
            自动接受
          </label>
          <p className="field-help">自动创建或共享此设备在默认路径上显示的文件夹。</p>
        </div>
      </div>
      <div className="device-sharing-folders-block">
        <div className="sharing-folders-head">
          <div>
            <strong>{blockTitle}</strong>
            <p className="field-help device-sharing-folders-hint">{blockHint}</p>
          </div>
          <div className="sharing-folders-links">
            <button type="button" className="link-btn" onClick={onSelectAllFolders}>
              全选
            </button>
            <span className="muted"> · </span>
            <button type="button" className="link-btn" onClick={onDeselectAllFolders}>
              取消全选
            </button>
          </div>
        </div>
        <div className="device-share-folder-table">
          {folders.map((f) => {
            const checked = !!folderShare[f.id]
            return (
              <div key={f.id} className="device-share-folder-row">
                <label className="checkbox device-share-folder-check">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(e) => {
                      const on = e.target.checked
                      setFolderShare((s) => ({ ...s, [f.id]: on }))
                      if (!on) {
                        setFolderSharePasswords((m) => {
                          const next = { ...m }
                          delete next[f.id]
                          return next
                        })
                        setFolderPwVisible((m) => {
                          const next = { ...m }
                          delete next[f.id]
                          return next
                        })
                      }
                    }}
                  />
                  <span className="device-share-folder-name">{f.label || f.id}</span>
                </label>
                <FolderSharePwInput
                  value={folderSharePasswords[f.id] ?? ''}
                  onChange={(v) => setFolderSharePasswords((m) => ({ ...m, [f.id]: v }))}
                  visible={!!folderPwVisible[f.id]}
                  onToggleVisible={() => setFolderPwVisible((m) => ({ ...m, [f.id]: !m[f.id] }))}
                  disabled={!checked}
                  placeholder={checked ? '如果不受信任，请输入加密密码' : '不共享'}
                />
              </div>
            )
          })}
          {folders.length === 0 && <p className="muted device-share-folder-empty">暂无文件夹</p>}
        </div>
      </div>
    </div>
  )
}

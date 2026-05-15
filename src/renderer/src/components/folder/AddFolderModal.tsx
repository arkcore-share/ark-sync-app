import React, { useEffect, useState } from 'react'
import { useConnection } from '../../context/ConnectionContext'
import type { FolderConfiguration } from '../../api/types'
import { type FolderModalTabId, generateFolderId, minDiskFreeFormToApi, type MinDiskUnit } from './folderModalConstants'
import FolderModalAdvancedFields from './FolderModalAdvancedFields'
import FolderModalGeneralFields from './FolderModalGeneralFields'
import FolderModalIgnoresFields from './FolderModalIgnoresFields'
import FolderModalSharingTable from './FolderModalSharingTable'
import FolderModalTabStrip from './FolderModalTabStrip'
import FolderModalVersioningFields from './FolderModalVersioningFields'

export default function AddFolderModal({
  myId,
  devices,
  onClose,
  onSave
}: {
  myId: string
  devices: { deviceID: string; name: string }[]
  onClose: () => void
  onSave: () => void
}): React.ReactElement {
  const { client } = useConnection()
  const [tab, setTab] = useState<FolderModalTabId>('general')
  const [folderId, setFolderId] = useState(() => generateFolderId())
  const [label, setLabel] = useState('')
  const [group, setGroup] = useState('')
  const [path, setPath] = useState('')
  const [tildePath, setTildePath] = useState('')
  const [type, setType] = useState<FolderConfiguration['type']>('sendreceive')
  const [selected, setSelected] = useState<Record<string, boolean>>({})
  const [devicePasswords, setDevicePasswords] = useState<Record<string, string>>({})
  const [pwVisible, setPwVisible] = useState<Record<string, boolean>>({})
  const [addIgnoreLater, setAddIgnoreLater] = useState(false)
  const [verType, setVerType] = useState('')
  const [simpleKeep, setSimpleKeep] = useState(5)
  const [trashDays, setTrashDays] = useState(30)
  const [staggerDays, setStaggerDays] = useState(365)
  const [staggerCleanup, setStaggerCleanup] = useState(3600)
  const [staggerFsPath, setStaggerFsPath] = useState('')
  const [externalCmd, setExternalCmd] = useState('')
  const [rescanIntervalS, setRescanIntervalS] = useState(3600)
  const [fsWatcherEnabled, setFsWatcherEnabled] = useState(true)
  const [minDiskNum, setMinDiskNum] = useState('1')
  const [minDiskUnit, setMinDiskUnit] = useState<MinDiskUnit>('%')
  const [order, setOrder] = useState('random')
  const [ignorePerms, setIgnorePerms] = useState(false)
  const [blockIndexing, setBlockIndexing] = useState(true)
  const [syncOwnership, setSyncOwnership] = useState(false)
  const [sendOwnership, setSendOwnership] = useState(false)
  const [syncXattrs, setSyncXattrs] = useState(false)
  const [sendXattrs, setSendXattrs] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    if (!client) {
      return
    }
    let cancelled = false
    void (async () => {
      try {
        const st = await client.systemStatus()
        if (!cancelled && typeof st.tilde === 'string' && st.tilde) {
          setTildePath(st.tilde)
        }
      } catch {
        /* 忽略 */
      }
    })()
    return () => {
      cancelled = true
    }
  }, [client])

  const isRemoteSelected = (deviceId: string) => !!selected[deviceId]

  const onToggleRemote = (deviceId: string, on: boolean) => {
    setSelected((s) => ({ ...s, [deviceId]: on }))
  }

  const selectAllRemote = () => {
    const m: Record<string, boolean> = { ...selected }
    for (const d of devices) {
      m[d.deviceID] = true
    }
    setSelected(m)
  }

  const deselectAllRemote = () => {
    setSelected({})
  }

  const handleVersioningType = (t: string) => {
    setVerType(t)
    if (t === 'staggered') {
      setStaggerCleanup(3600)
      setStaggerFsPath('')
    }
  }

  const buildVersioning = (): FolderConfiguration['versioning'] => {
    if (!verType) {
      return { type: '', params: {} }
    }
    if (verType === 'simple') {
      return { type: 'simple', params: { keep: String(simpleKeep) } }
    }
    if (verType === 'trashcan') {
      return { type: 'trashcan', params: { cleanoutDays: String(trashDays) } }
    }
    if (verType === 'staggered') {
      return {
        type: 'staggered',
        params: { maxAge: String(Math.max(0, staggerDays) * 86400) },
        cleanupIntervalS: staggerCleanup,
        fsPath: staggerFsPath
      }
    }
    if (verType === 'external') {
      return { type: 'external', params: { command: externalCmd } }
    }
    return { type: verType, params: {} }
  }

  const save = async () => {
    if (!client) {
      return
    }
    const id = folderId.trim()
      if (!id || !path.trim()) {
        setErr('请填写文件夹 ID 与路径')
        return
      }
      setBusy(true)
      setErr(null)
      try {
      const devs: FolderConfiguration['devices'] = [{ deviceID: myId }]
      for (const d of devices) {
        if (selected[d.deviceID]) {
          const pw = devicePasswords[d.deviceID]?.trim()
          if (type === 'receiveencrypted' && pw) {
            devs.push({ deviceID: d.deviceID, encryptionPassword: pw })
          } else {
            devs.push({ deviceID: d.deviceID })
          }
        }
      }
      const folder: FolderConfiguration = {
        id,
        label: label.trim() || id,
        group: group.trim() || undefined,
        path: path.trim(),
        type,
        devices: devs,
        rescanIntervalS,
        fsWatcherEnabled,
        minDiskFree: minDiskFreeFormToApi(minDiskNum, minDiskUnit),
        order,
        ignorePerms,
        blockIndexing,
        syncOwnership: syncOwnership || undefined,
        sendOwnership: sendOwnership || undefined,
        syncXattrs: syncXattrs || undefined,
        sendXattrs: sendXattrs || undefined,
        versioning: buildVersioning()
      }
      await client.putFolder(folder)
      onSave()
      onClose()
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const titleId = folderId
  const pathHint = tildePath || '/home'
  const ignorePathPreview = path.trim().replace(/\/$/, '') || '文件夹'

  return (
    <div className="modal-backdrop modal-folder-edit-layer" role="presentation" onClick={onClose}>
      <div
        className="modal modal-folder-edit"
        role="dialog"
        aria-labelledby="add-folder-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 id="add-folder-title" className="modal-folder-edit-title">
          <span className="modal-title-glyph" aria-hidden>
            📁
          </span>
          添加文件夹 ({titleId})
        </h3>
        <FolderModalTabStrip tab={tab} onTab={setTab} />
        {err && <div className="error-banner">{err}</div>}

        {tab === 'general' && (
          <FolderModalGeneralFields
            label={label}
            group={group}
            folderId={folderId}
            path={path}
            onLabel={setLabel}
            onGroup={setGroup}
            onFolderId={setFolderId}
            onPath={setPath}
            idReadOnly={false}
            pathTildeHint={pathHint}
          />
        )}

        {tab === 'sharing' && (
          <div className="modal-tab-panel">
            <FolderModalSharingTable
              mode="add"
              devices={devices}
              folderType={type}
              isRemoteSelected={isRemoteSelected}
              onToggleRemote={onToggleRemote}
              devicePasswords={devicePasswords}
              setDevicePasswords={setDevicePasswords}
              pwVisible={pwVisible}
              setPwVisible={setPwVisible}
              onSelectAll={selectAllRemote}
              onDeselectAll={deselectAllRemote}
            />
          </div>
        )}

        {tab === 'versioning' && (
          <FolderModalVersioningFields
            vType={verType}
            onChangeType={handleVersioningType}
            simpleKeep={simpleKeep}
            onSimpleKeep={setSimpleKeep}
            trashDays={trashDays}
            onTrashDays={setTrashDays}
            staggerDays={staggerDays}
            onStaggerDays={setStaggerDays}
            staggerFsPath={staggerFsPath}
            onStaggerFsPath={setStaggerFsPath}
            cleanupIntervalS={staggerCleanup}
            onCleanupIntervalS={setStaggerCleanup}
            externalCmd={externalCmd}
            onExternalCmd={setExternalCmd}
          />
        )}

        {tab === 'ignores' && (
          <FolderModalIgnoresFields
            mode="add"
            ignorePathDisplay={ignorePathPreview}
            addIgnoreLater={addIgnoreLater}
            onAddIgnoreLater={setAddIgnoreLater}
          />
        )}

        {tab === 'advanced' && (
          <FolderModalAdvancedFields
            fsWatcherEnabled={fsWatcherEnabled}
            onFsWatcher={setFsWatcherEnabled}
            rescanIntervalS={rescanIntervalS}
            onRescan={setRescanIntervalS}
            folderType={type}
            onFolderType={setType}
            order={order}
            onOrder={setOrder}
            minDiskNum={minDiskNum}
            minDiskUnit={minDiskUnit}
            onMinDiskNum={setMinDiskNum}
            onMinDiskUnit={setMinDiskUnit}
            syncOwnership={syncOwnership}
            onSyncOwnership={setSyncOwnership}
            sendOwnership={sendOwnership}
            onSendOwnership={setSendOwnership}
            ignorePerms={ignorePerms}
            onIgnorePerms={setIgnorePerms}
            syncXattrs={syncXattrs}
            onSyncXattrs={setSyncXattrs}
            sendXattrs={sendXattrs}
            onSendXattrs={setSendXattrs}
            blockIndexing={blockIndexing}
            onBlockIndexing={setBlockIndexing}
          />
        )}

        <div className="modal-device-footer modal-footer-actions-end">
          <div className="modal-device-footer-right">
            <button type="button" className="primary" disabled={busy} onClick={() => void save()}>
              <span className="btn-glyph" aria-hidden>
                ✓
              </span>
              保存
            </button>
            <button type="button" disabled={busy} onClick={onClose}>
              <span className="btn-glyph" aria-hidden>
                ✕
              </span>
              关闭
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

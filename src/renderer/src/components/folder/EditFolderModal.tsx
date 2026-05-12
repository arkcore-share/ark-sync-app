import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useConnection } from '../../context/ConnectionContext'
import type { FolderConfiguration, VersioningConfiguration } from '../../api/types'
import { sameDeviceId } from '../../util/format'
import {
  cloneFolder,
  type FolderModalTabId,
  minDiskFreeFormToApi,
  normalizeFolderType,
  parseMinDiskFree,
  parseSimpleKeep,
  parseStaggeredMaxAgeDays,
  parseTrashDays,
  type MinDiskUnit
} from './folderModalConstants'
import FolderModalAdvancedFields from './FolderModalAdvancedFields'
import FolderModalGeneralFields from './FolderModalGeneralFields'
import FolderModalIgnoresFields from './FolderModalIgnoresFields'
import FolderModalSharingTable from './FolderModalSharingTable'
import FolderModalTabStrip from './FolderModalTabStrip'
import FolderModalVersioningFields from './FolderModalVersioningFields'

export default function EditFolderModal({
  folder,
  myId,
  devices,
  onClose,
  onSaved
}: {
  folder: FolderConfiguration
  myId: string
  devices: { deviceID: string; name: string }[]
  onClose: () => void
  onSaved: () => void
}): React.ReactElement {
  const { client } = useConnection()
  const [tab, setTab] = useState<FolderModalTabId>('general')
  const [draft, setDraft] = useState<FolderConfiguration>(() => cloneFolder(folder))
  const [ignoresText, setIgnoresText] = useState('')
  const [ignoresLoadErr, setIgnoresLoadErr] = useState<string | null>(null)
  const [tildePath, setTildePath] = useState('')
  const [minDiskNum, setMinDiskNum] = useState('1')
  const [minDiskUnit, setMinDiskUnit] = useState<MinDiskUnit>('%')
  const [devicePasswords, setDevicePasswords] = useState<Record<string, string>>(() => {
    const m: Record<string, string> = {}
    for (const d of folder.devices ?? []) {
      m[d.deviceID] = d.encryptionPassword ?? ''
    }
    return m
  })
  const [pwVisible, setPwVisible] = useState<Record<string, boolean>>({})
  const [staggerDays, setStaggerDays] = useState(() =>
    parseStaggeredMaxAgeDays(folder.versioning?.params)
  )
  const [simpleKeep, setSimpleKeep] = useState(() => parseSimpleKeep(folder.versioning?.params))
  const [trashDays, setTrashDays] = useState(() => parseTrashDays(folder.versioning?.params))
  const [externalCmd, setExternalCmd] = useState(() => folder.versioning?.params?.command ?? '')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const syncedFolderId = useRef<string>('')

  const applyFolderFields = useCallback((f: FolderConfiguration) => {
    const md = parseMinDiskFree(f.minDiskFree)
    setMinDiskNum(md.n)
    setMinDiskUnit(md.unit)
    const pw: Record<string, string> = {}
    for (const d of f.devices ?? []) {
      pw[d.deviceID] = d.encryptionPassword ?? ''
    }
    setDevicePasswords(pw)
    setStaggerDays(parseStaggeredMaxAgeDays(f.versioning?.params))
    setSimpleKeep(parseSimpleKeep(f.versioning?.params))
    setTrashDays(parseTrashDays(f.versioning?.params))
    setExternalCmd(f.versioning?.params?.command ?? '')
  }, [])

  useEffect(() => {
    setDraft(cloneFolder(folder))
    applyFolderFields(folder)
    if (syncedFolderId.current !== folder.id) {
      syncedFolderId.current = folder.id
      setTab('general')
      setIgnoresText('')
      setIgnoresLoadErr(null)
      setPwVisible({})
    }
  }, [folder, applyFolderFields])

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

  useEffect(() => {
    if (!client) {
      return
    }
    let cancelled = false
    void (async () => {
      setIgnoresLoadErr(null)
      try {
        const r = await client.getDbIgnores(folder.id)
        if (cancelled) {
          return
        }
        const ign = r.ignore
        const lines = Array.isArray(ign)
          ? ign.map((line) => String(line))
          : ign == null || ign === ''
            ? []
            : [String(ign)]
        setIgnoresText(lines.join('\n'))
        if (r.error) {
          setIgnoresLoadErr(r.error)
        }
      } catch (e) {
        if (!cancelled) {
          setIgnoresLoadErr(e instanceof Error ? e.message : String(e))
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [client, folder.id])

  const selectedIds = useMemo(
    () => new Set((draft.devices ?? []).map((d) => d.deviceID)),
    [draft.devices]
  )

  const toggleDevice = (deviceID: string, on: boolean) => {
    setDraft((d) => {
      const list = d.devices ?? []
      const has = list.some((x) => x.deviceID === deviceID)
      if (on && !has) {
        return { ...d, devices: [...list, { deviceID }] }
      }
      if (!on && has) {
        return { ...d, devices: list.filter((x) => x.deviceID !== deviceID) }
      }
      return d
    })
  }

  const handleVersioningType = (t: string) => {
    setDraft((d) => {
      if (!t) {
        return { ...d, versioning: { type: '', params: {} } }
      }
      if (t === 'staggered') {
        return {
          ...d,
          versioning: {
            type: 'staggered',
            params: { maxAge: String(staggerDays * 86400) },
            cleanupIntervalS: d.versioning?.cleanupIntervalS ?? 3600,
            fsPath: d.versioning?.fsPath ?? ''
          }
        }
      }
      return {
        ...d,
        versioning: {
          ...(d.versioning ?? { type: t, params: {} }),
          type: t,
          params: d.versioning?.type === t ? d.versioning?.params ?? {} : {}
        }
      }
    })
  }

  const buildVersioningForSave = (): VersioningConfiguration => {
    const v = draft.versioning
    const t = v?.type ?? ''
    if (!t) {
      return { type: '', params: {} }
    }
    if (t === 'simple') {
      return {
        type: 'simple',
        params: { keep: String(simpleKeep) },
        cleanupIntervalS: v?.cleanupIntervalS,
        fsPath: v?.fsPath,
        fsType: v?.fsType
      }
    }
    if (t === 'trashcan') {
      return {
        type: 'trashcan',
        params: { cleanoutDays: String(trashDays) },
        cleanupIntervalS: v?.cleanupIntervalS,
        fsPath: v?.fsPath,
        fsType: v?.fsType
      }
    }
    if (t === 'staggered') {
      return {
        type: 'staggered',
        params: { maxAge: String(Math.max(0, staggerDays) * 86400) },
        cleanupIntervalS: v?.cleanupIntervalS ?? 3600,
        fsPath: v?.fsPath ?? '',
        fsType: v?.fsType
      }
    }
    if (t === 'external') {
      return {
        type: 'external',
        params: { command: externalCmd },
        cleanupIntervalS: v?.cleanupIntervalS,
        fsPath: v?.fsPath,
        fsType: v?.fsType
      }
    }
    return { type: t, params: v?.params ?? {} }
  }

  const mergeDevicesWithPasswords = (): FolderConfiguration['devices'] => {
    return (draft.devices ?? []).map((d) => {
      const base: FolderConfiguration['devices'][0] = { deviceID: d.deviceID }
      if (d.introducedBy) {
        base.introducedBy = d.introducedBy
      }
      if (draft.type !== 'receiveencrypted') {
        return base
      }
      const pw = devicePasswords[d.deviceID]?.trim()
      if (pw) {
        base.encryptionPassword = pw
      }
      return base
    })
  }

  const save = async () => {
    if (!client) {
      return
    }
    if (!(draft.devices ?? []).some((x) => sameDeviceId(x.deviceID, myId))) {
      setErr('必须包含本机设备')
      return
    }
    setBusy(true)
    setErr(null)
    try {
      const ver = buildVersioningForSave()
      const toSave: FolderConfiguration = {
        ...draft,
        minDiskFree: minDiskFreeFormToApi(minDiskNum, minDiskUnit),
        devices: mergeDevicesWithPasswords(),
        versioning: ver.type ? ver : { type: '', params: {} }
      }
      await client.putFolder(toSave)
      await client.setDbIgnores(folder.id, ignoresText.split('\n'))
      onSaved()
      onClose()
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const removeFolder = async () => {
    if (!client || !confirm(`确定移除文件夹「${draft.label || draft.id}」？`)) {
      return
    }
    setBusy(true)
    setErr(null)
    try {
      await client.deleteFolder(folder.id)
      onSaved()
      onClose()
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const selectAllDevices = () => {
    setDraft((d) => {
      const ids = new Set<string>()
      for (const x of d.devices ?? []) {
        if (x.deviceID != null && String(x.deviceID).trim() !== '') {
          ids.add(String(x.deviceID))
        }
      }
      for (const dev of devices) {
        if (dev.deviceID != null && String(dev.deviceID).trim() !== '') {
          ids.add(String(dev.deviceID))
        }
      }
      if (myId.trim() !== '') {
        ids.add(myId.trim())
      }
      return { ...d, devices: [...ids].map((deviceID) => ({ deviceID })) }
    })
  }

  const deselectAllRemote = () => {
    setDraft((d) => ({
      ...d,
      devices: (d.devices ?? []).filter((x) => sameDeviceId(x.deviceID, myId))
    }))
  }

  const titleLabel = draft.label?.trim() || folder.id
  const vType = draft.versioning?.type ?? ''
  const pathTildeHint = tildePath || '/home'

  const setCleanupInterval = (n: number) => {
    setDraft((d) => ({
      ...d,
      versioning: {
        ...(d.versioning ?? { type: vType || 'staggered', params: {} }),
        cleanupIntervalS: n
      }
    }))
  }

  const setVersionFsPath = (fsPath: string) => {
    setDraft((d) => ({
      ...d,
      versioning: {
        ...(d.versioning ?? { type: vType || 'staggered', params: {} }),
        fsPath
      }
    }))
  }

  const copyId = useCallback(() => {
    void navigator.clipboard?.writeText(draft.id).catch(() => {})
  }, [draft.id])

  const ignorePathDisplay = String(draft.path ?? '').replace(/\/$/, '') || '文件夹'

  return (
    <div className="modal-backdrop modal-folder-edit-layer" role="presentation" onClick={onClose}>
      <div
        className="modal modal-folder-edit"
        role="dialog"
        aria-labelledby="edit-folder-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 id="edit-folder-title" className="modal-folder-edit-title">
          <span className="modal-title-glyph" aria-hidden>
            ✎
          </span>
          编辑文件夹 ({titleLabel})
        </h3>
        <FolderModalTabStrip tab={tab} onTab={setTab} />
        {err && <div className="error-banner">{err}</div>}

        {tab === 'general' && (
          <FolderModalGeneralFields
            label={draft.label ?? ''}
            group={draft.group ?? ''}
            folderId={draft.id ?? ''}
            path={draft.path ?? ''}
            onLabel={(v) => setDraft((d) => ({ ...d, label: v }))}
            onGroup={(v) => setDraft((d) => ({ ...d, group: v }))}
            onFolderId={() => {}}
            onPath={(v) => setDraft((d) => ({ ...d, path: v }))}
            idReadOnly
            pathTildeHint={pathTildeHint}
            onCopyId={() => copyId()}
          />
        )}

        {tab === 'sharing' && (
          <div className="modal-tab-panel">
            <FolderModalSharingTable
              mode="edit"
              devices={devices}
              folderType={normalizeFolderType(draft.type)}
              isRemoteSelected={(id) => selectedIds.has(id)}
              onToggleRemote={toggleDevice}
              devicePasswords={devicePasswords}
              setDevicePasswords={setDevicePasswords}
              pwVisible={pwVisible}
              setPwVisible={setPwVisible}
              onSelectAll={selectAllDevices}
              onDeselectAll={deselectAllRemote}
            />
          </div>
        )}

        {tab === 'versioning' && (
          <FolderModalVersioningFields
            vType={vType}
            onChangeType={handleVersioningType}
            simpleKeep={simpleKeep}
            onSimpleKeep={setSimpleKeep}
            trashDays={trashDays}
            onTrashDays={setTrashDays}
            staggerDays={staggerDays}
            onStaggerDays={setStaggerDays}
            staggerFsPath={draft.versioning?.fsPath ?? ''}
            onStaggerFsPath={setVersionFsPath}
            cleanupIntervalS={draft.versioning?.cleanupIntervalS ?? 3600}
            onCleanupIntervalS={setCleanupInterval}
            externalCmd={externalCmd}
            onExternalCmd={setExternalCmd}
          />
        )}

        {tab === 'ignores' && (
          <FolderModalIgnoresFields
            mode="edit"
            ignoresText={ignoresText}
            onIgnoresText={setIgnoresText}
            ignoresLoadErr={ignoresLoadErr}
            ignorePathDisplay={ignorePathDisplay}
          />
        )}

        {tab === 'advanced' && (
          <FolderModalAdvancedFields
            fsWatcherEnabled={draft.fsWatcherEnabled !== false}
            onFsWatcher={(v) => setDraft((d) => ({ ...d, fsWatcherEnabled: v }))}
            rescanIntervalS={draft.rescanIntervalS ?? 3600}
            onRescan={(n) => setDraft((d) => ({ ...d, rescanIntervalS: n }))}
            folderType={normalizeFolderType(draft.type)}
            onFolderType={(t) => setDraft((d) => ({ ...d, type: t }))}
            order={draft.order ?? 'random'}
            onOrder={(s) => setDraft((d) => ({ ...d, order: s }))}
            minDiskNum={minDiskNum}
            minDiskUnit={minDiskUnit}
            onMinDiskNum={setMinDiskNum}
            onMinDiskUnit={setMinDiskUnit}
            syncOwnership={!!draft.syncOwnership}
            onSyncOwnership={(v) => setDraft((d) => ({ ...d, syncOwnership: v }))}
            sendOwnership={!!draft.sendOwnership}
            onSendOwnership={(v) => setDraft((d) => ({ ...d, sendOwnership: v }))}
            ignorePerms={!!draft.ignorePerms}
            onIgnorePerms={(v) => setDraft((d) => ({ ...d, ignorePerms: v }))}
            syncXattrs={!!draft.syncXattrs}
            onSyncXattrs={(v) => setDraft((d) => ({ ...d, syncXattrs: v }))}
            sendXattrs={!!draft.sendXattrs}
            onSendXattrs={(v) => setDraft((d) => ({ ...d, sendXattrs: v }))}
            blockIndexing={draft.blockIndexing !== false}
            onBlockIndexing={(v) => setDraft((d) => ({ ...d, blockIndexing: v }))}
          />
        )}

        <div className="modal-device-footer">
          <button type="button" className="warning-btn" disabled={busy} onClick={() => void removeFolder()}>
            <span className="btn-glyph" aria-hidden>
              ⊖
            </span>
            移除
          </button>
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

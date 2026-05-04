import React, { useCallback, useEffect, useRef, useState } from 'react'
import { useConnection } from '../../context/ConnectionContext'
import type { DeviceConfiguration, FolderConfiguration } from '../../api/types'
import { sameDeviceId, shortDeviceId } from '../../util/format'
import DeviceModalAdvancedFields from './DeviceModalAdvancedFields'
import DeviceModalGeneralFields from './DeviceModalGeneralFields'
import DeviceModalSharingPanel from './DeviceModalSharingPanel'
import DeviceModalTabStrip from './DeviceModalTabStrip'
import { folderHasDevice, type DeviceModalTabId } from './deviceModalConstants'

function mergeDeviceFromApi(d: DeviceConfiguration): DeviceConfiguration {
  const raw = d as unknown as Record<string, unknown>
  return {
    ...d,
    numConnections: typeof raw.numConnections === 'number' ? raw.numConnections : d.numConnections ?? 0,
    maxSendKbps: typeof raw.maxSendKbps === 'number' ? raw.maxSendKbps : d.maxSendKbps ?? 0,
    maxRecvKbps: typeof raw.maxRecvKbps === 'number' ? raw.maxRecvKbps : d.maxRecvKbps ?? 0,
    group: typeof raw.group === 'string' ? raw.group : d.group ?? '',
    introducer: Boolean(raw.introducer ?? d.introducer),
    skipIntroductionRemovals: Boolean(raw.skipIntroductionRemovals ?? d.skipIntroductionRemovals),
    untrusted: Boolean(raw.untrusted ?? d.untrusted),
    autoAcceptFolders: Boolean(raw.autoAcceptFolders ?? d.autoAcceptFolders)
  }
}

export default function EditDeviceModal({
  device,
  folders,
  onClose,
  onSave,
  onShowQr
}: {
  device: DeviceConfiguration
  folders: FolderConfiguration[]
  onClose: () => void
  onSave: () => void
  onShowQr: (deviceId: string) => void
}): React.ReactElement {
  const { client } = useConnection()
  const [tab, setTab] = useState<DeviceModalTabId>('general')
  const [name, setName] = useState(device.name)
  const [group, setGroup] = useState(device.group ?? '')
  const [addressesText, setAddressesText] = useState((device.addresses || []).join('\n'))
  const [compression, setCompression] = useState(device.compression || 'metadata')
  const [introducer, setIntroducer] = useState(!!device.introducer)
  const [autoAccept, setAutoAccept] = useState(!!device.autoAcceptFolders)
  const [untrusted, setUntrusted] = useState(!!device.untrusted)
  const [numConnections, setNumConnections] = useState(device.numConnections ?? 0)
  const [maxSendKbps, setMaxSendKbps] = useState(device.maxSendKbps ?? 0)
  const [maxRecvKbps, setMaxRecvKbps] = useState(device.maxRecvKbps ?? 0)
  const [folderShare, setFolderShare] = useState<Record<string, boolean>>({})
  const [folderSharePasswords, setFolderSharePasswords] = useState<Record<string, string>>({})
  const [folderPwVisible, setFolderPwVisible] = useState<Record<string, boolean>>({})
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const syncedForDeviceId = useRef<string>('')

  useEffect(() => {
    const d = mergeDeviceFromApi(device)
    const id = d.deviceID
    setName(d.name)
    setGroup(d.group ?? '')
    setAddressesText((d.addresses || []).join('\n'))
    setCompression(d.compression || 'metadata')
    setIntroducer(!!d.introducer)
    setAutoAccept(!!d.autoAcceptFolders)
    setUntrusted(!!d.untrusted)
    setNumConnections(d.numConnections ?? 0)
    setMaxSendKbps(d.maxSendKbps ?? 0)
    setMaxRecvKbps(d.maxRecvKbps ?? 0)
    const m: Record<string, boolean> = {}
    const pws: Record<string, string> = {}
    for (const f of folders) {
      m[f.id] = folderHasDevice(f, id)
      const ent = (f.devices || []).find((x) => sameDeviceId(x.deviceID, id))
      if (ent?.encryptionPassword) {
        pws[f.id] = ent.encryptionPassword
      }
    }
    setFolderShare(m)
    setFolderSharePasswords(pws)
    if (syncedForDeviceId.current !== id) {
      syncedForDeviceId.current = id
      setTab('general')
      setFolderPwVisible({})
    }
    setErr(null)
  }, [device, folders])

  const copyId = useCallback(() => {
    void navigator.clipboard?.writeText(device.deviceID).catch(() => {})
  }, [device.deviceID])

  const save = async () => {
    if (!client) {
      return
    }
    setBusy(true)
    setErr(null)
    try {
      const addresses = addressesText
        .split(/[\n,]+/)
        .map((l) => l.trim())
        .filter(Boolean)
      let nextIntroducer = introducer
      let nextAuto = autoAccept
      if (untrusted) {
        nextIntroducer = false
        nextAuto = false
      }

      const latest = await client.getConfigDevice(device.deviceID).catch(() => mergeDeviceFromApi(device))
      const merged = mergeDeviceFromApi(latest)
      const payload: DeviceConfiguration = {
        ...merged,
        name: name.trim() || shortDeviceId(device.deviceID),
        group: group.trim(),
        addresses: addresses.length ? addresses : ['dynamic'],
        compression,
        introducer: nextIntroducer,
        autoAcceptFolders: nextAuto,
        untrusted,
        numConnections,
        maxSendKbps,
        maxRecvKbps
      }
      await client.putDevice(payload)

      for (const f of folders) {
        const want = !!folderShare[f.id]
        const had = folderHasDevice(f, device.deviceID)
        let nextDevices = [...(f.devices || [])]
        let changed = false

        const folderPw = (folderSharePasswords[f.id] ?? '').trim()

        if (want && !had) {
          nextDevices.push(
            folderPw && f.type === 'receiveencrypted'
              ? { deviceID: device.deviceID, encryptionPassword: folderPw }
              : { deviceID: device.deviceID }
          )
          changed = true
        } else if (!want && had) {
          nextDevices = nextDevices.filter((d) => !sameDeviceId(d.deviceID, device.deviceID))
          changed = true
        }

        if (want && folderPw && f.type === 'receiveencrypted') {
          const idx = nextDevices.findIndex((d) => sameDeviceId(d.deviceID, device.deviceID))
          if (idx >= 0) {
            const prev = nextDevices[idx]
            const next = { ...prev, encryptionPassword: folderPw }
            if (prev.encryptionPassword !== next.encryptionPassword) {
              nextDevices[idx] = next
              changed = true
            }
          }
        }

        if (changed) {
          await client.putFolder({ ...f, devices: nextDevices })
        }
      }

      onSave()
      onClose()
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const removeDevice = async () => {
    if (!client || !confirm(`确定从本机移除设备「${name.trim() || shortDeviceId(device.deviceID)}」？`)) {
      return
    }
    setBusy(true)
    setErr(null)
    try {
      await client.deleteDevice(device.deviceID)
      onSave()
      onClose()
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const selectAllFolders = () => {
    const m: Record<string, boolean> = { ...folderShare }
    for (const f of folders) {
      m[f.id] = true
    }
    setFolderShare(m)
  }

  const deselectAllFolders = () => {
    const m: Record<string, boolean> = { ...folderShare }
    for (const f of folders) {
      m[f.id] = false
    }
    setFolderShare(m)
    setFolderSharePasswords({})
    setFolderPwVisible({})
  }

  return (
    <div className="modal-backdrop modal-edit-device-layer" role="presentation" onClick={onClose}>
      <div className="modal modal-device-edit" role="dialog" onClick={(e) => e.stopPropagation()}>
        <h3 className="modal-device-edit-title">
          <span className="modal-title-glyph" aria-hidden>
            ✎
          </span>
          编辑设备 ({name.trim() || shortDeviceId(device.deviceID)})
        </h3>
        <DeviceModalTabStrip tab={tab} onTab={setTab} />
        {err && <div className="error-banner">{err}</div>}

        {tab === 'general' && (
          <DeviceModalGeneralFields
            mode="edit"
            deviceIdText={device.deviceID}
            onCopyId={copyId}
            onShowQr={() => onShowQr(device.deviceID)}
            name={name}
            group={group}
            onName={setName}
            onGroup={setGroup}
            idHelp=""
            nameHelp="在集群状态中显示该名称，而不是设备 ID。如果留空，将更新为设备通告的名称。"
            groupHelp="设备的可选分组。各设备可设置不同分组。"
          />
        )}

        {tab === 'sharing' && (
          <DeviceModalSharingPanel
            mode="edit"
            introducer={introducer}
            onIntroducer={setIntroducer}
            autoAccept={autoAccept}
            onAutoAccept={setAutoAccept}
            untrusted={untrusted}
            folders={folders}
            folderShare={folderShare}
            setFolderShare={setFolderShare}
            folderSharePasswords={folderSharePasswords}
            setFolderSharePasswords={setFolderSharePasswords}
            folderPwVisible={folderPwVisible}
            setFolderPwVisible={setFolderPwVisible}
            onSelectAllFolders={selectAllFolders}
            onDeselectAllFolders={deselectAllFolders}
          />
        )}

        {tab === 'advanced' && (
          <DeviceModalAdvancedFields
            idPrefix="edit-device"
            addressesText={addressesText}
            onAddressesText={setAddressesText}
            compression={compression}
            onCompression={setCompression}
            numConnections={numConnections}
            onNumConnections={setNumConnections}
            untrusted={untrusted}
            onUntrusted={setUntrusted}
            maxRecvKbps={maxRecvKbps}
            onMaxRecvKbps={setMaxRecvKbps}
            maxSendKbps={maxSendKbps}
            onMaxSendKbps={setMaxSendKbps}
          />
        )}

        <div className="modal-device-footer">
          <button type="button" className="warning-btn" disabled={busy} onClick={() => void removeDevice()}>
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

import React, { useCallback, useState } from 'react'
import { useConnection } from '../../context/ConnectionContext'
import type { DeviceConfiguration, FolderConfiguration } from '../../api/types'
import { sameDeviceId } from '../../util/format'
import DeviceModalAdvancedFields from './DeviceModalAdvancedFields'
import DeviceModalGeneralFields from './DeviceModalGeneralFields'
import DeviceModalSharingPanel from './DeviceModalSharingPanel'
import DeviceModalTabStrip from './DeviceModalTabStrip'
import { folderHasDevice, type DeviceModalTabId } from './deviceModalConstants'

export default function AddDeviceModal({
  folders,
  onClose,
  onSave,
  onShowMyQr
}: {
  folders: FolderConfiguration[]
  onClose: () => void
  onSave: () => void
  onShowMyQr: () => void
}): React.ReactElement {
  const { client } = useConnection()
  const [tab, setTab] = useState<DeviceModalTabId>('general')
  const [deviceID, setDeviceID] = useState('')
  const [name, setName] = useState('')
  const [group, setGroup] = useState('')
  const [addressesText, setAddressesText] = useState('dynamic')
  const [introducer, setIntroducer] = useState(false)
  const [autoAccept, setAutoAccept] = useState(false)
  const [folderShare, setFolderShare] = useState<Record<string, boolean>>({})
  const [folderSharePasswords, setFolderSharePasswords] = useState<Record<string, string>>({})
  const [folderPwVisible, setFolderPwVisible] = useState<Record<string, boolean>>({})
  const [compression, setCompression] = useState('metadata')
  const [numConnections, setNumConnections] = useState(0)
  const [maxSendKbps, setMaxSendKbps] = useState(0)
  const [maxRecvKbps, setMaxRecvKbps] = useState(0)
  const [untrusted, setUntrusted] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const copyId = useCallback(() => {
    const id = deviceID.trim()
    if (id) {
      void navigator.clipboard?.writeText(id).catch(() => {})
    }
  }, [deviceID])

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

  const save = async () => {
    if (!client) {
      return
    }
    const id = deviceID.trim().replace(/\s+/g, '')
    if (id.replace(/-/g, '').length < 50) {
      setErr('请输入完整设备 ID（含连字符）')
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
      const dev: DeviceConfiguration = {
        deviceID: id,
        name: name.trim() || id.slice(0, 7),
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
      await client.putDevice(dev)

      for (const f of folders) {
        const want = !!folderShare[f.id]
        const had = folderHasDevice(f, id)
        let nextDevices = [...(f.devices || [])]
        let changed = false
        const folderPw = (folderSharePasswords[f.id] ?? '').trim()

        if (want && !had) {
          nextDevices.push(
            folderPw && f.type === 'receiveencrypted'
              ? { deviceID: id, encryptionPassword: folderPw }
              : { deviceID: id }
          )
          changed = true
        } else if (!want && had) {
          nextDevices = nextDevices.filter((d) => !sameDeviceId(d.deviceID, id))
          changed = true
        } else if (want && had && folderPw && f.type === 'receiveencrypted') {
          const idx = nextDevices.findIndex((d) => sameDeviceId(d.deviceID, id))
          if (idx >= 0 && nextDevices[idx].encryptionPassword !== folderPw) {
            nextDevices[idx] = { ...nextDevices[idx], encryptionPassword: folderPw }
            changed = true
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

  const titlePreview = deviceID.trim().replace(/\s+/g, '').slice(0, 14) || '…'

  return (
    <div className="modal-backdrop modal-edit-device-layer" role="presentation" onClick={onClose}>
      <div className="modal modal-device-edit" role="dialog" onClick={(e) => e.stopPropagation()}>
        <h3 className="modal-device-edit-title">
          <span className="modal-title-glyph" aria-hidden>
            ＋
          </span>
          添加远程设备 ({titlePreview})
        </h3>
        <DeviceModalTabStrip tab={tab} onTab={setTab} />
        {err && <div className="error-banner">{err}</div>}

        {tab === 'general' && (
          <DeviceModalGeneralFields
            mode="add"
            deviceIdText={deviceID}
            onDeviceIdChange={setDeviceID}
            onCopyId={copyId}
            onShowQr={onShowMyQr}
            name={name}
            group={group}
            onName={setName}
            onGroup={setGroup}
            idHelp="在此处输入的设备 ID 可以在另一台设备的「操作 > 显示 ID」对话框中找到。空格和破折号是可选的（忽略）。若您在本机添加新设备，记住您也必须在这个新设备上添加本机。"
            nameHelp="在集群状态中显示该名称，而不是设备 ID。将作为可选的默认名称向其他设备通告。"
            groupHelp="设备的可选分组。各设备可设置不同分组。"
          />
        )}

        {tab === 'sharing' && (
          <DeviceModalSharingPanel
            mode="add"
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
            idPrefix="add-device"
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

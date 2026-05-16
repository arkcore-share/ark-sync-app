import React, { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useConnection } from '../context/ConnectionContext'
import { usePoll } from '../hooks/usePoll'
import type {
  DeviceConfiguration,
  FolderConfiguration,
  ObservedFolder,
  PendingClusterDeviceEntry,
  PendingClusterFolderOffer,
  PendingClusterFolderEntry,
  SystemConfig
} from '../api/types'
import { resolveDeviceNameFromConfig, sameDeviceId, shortDeviceId } from '../util/format'
import { formatDateTimeYmdHms } from '../util/syncthingUi'

const AUTO_ACCEPT_SEC = 5

function folderTimerKey(folderId: string, deviceId: string): string {
  return `${folderId}\x1f${deviceId}`
}

/** 待处理文件夹自动接受时的占位路径：非 Windows 为 ~/.sync_tmp，Windows 为 ~\\.sync_tmp */
function defaultAutoAcceptFolderPath(): string {
  if (typeof navigator !== 'undefined' && /Win/i.test(navigator.userAgent)) {
    return '~\\.sync_tmp'
  }
  return '~/.sync_tmp'
}

function flattenPendingFolders(
  raw: Record<string, PendingClusterFolderEntry>
): { folderId: string; deviceId: string; offer: PendingClusterFolderOffer }[] {
  const out: { folderId: string; deviceId: string; offer: PendingClusterFolderOffer }[] = []
  for (const [folderId, entry] of Object.entries(raw)) {
    const ob = entry?.offeredBy
    if (!ob || typeof ob !== 'object') {
      continue
    }
    for (const [deviceId, offer] of Object.entries(ob)) {
      out.push({ folderId, deviceId, offer })
    }
  }
  return out
}

function pendingDevicesSignature(raw: Record<string, PendingClusterDeviceEntry>): string {
  return Object.entries(raw)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([id, p]) => `${id}|${p.time ?? ''}|${p.name ?? ''}|${p.address ?? ''}`)
    .join('\n')
}

function pendingFoldersSignature(raw: Record<string, PendingClusterFolderEntry>): string {
  return flattenPendingFolders(raw)
    .sort((a, b) => {
      if (a.folderId !== b.folderId) {
        return a.folderId.localeCompare(b.folderId)
      }
      return a.deviceId.localeCompare(b.deviceId)
    })
    .map(({ folderId, deviceId, offer }) => {
      return `${folderId}|${deviceId}|${offer.time ?? ''}|${offer.label ?? ''}|${offer.receiveEncrypted ? 1 : 0}`
    })
    .join('\n')
}

function configSignature(cfg: SystemConfig): string {
  const folderPart = cfg.folders
    .map((f) => `${f.id}|${f.label ?? ''}|${f.devices.map((d) => d.deviceID).sort().join(',')}`)
    .sort()
    .join('\n')
  const devicePart = cfg.devices
    .map((d) => `${d.deviceID}|${d.name ?? ''}`)
    .sort()
    .join('\n')
  return `${folderPart}\n---\n${devicePart}`
}

export default function PendingClusterNotifications(): React.ReactElement | null {
  const { client } = useConnection()
  const navigate = useNavigate()
  const [pendingDevices, setPendingDevices] = useState<Record<string, PendingClusterDeviceEntry>>({})
  const [pendingFolders, setPendingFolders] = useState<Record<string, PendingClusterFolderEntry>>({})
  const [config, setConfig] = useState<SystemConfig | null>(null)
  const [busyKey, setBusyKey] = useState<string | null>(null)
  const [noticeErr, setNoticeErr] = useState<string | null>(null)

  const pendingDevicesRef = useRef(pendingDevices)
  pendingDevicesRef.current = pendingDevices

  const pendingFoldersRef = useRef(pendingFolders)
  pendingFoldersRef.current = pendingFolders

  const deviceIntervalsRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({})
  const folderIntervalsRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({})
  const pendingDevicesSigRef = useRef<string>('')
  const pendingFoldersSigRef = useRef<string>('')
  const configSigRef = useRef<string>('')

  const loadCluster = useCallback(async () => {
    if (!client) {
      return
    }
    try {
      const [pd, pf, cfg] = await Promise.all([
        client.pendingDevices(),
        client.pendingFolders(),
        client.getConfig()
      ])
      const pdSig = pendingDevicesSignature(pd)
      if (pendingDevicesSigRef.current !== pdSig) {
        pendingDevicesSigRef.current = pdSig
        setPendingDevices(pd)
      }
      const pfSig = pendingFoldersSignature(pf)
      if (pendingFoldersSigRef.current !== pfSig) {
        pendingFoldersSigRef.current = pfSig
        setPendingFolders(pf)
      }
      const cfgSig = configSignature(cfg)
      if (configSigRef.current !== cfgSig) {
        configSigRef.current = cfgSig
        setConfig(cfg)
      }
      setNoticeErr(null)
    } catch (e) {
      setNoticeErr(e instanceof Error ? e.message : String(e))
    }
  }, [client])

  usePoll(loadCluster, 10000, !!client)

  useEffect(() => {
    void loadCluster()
  }, [loadCluster])

  useEffect(() => {
    if (client) {
      return
    }
    pendingDevicesSigRef.current = ''
    pendingFoldersSigRef.current = ''
    configSigRef.current = ''
    setPendingDevices({})
    setPendingFolders({})
    setConfig(null)
  }, [client])

  const cancelDeviceTimer = useCallback((deviceId: string) => {
    const t = deviceIntervalsRef.current[deviceId]
    if (t !== undefined) {
      window.clearTimeout(t)
      delete deviceIntervalsRef.current[deviceId]
    }
  }, [])

  const cancelFolderTimer = useCallback((folderId: string, deviceId: string) => {
    const key = folderTimerKey(folderId, deviceId)
    const t = folderIntervalsRef.current[key]
    if (t !== undefined) {
      window.clearTimeout(t)
      delete folderIntervalsRef.current[key]
    }
  }, [])

  const acceptPendingDevice = useCallback(
    async (deviceId: string) => {
      if (!client) {
        return
      }
      const pending = pendingDevicesRef.current[deviceId]
      if (!pending) {
        return
      }
      cancelDeviceTimer(deviceId)
      setBusyKey(`dev:${deviceId}`)
      setNoticeErr(null)
      try {
        const defaults = await client.getDeviceDefaults()
        const name =
          pending.name?.trim() || deviceId.split('-')[0] || deviceId.slice(0, 7)
        const addresses =
          defaults.addresses && defaults.addresses.length > 0 ? defaults.addresses : ['dynamic']
        const dev: DeviceConfiguration = {
          ...defaults,
          deviceID: deviceId,
          name,
          addresses
        }
        await client.putDevice(dev)
        await loadCluster()
      } catch (e) {
        setNoticeErr(e instanceof Error ? e.message : String(e))
      } finally {
        setBusyKey(null)
      }
    },
    [cancelDeviceTimer, client, loadCluster]
  )

  const autoAcceptPendingFolder = useCallback(
    async (folderId: string, deviceId: string) => {
      if (!client) {
        return
      }
      const offer = pendingFoldersRef.current[folderId]?.offeredBy?.[deviceId]
      if (!offer) {
        return
      }
      cancelFolderTimer(folderId, deviceId)
      setBusyKey(`auto-f:${folderId}:${deviceId}`)
      setNoticeErr(null)
      try {
        const cfg = await client.getConfig()
        const existing = cfg.folders.find((f) => f.id === folderId)
        if (existing) {
          if (!existing.devices.some((d) => sameDeviceId(d.deviceID, deviceId))) {
            await client.putFolder({
              ...existing,
              devices: [...existing.devices, { deviceID: deviceId }]
            })
          }
          await loadCluster()
          return
        }

        const status = await client.systemStatus()
        const myID = status.myID.trim()
        const defaults = await client.getFolderDefaults()
        const receiveEnc = !!offer.receiveEncrypted
        const folderType: FolderConfiguration['type'] = receiveEnc
          ? 'receiveencrypted'
          : defaults.type === 'receiveencrypted'
            ? 'sendreceive'
            : defaults.type || 'sendreceive'

        const folder: FolderConfiguration = {
          ...defaults,
          id: folderId,
          label: offer.label?.trim() || folderId,
          path: defaultAutoAcceptFolderPath(),
          type: folderType,
          devices: [{ deviceID: myID }, { deviceID: deviceId }]
        }
        if (!folder.versioning || typeof folder.versioning !== 'object') {
          folder.versioning = { type: '', params: {} }
        }

        await client.putFolder(folder)
        await loadCluster()
      } catch (e) {
        setNoticeErr(e instanceof Error ? e.message : String(e))
      } finally {
        setBusyKey(null)
      }
    },
    [cancelFolderTimer, client, loadCluster]
  )

  useEffect(() => {
    if (!client) {
      return undefined
    }

    for (const id of Object.keys(deviceIntervalsRef.current)) {
      if (!pendingDevices[id]) {
        cancelDeviceTimer(id)
      }
    }

    for (const deviceId of Object.keys(pendingDevices)) {
      if (deviceIntervalsRef.current[deviceId]) {
        continue
      }
      deviceIntervalsRef.current[deviceId] = window.setTimeout(() => {
        delete deviceIntervalsRef.current[deviceId]
        void acceptPendingDevice(deviceId)
      }, AUTO_ACCEPT_SEC * 1000)
    }

    return undefined
  }, [pendingDevices, client, cancelDeviceTimer, acceptPendingDevice])

  useEffect(() => {
    if (!client || !config) {
      return undefined
    }

    const rows = flattenPendingFolders(pendingFolders)

    for (const key of Object.keys(folderIntervalsRef.current)) {
      const sep = key.indexOf('\x1f')
      if (sep < 0) {
        continue
      }
      const folderId = key.slice(0, sep)
      const deviceId = key.slice(sep + 1)
      const still = pendingFolders[folderId]?.offeredBy?.[deviceId]
      const folderExists = config.folders.some((f) => f.id === folderId)
      if (!still || folderExists) {
        cancelFolderTimer(folderId, deviceId)
      }
    }

    for (const { folderId, deviceId } of rows) {
      const folderExists = config.folders.some((f) => f.id === folderId)
      if (folderExists) {
        continue
      }
      const key = folderTimerKey(folderId, deviceId)
      if (folderIntervalsRef.current[key]) {
        continue
      }
      folderIntervalsRef.current[key] = window.setTimeout(() => {
        delete folderIntervalsRef.current[key]
        void autoAcceptPendingFolder(folderId, deviceId)
      }, AUTO_ACCEPT_SEC * 1000)
    }

    return undefined
  }, [pendingFolders, config, client, cancelFolderTimer, autoAcceptPendingFolder])

  useEffect(() => {
    return () => {
      for (const id of Object.keys(deviceIntervalsRef.current)) {
        window.clearTimeout(deviceIntervalsRef.current[id])
      }
      deviceIntervalsRef.current = {}
      for (const k of Object.keys(folderIntervalsRef.current)) {
        window.clearTimeout(folderIntervalsRef.current[k])
      }
      folderIntervalsRef.current = {}
    }
  }, [])

  const dismissDevice = async (deviceId: string) => {
    if (!client) {
      return
    }
    cancelDeviceTimer(deviceId)
    setBusyKey(`dismiss-dev:${deviceId}`)
    try {
      await client.dismissPendingDevice(deviceId)
      await loadCluster()
    } catch (e) {
      setNoticeErr(e instanceof Error ? e.message : String(e))
    } finally {
      setBusyKey(null)
    }
  }

  const ignoreDevice = async (deviceId: string) => {
    if (!client) {
      return
    }
    const pending = pendingDevicesRef.current[deviceId]
    if (!pending) {
      return
    }
    cancelDeviceTimer(deviceId)
    setBusyKey(`ignore-dev:${deviceId}`)
    try {
      const cfg = await client.getConfig()
      const entry = {
        deviceID: deviceId,
        name: pending.name,
        address: pending.address,
        time: new Date().toISOString()
      }
      await client.setConfig({
        ...cfg,
        remoteIgnoredDevices: [...(cfg.remoteIgnoredDevices ?? []), entry]
      })
      await loadCluster()
    } catch (e) {
      setNoticeErr(e instanceof Error ? e.message : String(e))
    } finally {
      setBusyKey(null)
    }
  }

  const dismissFolderRow = async (folderId: string, deviceId: string) => {
    if (!client) {
      return
    }
    cancelFolderTimer(folderId, deviceId)
    setBusyKey(`dismiss-f:${folderId}:${deviceId}`)
    try {
      await client.dismissPendingFolder(folderId, deviceId)
      await loadCluster()
    } catch (e) {
      setNoticeErr(e instanceof Error ? e.message : String(e))
    } finally {
      setBusyKey(null)
    }
  }

  const ignoreFolderRow = async (
    folderId: string,
    deviceId: string,
    offer: PendingClusterFolderOffer
  ) => {
    if (!client) {
      return
    }
    cancelFolderTimer(folderId, deviceId)
    setBusyKey(`ignore-f:${folderId}:${deviceId}`)
    try {
      const cfg = await client.getConfig()
      const deviceCfg = cfg.devices.find((d) => sameDeviceId(d.deviceID, deviceId))
      if (!deviceCfg) {
        setNoticeErr('请先在「新设备」通知中添加该远程设备后，再忽略文件夹提议。')
        return
      }
      const ignored: ObservedFolder = {
        id: folderId,
        label: offer.label,
        time: new Date().toISOString()
      }
      const devices = cfg.devices.map((d) => {
        if (!sameDeviceId(d.deviceID, deviceId)) {
          return d
        }
        return {
          ...d,
          ignoredFolders: [...(d.ignoredFolders ?? []), ignored]
        }
      })
      await client.setConfig({ ...cfg, devices })
      await loadCluster()
    } catch (e) {
      setNoticeErr(e instanceof Error ? e.message : String(e))
    } finally {
      setBusyKey(null)
    }
  }

  const shareFolderWithDevice = async (folderId: string, deviceId: string) => {
    if (!client) {
      return
    }
    cancelFolderTimer(folderId, deviceId)
    setBusyKey(`share-f:${folderId}:${deviceId}`)
    try {
      const cfg = await client.getConfig()
      const folder = cfg.folders.find((f) => f.id === folderId)
      if (!folder) {
        return
      }
      if (folder.devices.some((d) => sameDeviceId(d.deviceID, deviceId))) {
        await client.dismissPendingFolder(folderId, deviceId)
        await loadCluster()
        return
      }
      await client.putFolder({
        ...folder,
        devices: [...folder.devices, { deviceID: deviceId }]
      })
      await loadCluster()
    } catch (e) {
      setNoticeErr(e instanceof Error ? e.message : String(e))
    } finally {
      setBusyKey(null)
    }
  }

  const folderRows = flattenPendingFolders(pendingFolders)
  const hasDevices = Object.keys(pendingDevices).length > 0
  const hasFolders = folderRows.length > 0

  if (!client) {
    return null
  }

  if (!hasDevices && !hasFolders && !noticeErr) {
    return null
  }

  return (
    <div className="pending-cluster-stack">
      {noticeErr && (
        <div className="error-banner" role="alert">
          {noticeErr}
        </div>
      )}

      {Object.entries(pendingDevices).map(([deviceId, pending]) => {
        const cd = AUTO_ACCEPT_SEC
        const title = pending.name?.trim() || deviceId.split('-')[0] || shortDeviceId(deviceId)
        const busy = busyKey?.startsWith(`dev:${deviceId}`) || busyKey?.startsWith(`dismiss-dev:${deviceId}`) || busyKey?.startsWith(`ignore-dev:${deviceId}`)
        return (
          <div key={`pd-${deviceId}`} className="pending-cluster-card">
            <div className="pending-cluster-head">
              <span>新设备</span>
              <span className="pending-cluster-time">{formatDateTimeYmdHms(pending.time)}</span>
            </div>
            <div className="pending-cluster-body">
              <p className="pending-cluster-msg">
                设备「{title}」（{pending.address?.trim() || '—'} 处的 {deviceId}）想要连接。添加新设备？
              </p>
              {cd !== undefined && cd > 0 ? (
                <p className="pending-cluster-countdown">
                  <span aria-hidden>⏳</span> 将在 {cd} 秒后自动接受并保存…
                </p>
              ) : null}
            </div>
            <div className="pending-cluster-actions">
              <button
                type="button"
                className="primary"
                disabled={!!busy}
                onClick={() => void acceptPendingDevice(deviceId)}
              >
                <span className="btn-glyph" aria-hidden>
                  +
                </span>
                添加设备
              </button>
              <button type="button" className="danger" disabled={!!busy} onClick={() => void ignoreDevice(deviceId)}>
                <span className="btn-glyph" aria-hidden>
                  ✖
                </span>
                忽略
              </button>
              <button
                type="button"
                className="muted-btn"
                disabled={!!busy}
                onClick={() => void dismissDevice(deviceId)}
                title="不加入忽略列表，通知可能再次出现"
              >
                <span className="btn-glyph" aria-hidden>
                  🕒
                </span>
                暂缓
              </button>
            </div>
          </div>
        )
      })}

      {folderRows.map(({ folderId, deviceId, offer }) => {
        const folderExists = !!config?.folders.some((f) => f.id === folderId)
        const deviceKnown = !!config?.devices.some((d) => sameDeviceId(d.deviceID, deviceId))
        const peerName = config
          ? resolveDeviceNameFromConfig(config.devices, deviceId)
          : shortDeviceId(deviceId)
        const label = offer.label?.trim()
        const folderCd = AUTO_ACCEPT_SEC
        const busy =
          busyKey === `dismiss-f:${folderId}:${deviceId}` ||
          busyKey === `ignore-f:${folderId}:${deviceId}` ||
          busyKey === `share-f:${folderId}:${deviceId}` ||
          busyKey === `auto-f:${folderId}:${deviceId}`
        const encBarrier = offer.receiveEncrypted && folderExists
        return (
          <div key={`pf-${folderId}-${deviceId}`} className="pending-cluster-card">
            <div className="pending-cluster-head">
              <span>{folderExists ? '共享文件夹' : '新文件夹'}</span>
              <span className="pending-cluster-time">{formatDateTimeYmdHms(offer.time)}</span>
            </div>
            <div className="pending-cluster-body">
              <p className="pending-cluster-msg">
                {label ? (
                  <>
                    {peerName} 希望共享文件夹「{label}」（{folderId}）。
                  </>
                ) : (
                  <>
                    {peerName} 希望共享文件夹「{folderId}」。
                  </>
                )}
                {folderExists ? ' 是否将本文件夹共享给该设备？' : ' 是否添加该文件夹？'}
              </p>
              {!folderExists && folderCd !== undefined && folderCd > 0 ? (
                <p className="pending-cluster-countdown">
                  <span aria-hidden>⏳</span> 将在 {folderCd} 秒后自动接受文件夹并保存…
                </p>
              ) : null}
              {encBarrier ? (
                <p className="pending-cluster-hint muted">请在「文件夹」页面手动完成接收加密配置。</p>
              ) : null}
            </div>
            <div className="pending-cluster-actions">
              {folderExists ? (
                <button
                  type="button"
                  className="primary"
                  disabled={!!busy || encBarrier}
                  onClick={() => void shareFolderWithDevice(folderId, deviceId)}
                >
                  共享
                </button>
              ) : (
                <button
                  type="button"
                  className="primary"
                  disabled={!!busy}
                  onClick={() => {
                    cancelFolderTimer(folderId, deviceId)
                    navigate('/folders')
                  }}
                >
                  前往文件夹
                </button>
              )}
              <button
                type="button"
                className="danger"
                disabled={!!busy || !deviceKnown}
                title={!deviceKnown ? '请先在「新设备」通知中添加该设备' : '永久忽略该设备的此文件夹提议'}
                onClick={() => void ignoreFolderRow(folderId, deviceId, offer)}
              >
                忽略
              </button>
              <button
                type="button"
                className="muted-btn"
                disabled={!!busy}
                onClick={() => void dismissFolderRow(folderId, deviceId)}
              >
                暂缓
              </button>
            </div>
          </div>
        )
      })}
    </div>
  )
}

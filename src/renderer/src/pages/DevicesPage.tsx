import React, { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import QrModal from '../components/QrModal'
import { useConnection } from '../context/ConnectionContext'
import { usePoll } from '../hooks/usePoll'
import type {
  ConnectionEntry,
  DeviceConfiguration,
  DeviceStatisticsEntry,
  FolderConfiguration,
  FolderSummary,
  SystemConfig
} from '../api/types'
import type { SyncthingClient } from '../api/client'
import { ConnectionSignal } from '../components/ConnectionSignal'
import AddDeviceModal from '../components/device/AddDeviceModal'
import EditDeviceModal from '../components/device/EditDeviceModal'
import RecentChangesModal from '../components/device/RecentChangesModal'
import {
  formatBytes,
  formatDisplaySyncthingVersion,
  getConnectionEntryForDevice,
  getValueByDeviceId,
  sameDeviceId,
  shortDeviceId
} from '../util/format'
import {
  aggregateDeviceCompletion,
  compressionLabel,
  foldersSharedWithDevice,
  formatDateTimeYmdHms,
  mergeDeviceDisplayCompletion,
  rdConnType,
  rdConnTypeLabel,
  sharedFolderLabels,
  type DeviceCompletionAggregate,
  type FolderDeviceCompletionSlice
} from '../util/syncthingUi'

/** 与官方 deviceStatus：_total === 100 为最新，否则为同步中 */
function deviceNeedsSync(comp: DeviceCompletionAggregate | undefined): boolean {
  if (!comp || comp.loaded === false) {
    return false
  }
  return comp.completion !== 100 || comp.needBytes > 0 || comp.needItems > 0
}

function remoteDeviceHeadStatus(
  dev: DeviceConfiguration,
  conn: ConnectionEntry | undefined,
  comp: DeviceCompletionAggregate | undefined
): { label: string; kind: 'ok' | 'warn' | 'paused' | 'disconnected' | 'syncing' } {
  if (dev.paused) {
    return { label: 'Paused', kind: 'paused' }
  }
  if (!conn?.connected) {
    return { label: 'Disconnected', kind: 'disconnected' }
  }
  if (!comp || comp.loaded === false) {
    return { label: '—', kind: 'warn' }
  }
  if (comp.completion === 100 && comp.needBytes === 0 && comp.needItems === 0) {
    return { label: 'Up to date', kind: 'ok' }
  }
  return {
    label: `Syncing (${comp.completion}%, ${formatBytes(comp.needBytes)})`,
    kind: 'syncing'
  }
}

/** 按官方 GUI：对每个共享文件夹调用 /db/completion?folder=&device= 后汇总 */
async function loadRemoteDeviceCompletions(
  client: SyncthingClient,
  remotes: DeviceConfiguration[],
  folders: FolderConfiguration[]
): Promise<Record<string, DeviceCompletionAggregate>> {
  const slicesByDevice = new Map<string, FolderDeviceCompletionSlice[]>()
  for (const d of remotes) {
    slicesByDevice.set(d.deviceID, [])
  }

  const tasks: Promise<void>[] = []
  for (const folder of folders) {
    for (const dev of folder.devices ?? []) {
      const owner = remotes.find((r) => sameDeviceId(r.deviceID, dev.deviceID))
      if (!owner) {
        continue
      }
      const deviceId = owner.deviceID
      tasks.push(
        client
          .getFolderDeviceCompletion(folder.id, deviceId)
          .then((slice) => {
            const list = slicesByDevice.get(deviceId)
            if (list) {
              list.push(slice)
            }
          })
          .catch(() => {
            /* 单文件夹失败时忽略，与其它文件夹汇总 */
          })
      )
    }
  }
  await Promise.all(tasks)

  const out: Record<string, DeviceCompletionAggregate> = {}
  for (const d of remotes) {
    out[d.deviceID] = aggregateDeviceCompletion(slicesByDevice.get(d.deviceID) ?? [])
  }
  return out
}

export default function DevicesPage(): React.ReactElement {
  const { t } = useTranslation()
  const { client } = useConnection()
  const [cfg, setCfg] = useState<SystemConfig | null>(null)
  const [conn, setConn] = useState<Record<string, ConnectionEntry> | null>(null)
  const [deviceStats, setDeviceStats] = useState<Record<string, DeviceStatisticsEntry>>({})
  const [completionByDevice, setCompletionByDevice] = useState<
    Record<string, DeviceCompletionAggregate>
  >({})
  const [myId, setMyId] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [showAdd, setShowAdd] = useState(false)
  const [showRecent, setShowRecent] = useState(false)
  const [qrFor, setQrFor] = useState<string | null>(null)
  const [editDevice, setEditDevice] = useState<DeviceConfiguration | null>(null)
  const [bpsMap, setBpsMap] = useState<Record<string, { in: number; out: number }>>({})
  const [cardOpen, setCardOpen] = useState<Record<string, boolean>>({})
  const prevRef = useRef<{ t: number; bytes: Record<string, { inB: number; outB: number }> } | null>(
    null
  )

  const load = useCallback(async () => {
    if (!client) {
      return
    }
    setErr(null)
    try {
      const [config, connections, st, stats] = await Promise.all([
        client.getConfig(),
        client.connections(),
        client.systemStatus(),
        client.getDeviceStatisticsMap().catch(() => ({} as Record<string, DeviceStatisticsEntry>))
      ])
      setCfg(config)
      setConn(connections.connections)
      setMyId(st.myID.trim())
      setDeviceStats(stats || {})

      const remotes = (config.devices || []).filter((d) => !sameDeviceId(d.deviceID, st.myID.trim()))
      const allFolders = config.folders || []
      const [remoteCompMap, statusEntries] = await Promise.all([
        loadRemoteDeviceCompletions(client, remotes, allFolders),
        Promise.all(
          allFolders.map(async (f) => {
            try {
              const s = await client.folderStatus(f.id)
              return [f.id, s] as const
            } catch {
              return [f.id, undefined] as const
            }
          })
        )
      ])
      const folderStatusById: Record<string, FolderSummary> = {}
      for (const [id, s] of statusEntries) {
        if (s) {
          folderStatusById[id] = s
        }
      }
      const merged: Record<string, DeviceCompletionAggregate> = {}
      for (const d of remotes) {
        const shared = foldersSharedWithDevice(d.deviceID, allFolders)
        const localStatuses = shared
          .map((f) => folderStatusById[f.id])
          .filter((s): s is FolderSummary => s !== undefined)
        const remote =
          remoteCompMap[d.deviceID] ?? {
            completion: 100,
            needBytes: 0,
            needItems: 0,
            loaded: false
          }
        merged[d.deviceID] = mergeDeviceDisplayCompletion(
          remote,
          localStatuses,
          shared.length
        )
      }
      setCompletionByDevice(merged)

      const now = Date.now()
      const prev = prevRef.current
      const dt = prev && now > prev.t ? (now - prev.t) / 1000 : 0
      const nextBytes: Record<string, { inB: number; outB: number }> = {}
      const nextBps: Record<string, { in: number; out: number }> = {}

      for (const [id, c] of Object.entries(connections.connections)) {
        const inB = c.inBytesTotal ?? 0
        const outB = c.outBytesTotal ?? 0
        nextBytes[id] = { inB, outB }
        const p = prev?.bytes[id]
        if (p && dt > 0) {
          nextBps[id] = {
            in: Math.max(0, (inB - p.inB) / dt),
            out: Math.max(0, (outB - p.outB) / dt)
          }
        } else {
          nextBps[id] = { in: 0, out: 0 }
        }
      }
      prevRef.current = { t: now, bytes: nextBytes }
      setBpsMap(nextBps)
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    }
  }, [client])

  usePoll(load, 3_000, !!client)

  useEffect(() => {
    void load()
  }, [load])

  const run = async (fn: () => Promise<void>) => {
    try {
      await fn()
      await load()
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e))
    }
  }

  const toggleCard = (deviceId: string) => {
    setCardOpen((prev) => ({
      ...prev,
      [deviceId]: !(prev[deviceId] ?? true)
    }))
  }

  const pauseAllRemote = () => {
    if (!client || !cfg) {
      return
    }
    const remotes = (cfg.devices || []).filter((d) => !sameDeviceId(d.deviceID, myId))
    if (!remotes.length) {
      return
    }
    if (!confirm('暂停所有远程设备连接？')) {
      return
    }
    void run(async () => {
      for (const d of remotes) {
        if (!d.paused) {
          await client.pauseDevice(d.deviceID)
        }
      }
    })
  }

  const devices = (cfg?.devices || []).filter((d) => !sameDeviceId(d.deviceID, myId))
  const folders = cfg?.folders || []

  if (!client) {
    return <p className="muted">{t('Ark.FoldersNotConnected')}</p>
  }

  return (
    <div className="devices-page">
      <div className="row" style={{ justifyContent: 'space-between', marginBottom: '1rem', flexWrap: 'wrap' }}>
        <h1 style={{ margin: 0 }}>{t('Ark.DevicesRemoteTitle', { count: devices.length })}</h1>
        <div className="row folder-global-actions">
          <button type="button" onClick={() => void pauseAllRemote()}>
            <span className="btn-glyph" aria-hidden>
              ⏸
            </span>
            {t('Ark.FoldersPauseAll')}
          </button>
          <button type="button" onClick={() => setShowRecent(true)}>
            <span className="btn-glyph" aria-hidden>
              ⓘ
            </span>
            {t('Ark.DevicesRecentChanges')}
          </button>
          <button type="button" className="primary" onClick={() => setShowAdd(true)}>
            <span className="btn-glyph" aria-hidden>
              ＋
            </span>
            {t('Ark.DevicesAddRemote')}
          </button>
        </div>
      </div>
      {err && <div className="error-banner">{err}</div>}

      <div className="folder-card-list">
        {devices.map((d) => {
          const c = getConnectionEntryForDevice(conn, d.deviceID)
          const bps = getValueByDeviceId(bpsMap, d.deviceID) || { in: 0, out: 0 }
          const comp = getValueByDeviceId(completionByDevice, d.deviceID)
          const st = remoteDeviceHeadStatus(d, c, comp)
          const sec = getValueByDeviceId(deviceStats, d.deviceID)
          const lastSeen =
            sec?.lastSeen && new Date(sec.lastSeen).getTime() > 0
              ? formatDateTimeYmdHms(sec.lastSeen)
              : null
          const connCount = c?.connected ? 1 + (c.secondary?.length ?? 0) : 0
          const typeTitle =
            c?.connected && c.type
              ? `${c.type}${c.crypto ? ` ${c.crypto}` : ''}`.trim()
              : undefined
          const expanded = cardOpen[d.deviceID] ?? true
          const foldersText = sharedFolderLabels(d.deviceID, folders)

          const headClass =
            st.kind === 'ok'
              ? 'folder-card-state ok'
              : st.kind === 'syncing'
                ? 'folder-card-state syncing'
                : st.kind === 'disconnected'
                  ? 'folder-card-state disconnected'
                  : 'folder-card-state warn'

          const rt = rdConnType(c)
          const headIcon =
            c?.connected && rt.startsWith('relay') ? '🛰' : '🖥'

          return (
            <div key={d.deviceID} className="folder-card device-remote-card">
              <button
                type="button"
                className="folder-card-head folder-card-head-toggle"
                onClick={() => toggleCard(d.deviceID)}
              >
                <div className="folder-card-title">
                  <span className="folder-card-icon" aria-hidden>
                    {headIcon}
                  </span>
                  <span>{d.name || d.deviceID.slice(0, 7)}</span>
                </div>
                <div className="folder-card-head-right">
                  <span className={headClass}>{st.label}</span>
                  <ConnectionSignal conn={c} />
                </div>
              </button>
              {expanded && (
                <>
                  <div className="folder-card-body kv-list device-kv-zebra">
                    {c?.connected && (
                      <>
                        <div className="kv-row">
                          <span className="kv-label">{t('Ark.DevicesDownloadRate')}</span>
                          <span className="kv-value">
                            {formatBytes(bps.in)}/s
                            <span className="muted" style={{ marginLeft: '0.35rem' }}>
                              ({formatBytes(c.inBytesTotal ?? 0)})
                            </span>
                          </span>
                        </div>
                        <div className="kv-row">
                          <span className="kv-label">{t('Ark.DevicesUploadRate')}</span>
                          <span className="kv-value">
                            {formatBytes(bps.out)}/s
                            <span className="muted" style={{ marginLeft: '0.35rem' }}>
                              ({formatBytes(c.outBytesTotal ?? 0)})
                            </span>
                          </span>
                        </div>
                        {deviceNeedsSync(comp) && comp && (
                          <div className="kv-row">
                            <span className="kv-label">{t('Ark.DevicesUnsyncedItems')}</span>
                            <span className="kv-value kv-value-em">
                              {comp.needItems} 条目, ~{formatBytes(comp.needBytes)}
                            </span>
                          </div>
                        )}
                      </>
                    )}
                    {!c?.connected && lastSeen && (
                      <div className="kv-row">
                        <span className="kv-label">{t('Ark.DevicesLastSeen')}</span>
                        <span className="kv-value">{lastSeen}</span>
                      </div>
                    )}
                    <div className="kv-row">
                      <span className="kv-label">{t('Ark.DevicesAddress')}</span>
                      <span className="kv-value path-val">
                        {c?.connected
                          ? c.address || '—'
                          : d.addresses && d.addresses.length > 0
                            ? d.addresses.join(', ')
                            : '—'}
                      </span>
                    </div>
                    {c?.connected && (
                      <>
                        <div className="kv-row">
                          <span className="kv-label">{t('Ark.DevicesConnectionType')}</span>
                          <span className="kv-value" title={typeTitle}>
                            {rdConnTypeLabel(c, t)}
                          </span>
                        </div>
                        <div className="kv-row">
                          <span className="kv-label">{t('Ark.DevicesConnections')}</span>
                          <span className="kv-value">{connCount}</span>
                        </div>
                      </>
                    )}
                    <div className="kv-row">
                      <span className="kv-label">{t('Ark.DevicesCompression')}</span>
                      <span className="kv-value">{compressionLabel(d.compression, t)}</span>
                    </div>
                    <div className="kv-row">
                      <span className="kv-label">{t('Ark.DevicesAutoAccept')}</span>
                      <span className="kv-value">{d.autoAcceptFolders ? t('Ark.Yes') : t('Ark.No')}</span>
                    </div>
                    <div className="kv-row">
                      <span className="kv-label">{t('Ark.DevicesIdentifier')}</span>
                      <span className="kv-value">
                        <button
                          type="button"
                          className="link-btn"
                          onClick={(e) => {
                            e.stopPropagation()
                            setQrFor(d.deviceID)
                          }}
                          title={t('Ark.DevicesShowQr')}
                        >
                          {shortDeviceId(d.deviceID)}
                        </button>
                      </span>
                    </div>
                    {c?.connected && c.clientVersion && (
                      <div className="kv-row">
                        <span className="kv-label">{t('Ark.DevicesVersion')}</span>
                        <span className="kv-value">{formatDisplaySyncthingVersion(c.clientVersion)}</span>
                      </div>
                    )}
                    {foldersText ? (
                      <div className="kv-row">
                        <span className="kv-label">{t('Ark.Folders')}</span>
                        <span className="kv-value">{foldersText}</span>
                      </div>
                    ) : null}
                  </div>
                  <div className="folder-card-actions row">
                    <button
                      type="button"
                      onClick={() =>
                        void run(() =>
                          d.paused ? client.resumeDevice(d.deviceID) : client.pauseDevice(d.deviceID)
                        )
                      }
                    >
                      <span className="btn-glyph" aria-hidden>
                        {d.paused ? '▶' : '⏸'}
                      </span>
                      {d.paused ? t('Ark.DevicesResume') : t('Ark.DevicesPause')}
                    </button>
                    <button type="button" onClick={() => setEditDevice(d)}>
                      <span className="btn-glyph" aria-hidden>
                        ✎
                      </span>
                      {t('Ark.Edit')}
                    </button>
                  </div>
                </>
              )}
            </div>
          )
        })}
      </div>

      {devices.length === 0 && !err && <p className="muted">{t('Ark.DevicesNoRemote')}</p>}

      {showAdd && myId && (
        <AddDeviceModal
          folders={folders}
          onClose={() => setShowAdd(false)}
          onSave={() => void load()}
          onShowMyQr={() => setQrFor(myId)}
        />
      )}
      {showRecent && (
        <RecentChangesModal
          client={client}
          devices={cfg?.devices ?? []}
          folders={folders}
          onClose={() => setShowRecent(false)}
        />
      )}
      {editDevice && (
        <EditDeviceModal
          device={editDevice}
          folders={folders}
          onClose={() => setEditDevice(null)}
          onSave={() => void load()}
          onShowQr={(id) => setQrFor(id)}
        />
      )}
      {qrFor && <QrModal deviceId={qrFor} onClose={() => setQrFor(null)} />}
    </div>
  )
}

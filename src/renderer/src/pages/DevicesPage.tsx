import React, { useCallback, useEffect, useRef, useState } from 'react'
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
  compressionLabelCn,
  formatDateTimeYmdHms,
  rdConnType,
  rdConnTypeLabelCn,
  sharedFolderLabels
} from '../util/syncthingUi'

type DeviceCompletion = {
  completion: number
  needItems?: number
  needBytes?: number
}

function deviceNeedsSync(comp: DeviceCompletion | undefined): boolean {
  if (!comp) {
    return false
  }
  const needItems = comp.needItems ?? 0
  const needBytes = comp.needBytes ?? 0
  return comp.completion < 99.95 || needItems > 0 || needBytes > 0
}

function folderSharedWithDevice(folder: FolderConfiguration, deviceId: string): boolean {
  return (folder.devices ?? []).some((x) => sameDeviceId(x.deviceID, deviceId))
}

/** 共享文件夹是否在同步/扫描，或当前与该设备有传输 */
function isDeviceActivelySyncing(
  deviceId: string,
  folders: FolderConfiguration[],
  folderStatusById: Record<string, FolderSummary>,
  bps: { in: number; out: number }
): boolean {
  if (bps.in > 0 || bps.out > 0) {
    return true
  }
  for (const f of folders) {
    if (!folderSharedWithDevice(f, deviceId)) {
      continue
    }
    const st = folderStatusById[f.id]?.state ?? ''
    if (st === 'syncing' || st === 'scanning' || st.startsWith('sync')) {
      return true
    }
  }
  return false
}

function remoteDeviceHeadStatus(
  dev: DeviceConfiguration,
  conn: ConnectionEntry | undefined,
  comp: DeviceCompletion | undefined,
  activelySyncing: boolean
): { label: string; kind: 'ok' | 'warn' | 'paused' | 'disconnected' | 'syncing' } {
  if (dev.paused) {
    return { label: '已暂停', kind: 'paused' }
  }
  if (!conn?.connected) {
    return { label: '已断开连接', kind: 'disconnected' }
  }
  if (!deviceNeedsSync(comp)) {
    return { label: '最新', kind: 'ok' }
  }
  const pct = Math.round(comp?.completion ?? 0)
  const needBytes = comp?.needBytes ?? 0
  if (activelySyncing) {
    return {
      label: `同步中 (${pct}%, ${formatBytes(needBytes)})`,
      kind: 'syncing'
    }
  }
  return { label: `不同步 (${pct}%)`, kind: 'warn' }
}

export default function DevicesPage(): React.ReactElement {
  const { client } = useConnection()
  const [cfg, setCfg] = useState<SystemConfig | null>(null)
  const [conn, setConn] = useState<Record<string, ConnectionEntry> | null>(null)
  const [deviceStats, setDeviceStats] = useState<Record<string, DeviceStatisticsEntry>>({})
  const [completionByDevice, setCompletionByDevice] = useState<Record<string, DeviceCompletion>>({})
  const [folderStatusById, setFolderStatusById] = useState<Record<string, FolderSummary>>({})
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
      const compEntries = await Promise.all(
        remotes.map(async (d) => {
          try {
            const c = await client.getDeviceCompletion(d.deviceID)
            return [d.deviceID, c as DeviceCompletion] as const
          } catch {
            return [d.deviceID, undefined] as const
          }
        })
      )
      const compMap: Record<string, DeviceCompletion> = {}
      for (const [id, c] of compEntries) {
        if (c) {
          compMap[id] = c
        }
      }
      setCompletionByDevice(compMap)

      const statusEntries = await Promise.all(
        (config.folders || []).map(async (f) => {
          try {
            const s = await client.folderStatus(f.id)
            return [f.id, s] as const
          } catch {
            return [f.id, undefined] as const
          }
        })
      )
      const statusMap: Record<string, FolderSummary> = {}
      for (const [id, s] of statusEntries) {
        if (s) {
          statusMap[id] = s
        }
      }
      setFolderStatusById(statusMap)

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
    return <p className="muted">未连接</p>
  }

  return (
    <div className="devices-page">
      <div className="row" style={{ justifyContent: 'space-between', marginBottom: '1rem', flexWrap: 'wrap' }}>
        <h1 style={{ margin: 0 }}>远程设备 ({devices.length})</h1>
        <div className="row folder-global-actions">
          <button type="button" onClick={() => void pauseAllRemote()}>
            <span className="btn-glyph" aria-hidden>
              ⏸
            </span>
            暂停全部
          </button>
          <button type="button" onClick={() => setShowRecent(true)}>
            <span className="btn-glyph" aria-hidden>
              ⓘ
            </span>
            最近更改
          </button>
          <button type="button" className="primary" onClick={() => setShowAdd(true)}>
            <span className="btn-glyph" aria-hidden>
              ＋
            </span>
            添加远程设备
          </button>
        </div>
      </div>
      {err && <div className="error-banner">{err}</div>}

      <div className="folder-card-list">
        {devices.map((d) => {
          const c = getConnectionEntryForDevice(conn, d.deviceID)
          const bps = getValueByDeviceId(bpsMap, d.deviceID) || { in: 0, out: 0 }
          const comp = getValueByDeviceId(completionByDevice, d.deviceID)
          const activelySyncing = isDeviceActivelySyncing(
            d.deviceID,
            folders,
            folderStatusById,
            bps
          )
          const st = remoteDeviceHeadStatus(d, c, comp, activelySyncing)
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
                          <span className="kv-label">下载速率</span>
                          <span className="kv-value">
                            {formatBytes(bps.in)}/s
                            <span className="muted" style={{ marginLeft: '0.35rem' }}>
                              ({formatBytes(c.inBytesTotal ?? 0)})
                            </span>
                          </span>
                        </div>
                        <div className="kv-row">
                          <span className="kv-label">上传速率</span>
                          <span className="kv-value">
                            {formatBytes(bps.out)}/s
                            <span className="muted" style={{ marginLeft: '0.35rem' }}>
                              ({formatBytes(c.outBytesTotal ?? 0)})
                            </span>
                          </span>
                        </div>
                        {deviceNeedsSync(comp) && (
                          <div className="kv-row">
                            <span className="kv-label">未同步的项目</span>
                            <span className="kv-value kv-value-em">
                              {comp?.needItems ?? 0} 条目, ~{formatBytes(comp?.needBytes ?? 0)}
                            </span>
                          </div>
                        )}
                      </>
                    )}
                    {!c?.connected && lastSeen && (
                      <div className="kv-row">
                        <span className="kv-label">最后可见</span>
                        <span className="kv-value">{lastSeen}</span>
                      </div>
                    )}
                    <div className="kv-row">
                      <span className="kv-label">地址</span>
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
                          <span className="kv-label">连接类型</span>
                          <span className="kv-value" title={typeTitle}>
                            {rdConnTypeLabelCn(c)}
                          </span>
                        </div>
                        <div className="kv-row">
                          <span className="kv-label">连接数</span>
                          <span className="kv-value">{connCount}</span>
                        </div>
                      </>
                    )}
                    <div className="kv-row">
                      <span className="kv-label">压缩</span>
                      <span className="kv-value">{compressionLabelCn(d.compression)}</span>
                    </div>
                    <div className="kv-row">
                      <span className="kv-label">自动接受</span>
                      <span className="kv-value">{d.autoAcceptFolders ? '是' : '否'}</span>
                    </div>
                    <div className="kv-row">
                      <span className="kv-label">标识</span>
                      <span className="kv-value">
                        <button
                          type="button"
                          className="link-btn"
                          onClick={(e) => {
                            e.stopPropagation()
                            setQrFor(d.deviceID)
                          }}
                          title="二维码"
                        >
                          {shortDeviceId(d.deviceID)}
                        </button>
                      </span>
                    </div>
                    {c?.connected && c.clientVersion && (
                      <div className="kv-row">
                        <span className="kv-label">版本</span>
                        <span className="kv-value">{formatDisplaySyncthingVersion(c.clientVersion)}</span>
                      </div>
                    )}
                    {foldersText ? (
                      <div className="kv-row">
                        <span className="kv-label">文件夹</span>
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
                      {d.paused ? '恢复' : '暂停'}
                    </button>
                    <button type="button" onClick={() => setEditDevice(d)}>
                      <span className="btn-glyph" aria-hidden>
                        ✎
                      </span>
                      编辑
                    </button>
                  </div>
                </>
              )}
            </div>
          )
        })}
      </div>

      {devices.length === 0 && !err && <p className="muted">暂无远程设备。</p>}

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

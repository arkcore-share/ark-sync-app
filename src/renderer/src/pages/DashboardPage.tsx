import React, { useCallback, useEffect, useRef, useState } from 'react'
import { DiscoveryStatusModal, ListenerStatusModal } from '../components/dashboard/DeviceStatusModals'
import QrModal from '../components/QrModal'
import { useConnection } from '../context/ConnectionContext'
import { usePoll } from '../hooks/usePoll'
import type { SystemConfig, SystemStatus } from '../api/types'
import { LocalStateTotalStat } from '../components/ConnectionSignal'
import {
  coerceConfigDevicesFromResponse,
  formatBytes,
  formatDisplaySyncthingVersion,
  resolveDeviceNameFromConfig
} from '../util/format'
import {
  countDiscoveryOk,
  countListenersOk,
  formatUptimeSeconds
} from '../util/syncthingUi'

export default function DashboardPage(): React.ReactElement {
  const { client } = useConnection()
  const [status, setStatus] = useState<SystemStatus | null>(null)
  const [longVersion, setLongVersion] = useState<string>('')
  const [connections, setConnections] = useState<{
    total: { inBytesTotal: number; outBytesTotal: number }
  } | null>(null)
  const [config, setConfig] = useState<SystemConfig | null>(null)
  const [selfDisplayName, setSelfDisplayName] = useState('')
  const [localTotals, setLocalTotals] = useState({ files: 0, dirs: 0, bytes: 0 })
  const [inBps, setInBps] = useState(0)
  const [outBps, setOutBps] = useState(0)
  const [loadErr, setLoadErr] = useState<string | null>(null)
  const [qrDevice, setQrDevice] = useState<string | null>(null)
  const [listenerModal, setListenerModal] = useState(false)
  const [discoveryModal, setDiscoveryModal] = useState(false)
  const prevConnRef = useRef<{ t: number; inB: number; outB: number } | null>(null)

  const load = useCallback(async () => {
    if (!client) {
      return
    }
    setLoadErr(null)
    try {
      const [st, ver, conn, cfg] = await Promise.all([
        client.systemStatus() as Promise<SystemStatus>,
        client.systemVersion(),
        client.connections(),
        client.getConfig()
      ])
      setStatus(st)
      const raw = (ver.longVersion || ver.version || '').trim()
      setLongVersion(formatDisplaySyncthingVersion(raw))
      setConnections(conn)

      const my = st.myID.trim()
      const devices = coerceConfigDevicesFromResponse(cfg.devices)
      let label = resolveDeviceNameFromConfig(devices, my)
      if (my) {
        try {
          const one = await client.getConfigDevice(my)
          if (one && typeof one.name === 'string' && one.name.trim()) {
            label = one.name.trim()
          }
        } catch {
          // 单设备接口不可用时仍用列表解析结果
        }
      }
      setSelfDisplayName(label)

      const now = Date.now()
      const t = conn.total
      const prev = prevConnRef.current
      if (prev && now > prev.t) {
        const dt = (now - prev.t) / 1000
        setInBps(Math.max(0, (t.inBytesTotal - prev.inB) / dt))
        setOutBps(Math.max(0, (t.outBytesTotal - prev.outB) / dt))
      } else {
        setInBps(0)
        setOutBps(0)
      }
      prevConnRef.current = { t: now, inB: t.inBytesTotal, outB: t.outBytesTotal }

      const summaries = await Promise.all(
        (cfg.folders || []).map(async (f) => {
          try {
            return await client.folderStatus(f.id)
          } catch {
            return null
          }
        })
      )
      let files = 0
      let dirs = 0
      let bytes = 0
      for (const s of summaries) {
        if (!s) {
          continue
        }
        files += s.localFiles ?? 0
        dirs += s.localDirectories ?? 0
        bytes += Number(s.localBytes ?? 0)
      }
      setLocalTotals({ files, dirs, bytes })
    } catch (e) {
      setLoadErr(e instanceof Error ? e.message : String(e))
    }
  }, [client])

  usePoll(load, 10_000, !!client)

  useEffect(() => {
    void load()
  }, [load])

  if (!client) {
    return <p className="muted">未连接</p>
  }

  const myId = (status?.myID ?? '').trim()
  const selfName = !myId
    ? '本机'
    : selfDisplayName ||
      resolveDeviceNameFromConfig(coerceConfigDevicesFromResponse(config?.devices), myId)
  const shortId = myId ? myId.split('-')[0] || myId.slice(0, 7) : '—'

  const disc = countDiscoveryOk(status?.discoveryStatus)
  const lst = countListenersOk(status?.connectionServiceStatus)

  const versionLine = longVersion || ''

  return (
    <div>
      <h1 style={{ marginTop: 0 }}>本机设备</h1>
      {loadErr && <div className="error-banner">{loadErr}</div>}

      <div className="device-panel card">
        <div className="kv-list device-kv-panel">
          <div className="kv-row">
            <span className="kv-label">
              <span className="kv-icon" aria-hidden>
                ▣
              </span>
              名称
            </span>
            <span className="kv-value">{selfName}</span>
          </div>
          <div className="kv-row">
            <span className="kv-label">
              <span className="kv-icon" aria-hidden>
                ↓
              </span>
              下载速率
            </span>
            <span className="kv-value">
              {formatBytes(inBps)}/s
              {connections && (
                <span className="muted" style={{ marginLeft: '0.35rem' }}>
                  ({formatBytes(connections.total.inBytesTotal)})
                </span>
              )}
            </span>
          </div>
          <div className="kv-row">
            <span className="kv-label">
              <span className="kv-icon" aria-hidden>
                ↑
              </span>
              上传速率
            </span>
            <span className="kv-value">
              {formatBytes(outBps)}/s
              {connections && (
                <span className="muted" style={{ marginLeft: '0.35rem' }}>
                  ({formatBytes(connections.total.outBytesTotal)})
                </span>
              )}
            </span>
          </div>
          <div className="kv-row">
            <span className="kv-label">
              <span className="kv-icon" aria-hidden>
                ⌂
              </span>
              本地状态 (总计)
            </span>
            <span className="kv-value">
              <LocalStateTotalStat files={localTotals.files} dirs={localTotals.dirs} bytes={localTotals.bytes} formatBytes={formatBytes} />
            </span>
          </div>
          <div className="kv-row">
            <span className="kv-label">
              <span className="kv-icon" aria-hidden>
                ⧉
              </span>
              监听程序
            </span>
            <button
              type="button"
              className={`kv-value kv-value-click ${
                lst.ok === lst.total && lst.total > 0 ? 'ok' : lst.total > 0 ? 'warn' : 'muted'
              }`}
              onClick={() => setListenerModal(true)}
              title="查看监听程序状态"
            >
              {lst.ok}/{lst.total}
            </button>
          </div>
          <div className="kv-row">
            <span className="kv-label">
              <span className="kv-icon" aria-hidden>
                ◉
              </span>
              设备发现
            </span>
            <button
              type="button"
              className={`kv-value kv-value-click ${
                disc.ok === disc.total && disc.total > 0 ? 'ok' : disc.total > 0 ? 'warn' : 'muted'
              }`}
              onClick={() => setDiscoveryModal(true)}
              title="查看设备发现状态"
            >
              {disc.ok}/{disc.total}
            </button>
          </div>
          <div className="kv-row">
            <span className="kv-label">
              <span className="kv-icon" aria-hidden>
                ◷
              </span>
              运行时间
            </span>
            <span className="kv-value">{formatUptimeSeconds(status?.uptime)}</span>
          </div>
          <div className="kv-row">
            <span className="kv-label">
              <span className="kv-icon" aria-hidden>
                ⚏
              </span>
              标识
            </span>
            <span className="kv-value">
              <button type="button" className="link-btn" onClick={() => setQrDevice(myId)} title="显示二维码">
                {shortId}
              </button>
            </span>
          </div>
          <div className="kv-row">
            <span className="kv-label">
              <span className="kv-icon" aria-hidden>
                ⌗
              </span>
              版本
            </span>
            <span className="kv-value version-line">{versionLine || '…'}</span>
          </div>
        </div>
      </div>

      {qrDevice && <QrModal deviceId={qrDevice} onClose={() => setQrDevice(null)} />}
      {listenerModal && (
        <ListenerStatusModal status={status} onClose={() => setListenerModal(false)} />
      )}
      {discoveryModal && (
        <DiscoveryStatusModal
          status={status}
          config={config}
          onClose={() => setDiscoveryModal(false)}
        />
      )}
    </div>
  )
}

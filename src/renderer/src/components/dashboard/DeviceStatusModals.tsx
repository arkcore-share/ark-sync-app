import React from 'react'
import type { DiscoveryStatusEntry, ListenerStatusEntry, SystemConfig, SystemStatus } from '../../api/types'

const LISTENER_NONE_CN =
  'Ark Sync 不监听任何地址上其他设备的连接尝试。只有来自此设备的传出连接才能工作。'

const DISCOVERY_INTRO_CN =
  '以下方法用于发现网络上的其他设备，并通知其他人发现此设备：'

const DISCOVERY_IPV6_NOTE_CN =
  '如果本机没有配置 IPv6，则无法连接 IPv6 服务器是正常的。'

function listenerEntries(status: SystemStatus | null): [string, ListenerStatusEntry][] {
  const m = status?.connectionServiceStatus
  if (!m) {
    return []
  }
  return Object.entries(m).sort(([a], [b]) => a.localeCompare(b))
}

function discoveryEntries(status: SystemStatus | null): [string, DiscoveryStatusEntry][] {
  const m = status?.discoveryStatus
  if (!m) {
    return []
  }
  return Object.entries(m).sort(([a], [b]) => a.localeCompare(b))
}

/** 当未返回 discoveryStatus 时，用配置推断展示用列表（与官方默认接近） */
function discoveryFallbackLines(options: Record<string, unknown> | undefined): string[] {
  if (!options) {
    return []
  }
  const localOn = options.localAnnounceEnabled !== false
  const globalOn = options.globalAnnounceEnabled !== false
  const list =
    (options.globalAnnounceServers as string[] | undefined) ??
    (options as { rawGlobalAnnounceServers?: string[] }).rawGlobalAnnounceServers ??
    []
  const out: string[] = []
  if (localOn) {
    out.push('IPv4 local', 'IPv6 local')
  }
  if (globalOn) {
    const useDefault =
      list.length === 0 ||
      list.every((s) => s === 'default' || s === 'default-v4' || s === 'default-v6')
    if (useDefault) {
      out.push(
        'global@https://discovery-announce-v4.syncthing.net/v2/',
        'global@https://discovery-announce-v6.syncthing.net/v2/',
        'global@https://discovery-lookup.syncthing.net/v2/'
      )
    } else {
      for (const s of list) {
        if (!s || s === 'default' || s === 'default-v4' || s === 'default-v6') {
          continue
        }
        out.push(s.includes('@') ? s : `global@${s}`)
      }
    }
  }
  return out
}

export function ListenerStatusModal({
  status,
  onClose
}: {
  status: SystemStatus | null
  onClose: () => void
}): React.ReactElement {
  const entries = listenerEntries(status)

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div className="modal modal-dashboard-status" role="dialog" onClick={(e) => e.stopPropagation()}>
        <div className="dashboard-status-modal-header">
          <span className="dashboard-status-modal-glyph" aria-hidden>
            ⧉
          </span>
          <h3 className="dashboard-status-modal-title">监听程序状态</h3>
        </div>
        <div className="dashboard-status-modal-body">
          {entries.length === 0 ? (
            <p className="dashboard-status-para">{LISTENER_NONE_CN}</p>
          ) : (
            <ul className="dashboard-status-detail-list">
              {entries.map(([name, st]) => (
                <li key={name}>
                  <div className="dashboard-status-item-head">
                    <code className="dashboard-status-code">{name}</code>
                    {st.error ? <span className="dashboard-status-err">{st.error}</span> : <span className="muted">正常</span>}
                  </div>
                  {st.lanAddresses?.length || st.wanAddresses?.length ? (
                    <div className="dashboard-status-addrs muted">
                      {[...(st.lanAddresses || []), ...(st.wanAddresses || [])].map((a) => (
                        <div key={a}>{a}</div>
                      ))}
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="dashboard-status-modal-footer">
          <button type="button" onClick={onClose}>
            <span className="btn-glyph" aria-hidden>
              ✕
            </span>
            关闭
          </button>
        </div>
      </div>
    </div>
  )
}

export function DiscoveryStatusModal({
  status,
  config,
  onClose
}: {
  status: SystemStatus | null
  config: SystemConfig | null
  onClose: () => void
}): React.ReactElement {
  const entries = discoveryEntries(status)
  const fallback = discoveryFallbackLines(config?.options)
  const empty = entries.length === 0 && fallback.length === 0

  const rows: { key: string; err?: string | null }[] =
    entries.length > 0
      ? entries.map(([k, v]) => ({ key: k, err: v.error }))
      : fallback.map((k) => ({ key: k }))

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div className="modal modal-dashboard-status" role="dialog" onClick={(e) => e.stopPropagation()}>
        <div className="dashboard-status-modal-header">
          <span className="dashboard-status-modal-glyph" aria-hidden>
            ◉
          </span>
          <h3 className="dashboard-status-modal-title">设备发现状态</h3>
        </div>
        <div className="dashboard-status-modal-body">
          {empty ? (
            <p className="dashboard-status-para">
              设备发现未启用（本地与全球发现均已关闭）。仍可通过已知设备地址或已配对设备建立连接。
            </p>
          ) : (
            <>
              <p className="dashboard-status-para">{DISCOVERY_INTRO_CN}</p>
              <ul className="dashboard-status-list">
                {rows.map(({ key, err }) => (
                  <li key={key}>
                    <code className="dashboard-status-code">{key}</code>
                    {err ? <span className="dashboard-status-err"> — {err}</span> : null}
                  </li>
                ))}
              </ul>
              <div className="dashboard-status-note">{DISCOVERY_IPV6_NOTE_CN}</div>
            </>
          )}
        </div>
        <div className="dashboard-status-modal-footer">
          <button type="button" onClick={onClose}>
            <span className="btn-glyph" aria-hidden>
              ✕
            </span>
            关闭
          </button>
        </div>
      </div>
    </div>
  )
}

import React, { useEffect, useState } from 'react'
import type { SyncthingClient } from '../../api/client'
import type { DeviceConfiguration, FolderConfiguration, SyncthingDiskEvent } from '../../api/types'
import { resolveDeviceNameFromConfig, shortDeviceId } from '../../util/format'
import { formatDateTimeYmdHms } from '../../util/syncthingUi'

function mapActionCn(action: string | undefined): string {
  switch (action) {
    case 'modified':
      return '已修改'
    case 'deleted':
      return '已删除'
    default:
      return action?.trim() || '—'
  }
}

function mapTypeCn(t: string | undefined): string {
  switch (t) {
    case 'file':
      return '文件'
    case 'folder':
      return '文件夹'
    case 'dir':
      return '文件夹'
    case 'symlink':
      return '符号链接'
    default:
      return t?.trim() || '—'
  }
}

function folderLabelFromEvent(folders: FolderConfiguration[], data: Record<string, string>): string {
  const id = (data.folder || data.folderID || '').trim()
  const fromData = (data.label || '').trim()
  if (fromData) {
    return fromData
  }
  const f = folders.find((x) => x.id === id)
  return (f?.label || '').trim() || id || '—'
}

function deviceColumnLabel(devices: DeviceConfiguration[], modifiedBy: string | undefined): string {
  const id = (modifiedBy || '').trim()
  if (!id) {
    return '未知'
  }
  const name = resolveDeviceNameFromConfig(devices, id)
  if (name && name !== '—') {
    return name
  }
  return shortDeviceId(id)
}

export default function RecentChangesModal({
  client,
  devices,
  folders,
  onClose
}: {
  client: SyncthingClient
  devices: DeviceConfiguration[]
  folders: FolderConfiguration[]
  onClose: () => void
}): React.ReactElement {
  const [rows, setRows] = useState<SyncthingDiskEvent[]>([])
  const [loadErr, setLoadErr] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      setLoadErr(null)
      try {
        const data = await client.getDiskEvents({ limit: 25, timeout: 0 })
        if (!cancelled) {
          setRows([...data].reverse())
        }
      } catch (e) {
        if (!cancelled) {
          setRows([])
          setLoadErr(e instanceof Error ? e.message : String(e))
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [client])

  return (
    <div className="modal-backdrop modal-recent-changes-layer" role="presentation" onClick={onClose}>
      <div className="modal modal-recent-changes" role="dialog" aria-labelledby="recent-changes-title" onClick={(e) => e.stopPropagation()}>
        <div className="recent-changes-modal-header">
          <span className="recent-changes-modal-icon" aria-hidden title="信息">
            ⓘ
          </span>
          <h2 id="recent-changes-title" className="recent-changes-modal-title">
            最近更改
          </h2>
        </div>
        <div className="recent-changes-modal-body">
          {loadErr && <div className="error-banner">{loadErr}</div>}
          <div className="recent-changes-table-wrap">
            <table className="recent-changes-table">
              <thead>
                <tr>
                  <th>设备</th>
                  <th>操作</th>
                  <th>类型</th>
                  <th>文件夹</th>
                  <th>路径</th>
                  <th>时间</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 && !loadErr ? (
                  <tr>
                    <td colSpan={6} className="muted" style={{ padding: '1.25rem 0.5rem' }}>
                      暂无记录
                    </td>
                  </tr>
                ) : (
                  rows.map((ev, idx) => {
                    const d = ev.data || {}
                    return (
                      <tr key={`${ev.globalID}-${ev.time}-${idx}-${d.path || ''}`}>
                        <td>{deviceColumnLabel(devices, d.modifiedBy)}</td>
                        <td>{mapActionCn(d.action)}</td>
                        <td>{mapTypeCn(d.type)}</td>
                        <td className="recent-changes-cell-clip">{folderLabelFromEvent(folders, d)}</td>
                        <td className="recent-changes-cell-path">{d.path || '—'}</td>
                        <td className="recent-changes-cell-clip">{formatDateTimeYmdHms(ev.time)}</td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
        <div className="recent-changes-modal-footer">
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

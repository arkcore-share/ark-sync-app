import React, { useEffect, useState } from 'react'
import { useConnection } from '../../context/ConnectionContext'
import { formatBytes } from '../../util/format'
import type { FileVersion, FolderVersionsMap } from '../../api/types'

function pickVersionKey(v: FileVersion): string {
  return v.versionTime || (v as unknown as { VersionTime?: string }).VersionTime || ''
}

export default function VersionsModal({
  folderId,
  onClose
}: {
  folderId: string
  onClose: () => void
}): React.ReactElement {
  const { client } = useConnection()
  const [data, setData] = useState<FolderVersionsMap | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [restoreErr, setRestoreErr] = useState<string | null>(null)

  const load = async () => {
    if (!client) {
      return
    }
    setErr(null)
    try {
      const v = await client.getFolderVersions(folderId)
      setData(v)
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
      setData(null)
    }
  }

  useEffect(() => {
    void load()
  }, [client, folderId])

  const restoreOne = async (relPath: string, versionTime: string) => {
    if (!client || !confirm(`将「${relPath}」还原到版本 ${versionTime} ？`)) {
      return
    }
    setBusy(true)
    setRestoreErr(null)
    try {
      const result = await client.restoreFolderVersions(folderId, { [relPath]: versionTime })
      const msg = Object.entries(result || {})
        .map(([k, v]) => `${k}: ${v}`)
        .join('\n')
      if (msg) {
        alert(msg)
      }
      await load()
    } catch (e) {
      setRestoreErr(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const entries = data ? Object.entries(data) : []

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="modal"
        role="dialog"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: '720px', width: '90vw' }}
      >
        <h3>文件版本 — {folderId}</h3>
        <p className="muted">仅当文件夹启用了版本控制时才有数据。还原会在文件夹中恢复所选历史版本。</p>
        {err && <div className="error-banner">{err}</div>}
        {restoreErr && <div className="error-banner">{restoreErr}</div>}
        <div className="table-wrap" style={{ maxHeight: '420px', overflow: 'auto' }}>
          <table>
            <thead>
              <tr>
                <th>路径</th>
                <th>版本时间</th>
                <th>大小</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {entries.flatMap(([relPath, vers]) =>
                (vers || []).map((v, i) => (
                  <tr key={`${relPath}-${i}-${pickVersionKey(v)}`}>
                    <td style={{ wordBreak: 'break-all', fontSize: '0.8rem' }}>{relPath}</td>
                    <td>
                      <code style={{ fontSize: '0.75rem' }}>{pickVersionKey(v)}</code>
                    </td>
                    <td>{formatBytes(v.size)}</td>
                    <td>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void restoreOne(relPath, pickVersionKey(v))}
                      >
                        <span className="btn-glyph" aria-hidden>
                          ⟲
                        </span>
                        还原此版本
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {entries.length === 0 && !err && <p className="muted">暂无历史版本。</p>}
        <div className="row" style={{ marginTop: '1rem' }}>
          <button type="button" disabled={busy} onClick={() => void load()}>
            <span className="btn-glyph" aria-hidden>
              ↻
            </span>
            刷新
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
  )
}

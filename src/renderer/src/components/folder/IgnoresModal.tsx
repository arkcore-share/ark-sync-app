import React, { useEffect, useState } from 'react'
import { useConnection } from '../../context/ConnectionContext'

export default function IgnoresModal({
  folderId,
  onClose
}: {
  folderId: string
  onClose: () => void
}): React.ReactElement {
  const { client } = useConnection()
  const [text, setText] = useState('')
  const [expanded, setExpanded] = useState<string[]>([])
  const [loadErr, setLoadErr] = useState<string | null>(null)
  const [saveErr, setSaveErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!client) {
      return
    }
    let cancelled = false
    void (async () => {
      setLoadErr(null)
      try {
        const r = await client.getDbIgnores(folderId)
        if (cancelled) {
          return
        }
        setText((r.ignore || []).join('\n'))
        setExpanded(r.expanded || [])
        if (r.error) {
          setLoadErr(r.error)
        }
      } catch (e) {
        if (!cancelled) {
          setLoadErr(e instanceof Error ? e.message : String(e))
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [client, folderId])

  const save = async () => {
    if (!client) {
      return
    }
    setBusy(true)
    setSaveErr(null)
    try {
      const lines = text.split('\n')
      await client.setDbIgnores(folderId, lines)
      onClose()
    } catch (e) {
      setSaveErr(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div className="modal" role="dialog" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '640px' }}>
        <h3>忽略规则 — {folderId}</h3>
        <p className="muted">每行一条模式，语法与 .stignore 相同。保存后立即生效。</p>
        {(loadErr || saveErr) && <div className="error-banner">{loadErr || saveErr}</div>}
        <div className="field">
          <label>.stignore 内容</label>
          <textarea
            rows={16}
            value={text}
            onChange={(e) => setText(e.target.value)}
            style={{ fontFamily: 'monospace', fontSize: '0.85rem' }}
          />
        </div>
        {expanded.length > 0 && (
          <details style={{ marginBottom: '1rem' }}>
            <summary>展开后的规则（只读）</summary>
            <pre className="muted" style={{ maxHeight: '160px', overflow: 'auto', fontSize: '0.75rem' }}>
              {expanded.join('\n')}
            </pre>
          </details>
        )}
        <div className="row" style={{ marginTop: '1rem' }}>
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
            取消
          </button>
        </div>
      </div>
    </div>
  )
}

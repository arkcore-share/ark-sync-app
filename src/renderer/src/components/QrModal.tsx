import React, { useEffect, useState } from 'react'
import { useConnection } from '../context/ConnectionContext'

export default function QrModal({
  deviceId,
  onClose
}: {
  deviceId: string
  onClose: () => void
}): React.ReactElement {
  const { client } = useConnection()
  const [src, setSrc] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    if (!client) {
      return
    }
    let cancelled = false
    void (async () => {
      setErr(null)
      setSrc(null)
      try {
        const url = await client.getQrDataUrl(deviceId)
        if (!cancelled) {
          setSrc(url)
        }
      } catch (e) {
        if (!cancelled) {
          setErr(e instanceof Error ? e.message : String(e))
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [client, deviceId])

  return (
    <div className="modal-backdrop qr-modal-layer" role="presentation" onClick={onClose}>
      <div className="modal" role="dialog" onClick={(e) => e.stopPropagation()}>
        <h3>设备二维码</h3>
        <p className="muted">
          <code style={{ fontSize: '0.75rem' }}>{deviceId}</code>
        </p>
        {err && <div className="error-banner">{err}</div>}
        {src && <img src={src} alt="Device QR" style={{ maxWidth: '100%', imageRendering: 'pixelated' }} />}
        <div className="row" style={{ marginTop: '1rem' }}>
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

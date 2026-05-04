import React from 'react'
import type { ConnectionEntry } from '../api/types'
import { rdConnType } from '../util/syncthingUi'

/** 与官方类似的连接强度：中继用点划样式，直连用竖条 */
export function ConnectionSignal({ conn }: { conn: ConnectionEntry | undefined }): React.ReactElement {
  const t = rdConnType(conn)
  const connected = !!conn?.connected
  let filled = 0
  let variant: 'bars' | 'relay' = 'bars'
  if (!connected) {
    filled = 0
  } else if (t.startsWith('relay')) {
    variant = 'relay'
    filled = t === 'relaylan' ? 3 : 2
  } else if (t.endsWith('lan')) {
    filled = 4
  } else if (t.endsWith('wan')) {
    filled = t.startsWith('tcp') ? 3 : 3
  } else {
    filled = 2
  }

  if (variant === 'relay') {
    return (
      <span className="conn-signal conn-signal-relay" title={conn?.type || ''} aria-hidden>
        {[0, 1, 2, 3].map((i) => (
          <span key={i} className={`conn-signal-relay-seg ${i < filled ? 'on' : ''}`} />
        ))}
      </span>
    )
  }

  return (
    <span className="conn-signal conn-signal-bars" title={conn?.type || ''} aria-hidden>
      {[0, 1, 2, 3].map((i) => (
        <span key={i} className={`conn-signal-bar ${i < filled ? 'on' : ''}`} />
      ))}
    </span>
  )
}

function StatIcon({ children, title }: { children: React.ReactNode; title: string }): React.ReactElement {
  return (
    <span className="local-state-icon" title={title} aria-hidden>
      {children}
    </span>
  )
}

/** 本机「本地状态 (总计)」右侧：文件 / 文件夹 / 磁盘 + 数值 */
export function LocalStateTotalStat({
  files,
  dirs,
  bytes,
  formatBytes,
  className
}: {
  files: number
  dirs: number
  bytes: number
  formatBytes: (n: number) => string
  className?: string
}): React.ReactElement {
  const size = `~${formatBytes(bytes)}`
  return (
    <span className={['local-state-stat', className].filter(Boolean).join(' ')}>
      <span className="local-state-stat-item">
        <StatIcon title="文件">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path
              d="M3 2h6l3 3v9H3V2z"
              stroke="currentColor"
              strokeWidth="1.2"
              fill="none"
              strokeLinejoin="round"
            />
            <path d="M9 2v4h3" stroke="currentColor" strokeWidth="1.2" fill="none" strokeLinejoin="round" />
          </svg>
        </StatIcon>
        <span>{files}</span>
      </span>
      <span className="local-state-sep">·</span>
      <span className="local-state-stat-item">
        <StatIcon title="目录">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path
              d="M2 4h4l1 1h7v9H2V4z"
              stroke="currentColor"
              strokeWidth="1.2"
              fill="none"
              strokeLinejoin="round"
            />
          </svg>
        </StatIcon>
        <span>{dirs}</span>
      </span>
      <span className="local-state-sep">·</span>
      <span className="local-state-stat-item">
        <StatIcon title="大小">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect x="2.5" y="3" width="11" height="10" rx="1" stroke="currentColor" strokeWidth="1.2" fill="none" />
            <path d="M5 6h6M5 9h4" stroke="currentColor" strokeWidth="1" strokeLinecap="round" />
          </svg>
        </StatIcon>
        <span>{size}</span>
      </span>
    </span>
  )
}

import React from 'react'

/** 总览占位页，后续可接统计、事件等 */
export default function SummaryPage(): React.ReactElement {
  return (
    <div>
      <h1 style={{ marginTop: 0 }}>总览</h1>
      <div className="card">
        <p className="muted" style={{ margin: 0 }}>
          此处将展示实例总览信息（同步概况、近期活动等）。当前为占位内容，后续版本接入。
        </p>
        <ul style={{ margin: '1rem 0 0', paddingLeft: '1.25rem', color: 'var(--muted)' }}>
          <li>连接与同步摘要</li>
          <li>告警与待处理项</li>
          <li>快捷入口</li>
        </ul>
      </div>
    </div>
  )
}

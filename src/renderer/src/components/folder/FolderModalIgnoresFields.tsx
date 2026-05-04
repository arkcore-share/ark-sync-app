import React from 'react'
import { IGNORE_GUIDE_ROWS } from './folderModalConstants'

export default function FolderModalIgnoresFields({
  mode,
  ignoresText = '',
  onIgnoresText,
  ignoresLoadErr = null,
  ignorePathDisplay,
  addIgnoreLater,
  onAddIgnoreLater
}: {
  mode: 'edit' | 'add'
  ignoresText?: string
  onIgnoresText?: (s: string) => void
  ignoresLoadErr?: string | null
  /** 底部「正在编辑 …/.stignore」展示路径（无则占位） */
  ignorePathDisplay: string
  addIgnoreLater?: boolean
  onAddIgnoreLater?: (v: boolean) => void
}): React.ReactElement {
  if (mode === 'add') {
    return (
      <div className="modal-tab-panel">
        <div className="field checkbox">
          <label>
            <input
              type="checkbox"
              checked={!!addIgnoreLater}
              onChange={(e) => onAddIgnoreLater?.(e.target.checked)}
            />
            添加忽略模式
          </label>
          <p className="field-help">
            只有在创建文件夹后才能添加忽略模式。勾选后，在保存后将显示用于设置忽略模式的输入框。
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="modal-tab-panel">
      <p className="field-help">请输入忽略模式，每行一条。</p>
      {ignoresLoadErr && <div className="error-banner">{ignoresLoadErr}</div>}
      <div className="field">
        <textarea
          className="folder-ignore-textarea"
          rows={10}
          value={ignoresText}
          onChange={(e) => onIgnoresText?.(e.target.value)}
          style={{ fontFamily: 'monospace', fontSize: '0.85rem' }}
        />
      </div>
      <hr className="folder-ignore-divider" />
      <div className="folder-ignore-guide-title">支持模式的快速指南 (完整文档):</div>
      <div className="folder-ignore-patterns">
        {IGNORE_GUIDE_ROWS.map((row) => (
          <div key={row.chip} className="folder-ignore-pattern-row">
            <span className="folder-pattern-chip">{row.chip}</span>
            <span>{row.text}</span>
          </div>
        ))}
      </div>
      <p className="folder-ignore-footer-note">正在编辑 {ignorePathDisplay}/.stignore。</p>
    </div>
  )
}

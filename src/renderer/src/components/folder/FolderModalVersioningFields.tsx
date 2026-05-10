import React from 'react'
import {
  STAGGERED_HELP_P1,
  STAGGERED_HELP_P1B,
  STAGGERED_HELP_P2,
  VERSIONING_DOC,
  VERSIONING_OPTIONS
} from './folderModalConstants'

export default function FolderModalVersioningFields({
  vType,
  onChangeType,
  simpleKeep,
  onSimpleKeep,
  trashDays,
  onTrashDays,
  staggerDays,
  onStaggerDays,
  staggerFsPath,
  onStaggerFsPath,
  cleanupIntervalS,
  onCleanupIntervalS,
  externalCmd,
  onExternalCmd
}: {
  vType: string
  onChangeType: (t: string) => void
  simpleKeep: number
  onSimpleKeep: (n: number) => void
  trashDays: number
  onTrashDays: (n: number) => void
  staggerDays: number
  onStaggerDays: (n: number) => void
  staggerFsPath: string
  onStaggerFsPath: (s: string) => void
  cleanupIntervalS: number
  onCleanupIntervalS: (n: number) => void
  externalCmd: string
  onExternalCmd: (s: string) => void
}): React.ReactElement {
  return (
    <div className="modal-tab-panel">
      <div className="field">
        <div className="folder-versioning-head">
          <label htmlFor="folder-versioning-type">文件版本控制</label>
        </div>
        <select
          id="folder-versioning-type"
          className="modal-field-select-full modal-field-input-full"
          value={vType}
          onChange={(e) => onChangeType(e.target.value)}
        >
          {VERSIONING_OPTIONS.map((o) => (
            <option key={o.value || 'off'} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
      {vType === 'simple' && (
        <>
          <p className="field-help">
            当 Ark Sync 替换或删除文件时，文件将移动到 .stversions 目录。保留最近若干份历史版本。
          </p>
          <div className="field">
            <label>保留版本数</label>
            <input
              type="number"
              min={0}
              className="modal-field-input-full"
              value={simpleKeep}
              onChange={(e) => onSimpleKeep(parseInt(e.target.value, 10) || 0)}
            />
          </div>
        </>
      )}
      {vType === 'trashcan' && (
        <>
          <p className="field-help">
            当 Ark Sync 替换或删除文件时，文件将移动到 .stversions 目录，并在超过保留天数后清理。
          </p>
          <div className="field">
            <label>清理天数</label>
            <input
              type="number"
              min={0}
              className="modal-field-input-full"
              value={trashDays}
              onChange={(e) => onTrashDays(parseInt(e.target.value, 10) || 0)}
            />
          </div>
        </>
      )}
      {vType === 'staggered' && (
        <>
          <p className="field-help folder-staggered-help">{STAGGERED_HELP_P1}</p>
          <p className="field-help folder-staggered-help">{STAGGERED_HELP_P1B}</p>
          <p className="field-help folder-staggered-help">{STAGGERED_HELP_P2}</p>
          <div className="field">
            <label>最长保留时间</label>
            <div className="input-with-suffix">
              <input
                type="number"
                min={0}
                className="input-with-suffix-input"
                value={staggerDays}
                onChange={(e) => onStaggerDays(Math.max(0, parseInt(e.target.value, 10) || 0))}
              />
              <span className="input-with-suffix-unit">天</span>
            </div>
            <p className="field-help">历史版本保留的最长天数，0 为永久保存。</p>
          </div>
          <div className="field">
            <label>历史版本路径</label>
            <input
              className="modal-field-input-full"
              value={staggerFsPath}
              onChange={(e) => onStaggerFsPath(e.target.value)}
              placeholder="留空则使用共享文件夹内 .stversions"
            />
            <p className="field-help">历史版本储存路径（留空则会默认存储在共享文件夹中的 .stversions 目录）。</p>
          </div>
          <div className="field">
            <label>清除间隔</label>
            <div className="input-with-suffix">
              <input
                type="number"
                min={0}
                className="input-with-suffix-input"
                value={cleanupIntervalS}
                onChange={(e) => onCleanupIntervalS(parseInt(e.target.value, 10) || 0)}
              />
              <span className="input-with-suffix-unit">秒</span>
            </div>
            <p className="field-help">在版本目录中运行清理的间隔（秒）。0 表示禁用定期清理。</p>
          </div>
        </>
      )}
      {vType === 'external' && (
        <div className="field">
          <p className="field-help">
            外部命令处理版本控制。必须从共享文件夹中移除文件。若路径含空格请用引号括起。
          </p>
          <label>外部命令</label>
          <input
            className="modal-field-input-full folder-versioning-external-cmd"
            value={externalCmd}
            onChange={(e) => onExternalCmd(e.target.value)}
          />
          <p className="field-help">
            有关受支持的模板命令行参数，请参阅{' '}
            <a className="link-btn" href={VERSIONING_DOC} target="_blank" rel="noopener noreferrer">
              外部版本控制帮助
            </a>
            。
          </p>
        </div>
      )}
    </div>
  )
}

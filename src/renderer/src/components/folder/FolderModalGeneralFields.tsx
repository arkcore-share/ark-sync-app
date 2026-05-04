import React from 'react'

export default function FolderModalGeneralFields({
  label,
  group,
  folderId,
  path,
  onLabel,
  onGroup,
  onFolderId,
  onPath,
  idReadOnly,
  pathTildeHint,
  onCopyId
}: {
  label: string
  group: string
  folderId: string
  path: string
  onLabel: (v: string) => void
  onGroup: (v: string) => void
  onFolderId: (v: string) => void
  onPath: (v: string) => void
  idReadOnly: boolean
  pathTildeHint: string
  onCopyId?: () => void
}): React.ReactElement {
  const hintPath = pathTildeHint || '/home'

  return (
    <div className="modal-tab-panel">
      <div className="field">
        <label>文件夹标签</label>
        <input className="modal-field-input-full" value={label} onChange={(e) => onLabel(e.target.value)} />
        <p className="field-help">文件夹的可选描述性标签。每个设备上可能不同。</p>
      </div>
      <div className="field">
        <label>文件夹组</label>
        <input className="modal-field-input-full" value={group} onChange={(e) => onGroup(e.target.value)} />
        <p className="field-help">文件夹的可选分组。各设备可设置不同分组。</p>
      </div>
      <div className="field">
        <label>文件夹 ID</label>
        {idReadOnly ? (
          <div className="device-id-row">
            <input value={folderId} readOnly disabled className="device-id-input modal-field-input-full" />
            {onCopyId && (
              <div className="device-id-actions">
                <button type="button" className="icon-btn" title="复制" onClick={() => onCopyId()}>
                  ⧉
                </button>
              </div>
            )}
          </div>
        ) : (
          <input className="modal-field-input-full" value={folderId} onChange={(e) => onFolderId(e.target.value)} />
        )}
        <p className="field-help">文件夹所需的标识符。所有集群设备上必须相同。</p>
      </div>
      <div className="field">
        <label>文件夹路径</label>
        <input
          className="modal-field-input-full"
          value={path}
          onChange={(e) => onPath(e.target.value)}
          placeholder="/home/me/Sync"
        />
        <p className="field-help">
          本地计算机上文件夹的路径。如果不存在，会创建它。波浪线符号 (~) 可用作下列项目的缩略符 <code>{hintPath}</code>。
        </p>
      </div>
    </div>
  )
}

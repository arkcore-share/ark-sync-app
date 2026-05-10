import React from 'react'
import type { FolderConfiguration } from '../../api/types'
import { folderTypeLabel, pullOrderLabel } from '../../util/syncthingUi'
import { MIN_DISK_UNITS, PULL_ORDERS, type MinDiskUnit } from './folderModalConstants'

export default function FolderModalAdvancedFields({
  fsWatcherEnabled,
  onFsWatcher,
  rescanIntervalS,
  onRescan,
  folderType,
  onFolderType,
  order,
  onOrder,
  minDiskNum,
  minDiskUnit,
  onMinDiskNum,
  onMinDiskUnit,
  syncOwnership,
  onSyncOwnership,
  sendOwnership,
  onSendOwnership,
  ignorePerms,
  onIgnorePerms,
  syncXattrs,
  onSyncXattrs,
  sendXattrs,
  onSendXattrs,
  blockIndexing,
  onBlockIndexing
}: {
  fsWatcherEnabled: boolean
  onFsWatcher: (v: boolean) => void
  rescanIntervalS: number
  onRescan: (n: number) => void
  folderType: FolderConfiguration['type']
  onFolderType: (t: FolderConfiguration['type']) => void
  order: string
  onOrder: (s: string) => void
  minDiskNum: string
  minDiskUnit: MinDiskUnit
  onMinDiskNum: (s: string) => void
  onMinDiskUnit: (u: MinDiskUnit) => void
  syncOwnership: boolean
  onSyncOwnership: (v: boolean) => void
  sendOwnership: boolean
  onSendOwnership: (v: boolean) => void
  ignorePerms: boolean
  onIgnorePerms: (v: boolean) => void
  syncXattrs: boolean
  onSyncXattrs: (v: boolean) => void
  sendXattrs: boolean
  onSendXattrs: (v: boolean) => void
  blockIndexing: boolean
  onBlockIndexing: (v: boolean) => void
}): React.ReactElement {
  return (
    <div className="modal-tab-panel folder-advanced-grid">
      <div className="folder-advanced-col">
        <div className="field checkbox">
          <label>扫描中</label>
          <label>
            <input type="checkbox" checked={fsWatcherEnabled} onChange={(e) => onFsWatcher(e.target.checked)} />
            监视更改
          </label>
          <p className="field-help">
            使用来自文件系统的通知来检测更改的项目。监视更改无需定期扫描即可发现大多数更改。
          </p>
        </div>
        <div className="field">
          <label>文件夹类型</label>
          <select
            className="modal-field-select-full modal-field-input-full"
            value={folderType}
            onChange={(e) => onFolderType(e.target.value as FolderConfiguration['type'])}
          >
            <option value="sendreceive">{folderTypeLabel('sendreceive')}</option>
            <option value="sendonly">{folderTypeLabel('sendonly')}</option>
            <option value="receiveonly">{folderTypeLabel('receiveonly')}</option>
            <option value="receiveencrypted">{folderTypeLabel('receiveencrypted')}</option>
          </select>
          <p className="field-help">只能在添加新文件夹时设置文件夹类型「接收加密」。</p>
        </div>
        <div className="field">
          <label>最低空闲磁盘空间</label>
          <div className="min-disk-row">
            <input
              type="text"
              inputMode="decimal"
              className="modal-field-input-full"
              value={minDiskNum}
              onChange={(e) => onMinDiskNum(e.target.value)}
            />
            <select value={minDiskUnit} onChange={(e) => onMinDiskUnit(e.target.value as MinDiskUnit)}>
              {MIN_DISK_UNITS.map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </select>
          </div>
          <p className="field-help">达到阈值时暂停同步；单位可为 % 或绝对容量。</p>
        </div>
        <div className="field">
          <label>所有权</label>
          <div className="field checkbox">
            <label>
              <input type="checkbox" checked={syncOwnership} onChange={(e) => onSyncOwnership(e.target.checked)} />
              同步所有权
            </label>
            <p className="field-help">
              启用发送所有权信息至其他设备，并应用传入的所有权信息。通常需要以更高的权限运行。
            </p>
          </div>
          <div className="field checkbox">
            <label>
              <input type="checkbox" checked={sendOwnership} onChange={(e) => onSendOwnership(e.target.checked)} />
              发送所有权
            </label>
            <p className="field-help">{'启用发送所有权信息至其他设备，但不应用传入的所有权信息。这可能会对性能产生重大影响。启用"同步所有权"时始终启用。'}</p>
          </div>
        </div>
        <div className="field checkbox">
          <label>
            <input type="checkbox" checked={blockIndexing} onChange={(e) => onBlockIndexing(e.target.checked)} />
            块索引
          </label>
          <p className="field-help">
            维护文件夹中所有块的索引，以便在同步更改时复用来自其他文件的块。禁用可减小数据库大小，但代价是无法跨文件复用块。
          </p>
        </div>
      </div>
      <div className="folder-advanced-col">
        <div className="field">
          <label>完全重新扫描间隔（秒）</label>
          <input
            type="number"
            min={0}
            className="modal-field-input-full"
            value={rescanIntervalS}
            onChange={(e) => onRescan(parseInt(e.target.value, 10) || 0)}
          />
        </div>
        <div className="field">
          <label>文件拉取顺序</label>
          <select className="modal-field-select-full modal-field-input-full" value={order} onChange={(e) => onOrder(e.target.value)}>
            {PULL_ORDERS.map((o) => (
              <option key={o} value={o}>
                {pullOrderLabel(o)}
              </option>
            ))}
          </select>
        </div>
        <div className="field checkbox">
          <label>
            <input type="checkbox" checked={ignorePerms} onChange={(e) => onIgnorePerms(e.target.checked)} />
            忽略权限
          </label>
          <p className="field-help">
            禁用比较和同步文件权限。适用于不存在或自定义权限的系统（例如 FAT、exFAT、Ark Sync、Android）。
          </p>
        </div>
        <div className="field">
          <label>扩展属性</label>
          <div className="field checkbox">
            <label>
              <input type="checkbox" checked={syncXattrs} onChange={(e) => onSyncXattrs(e.target.checked)} />
              同步扩展属性
            </label>
            <p className="field-help">
              启用发送扩展属性至其他设备，并应用传入的扩展属性。可能需要以更高的权限运行。
            </p>
          </div>
          <div className="field checkbox">
            <label>
              <input type="checkbox" checked={sendXattrs} onChange={(e) => onSendXattrs(e.target.checked)} />
              发送扩展属性
            </label>
            <p className="field-help">{'启用发送扩展属性至其他设备，但不应用传入的扩展属性。这可能会对性能产生重大影响。启用"同步扩展属性"时始终启用。'}</p>
          </div>
        </div>
      </div>
    </div>
  )
}

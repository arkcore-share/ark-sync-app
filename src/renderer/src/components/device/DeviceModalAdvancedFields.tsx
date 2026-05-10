import React from 'react'

export default function DeviceModalAdvancedFields({
  idPrefix,
  addressesText,
  onAddressesText,
  compression,
  onCompression,
  numConnections,
  onNumConnections,
  untrusted,
  onUntrusted,
  maxRecvKbps,
  onMaxRecvKbps,
  maxSendKbps,
  onMaxSendKbps
}: {
  idPrefix: string
  addressesText: string
  onAddressesText: (v: string) => void
  compression: string
  onCompression: (v: string) => void
  numConnections: number
  onNumConnections: (n: number) => void
  untrusted: boolean
  onUntrusted: (v: boolean) => void
  maxRecvKbps: number
  onMaxRecvKbps: (n: number) => void
  maxSendKbps: number
  onMaxSendKbps: (n: number) => void
}): React.ReactElement {
  const idAddr = `${idPrefix}-addresses`
  const idComp = `${idPrefix}-compression`
  const idConn = `${idPrefix}-num-connections`
  const idRecv = `${idPrefix}-max-recv`
  const idSend = `${idPrefix}-max-send`
  const idConnHeading = `${idPrefix}-conn-heading`
  const idRateHeading = `${idPrefix}-rate-heading`

  return (
    <div className="modal-tab-panel device-advanced-wrap">
      <div className="device-advanced-grid">
        <div className="device-advanced-col">
          <div className="field">
            <label htmlFor={idAddr}>地址</label>
            <textarea
              id={idAddr}
              className="modal-field-input-full device-addresses-textarea"
              rows={4}
              value={addressesText}
              onChange={(e) => onAddressesText(e.target.value)}
            />
            <p className="field-help">
              输入以半角逗号分隔的（&quot;tcp://ip:port&quot;, &quot;tcp://host:port&quot;）设备地址，或者输入
              &quot;dynamic&quot; 以自动发现设备地址。
            </p>
          </div>
        </div>
        <div className="device-advanced-col">
          <div className="field">
            <label htmlFor={idComp}>压缩</label>
            <select
              id={idComp}
              className="modal-field-input-full"
              value={compression}
              onChange={(e) => onCompression(e.target.value)}
            >
              <option value="metadata">仅元数据</option>
              <option value="always">全部数据</option>
              <option value="never">关闭</option>
            </select>
          </div>
        </div>
      </div>

      <div className="device-advanced-grid device-advanced-grid-row2">
        <div className="device-advanced-col">
          <section className="device-advanced-section" aria-labelledby={idConnHeading}>
            <h4 id={idConnHeading} className="device-advanced-section-heading">
              连接管理
            </h4>
            <div className="device-advanced-labelled-row">
              <label htmlFor={idConn} className="device-advanced-row-label">
                连接数
              </label>
              <input
                id={idConn}
                className="device-advanced-row-input"
                type="number"
                min={0}
                step={1}
                value={numConnections}
                onChange={(e) => onNumConnections(parseInt(e.target.value, 10) || 0)}
              />
            </div>
            <p className="field-help">
              当两台设备上的连接数均被设为大于 1 时，Ark Sync 会尝试建立多个并行连接。如果两台设备上的设置的连接数不同，则会使用最大的连接数。设为
              0 表示让 Ark Sync 自行决定。
            </p>
          </section>
        </div>
        <div className="device-advanced-col">
          <section className="device-advanced-section" aria-labelledby={idRateHeading}>
            <h4 id={idRateHeading} className="device-advanced-section-heading">
              设备速率限制
            </h4>
            <div className="device-advanced-labelled-row">
              <label htmlFor={idRecv} className="device-advanced-row-label">
                传入速率限制（KiB/s）
              </label>
              <input
                id={idRecv}
                className="device-advanced-row-input"
                type="number"
                min={0}
                step={1024}
                value={maxRecvKbps}
                onChange={(e) => onMaxRecvKbps(parseInt(e.target.value, 10) || 0)}
              />
            </div>
            <div className="device-advanced-labelled-row">
              <label htmlFor={idSend} className="device-advanced-row-label">
                传出速率限制（KiB/s）
              </label>
              <input
                id={idSend}
                className="device-advanced-row-input"
                type="number"
                min={0}
                step={1024}
                value={maxSendKbps}
                onChange={(e) => onMaxSendKbps(parseInt(e.target.value, 10) || 0)}
              />
            </div>
            <p className="field-help">速率限制适用于到此设备的所有连接的累积流量。</p>
            <p className="field-help">速率限制必须是非负数（0：无限制）。</p>
          </section>
        </div>
      </div>

      <div className="field checkbox device-advanced-untrusted">
        <label>
          <input type="checkbox" checked={untrusted} onChange={(e) => onUntrusted(e.target.checked)} />
          不受信任
        </label>
        <p className="field-help">
          与此设备共享的所有文件夹都必须有密码保护，这样所有发送的数据在没有密码的情况下是不可读的。
        </p>
      </div>
    </div>
  )
}

import React from 'react'
import type { DeviceModalTabId } from './deviceModalConstants'
import { DEVICE_MODAL_TABS } from './deviceModalConstants'

export default function DeviceModalTabStrip({
  tab,
  onTab
}: {
  tab: DeviceModalTabId
  onTab: (t: DeviceModalTabId) => void
}): React.ReactElement {
  return (
    <div className="modal-tabs">
      {DEVICE_MODAL_TABS.map(({ id, label, glyph }) => (
        <button
          type="button"
          key={id}
          className={`modal-tab ${tab === id ? 'modal-tab-active' : ''}`}
          onClick={() => onTab(id)}
        >
          <span className="modal-tab-glyph" aria-hidden>
            {glyph}
          </span>
          {label}
        </button>
      ))}
    </div>
  )
}

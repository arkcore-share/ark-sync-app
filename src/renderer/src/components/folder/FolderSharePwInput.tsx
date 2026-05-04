import React from 'react'

export default function FolderSharePwInput({
  value,
  onChange,
  visible,
  onToggleVisible,
  disabled = false,
  placeholder = '如果不受信任，请输入加密密码'
}: {
  value: string
  onChange: (v: string) => void
  visible: boolean
  onToggleVisible: () => void
  /** 为 true 时不写入，占位符仍可见（与官方「不共享」一致） */
  disabled?: boolean
  placeholder?: string
}): React.ReactElement {
  const inputType = disabled ? 'text' : visible ? 'text' : 'password'
  const showValue = disabled ? '' : value

  return (
    <div
      className={`folder-pw-input-wrap folder-pw-input-wrap-modal${disabled ? ' folder-pw-input-wrap-disabled' : ''}`}
    >
      <span className="folder-pw-prefix" aria-hidden title="加密">
        ⧐
      </span>
      <input
        type={inputType}
        autoComplete="new-password"
        disabled={disabled}
        placeholder={placeholder}
        value={showValue}
        onChange={(e) => onChange(e.target.value)}
      />
      <button
        type="button"
        className="folder-pw-suffix icon-btn"
        title={visible ? '隐藏' : '显示'}
        disabled={disabled}
        onClick={() => onToggleVisible()}
      >
        {visible ? '隐' : '显'}
      </button>
    </div>
  )
}

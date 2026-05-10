/** 主进程托盘 → 渲染进程（与 preload IPC 载荷一致） */
export type TrayCommand =
  | { type: 'navigate'; path: string }
  | { type: 'set-locale'; code: string }
  | { type: 'open-qr' }
  | { type: 'disconnect' }

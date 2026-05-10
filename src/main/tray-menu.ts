import { Menu, dialog } from 'electron'
import type { BrowserWindow } from 'electron'
import type { TrayCommand } from '../shared/trayCommand.js'
import { LOCALE_PICKER_OPTIONS } from '../renderer/src/i18n/syncthingLocales'

/** 与个人中心 / 简体界面一致 */
const T = {
  showMain: '显示主窗口',
  settings: '设置',
  advanced: '高级',
  language: '语言设置',
  help: '帮助',
  intro: '介绍',
  home: '主页',
  docs: '文档',
  support: '支持',
  changelog: '更新日志',
  stats: '统计',
  bugs: '问题反馈',
  source: '源代码',
  about: '关于',
  showQr: '显示二维码',
  quit: '退出',
  confirmShutdown: '确定要退出本软件吗？'
} as const

const HELP_LINKS: { label: string; url: string }[][] = [
  [{ label: T.intro, url: 'https://docs.syncthing.net/intro/getting-started.html' }],
  [
    { label: T.home, url: 'https://syncthing.net/' },
    { label: T.docs, url: 'https://docs.syncthing.net/' },
    { label: T.support, url: 'https://forum.syncthing.net/' }
  ],
  [
    { label: T.changelog, url: 'https://github.com/syncthing/syncthing/releases' },
    { label: T.stats, url: 'https://data.syncthing.net/' }
  ],
  [
    { label: T.bugs, url: 'https://github.com/syncthing/syncthing/issues' },
    { label: T.source, url: 'https://github.com/syncthing/syncthing' }
  ]
]

export function buildTrayContextMenu(opts: {
  /** 取当前主窗口（避免菜单创建时快照的 BrowserWindow 已销毁） */
  getMainWindow: () => BrowserWindow | null
  showMain: () => void
  sendCommand: (cmd: TrayCommand) => void
  openExternal: (url: string) => Promise<boolean>
  quitApp: () => void
}): Menu {
  const { getMainWindow, showMain, sendCommand, openExternal, quitApp } = opts

  const nav =
    (path: string) =>
    (): void => {
      showMain()
      sendCommand({ type: 'navigate', path })
    }

  const helpSubmenu: Electron.MenuItemConstructorOptions[] = []
  for (let gi = 0; gi < HELP_LINKS.length; gi++) {
    if (gi > 0) {
      helpSubmenu.push({ type: 'separator' })
    }
    for (const item of HELP_LINKS[gi]) {
      helpSubmenu.push({
        label: item.label,
        click: (): void => {
          void openExternal(item.url)
        }
      })
    }
  }
  helpSubmenu.push({ type: 'separator' }, { label: T.about, click: nav('/about') })

  const langSubmenu: Electron.MenuItemConstructorOptions[] = LOCALE_PICKER_OPTIONS.map((opt) => ({
    label: opt.label,
    click: (): void => {
      showMain()
      sendCommand({ type: 'set-locale', code: opt.code })
    }
  }))

  return Menu.buildFromTemplate([
    { label: T.showMain, click: (): void => showMain() },
    { type: 'separator' },
    { label: T.settings, click: nav('/settings') },
    { label: T.advanced, click: nav('/advanced') },
    { label: T.language, submenu: langSubmenu },
    { label: T.help, submenu: helpSubmenu },
    {
      label: T.showQr,
      click: (): void => {
        showMain()
        sendCommand({ type: 'open-qr' })
      }
    },
    { type: 'separator' },
    {
      label: T.quit,
      click: (): void => {
        const r = dialog.showMessageBoxSync(getMainWindow() ?? undefined, {
          type: 'question',
          buttons: ['取消', '确定'],
          defaultId: 1,
          cancelId: 0,
          title: 'Ark Sync',
          message: T.confirmShutdown
        })
        if (r !== 1) {
          return
        }
        quitApp()
      }
    }
  ])
}

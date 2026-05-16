import { Menu, dialog } from 'electron'
import type { BrowserWindow } from 'electron'
import type { TrayCommand } from '../shared/trayCommand.js'
import { LOCALE_PICKER_OPTIONS } from '../renderer/src/i18n/syncthingLocales'

const ARK_I18N_READY_LANGS = new Set(['zh-CN', 'zh-TW', 'zh-HK', 'en', 'es', 'fr', 'ja'])

type TrayI18n = {
  showMain: string
  settings: string
  advanced: string
  language: string
  moreLanguages: string
  unfinishedTag: string
  help: string
  intro: string
  home: string
  docs: string
  support: string
  changelog: string
  stats: string
  bugs: string
  source: string
  about: string
  showQr: string
  quit: string
  confirmShutdown: string
  cancel: string
  confirm: string
}

const TRAY_I18N_ZH_CN: TrayI18n = {
  showMain: '显示主窗口',
  settings: '设置',
  advanced: '高级',
  language: '语言设置',
  moreLanguages: '更多语言（未完成）',
  unfinishedTag: '（未完成）',
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
  confirmShutdown: '确定要退出本软件吗？',
  cancel: '取消',
  confirm: '确定'
}

const TRAY_I18N_ZH_TW: TrayI18n = {
  showMain: '顯示主視窗',
  settings: '設定',
  advanced: '進階',
  language: '語言設定',
  moreLanguages: '更多語言（未完成）',
  unfinishedTag: '（未完成）',
  help: '幫助',
  intro: '介紹',
  home: '主頁',
  docs: '文件',
  support: '支援',
  changelog: '更新日誌',
  stats: '統計',
  bugs: '問題回報',
  source: '原始碼',
  about: '關於',
  showQr: '顯示二維碼',
  quit: '退出',
  confirmShutdown: '確定要退出本軟體嗎？',
  cancel: '取消',
  confirm: '確定'
}

const TRAY_I18N_EN: TrayI18n = {
  showMain: 'Show Main Window',
  settings: 'Settings',
  advanced: 'Advanced',
  language: 'Language',
  moreLanguages: 'More Languages (Unfinished)',
  unfinishedTag: '(Unfinished)',
  help: 'Help',
  intro: 'Introduction',
  home: 'Home',
  docs: 'Documentation',
  support: 'Support',
  changelog: 'Changelog',
  stats: 'Statistics',
  bugs: 'Report Issues',
  source: 'Source Code',
  about: 'About',
  showQr: 'Show QR',
  quit: 'Quit',
  confirmShutdown: 'Quit the application?',
  cancel: 'Cancel',
  confirm: 'Confirm'
}

const TRAY_I18N_ES: TrayI18n = {
  showMain: 'Mostrar ventana principal',
  settings: 'Configuración',
  advanced: 'Avanzado',
  language: 'Idioma',
  moreLanguages: 'Más idiomas (sin terminar)',
  unfinishedTag: '(Sin terminar)',
  help: 'Ayuda',
  intro: 'Introducción',
  home: 'Inicio',
  docs: 'Documentación',
  support: 'Soporte',
  changelog: 'Registro de cambios',
  stats: 'Estadísticas',
  bugs: 'Reportar problemas',
  source: 'Código fuente',
  about: 'Acerca de',
  showQr: 'Mostrar QR',
  quit: 'Salir',
  confirmShutdown: '¿Salir de la aplicación?',
  cancel: 'Cancelar',
  confirm: 'Confirmar'
}

const TRAY_I18N_FR: TrayI18n = {
  showMain: 'Afficher la fenêtre principale',
  settings: 'Paramètres',
  advanced: 'Avancé',
  language: 'Langue',
  moreLanguages: 'Plus de langues (incomplet)',
  unfinishedTag: '(Incomplet)',
  help: 'Aide',
  intro: 'Introduction',
  home: 'Accueil',
  docs: 'Documentation',
  support: 'Support',
  changelog: 'Journal des changements',
  stats: 'Statistiques',
  bugs: 'Signaler un problème',
  source: 'Code source',
  about: 'À propos',
  showQr: 'Afficher le QR',
  quit: 'Quitter',
  confirmShutdown: 'Quitter l’application ?',
  cancel: 'Annuler',
  confirm: 'Confirmer'
}

const TRAY_I18N_JA: TrayI18n = {
  showMain: 'メインウィンドウを表示',
  settings: '設定',
  advanced: '詳細',
  language: '言語設定',
  moreLanguages: 'その他の言語（未完成）',
  unfinishedTag: '（未完成）',
  help: 'ヘルプ',
  intro: '紹介',
  home: 'ホーム',
  docs: 'ドキュメント',
  support: 'サポート',
  changelog: '変更履歴',
  stats: '統計',
  bugs: '不具合報告',
  source: 'ソースコード',
  about: 'このアプリについて',
  showQr: 'QRを表示',
  quit: '終了',
  confirmShutdown: 'アプリを終了しますか？',
  cancel: 'キャンセル',
  confirm: '確認'
}

function normalizeLang(code: string): string {
  return code.trim().toLowerCase().replace(/_/g, '-')
}

function resolveTrayI18n(lng: string): TrayI18n {
  const n = normalizeLang(lng)
  if (n === 'zh-cn') {
    return TRAY_I18N_ZH_CN
  }
  if (n === 'zh-tw' || n === 'zh-hk') {
    return TRAY_I18N_ZH_TW
  }
  if (n === 'es') {
    return TRAY_I18N_ES
  }
  if (n === 'fr') {
    return TRAY_I18N_FR
  }
  if (n === 'ja') {
    return TRAY_I18N_JA
  }
  return TRAY_I18N_EN
}

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
  locale: string
}): Menu {
  const { getMainWindow, showMain, sendCommand, openExternal, quitApp, locale } = opts
  const T = resolveTrayI18n(locale)

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

  const readyLangs = LOCALE_PICKER_OPTIONS.filter((opt) => ARK_I18N_READY_LANGS.has(opt.code))
  const pendingLangs = LOCALE_PICKER_OPTIONS.filter((opt) => !ARK_I18N_READY_LANGS.has(opt.code))
  const langSubmenu: Electron.MenuItemConstructorOptions[] = readyLangs.map((opt) => ({
    label: opt.label,
    click: (): void => {
      showMain()
      sendCommand({ type: 'set-locale', code: opt.code })
    }
  }))
  if (pendingLangs.length > 0) {
    langSubmenu.push({
      type: 'separator'
    })
    langSubmenu.push({
      label: T.moreLanguages,
      submenu: pendingLangs.map((opt) => ({
        label: `${opt.label} ${T.unfinishedTag}`,
        enabled: false
      }))
    })
  }

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
          buttons: [T.cancel, T.confirm],
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

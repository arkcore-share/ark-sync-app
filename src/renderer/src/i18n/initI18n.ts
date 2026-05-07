import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import {
  SYN_LANG_STORAGE_KEY,
  isValidSyncthingLang,
  pickLocaleFromBrowserLangs,
  readHashLangParam
} from './syncthingLocales'

const synLoaders = import.meta.glob<{ default: Record<string, string> }>('./syncthing/lang-*.json')
const arkLoaders = import.meta.glob<{ default: Record<string, string> }>('./ark/ark-*.json')

function mergeBundles(syn: Record<string, string>, ark: Record<string, string>): Record<string, string> {
  return { ...syn, ...ark }
}

async function loadSyncthing(lng: string): Promise<Record<string, string>> {
  const path = `./syncthing/lang-${lng}.json`
  const load = synLoaders[path]
  if (!load) {
    throw new Error(`Missing Syncthing bundle: ${path}`)
  }
  const mod = await load()
  return mod.default
}

async function loadArk(lng: string): Promise<Record<string, string>> {
  const paths: string[] = [`./ark/ark-${lng}.json`]
  /* 繁体等无独立 ark 文件时，用简体 Ark 覆盖英文，避免侧栏/个人中心中英混杂 */
  if (lng.startsWith('zh-') && lng !== 'zh-CN') {
    paths.push('./ark/ark-zh-CN.json')
  }
  paths.push('./ark/ark-en.json')
  for (const p of paths) {
    const load = arkLoaders[p]
    if (load) {
      return (await load()).default
    }
  }
  return {}
}

export async function ensureLanguageLoaded(lng: string): Promise<void> {
  const syn = await loadSyncthing(lng)
  const ark = await loadArk(lng)
  const merged = mergeBundles(syn, ark)
  /* 每次切换都重建 bundle：避免仅 hasResourceBundle 短路导致旧合并或与 i18next 内部状态不一致 */
  if (i18n.hasResourceBundle(lng, 'translation')) {
    i18n.removeResourceBundle(lng, 'translation')
  }
  i18n.addResourceBundle(lng, 'translation', merged, true, true)
}

export function resolveInitialLocale(): string {
  const hashLang = readHashLangParam()
  if (hashLang && isValidSyncthingLang(hashLang)) {
    return hashLang
  }
  try {
    const stored = localStorage.getItem(SYN_LANG_STORAGE_KEY)?.trim()
    if (stored && isValidSyncthingLang(stored)) {
      return stored
    }
  } catch {
    /* ignore */
  }
  const navLangs =
    typeof navigator !== 'undefined'
      ? navigator.languages?.length
        ? navigator.languages
        : [navigator.language]
      : ['en']
  return pickLocaleFromBrowserLangs(navLangs)
}

let initPromise: Promise<void> | null = null

export function initI18n(): Promise<void> {
  if (!initPromise) {
    initPromise = (async () => {
      const lng = resolveInitialLocale()
      await i18n.use(initReactI18next).init({
        lng: 'en',
        fallbackLng: 'en',
        interpolation: { escapeValue: false },
        react: {
          useSuspense: false,
          bindI18n: 'languageChanged',
          bindI18nStore: 'added removed'
        }
      })
      await ensureLanguageLoaded('en')
      if (lng !== 'en') {
        await ensureLanguageLoaded(lng)
      }
      await i18n.changeLanguage(lng)
      document.documentElement.lang = lng
    })()
  }
  return initPromise
}

export async function applySyncthingLocale(lng: string, persist: boolean): Promise<void> {
  if (!isValidSyncthingLang(lng)) {
    return
  }
  await ensureLanguageLoaded('en')
  if (lng !== 'en') {
    await ensureLanguageLoaded(lng)
  }
  await i18n.changeLanguage(lng)
  document.documentElement.lang = lng
  if (persist) {
    try {
      localStorage.setItem(SYN_LANG_STORAGE_KEY, lng)
    } catch {
      /* ignore */
    }
  }
}

export { i18n }

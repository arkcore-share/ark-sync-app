import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import { setTrayLocale } from '../electronBridge'
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
    throw new Error(`Missing GUI locale bundle: ${path}`)
  }
  const mod = await load()
  return mod.default
}

async function loadArk(lng: string): Promise<Record<string, string>> {
  let merged: Record<string, string> = {}
  const en = arkLoaders['./ark/ark-en.json']
  if (en) {
    merged = { ...merged, ...(await en()).default }
  }
  if (lng.startsWith('zh-') && lng !== 'zh-CN') {
    const zh = arkLoaders['./ark/ark-zh-CN.json']
    if (zh) {
      merged = { ...merged, ...(await zh()).default }
    }
  }
  const local = arkLoaders[`./ark/ark-${lng}.json`]
  if (local) {
    merged = { ...merged, ...(await local()).default }
  }
  return merged
}

export async function ensureLanguageLoaded(lng: string): Promise<void> {
  const syn = await loadSyncthing(lng)
  const ark = await loadArk(lng)
  const merged = mergeBundles(syn, ark)
  /* 姣忔鍒囨崲閮介噸寤?bundle锛氶伩鍏嶄粎 hasResourceBundle 鐭矾瀵艰嚧鏃у悎骞舵垨涓?i18next 鍐呴儴鐘舵€佷笉涓€鑷?*/
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
      void setTrayLocale(lng)
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
  void setTrayLocale(lng)
  if (persist) {
    try {
      localStorage.setItem(SYN_LANG_STORAGE_KEY, lng)
    } catch {
      /* ignore */
    }
  }
}

export { i18n }




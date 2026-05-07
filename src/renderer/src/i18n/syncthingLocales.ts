/** 与官网 `gui/default/assets/lang/valid-langs.js` 一致 */
export const SYNCTHING_VALID_LANGS = [
  'ar',
  'bg',
  'ca',
  'ca@valencia',
  'cs',
  'da',
  'de',
  'el',
  'en',
  'en-GB',
  'eo',
  'es',
  'eu',
  'fil',
  'fr',
  'fy',
  'ga',
  'gl',
  'he-IL',
  'hi',
  'hr',
  'hu',
  'id',
  'it',
  'ja',
  'ko-KR',
  'lt',
  'nl',
  'pl',
  'pt-BR',
  'pt-PT',
  'ro-RO',
  'ru',
  'sk',
  'sl',
  'sv',
  'tr',
  'uk',
  'zh-CN',
  'zh-HK',
  'zh-TW'
] as const

export type SyncthingLang = (typeof SYNCTHING_VALID_LANGS)[number]

/** 与官网 `gui/default/assets/lang/prettyprint.js` 一致（展示名用英文，排序友好） */
export const LOCALE_DISPLAY_NAMES: Record<string, string> = {
  ar: 'Arabic',
  bg: 'Bulgarian',
  ca: 'Catalan',
  'ca@valencia': 'Valencian',
  cs: 'Czech',
  da: 'Danish',
  de: 'German',
  el: 'Greek',
  en: 'English',
  'en-GB': 'English (United Kingdom)',
  eo: 'Esperanto',
  es: 'Spanish',
  eu: 'Basque',
  fil: 'Filipino',
  fr: 'French',
  fy: 'Frisian',
  ga: 'Irish',
  gl: 'Galician',
  'he-IL': 'Hebrew (Israel)',
  hi: 'Hindi',
  hr: 'Croatian',
  hu: 'Hungarian',
  id: 'Indonesian',
  it: 'Italian',
  ja: 'Japanese',
  'ko-KR': 'Korean',
  lt: 'Lithuanian',
  nl: 'Dutch',
  pl: 'Polish',
  'pt-BR': 'Portuguese (Brazil)',
  'pt-PT': 'Portuguese (Portugal)',
  'ro-RO': 'Romanian',
  ru: 'Russian',
  sk: 'Slovak',
  sl: 'Slovenian',
  sv: 'Swedish',
  tr: 'Turkish',
  uk: 'Ukrainian',
  'zh-CN': 'Chinese (Simplified Han script)',
  'zh-HK': 'Chinese (Traditional Han script, Hong Kong)',
  'zh-TW': 'Chinese (Traditional Han script)'
}

/**
 * 语言选择器用本族文字展示（与常见产品一致：不懂当前界面语言也能认出母语）。
 * 未单独列出时回退到 {@link LOCALE_DISPLAY_NAMES}。
 */
export const LOCALE_NATIVE_LABELS: Record<string, string> = {
  ar: 'العربية',
  bg: 'Български',
  ca: 'Català',
  'ca@valencia': 'Valencià',
  cs: 'Čeština',
  da: 'Dansk',
  de: 'Deutsch',
  el: 'Ελληνικά',
  en: 'English',
  'en-GB': 'English (UK)',
  eo: 'Esperanto',
  es: 'Español',
  eu: 'Euskara',
  fil: 'Filipino',
  fr: 'Français',
  fy: 'Frysk',
  ga: 'Gaeilge',
  gl: 'Galego',
  'he-IL': 'עברית',
  hi: 'हिन्दी',
  hr: 'Hrvatski',
  hu: 'Magyar',
  id: 'Bahasa Indonesia',
  it: 'Italiano',
  ja: '日本語',
  'ko-KR': '한국어',
  lt: 'Lietuvių',
  nl: 'Nederlands',
  pl: 'Polski',
  'pt-BR': 'Português (Brasil)',
  'pt-PT': 'Português (Portugal)',
  'ro-RO': 'Română',
  ru: 'Русский',
  sk: 'Slovenčina',
  sl: 'Slovenščina',
  sv: 'Svenska',
  tr: 'Türkçe',
  uk: 'Українська',
  'zh-CN': '简体中文',
  'zh-HK': '繁體中文（香港）',
  'zh-TW': '繁體中文'
}

export function getLocalePickerLabel(code: string): string {
  return LOCALE_NATIVE_LABELS[code] ?? LOCALE_DISPLAY_NAMES[code] ?? code
}

/** 语言下拉项：已按本族名称排序（多文种混排用 Unicode 默认排序） */
export const LOCALE_PICKER_OPTIONS: { code: SyncthingLang; label: string }[] = [...SYNCTHING_VALID_LANGS]
  .map((code) => ({ code, label: getLocalePickerLabel(code) }))
  .sort((a, b) => a.label.localeCompare(b.label, 'und', { sensitivity: 'base' }))

/** 与 Syncthing Web GUI `LocaleService` 相同 */
export const SYN_LANG_STORAGE_KEY = 'SYN_LANG'

export function isValidSyncthingLang(code: string): code is SyncthingLang {
  return (SYNCTHING_VALID_LANGS as readonly string[]).includes(code)
}

/**
 * 与官网 `localeService.js` 中 `readBrowserLocales` 成功分支的匹配规则一致：
 * `possibleLang` 小写后与浏览器语言前缀匹配。
 */
export function pickLocaleFromBrowserLangs(
  browserLangs: readonly string[],
  available: readonly string[] = SYNCTHING_VALID_LANGS,
  fallback = 'en'
): string {
  for (const raw of browserLangs) {
    const browserLang = raw.trim().toLowerCase()
    if (browserLang.length < 2) {
      continue
    }
    const matching = available.filter((possibleLang) => {
      const pl = possibleLang.toLowerCase()
      if (!pl.startsWith(browserLang)) {
        return false
      }
      if (pl.length > browserLang.length) {
        return pl[browserLang.length] === '-'
      }
      return true
    })
    if (matching.length >= 1) {
      return matching[0]
    }
  }
  return fallback
}

export function readHashLangParam(): string | null {
  const raw = window.location.hash.replace(/^#/, '')
  const q = raw.indexOf('?')
  if (q < 0) {
    return null
  }
  const v = new URLSearchParams(raw.slice(q)).get('lang')
  return v?.trim() || null
}

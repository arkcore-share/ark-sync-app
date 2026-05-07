/** 与 Syncthing 官方 GUI `syncthing/core/syncthingController.js` 中 `inputTypeFor` 一致 */

export type InputFieldType = 'skip' | 'null' | 'number' | 'checkbox' | 'list' | 'text'

export function inputTypeFor(key: string, value: unknown): InputFieldType {
  if (key.startsWith('_')) {
    return 'skip'
  }
  if (value === null) {
    return 'null'
  }
  if (typeof value === 'number') {
    return 'number'
  }
  if (typeof value === 'boolean') {
    return 'checkbox'
  }
  if (Array.isArray(value)) {
    if (
      value.some((element) => typeof element !== 'number' && typeof element !== 'string')
    ) {
      return 'skip'
    }
    return 'list'
  }
  if (typeof value === 'object') {
    return 'skip'
  }
  return 'text'
}

/** 与官方 `uncamel` filter（uncamelFilter.js）一致的标签展示 */
const RESERVED = [
  'IDs',
  'ID',
  'URL',
  'UR',
  'API',
  'QUIC',
  'TCP',
  'UDP',
  'NAT',
  'LAN',
  'WAN',
  'KiB',
  'MiB',
  'GiB',
  'TiB'
]

export function uncamelLabel(input: string): string {
  if (!input || typeof input !== 'string') {
    return ''
  }
  const placeholders: Record<string, string> = {}
  let counter = 0
  let s = input
  for (const word of RESERVED) {
    const placeholder = `__RSV${counter}__`
    s = s.replace(new RegExp(word, 'g'), placeholder)
    placeholders[placeholder] = word
    counter++
  }
  s = s.replace(/([a-z0-9])([A-Z])/g, '$1 $2')
  for (const [ph, word] of Object.entries(placeholders)) {
    s = s.replace(new RegExp(ph, 'g'), ` ${word} `)
  }
  const parts = s.split(' ')
  const lastPart = parts.pop()
  if (lastPart === undefined) {
    return ''
  }
  switch (lastPart) {
    case 'S':
      parts.push('(seconds)')
      break
    case 'M':
      parts.push('(minutes)')
      break
    case 'H':
      parts.push('(hours)')
      break
    case 'Ms':
      parts.push('(milliseconds)')
      break
    default:
      parts.push(lastPart)
      break
  }
  const mapped = parts.map((part) => {
    const match = RESERVED.find((w) => w.toUpperCase() === part.toUpperCase())
    return match || part.charAt(0).toUpperCase() + part.slice(1)
  })
  return mapped.join(' ').replace(/\s+/g, ' ').trim()
}

/** app.js `deviceCompare` */
export function deviceCompare(
  a: { name?: string; deviceID?: string },
  b: { name?: string; deviceID?: string }
): number {
  if (typeof a.name !== 'undefined' && typeof b.name !== 'undefined') {
    if (a.name < b.name) {
      return -1
    }
    return a.name > b.name ? 1 : 0
  }
  const aid = a.deviceID ?? ''
  const bid = b.deviceID ?? ''
  if (aid < bid) {
    return -1
  }
  return aid > bid ? 1 : 0
}

/** app.js `folderCompare` */
export function folderCompare(
  a: { id: string; label?: string },
  b: { id: string; label?: string }
): number {
  let labelA = a.id
  if (typeof a.label !== 'undefined' && a.label !== null && a.label.length > 0) {
    labelA = a.label
  }
  let labelB = b.id
  if (typeof b.label !== 'undefined' && b.label !== null && b.label.length > 0) {
    labelB = b.label
  }
  if (labelA < labelB) {
    return -1
  }
  return labelA > labelB ? 1 : 0
}

export function docsConfigOptionUrl(section: string, key: string): string {
  const k = key.toLowerCase()
  return `https://docs.syncthing.net/users/config#config-option-${section}.${k}`
}

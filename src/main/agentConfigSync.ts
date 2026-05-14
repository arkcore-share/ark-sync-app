import {
  copyFileSync,
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync
} from 'node:fs'
import { createHash } from 'node:crypto'
import { homedir } from 'node:os'
import { basename, dirname, extname, isAbsolute, join, relative, resolve } from 'node:path'
import { parse as parseToml } from 'toml'
import { listAgentArtifactsDetails } from './agentArtifactsScan.js'
import type { AgentArtifactEntry } from '../shared/agentArtifactsTypes.js'

export type AgentConfigSyncResult = {
  ok: boolean
  mode: 'synced' | 'local_scan_only'
  message: string
  relayRoot: string | null
  runId: string | null
  reportDir: string | null
  dryRun: boolean
  copiedToLocal: number
  copiedToRelay: number
  conflicts: number
  skipped: number
  errors: string[]
}

export type AgentConfigSyncScanResult = {
  hasRelayContent: boolean
  relayRoot: string | null
  syncTmpRoot: string
}

export type AgentConfigSyncRollbackResult = {
  ok: boolean
  runId: string
  restoredLocal: number
  restoredRelay: number
  errors: string[]
}

type SyncOptions = {
  dryRun?: boolean
}

type SnapshotEntry = {
  side: 'local' | 'relay'
  path: string
  exists: boolean
  kind: 'file' | 'dir' | 'missing'
}

type Mapping = {
  name: string
  localPath: string
  relayCandidates: string[]
  kind: 'dir' | 'file'
}

type Tally = {
  copiedToLocal: number
  copiedToRelay: number
  conflicts: number
  skipped: number
  errors: string[]
}

type OperationAction = 'copy_to_local' | 'copy_to_relay' | 'conflict_copy' | 'overwrite_from_newer' | 'skip' | 'mkdir' | 'merge'

type OperationRecord = {
  action: OperationAction
  relPath: string
  from?: string
  to?: string
  note?: string
}

type ConflictRecord = {
  relPath: string
  localPath: string
  relayPath: string
  newerSide: 'local' | 'relay'
  localHash: string
  relayHash: string
  conflictCopyPath: string
  strategy: string
}

type JsonLike = null | boolean | number | string | JsonLike[] | { [key: string]: JsonLike }

function isIgnoredName(name: string): boolean {
  const n = name.toLowerCase()
  return (
    name === '.git' ||
    name === 'node_modules' ||
    name === '_agent_sync_runs' ||
    name === 'tmp' ||
    name === '.DS_Store' ||
    name.endsWith('.lock') ||
    n.includes('.conflict-') ||
    n === 'sync-report.json' ||
    n === 'conflicts-manifest.json' ||
    n === 'operations.log' ||
    n === 'snapshot-manifest.json'
  )
}

function listRelayRootCandidates(syncTmpRoot: string): string[] {
  if (!existsSync(syncTmpRoot) || !lstatSync(syncTmpRoot).isDirectory()) {
    return []
  }
  const out = new Set<string>()
  const queue: Array<{ p: string; depth: number }> = [{ p: syncTmpRoot, depth: 0 }]
  const maxDepth = 4
  while (queue.length > 0) {
    const cur = queue.shift()
    if (!cur) {
      continue
    }
    let ents: string[]
    try {
      ents = readdirSync(cur.p)
    } catch {
      continue
    }
    const names = new Set(ents)
    const hasAny =
      names.has('.claude') || names.has('.openclaw') || names.has('hermes') || names.has('.hermes') || names.has('.clauderc')
    if (hasAny) {
      out.add(cur.p)
    }
    if (cur.depth >= maxDepth) {
      continue
    }
    for (const name of ents) {
      if (isIgnoredName(name)) {
        continue
      }
      const child = join(cur.p, name)
      try {
        if (lstatSync(child).isDirectory()) {
          queue.push({ p: child, depth: cur.depth + 1 })
        }
      } catch {
        /* ignore */
      }
    }
  }
  return [...out]
}

function scoreRelayRoot(root: string): number {
  let score = 0
  const must = ['.claude', '.openclaw', '.clauderc']
  for (const name of must) {
    if (existsSync(join(root, name))) {
      score += 2
    }
  }
  if (existsSync(join(root, 'hermes')) || existsSync(join(root, '.hermes'))) {
    score += 2
  }
  return score
}

function findRelayRoot(syncTmpRoot: string): string | null {
  const candidates = listRelayRootCandidates(syncTmpRoot)
  if (candidates.length === 0) {
    return null
  }
  const scored = candidates
    .map((p) => ({ p, score: scoreRelayRoot(p), depth: relative(syncTmpRoot, p).split(/[\\/]/).filter(Boolean).length }))
    .sort((a, b) => {
      if (b.score !== a.score) {
        return b.score - a.score
      }
      return a.depth - b.depth
    })
  return scored[0]?.p ?? null
}

function resolveRelayPath(candidates: string[]): string {
  const existing = candidates.filter((p) => existsSync(p))
  if (existing.length === 1) {
    return existing[0]
  }
  if (existing.length >= 2) {
    const hidden = existing.find((p) => basename(p) === '.hermes')
    return hidden ?? existing[0]
  }
  return candidates[0]
}

function buildRelayCandidatesForLocalPath(relayRoot: string, localPath: string): string[] {
  const home = homedir()
  const out: string[] = []
  const localNorm = resolve(localPath).replace(/\\/g, '/')
  const homeNorm = resolve(home).replace(/\\/g, '/')
  if (isAbsolute(localPath) && (localNorm === homeNorm || localNorm.startsWith(`${homeNorm}/`))) {
    const rel = relative(home, localPath)
    out.push(join(relayRoot, rel))
    if (rel === '.hermes' || rel.startsWith('.hermes/')) {
      const rest = rel.slice('.hermes'.length)
      out.push(join(relayRoot, `hermes${rest}`))
    } else if (rel === 'hermes' || rel.startsWith('hermes/')) {
      const rest = rel.slice('hermes'.length)
      out.push(join(relayRoot, `.hermes${rest}`))
    }
  } else {
    out.push(join(relayRoot, ...absPathToBackupSegments(localPath)))
  }
  return [...new Set(out)]
}

function buildScopedMappings(relayRoot: string): Mapping[] {
  const details = listAgentArtifactsDetails({ force: true }).filter(
    (d) => d.installed && (d.skills.length > 0 || d.memory.length > 0 || d.files.length > 0)
  )
  const all: Mapping[] = []
  const seen = new Set<string>()
  const addEntry = (id: string, e: AgentArtifactEntry): void => {
    const localPath = resolve(e.path)
    if (!isAbsolute(localPath)) {
      return
    }
    const dedupeKey = `${e.kind}:${localPath}`
    if (seen.has(dedupeKey)) {
      return
    }
    seen.add(dedupeKey)
    all.push({
      name: `${id}:${e.label}`,
      localPath,
      relayCandidates: buildRelayCandidatesForLocalPath(relayRoot, localPath),
      kind: e.kind === 'dir' ? 'dir' : 'file'
    })
  }
  for (const d of details) {
    for (const e of [...d.skills, ...d.memory, ...d.files]) {
      addEntry(d.id, e)
    }
  }
  return all
}

function ensureParent(p: string): void {
  mkdirSync(dirname(p), { recursive: true })
}

/**
 * Convert an absolute path to portable relative segments for backup storage.
 * This avoids Windows absolute path semantics overriding join(backupRoot, ...).
 */
function absPathToBackupSegments(absPath: string): string[] {
  const resolved = resolve(absPath)
  if (process.platform === 'win32') {
    let raw = resolved.replace(/^\\\\\?\\/, '')
    if (/^unc\\/i.test(raw)) {
      const rest = raw.slice(4)
      return ['__unc', ...rest.split(/\\+/).filter(Boolean)]
    }
    if (raw.startsWith('\\\\')) {
      return ['__unc', ...raw.slice(2).split(/\\+/).filter(Boolean)]
    }
    const driveMatch = /^([a-zA-Z]):([\\/]|$)/.exec(raw)
    if (driveMatch) {
      const drive = driveMatch[1].toUpperCase()
      const rest = raw.slice(2).replace(/^[\\/]+/, '')
      const parts = rest.split(/\\+/).filter(Boolean)
      return [drive, ...parts]
    }
  }
  const posix = resolved.replace(/\\/g, '/')
  const withoutLeadingSlash = posix.startsWith('/') ? posix.slice(1) : posix
  return withoutLeadingSlash.split('/').filter(Boolean)
}

function hashFile(abs: string): string {
  const buf = readFileSync(abs)
  return createHash('sha256').update(buf).digest('hex')
}

function readText(abs: string): string {
  return readFileSync(abs, 'utf8')
}

function ext(abs: string): string {
  return extname(abs).toLowerCase()
}

function looksLikeBinary(abs: string): boolean {
  const e = ext(abs)
  if (!e) {
    return false
  }
  const textLike = new Set(['.json', '.jsonl', '.txt', '.md', '.yaml', '.yml', '.toml', '.conf', '.ini', '.env'])
  return !textLike.has(e)
}

function isHighRiskRuntimePath(relPath: string): boolean {
  const p = relPath.replaceAll('\\', '/').toLowerCase()
  if (p.includes('/sessions/') || p.startsWith('sessions/')) return true
  if (p.includes('/cache/') || p.startsWith('cache/')) return true
  if (p.includes('/logs/') || p.startsWith('logs/')) return true
  return p.endsWith('.sqlite') || p.includes('.sqlite.') || p.endsWith('.db') || p.endsWith('.wal') || p.endsWith('.shm')
}

function normalizeForJsonLike(value: unknown): JsonLike {
  if (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value
  if (Array.isArray(value)) return value.map((v) => normalizeForJsonLike(v))
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>
    const out: Record<string, JsonLike> = {}
    for (const [k, v] of Object.entries(obj)) {
      out[k] = normalizeForJsonLike(v)
    }
    return out
  }
  return String(value)
}

function deepMergeValues(localValue: JsonLike, relayValue: JsonLike): JsonLike {
  if (Array.isArray(localValue) && Array.isArray(relayValue)) {
    const seen = new Set<string>()
    const out: JsonLike[] = []
    for (const item of [...localValue, ...relayValue]) {
      const key = JSON.stringify(item)
      if (!seen.has(key)) {
        seen.add(key)
        out.push(item)
      }
    }
    return out
  }
  if (
    localValue != null &&
    relayValue != null &&
    typeof localValue === 'object' &&
    typeof relayValue === 'object' &&
    !Array.isArray(localValue) &&
    !Array.isArray(relayValue)
  ) {
    const l = localValue as Record<string, JsonLike>
    const r = relayValue as Record<string, JsonLike>
    const out: Record<string, JsonLike> = {}
    const keys = new Set<string>([...Object.keys(l), ...Object.keys(r)])
    for (const key of keys) {
      const hasL = Object.prototype.hasOwnProperty.call(l, key)
      const hasR = Object.prototype.hasOwnProperty.call(r, key)
      if (hasL && !hasR) {
        out[key] = l[key]
      } else if (!hasL && hasR) {
        out[key] = r[key]
      } else {
        const lv = l[key]
        const rv = r[key]
        if (JSON.stringify(lv) === JSON.stringify(rv)) {
          out[key] = lv
        } else {
          const bothObj =
            lv != null &&
            rv != null &&
            typeof lv === 'object' &&
            typeof rv === 'object' &&
            (Array.isArray(lv) === Array.isArray(rv))
          if (bothObj) {
            out[key] = deepMergeValues(lv, rv)
          } else {
            out[`${key}__local`] = lv
            out[`${key}__sync_tmp`] = rv
          }
        }
      }
    }
    return out
  }
  if (JSON.stringify(localValue) === JSON.stringify(relayValue)) {
    return localValue
  }
  return {
    value__local: localValue,
    value__sync_tmp: relayValue
  } as unknown as JsonLike
}

function isPrimitiveTomlValue(v: JsonLike): v is string | number | boolean {
  return typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean'
}

function escapeTomlString(v: string): string {
  return `"${v.replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"`
}

function formatTomlPrimitive(v: string | number | boolean): string {
  if (typeof v === 'string') return escapeTomlString(v)
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : '0'
  return v ? 'true' : 'false'
}

function isTomlPrimitiveArray(v: JsonLike): v is Array<string | number | boolean> {
  return Array.isArray(v) && v.every((item) => isPrimitiveTomlValue(item))
}

function formatTomlPrimitiveArray(arr: Array<string | number | boolean>): string {
  return `[${arr.map((v) => formatTomlPrimitive(v)).join(', ')}]`
}

function tomlKeyPath(pathParts: string[]): string {
  return pathParts.join('.')
}

function toTomlDocument(root: JsonLike): string {
  if (root == null || typeof root !== 'object' || Array.isArray(root)) {
    return '# merged from conflict\n'
  }
  const scalarLines: string[] = []
  const tableBlocks: string[] = []

  const emitObject = (obj: Record<string, JsonLike>, pathParts: string[]): void => {
    const localScalars: string[] = []
    const childEntries: Array<[string, Record<string, JsonLike>]> = []
    for (const key of Object.keys(obj).sort()) {
      const value = obj[key]
      if (isPrimitiveTomlValue(value)) {
        localScalars.push(`${key} = ${formatTomlPrimitive(value)}`)
        continue
      }
      if (isTomlPrimitiveArray(value)) {
        localScalars.push(`${key} = ${formatTomlPrimitiveArray(value)}`)
        continue
      }
      if (Array.isArray(value)) {
        localScalars.push(`${key} = ${escapeTomlString(JSON.stringify(value))}`)
        continue
      }
      if (value != null && typeof value === 'object') {
        childEntries.push([key, value as Record<string, JsonLike>])
      } else {
        localScalars.push(`${key} = ${escapeTomlString(String(value))}`)
      }
    }

    if (pathParts.length === 0) {
      scalarLines.push(...localScalars)
    } else {
      const header = `[${tomlKeyPath(pathParts)}]`
      const block = [header, ...localScalars].join('\n')
      tableBlocks.push(block)
    }

    for (const [childKey, childObj] of childEntries) {
      emitObject(childObj, [...pathParts, childKey])
    }
  }

  emitObject(root as Record<string, JsonLike>, [])
  const parts: string[] = []
  if (scalarLines.length > 0) parts.push(scalarLines.join('\n'))
  if (tableBlocks.length > 0) parts.push(tableBlocks.join('\n\n'))
  return `${parts.join('\n\n')}\n`
}

function mergeJsonOrTomlToText(localAbs: string, relayAbs: string, asToml: boolean): string {
  const localRaw = readText(localAbs)
  const relayRaw = readText(relayAbs)
  const localObj = normalizeForJsonLike(asToml ? parseToml(localRaw) : JSON.parse(localRaw))
  const relayObj = normalizeForJsonLike(asToml ? parseToml(relayRaw) : JSON.parse(relayRaw))
  const merged = deepMergeValues(localObj, relayObj)
  if (asToml) {
    return toTomlDocument(merged)
  }
  return JSON.stringify(merged, null, 2) + '\n'
}

function mergeJsonlToText(localAbs: string, relayAbs: string): string {
  const localLines = readText(localAbs).split('\n').map((l) => l.trim()).filter(Boolean)
  const relayLines = readText(relayAbs).split('\n').map((l) => l.trim()).filter(Boolean)
  const seen = new Set<string>()
  const unique = [...localLines, ...relayLines].filter((line) => {
    if (seen.has(line)) return false
    seen.add(line)
    return true
  })
  const withTime = unique.map((line) => {
    try {
      const parsed = JSON.parse(line) as Record<string, unknown>
      const t = parsed.time ?? parsed.timestamp ?? parsed.ts ?? null
      const at = typeof t === 'string' || typeof t === 'number' ? Number(new Date(String(t))) : NaN
      return { line, at: Number.isFinite(at) ? at : Number.MAX_SAFE_INTEGER }
    } catch {
      return { line, at: Number.MAX_SAFE_INTEGER }
    }
  })
  withTime.sort((a, b) => a.at - b.at)
  return withTime.map((it) => it.line).join('\n') + '\n'
}

function mergeTextToText(localAbs: string, relayAbs: string): string {
  const localRaw = readText(localAbs)
  const relayRaw = readText(relayAbs)
  return `${localRaw}\n\n<<<<<<< sync-separator local-vs-sync_tmp\n\n${relayRaw}\n`
}

function writeTextFile(abs: string, content: string, dryRun: boolean): void {
  if (dryRun) return
  ensureParent(abs)
  const tmp = `${abs}.tmp`
  writeFileSync(tmp, content, 'utf8')
  renameSync(tmp, abs)
}

function sameFileContent(left: string, right: string): boolean {
  if (!existsSync(left) || !existsSync(right)) {
    return false
  }
  const lStat = statSync(left)
  const rStat = statSync(right)
  if (lStat.size !== rStat.size) {
    return false
  }
  return hashFile(left) === hashFile(right)
}

function backupBeforeChange(abs: string, backupRoot: string, side: 'local' | 'relay', dryRun: boolean): void {
  if (dryRun || !existsSync(abs)) {
    return
  }
  const target = join(backupRoot, side, ...absPathToBackupSegments(abs))
  ensureParent(target)
  cpSync(abs, target, { recursive: true, force: true })
}

function copyPath(src: string, dst: string, dryRun: boolean): void {
  if (dryRun) {
    return
  }
  ensureParent(dst)
  const st = lstatSync(src)
  if (st.isDirectory()) {
    cpSync(src, dst, { recursive: true, force: true, preserveTimestamps: true })
    return
  }
  copyFileSync(src, dst)
}

function ensureDir(abs: string, dryRun: boolean): void {
  if (dryRun || existsSync(abs)) {
    return
  }
  mkdirSync(abs, { recursive: true })
}

function snapshotTarget(backupRoot: string, side: 'local' | 'relay', absPath: string): string {
  return join(backupRoot, side, ...absPathToBackupSegments(absPath))
}

function captureFullSnapshots(mappings: Mapping[], backupRoot: string): SnapshotEntry[] {
  const entries: SnapshotEntry[] = []
  for (const m of mappings) {
    const relayPath = resolveRelayPath(m.relayCandidates)
    const pairs: Array<{ side: 'local' | 'relay'; absPath: string }> = [
      { side: 'local', absPath: m.localPath },
      { side: 'relay', absPath: relayPath }
    ]
    for (const pair of pairs) {
      const exists = existsSync(pair.absPath)
      const st = exists ? lstatSync(pair.absPath) : null
      const kind: 'file' | 'dir' | 'missing' = !exists ? 'missing' : st?.isDirectory() ? 'dir' : 'file'
      entries.push({ side: pair.side, path: pair.absPath, exists, kind })
      if (!exists) {
        continue
      }
      const target = snapshotTarget(backupRoot, pair.side, pair.absPath)
      ensureParent(target)
      cpSync(pair.absPath, target, { recursive: true, force: true, preserveTimestamps: true })
    }
  }
  return entries
}

function walkFiles(root: string): Set<string> {
  const out = new Set<string>()
  if (!existsSync(root)) {
    return out
  }
  const rootSt = lstatSync(root)
  if (!rootSt.isDirectory()) {
    out.add('.')
    return out
  }
  const stack = ['']
  while (stack.length > 0) {
    const relCur = stack.pop()
    if (relCur == null) {
      continue
    }
    const absCur = relCur ? join(root, relCur) : root
    let ents: string[]
    try {
      ents = readdirSync(absCur)
    } catch {
      continue
    }
    for (const name of ents) {
      if (isIgnoredName(name)) {
        continue
      }
      const rel = relCur ? join(relCur, name) : name
      const abs = join(root, rel)
      let st
      try {
        st = lstatSync(abs)
      } catch {
        continue
      }
      if (st.isDirectory()) {
        stack.push(rel)
      } else if (st.isFile()) {
        out.add(rel)
      }
    }
  }
  return out
}

function buildConflictSuffix(localHash: string, relayHash: string, olderSide: 'local' | 'relay'): string {
  return `${olderSide}-${localHash.slice(0, 8)}-${relayHash.slice(0, 8)}`
}

function conflictCopyPath(original: string, suffix: string): string {
  return `${original}.conflict-${suffix}`
}

function mergeConflictByType(localAbs: string, relayAbs: string): { strategy: string; mergedContent: string | null } {
  const e = ext(localAbs)
  try {
    if (e === '.json') {
      return { strategy: 'merge-json', mergedContent: mergeJsonOrTomlToText(localAbs, relayAbs, false) }
    }
    if (e === '.toml') {
      return { strategy: 'merge-toml', mergedContent: mergeJsonOrTomlToText(localAbs, relayAbs, true) }
    }
    if (e === '.jsonl') {
      return { strategy: 'merge-jsonl', mergedContent: mergeJsonlToText(localAbs, relayAbs) }
    }
    if (e === '.md' || e === '.txt' || e === '.yaml' || e === '.yml') {
      return { strategy: `merge-text-${e.slice(1) || 'plain'}`, mergedContent: mergeTextToText(localAbs, relayAbs) }
    }
  } catch {
    return { strategy: 'merge-parse-fallback', mergedContent: null }
  }
  return { strategy: looksLikeBinary(localAbs) ? 'binary-preserve-both' : 'mtime-preserve-both', mergedContent: null }
}

function syncDirPair(
  localDir: string,
  relayDir: string,
  backupRoot: string,
  tally: Tally,
  dryRun: boolean,
  operations: OperationRecord[],
  conflicts: ConflictRecord[]
): void {
  const left = walkFiles(localDir)
  const right = walkFiles(relayDir)
  const all = new Set<string>([...left, ...right])
  for (const rel of all) {
    const localAbs = join(localDir, rel)
    const relayAbs = join(relayDir, rel)
    const hasLocal = existsSync(localAbs)
    const hasRelay = existsSync(relayAbs)
    if (hasLocal && !hasRelay) {
      try {
        copyPath(localAbs, relayAbs, dryRun)
        tally.copiedToRelay++
        operations.push({ action: 'copy_to_relay', relPath: rel, from: localAbs, to: relayAbs })
      } catch (e) {
        tally.errors.push(`${localAbs} -> ${relayAbs}: ${e instanceof Error ? e.message : String(e)}`)
      }
      continue
    }
    if (!hasLocal && hasRelay) {
      try {
        copyPath(relayAbs, localAbs, dryRun)
        tally.copiedToLocal++
        operations.push({ action: 'copy_to_local', relPath: rel, from: relayAbs, to: localAbs })
      } catch (e) {
        tally.errors.push(`${relayAbs} -> ${localAbs}: ${e instanceof Error ? e.message : String(e)}`)
      }
      continue
    }
    if (!hasLocal || !hasRelay) {
      tally.skipped++
      operations.push({ action: 'skip', relPath: rel, note: 'one-side-missing' })
      continue
    }
    try {
      if (sameFileContent(localAbs, relayAbs)) {
        operations.push({ action: 'skip', relPath: rel, note: 'identical-content' })
        continue
      }
      if (isHighRiskRuntimePath(rel)) {
        tally.skipped++
        operations.push({ action: 'skip', relPath: rel, note: 'runtime-add-only-conflict-skip' })
        continue
      }
      tally.conflicts++
      const lStat = statSync(localAbs)
      const rStat = statSync(relayAbs)
      const localHash = hashFile(localAbs)
      const relayHash = hashFile(relayAbs)
      const newerSide: 'local' | 'relay' = lStat.mtimeMs >= rStat.mtimeMs ? 'local' : 'relay'
      const olderAbs = newerSide === 'local' ? relayAbs : localAbs
      const newerAbs = newerSide === 'local' ? localAbs : relayAbs
      const olderSide: 'local' | 'relay' = newerSide === 'local' ? 'relay' : 'local'

      backupBeforeChange(olderAbs, backupRoot, olderSide, dryRun)
      const suffix = buildConflictSuffix(localHash, relayHash, olderSide)
      const confPath = conflictCopyPath(olderAbs, suffix)
      if (!existsSync(confPath)) {
        ensureParent(confPath)
        copyPath(olderAbs, confPath, dryRun)
        operations.push({ action: 'conflict_copy', relPath: rel, from: olderAbs, to: confPath })
      }
      const merged = mergeConflictByType(localAbs, relayAbs)
      if (merged.mergedContent != null) {
        writeTextFile(localAbs, merged.mergedContent, dryRun)
        writeTextFile(relayAbs, merged.mergedContent, dryRun)
        operations.push({ action: 'merge', relPath: rel, note: merged.strategy })
      } else {
        copyPath(newerAbs, olderAbs, dryRun)
        operations.push({ action: 'overwrite_from_newer', relPath: rel, from: newerAbs, to: olderAbs, note: merged.strategy })
      }
      conflicts.push({
        relPath: rel,
        localPath: localAbs,
        relayPath: relayAbs,
        newerSide,
        localHash,
        relayHash,
        conflictCopyPath: confPath,
        strategy: merged.strategy
      })
      if (olderSide === 'local') {
        tally.copiedToLocal++
      } else {
        tally.copiedToRelay++
      }
    } catch (e) {
      tally.errors.push(`conflict ${rel}: ${e instanceof Error ? e.message : String(e)}`)
    }
  }
}

function syncFilePair(
  localFile: string,
  relayFile: string,
  backupRoot: string,
  tally: Tally,
  dryRun: boolean,
  operations: OperationRecord[],
  conflicts: ConflictRecord[]
): void {
  const hasLocal = existsSync(localFile)
  const hasRelay = existsSync(relayFile)
  if (hasLocal && !hasRelay) {
    try {
      copyPath(localFile, relayFile, dryRun)
      tally.copiedToRelay++
      operations.push({ action: 'copy_to_relay', relPath: basename(localFile), from: localFile, to: relayFile })
    } catch (e) {
      tally.errors.push(`${localFile} -> ${relayFile}: ${e instanceof Error ? e.message : String(e)}`)
    }
    return
  }
  if (!hasLocal && hasRelay) {
    try {
      copyPath(relayFile, localFile, dryRun)
      tally.copiedToLocal++
      operations.push({ action: 'copy_to_local', relPath: basename(localFile), from: relayFile, to: localFile })
    } catch (e) {
      tally.errors.push(`${relayFile} -> ${localFile}: ${e instanceof Error ? e.message : String(e)}`)
    }
    return
  }
  if (!hasLocal || !hasRelay) {
    tally.skipped++
    operations.push({ action: 'skip', relPath: basename(localFile), note: 'one-side-missing' })
    return
  }
  try {
    if (sameFileContent(localFile, relayFile)) {
      operations.push({ action: 'skip', relPath: basename(localFile), note: 'identical-content' })
      return
    }
    if (isHighRiskRuntimePath(basename(localFile))) {
      tally.skipped++
      operations.push({ action: 'skip', relPath: basename(localFile), note: 'runtime-add-only-conflict-skip' })
      return
    }
    tally.conflicts++
    const lStat = statSync(localFile)
    const rStat = statSync(relayFile)
    const localHash = hashFile(localFile)
    const relayHash = hashFile(relayFile)
    const newerSide: 'local' | 'relay' = lStat.mtimeMs >= rStat.mtimeMs ? 'local' : 'relay'
    const olderAbs = newerSide === 'local' ? relayFile : localFile
    const newerAbs = newerSide === 'local' ? localFile : relayFile
    const olderSide: 'local' | 'relay' = newerSide === 'local' ? 'relay' : 'local'
    backupBeforeChange(olderAbs, backupRoot, olderSide, dryRun)
    const suffix = buildConflictSuffix(localHash, relayHash, olderSide)
    const confPath = conflictCopyPath(olderAbs, suffix)
    if (!existsSync(confPath)) {
      copyPath(olderAbs, confPath, dryRun)
      operations.push({ action: 'conflict_copy', relPath: basename(localFile), from: olderAbs, to: confPath })
    }
    const merged = mergeConflictByType(localFile, relayFile)
    if (merged.mergedContent != null) {
      writeTextFile(localFile, merged.mergedContent, dryRun)
      writeTextFile(relayFile, merged.mergedContent, dryRun)
      operations.push({ action: 'merge', relPath: basename(localFile), note: merged.strategy })
    } else {
      copyPath(newerAbs, olderAbs, dryRun)
      operations.push({
        action: 'overwrite_from_newer',
        relPath: basename(localFile),
        from: newerAbs,
        to: olderAbs,
        note: merged.strategy
      })
    }
    conflicts.push({
      relPath: basename(localFile),
      localPath: localFile,
      relayPath: relayFile,
      newerSide,
      localHash,
      relayHash,
      conflictCopyPath: confPath,
      strategy: merged.strategy
    })
    if (olderSide === 'local') {
      tally.copiedToLocal++
    } else {
      tally.copiedToRelay++
    }
  } catch (e) {
    tally.errors.push(`conflict file ${localFile}<->${relayFile}: ${e instanceof Error ? e.message : String(e)}`)
  }
}

function safeWriteJson(abs: string, data: unknown): void {
  ensureParent(abs)
  const tmp = `${abs}.tmp`
  writeFileSync(tmp, JSON.stringify(data, null, 2) + '\n', 'utf8')
  renameSync(tmp, abs)
}

function restoreSnapshotEntries(backupRoot: string, entries: SnapshotEntry[]): AgentConfigSyncRollbackResult {
  const errors: string[] = []
  let restoredLocal = 0
  let restoredRelay = 0
  for (const entry of entries) {
    try {
      if (!entry.exists) {
        if (existsSync(entry.path)) {
          rmSync(entry.path, { recursive: true, force: true })
        }
        continue
      }
      const src = snapshotTarget(backupRoot, entry.side, entry.path)
      if (!existsSync(src)) {
        errors.push(`缺少快照源：${src}`)
        continue
      }
      if (existsSync(entry.path)) {
        rmSync(entry.path, { recursive: true, force: true })
      }
      ensureParent(entry.path)
      cpSync(src, entry.path, { recursive: true, force: true, preserveTimestamps: true })
      if (entry.side === 'local') {
        restoredLocal++
      } else {
        restoredRelay++
      }
    } catch (e) {
      errors.push(`恢复失败 ${entry.path}: ${e instanceof Error ? e.message : String(e)}`)
    }
  }
  return {
    ok: errors.length === 0,
    runId: '',
    restoredLocal,
    restoredRelay,
    errors
  }
}

function pruneRunHistory(syncTmpRoot: string, keepCount: number): void {
  const runsRoot = join(syncTmpRoot, '_agent_sync_runs')
  if (!existsSync(runsRoot) || !lstatSync(runsRoot).isDirectory()) {
    return
  }
  const dirs = readdirSync(runsRoot)
    .filter((name) => name.startsWith('run_'))
    .map((name) => ({ name, p: join(runsRoot, name), mtime: statSync(join(runsRoot, name)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime)
  for (const d of dirs.slice(keepCount)) {
    rmSync(d.p, { recursive: true, force: true })
  }
}

function writeRunArtifacts(
  reportDir: string,
  result: AgentConfigSyncResult,
  operations: OperationRecord[],
  conflicts: ConflictRecord[]
): void {
  safeWriteJson(join(reportDir, 'sync-report.json'), result)
  safeWriteJson(join(reportDir, 'conflicts-manifest.json'), conflicts)
  const lines = operations.map((op) => {
    const from = op.from ? ` from=${op.from}` : ''
    const to = op.to ? ` to=${op.to}` : ''
    const note = op.note ? ` note=${op.note}` : ''
    return `[${op.action}] rel=${op.relPath}${from}${to}${note}`
  })
  writeFileSync(join(reportDir, 'operations.log'), lines.join('\n') + (lines.length > 0 ? '\n' : ''), 'utf8')
}

export function scanSyncRelayContent(): AgentConfigSyncScanResult {
  const syncTmpRoot = join(homedir(), '.sync_tmp')
  const relayRoot = findRelayRoot(syncTmpRoot)
  return {
    hasRelayContent: relayRoot != null,
    relayRoot,
    syncTmpRoot
  }
}

export function syncAgentConfigs(options?: SyncOptions): AgentConfigSyncResult {
  const dryRun = options?.dryRun === true
  const scan = scanSyncRelayContent()
  if (!scan.relayRoot) {
    return {
      ok: true,
      mode: 'local_scan_only',
      message: '未发现 ~/.sync_tmp 中可用的智能体中转目录，已跳过双向同步并继续本地扫描。',
      relayRoot: null,
      runId: null,
      reportDir: null,
      dryRun,
      copiedToLocal: 0,
      copiedToRelay: 0,
      conflicts: 0,
      skipped: 0,
      errors: []
    }
  }

  const runId = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14)
  const runRoot = join(scan.syncTmpRoot, '_agent_sync_runs', `run_${runId}`)
  const backupRoot = join(runRoot, 'backups')
  const reportDir = join(runRoot, 'reports')
  if (!dryRun) {
    mkdirSync(backupRoot, { recursive: true })
  }
  mkdirSync(reportDir, { recursive: true })

  const mappings = buildScopedMappings(scan.relayRoot)

  const tally: Tally = { copiedToLocal: 0, copiedToRelay: 0, conflicts: 0, skipped: 0, errors: [] }
  const operations: OperationRecord[] = []
  const conflicts: ConflictRecord[] = []
  let snapshotEntries: SnapshotEntry[] = []

  if (!dryRun) {
    try {
      snapshotEntries = captureFullSnapshots(mappings, backupRoot)
      safeWriteJson(join(runRoot, 'snapshot-manifest.json'), snapshotEntries)
    } catch (e) {
      const result: AgentConfigSyncResult = {
        ok: false,
        mode: 'synced',
        message: `创建同步前快照失败：${e instanceof Error ? e.message : String(e)}`,
        relayRoot: scan.relayRoot,
        runId,
        reportDir,
        dryRun,
        copiedToLocal: 0,
        copiedToRelay: 0,
        conflicts: 0,
        skipped: 0,
        errors: [e instanceof Error ? e.message : String(e)]
      }
      writeRunArtifacts(reportDir, result, operations, conflicts)
      return result
    }
  }

  for (const m of mappings) {
    const relayPath = resolveRelayPath(m.relayCandidates)
    try {
      if (m.kind === 'dir') {
        if (!existsSync(m.localPath) && !existsSync(relayPath)) {
          tally.skipped++
          operations.push({ action: 'skip', relPath: m.name, note: 'both-roots-missing' })
          continue
        }
        if (!existsSync(m.localPath)) {
          ensureDir(m.localPath, dryRun)
          operations.push({ action: 'mkdir', relPath: m.name, to: m.localPath })
        }
        if (!existsSync(relayPath)) {
          ensureDir(relayPath, dryRun)
          operations.push({ action: 'mkdir', relPath: m.name, to: relayPath })
        }
        syncDirPair(m.localPath, relayPath, backupRoot, tally, dryRun, operations, conflicts)
      } else {
        syncFilePair(m.localPath, relayPath, backupRoot, tally, dryRun, operations, conflicts)
      }
    } catch (e) {
      tally.errors.push(`${m.name}: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  let result: AgentConfigSyncResult = {
    ok: tally.errors.length === 0,
    mode: 'synced',
    message:
      tally.errors.length === 0
        ? dryRun
          ? '已完成智能体配置 dry-run（仅检测，不落盘）。'
          : '已完成智能体配置双向同步。'
        : '双向同步已执行，但存在部分失败，请查看错误列表。',
    relayRoot: scan.relayRoot,
    runId,
    reportDir,
    dryRun,
    copiedToLocal: tally.copiedToLocal,
    copiedToRelay: tally.copiedToRelay,
    conflicts: tally.conflicts,
    skipped: tally.skipped,
    errors: tally.errors
  }

  if (!dryRun && tally.errors.length > 0) {
    const rolled = restoreSnapshotEntries(backupRoot, snapshotEntries)
    result = {
      ...result,
      ok: false,
      message: rolled.ok
        ? '同步执行失败，已自动回滚到同步前快照。'
        : '同步执行失败，且自动回滚部分失败，请检查错误列表。',
      errors: [...result.errors, ...rolled.errors]
    }
  }

  writeRunArtifacts(reportDir, result, operations, conflicts)
  if (!dryRun) {
    pruneRunHistory(scan.syncTmpRoot, 1)
  }
  return result
}

export function syncAgentConfigsWithRelay(): AgentConfigSyncResult {
  return syncAgentConfigs({ dryRun: false })
}

function walkAllFiles(root: string): string[] {
  const out: string[] = []
  if (!existsSync(root) || !lstatSync(root).isDirectory()) {
    return out
  }
  const stack = ['']
  while (stack.length > 0) {
    const relCur = stack.pop()
    if (relCur == null) {
      continue
    }
    const absCur = relCur ? join(root, relCur) : root
    let ents: string[]
    try {
      ents = readdirSync(absCur)
    } catch {
      continue
    }
    for (const name of ents) {
      const rel = relCur ? join(relCur, name) : name
      const abs = join(root, rel)
      let st
      try {
        st = lstatSync(abs)
      } catch {
        continue
      }
      if (st.isDirectory()) {
        stack.push(rel)
      } else if (st.isFile()) {
        out.push(rel)
      }
    }
  }
  return out
}

function restoreFromBackup(backupSideRoot: string): number {
  const files = walkAllFiles(backupSideRoot)
  let restored = 0
  for (const rel of files) {
    const src = join(backupSideRoot, rel)
    const relParts = rel.split(/[\\/]+/).filter(Boolean)
    let dst: string
    if (process.platform === 'win32' && relParts.length > 1 && /^[A-Z]$/i.test(relParts[0])) {
      dst = `${relParts[0].toUpperCase()}:\\${relParts.slice(1).join('\\')}`
    } else if (process.platform === 'win32' && relParts[0] === '__unc' && relParts.length > 2) {
      dst = `\\\\${relParts.slice(1).join('\\')}`
    } else {
      dst = join('/', ...relParts)
      if (process.platform === 'win32' && isAbsolute(dst) && /^[\\/][A-Z](?:[\\/]|$)/i.test(dst)) {
        dst = `${dst[1].toUpperCase()}:${dst.slice(2)}`
      }
    }
    ensureParent(dst)
    copyFileSync(src, dst)
    restored++
  }
  return restored
}

export function rollbackAgentConfigSync(runId: string): AgentConfigSyncRollbackResult {
  const safeRunId = runId.trim()
  if (!/^\d{14}$/.test(safeRunId)) {
    return {
      ok: false,
      runId,
      restoredLocal: 0,
      restoredRelay: 0,
      errors: ['runId 格式无效，期望 14 位时间戳（yyyyMMddHHmmss）']
    }
  }
  const syncTmpRoot = join(homedir(), '.sync_tmp')
  const runRoot = join(syncTmpRoot, '_agent_sync_runs', `run_${safeRunId}`)
  const backupRoot = join(runRoot, 'backups')
  const manifestPath = join(runRoot, 'snapshot-manifest.json')
  const localRoot = join(backupRoot, 'local')
  const relayRoot = join(backupRoot, 'relay')
  const errors: string[] = []
  let restoredLocal = 0
  let restoredRelay = 0

  if (existsSync(manifestPath)) {
    try {
      const entries = JSON.parse(readFileSync(manifestPath, 'utf8')) as SnapshotEntry[]
      const restored = restoreSnapshotEntries(backupRoot, entries)
      return {
        ok: restored.ok,
        runId: safeRunId,
        restoredLocal: restored.restoredLocal,
        restoredRelay: restored.restoredRelay,
        errors: restored.errors
      }
    } catch (e) {
      errors.push(`读取快照清单失败，尝试兼容旧回滚逻辑：${e instanceof Error ? e.message : String(e)}`)
    }
  }

  try {
    restoredLocal = restoreFromBackup(localRoot)
  } catch (e) {
    errors.push(`恢复 local 失败: ${e instanceof Error ? e.message : String(e)}`)
  }
  try {
    restoredRelay = restoreFromBackup(relayRoot)
  } catch (e) {
    errors.push(`恢复 relay 失败: ${e instanceof Error ? e.message : String(e)}`)
  }

  return {
    ok: errors.length === 0,
    runId: safeRunId,
    restoredLocal,
    restoredRelay,
    errors
  }
}

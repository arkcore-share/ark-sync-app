import { createHash } from 'node:crypto'
import {
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  rmSync,
  writeFileSync
} from 'node:fs'
import { homedir, hostname, platform, release } from 'node:os'
import { basename, dirname, isAbsolute, join, relative } from 'node:path'
import type {
  AgentArtifactCategory,
  AgentArtifactEntry,
  AgentArtifactsDetail,
  AgentArtifactsExportManifest,
  AgentArtifactsExportManifestEntry,
  AgentArtifactsExportOptions,
  AgentArtifactsExportResult
} from '../shared/agentArtifactsTypes.js'
import { listAgentArtifactsDetails } from './agentArtifactsScan.js'

const EXPORT_DIR_NAME = 'ark-sync-agent-artifacts'
const MANIFEST_FILE_NAME = 'ark-sync-agent-artifacts-manifest.json'

type CopyStats = {
  files: number
  dirs: number
  skipped: number
}

function toPosixPath(p: string): string {
  return p.replace(/\\/g, '/')
}

function shortHash(input: string): string {
  return createHash('sha256').update(input).digest('hex').slice(0, 10)
}

function sanitizeSegment(raw: string): string {
  const cleaned = raw
    .trim()
    .replace(/[<>:"/\\|?*\x00-\x1f]+/g, '_')
    .replace(/\s+/g, ' ')
    .replace(/[. ]+$/g, '')
  if (!cleaned || cleaned === '.' || cleaned === '..') {
    return 'item'
  }
  return cleaned.slice(0, 80)
}

function entryLabel(entry: AgentArtifactEntry): string {
  return (entry.label?.trim() || basename(entry.path) || 'item').trim()
}

function exportedRelativePath(agentId: string, category: AgentArtifactCategory, entry: AgentArtifactEntry): string {
  const labelParts = entryLabel(entry)
    .split(/[\\/]+/g)
    .map(sanitizeSegment)
    .filter(Boolean)
  const parts = labelParts.length > 0 ? labelParts : [sanitizeSegment(basename(entry.path))]
  const last = parts[parts.length - 1] || 'item'
  parts[parts.length - 1] = `${last}-${shortHash(entry.path)}`
  return toPosixPath(join(EXPORT_DIR_NAME, sanitizeSegment(agentId), category, ...parts))
}

function relativeIfUnder(parent: string | null, child: string): string | null {
  if (!parent) {
    return null
  }
  const rel = relative(parent, child)
  if (rel === '') {
    return ''
  }
  if (!rel || rel.startsWith('..') || isAbsolute(rel)) {
    return null
  }
  return toPosixPath(rel)
}

function isUnderPath(parent: string, child: string): boolean {
  const rel = relative(parent, child)
  return rel === '' || (!!rel && !rel.startsWith('..') && !isAbsolute(rel))
}

function copyPath(src: string, dest: string): CopyStats {
  const st = lstatSync(src)
  if (st.isSymbolicLink()) {
    return { files: 0, dirs: 0, skipped: 1 }
  }
  if (st.isDirectory()) {
    mkdirSync(dest, { recursive: true })
    const total: CopyStats = { files: 0, dirs: 1, skipped: 0 }
    for (const name of readdirSync(src)) {
      const child = copyPath(join(src, name), join(dest, name))
      total.files += child.files
      total.dirs += child.dirs
      total.skipped += child.skipped
    }
    return total
  }
  if (st.isFile()) {
    mkdirSync(dirname(dest), { recursive: true })
    copyFileSync(src, dest)
    return { files: 1, dirs: 0, skipped: 0 }
  }
  return { files: 0, dirs: 0, skipped: 1 }
}

function categoryLabel(category: AgentArtifactCategory): string {
  if (category === 'skills') {
    return 'Skill'
  }
  if (category === 'memory') {
    return 'Memory'
  }
  return 'Files'
}

function entriesForCategory(
  agent: AgentArtifactsDetail,
  category: AgentArtifactCategory
): AgentArtifactEntry[] {
  if (category === 'skills') {
    return agent.skills
  }
  if (category === 'memory') {
    return agent.memory
  }
  return agent.files
}

function manifestEntry(
  agent: AgentArtifactsDetail,
  category: AgentArtifactCategory,
  entry: AgentArtifactEntry,
  exportedRel: string
): AgentArtifactsExportManifestEntry {
  return {
    id: shortHash(`${agent.id}:${category}:${entry.path}`),
    agentId: agent.id,
    agentName: agent.name,
    category,
    categoryLabel: categoryLabel(category),
    kind: entry.kind,
    label: entryLabel(entry),
    sourcePath: entry.path,
    sourceDataRoot: agent.dataRoot,
    relativeToDataRoot: relativeIfUnder(agent.dataRoot, entry.path),
    exportedRelativePath: exportedRel
  }
}

export function exportAgentArtifactsToSyncTmp(
  opts?: AgentArtifactsExportOptions
): AgentArtifactsExportResult {
  const targetRoot = join(homedir(), '.sync_tmp')
  const exportRoot = join(targetRoot, EXPORT_DIR_NAME)
  const manifestPath = join(targetRoot, MANIFEST_FILE_NAME)
  const errors: string[] = []
  const manifestEntries: AgentArtifactsExportManifestEntry[] = []
  let copiedFiles = 0
  let copiedDirs = 0
  let skipped = 0

  mkdirSync(targetRoot, { recursive: true })
  rmSync(exportRoot, { recursive: true, force: true })
  mkdirSync(exportRoot, { recursive: true })

  const agents = listAgentArtifactsDetails({ force: true }).filter((agent) => agent.installed)

  for (const agent of agents) {
    for (const category of ['skills', 'memory', 'files'] as const) {
      const seen = new Set<string>()
      for (const entry of entriesForCategory(agent, category)) {
        if (seen.has(entry.path)) {
          continue
        }
        seen.add(entry.path)
        if (!existsSync(entry.path)) {
          errors.push(`${agent.name} ${categoryLabel(category)}: missing ${entry.path}`)
          continue
        }
        if (isUnderPath(exportRoot, entry.path)) {
          skipped += 1
          errors.push(`${agent.name} ${categoryLabel(category)}: skipped export output ${entry.path}`)
          continue
        }
        const exportedRel = exportedRelativePath(agent.id, category, entry)
        const dest = join(targetRoot, exportedRel)
        try {
          rmSync(dest, { recursive: true, force: true })
          const stats = copyPath(entry.path, dest)
          copiedFiles += stats.files
          copiedDirs += stats.dirs
          skipped += stats.skipped
          manifestEntries.push(manifestEntry(agent, category, entry, exportedRel))
        } catch (e) {
          errors.push(`${agent.name} ${categoryLabel(category)} ${entry.path}: ${e instanceof Error ? e.message : String(e)}`)
        }
      }
    }
  }

  const manifest: AgentArtifactsExportManifest = {
    schemaVersion: 1,
    createdAt: new Date().toISOString(),
    sourceDevice: {
      arkSyncDeviceId: opts?.sourceDeviceId?.trim() || null,
      name: opts?.sourceDeviceName?.trim() || null,
      hostname: hostname(),
      platform: platform(),
      osRelease: release(),
      homeDir: homedir()
    },
    syncTmpRoot: targetRoot,
    payloadRootRelative: EXPORT_DIR_NAME,
    entries: manifestEntries
  }

  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')

  return {
    ok: errors.length === 0,
    targetRoot,
    exportRoot,
    manifestPath,
    agents: agents.length,
    entries: manifestEntries.length,
    copiedFiles,
    copiedDirs,
    skipped,
    errors
  }
}

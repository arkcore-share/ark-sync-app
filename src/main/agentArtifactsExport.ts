import { cpSync, existsSync, mkdirSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { isAbsolute, join, relative, resolve, sep } from 'node:path'
import type { AgentArtifactEntry, AgentArtifactsSyncTmpExportResult } from '../shared/agentArtifactsTypes.js'
import { listAgentArtifactsDetails } from './agentArtifactsScan.js'

/**
 * 将绝对路径映射为 ~/.sync_tmp 下的相对路径段（保留各段原名，含盘符 / UNC 编码，避免跨路径同名覆盖）。
 */
export function absPathToSyncTmpSegments(absPath: string): string[] {
  const resolved = resolve(absPath)
  if (process.platform === 'win32') {
    const home = resolve(homedir())
    const relToHome = relative(home, resolved)
    if (relToHome === '') {
      return []
    }
    if (!isAbsolute(relToHome) && relToHome !== '..' && !relToHome.startsWith(`..${sep}`)) {
      const parts = relToHome.split(/[\\/]+/).filter(Boolean)
      const hermesTail = ['AppData', 'Local', 'hermes']
      if (
        parts.length >= hermesTail.length &&
        parts[0].toLowerCase() === hermesTail[0].toLowerCase() &&
        parts[1].toLowerCase() === hermesTail[1].toLowerCase() &&
        parts[2].toLowerCase() === hermesTail[2].toLowerCase()
      ) {
        return ['hermes', ...parts.slice(3)]
      }
      return parts
    }

    let r = resolved.replace(/^\\\\\?\\/, '')
    if (/^unc\\/i.test(r)) {
      const rest = r.slice(4)
      const parts = rest.split(/\\+/).filter(Boolean)
      return ['__unc', ...parts]
    }
    if (r.startsWith('\\\\')) {
      const body = r.slice(2).split(/\\+/).filter(Boolean)
      return ['__unc', ...body]
    }
    const driveMatch = /^([a-zA-Z]):([\\/]|$)/.exec(r)
    if (driveMatch) {
      const letter = driveMatch[1].toUpperCase()
      const rest = r.slice(2).replace(/^[\\/]+/, '')
      const parts = rest.split(/\\+/).filter(Boolean)
      return [letter, ...parts]
    }
  }
  const posix = resolved.replace(/\\/g, '/')
  const without = posix.startsWith('/') ? posix.slice(1) : posix
  return without.split('/').filter(Boolean)
}

function isUnderSyncTmpRoot(syncTmpRoot: string, sourceAbs: string): boolean {
  const rel = relative(resolve(syncTmpRoot), resolve(sourceAbs))
  if (rel === '') {
    return true
  }
  if (isAbsolute(rel)) {
    return false
  }
  return rel !== '..' && !rel.startsWith(`..${sep}`)
}

function copyEntry(syncTmpRoot: string, entry: AgentArtifactEntry, errors: string[], tallies: Tallies): void {
  if (!existsSync(entry.path)) {
    tallies.skipped++
    return
  }
  if (isUnderSyncTmpRoot(syncTmpRoot, entry.path)) {
    tallies.skipped++
    return
  }
  let dest: string
  try {
    const segments = absPathToSyncTmpSegments(entry.path)
    if (segments.length === 0) {
      throw new Error('无法从路径推导镜像层级')
    }
    dest = join(syncTmpRoot, ...segments)
  } catch (e) {
    errors.push(`${entry.path}: ${e instanceof Error ? e.message : String(e)}`)
    tallies.skipped++
    return
  }
  try {
    mkdirSync(join(dest, '..'), { recursive: true })
    const st = statSync(entry.path)
    if (entry.kind === 'dir' && !st.isDirectory()) {
      tallies.skipped++
      return
    }
    if (entry.kind === 'file' && !st.isFile()) {
      tallies.skipped++
      return
    }
    cpSync(entry.path, dest, { recursive: true, force: true })
    if (st.isDirectory()) {
      tallies.dirs++
    } else {
      tallies.files++
    }
  } catch (e) {
    errors.push(`${entry.path} → ${dest}: ${e instanceof Error ? e.message : String(e)}`)
    tallies.skipped++
  }
}

type Tallies = { files: number; dirs: number; skipped: number }

/**
 * 将「智能体」页所列各已安装产品的 Skill / Memory / Files 复制到 ~/.sync_tmp，
 * 目标路径为「用户主目录/.sync_tmp」+ 与源绝对路径一致的目录层级，不改动文件名。
 */
export async function exportAgentArtifactsToSyncTmp(): Promise<AgentArtifactsSyncTmpExportResult> {
  const errors: string[] = []
  const targetRoot = join(homedir(), '.sync_tmp')
  mkdirSync(targetRoot, { recursive: true })

  const details = await listAgentArtifactsDetails({ force: true })
  const tallies: Tallies = { files: 0, dirs: 0, skipped: 0 }
  const seen = new Set<string>()

  for (const agent of details) {
    if (!agent.installed) {
      continue
    }
    const all: AgentArtifactEntry[] = [...agent.skills, ...agent.memory, ...agent.files]
    for (const e of all) {
      const key = resolve(e.path)
      if (seen.has(key)) {
        continue
      }
      seen.add(key)
      copyEntry(targetRoot, e, errors, tallies)
    }
  }

  const copiedItems = tallies.files + tallies.dirs
  return {
    ok: errors.length === 0,
    targetRoot,
    copiedItems,
    copiedFiles: tallies.files,
    copiedDirs: tallies.dirs,
    skipped: tallies.skipped,
    errors
  }
}

import { existsSync, readdirSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { basename, join } from 'node:path'
import { loadAgentArtifactScanRules, resolveAgentArtifactScanRulesPath } from './agentArtifactScanRulesLoad.js'
import type { AgentArtifactScanRule, ArtifactPathRule, DataRootCandidate } from '../shared/agentArtifactScanRules.types.js'
import { THIRD_PARTY_SCAN_CATALOG } from '../shared/thirdPartyCatalog.js'
import type { AgentArtifactEntry, AgentArtifactsDetail } from '../shared/agentArtifactsTypes.js'
import type { ThirdPartyScanResult } from '../shared/thirdPartyScanTypes.js'
import { scanThirdPartyProducts } from './thirdPartyScan.js'

function isIgnoredArtifactName(name: string): boolean {
  const n = name.toLowerCase()
  if (n.includes('.conflict-')) {
    return true
  }
  if (n.endsWith('~') || n.endsWith('.bak') || n.endsWith('.tmp') || n.endsWith('.orig') || n.endsWith('.rej')) {
    return true
  }
  if (n.startsWith('.#') || n.startsWith('#') || n.endsWith('#')) {
    return true
  }
  return false
}

function resolveCandidatePath(home: string, c: DataRootCandidate): string | null {
  if (c.kind === 'home') {
    return join(home, ...c.segments)
  }
  const base = process.env[c.envVar]
  if (!base) {
    return null
  }
  return join(base, ...c.segments)
}

function primaryDataRootForRule(home: string, rule: AgentArtifactScanRule): string | null {
  for (const c of rule.dataRootCandidates) {
    const p = resolveCandidatePath(home, c)
    if (p && existsSync(p)) {
      return p
    }
  }
  const first = rule.dataRootCandidates[0]
  return first ? resolveCandidatePath(home, first) : null
}

function dataPresentForRule(home: string, rule: AgentArtifactScanRule): boolean {
  return rule.dataPresentIfAny.some((c) => {
    const p = resolveCandidatePath(home, c)
    return !!p && existsSync(p)
  })
}

function pushAbsIfExists(out: AgentArtifactEntry[], absPath: string, label: string): void {
  if (!existsSync(absPath)) {
    return
  }
  try {
    const st = statSync(absPath)
    out.push({
      path: absPath,
      kind: st.isDirectory() ? 'dir' : 'file',
      label
    })
  } catch {
    /* ignore */
  }
}

function listDirLimited(dir: string, max: number, depthLabel = ''): AgentArtifactEntry[] {
  if (!existsSync(dir)) {
    return []
  }
  const out: AgentArtifactEntry[] = []
  let entries: string[]
  try {
    entries = readdirSync(dir)
  } catch {
    return []
  }
  const sorted = entries
    .filter((n) => (!n.startsWith('.') || n === '.env') && !isIgnoredArtifactName(n))
    .sort((a, b) => a.localeCompare(b))
  for (const n of sorted.slice(0, max)) {
    const p = join(dir, n)
    try {
      const st = statSync(p)
      const label = depthLabel ? `${depthLabel}/${n}` : n
      out.push({ path: p, kind: st.isDirectory() ? 'dir' : 'file', label })
    } catch {
      /* skip */
    }
  }
  return out
}

function applyPathRule(
  home: string,
  dataRoot: string | null,
  r: ArtifactPathRule,
  out: AgentArtifactEntry[]
): void {
  const base = r.base === 'home' ? home : dataRoot
  if (!base) {
    return
  }
  const abs = join(base, ...r.segments)
  if (!existsSync(abs)) {
    return
  }
  const max = Math.min(r.maxEntries ?? 10000, 10000)
  if (r.enumerate) {
    const prefix = (r.enumerateLabelPrefix ?? r.segments.filter(Boolean).join('/')) || 'dir'
    const children = listDirLimited(abs, max, prefix)
    /* 有子项时只列子项，避免首行出现与「数据目录」混淆的 skills-cursor/skills 容器目录 */
    if (children.length === 0) {
      pushAbsIfExists(out, abs, prefix)
    } else {
      out.push(...children)
    }
  } else {
    const label = r.segments.filter(Boolean).join('/') || '.'
    pushAbsIfExists(out, abs, label)
  }
}

function applyRuleCategory(
  home: string,
  dataRoot: string | null,
  rules: ArtifactPathRule[],
  out: AgentArtifactEntry[]
): void {
  for (const r of rules) {
    applyPathRule(home, dataRoot, r, out)
  }
}

function dedupeEntries(entries: AgentArtifactEntry[]): AgentArtifactEntry[] {
  const seen = new Set<string>()
  const out: AgentArtifactEntry[] = []
  for (const e of entries) {
    if (seen.has(e.path)) {
      continue
    }
    seen.add(e.path)
    out.push(e)
  }
  return out
}

/**
 * `appendGenericUnderDataRoot` / `extraRootsForGenericClawMerge` 合并根路径在列表中的标签前缀，
 * 与 Cursor memory 的 `globalStorage/xxx` 同级（根名/子项），避免 Hermes 等仅 Skill 带前缀而 Memory/Files 只有单层名。
 */
function mergeRootDisplayLabelPrefix(root: string): string {
  const b = basename(root.replace(/[/\\]+$/, ''))
  if (!b) {
    return 'root'
  }
  return b.startsWith('.') ? b.slice(1) : b
}

/** 与旧版 OpenClaw 附加逻辑一致：skills / skill 目录（与 Cursor 等显式规则相同，使用「前缀/子项」二级标签） */
function collectSkillsGeneric(root: string, mode: 'enumerate' | 'folder' = 'enumerate'): AgentArtifactEntry[] {
  const skillsDir = join(root, 'skills')
  if (existsSync(skillsDir)) {
    if (mode === 'folder') {
      return [{ path: skillsDir, kind: 'dir', label: 'skills' }]
    }
    return listDirLimited(skillsDir, 100, 'skills')
  }
  const alt = join(root, 'skill')
  if (existsSync(alt)) {
    if (mode === 'folder') {
      return [{ path: alt, kind: 'dir', label: 'skill' }]
    }
    return listDirLimited(alt, 100, 'skill')
  }
  return []
}

function collectMemoryGeneric(root: string, labelPrefix?: string): AgentArtifactEntry[] {
  const out: AgentArtifactEntry[] = []
  const pfx = labelPrefix ? `${labelPrefix}/` : ''
  const sessionsDepth = labelPrefix ? `${labelPrefix}/sessions` : 'sessions'
  const topRel = [
    'MEMORY.md',
    'USER.md',
    'memory',
    'memories',
    'MEMORY',
    'honcho',
    '.honcho',
    'whatsapp',
    'cron'
  ]
  for (const rel of topRel) {
    const p = join(root, rel)
    if (existsSync(p)) {
      try {
        const st = statSync(p)
        out.push({ path: p, kind: st.isDirectory() ? 'dir' : 'file', label: `${pfx}${rel}` })
      } catch {
        /* skip */
      }
    }
  }
  const sessions = join(root, 'sessions')
  if (existsSync(sessions)) {
    out.push(...listDirLimited(sessions, 24, sessionsDepth))
  }
  for (const f of ['memory.db', 'state.db', 'sessions.db', 'honcho.db']) {
    const p = join(root, f)
    if (existsSync(p)) {
      try {
        const st = statSync(p)
        out.push({ path: p, kind: st.isDirectory() ? 'dir' : 'file', label: `${pfx}${f}` })
      } catch {
        /* skip */
      }
    }
  }
  return out
}

function collectConfigGeneric(root: string, labelPrefix?: string): AgentArtifactEntry[] {
  const out: AgentArtifactEntry[] = []
  const pfx = labelPrefix ? `${labelPrefix}/` : ''
  const configDepth = labelPrefix ? `${labelPrefix}/config` : 'config'
  for (const rel of [
    'config.yaml',
    'config.yml',
    '.env',
    'cli-config.yaml',
    'settings.json',
    'claude.json',
    'agents.md',
    'AGENTS.md'
  ]) {
    const p = join(root, rel)
    if (existsSync(p)) {
      try {
        const st = statSync(p)
        out.push({ path: p, kind: st.isDirectory() ? 'dir' : 'file', label: `${pfx}${rel}` })
      } catch {
        /* skip */
      }
    }
  }
  const cfgDir = join(root, 'config')
  if (existsSync(cfgDir)) {
    out.push(...listDirLimited(cfgDir, 30, configDepth))
  }
  return out
}

function mergeGenericClawUnderRoot(
  root: string,
  skillsMode: 'enumerate' | 'folder' = 'enumerate'
): {
  skills: AgentArtifactEntry[]
  memory: AgentArtifactEntry[]
  files: AgentArtifactEntry[]
} {
  if (!existsSync(root)) {
    return { skills: [], memory: [], files: [] }
  }
  const mergeLabelPrefix = mergeRootDisplayLabelPrefix(root)
  return {
    skills: collectSkillsGeneric(root, skillsMode),
    memory: collectMemoryGeneric(root, mergeLabelPrefix),
    files: collectConfigGeneric(root, mergeLabelPrefix)
  }
}

function collectByRule(home: string, rule: AgentArtifactScanRule): {
  dataRoot: string | null
  dataRootPresent: boolean
  skills: AgentArtifactEntry[]
  memory: AgentArtifactEntry[]
  files: AgentArtifactEntry[]
} {
  const dataRoot = primaryDataRootForRule(home, rule)
  const dataRootPresent = dataPresentForRule(home, rule)

  const skills: AgentArtifactEntry[] = []
  const memory: AgentArtifactEntry[] = []
  const files: AgentArtifactEntry[] = []

  applyRuleCategory(home, dataRoot, rule.skills, skills)
  applyRuleCategory(home, dataRoot, rule.memory, memory)
  applyRuleCategory(home, dataRoot, rule.files, files)

  const genericSkillsMode = rule.genericSkillsCollect ?? 'enumerate'

  if (rule.appendGenericUnderDataRoot && dataRoot && existsSync(dataRoot)) {
    const g = mergeGenericClawUnderRoot(dataRoot, genericSkillsMode)
    skills.push(...g.skills)
    memory.push(...g.memory)
    files.push(...g.files)
  }

  if (rule.extraRootsForGenericClawMerge?.length) {
    for (const c of rule.extraRootsForGenericClawMerge) {
      const p = resolveCandidatePath(home, c)
      if (p && existsSync(p)) {
        const g = mergeGenericClawUnderRoot(p, genericSkillsMode)
        skills.push(...g.skills)
        memory.push(...g.memory)
        files.push(...g.files)
      }
    }
  }

  return {
    dataRoot,
    dataRootPresent,
    skills: dedupeEntries(skills),
    memory: dedupeEntries(memory),
    files: dedupeEntries(files)
  }
}

function listAgentArtifactsCacheKey(scan: ThirdPartyScanResult): string {
  const parts = scan.items.map((r) => `${r.id}:${r.installed ? 1 : 0}`).join('|')
  let rulesM = 0
  try {
    const p = resolveAgentArtifactScanRulesPath()
    if (existsSync(p)) {
      rulesM = statSync(p).mtimeMs
    }
  } catch {
    /* ignore */
  }
  return `${parts}#${rulesM}#${scan.scannedAt}`
}

let listAgentArtifactsMemo: { key: string; value: AgentArtifactsDetail[] } | null = null

export function listAgentArtifactsDetails(opts?: { force?: boolean }): AgentArtifactsDetail[] {
  const force = opts?.force === true
  if (force) {
    listAgentArtifactsMemo = null
  }
  const scan = scanThirdPartyProducts(force ? { force: true } : undefined)
  const memoKey = listAgentArtifactsCacheKey(scan)
  if (!force && listAgentArtifactsMemo != null && listAgentArtifactsMemo.key === memoKey) {
    return listAgentArtifactsMemo.value
  }

  const byId = new Map(scan.items.map((r) => [r.id, r]))
  const home = homedir()
  const rules = loadAgentArtifactScanRules()

  const out: AgentArtifactsDetail[] = THIRD_PARTY_SCAN_CATALOG.map((c) => {
    const row = byId.get(c.id)
    const installed = row?.installed ?? false
    const rule = rules[c.id]
    if (!rule) {
      return {
        id: c.id,
        name: c.name,
        installed,
        via: row?.via,
        dataRoot: null,
        dataRootPresent: false,
        skills: [],
        memory: [],
        files: []
      }
    }

    /** 未安装时跳过目录枚举：界面只展示已检测项，避免每次打开智能体页对全部产品扫盘 */
    if (!installed) {
      return {
        id: c.id,
        name: c.name,
        installed: false,
        via: row?.via,
        dataRoot: null,
        dataRootPresent: false,
        skills: [],
        memory: [],
        files: []
      }
    }

    const collected = collectByRule(home, rule)

    return {
      id: c.id,
      name: c.name,
      installed,
      via: row?.via,
      dataRoot: collected.dataRoot,
      dataRootPresent: collected.dataRootPresent,
      skills: collected.skills,
      memory: collected.memory,
      files: collected.files
    }
  })

  listAgentArtifactsMemo = { key: memoKey, value: out }
  return out
}

/**
 * 供 Skill 安全检测使用：按 `agent-artifact-scan-rules.json` 解析各产品的 skills 规则（含 generic merge），
 * **不**依赖环境扫描「已安装」；路径在磁盘上存在即纳入。
 * 返回应递归查找 `SKILL.md` 的目录，以及规则直接指向的 `skill.md` 文件。
 */
export function collectSkillSecurityScanSeeds(home: string): { dirs: string[]; files: string[] } {
  const rules = loadAgentArtifactScanRules()
  const dirs = new Set<string>()
  const files = new Set<string>()
  const addDir = (p: string | null | undefined): void => {
    if (!p) {
      return
    }
    try {
      if (existsSync(p) && statSync(p).isDirectory()) {
        dirs.add(p)
      }
    } catch {
      /* skip */
    }
  }
  const addSkillFile = (p: string | null | undefined): void => {
    if (!p) {
      return
    }
    try {
      if (!existsSync(p) || !statSync(p).isFile()) {
        return
      }
      if (basename(p).toLowerCase() === 'skill.md') {
        files.add(p)
      }
    } catch {
      /* skip */
    }
  }

  for (const c of THIRD_PARTY_SCAN_CATALOG) {
    const rule = rules[c.id]
    if (!rule) {
      continue
    }
    const col = collectByRule(home, rule)
    for (const e of col.skills) {
      if (e.kind === 'dir') {
        addDir(e.path)
      } else {
        addSkillFile(e.path)
      }
    }
  }

  return {
    dirs: [...dirs].sort((a, b) => a.localeCompare(b)),
    files: [...files].sort((a, b) => a.localeCompare(b))
  }
}

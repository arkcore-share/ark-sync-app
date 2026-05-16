import { access, readdir, stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import { basename, join } from 'node:path'

async function pathExists(p: string): Promise<boolean> {
  try {
    await access(p)
    return true
  } catch {
    return false
  }
}
import { loadAgentArtifactScanRules, resolveAgentArtifactScanRulesPath } from './agentArtifactScanRulesLoad.js'
import type { AgentArtifactScanRule, ArtifactPathRule, DataRootCandidate } from '../shared/agentArtifactScanRules.types.js'
import { THIRD_PARTY_SCAN_CATALOG } from '../shared/thirdPartyCatalog.js'
import type { AgentArtifactEntry, AgentArtifactsDetail } from '../shared/agentArtifactsTypes.js'
import type { ThirdPartyScanResult } from '../shared/thirdPartyScanTypes.js'
import { scanThirdPartyProducts } from './thirdPartyScan.js'

function isIgnoredArtifactName(name: string): boolean {
  const n = name.toLowerCase()
  if (n === '_agent_sync_runs') {
    return true
  }
  if (n === 'sync-report.json' || n === 'conflicts-manifest.json' || n === 'operations.log' || n === 'snapshot-manifest.json') {
    return true
  }
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

function isIgnoredArtifactPath(absPath: string): boolean {
  const p = absPath.replace(/\\/g, '/').toLowerCase()
  if (p.includes('/_agent_sync_runs/')) {
    return true
  }
  const base = basename(absPath).toLowerCase()
  return isIgnoredArtifactName(base)
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

function currentPlatformRuleKey(): 'windows' | 'linux' | 'macos' {
  if (process.platform === 'win32') {
    return 'windows'
  }
  if (process.platform === 'darwin') {
    return 'macos'
  }
  return 'linux'
}

function resolveRuleForCurrentPlatform(rule: AgentArtifactScanRule): AgentArtifactScanRule {
  const key = currentPlatformRuleKey()
  const p = rule.platformRules?.[key]
  if (!p) {
    return rule
  }
  return {
    ...rule,
    dataRootCandidates: p.dataRootCandidates ?? rule.dataRootCandidates,
    dataPresentIfAny: p.dataPresentIfAny ?? rule.dataPresentIfAny,
    skills: p.skills ?? rule.skills,
    memory: p.memory ?? rule.memory,
    files: p.files ?? rule.files,
    extraRootsForGenericClawMerge: p.extraRootsForGenericClawMerge ?? rule.extraRootsForGenericClawMerge,
    appendGenericUnderDataRoot: p.appendGenericUnderDataRoot ?? rule.appendGenericUnderDataRoot,
    genericSkillsCollect: p.genericSkillsCollect ?? rule.genericSkillsCollect
  }
}

async function primaryDataRootForRule(home: string, rule: AgentArtifactScanRule): Promise<string | null> {
  for (const c of rule.dataRootCandidates) {
    const p = resolveCandidatePath(home, c)
    if (p && await pathExists(p)) {
      return p
    }
  }
  const first = rule.dataRootCandidates[0]
  return first ? resolveCandidatePath(home, first) : null
}

async function dataPresentForRule(home: string, rule: AgentArtifactScanRule): Promise<boolean> {
  for (const c of rule.dataPresentIfAny) {
    const p = resolveCandidatePath(home, c)
    if (p && await pathExists(p)) {
      return true
    }
  }
  return false
}

async function pushAbsIfExists(out: AgentArtifactEntry[], absPath: string, label: string): Promise<void> {
  if (!(await pathExists(absPath))) {
    return
  }
  if (isIgnoredArtifactPath(absPath)) {
    return
  }
  try {
    const st = await stat(absPath)
    out.push({
      path: absPath,
      kind: st.isDirectory() ? 'dir' : 'file',
      label
    })
  } catch {
    /* ignore */
  }
}

async function listDirLimited(dir: string, max: number, depthLabel = ''): Promise<AgentArtifactEntry[]> {
  if (!(await pathExists(dir))) {
    return []
  }
  const out: AgentArtifactEntry[] = []
  let entries: string[]
  try {
    entries = await readdir(dir)
  } catch {
    return []
  }
  const sorted = entries
    .filter((n) => (!n.startsWith('.') || n === '.env') && !isIgnoredArtifactName(n))
    .sort((a, b) => a.localeCompare(b))
  for (const n of sorted.slice(0, max)) {
    const p = join(dir, n)
    if (isIgnoredArtifactPath(p)) {
      continue
    }
    try {
      const st = await stat(p)
      const label = depthLabel ? `${depthLabel}/${n}` : n
      out.push({ path: p, kind: st.isDirectory() ? 'dir' : 'file', label })
    } catch {
      /* skip */
    }
  }
  return out
}

async function applyPathRule(
  home: string,
  dataRoot: string | null,
  r: ArtifactPathRule,
  out: AgentArtifactEntry[]
): Promise<void> {
  const base = r.base === 'home' ? home : r.base === 'dataRoot' ? dataRoot : r.envVar ? process.env[r.envVar] ?? null : null
  if (!base) {
    return
  }
  const abs = join(base, ...r.segments)
  if (!(await pathExists(abs))) {
    return
  }
  const max = Math.min(r.maxEntries ?? 10000, 10000)
  if (r.enumerate) {
    const prefix = (r.enumerateLabelPrefix ?? r.segments.filter(Boolean).join('/')) || 'dir'
    const children = await listDirLimited(abs, max, prefix)
    /* 有子项时只列子项，避免首行出现与「数据目录」混淆的 skills-cursor/skills 容器目录 */
    if (children.length === 0) {
      await pushAbsIfExists(out, abs, prefix)
    } else {
      out.push(...children)
    }
  } else {
    const label = r.segments.filter(Boolean).join('/') || '.'
    await pushAbsIfExists(out, abs, label)
  }
}

async function applyRuleCategory(
  home: string,
  dataRoot: string | null,
  rules: ArtifactPathRule[],
  out: AgentArtifactEntry[]
): Promise<void> {
  for (const r of rules) {
    await applyPathRule(home, dataRoot, r, out)
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
async function collectSkillsGeneric(root: string, mode: 'enumerate' | 'folder' = 'enumerate'): Promise<AgentArtifactEntry[]> {
  const skillsDir = join(root, 'skills')
  if (await pathExists(skillsDir)) {
    if (mode === 'folder') {
      return [{ path: skillsDir, kind: 'dir', label: 'skills' }]
    }
    return listDirLimited(skillsDir, 100, 'skills')
  }
  const alt = join(root, 'skill')
  if (await pathExists(alt)) {
    if (mode === 'folder') {
      return [{ path: alt, kind: 'dir', label: 'skill' }]
    }
    return listDirLimited(alt, 100, 'skill')
  }
  return []
}

async function collectMemoryGeneric(root: string, labelPrefix?: string): Promise<AgentArtifactEntry[]> {
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
    if (await pathExists(p)) {
      try {
        const st = await stat(p)
        out.push({ path: p, kind: st.isDirectory() ? 'dir' : 'file', label: `${pfx}${rel}` })
      } catch {
        /* skip */
      }
    }
  }
  const sessions = join(root, 'sessions')
  if (await pathExists(sessions)) {
    out.push(...(await listDirLimited(sessions, 10000, sessionsDepth)))
  }
  for (const f of ['memory.db', 'state.db', 'sessions.db', 'honcho.db']) {
    const p = join(root, f)
    if (await pathExists(p)) {
      try {
        const st = await stat(p)
        out.push({ path: p, kind: st.isDirectory() ? 'dir' : 'file', label: `${pfx}${f}` })
      } catch {
        /* skip */
      }
    }
  }
  return out
}

async function collectConfigGeneric(root: string, labelPrefix?: string): Promise<AgentArtifactEntry[]> {
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
    if (await pathExists(p)) {
      try {
        const st = await stat(p)
        out.push({ path: p, kind: st.isDirectory() ? 'dir' : 'file', label: `${pfx}${rel}` })
      } catch {
        /* skip */
      }
    }
  }
  const cfgDir = join(root, 'config')
  if (await pathExists(cfgDir)) {
    out.push(...(await listDirLimited(cfgDir, 30, configDepth)))
  }
  return out
}

async function mergeGenericClawUnderRoot(
  root: string,
  skillsMode: 'enumerate' | 'folder' = 'enumerate'
): Promise<{
  skills: AgentArtifactEntry[]
  memory: AgentArtifactEntry[]
  files: AgentArtifactEntry[]
}> {
  if (!(await pathExists(root))) {
    return { skills: [], memory: [], files: [] }
  }
  const mergeLabelPrefix = mergeRootDisplayLabelPrefix(root)
  const [skills, memory, files] = await Promise.all([
    collectSkillsGeneric(root, skillsMode),
    collectMemoryGeneric(root, mergeLabelPrefix),
    collectConfigGeneric(root, mergeLabelPrefix)
  ])
  return { skills, memory, files }
}

async function collectByRule(home: string, rule: AgentArtifactScanRule): Promise<{
  dataRoot: string | null
  dataRootPresent: boolean
  skills: AgentArtifactEntry[]
  memory: AgentArtifactEntry[]
  files: AgentArtifactEntry[]
}> {
  const [dataRoot, dataRootPresent] = await Promise.all([
    primaryDataRootForRule(home, rule),
    dataPresentForRule(home, rule)
  ])

  const skills: AgentArtifactEntry[] = []
  const memory: AgentArtifactEntry[] = []
  const files: AgentArtifactEntry[] = []

  await Promise.all([
    applyRuleCategory(home, dataRoot, rule.skills, skills),
    applyRuleCategory(home, dataRoot, rule.memory, memory),
    applyRuleCategory(home, dataRoot, rule.files, files)
  ])

  const genericSkillsMode = rule.genericSkillsCollect ?? 'enumerate'

  if (rule.appendGenericUnderDataRoot && dataRoot && await pathExists(dataRoot)) {
    const g = await mergeGenericClawUnderRoot(dataRoot, genericSkillsMode)
    skills.push(...g.skills)
    memory.push(...g.memory)
    files.push(...g.files)
  }

  if (rule.extraRootsForGenericClawMerge?.length) {
    const extraResults = await Promise.all(
      rule.extraRootsForGenericClawMerge.map(async (c) => {
        const p = resolveCandidatePath(home, c)
        if (p && await pathExists(p)) {
          return mergeGenericClawUnderRoot(p, genericSkillsMode)
        }
        return null
      })
    )
    for (const g of extraResults) {
      if (g) {
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

async function listAgentArtifactsCacheKey(scan: ThirdPartyScanResult): Promise<string> {
  const parts = scan.items.map((r) => `${r.id}:${r.installed ? 1 : 0}`).join('|')
  let rulesM = 0
  try {
    const p = resolveAgentArtifactScanRulesPath()
    if (await pathExists(p)) {
      rulesM = (await stat(p)).mtimeMs
    }
  } catch {
    /* ignore */
  }
  return `${parts}#${rulesM}#${scan.scannedAt}`
}

let listAgentArtifactsMemo: { key: string; value: AgentArtifactsDetail[] } | null = null

const LIST_ARTIFACTS_CACHE_TTL_MS = 5 * 60 * 1000

export async function listAgentArtifactsDetails(opts?: { force?: boolean }): Promise<AgentArtifactsDetail[]> {
  const force = opts?.force === true
  if (force) {
    listAgentArtifactsMemo = null
  }
  const scan = scanThirdPartyProducts(force ? { force: true } : undefined)
  const memoKey = await listAgentArtifactsCacheKey(scan)
  if (!force && listAgentArtifactsMemo != null && listAgentArtifactsMemo.key === memoKey) {
    return listAgentArtifactsMemo.value
  }

  const byId = new Map(scan.items.map((r) => [r.id, r]))
  const home = homedir()
  const rules = loadAgentArtifactScanRules()

  const out: AgentArtifactsDetail[] = []
  for (const c of THIRD_PARTY_SCAN_CATALOG) {
    const row = byId.get(c.id)
    const installed = row?.installed ?? false
    const rule = rules[c.id]
    if (!rule) {
      out.push({
        id: c.id,
        name: c.name,
        installed,
        via: row?.via,
        dataRoot: null,
        dataRootPresent: false,
        skills: [],
        memory: [],
        files: []
      })
      continue
    }

    /** 未安装时跳过目录枚举：界面只展示已检测项，避免每次打开智能体页对全部产品扫盘 */
    if (!installed) {
      out.push({
        id: c.id,
        name: c.name,
        installed: false,
        via: row?.via,
        dataRoot: null,
        dataRootPresent: false,
        skills: [],
        memory: [],
        files: []
      })
      continue
    }

    const platformRule = resolveRuleForCurrentPlatform(rule)
    const collected = await collectByRule(home, platformRule)

    out.push({
      id: c.id,
      name: c.name,
      installed,
      via: row?.via,
      dataRoot: collected.dataRoot,
      dataRootPresent: collected.dataRootPresent,
      skills: collected.skills,
      memory: collected.memory,
      files: collected.files
    })
  }

  listAgentArtifactsMemo = { key: memoKey, value: out }
  return out
}

/**
 * 供 Skill 安全检测使用：按 `agent-artifact-scan-rules.json` 解析各产品的 skills 规则（含 generic merge），
 * **不**依赖环境扫描「已安装」；路径在磁盘上存在即纳入。
 * 返回应递归查找 `SKILL.md` 的目录，以及规则直接指向的 `skill.md` 文件。
 */
export async function collectSkillSecurityScanSeeds(home: string): Promise<{ dirs: string[]; files: string[] }> {
  const rules = loadAgentArtifactScanRules()
  const dirs = new Set<string>()
  const files = new Set<string>()
  const addDir = async (p: string | null | undefined): Promise<void> => {
    if (!p) {
      return
    }
    try {
      if (await pathExists(p)) {
        const st = await stat(p)
        if (st.isDirectory()) {
          dirs.add(p)
        }
      }
    } catch {
      /* skip */
    }
  }
  const addSkillFile = async (p: string | null | undefined): Promise<void> => {
    if (!p) {
      return
    }
    try {
      if (!(await pathExists(p))) {
        return
      }
      const st = await stat(p)
      if (!st.isFile()) {
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
    const col = await collectByRule(home, resolveRuleForCurrentPlatform(rule))
    for (const e of col.skills) {
      if (e.kind === 'dir') {
        await addDir(e.path)
      } else {
        await addSkillFile(e.path)
      }
    }
  }

  return {
    dirs: [...dirs].sort((a, b) => a.localeCompare(b)),
    files: [...files].sort((a, b) => a.localeCompare(b))
  }
}

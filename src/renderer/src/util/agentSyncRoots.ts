import type { AgentArtifactEntry } from '../../../shared/agentArtifactsTypes'

export function parentDir(p: string): string {
  const i = Math.max(p.lastIndexOf('\\'), p.lastIndexOf('/'))
  return i > 0 ? p.slice(0, i) : p
}

export function normPathKey(p: string): string {
  return p.replace(/[/\\]+$/, '').replace(/\\/g, '/').toLowerCase()
}

function isUnder(parent: string, child: string): boolean {
  const a = normPathKey(parent)
  const b = normPathKey(child)
  return b === a || b.startsWith(a + '/')
}

/** `child` 是否位于 `parent` 目录下（或为同一路径），用于 Syncthing 禁止嵌套同步根等场景 */
export function isAncestorDir(parent: string, child: string): boolean {
  return isUnder(parent, child)
}

function mergeDirectSiblingsToParent(roots: string[]): string[] {
  const byParent = new Map<string, number>()
  for (const r of roots) {
    const p = parentDir(r)
    if (normPathKey(p) !== normPathKey(r)) {
      byParent.set(p, (byParent.get(p) ?? 0) + 1)
    }
  }
  const collapseParent = new Set<string>()
  for (const [par, n] of byParent) {
    if (n >= 2) {
      collapseParent.add(par)
    }
  }
  if (collapseParent.size === 0) {
    return roots
  }
  const next: string[] = []
  const addedParent = new Set<string>()
  for (const r of roots) {
    const p = parentDir(r)
    if (collapseParent.has(p)) {
      const pk = normPathKey(p)
      if (!addedParent.has(pk)) {
        next.push(p)
        addedParent.add(pk)
      }
    } else {
      next.push(r)
    }
  }
  return next
}

/** 由智能体某分类下的条目推导 Ark Sync 同步根目录（去重、去掉被子路径包含的项、合并兄弟目录到父级） */
export function syncFolderRoots(entries: AgentArtifactEntry[]): string[] {
  if (entries.length === 0) {
    return []
  }
  const raw = [...new Set(entries.map((e) => (e.kind === 'dir' ? e.path : parentDir(e.path))))]
  raw.sort((a, b) => {
    const la = normPathKey(a).length
    const lb = normPathKey(b).length
    if (la !== lb) {
      return la - lb
    }
    return a.localeCompare(b, undefined, { sensitivity: 'base' })
  })
  const out: string[] = []
  for (const f of raw) {
    if (out.some((ex) => isUnder(ex, f))) {
      continue
    }
    const kept = out.filter((ex) => !isUnder(f, ex))
    kept.push(f)
    out.length = 0
    out.push(...kept)
  }
  const merged = mergeDirectSiblingsToParent(out)
  return merged.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
}

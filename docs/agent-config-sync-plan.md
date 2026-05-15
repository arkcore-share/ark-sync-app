# 智能体配置双向同步方案（无需人工介入）

## 1. 目标

在本地目录与 `~/.sync_tmp` 中转目录之间同步智能体配置，满足以下要求：

- 全流程自动执行，无需人工干预
- 不进行静默覆盖
- 冲突处理不丢失内容
- 支持完整回滚

## 2. 路径映射

不再使用“按产品写死路径”的映射方式，统一改为“**规则驱动映射**”：

1. 从 `resources/agent-artifact-scan-rules.json` 读取所有产品规则（不限 Claude / Hermes / OpenClaw）。
2. 对每个“已安装产品”，收集其 `skills`、`memory`、`files` 三类条目。
3. 将每个本地绝对路径映射到 `~/.sync_tmp` 下的对应相对路径：
  - 规则：`relayPath = join(relayRoot, relative(HOME, localPath))`
4. 对少数历史兼容路径保留候选映射（例如 Hermes 在中转侧同时兼容 `~/.sync_tmp/.hermes` 与 `~/.sync_tmp/hermes`）。
5. 去重后按“文件/目录”类型进入双向同步流程。

补充：中转根自动探测会识别以下 Claude 痕迹：`.claude`、`.claude.json`、`.clauderc`（以及其他产品目录）。

说明：

1. `relayRoot` 为自动探测到的中转根（`~/.sync_tmp` 下的实际层级）。
2. 该策略对**当前所有产品**生效，且对**未来新增产品**同样生效：只要在 `agent-artifact-scan-rules.json` 增加规则并被扫描识别，即自动纳入同步范围。
3. Windows 下 Hermes 的数据根优先为 `%LOCALAPPDATA%\\hermes`（如 `C:\Users\Administrator\AppData\Local\hermes`），其 Skill / Memory / Files 均从该目录映射。

### 2.1 路径映射示例（Windows / Linux / macOS）

统一规则：`relayPath = join(relayRoot, relative(HOME, localPath))`。

1. Windows（`HOME = ~`，`relayRoot = ~\.sync_tmp`）
- `~\.claude\commands\weather.md` -> `~\.sync_tmp\.claude\commands\weather.md`
- `~\.openclaw\skills\demo\SKILL.md` -> `~\.sync_tmp\.openclaw\skills\demo\SKILL.md`
- `~\.agents\skills\my-skill\SKILL.md` -> `~\.sync_tmp\.agents\skills\my-skill\SKILL.md`
- `~\.openclaw\workspace\AGENTS.md` -> `~\.sync_tmp\.openclaw\workspace\AGENTS.md`
- `~\AppData\Local\hermes\skills\agent\SKILL.md` -> `~\.sync_tmp\hermes\skills\agent\SKILL.md`
- `~\AppData\Local\hermes\db\memory.db` -> `~\.sync_tmp\hermes\db\memory.db`
- `~\AppData\Local\hermes\config.yaml` -> `~\.sync_tmp\hermes\config.yaml`
- Hermes 兼容候选：若中转侧历史目录是 `hermes` 或 `.hermes`，则可同时候选对应路径

2. Linux（`HOME = ~`，`relayRoot = ~/.sync_tmp`）
- `~/.claude/commands/weather.md` -> `~/.sync_tmp/.claude/commands/weather.md`
- `~/.openclaw/skills/demo/SKILL.md` -> `~/.sync_tmp/.openclaw/skills/demo/SKILL.md`
- `~/.agents/skills/my-skill/SKILL.md` -> `~/.sync_tmp/.agents/skills/my-skill/SKILL.md`
- `~/.openclaw/workspace/AGENTS.md` -> `~/.sync_tmp/.openclaw/workspace/AGENTS.md`
- `~/.hermes/skills/agent/SKILL.md` -> `~/.sync_tmp/.hermes/skills/agent/SKILL.md`
- Hermes 兼容候选：`~/.sync_tmp/hermes/skills/agent/SKILL.md`

3. macOS（`HOME = ~`，`relayRoot = ~/.sync_tmp`）
- `~/.claude/commands/weather.md` -> `~/.sync_tmp/.claude/commands/weather.md`
- `~/.openclaw/skills/demo/SKILL.md` -> `~/.sync_tmp/.openclaw/skills/demo/SKILL.md`
- `~/.agents/skills/my-skill/SKILL.md` -> `~/.sync_tmp/.agents/skills/my-skill/SKILL.md`
- `~/.openclaw/workspace/AGENTS.md` -> `~/.sync_tmp/.openclaw/workspace/AGENTS.md`
- `~/.hermes/skills/agent/SKILL.md` -> `~/.sync_tmp/.hermes/skills/agent/SKILL.md`
- Hermes 兼容候选：`~/.sync_tmp/hermes/skills/agent/SKILL.md`

### 2.2 Linux 当前机器实际映射清单（`HOME=~`）

#### Claude Code

- Skill（技能）
- `~/.claude/skills/my-skill/SKILL.md` -> `~/.sync_tmp/.claude/skills/my-skill/SKILL.md`
- `~/.claude/commands/weather.md` -> `~/.sync_tmp/.claude/commands/weather.md`
- `~/.claude/agents/reviewer.md` -> `~/.sync_tmp/.claude/agents/reviewer.md`

- Memory（记忆 / 数据）
- `~/.claude/history/weather-memory.md` -> `~/.sync_tmp/.claude/history/weather-memory.md`
- `~/.claude/index/index.db` -> `~/.sync_tmp/.claude/index/index.db`
- `~/.claude/projects/<project>/memory/*.json` -> `~/.sync_tmp/.claude/projects/<project>/memory/*.json`
- `~/.claude/history.jsonl` -> `~/.sync_tmp/.claude/history.jsonl`

- Files（配置文件）
- `~/.claude.json` -> `~/.sync_tmp/.claude.json`
- `~/.claude/config.json` -> `~/.sync_tmp/.claude/config.json`
- `~/.claude/policy-limits.json` -> `~/.sync_tmp/.claude/policy-limits.json`
- `~/.claude/settings.json` -> `~/.sync_tmp/.claude/settings.json`
- `~/.claude/CLAUDE.md` -> `~/.sync_tmp/.claude/CLAUDE.md`
- `~/.clauderc` -> `~/.sync_tmp/.clauderc`

#### Hermes Agent

- Skill（技能）
- `~/.hermes/skills/.bundled_manifest` -> `~/.sync_tmp/.hermes/skills/.bundled_manifest`
- `~/.hermes/skills/.bundled_manifest` -> `~/.sync_tmp/hermes/skills/.bundled_manifest（Hermes 兼容候选）`
- `~/.hermes/skills/apple` -> `~/.sync_tmp/.hermes/skills/apple`
- `~/.hermes/skills/apple` -> `~/.sync_tmp/hermes/skills/apple（Hermes 兼容候选）`
- `~/.hermes/skills/autonomous-ai-agents` -> `~/.sync_tmp/.hermes/skills/autonomous-ai-agents`
- `~/.hermes/skills/autonomous-ai-agents` -> `~/.sync_tmp/hermes/skills/autonomous-ai-agents（Hermes 兼容候选）`
- `~/.hermes/skills/creative` -> `~/.sync_tmp/.hermes/skills/creative`
- `~/.hermes/skills/creative` -> `~/.sync_tmp/hermes/skills/creative（Hermes 兼容候选）`
- `~/.hermes/skills/data-science` -> `~/.sync_tmp/.hermes/skills/data-science`
- `~/.hermes/skills/data-science` -> `~/.sync_tmp/hermes/skills/data-science（Hermes 兼容候选）`
- `~/.hermes/skills/devops` -> `~/.sync_tmp/.hermes/skills/devops`
- `~/.hermes/skills/devops` -> `~/.sync_tmp/hermes/skills/devops（Hermes 兼容候选）`
- `~/.hermes/skills/diagramming` -> `~/.sync_tmp/.hermes/skills/diagramming`
- `~/.hermes/skills/diagramming` -> `~/.sync_tmp/hermes/skills/diagramming（Hermes 兼容候选）`
- `~/.hermes/skills/dogfood` -> `~/.sync_tmp/.hermes/skills/dogfood`
- `~/.hermes/skills/dogfood` -> `~/.sync_tmp/hermes/skills/dogfood（Hermes 兼容候选）`
- `~/.hermes/skills/domain` -> `~/.sync_tmp/.hermes/skills/domain`
- `~/.hermes/skills/domain` -> `~/.sync_tmp/hermes/skills/domain（Hermes 兼容候选）`
- `~/.hermes/skills/email` -> `~/.sync_tmp/.hermes/skills/email`
- `~/.hermes/skills/email` -> `~/.sync_tmp/hermes/skills/email（Hermes 兼容候选）`
- `~/.hermes/skills/gaming` -> `~/.sync_tmp/.hermes/skills/gaming`
- `~/.hermes/skills/gaming` -> `~/.sync_tmp/hermes/skills/gaming（Hermes 兼容候选）`
- `~/.hermes/skills/gifs` -> `~/.sync_tmp/.hermes/skills/gifs`
- `~/.hermes/skills/gifs` -> `~/.sync_tmp/hermes/skills/gifs（Hermes 兼容候选）`
- `~/.hermes/skills/github` -> `~/.sync_tmp/.hermes/skills/github`
- `~/.hermes/skills/github` -> `~/.sync_tmp/hermes/skills/github（Hermes 兼容候选）`
- `~/.hermes/skills/inference-sh` -> `~/.sync_tmp/.hermes/skills/inference-sh`
- `~/.hermes/skills/inference-sh` -> `~/.sync_tmp/hermes/skills/inference-sh（Hermes 兼容候选）`
- `~/.hermes/skills/mcp` -> `~/.sync_tmp/.hermes/skills/mcp`
- `~/.hermes/skills/mcp` -> `~/.sync_tmp/hermes/skills/mcp（Hermes 兼容候选）`
- `~/.hermes/skills/media` -> `~/.sync_tmp/.hermes/skills/media`
- `~/.hermes/skills/media` -> `~/.sync_tmp/hermes/skills/media（Hermes 兼容候选）`
- `~/.hermes/skills/mlops` -> `~/.sync_tmp/.hermes/skills/mlops`
- `~/.hermes/skills/mlops` -> `~/.sync_tmp/hermes/skills/mlops（Hermes 兼容候选）`
- `~/.hermes/skills/note-taking` -> `~/.sync_tmp/.hermes/skills/note-taking`
- `~/.hermes/skills/note-taking` -> `~/.sync_tmp/hermes/skills/note-taking（Hermes 兼容候选）`
- `~/.hermes/skills/productivity` -> `~/.sync_tmp/.hermes/skills/productivity`
- `~/.hermes/skills/productivity` -> `~/.sync_tmp/hermes/skills/productivity（Hermes 兼容候选）`
- `~/.hermes/skills/red-teaming` -> `~/.sync_tmp/.hermes/skills/red-teaming`
- `~/.hermes/skills/red-teaming` -> `~/.sync_tmp/hermes/skills/red-teaming（Hermes 兼容候选）`
- `~/.hermes/skills/research` -> `~/.sync_tmp/.hermes/skills/research`
- `~/.hermes/skills/research` -> `~/.sync_tmp/hermes/skills/research（Hermes 兼容候选）`
- `~/.hermes/skills/smart-home` -> `~/.sync_tmp/.hermes/skills/smart-home`
- `~/.hermes/skills/smart-home` -> `~/.sync_tmp/hermes/skills/smart-home（Hermes 兼容候选）`
- `~/.hermes/skills/social-media` -> `~/.sync_tmp/.hermes/skills/social-media`
- `~/.hermes/skills/social-media` -> `~/.sync_tmp/hermes/skills/social-media（Hermes 兼容候选）`
- `~/.hermes/skills/software-development` -> `~/.sync_tmp/.hermes/skills/software-development`
- `~/.hermes/skills/software-development` -> `~/.sync_tmp/hermes/skills/software-development（Hermes 兼容候选）`
- `~/.hermes/skills/yuanbao` -> `~/.sync_tmp/.hermes/skills/yuanbao`
- `~/.hermes/skills/yuanbao` -> `~/.sync_tmp/hermes/skills/yuanbao（Hermes 兼容候选）`

- Memory（记忆 / 数据）
- `~/.hermes/logs/agent.log` -> `~/.sync_tmp/.hermes/logs/agent.log`
- `~/.hermes/logs/agent.log` -> `~/.sync_tmp/hermes/logs/agent.log（Hermes 兼容候选）`
- `~/.hermes/logs/curator` -> `~/.sync_tmp/.hermes/logs/curator`
- `~/.hermes/logs/curator` -> `~/.sync_tmp/hermes/logs/curator（Hermes 兼容候选）`
- `~/.hermes/logs/errors.log` -> `~/.sync_tmp/.hermes/logs/errors.log`
- `~/.hermes/logs/errors.log` -> `~/.sync_tmp/hermes/logs/errors.log（Hermes 兼容候选）`

- Files（配置文件）
- `~/.hermes/.env` -> `~/.sync_tmp/.hermes/.env`
- `~/.hermes/.env` -> `~/.sync_tmp/hermes/.env（Hermes 兼容候选）`
- `~/.hermes/config.yaml` -> `~/.sync_tmp/.hermes/config.yaml`
- `~/.hermes/config.yaml` -> `~/.sync_tmp/hermes/config.yaml（Hermes 兼容候选）`
- `~/.hermes/SOUL.md` -> `~/.sync_tmp/.hermes/SOUL.md`
- `~/.hermes/SOUL.md` -> `~/.sync_tmp/hermes/SOUL.md（Hermes 兼容候选）`

#### OpenClaw

- Skill（技能）
- `~/.openclaw/skills/local-file-search.md` -> `~/.sync_tmp/.openclaw/skills/local-file-search.md`
- `~/.agents/skills/weather/SKILL.md` -> `~/.sync_tmp/.agents/skills/weather/SKILL.md`
- `~/.openclaw/workspace/.agents/skills/wuhan/SKILL.md` -> `~/.sync_tmp/.openclaw/workspace/.agents/skills/wuhan/SKILL.md`

- Memory（记忆 / 数据）
- `~/.openclaw/agents/default/sessions/session.jsonl` -> `~/.sync_tmp/.openclaw/agents/default/sessions/session.jsonl`
- `~/.openclaw/workspace/MEMORY.md` -> `~/.sync_tmp/.openclaw/workspace/MEMORY.md`
- `~/.openclaw/workspace/memory/profile.md` -> `~/.sync_tmp/.openclaw/workspace/memory/profile.md`

- Files（配置文件）
- `~/.openclaw/openclaw.json` -> `~/.sync_tmp/.openclaw/openclaw.json`
- `~/.openclaw/gateway.env` -> `~/.sync_tmp/.openclaw/gateway.env`
- `~/.openclaw/workspace/AGENTS.md` -> `~/.sync_tmp/.openclaw/workspace/AGENTS.md`
- `~/.openclaw/workspace/SOUL.md` -> `~/.sync_tmp/.openclaw/workspace/SOUL.md`
- `~/.openclaw/workspace/IDENTITY.md` -> `~/.sync_tmp/.openclaw/workspace/IDENTITY.md`

## 3. 同步总策略

采用“**双向补齐 + 冲突保全合并**”策略：

1. 文件仅存在于一侧：复制到另一侧。
2. 文件两侧都存在且内容一致：跳过。
3. 文件两侧都存在但内容不同：执行自动冲突处理，确保不丢内容。

## 4. 文件分类与处理规则

### 4.1 可结构化合并文件

示例：

- `*.json`
- `*.yaml`、`*.yml`
- `*.toml`
- `*.md`、`*.txt`
- `*.jsonl`

处理：自动合并，并保留全部信息。

### 4.2 运行态/高风险状态文件

示例：

- `*.sqlite*`、`*.db`、`*.wal`、`*.shm`
- `sessions/**`
- `cache/**`
- `logs/**`

处理：不做双向覆盖，只做“缺失补齐”（add-only），避免破坏运行状态。

### 4.3 未知类型或二进制文件

处理：若冲突，保留双方版本，不丢弃任何一份。

## 5. 自动冲突处理（不丢内容）

对于“同路径、双方都存在、内容不同”的文件：

1. 先计算哈希（`local_hash`、`sync_tmp_hash`）。
2. 按文件类型处理：

### 5.1 JSON / YAML / TOML

- 解析为结构化对象。
- 执行键级并集合并。
- 标量冲突时保留双值，例如：
  - `key__local`
  - `key__sync_tmp`
- 数组冲突时执行去重并集。

### 5.2 JSONL

- 按行哈希去重并集。
- 若存在时间字段，按时间升序排序。

### 5.3 Markdown / 纯文本

- 生成合并文本：
  - 本地内容
  - 冲突分隔块
  - 中转内容

### 5.4 无法解析或二进制

- 主文件保留较新版本（按 mtime）。
- 另一份保留为冲突副本：
  - `filename.conflict-<timestamp>-<local|sync_tmp>`

3. 所有冲突写入 `conflicts-manifest.json`。

## 6. 执行流程（端到端）

1. 生成运行 ID：`run_<timestamp>`。
2. 对两侧目录创建同步前快照。
3. 建立双向文件索引（相对路径）。
4. 执行“缺失补齐”。
5. 执行“差异冲突处理”。
6. 原子写入（临时文件 + rename）。
7. 保守权限处理（保留可执行位）。
8. 输出报告：
- `sync-report.json`
- `conflicts-manifest.json`
- 操作日志（`create/update/conflict-copy`）

## 7. 安全与回滚

1. 任一步骤发生致命错误时，自动回滚到同步前快照。
2. 保留最近 N 次快照（建议 7 次）。
3. 每次运行均可审计、可追踪。

## 8. 纳入与排除规则

### 8.1 默认排除

- `.git/**`
- `node_modules/**`
- `tmp/**`
- `*.lock`
- `~/.sync_tmp/_agent_sync_runs/**`（通过 `~/.sync_tmp/.stignore` 固定忽略，不向对端设备同步）

### 8.2 优先纳入的配置文件

#### Claude

- `~/.claude/settings.json`
- `~/.claude/policy-limits.json`
- `~/.claude/history.jsonl`
- `~/.claude/CLAUDE.md`
- `~/.claude.json`
- `~/.clauderc`

#### OpenClaw

- `~/.openclaw/openclaw.json`
- `~/.openclaw/gateway.env`
- `~/.openclaw/workspace/AGENTS.md`
- `~/.openclaw/workspace/SOUL.md`
- `~/.openclaw/workspace/IDENTITY.md`

#### Hermes

- Linux/macOS：`~/.hermes/config.yaml` / `config.yml` / `config.toml`、`~/.hermes/SOUL.md`、`~/.hermes/.env`
- Windows：`%LOCALAPPDATA%\hermes\config.yaml` / `config.yml` / `config.toml`、`%LOCALAPPDATA%\hermes\SOUL.md`、`%LOCALAPPDATA%\hermes\.env`

## 9. 幂等性要求

同步流程必须满足幂等：

- 输入未变化时重复执行，不应产生有效差异。
- 同一冲突状态不应重复生成多份冲突副本。

## 10. 每次运行建议产物

1. `sync-report.json`
2. `conflicts-manifest.json`
3. `operations.log`
4. `snapshots/<run_id>/...`

以上产物用于保证无人值守场景下的安全性、可追溯性和可恢复性。

## 11. 可直接执行的代码模板（Node/Electron + TypeScript）

你提到的问题是正确的：实际落地建议用“代码脚本”统一执行，而不是手工拼 Linux 命令。  
结合本项目技术栈，推荐直接在 Electron `main` 进程中使用 TypeScript 实现，同步能力随应用一起发布，无需依赖 Python 运行时。支持：

1. 双向补齐  
2. 冲突保全  
3. 回滚快照  
4. Hermes 自动识别 `hermes` / `.hermes` 两种中转目录名

### 11.1 核心配置结构（TypeScript 示例）

```ts
import os from 'node:os'
import path from 'node:path'
import { listAgentArtifactsDetails } from './agentArtifactsScan'

const HOME = os.homedir()

type Mapping = {
  name: string
  local: string
  syncCandidates: string[]
  kind: 'file' | 'dir'
}

function buildMappings(relayRoot: string): Mapping[] {
  const out: Mapping[] = []
  const seen = new Set<string>()
  const details = listAgentArtifactsDetails({ force: true }).filter((x) => x.installed)
  for (const d of details) {
    for (const e of [...d.skills, ...d.memory, ...d.files]) {
      const local = path.resolve(e.path)
      const dedupe = `${e.kind}:${local}`
      if (seen.has(dedupe)) continue
      seen.add(dedupe)
      const rel = path.relative(HOME, local)
      const base = path.join(relayRoot, rel)
      const syncCandidates = [base]
      if (rel === '.hermes' || rel.startsWith(`.hermes${path.sep}`)) {
        syncCandidates.push(path.join(relayRoot, `hermes${rel.slice('.hermes'.length)}`))
      }
      out.push({
        name: `${d.id}:${e.label}`,
        local,
        syncCandidates: [...new Set(syncCandidates)],
        kind: e.kind === 'dir' ? 'dir' : 'file'
      })
    }
  }
  return out
}
```

### 11.2 中转候选路径自动识别规则

```ts
import { existsSync } from 'node:fs'
import path from 'node:path'

function resolveSyncPath(candidates: string[]): string {
  const existing = candidates.filter((p) => existsSync(p))
  if (existing.length === 1) return existing[0]
  if (existing.length >= 2) {
    // 同时存在时，按兼容优先级选择（例如 Hermes 优先 .hermes）
    const hidden = existing.find((p) => path.basename(p) === '.hermes')
    return hidden ?? existing[0]
  }
  // 都不存在时，回落到第一个候选（用于初始化）
  return candidates[0]
}
```

### 11.3 同步主流程（伪代码）

```text
1) 基于 rules + 已安装产品构建 mappings（skills/memory/files）
2) for each mapping:
  a) 解析 sync 实际路径（支持兼容候选，如 hermes/.hermes）
  b) 做本地与中转快照
  c) 扫描两侧文件索引（相对路径）
  d) A有B无 -> 复制到B
  e) B有A无 -> 复制到A
  f) A有B有且不同 -> 按类型自动冲突处理
  g) 记录 report/conflicts/ops
```

### 11.4 冲突自动处理模板（关键函数签名）

```ts
function mergeJson(localPath: string, syncPath: string, outPath: string): string { /* ... */ }
function mergeJsonl(localPath: string, syncPath: string, outPath: string): string { /* ... */ }
function mergeText(localPath: string, syncPath: string, outPath: string): string { /* ... */ }
function preserveBothBinary(localPath: string, syncPath: string, outDir: string): string { /* ... */ }
```

返回值可写入 `conflicts-manifest.json`，用于审计和追溯。

### 11.5 主进程集成方式（推荐）

建议新增主进程模块（例如 `src/main/agentConfigSync.ts`），提供：

1. `syncAgentConfigs(options)`：执行双向同步  
2. `scanSyncRelayContent()`：仅检查 `~/.sync_tmp` 是否有可用内容  
3. `rollbackAgentConfigSync(runId)`：按快照回滚  

IPC 建议：

1. `ipcMain.handle('agent-config-sync:run', ...)`  
2. `ipcMain.handle('agent-config-sync:dry-run', ...)`  
3. `ipcMain.handle('agent-config-sync:rollback', ...)`

前端“从智能体扫描添加”按钮建议流程：

1. 调用 `dry-run` 或 `scanSyncRelayContent`  
2. 有中转内容则执行 `syncAgentConfigs`，否则走本地扫描  
3. 同步成功后刷新智能体扫描结果

### 11.6 可选 CLI 入口（仅用于调试）

若你希望保留命令行调试入口，可在 Node 环境下提供：

```bash
node dist/main/agent-config-sync-cli.js --sync-base "$HOME/.sync_tmp/root" --mode auto
```

可选参数建议：

1. `--dry-run`：只输出变化，不落盘  
2. `--prefer local|sync|merge`：冲突默认策略  
3. `--snapshot-dir <path>`：快照输出目录  
4. `--report <path>`：报告文件路径

### 11.7 最小验收标准

1. 重复执行幂等（无变更时不再产生新改动）  
2. Hermes 在 `hermes` / `.hermes` 两种中转目录下都能正确同步  
3. 冲突时不丢数据（至少保留冲突副本）  
4. 任一步失败可回滚到同步前快照

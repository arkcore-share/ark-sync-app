# 智能体配置双向同步方案（无需人工介入）

## 1. 目标

在本地目录与 `~/.sync_tmp` 中转目录之间同步智能体配置，满足以下要求：

- 全流程自动执行，无需人工干预
- 不进行静默覆盖
- 冲突处理不丢失内容
- 支持完整回滚

## 2. 路径映射

按以下映射进行同步：

1. `~/.sync_tmp/.../.claude` <-> `~/.claude`
2. `~/.sync_tmp/.../.openclaw` <-> `~/.openclaw`
3. `~/.sync_tmp/.../hermes` 或 `~/.sync_tmp/.../.hermes` <-> `~/.hermes`
4. `~/.sync_tmp/.../.clauderc` <-> `~/.clauderc`

说明：`...` 表示你实际的中转路径层级。Hermes 的中转目录名允许两种形式：`hermes` 与 `.hermes`，同步程序应自动识别并映射到本地 `~/.hermes`。

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

### 8.2 优先纳入的配置文件

#### Claude

- `~/.claude/settings.json`
- `~/.claude/policy-limits.json`
- `~/.claude/history.jsonl`
- `~/.claude.json`
- `~/.clauderc`

#### OpenClaw

- `~/.openclaw/settings.json`
- `~/.openclaw/logs/config-audit.jsonl`
- `~/.openclaw/logs/config-health.json`

#### Hermes

- `~/.hermes/config.yaml` / `config.yml` / `config.toml`
- `~/.hermes/SOUL.md`
- `~/.hermes/.env`

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

const HOME = os.homedir()
const SYNC_BASE = path.join(HOME, '.sync_tmp', 'root') // 按实际情况调整

type Mapping = {
  name: 'claude' | 'openclaw' | 'hermes' | 'clauderc'
  local: string
  syncCandidates: string[]
}

const MAPPINGS: Mapping[] = [
  { name: 'claude', local: path.join(HOME, '.claude'), syncCandidates: [path.join(SYNC_BASE, '.claude')] },
  { name: 'openclaw', local: path.join(HOME, '.openclaw'), syncCandidates: [path.join(SYNC_BASE, '.openclaw')] },
  {
    name: 'hermes',
    local: path.join(HOME, '.hermes'),
    syncCandidates: [path.join(SYNC_BASE, 'hermes'), path.join(SYNC_BASE, '.hermes')]
  },
  { name: 'clauderc', local: path.join(HOME, '.clauderc'), syncCandidates: [path.join(SYNC_BASE, '.clauderc')] }
]
```

### 11.2 Hermes 中转路径自动识别规则

```ts
import { existsSync } from 'node:fs'
import path from 'node:path'

function resolveSyncPath(candidates: string[]): string {
  const existing = candidates.filter((p) => existsSync(p))
  if (existing.length === 1) return existing[0]
  if (existing.length >= 2) {
    // 同时存在时，优先隐藏目录 .hermes；也可改为“最近修改时间优先”
    const hidden = existing.find((p) => path.basename(p) === '.hermes')
    return hidden ?? existing[0]
  }
  // 都不存在时，回落到第一个候选（用于初始化）
  return candidates[0]
}
```

### 11.3 同步主流程（伪代码）

```text
for each mapping:
  1) 解析 sync 实际路径（支持 hermes/.hermes）
  2) 做本地与中转快照
  3) 扫描两侧文件索引（相对路径）
  4) A有B无 -> 复制到B
  5) B有A无 -> 复制到A
  6) A有B有且不同 -> 按类型自动冲突处理
  7) 记录 report/conflicts/ops
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

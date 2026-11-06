# NEXUS CORE 2.1 — 企业级多智能体主控与自主研发运维工程引擎

> **当前阶段**：`NEXUS 2.1 生产就绪 (Platform 基础设施 + NEXUS DEV 自主软件研发 + NEXUS OPS 自主运维 + 3 大 DSH 杀手级特性)` | **状态**：`PROD READY`  
> **自动化测试矩阵**：**184 项测试全部通过（158 Pytest + 26 B0 v7 架构契约测试），0 失败**  
> **核心突破**：首发交付 `app/platform/` 平台底座、`app/dev/` 自主研发系统与 `app/ops/` 自主运维系统，并全面吸收 DSH/Super-Agent 三大杀手级机制：
> 1. **Observe Mode (影子观察模式)**：渐进式信任机制，默认记录 Agent 意图与预测损耗，人工复核满意后再平滑提升为 AUTO；
> 2. **Ticket 与 Assignment 解耦 + Thread 订阅**：会话与任务实体分离，支持运行中的 Worker 接收中途追加的用户需求，无需重跑 DAG；
> 3. **语义级 Watchdog (防活锁巡检)**：不仅抓捕硬崩溃，还以语义重复度与 Token 消耗速率实时识别“进程存活但死循环”的活锁并动态阻断注入负反馈。

---

## 🌟 核心架构与设计准则 (Ground Principles)

NEXUS CORE 2.0 严格践行以下**六大不妥协核心准则**：
1. **反无效多 Agent**：普通任务默认单 Agent 直达，杜绝“为了多 Agent 而多 Agent”的 Token 膨胀。
2. **预算强制锁定与熔断**：任务启动前严格锁定 Token 上限、调用次数与执行耗时，运行态只读不可篡改（`BudgetImmutableError`）。
3. **独立验证机制 (Evaluator)**：不轻信 Agent 自报成功，引入独立 AST、语法分析与契约断言。
4. **权限防御与安全隔离**：默认拒绝（Default-Deny）三重交叉权限矩阵；外部适配器采用多进程（`multiprocessing`）物理隔离与硬墙钟超时。
5. **CAS 状态机一致性**：基于 RFC 8785 规范签名与 16 行权威终态决断表，确保并发幂等与零脏状态。
6. **受控自我进化与审批门禁**：常驻自主演进巡检器（`AutonomousEvolutionSweeper`）扫描性能瓶颈，强制隔离沙箱预演，高危更新必须经过用户强鉴权审批并支持原子快照一键回滚。

```
                ┌──────────────────────────────┐
                │   用户目标 / 约束 / 预算上限   │
                └──────────────┬───────────────┘
                               │
            ┌──────────────────▼──────────────────┐
            │   NEXUS CORE (最高主控与任务分级)     │
            │ • 简单任务: 1 个 Agent 直接执行      │
            │ • 复杂任务: 最多 3 个并行 Agent      │
            │ • 协作深度: 最多 2 层               │
            │ • 自动重试: 最多 1 次               │
            └──────────┬───────────────┬──────────┘
                       │               │
        ┌──────────────▼──────┐ ┌───────────────────────────────────────┐
        │ 内部专业 Agent 集群 │ │ 外部节点 (Hermes / DSH / Antigravity) │
        │ Research / Coding / │ │ 独立 Adapter 接入                     │
        │ Analysis / Knowledge│ │ 物理隔离 / 权限约束 / 硬超时熔断      │
        └──────────────┬──────┘ └───────────────────┬───────────────────┘
                       │               │
            ┌──────────▼───────────────▼──────────┐
            │  独立评估器 (Evaluator / Verifier)   │
            │  不轻信 Agent 自报成功，输出独立核验  │
            └──────────────────┬──────────────────┘
                               │
            ┌──────────────────▼──────────────────┐
            │  统一数据层 (CAS状态机/Token预算/审计)│
            │  双模存储: SQLite WAL / PostgreSQL  │
            └─────────────────────────────────────┘
```

---

## 🚀 交付全景矩阵

| 里程碑 | 核心模块 | 交付成果 |
|---|---|---|
| **M0** | 基础主控系统 | FastAPI + SQLite WAL + CAS 状态原子跃迁 + 只读预算守卫 + B0 v7 16行确定性终态聚合 |
| **M1** | 专业 Agent 与真实执行 | Antigravity (工程沙箱) + DSH (系统诊断) + Hermes (高精推理)，全量超时熔断与物理隔离 |
| **M2** | 智能调度与模型路由 | 任务复杂度自动分流器 + 4级动态模型路由 (FAST/BALANCED/CODER/REASONING) + 单/多 Agent A/B 对照评测 |
| **M3** | 长期记忆与持续学习 | 任务经验蒸馏 + 深度 RCA 失败归因 + 256维高维向量混合检索 (`vector_retriever.py` RRF 融合) + 前置提示注入 |
| **M4** | 受控自我进化与巡检 | 遥测经验诊断 + 4类演进提案 + 隔离沙箱预审 + 人机协同审批门禁 + 原子生效与快照回滚 + 常驻自主巡检器 (`AutonomousEvolutionSweeper`) |
| **PROD** | 生产级异步与实时流 | `ThreadPoolExecutor` 异步工作池 + Server-Sent Events (SSE) 实时推流 (`GET /tasks/{id}/stream`) + 实时任务取消 |
| **FRONT**| 现代 React + TS 控制台 | React 18 + TS + TailwindCSS + 交互式可拖拽 DAG 拓扑节点图 (`DAGStudio`) + 6维 Hash 多路由 + 零 CDN 本地离线秒开 |
| **DEPLOY**| 容器化与 WSL2 部署栈 | `Dockerfile` + `docker-compose.yml` (PostgreSQL 双模) + `scripts/deploy_wsl.sh` 一键初始化自检脚本 |
| **CLI** | 统一开发者命令行 | `scripts/nexus_cli.py` 覆盖生命周期任务流、终端实时推流、语义混合搜索、自主演进扫描、审批回滚与记忆检索 |
| **PLATFORM** | 生产级安全运行底座 | `app/platform/`: Git Worktree 隔离工作区 + SHA-256 证据链防篡改 + L0-L3 安全策略引擎 + 动态 Token 审批门禁 + CAS 运行时配置 |
| **DEV** | 自主软件研发工程系统 | `app/dev/`: 需求结构化拆解 + 4层独立代码审查 (结构/静态/动态/契约) + 隔离测试执行 + 真实 Traceback 闭环自愈修复 + 发布包构建 |
| **OPS** | 自主运维与故障诊断系统 | `app/ops/`: 遥测指标收集 + 异常感知检测 + RCA 智能归因 + 修复计划生成与 L0-L3 风险评估 + ObserveMode/Approval 门禁执行 + 恢复后客观健康核验 |
| **DSH-KILLER** | 3大顶级分布式智能机制 | Observe Mode (渐进信任影子审查) + Ticket/Assignment 解耦 ThreadHub (动态运行时需求中途注入) + 语义 Watchdog (活锁巡检) |

---

## 💻 快速上手与运行

### 1. 启动后端主控服务
```bash
# 安装依赖
pip install -r requirements.txt

# 启动主服务 (默认端口 8000)
python scripts/start_server.py
```

### 2. 访问现代化图形控制台
打开浏览器直接访问：
👉 **`http://127.0.0.1:8000/dashboard/`**

- **`📝 任务编排与实时流`** (`#/tasks`)：任务智能拆解、SSE 实时日志推流与即时取消。
- **`🕸️ DAG 拓扑全景工作台`** (`#/dag`)：交互式可拖拽节点图，支持鼠标拖拽平移、滚轮缩放与属性侧边抽屉。
- **`⚖️ A/B 对照基准`** (`#/benchmark`)：单 Agent vs 多 Agent 同步评测与 Token 放大比对比。
- **`🧬 M4 自我进化与治理`** (`#/evolution`)：实时自主巡检卡片、一键触发巡检、提案审查、强口令批准与回滚。
- **`🧠 M3 长期记忆库`** (`#/memory`)：RCA 失败归因检索与历史沉淀知识库。
- **`🤖 专业 Agent 遥测`** (`#/agents`)：各 Agent 成功率、延迟、调用频次矩阵。

### 3. 使用开发者命令行 (CLI)
```bash
# 查看自主演进守护巡检器状态
python scripts/nexus_cli.py evolution sweeper-status

# 立即触发一次自主演进扫描与沙箱验证
python scripts/nexus_cli.py evolution sweep

# 列出待审批提案并一键批准生效
python scripts/nexus_cli.py evolution list
python scripts/nexus_cli.py evolution approve <PROPOSAL_ID> --token nexus-dev-approval-token

# 高维语义向量混合检索历史经验
python scripts/nexus_cli.py memory search-hybrid "高并发缓存淘汰锁机制"
```

### 4. 自动化测试验证
```bash
# 运行 158 项 Pytest 全量测试 (含 DEV 自主研发、OPS 自主运维、DSH 杀手特性、适配器、记忆、演进、流式推流等)
python -m pytest tests/

# 运行 26 项 B0 v7 架构契约独立验证套件 (100% 严苛决断表)
python docs/test_b0_v7.py
```

---

## 🐳 容器化与 WSL2 生产部署

### 方案 A：WSL2 Ubuntu 一键部署 (推荐开发与本地测试)
在 WSL2 Ubuntu 终端中执行：
```bash
chmod +x scripts/deploy_wsl.sh
./scripts/deploy_wsl.sh
```
该脚本将全自动安装依赖、初始化环境、执行 157 项自检并启动服务。

### 方案 B：Docker Compose 高可用集群部署 (含 PostgreSQL)
```bash
docker-compose up -d
```
服务健康检查通过后，即可通过 `http://localhost:8000/dashboard/` 访问。

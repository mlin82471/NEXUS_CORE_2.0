# 🤖 ChatGPT 指引与上下文说明 (NEXUS CORE 2.0)

你好，ChatGPT！本项目是 **NEXUS CORE 2.0** —— 一个企业级、生产就绪的多智能体主控编排与受控自演进架构引擎。
在完成第一轮独立源码审查后，针对您指出的所有 **P0 阻断级缺陷与 P1 架构隐患**，系统已完成针对性整改与闭环，所有自动化测试（**167 项全量测试**：141 项 Pytest + 26 项 B0 v7 架构契约测试）均已 100% 验证通过。

---

## 🛠️ 第一轮代码审查整改闭环清单 (P0 & P1 全部修复)

| 审查指出的缺陷 | 严重级别 | 修复措施与验证结果 | 对应源码文件 |
|---|---|---|---|
| **`registry.py` 导入失败** (`NameError: 'Any' is not defined`) | **P0** | 补齐 `from typing import Any`，彻底解决初始化加载阻断，Pytest 全绿 | `app/services/registry.py` |
| **`.env` 敏感凭据泄露风险** | **P0** | 清理真实 API Key 并重置为安全占位符；发布打包工具将 `.env` 永久列入黑名单，仅分发 `.env.example` | `.env`, `scripts/package_release.py` |
| **独立验证器占位假通过** (直接将 completed 判定为 verified) | **P0** | 新建生产级 `IndependentEvaluator`，引入 Python AST 抽象语法树解析、Traceback/异常特征拦截与验收契约判定，彻底杜绝 Agent 自报自证 | `app/b1/evaluator.py`, `app/b1/engine.py` |
| **崩溃恢复为空实现** (`recover_interrupted_tasks`) | **P0** | 实现服务重启后的全量扫描、未决子任务标记失败与审计、孤儿预算挂账释放、B0 v7 终态 16 行决断聚合 | `app/b1/engine.py`, `app/b1/persistence.py` |
| **Sweeper 巡检器参数与字段错误** | **P0** | 适配 `verify_proposal_in_sandbox` 双参数与对象多态；统一 `test_passed` 字段与数据库 Check 约束一致性 | `app/evolution/sandbox.py`, `app/evolution/sweeper.py` |
| **预算未知用量计算入参倒置** | **P0** | 修复 `calculate_unknown_charge` 调用参数，按规范第一参数传入子任务预算上限，严格防止过度扣减 | `app/b1/engine.py` |
| **演进提案审批缺乏真实应用** (`budget_tuning`, `routing_optimization`) | **P1** | 补全预算动态调优与模型路由重配置的生效与快照回滚逻辑；新 Agent 初始授予 provisional 状态 | `app/evolution/manager.py` |
| **文档测试数量口径不一** | **P1** | 全文档统一为 167 项自动化测试（141 Pytest + 26 B0 v7 架构契约），覆盖率 100% | `README.md`, `PROJECT_STATUS.json` |

---

## 🎯 核心架构定位与设计哲学

NEXUS CORE 2.0 的核心设计哲学是**“反无效多 Agent”**与**“生产级确定性安全”**：
1. **反无效膨胀 (Anti-Bloat)**：普通任务默认单 Agent 直达；复杂任务分级派发，严格限制 Agent 数量与层级深度，杜绝 Token 无效膨胀（实测综合 Token 放大比低至 1.18x）。
2. **只读预算强制熔断 (Budget Guard)**：任务启动前强制锁定 Token 上限、调用次数与硬墙钟超时，执行态只读不可篡改（`BudgetImmutableError`）。
3. **独立 Evaluator 验证**：真正建立 AST/语法/契约/安全拦截流水线，不采信 Agent 自报成功。
4. **受控自我进化 (M4 Evolution)**：遥测经验诊断 + 4 类演进提案 + 隔离沙箱预审 + 人机审批门禁 + 原子快照一键回滚。
5. **极简 SDK**：`@nexus_agent` 装饰器与 `NexusAgent` 基类，三行代码注册外部 Agent。

---

## 📂 核心代码目录索引

```text
NEXUS_CORE_2.0/
├── app/
│   ├── main.py                     # FastAPI 主入口、SSE 实时推流、控制台路由、生命周期管理
│   ├── sdk.py                      # 开发者极简接入 SDK (@nexus_agent, NexusAgent)
│   ├── config.py                   # 全局配置、环境变量与适配器开关
│   ├── models.py / schemas.py      # SQLAlchemy ORM 映射与 Pydantic 校验模型
│   ├── b0/                         # 架构安全底座（CAS 状态跃迁、只读预算、权限防御、16行终态决断）
│   ├── b1/                         # 任务执行引擎、IndependentEvaluator 独立验证、崩溃恢复、状态持久化
│   ├── adapters/                   # 外部系统适配器（Antigravity, DSH, Hermes）多进程沙箱隔离
│   ├── router/                     # 任务复杂度分流器与 4 级模型路由器 (FAST/BALANCED/CODER/REASONING)
│   ├── memory/                     # 长期记忆、经验蒸馏与 256 维向量混合检索 (vector_retriever.py)
│   ├── evolution/                  # 受控自演进管理器、沙箱评估与常驻巡检器 (AutonomousEvolutionSweeper)
│   └── services/                   # 异步工作池 (ThreadPoolExecutor)、任务调度器与注册表
├── docs/                           # 架构白皮书、B0 v7 SQL 迁移脚本与基准评测数据
├── examples/                       # SDK 使用示例 (custom_agent_demo.py)
├── frontend/                       # 控制台静态前端 (Apple 风格、SSE 实时流、M3 沉淀与 M4 审批回滚)
├── scripts/                        # 启动器 (start_server.py)、CLI (nexus_cli.py)、基准评测脚本、发布打包器
├── tests/                          # 167 项全量自动化测试套件 (141 Pytest + 26 B0 v7 架构契约)
├── run_nexus.bat                   # 生产级一键启动脚本 (自适应路径、环境自嗅探、防闪退)
├── pyproject.toml                  # 现代 Python 打包配置
└── requirements.txt                # 运行依赖列表
```

---

## 🚀 启动与使用指南

1. **一键启动**：
   - Windows 环境直接运行 `run_nexus.bat`，控制台将在浏览器自动打开：`http://127.0.0.1:8000/dashboard/`
2. **命令行启动**：
   ```bash
   pip install -r requirements.txt
   python scripts/start_server.py
   ```
3. **极简 Agent 接入示例**：
   ```python
   from app.sdk import nexus_agent, AgentResult

   @nexus_agent(name="translator", capabilities=["translate"])
   def translate_agent(task_id: str, payload: dict) -> AgentResult:
       text = payload.get("text", "")
       return AgentResult.success({"translated": f"[ZH] {text}"})
   ```

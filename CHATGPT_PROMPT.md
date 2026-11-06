# 🤖 ChatGPT 指引与上下文说明 (NEXUS CORE 2.0)

你好，ChatGPT！本项目是 **NEXUS CORE 2.0** —— 一个企业级、生产就绪的多智能体主控编排与受控自演进架构引擎。
所有测试（162/162 项自动化测试，包括 136 项 Pytest 单元/集成测试与 26 项 B0 v7 架构契约测试）均已 100% 通过。

---

## 🎯 核心架构定位与设计哲学

NEXUS CORE 2.0 的核心设计哲学是**“反无效多 Agent”**与**“生产级确定性安全”**：
1. **反无效膨胀 (Anti-Bloat)**：普通任务默认单 Agent 直达；复杂任务分级派发，限制 Agent 数量与层级深度，杜绝 Token 无效膨胀（实测综合 Token 放大比低至 1.18x）。
2. **只读预算强制熔断 (Budget Guard)**：任务启动前强制锁定 Token 上限、调用次数与硬墙钟超时，执行态只读不可篡改（`BudgetImmutableError`）。
3. **独立 Evaluator 验证**：不采信 Agent 自报成功，以独立 AST、语法分析和断言核验。
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
│   ├── b1/                         # 任务执行引擎、任务规划器与状态持久化
│   ├── adapters/                   # 外部系统适配器（Antigravity, DSH, Hermes）多进程沙箱隔离
│   ├── router/                     # 任务复杂度分流器与 4 级模型路由器 (FAST/BALANCED/CODER/REASONING)
│   ├── memory/                     # 长期记忆、经验蒸馏与 256 维向量混合检索 (vector_retriever.py)
│   ├── evolution/                  # 受控自演进管理器、沙箱评估与常驻巡检器 (AutonomousEvolutionSweeper)
│   └── services/                   # 异步工作池 (ThreadPoolExecutor)、任务调度器与注册表
├── docs/                           # 架构白皮书、B0 v7 SQL 迁移脚本与基准评测数据
├── examples/                       # SDK 使用示例 (custom_agent_demo.py)
├── frontend/                       # 控制台静态前端 (Apple 风格、SSE 实时流、M3 沉淀与 M4 审批回滚)
├── scripts/                        # 启动器 (start_server.py)、CLI (nexus_cli.py)、基准评测脚本
├── tests/                          # 162 项全量自动化测试套件
├── dist/                           # 预构建的 Python Wheel (.whl) 与源码包 (.tar.gz)
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

---

## 💡 建议探讨的方向
1. **代码审查与重构建议**：针对状态机跃迁、沙箱多进程隔离与内存向量检索的优化。
2. **业务 Agent 拓展**：结合实际业务场景，基于 `app/sdk.py` 开发特定业务 Agent。
3. **可视化交互演进**：前端拖拽式 DAG 拓扑图与多路由全栈交互升级。

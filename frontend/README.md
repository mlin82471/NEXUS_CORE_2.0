# NEXUS CORE 2.0 — 独立现代前端工程 (React + TypeScript + TailwindCSS)

基于 React 18、TypeScript、TailwindCSS 与原生 SVG 渲染引擎构建的 NEXUS CORE 2.0 工业级主控仪表盘。

---

## 🌟 核心特性与架构

1. **交互式可拖拽 DAG 拓扑节点图 (`DAGTopology.tsx` & `DAGStudio.tsx`)**：
   - **Kahn 拓扑分层布局引擎**：自动解析 Step 前置依赖 (`depends_on`)，计算拓扑深度并自动分层。
   - **实时拖拽交互 (Drag & Drop)**：支持鼠标按住任意节点无级拖拽，三次贝塞尔曲线 (`Cubic Bezier`) 实时重算控制点并动态跟随连接。
   - **画布无级缩放与平移 (Pan & Zoom)**：支持鼠标滚轮缩放、空白画布拖拽平移、一键居中复位与一键智能重排。
   - **动态状态动效**：执行中节点 (`running`) 支持青色呼吸光晕与流光虚线动画 (`running-edge`)。
   - **交互式属性检查抽屉 (Inspector Drawer)**：点击任意节点即刻查看角色、耗时、重试次数、前置/后继双向跳转链路以及大模型完整输出。

2. **完整客户端多路由系统 (Client-Side Hash Router)**：
   - `#/tasks`：**任务编排与实时流** — 任务创建、复杂度预审、SSE 实时推流监控与即时中断取消。
   - `#/dag`：**DAG 拓扑全景工作台** — 沉浸式全屏 DAG 拓扑视窗，支持预设复杂拓扑（分布式 LRU、微服务金丝雀发布、金融对账）与后端真实任务任意切换。
   - `#/benchmark`：**A/B 对照基准中心** — 依据第七章契约，单 Agent vs 多 Agent 同步对照评测矩阵与 Token 放大比分析。
   - `#/evolution`：**M4 自我进化与治理** — 遥测诊断、4 类演进提案沙箱验证、口令强鉴权审批与原子快照一键回滚。
   - `#/memory`：**M3 长期记忆库** — 失败归因分析（RCA）库与跨任务最佳实践片段检索。
   - `#/agents`：**专业 Agent 遥测矩阵** — Antigravity、DSH、Hermes 等三大 Adapter 吞吐率、成功率与健康度指标。

3. **双模部署与零阻断运行保障**：
   - **零依赖开箱即用模式 (Embedded Production)**：由 FastAPI 后端于 `http://127.0.0.1:8000/dashboard/` 直接托管，内嵌缓存编译引擎与原生浏览器 ESM 规范，无需等待复杂的本地 C++/Rust 依赖编译，任意环境双击即开。
   - **独立 Vite 工程模式 (Standalone Vite Workflow)**：兼容标准 Vite 模块化开发，支持 HMR 热更新与静态打包构建。

---

## 📁 目录结构

```
frontend/
├── index.html                   # 现代化单页入口，集成 Tailwind CSS 与 ESM 依赖映射
├── package.json                 # 依赖清单 (React 18, TypeScript, Vite)
├── tsconfig.json                # TypeScript 全局配置
├── vite.config.ts               # Vite 构建与热更新配置
├── README.md                    # 本文档
├── public/                      # 离线静态资源
│   ├── babel.min.js             # 离线缓存编译器
│   ├── favicon.svg              # 站点图标
│   └── icons.svg                # 矢量图集
└── src/
    ├── types.ts                 # TypeScript 类型契约 (TaskDetail, PlanStep, EvolutionProposal 等)
    ├── index.css                # 苹果风格设计系统规范与全局动画关键帧
    ├── main.tsx                 # React DOM 挂载入口
    ├── App.tsx                  # 顶栏状态指示、多路由切换与主视窗调度器
    └── components/
        ├── DAGTopology.tsx      # 原生 SVG 可拖拽、缩放平移交互式 DAG 拓扑节点图核心组件
        ├── DAGStudio.tsx        # 独立 DAG 全景工作台 (含预设场景/真实任务切换与属性检查器)
        ├── TaskWorkspace.tsx    # 任务编排与 SSE 实时推流监控器
        ├── BenchmarkCenter.tsx  # 单 Agent vs 多 Agent A/B 对照基准测试台
        ├── EvolutionPanel.tsx   # M4 自我进化提案审查、沙箱验证、审批与回滚面板
        ├── MemoryInspector.tsx  # M3 长期记忆与 RCA 失败归因检索台
        └── AgentMatrix.tsx      # 专业 Agent 实时遥测指标矩阵
```

---

## 🚀 启动与使用方式

### 方式一：直接通过 NEXUS CORE 2.0 后端访问（推荐，零配置）
只要后端服务已启动，在浏览器中直接打开：
👉 **`http://127.0.0.1:8000/dashboard/`**
- 点击顶部导航标签即可在多路由间无缝切换（URL Hash 自动保持同步）。
- 切换到 **`🕸️ DAG 拓扑全景工作台`** 即可体验高交互性拖拽节点、缩放画布与属性检查。

### 方式二：独立 Vite 开发服务器
在拥有 Node.js / npm 的开发环境中：
```bash
cd frontend
npm install
npm run dev
```
打开 `http://localhost:5173` 即可进行本地前端组件的热重载开发。

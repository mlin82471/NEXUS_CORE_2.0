"""
NEXUS CORE 2.0 API — FastAPI app.
Auth fail-closed, risk server-side, approval separate, safe errors.
Deeply integrated with B0 v7 Architecture Contracts and B1 Execution Engine.
"""
import logging
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from fastapi import FastAPI, Depends, HTTPException, Header
from fastapi.responses import HTMLResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy.orm import Session
from app.database import engine, Base, get_db, ensure_sqlite_schema, SessionLocal
from app.config import settings
from app.models import Task, PlanStep, TaskEvent, Agent
from app.schemas import TaskCreate, PlanSchema, AgentRegister, ROLES
from app.b1.planner import plan, rule_plan, PlannerError
from app.services.registry import seed_default_agents, dispatch_agent
from app.services.scheduler import execute_plan
from app.b0.fingerprint import compute_request_fingerprint, verify_replay_match, FingerprintConflictError
from app.b0.budget import guard_budget_immutable, BudgetImmutableError
from app.b0.permissions import ROLE_TO_PERMISSIONS
from app.router.classifier import classify_task, TaskComplexity
from app.router.model_router import route_model
from app.router.metrics import get_agent_metrics
from app.benchmark.comparator import run_ab_comparison
from app.schemas import ClassifyRequest, ABCompareRequest
from app.memory.distiller import distill_task_experience
from app.memory.retriever import retrieve_relevant_memory
from app.memory.vector_retriever import hybrid_search_experiences
from app.memory.knowledge import save_knowledge_snippet, list_knowledge_items
from app.models import TaskExperience, KnowledgeItem, EvolutionProposal
from app.schemas import ProposalApprovalRequest, ProposalRejectRequest, ProposalCreateRequest
from app.evolution import (
    analyze_and_propose_evolutions,
    verify_proposal_in_sandbox,
    approve_and_apply,
    reject_proposal,
    rollback_proposal,
    EvolutionApprovalError,
    EvolutionRollbackError,
    sweeper
)
from app.services.worker_pool import submit_task_execution, sse_event_stream, cancel_task
from app.b1.persistence import SQLitePersistence
from app.b1.budget import SQLiteBudgetTracker
from app.b1.events import SQLiteEventSystem
from app.b1.engine import ExecutionEngine


@asynccontextmanager
async def lifespan(ap):
    ensure_sqlite_schema(engine, Base)
    db = next(get_db())
    try:
        seed_default_agents(db)
    finally:
        db.close()

    # Startup Crash Recovery: Scan and recover any interrupted tasks
    try:
        db_path = settings.db_url.replace("sqlite:///", "")
        engine_b1 = ExecutionEngine(
            SQLitePersistence(db_path),
            SQLiteBudgetTracker(db_path),
            SQLiteEventSystem(db_path),
        )
        recovered = engine_b1.recover_interrupted_tasks()
        if recovered:
            logging.getLogger("nexus.main").info(
                f"Startup crash recovery completed. Recovered {len(recovered)} tasks: {recovered}"
            )
    except Exception as exc:
        logging.getLogger("nexus.main").error(f"Error during startup crash recovery: {exc}")

    # Start Autonomous Evolution Sweeper
    sweeper.set_session_factory(SessionLocal)
    sweeper.start()
    try:
        yield
    finally:
        sweeper.stop()

from fastapi.middleware.cors import CORSMiddleware
from app.api.agents import router as agents_router
from app.api.models import router as models_router
from app.api.usage import router as usage_router
from app.api.dashboard import router as dashboard_router
from app.api.benchmark import router as benchmark_router

app = FastAPI(title="NEXUS CORE 2.1", version="2.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(agents_router)
app.include_router(models_router)
app.include_router(usage_router)
app.include_router(dashboard_router)
app.include_router(benchmark_router)

# ===== Auth =====

def verify_token(x_token: str = Header(None)) -> None:
    """Require X-Token unless dev mode."""
    if settings.auth_required:
        if not settings.api_token:
            raise HTTPException(500, "NEXUS_API_TOKEN not configured on server")
        if x_token != settings.api_token:
            raise HTTPException(401, "Invalid or missing X-Token")

AUTH = [Depends(verify_token)]

def _safe_error(exc: Exception) -> str:
    return exc.__class__.__name__

def _requires_approval(risk: str) -> bool:
    return risk in ("high",)

# ===== Server-side risk computation =====

def _compute_risk(goal: str, task_type: str, client_suggestion: str) -> str:
    """Server owns final risk level. Client suggestion is advisory only."""
    goal_lower = goal.lower()
    # High-risk keywords (extensible)
    high_keywords = ["删除", "delete", "drop", "格式化", "format", "rm ", "sudo",
                     "覆盖", "overwrite", "迁移", "migrate", "销毁", "destroy"]
    if any(kw in goal_lower for kw in high_keywords):
        return "high"
    if client_suggestion == "high":
        return "high"  # client can escalate but cannot de-escalate
    return "low"

# ===== Web Dashboard =====

DASHBOARD_HTML = """<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>NEXUS CORE 2.0</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
:root{
  --apple-font:-apple-system,BlinkMacSystemFont,"SF Pro Display","SF Pro Text","PingFang SC","Helvetica Neue",sans-serif;
  --bg-gradient:linear-gradient(180deg,#f5f5f7 0%,#e8ebed 100%);
  --card-bg:rgba(255,255,255,0.78);
  --card-border:rgba(255,255,255,0.85);
  --accent:#0071e3;
  --text-main:#1d1d1f;
  --text-sub:#86868b;
  --shadow-window:0 12px 32px rgba(0,0,0,0.06),0 1px 2px rgba(0,0,0,0.04);
}
body{font-family:var(--apple-font);background:var(--bg-gradient);color:var(--text-main);min-height:100vh;-webkit-font-smoothing:antialiased}
.header{background:rgba(255,255,255,0.8);backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);border-bottom:1px solid rgba(0,0,0,0.06);padding:14px 28px;display:flex;align-items:center;gap:12px;position:sticky;top:0;z-index:100}
.header h1{font-size:18px;font-weight:600;color:var(--text-main);letter-spacing:-0.02em}
.badge{font-size:11px;font-weight:600;padding:3px 9px;border-radius:12px;background:#e8f2ff;color:var(--accent)}
.main{max-width:880px;margin:24px auto;padding:0 20px}
.card{background:var(--card-bg);backdrop-filter:blur(30px) saturate(180%);-webkit-backdrop-filter:blur(30px) saturate(180%);border:1px solid var(--card-border);border-radius:18px;margin-bottom:20px;box-shadow:var(--shadow-window);overflow:hidden;transition:transform .2s ease,box-shadow .2s ease}
.card-header{padding:14px 20px;border-bottom:1px solid rgba(0,0,0,0.05);font-weight:600;font-size:14px;display:flex;justify-content:space-between;align-items:center;color:var(--text-main)}
.card-body{padding:20px}
.form-group{margin-bottom:16px}
label{display:block;font-size:12px;font-weight:500;color:var(--text-sub);margin-bottom:6px;letter-spacing:-0.01em}
textarea,input,select{width:100%;padding:10px 14px;background:rgba(255,255,255,0.9);border:1px solid rgba(0,0,0,0.1);border-radius:10px;color:var(--text-main);font-size:13px;font-family:inherit;transition:all .2s ease;box-shadow:inset 0 1px 2px rgba(0,0,0,0.02)}
textarea:focus,input:focus,select:focus{outline:none;border-color:var(--accent);box-shadow:0 0 0 3px rgba(0,113,227,0.18);background:#fff}
textarea{resize:vertical;min-height:90px;line-height:1.5}
select{cursor:pointer}
.btn{padding:9px 18px;border:none;border-radius:10px;font-size:13px;font-weight:600;cursor:pointer;transition:all .18s ease;display:inline-flex;align-items:center;gap:6px}
.btn:active{transform:scale(0.98)}
.btn-primary{background:linear-gradient(180deg,#0077ed 0%,#0062cc 100%);color:#fff;box-shadow:0 2px 6px rgba(0,113,227,0.28)}
.btn-primary:hover{opacity:.92;box-shadow:0 4px 12px rgba(0,113,227,0.36)}
.btn-danger{background:#ff3b30;color:#fff}
.btn-default{background:rgba(0,0,0,0.04);color:var(--text-main);border:1px solid rgba(0,0,0,0.05)}
.btn-default:hover{background:rgba(0,0,0,0.08)}
.btn-group{display:flex;gap:10px;flex-wrap:wrap}
.task-row{display:flex;align-items:center;padding:12px 18px;border-bottom:1px solid rgba(0,0,0,0.04);gap:14px;transition:background .15s ease}
.task-row:hover{background:rgba(255,255,255,0.5)}
.task-row:last-child{border-bottom:none}
.task-id{font-family:-apple-system-monospaced,SFMono-Regular,Menlo,monospace;font-size:12px;font-weight:600;color:var(--accent);min-width:96px;cursor:pointer}
.task-id:hover{text-decoration:underline}
.task-goal{flex:1;font-size:13px;color:var(--text-main);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.task-status{padding:3px 10px;border-radius:12px;font-size:11px;font-weight:600;white-space:nowrap}
.st-success{background:#e3f9e5;color:#1a7f37}
.st-failed{background:#ffebe9;color:#cf222e}
.st-queued{background:#fff8c5;color:#9a6700}
.st-running{background:#ddf4ff;color:#0969da}
.step-list{margin-top:10px}
.step{background:rgba(255,255,255,0.7);border:1px solid rgba(0,0,0,0.06);border-radius:12px;padding:14px;margin-bottom:10px;box-shadow:0 2px 8px rgba(0,0,0,0.02)}
.step-header{display:flex;justify-content:space-between;align-items:center;margin-bottom:8px}
.step-key{font-weight:600;font-size:13px;color:var(--text-main)}
.step-role{font-size:11px;color:var(--text-sub);background:rgba(0,0,0,0.04);padding:2px 8px;border-radius:8px}
.step-result{font-size:12px;line-height:1.6;white-space:pre-wrap;max-height:260px;overflow:auto;background:rgba(245,245,247,0.85);color:#24292f;padding:12px;border-radius:8px;font-family:-apple-system-monospaced,SFMono-Regular,Menlo,monospace;margin-top:8px;border:1px solid rgba(0,0,0,0.04)}
.empty{text-align:center;padding:40px;color:var(--text-sub);font-size:13px}
.spinner{display:inline-block;width:14px;height:14px;border:2px solid rgba(0,113,227,0.2);border-top-color:var(--accent);border-radius:50%;animation:spin .8s linear infinite;margin-right:6px}
@keyframes spin{to{transform:rotate(360deg)}}
.toast{position:fixed;top:20px;right:20px;padding:12px 20px;border-radius:12px;font-size:13px;font-weight:500;z-index:999;box-shadow:0 8px 24px rgba(0,0,0,0.12);animation:slideIn .3s cubic-bezier(0.16,1,0.3,1)}
.toast-ok{background:rgba(40,167,69,0.95);color:#fff;backdrop-filter:blur(10px)}
.toast-err{background:rgba(220,53,69,0.95);color:#fff;backdrop-filter:blur(10px)}
@keyframes slideIn{from{transform:translateY(-20px);opacity:0}to{transform:translateY(0);opacity:1}}
.result-block{background:rgba(255,255,255,0.7);border:1px solid rgba(0,0,0,0.06);border-radius:12px;padding:14px;margin-top:12px;display:none}
.result-block pre{white-space:pre-wrap;font-size:12px;max-height:400px;overflow:auto;color:var(--text-main);font-family:-apple-system-monospaced,SFMono-Regular,Menlo,monospace}
a{color:var(--accent);text-decoration:none}
a:hover{text-decoration:underline}
</style>
</head>
<body>
<div class="header">
  <h1>⚡ NEXUS CORE 2.0</h1>
  <span class="badge">M0-B</span>
  <span style="font-size:12px;color:#8b949e">B1 Unified Engine + Multi-Agent Adapters</span>
  <a href="/dashboard/" style="margin-left:auto;font-size:12px;padding:6px 14px;border-radius:10px;background:#0071e3;color:#fff;font-weight:600;display:inline-flex;align-items:center;gap:6px">
    🖥️ 切换至全新 React + TS 控制台 (含交互 DAG 拓扑图)
  </a>
</div>
<div class="main">
  <!-- Submit Form -->
  <div class="card">
    <div class="card-header">📝 发布任务</div>
    <div class="card-body">
      <div class="form-group">
        <label>任务目标</label>
        <textarea id="goal" placeholder="例如：写一个Python函数，统计一段文本中出现频率最高的10个词"></textarea>
      </div>
      <div class="form-group">
        <label>类型</label>
        <select id="task_type">
          <option value="coding">coding - 写代码 (Antigravity)</option>
          <option value="analysis">analysis - 分析 (Hermes/DSH)</option>
          <option value="research">research - 调研</option>
          <option value="knowledge">knowledge - 知识问答</option>
          <option value="execution">execution - 执行</option>
          <option value="verification">verification - 验证</option>
        </select>
      </div>
      <div class="form-group">
        <label>执行模式 (M2)</label>
        <select id="exec_mode">
          <option value="orchestrated">🤖 智能路由 (根据复杂度自动选择单/多Agent)</option>
          <option value="single_agent">⚡ 强制单Agent (最少Token消耗)</option>
        </select>
      </div>
      <div class="btn-group">
        <button class="btn btn-primary" onclick="submitTaskStream()">📡 实时流式执行 (SSE)</button>
        <button class="btn btn-default" onclick="submitTask()">🚀 同步执行</button>
        <button class="btn btn-default" onclick="submitOnly()">📋 仅创建</button>
      </div>
      <div id="submitResult" class="result-block"></div>
    </div>
  </div>

  <!-- A/B Comparator Card -->
  <div class="card">
    <div class="card-header">⚖️ 单 Agent vs 多 Agent 对照基准测试 (§7 收益验证)</div>
    <div class="card-body">
      <div style="font-size:12px;color:#8b949e;margin-bottom:12px">
        严格贯彻“不能为了多Agent而多Agent”：自动使用同一输入分别以单Agent与多Agent协作运行，对比Token开销、耗时与收益。
      </div>
      <div class="form-group">
        <label>实验任务目标</label>
        <textarea id="bm_goal" placeholder="输入测试目标，例如：计算 2+2 或 编写快速排序算法并测试">计算 2+2 的结果</textarea>
      </div>
      <button class="btn btn-primary" onclick="runBenchmark()">🔬 启动双模式对照实验</button>
      <div id="bmResult" class="result-block"></div>
    </div>
  </div>

  <!-- M4 Self-Evolution & Governance Card -->
  <div class="card">
    <div class="card-header">
      <span>🧬 M4 受控自我进化与架构治理 (Controlled Self-Evolution)</span>
      <button class="btn btn-default" style="padding:4px 12px;font-size:12px" onclick="loadProposals()">刷新提案</button>
    </div>
    <div class="card-body">
      <div style="font-size:12px;color:#8b949e;margin-bottom:12px">
        系统基于任务历史、失败归因与 Agent 遥测数据，自主生成架构优化方案；经过受控沙箱测试通过后，需用户人工审批生效，并支持一键安全回滚。
      </div>
      <button class="btn btn-primary" onclick="runEvolutionAnalysis()">🔍 一键执行系统遥测诊断与演进发现</button>
      <div id="proposalList" style="margin-top:14px"><div class="empty">暂无待审批或已应用的进化提案</div></div>
    </div>
  </div>

  <!-- M3 Long-term Memory Card -->
  <div class="card">
    <div class="card-header">
      <span>🧠 M3 长期记忆与经验归因沉淀 (Experience & Lessons)</span>
      <button class="btn btn-default" style="padding:4px 12px;font-size:12px" onclick="loadExperiences()">刷新记忆</button>
    </div>
    <div class="card-body">
      <div id="experienceList"><div class="empty">点击刷新加载历史经验沉淀</div></div>
    </div>
  </div>

  <!-- Task List -->
  <div class="card">
    <div class="card-header">
      <span>📋 最近任务</span>
      <button class="btn btn-default" style="padding:4px 12px;font-size:12px" onclick="loadTasks()">刷新</button>
    </div>
    <div id="taskList"><div class="empty">点击刷新加载任务列表</div></div>
  </div>
</div>

<script>
const API = '';

function toast(msg, ok) {
  const t = document.createElement('div');
  t.className = 'toast ' + (ok ? 'toast-ok' : 'toast-err');
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 3000);
}

let currentEventSource = null;

async function cancelCurrentTask(taskId) {
  if (!confirm('确认终止该正在执行的任务吗？')) return;
  try {
    const res = await fetch(API + `/tasks/${taskId}/cancel`, {method: 'POST'});
    if (res.ok) {
      toast('已发送终止信号', true);
      if (currentEventSource) { currentEventSource.close(); currentEventSource = null; }
    }
  } catch(e) { toast('取消失败: ' + e.message, false); }
}

async function submitTaskStream() {
  const goal = document.getElementById('goal').value.trim();
  const taskType = document.getElementById('task_type').value;
  const execMode = (document.getElementById('exec_mode') || {}).value || 'orchestrated';
  if (!goal) { toast('请输入任务目标', false); return; }
  const div = document.getElementById('submitResult');
  div.style.display = 'block';
  div.innerHTML = '<span class="spinner"></span> 正在创建任务与智能规划...';
  if (currentEventSource) { currentEventSource.close(); currentEventSource = null; }

  try {
    const r1 = await fetch(API + '/tasks', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({goal, risk_suggestion: 'low', task_type: taskType, execution_mode: execMode})
    });
    if (!r1.ok) throw new Error('创建失败 HTTP ' + r1.status);
    const task = await r1.json();
    const taskId = task.task_id;

    // Launch async
    const r2 = await fetch(API + `/tasks/${taskId}/execute_async`, {method: 'POST'});
    if (!r2.ok) throw new Error('启动异步执行失败 HTTP ' + r2.status);

    let html = `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">`;
    html += `  <strong style="color:#0071e3">📡 实时推流中: ${taskId}</strong>`;
    html += `  <button class="btn btn-danger" style="padding:2px 8px;font-size:11px" onclick="cancelCurrentTask('${taskId}')">⏹️ 终止任务</button>`;
    html += `</div>`;
    html += `<div style="font-size:12px;color:#86868b;margin-bottom:10px">复杂度: <span class="badge">${task.complexity}</span> | 模式: <span class="badge">${task.execution_mode}</span></div>`;
    html += `<div id="streamSteps"></div>`;
    div.innerHTML = html;

    const stepsContainer = document.getElementById('streamSteps');

    currentEventSource = new EventSource(API + `/tasks/${taskId}/stream`);

    currentEventSource.addEventListener('step_started', (e) => {
      const d = JSON.parse(e.data);
      const sk = (d.payload && d.payload.step_key) || 'step';
      const role = (d.payload && d.payload.role) || 'agent';
      const el = document.createElement('div');
      el.className = 'step';
      el.id = 'step_' + sk;
      el.innerHTML = `<div class="step-header"><span class="step-key">${sk} [${role}]</span><span class="st-running" id="st_badge_${sk}" style="padding:1px 8px;border-radius:8px;font-size:10px"><span class="spinner"></span> 运行中...</span></div><div class="step-result" id="res_${sk}">Agent 正在推理计算...</div>`;
      stepsContainer.appendChild(el);
    });

    currentEventSource.addEventListener('step_completed', (e) => {
      const d = JSON.parse(e.data);
      const sk = (d.payload && d.payload.step_key) || 'step';
      const tok = (d.payload && (d.payload.input_tokens + d.payload.output_tokens)) || '';
      const preview = (d.payload && d.payload.result_preview) || '';
      const badge = document.getElementById('st_badge_' + sk);
      if (badge) {
        badge.className = 'st-success';
        badge.innerHTML = `✅ 已完成 ${tok ? '(' + tok + ' tok)' : ''}`;
        const resEl = document.getElementById('res_' + sk);
        if (resEl && preview) resEl.textContent = preview;
      }
    });

    currentEventSource.addEventListener('task_finished', (e) => {
      const d = JSON.parse(e.data);
      toast(`任务 ${taskId} 执行完成! (${d.status})`, d.status === 'success');
      currentEventSource.close();
      currentEventSource = null;
      loadTasks();
    });

    currentEventSource.addEventListener('task_error', (e) => {
      const d = JSON.parse(e.data);
      toast(`任务发生错误: ${d.error}`, false);
      currentEventSource.close();
      currentEventSource = null;
      loadTasks();
    });

  } catch(e) {
    div.innerHTML = '<span style="color:#da3633">❌ ' + e.message + '</span>';
    toast('启动流式执行失败: ' + e.message, false);
  }
}

async function submitTask() {
  const goal = document.getElementById('goal').value.trim();
  const taskType = document.getElementById('task_type').value;
  const execMode = (document.getElementById('exec_mode') || {}).value || 'orchestrated';
  if (!goal) { toast('请输入任务目标', false); return; }
  const div = document.getElementById('submitResult');
  div.style.display = 'block';
  div.innerHTML = '<span class="spinner"></span> B1 Planner 规划中...';
  try {
    // Create
    const r1 = await fetch(API + '/tasks', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({goal, risk_suggestion: 'low', task_type: taskType, execution_mode: execMode})
    });
    const task = await r1.json();
    div.innerHTML = '<span class="spinner"></span> 规划完成 (' + task.plan_source + ', ' + task.steps + ' steps)，执行中...';
    // Execute
    const r2 = await fetch(API + '/tasks/' + task.task_id + '/execute', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: '{}'
    });
    if (!r2.ok) {
      const errData = await r2.json().catch(() => ({}));
      throw new Error(errData.detail || ('执行接口返回 HTTP ' + r2.status));
    }
    const exec = await r2.json();
    // Get detail
    const r3 = await fetch(API + '/tasks/' + task.task_id);
    const detail = await r3.json();
    let html = '<strong style="color:#58a6ff">✅ 完成! ' + task.task_id + '</strong><br>';
    html += '<div style="font-size:12px;color:#8b949e;margin:6px 0">复杂度: <span class="badge">' + (detail.complexity || 'standard') + '</span> | 模式: <span class="badge">' + (detail.execution_mode || 'orchestrated') + '</span> | 路由模型: <span class="badge">' + ((detail.routing_decision && detail.routing_decision.model_name) || 'default') + '</span></div><br>';
    for (const s of detail.steps) {
      html += '<div class="step"><div class="step-header"><span class="step-key">' + s.step_key + ' [' + s.role + '] <span class="st-' + s.status + '" style="padding:1px 8px;border-radius:8px;font-size:10px">' + s.status + '</span></span></div>';
      html += '<div style="font-size:12px;color:#8b949e;margin-bottom:4px">' + s.goal.substring(0, 120) + '</div>';
      if (s.result) html += '<div class="step-result">' + s.result.substring(0, 800) + '</div>';
      if (s.error) html += '<div style="color:#da3633;font-size:12px">' + s.error + '</div>';
      html += '</div>';
    }
    div.innerHTML = html;
    loadTasks();
  } catch(e) {
    div.innerHTML = '<span style="color:#da3633">❌ ' + e.message + '</span>';
    toast('请求失败: ' + e.message, false);
  }
}

async function runBenchmark() {
  const goal = document.getElementById('bm_goal').value.trim();
  if (!goal) { toast('请输入实验目标', false); return; }
  const div = document.getElementById('bmResult');
  div.style.display = 'block';
  div.innerHTML = '<span class="spinner"></span> 正在分别执行 单 Agent 与 多 Agent 对照实验并统计指标...';
  try {
    const res = await fetch(API + '/benchmark/compare', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({goal, task_type: 'general'})
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const r = await res.json();
    let verdictColor = r.recommendation === 'use_single_agent' ? '#58a6ff' : '#238636';
    let html = '<div style="margin-bottom:8px"><strong style="color:' + verdictColor + '">📊 对照结论: ' + (r.recommendation === 'use_single_agent' ? '推荐单 Agent (避免冗余)' : '推荐多 Agent 协作') + '</strong></div>';
    html += '<div style="font-size:12px;color:#c9d1d9;margin-bottom:12px;background:#161b22;padding:8px;border-radius:6px;border:1px solid #30363d">' + r.reason + '</div>';
    html += '<table style="width:100%;font-size:12px;border-collapse:collapse;margin-bottom:8px">';
    html += '<tr style="border-bottom:1px solid #30363d;color:#8b949e"><th style="text-align:left;padding:4px">维度</th><th style="text-align:left;padding:4px">单 Agent</th><th style="text-align:left;padding:4px">多 Agent 协作</th><th style="text-align:left;padding:4px">对比差异</th></tr>';
    html += '<tr style="border-bottom:1px solid #21262d"><td style="padding:4px">消耗 Token</td><td style="padding:4px">' + r.single_agent.total_tokens + '</td><td style="padding:4px">' + r.multi_agent.total_tokens + '</td><td style="padding:4px;color:#f0883e">' + r.token_multiplier + 'x 消耗</td></tr>';
    html += '<tr style="border-bottom:1px solid #21262d"><td style="padding:4px">执行耗时</td><td style="padding:4px">' + r.single_agent.elapsed_seconds + 's</td><td style="padding:4px">' + r.multi_agent.elapsed_seconds + 's</td><td style="padding:4px">Δ ' + r.time_delta_seconds + 's</td></tr>';
    html += '<tr style="border-bottom:1px solid #21262d"><td style="padding:4px">步骤与状态</td><td style="padding:4px">1步 (' + r.single_agent.status + ')</td><td style="padding:4px">' + r.multi_agent.steps_count + '步 (' + r.multi_agent.status + ')</td><td style="padding:4px">' + r.complexity + '</td></tr>';
    html += '</table>';
    div.innerHTML = html;
  } catch(e) {
    div.innerHTML = '<span style="color:#da3633">❌ 对照测试失败: ' + e.message + '</span>';
  }
}

async function submitOnly() {
  const goal = document.getElementById('goal').value.trim();
  const taskType = document.getElementById('task_type').value;
  if (!goal) { toast('请输入任务目标', false); return; }
  try {
    const r = await fetch(API + '/tasks', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({goal, risk_suggestion: 'low', task_type: taskType})
    });
    const task = await r.json();
    toast('任务已创建: ' + task.task_id, true);
    loadTasks();
    const r2 = await fetch(API + '/tasks/' + task.task_id);
    const detail = await r2.json();
    const div = document.getElementById('submitResult');
    div.style.display = 'block';
    div.innerHTML = '<strong style="color:#d29922">📋 已创建 ' + task.task_id + '</strong> (plan_source=' + task.plan_source + ', ' + task.steps + ' steps)';
  } catch(e) { toast('创建失败: ' + e.message, false); }
}

async function loadTasks() {
  const list = document.getElementById('taskList');
  try {
    const r = await fetch(API + '/tasks');
    const tasks = await r.json();
    if (!tasks.length) { list.innerHTML = '<div class="empty">暂无任务</div>'; return; }
    let html = '';
    for (const t of tasks) {
      html += '<div class="task-row">';
      html += `<span class="task-id" onclick="showTask('${t.id}')">${t.id}</span>`;
      html += '<span class="task-goal">' + t.goal + '</span>';
      html += '<span class="task-status st-' + t.status + '">' + t.status + '</span>';
      html += '<span style="font-size:11px;color:#484f58">' + (t.plan_source || '') + '</span>';
      html += '</div>';
    }
    list.innerHTML = html;
  } catch(e) { list.innerHTML = '<div class="empty">加载失败</div>'; }
}

async function showTask(id) {
  const r = await fetch(API + '/tasks/' + id);
  const d = await r.json();
  const div = document.getElementById('submitResult');
  div.style.display = 'block';
  let html = '<strong style="color:#58a6ff">📋 ' + id + '</strong> [' + d.status + '] ' + (d.plan_source || '') + '<br>';
  html += '<div style="font-size:12px;color:#8b949e;margin:6px 0">复杂度: <span class="badge">' + (d.complexity || 'standard') + '</span> | 模式: <span class="badge">' + (d.execution_mode || 'orchestrated') + '</span> | 路由模型: <span class="badge">' + ((d.routing_decision && d.routing_decision.model_name) || 'default') + '</span></div><br>';
  for (const s of d.steps) {
    html += '<div class="step"><div class="step-header"><span class="step-key">' + s.step_key + ' [' + s.role + ']</span><span class="st-' + s.status + '" style="padding:1px 8px;border-radius:8px;font-size:10px">' + s.status + '</span></div>';
    html += '<div style="font-size:12px;color:#8b949e;margin-bottom:4px">' + s.goal.substring(0, 120) + '</div>';
    if (s.result) html += '<div class="step-result">' + s.result.substring(0, 1000) + '</div>';
    if (s.error) html += '<div style="color:#da3633;font-size:12px">' + s.error + '</div>';
    html += '</div>';
  }
  div.innerHTML = html;
}

async function runEvolutionAnalysis() {
  toast('正在执行全量遥测与历史分析...', true);
  try {
    const res = await fetch(API + '/evolution/analyze', {method: 'POST'});
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const props = await res.json();
    toast(`诊断完成，发现 ${props.length} 个演进建议`, true);
    loadProposals();
  } catch(e) { toast('分析失败: ' + e.message, false); }
}

async function loadProposals() {
  const div = document.getElementById('proposalList');
  try {
    const res = await fetch(API + '/evolution/proposals');
    const props = await res.json();
    if (!props.length) { div.innerHTML = '<div class="empty">暂无演进提案，点击上方按钮触发遥测分析</div>'; return; }
    let html = '';
    for (const p of props) {
      let stColor = p.status === 'approved' ? '#1a7f37' : (p.status === 'test_passed' ? '#0071e3' : '#8b949e');
      html += '<div style="background:rgba(255,255,255,0.7);border:1px solid rgba(0,0,0,0.06);border-radius:12px;padding:12px;margin-bottom:10px">';
      html += `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">`;
      html += `  <strong style="font-size:13px">${p.title}</strong>`;
      html += `  <span style="font-size:11px;font-weight:600;padding:2px 8px;border-radius:8px;background:#e8f2ff;color:${stColor}">${p.status}</span>`;
      html += `</div>`;
      html += `<div style="font-size:12px;color:#86868b;margin-bottom:6px">${p.evidence.analysis || p.proposal_type}</div>`;
      html += `<div style="font-size:11px;background:#f5f5f7;padding:8px;border-radius:6px;font-family:monospace;white-space:pre-wrap;max-height:120px;overflow:auto">${JSON.stringify(p.proposed_diff.after || p.proposed_diff, null, 2)}</div>`;
      html += `<div style="margin-top:8px;display:flex;gap:8px">`;
      if (p.status === 'test_passed') {
        html += `  <button class="btn btn-primary" style="padding:4px 10px;font-size:11px" onclick="approveProposal('${p.id}')">✅ 批准并生效</button>`;
      }
      if (p.status === 'approved') {
        html += `  <button class="btn btn-danger" style="padding:4px 10px;font-size:11px" onclick="rollbackProposal('${p.id}')">↩️ 回滚此提案</button>`;
      }
      html += `</div></div>`;
    }
    div.innerHTML = html;
  } catch(e) { div.innerHTML = '<div class="empty">加载提案失败</div>'; }
}

async function approveProposal(id) {
  const token = prompt('请输入批准口令 (NEXUS_APPROVAL_TOKEN，若无直接按确定):', 'dev-approval-token') || 'dev-approval-token';
  try {
    const res = await fetch(API + `/evolution/proposals/${id}/approve`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({approval_token: token, comment: 'Web UI User Approval'})
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.detail || 'HTTP ' + res.status);
    }
    toast('提案批准成功并已热更新生效！', true);
    loadProposals();
  } catch(e) { toast('批准失败: ' + e.message, false); }
}

async function rollbackProposal(id) {
  if (!confirm('确认回滚此演进提案吗？')) return;
  try {
    const res = await fetch(API + `/evolution/proposals/${id}/rollback`, {method: 'POST'});
    if (!res.ok) throw new Error('HTTP ' + res.status);
    toast('提案已成功回滚！', true);
    loadProposals();
  } catch(e) { toast('回滚失败: ' + e.message, false); }
}

async function loadExperiences() {
  const div = document.getElementById('experienceList');
  try {
    const res = await fetch(API + '/memory/experiences');
    const exps = await res.json();
    if (!exps.length) { div.innerHTML = '<div class="empty">暂无历史经验沉淀</div>'; return; }
    let html = '';
    for (const e of exps) {
      html += '<div style="background:rgba(255,255,255,0.6);border:1px solid rgba(0,0,0,0.05);border-radius:10px;padding:10px;margin-bottom:8px">';
      html += `<div style="font-size:12px;font-weight:600;margin-bottom:4px"><span class="st-${e.status}" style="padding:1px 6px;border-radius:6px;font-size:10px;margin-right:6px">${e.status}</span> ${e.goal}</div>`;
      if (e.lessons_learned) html += `<div style="font-size:11px;color:#1a7f37;background:#e3f9e5;padding:4px 8px;border-radius:4px;margin-top:4px">💡 ${e.lessons_learned}</div>`;
      if (e.failure_reasons && e.failure_reasons.length) {
        html += `<div style="font-size:11px;color:#cf222e;background:#ffebe9;padding:4px 8px;border-radius:4px;margin-top:4px">⚠️ RCA: ${JSON.stringify(e.failure_reasons)}</div>`;
      }
      html += '</div>';
    }
    div.innerHTML = html;
  } catch(e) { div.innerHTML = '<div class="empty">加载经验失败</div>'; }
}

loadTasks();
loadProposals();
loadExperiences();
</script>
</body>
</html>"""

@app.get("/", include_in_schema=False)
async def dashboard():
    return HTMLResponse(DASHBOARD_HTML)

# Mount standalone React + TypeScript Production Frontend at /dashboard
import pathlib
_frontend_dir = pathlib.Path(__file__).resolve().parent.parent / "frontend"
if _frontend_dir.exists():
    app.mount("/dashboard", StaticFiles(directory=str(_frontend_dir), html=True), name="frontend")



@app.get("/health")
def health():
    return {"status": "ok", "version": "0.1.0-M0A"}

# ===== Planner status (auth required) =====

@app.get("/planner/status", dependencies=AUTH)
def planner_status():
    return {
        "available": settings.planner_available,
        "model": settings.planner_model if settings.planner_available else None,
    }

# ===== Agents =====

@app.get("/agents", dependencies=AUTH)
def list_agents(db: Session = Depends(get_db)):
    return [{"id": a.id, "name": a.name, "role": a.role,
             "adapter_type": a.adapter_type, "enabled": a.enabled,
             "verification_status": a.verification_status} for a in db.query(Agent).all()]

@app.post("/agents/register", dependencies=AUTH)
def register_agent(data: AgentRegister, db: Session = Depends(get_db)):
    # Adapter gate check
    if data.adapter_type == "dsh" and not settings.enable_dsh_adapter:
        raise HTTPException(403, "DSH adapter not enabled")
    if data.adapter_type == "hermes" and not settings.enable_hermes_adapter:
        raise HTTPException(403, "Hermes adapter not enabled")
    if data.adapter_type == "antigravity" and not settings.enable_antigravity_adapter:
        raise HTTPException(403, "Antigravity adapter not enabled")
    if db.query(Agent).filter(Agent.name == data.name).first():
        raise HTTPException(409, "Agent name exists")
    
    perms = ROLE_TO_PERMISSIONS.get(data.role, [])
    agent = Agent(
        name=data.name, role=data.role, adapter_type=data.adapter_type,
        description=data.description,
        capabilities=perms,
        permission_set=perms,
    )
    db.add(agent)
    db.commit()
    return {"id": agent.id, "name": agent.name}


@app.post("/agents/custom", dependencies=AUTH)
def register_custom_agent_api(payload: dict, db: Session = Depends(get_db)):
    """Registers a user-defined custom agent with custom capabilities and role."""
    name = payload.get("name")
    role = payload.get("role", "analysis")
    description = payload.get("description", "Custom user-registered agent")
    capabilities = payload.get("capabilities", ["read_data"])
    permission_set = payload.get("permission_set", ["read_data"])

    if not name or not role:
        raise HTTPException(400, "Missing required 'name' or 'role'")

    from app.sdk import sync_agent_record
    sync_agent_record(db, name, role, description, capabilities, permission_set)
    agent = db.query(Agent).filter(Agent.name == name).first()
    return {"id": agent.id, "name": agent.name, "role": agent.role, "adapter_type": "custom", "status": "registered"}


# ===== Tasks =====

@app.post("/tasks", status_code=202, dependencies=AUTH)
async def create_task(data: TaskCreate, db: Session = Depends(get_db)):
    """Create task with plan. All-or-nothing transaction with B0 idempotency."""
    # 0. Idempotency Check per B0 §8
    if data.idempotency_key:
        existing = db.query(Task).filter(Task.idempotency_key == data.idempotency_key).first()
        if existing:
            incoming_fp = compute_request_fingerprint(data.goal)
            if existing.request_fingerprint:
                try:
                    verify_replay_match(existing.request_fingerprint, incoming_fp)
                except FingerprintConflictError:
                    raise HTTPException(409, "Idempotency key reused with conflicting payload")
            return {
                "task_id": existing.id, "status": existing.status, "risk_level": existing.risk_level,
                "plan_source": existing.plan_source, "steps": len(existing.steps),
                "is_replay": True,
            }

    # M2 Task Classification & Dynamic Model Routing (§4: 不能为了多Agent而多Agent)
    cls_res = classify_task(data.goal, data.task_type)
    route_dec = route_model(data.goal, cls_res.complexity, cls_res.primary_role)

    # M3 Memory Retrieval: Check for historical lessons, RCA warnings & best practices
    mem_ctx = retrieve_relevant_memory(db, data.goal, data.task_type)

    plan_source = "none"
    plan_steps = None
    degrade_reason = None

    # If simple task or explicit single agent requested, avoid multi-agent decomposition
    if data.execution_mode == "single_agent" or cls_res.complexity == TaskComplexity.SIMPLE:
        plan_steps = [{
            "step_key": "s1",
            "title": data.goal[:80],
            "goal": data.goal,
            "role": cls_res.primary_role,
            "depends_on": [],
            "acceptance_criteria": ["Task accurately completed by assigned expert."],
            "required_permissions": ROLE_TO_PERMISSIONS.get(cls_res.primary_role, []),
        }]
        plan_source = "direct"
    elif settings.planner_available:
        try:
            subtasks = plan(data.goal, budget_steps=cls_res.suggested_max_steps, task_id=None)
            plan_steps = [{
                "step_key": s.step_key, "title": s.goal[:80],
                "goal": s.goal, "role": s.role,
                "depends_on": s.depends_on,
                "acceptance_criteria": s.acceptance_criteria,
                "required_permissions": s.required_permissions,
            } for s in subtasks]
            plan_source = "model"
        except PlannerError as exc:
            degrade_reason = _safe_error(exc)
    else:
        degrade_reason = "planner_unavailable"

    if plan_steps is None:
        rsteps = rule_plan(data.goal, data.task_type)
        plan_steps = [{
            "step_key": s.step_key, "title": s.goal[:80],
            "goal": s.goal, "role": s.role,
            "depends_on": s.depends_on,
            "acceptance_criteria": s.acceptance_criteria,
            "required_permissions": s.required_permissions,
        } for s in rsteps]
        plan_source = "rule"

    # Validate: at least one step
    if not plan_steps:
        raise HTTPException(400, "Planner produced no steps")

    # Server-side risk
    risk = _compute_risk(data.goal, data.task_type, data.risk_suggestion)
    budget = {
        "max_steps": cls_res.suggested_max_steps,
        "max_agents": cls_res.suggested_max_agents,
        "max_parallel": cls_res.suggested_max_parallel,
        "max_model_calls": settings.default_max_model_calls,
        "max_total_tokens": settings.default_max_total_tokens,
    }
    degrade_info = {
        "plan_source": plan_source,
        "degrade_detected": bool(degrade_reason),
        "degrade_reason": degrade_reason,
        "planner_available": settings.planner_available,
    }

    # Request fingerprint per B0 RFC 8785
    req_fp = compute_request_fingerprint(data.goal)

    # Determine allowed permissions ceiling
    if data.allowed_permissions is not None:
        allowed_perms = data.allowed_permissions
    else:
        derived = set()
        for s in plan_steps:
            perms = s.get("required_permissions") or ROLE_TO_PERMISSIONS.get(s["role"], [])
            derived.update(perms)
        allowed_perms = sorted(list(derived))

    # Single transaction with rollback on failure
    task = None
    try:
        task = Task(
            goal=data.goal, task_type=data.task_type, risk_level=risk,
            status="queued", budget=budget,
            plan_json=plan_steps, plan_source=plan_source,
            complexity=cls_res.complexity.value,
            execution_mode=data.execution_mode,
            routing_decision=route_dec.model_dump(),
            idempotency_key=data.idempotency_key,
            request_fingerprint=req_fp,
            allowed_permissions=allowed_perms,
            max_total_tokens=budget["max_total_tokens"],
            max_model_calls=budget["max_model_calls"],
            max_steps=budget["max_steps"],
            max_agents=budget["max_agents"],
            max_parallel=budget["max_parallel"],
        )
        db.add(task)
        db.flush()

        for i, s in enumerate(plan_steps):
            db.add(PlanStep(
                task_id=task.id, step_key=s["step_key"], title=s.get("title", ""),
                goal=s["goal"], role=s["role"], depends_on=s.get("depends_on", []),
                step_order=i,
                is_active=1,
                verification_status="pending",
                required_permissions=s.get("required_permissions") or ROLE_TO_PERMISSIONS.get(s["role"], []),
                acceptance_criteria=s.get("acceptance_criteria", []),
            ))

        db.add(TaskEvent(
            task_id=task.id, event_type="task_created",
            message=f"Task created with goal: {data.goal[:80]}",
            payload={"idempotency_key": data.idempotency_key, "risk_level": risk},
        ))
        db.add(TaskEvent(
            task_id=task.id, event_type="plan_created",
            message=f"Plan via {plan_source}",
            payload={"steps": len(plan_steps), "degrade_info": degrade_info},
        ))
        if mem_ctx.has_memory:
            db.add(TaskEvent(
                task_id=task.id, event_type="memory_retrieved",
                message=f"Recalled {len(mem_ctx.best_practice_hints)} best practice(s) and {len(mem_ctx.failure_warnings)} failure warning(s)",
                payload=mem_ctx.model_dump(),
            ))
        db.commit()
        db.refresh(task)
    except Exception as exc:
        db.rollback()
        import traceback
        traceback.print_exc()
        raise HTTPException(500, f"Task creation failed: {exc}")

    return {
        "task_id": task.id, "status": task.status, "risk_level": risk,
        "plan_source": plan_source, "steps": len(plan_steps),
        "complexity": task.complexity,
        "execution_mode": task.execution_mode,
        "routing_decision": task.routing_decision,
    }

@app.get("/tasks", dependencies=AUTH)
def list_tasks(db: Session = Depends(get_db)):
    tasks = db.query(Task).order_by(Task.created_at.desc()).limit(50).all()
    return [{"id": t.id, "goal": t.goal[:80], "status": t.status,
             "plan_source": t.plan_source, "risk_level": t.risk_level,
             "created_at": t.created_at.isoformat() if t.created_at else None} for t in tasks]

# Role to Tool-Agent & Connected API Mapping
ROLE_TOOL_AGENT_MAP = {
    "coding": {
        "agent_id": "agent-coder-core",
        "agent_name": "NEXUS 全栈编码工具 Agent",
        "model_id": "deepseek-chat",
        "provider_name": "DeepSeek 官方 API",
        "api_endpoint": "https://api.deepseek.com/v1",
    },
    "verification": {
        "agent_id": "agent-reviewer-core",
        "agent_name": "NEXUS 4级代码审查工具 Agent",
        "model_id": "deepseek-reasoner",
        "provider_name": "DeepSeek Reasoner API",
        "api_endpoint": "https://api.deepseek.com/v1",
    },
    "analysis": {
        "agent_id": "agent-rca-core",
        "agent_name": "NEXUS 根因分析诊断工具 Agent",
        "model_id": "qwen-max",
        "provider_name": "阿里云百炼 API",
        "api_endpoint": "https://dashscope.aliyuncs.com/compatible-mode/v1",
    },
    "research": {
        "agent_id": "agent-research-core",
        "agent_name": "NEXUS 深度调研工具 Agent",
        "model_id": "gemini-2.0-flash",
        "provider_name": "Google Gemini API",
        "api_endpoint": "https://generativelanguage.googleapis.com/v1beta",
    },
    "sre_ops": {
        "agent_id": "agent-sre-core",
        "agent_name": "NEXUS 自主自愈运维工具 Agent",
        "model_id": "deepseek-chat",
        "provider_name": "DeepSeek 官方 API",
        "api_endpoint": "https://api.deepseek.com/v1",
    },
    "execution": {
        "agent_id": "agent-sre-core",
        "agent_name": "NEXUS 脚本执行工具 Agent",
        "model_id": "deepseek-chat",
        "provider_name": "DeepSeek 官方 API",
        "api_endpoint": "https://api.deepseek.com/v1",
    },
}

COORDINATOR_AGENT_META = {
    "agent_id": "agent-planner-core",
    "agent_name": "NEXUS 任务规划与协调中枢 (Lead Coordinator Agent)",
    "role": "planner",
    "model_id": "deepseek-reasoner",
    "provider_name": "DeepSeek 官方 API",
    "api_endpoint": "https://api.deepseek.com/v1",
    "pattern": "Manager-Worker (Sub-Agents as Tools)",
}


@app.get("/tasks/{task_id}", dependencies=AUTH)
def get_task(task_id: str, db: Session = Depends(get_db)):
    task = db.get(Task, task_id)
    if not task:
        raise HTTPException(404, "Task not found")

    steps_data = []
    for s in task.steps:
        agent_info = ROLE_TOOL_AGENT_MAP.get(s.role, {
            "agent_id": f"agent-{s.role}-tool",
            "agent_name": f"NEXUS {s.role.capitalize()} 专家工具 Agent",
            "model_id": task.routing_decision.get("model_name", "deepseek-chat") if task.routing_decision else "deepseek-chat",
            "provider_name": "智能网关 API",
            "api_endpoint": "https://api.deepseek.com/v1",
        })
        steps_data.append({
            "step_key": s.step_key,
            "step_order": s.step_order,
            "status": s.status,
            "role": s.role,
            "goal": s.goal[:200],
            "depends_on": s.depends_on,
            "error": s.error,
            "result": (s.result or "")[:500],
            "attempts": s.attempts,
            "agent_id": agent_info["agent_id"],
            "agent_name": agent_info["agent_name"],
            "model_id": agent_info["model_id"],
            "provider_name": agent_info["provider_name"],
            "api_endpoint": agent_info["api_endpoint"],
        })

    return {
        "id": task.id, "goal": task.goal, "status": task.status,
        "risk_level": task.risk_level, "plan_source": task.plan_source,
        "complexity": task.complexity,
        "execution_mode": task.execution_mode,
        "routing_decision": task.routing_decision or {},
        "coordinator_agent": COORDINATOR_AGENT_META,
        "execution_round": task.execution_round,
        "idempotency_key": task.idempotency_key,
        "allowed_permissions": task.allowed_permissions or [],
        "budget": task.budget or {},
        "replan_count": task.replan_count or 0,
        "warnings": task.warnings or [],
        "result": (task.result or "")[:500],
        "created_at": task.created_at.isoformat() if task.created_at else None,
        "started_at": task.started_at.isoformat() if task.started_at else None,
        "finished_at": task.finished_at.isoformat() if task.finished_at else None,
        "steps": steps_data,
        "events": [{
            "event_type": e.event_type, "message": e.message,
            "created_at": e.created_at.isoformat() if e.created_at else None,
        } for e in task.events],
    }

@app.post("/tasks/{task_id}/execute", dependencies=AUTH)
def execute_task(task_id: str, approval_token: str = Header(None),
                 db: Session = Depends(get_db)):
    task = db.get(Task, task_id)
    if not task:
        raise HTTPException(404, "Task not found")

    if task.status not in ("queued",):
        raise HTTPException(409, f"Cannot execute task: status={task.status}")

    # ---- Risk approval gate ----
    if _requires_approval(task.risk_level):
        if not settings.approval_token:
            raise HTTPException(403, "NEXUS_APPROVAL_TOKEN not configured; cannot approve high-risk tasks")
        if approval_token != settings.approval_token:
            raise HTTPException(403, "High-risk task requires valid approval token")

    # ---- B0 Budget immutability guard (§5.1) ----
    try:
        guard_budget_immutable(task.status, {})
    except BudgetImmutableError as exc:
        raise HTTPException(409, str(exc))

    # ---- Execute ----
    try:
        execute_plan(db, task)
    except RuntimeError as exc:
        raise HTTPException(409, _safe_error(exc))

    return {
        "task_id": task.id,
        "status": task.status,
        "execution_round": task.execution_round,
    }

@app.get("/tasks/{task_id}/events", dependencies=AUTH)
def get_task_events(task_id: str, db: Session = Depends(get_db)):
    task = db.get(Task, task_id)
    if not task:
        raise HTTPException(404, "Task not found")
    return [{
        "event_type": e.event_type, "message": e.message,
        "created_at": e.created_at.isoformat() if e.created_at else None,
    } for e in task.events]

@app.get("/tasks/{task_id}/steps", dependencies=AUTH)
def get_task_steps(task_id: str, db: Session = Depends(get_db)):
    task = db.get(Task, task_id)
    if not task:
        raise HTTPException(404, "Task not found")
    return [{
        "step_key": s.step_key,
        "step_order": s.step_order,
        "role": s.role,
        "status": s.status,
        "verification_status": getattr(s, "verification_status", "pending"),
        "error": s.error,
        "result": (s.result or "")[:500],
    } for s in task.steps]


@app.post("/tasks/{task_id}/execute_async", dependencies=AUTH, status_code=202)
def execute_task_async(
    task_id: str,
    approval_token: str = Header(None),
    db: Session = Depends(get_db)
):
    """Executes a task in the background worker pool without blocking the HTTP request."""
    task = db.get(Task, task_id)
    if not task:
        raise HTTPException(404, "Task not found")

    if task.status not in ("queued",):
        raise HTTPException(409, f"Cannot execute task: status={task.status}")

    # Risk approval gate
    if _requires_approval(task.risk_level):
        if not settings.approval_token:
            raise HTTPException(403, "NEXUS_APPROVAL_TOKEN not configured; cannot approve high-risk tasks")
        if approval_token != settings.approval_token:
            raise HTTPException(403, "High-risk task requires valid approval token")

    # Guard budget immutable
    try:
        guard_budget_immutable(task.status, {})
    except BudgetImmutableError as exc:
        raise HTTPException(409, str(exc))

    submit_task_execution(task_id, approval_token)

    return {
        "task_id": task.id,
        "status": "running",
        "stream_url": f"/tasks/{task.id}/stream",
        "message": "Task queued for background execution in worker pool."
    }


@app.get("/tasks/{task_id}/stream", dependencies=AUTH)
async def stream_task_events(task_id: str, db: Session = Depends(get_db)):
    """Server-Sent Events (SSE) live streaming endpoint for task progress."""
    task = db.get(Task, task_id)
    if not task:
        raise HTTPException(404, "Task not found")

    headers = {
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
        "X-Accel-Buffering": "no",
    }
    return StreamingResponse(
        sse_event_stream(task_id),
        media_type="text/event-stream",
        headers=headers
    )


@app.post("/tasks/{task_id}/cancel", dependencies=AUTH)
def cancel_task_endpoint(task_id: str, db: Session = Depends(get_db)):
    """Signals cancellation to an active task."""
    task = db.get(Task, task_id)
    if not task:
        raise HTTPException(404, "Task not found")

    success = cancel_task(task_id)
    if task.status in ("queued", "running"):
        task.status = "cancelled"
        db.commit()

    return {"task_id": task.id, "cancelled": True, "active_signal_sent": success}



# ===== M2 Endpoints: Routing, Benchmarking & Performance Metrics =====

@app.post("/router/classify", dependencies=AUTH)
def classify_task_endpoint(req: ClassifyRequest):
    """Classifies task complexity and returns recommended routing and budget limits."""
    cls_res = classify_task(req.goal, req.task_type)
    route_dec = route_model(req.goal, cls_res.complexity, cls_res.primary_role)
    return {
        "goal": req.goal,
        "task_type": req.task_type,
        "classification": cls_res.model_dump(),
        "routing": route_dec.model_dump(),
    }


@app.post("/benchmark/compare", dependencies=AUTH)
def compare_task_endpoint(req: ABCompareRequest, db: Session = Depends(get_db)):
    """A/B Benchmark comparison: Single Agent vs Multi-Agent Orchestration (§7)."""
    report = run_ab_comparison(req.goal, req.task_type, db)
    return report.model_dump()


@app.get("/metrics/agents", dependencies=AUTH)
def get_agent_metrics_endpoint(db: Session = Depends(get_db)):
    """Returns execution performance metrics (success rate, token efficiency) for all agents."""
    return get_agent_metrics(db)


# ===== M3 Endpoints: Long-term Memory & Knowledge Retrieval =====

@app.get("/memory/experiences", dependencies=AUTH)
def list_experiences_endpoint(db: Session = Depends(get_db)):
    """Lists persistent task experiences, RCA failure analyses, and lessons learned."""
    exps = db.query(TaskExperience).order_by(TaskExperience.created_at.desc()).limit(50).all()
    return [{
        "id": e.id,
        "task_id": e.task_id,
        "goal": e.goal[:100],
        "task_type": e.task_type,
        "complexity": e.complexity,
        "status": e.status,
        "plan_summary": e.plan_summary,
        "lessons_learned": e.lessons_learned,
        "failure_reasons": e.failure_reasons,
        "token_cost": e.token_cost,
        "execution_time_s": e.execution_time_s,
        "created_at": e.created_at.isoformat() if e.created_at else None,
    } for e in exps]


@app.post("/memory/search", dependencies=AUTH)
def search_memory_endpoint(req: ClassifyRequest, db: Session = Depends(get_db)):
    """Searches memory for similar goals and returns actionable advice & failure warnings."""
    mem_ctx = retrieve_relevant_memory(db, req.goal, req.task_type)
    return mem_ctx.model_dump()


@app.post("/memory/search/hybrid", dependencies=AUTH)
def search_memory_hybrid_endpoint(payload: dict, db: Session = Depends(get_db)):
    """Hybrid semantic vector retrieval using dense cosine similarity and sparse keyword RRF fusion."""
    query = payload.get("query") or payload.get("goal") or ""
    top_k = int(payload.get("top_k", 5))
    results = hybrid_search_experiences(db, query, top_k=top_k)
    return {"query": query, "count": len(results), "results": results}


@app.get("/memory/knowledge", dependencies=AUTH)
def get_knowledge_endpoint(category: str | None = None, db: Session = Depends(get_db)):
    """Lists accumulated knowledge items and solution snippets."""
    return list_knowledge_items(db, category=category)


# ===== M4 Endpoints: Controlled Self-Evolution =====

@app.post("/evolution/analyze", dependencies=AUTH)
def run_evolution_analysis_endpoint(db: Session = Depends(get_db)):
    """Scans telemetry and experiences to formulate evidence-based evolution proposals."""
    proposals = analyze_and_propose_evolutions(db)
    return [{
        "id": p.id,
        "title": p.title,
        "proposal_type": p.proposal_type,
        "status": p.status,
        "evidence": p.evidence,
        "proposed_diff": p.proposed_diff,
        "sandbox_test_result": p.sandbox_test_result,
        "created_at": p.created_at.isoformat() if p.created_at else None,
    } for p in proposals]


@app.get("/evolution/proposals", dependencies=AUTH)
def list_proposals_endpoint(
    status: str | None = None,
    proposal_type: str | None = None,
    db: Session = Depends(get_db)
):
    """Lists evolution proposals with optional status and type filters."""
    query = db.query(EvolutionProposal)
    if status:
        query = query.filter(EvolutionProposal.status == status)
    if proposal_type:
        query = query.filter(EvolutionProposal.proposal_type == proposal_type)
    proposals = query.order_by(EvolutionProposal.created_at.desc()).all()
    return [{
        "id": p.id,
        "title": p.title,
        "proposal_type": p.proposal_type,
        "status": p.status,
        "evidence": p.evidence,
        "proposed_diff": p.proposed_diff,
        "sandbox_test_result": p.sandbox_test_result,
        "rejection_reason": p.rejection_reason,
        "applied_at": p.applied_at.isoformat() if p.applied_at else None,
        "created_at": p.created_at.isoformat() if p.created_at else None,
    } for p in proposals]


@app.get("/evolution/proposals/{proposal_id}", dependencies=AUTH)
def get_proposal_endpoint(proposal_id: str, db: Session = Depends(get_db)):
    """Retrieves full details, sandbox audit, and diff for a specific proposal."""
    p = db.query(EvolutionProposal).filter(EvolutionProposal.id == proposal_id).first()
    if not p:
        raise HTTPException(404, f"Proposal '{proposal_id}' not found")
    return {
        "id": p.id,
        "title": p.title,
        "proposal_type": p.proposal_type,
        "status": p.status,
        "evidence": p.evidence,
        "proposed_diff": p.proposed_diff,
        "sandbox_test_result": p.sandbox_test_result,
        "rejection_reason": p.rejection_reason,
        "applied_at": p.applied_at.isoformat() if p.applied_at else None,
        "created_at": p.created_at.isoformat() if p.created_at else None,
    }


@app.post("/evolution/proposals/{proposal_id}/test", dependencies=AUTH)
def test_proposal_endpoint(proposal_id: str, db: Session = Depends(get_db)):
    """Runs or re-runs sandbox verification for an evolution proposal."""
    p = db.query(EvolutionProposal).filter(EvolutionProposal.id == proposal_id).first()
    if not p:
        raise HTTPException(404, f"Proposal '{proposal_id}' not found")
    res = verify_proposal_in_sandbox(p.proposal_type, p.proposed_diff)
    p.sandbox_test_result = res
    p.status = "test_passed" if res["passed"] else "test_failed"
    db.commit()
    db.refresh(p)
    return {
        "id": p.id,
        "status": p.status,
        "sandbox_test_result": p.sandbox_test_result,
    }


@app.post("/evolution/proposals/{proposal_id}/approve", dependencies=AUTH)
def approve_proposal_endpoint(
    proposal_id: str,
    req: ProposalApprovalRequest,
    db: Session = Depends(get_db)
):
    """Human-in-the-loop gated approval and atomic deployment of a proposal."""
    try:
        updated = approve_and_apply(db, proposal_id, req.approval_token, req.comment)
        return {
            "id": updated.id,
            "status": updated.status,
            "applied_at": updated.applied_at.isoformat() if updated.applied_at else None,
            "message": "Proposal successfully approved and applied."
        }
    except EvolutionApprovalError as e:
        raise HTTPException(400, str(e))


@app.post("/evolution/proposals/{proposal_id}/reject", dependencies=AUTH)
def reject_proposal_endpoint(
    proposal_id: str,
    req: ProposalRejectRequest,
    db: Session = Depends(get_db)
):
    """Rejects an evolution proposal with user-supplied rationale."""
    try:
        updated = reject_proposal(db, proposal_id, req.reason)
        return {
            "id": updated.id,
            "status": updated.status,
            "rejection_reason": updated.rejection_reason,
            "message": "Proposal rejected."
        }
    except EvolutionApprovalError as e:
        raise HTTPException(400, str(e))


@app.post("/evolution/proposals/{proposal_id}/rollback", dependencies=AUTH)
def rollback_proposal_endpoint(proposal_id: str, db: Session = Depends(get_db)):
    """Rolls back an approved evolution proposal and restores prior system state."""
    try:
        updated = rollback_proposal(db, proposal_id)
        return {
            "id": updated.id,
            "status": updated.status,
            "message": "Proposal successfully rolled back to previous state."
        }
    except EvolutionRollbackError as e:
        raise HTTPException(400, str(e))


@app.post("/evolution/sweeper/trigger", dependencies=AUTH)
def trigger_evolution_sweep_endpoint(db: Session = Depends(get_db)):
    """Manually triggers an immediate autonomous evolution diagnosis & sandbox verification sweep."""
    return sweeper.execute_sweep(db)


@app.get("/evolution/sweeper/status", dependencies=AUTH)
def get_evolution_sweeper_status_endpoint():
    """Returns the current runtime status, execution metrics, and history of the autonomous sweeper."""
    return sweeper.get_status()





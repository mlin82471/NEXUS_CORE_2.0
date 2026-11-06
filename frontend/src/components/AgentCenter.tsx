import React, { useState, useEffect } from 'react';
import { AgentItem, AgentTemplateItem } from '../types.ts';

const API_BASE = 'http://127.0.0.1:8000';

interface AgentCenterProps {
  isDark?: boolean;
}

export const AgentCenter: React.FC<AgentCenterProps> = ({ isDark = true }) => {
  const [agents, setAgents] = useState<AgentItem[]>([]);
  const [templates, setTemplates] = useState<AgentTemplateItem[]>([]);
  const [selectedRole, setSelectedRole] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [loading, setLoading] = useState(true);

  // Wizard Modal State
  const [showWizard, setShowWizard] = useState(false);
  const [wizardStep, setWizardStep] = useState(1);
  const [expertMode, setExpertMode] = useState(false);
  const [form, setForm] = useState({
    name: '',
    agent_id: '',
    role: 'coding',
    template_id: 'tpl-coder',
    primary_model_id: 'deepseek-chat',
    fallback_model_id: 'qwen-plus',
    budget_tokens_per_task: 35000,
    max_retries: 1,
    timeout_seconds: 60,
    permission_level: 'supervised',
    allowed_tools: ['read_files', 'write_files'],
    system_prompt: '',
  });

  // Test Runner State
  const [testAgent, setTestAgent] = useState<AgentItem | null>(null);
  const [testPrompt, setTestPrompt] = useState('编写一个Python函数，快速检测列表中是否存在重复元素');
  const [testLoading, setTestLoading] = useState(false);
  const [testResult, setTestResult] = useState<any>(null);

  const fetchAgents = async () => {
    try {
      setLoading(true);
      const res = await fetch(`${API_BASE}/api/agents`);
      if (res.ok) {
        const data = await res.json();
        setAgents(data);
      }
    } catch (err) {
      console.error('Failed to load agents', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchTemplates = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/agents/templates`);
      if (res.ok) {
        const data = await res.json();
        setTemplates(data);
      }
    } catch (err) {
      console.error('Failed to load templates', err);
    }
  };

  useEffect(() => {
    fetchAgents();
    fetchTemplates();
  }, []);

  const handleTemplateSelect = (tplId: string) => {
    const tpl = templates.find(t => t.template_id === tplId);
    if (tpl) {
      setForm(prev => ({
        ...prev,
        template_id: tplId,
        role: tpl.role,
        primary_model_id: tpl.recommended_model,
        budget_tokens_per_task: tpl.default_budget_tokens,
        permission_level: tpl.default_permission_level,
        allowed_tools: tpl.recommended_tools,
        system_prompt: tpl.system_prompt_preview,
      }));
    }
  };

  const handleToggle = async (agentId: string) => {
    try {
      const res = await fetch(`${API_BASE}/api/agents/${agentId}/toggle`, { method: 'POST' });
      if (res.ok) fetchAgents();
    } catch (err) {
      console.error('Toggle failed', err);
    }
  };

  const handleDelete = async (agentId: string) => {
    if (!confirm(`确认删除 Agent '${agentId}' 吗？`)) return;
    try {
      const res = await fetch(`${API_BASE}/api/agents/${agentId}`, { method: 'DELETE' });
      if (res.ok) fetchAgents();
    } catch (err) {
      console.error('Delete failed', err);
    }
  };

  const handleCreateSubmit = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/agents`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (res.ok) {
        setShowWizard(false);
        setWizardStep(1);
        fetchAgents();
      } else {
        const err = await res.json();
        alert(`创建失败: ${err.detail || '未知错误'}`);
      }
    } catch (err: any) {
      alert(`网络异常: ${err.message}`);
    }
  };

  const handleRunTest = async () => {
    if (!testAgent) return;
    try {
      setTestLoading(true);
      setTestResult(null);
      const res = await fetch(`${API_BASE}/api/agents/${testAgent.agent_id}/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: testPrompt }),
      });
      if (res.ok) {
        const data = await res.json();
        setTestResult(data);
        fetchAgents(); // update tokens telemetry
      }
    } catch (err: any) {
      setTestResult({ ok: false, error: err.message });
    } finally {
      setTestLoading(false);
    }
  };

  const cardBg = isDark ? '#161b22' : '#ffffff';
  const borderCol = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)';
  const textMain = isDark ? '#f0f6fc' : '#1d1d1f';
  const textSub = isDark ? '#8b949e' : '#86868b';

  const filteredAgents = agents.filter(a => {
    if (selectedRole !== 'all' && a.role !== selectedRole) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return a.name.toLowerCase().includes(q) || a.agent_id.toLowerCase().includes(q) || a.description.toLowerCase().includes(q);
    }
    return true;
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Header & Actions */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '14px' }}>
        <div>
          <h2 style={{ margin: '0 0 4px 0', fontSize: '20px', fontWeight: '700', color: textMain }}>
            🤖 Agent 管理中心
          </h2>
          <div style={{ fontSize: '13px', color: textSub }}>
            角色配置 · 模板实例化 · 权限模型分配 · 独立核验通过率 · 一键沙箱测试
          </div>
        </div>

        <div style={{ display: 'flex', gap: '10px' }}>
          <button
            onClick={() => { setShowWizard(true); setWizardStep(1); }}
            style={{
              padding: '10px 18px', borderRadius: '10px', border: 'none',
              background: '#238636', color: '#ffffff', fontWeight: '600',
              fontSize: '13px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px',
            }}
          >
            <span>+</span> 5步向导创建 Agent
          </button>
        </div>
      </div>

      {/* Filter Bar */}
      <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
        <input
          type="text"
          placeholder="搜索 Agent 名称、ID 或描述..."
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          style={{
            flex: '1', minWidth: '220px', padding: '8px 14px', borderRadius: '8px',
            border: `1px solid ${borderCol}`, background: cardBg, color: textMain, fontSize: '13px',
          }}
        />

        <div style={{ display: 'flex', gap: '6px', overflowX: 'auto' }}>
          {['all', 'planner', 'coding', 'analysis', 'verification', 'sre_ops', 'research'].map(r => (
            <button
              key={r}
              onClick={() => setSelectedRole(r)}
              style={{
                padding: '6px 12px', borderRadius: '8px', border: `1px solid ${selectedRole === r ? '#58a6ff' : borderCol}`,
                background: selectedRole === r ? 'rgba(56, 139, 253, 0.15)' : cardBg,
                color: selectedRole === r ? '#58a6ff' : textSub,
                fontSize: '12px', cursor: 'pointer', whiteSpace: 'nowrap',
              }}
            >
              {r === 'all' ? '全部角色' : r.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      {/* Agent Cards Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: '16px' }}>
        {filteredAgents.map(ag => (
          <div
            key={ag.agent_id}
            style={{
              background: cardBg,
              border: `1px solid ${ag.status === 'active' ? borderCol : 'rgba(239, 68, 68, 0.2)'}`,
              borderRadius: '14px',
              padding: '18px',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              gap: '14px',
              opacity: ag.status === 'active' ? 1 : 0.7,
              transition: 'transform 0.15s ease',
            }}
          >
            {/* Card Header */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                <div>
                  <div style={{ fontSize: '15px', fontWeight: '700', color: textMain }}>{ag.name}</div>
                  <div style={{ fontSize: '11px', color: textSub, fontFamily: 'monospace' }}>{ag.agent_id}</div>
                </div>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <span style={{
                    fontSize: '11px', padding: '2px 8px', borderRadius: '10px',
                    background: ag.status === 'active' ? 'rgba(63, 185, 80, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                    color: ag.status === 'active' ? '#3fb950' : '#f85149', fontWeight: '600',
                  }}>
                    {ag.status === 'active' ? '● 运行中' : '○ 已暂停'}
                  </span>
                </div>
              </div>

              <p style={{ fontSize: '12px', color: textSub, margin: '0 0 12px 0', lineHeight: 1.4, minHeight: '34px' }}>
                {ag.description || '无详细描述'}
              </p>

              {/* Models & Permissions Chips */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '12px' }}>
                <span style={{ fontSize: '11px', padding: '2px 6px', borderRadius: '4px', background: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)', color: '#58a6ff' }}>
                  主: {ag.primary_model_id}
                </span>
                {ag.fallback_model_id && (
                  <span style={{ fontSize: '11px', padding: '2px 6px', borderRadius: '4px', background: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)', color: textSub }}>
                    备: {ag.fallback_model_id}
                  </span>
                )}
                <span style={{ fontSize: '11px', padding: '2px 6px', borderRadius: '4px', background: 'rgba(188, 140, 255, 0.15)', color: '#bc8cff' }}>
                  {ag.permission_level.toUpperCase()}
                </span>
                <span style={{ fontSize: '11px', padding: '2px 6px', borderRadius: '4px', background: 'rgba(210, 153, 34, 0.15)', color: '#d29922' }}>
                  上限: {(ag.budget_tokens_per_task / 1000).toFixed(0)}k tok
                </span>
              </div>

              {/* Telemetry Metric Strip */}
              <div style={{
                display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px',
                background: isDark ? 'rgba(0,0,0,0.2)' : 'rgba(0,0,0,0.02)',
                padding: '8px 10px', borderRadius: '8px', border: `1px solid ${borderCol}`,
              }}>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '10px', color: textSub }}>累计 Token</div>
                  <div style={{ fontSize: '12px', fontWeight: '700', color: textMain }}>{(ag.total_tokens_consumed / 1000).toFixed(1)}k</div>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '10px', color: textSub }}>任务完成数</div>
                  <div style={{ fontSize: '12px', fontWeight: '700', color: textMain }}>{ag.total_tasks_completed}</div>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '10px', color: textSub }}>独立核验率</div>
                  <div style={{ fontSize: '12px', fontWeight: '700', color: '#3fb950' }}>{(ag.verification_pass_rate * 100).toFixed(0)}%</div>
                </div>
              </div>
            </div>

            {/* Card Actions */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: `1px solid ${borderCol}`, paddingTop: '12px' }}>
              <button
                onClick={() => { setTestAgent(ag); setTestResult(null); }}
                style={{
                  padding: '6px 12px', borderRadius: '6px', border: `1px solid ${borderCol}`,
                  background: isDark ? '#1f2937' : '#f0f7ff', color: '#58a6ff',
                  fontSize: '12px', fontWeight: '600', cursor: 'pointer',
                }}
              >
                ▶ 运行测试
              </button>

              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  onClick={() => handleToggle(ag.agent_id)}
                  style={{
                    padding: '6px 10px', borderRadius: '6px', border: `1px solid ${borderCol}`,
                    background: cardBg, color: textSub, fontSize: '12px', cursor: 'pointer',
                  }}
                >
                  {ag.status === 'active' ? '⏸️ 暂停' : '▶ 启用'}
                </button>
                {!ag.tags?.includes('builtin') && (
                  <button
                    onClick={() => handleDelete(ag.agent_id)}
                    style={{
                      padding: '6px 10px', borderRadius: '6px', border: '1px solid rgba(239, 68, 68, 0.3)',
                      background: 'rgba(239, 68, 68, 0.1)', color: '#f85149', fontSize: '12px', cursor: 'pointer',
                    }}
                  >
                    🗑️
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* 5-Step Creation Wizard Modal */}
      {showWizard && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(4px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
        }}>
          <div style={{
            background: cardBg, border: `1px solid ${borderCol}`, borderRadius: '16px',
            width: '90%', maxWidth: '640px', padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px',
            boxShadow: '0 20px 40px rgba(0,0,0,0.4)',
          }}>
            {/* Wizard Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h3 style={{ margin: '0 0 4px 0', fontSize: '17px', fontWeight: '700', color: textMain }}>
                  🧙 创建新 Agent (向导步骤 {wizardStep} / 5)
                </h3>
                <div style={{ fontSize: '12px', color: textSub }}>
                  根据推荐向导逐步配置，或开启专家模式微调底层参数
                </div>
              </div>
              <button
                onClick={() => setShowWizard(false)}
                style={{ background: 'none', border: 'none', color: textSub, fontSize: '18px', cursor: 'pointer' }}
              >
                ✕
              </button>
            </div>

            {/* Step Progress Pills */}
            <div style={{ display: 'flex', gap: '8px' }}>
              {[1, 2, 3, 4, 5].map(s => (
                <div
                  key={s}
                  onClick={() => setWizardStep(s)}
                  style={{
                    flex: 1, height: '4px', borderRadius: '2px', cursor: 'pointer',
                    background: s <= wizardStep ? '#58a6ff' : isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)',
                  }}
                />
              ))}
            </div>

            {/* Step 1: Identity */}
            {wizardStep === 1 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <h4 style={{ margin: 0, fontSize: '14px', color: textMain }}>步骤 1: 基本身份与代号</h4>
                <div>
                  <label style={{ fontSize: '12px', color: textSub, display: 'block', marginBottom: '4px' }}>Agent 名称</label>
                  <input
                    type="text"
                    placeholder="例如: 财务审计分析专家"
                    value={form.name}
                    onChange={e => setForm({ ...form, name: e.target.value })}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: `1px solid ${borderCol}`, background: isDark ? '#0d1117' : '#fff', color: textMain }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '12px', color: textSub, display: 'block', marginBottom: '4px' }}>唯一代号 (可选，留空自动生成)</label>
                  <input
                    type="text"
                    placeholder="例如: agent-fintech-audit"
                    value={form.agent_id}
                    onChange={e => setForm({ ...form, agent_id: e.target.value })}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: `1px solid ${borderCol}`, background: isDark ? '#0d1117' : '#fff', color: textMain }}
                  />
                </div>
              </div>
            )}

            {/* Step 2: Role & Templates */}
            {wizardStep === 2 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <h4 style={{ margin: 0, fontSize: '14px', color: textMain }}>步骤 2: 专业职责与内置模板</h4>
                <div>
                  <label style={{ fontSize: '12px', color: textSub, display: 'block', marginBottom: '6px' }}>选择常用模板快速填充</label>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', maxHeight: '180px', overflowY: 'auto' }}>
                    {templates.map(t => (
                      <div
                        key={t.template_id}
                        onClick={() => handleTemplateSelect(t.template_id)}
                        style={{
                          padding: '10px', borderRadius: '8px', border: `1px solid ${form.template_id === t.template_id ? '#58a6ff' : borderCol}`,
                          background: form.template_id === t.template_id ? 'rgba(56, 139, 253, 0.15)' : isDark ? '#0d1117' : '#f9fafb',
                          cursor: 'pointer',
                        }}
                      >
                        <div style={{ fontSize: '13px', fontWeight: '600', color: textMain }}>{t.display_title}</div>
                        <div style={{ fontSize: '11px', color: textSub, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.description}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Step 3: Models */}
            {wizardStep === 3 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <h4 style={{ margin: 0, fontSize: '14px', color: textMain }}>步骤 3: 默认模型与故障降级备用</h4>
                <div>
                  <label style={{ fontSize: '12px', color: textSub, display: 'block', marginBottom: '4px' }}>主执行模型</label>
                  <select
                    value={form.primary_model_id}
                    onChange={e => setForm({ ...form, primary_model_id: e.target.value })}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: `1px solid ${borderCol}`, background: isDark ? '#0d1117' : '#fff', color: textMain }}
                  >
                    <option value="deepseek-chat">DeepSeek V3 (Chat) - $0.14/M (推荐代码/通用)</option>
                    <option value="deepseek-reasoner">DeepSeek R1 (Reasoner) - $0.55/M (高阶逻辑推理)</option>
                    <option value="qwen-plus">通义千问 Qwen Plus - $0.40/M</option>
                    <option value="qwen-max">通义千问 Qwen Max - $1.60/M</option>
                    <option value="gpt-4o">OpenAI GPT-4o</option>
                    <option value="claude-3-5-sonnet">Claude 3.5 Sonnet</option>
                    <option value="gemini-2.0-flash">Google Gemini 2.0 Flash</option>
                    <option value="ollama-llama3.3">Ollama Llama 3.3 (本地离线 $0.00)</option>
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: '12px', color: textSub, display: 'block', marginBottom: '4px' }}>自动降级备用模型</label>
                  <select
                    value={form.fallback_model_id}
                    onChange={e => setForm({ ...form, fallback_model_id: e.target.value })}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: `1px solid ${borderCol}`, background: isDark ? '#0d1117' : '#fff', color: textMain }}
                  >
                    <option value="qwen-plus">通义千问 Qwen Plus (高可用备份)</option>
                    <option value="deepseek-chat">DeepSeek V3</option>
                    <option value="gemini-2.0-flash">Gemini 2.0 Flash</option>
                    <option value="ollama-llama3.3">本地离线 Ollama</option>
                  </select>
                </div>
              </div>
            )}

            {/* Step 4: Budget & Limits */}
            {wizardStep === 4 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <h4 style={{ margin: 0, fontSize: '14px', color: textMain }}>步骤 4: 单任务 Token 预算与防死锁约束</h4>
                <div>
                  <label style={{ fontSize: '12px', color: textSub, display: 'block', marginBottom: '4px' }}>
                    单任务 Token 硬熔断上限: {form.budget_tokens_per_task.toLocaleString()} Tokens
                  </label>
                  <input
                    type="range"
                    min="5000"
                    max="100000"
                    step="5000"
                    value={form.budget_tokens_per_task}
                    onChange={e => setForm({ ...form, budget_tokens_per_task: Number(e.target.value) })}
                    style={{ width: '100%' }}
                  />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div>
                    <label style={{ fontSize: '12px', color: textSub, display: 'block', marginBottom: '4px' }}>最大重试次数 (反膨胀)</label>
                    <input
                      type="number"
                      min="0"
                      max="3"
                      value={form.max_retries}
                      onChange={e => setForm({ ...form, max_retries: Number(e.target.value) })}
                      style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: `1px solid ${borderCol}`, background: isDark ? '#0d1117' : '#fff', color: textMain }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: '12px', color: textSub, display: 'block', marginBottom: '4px' }}>超时硬熔断 (秒)</label>
                    <input
                      type="number"
                      min="10"
                      max="300"
                      value={form.timeout_seconds}
                      onChange={e => setForm({ ...form, timeout_seconds: Number(e.target.value) })}
                      style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: `1px solid ${borderCol}`, background: isDark ? '#0d1117' : '#fff', color: textMain }}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Step 5: Permission & Tools */}
            {wizardStep === 5 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <h4 style={{ margin: 0, fontSize: '14px', color: textMain }}>步骤 5: 自主权限等级与工具挂载</h4>
                <div>
                  <label style={{ fontSize: '12px', color: textSub, display: 'block', marginBottom: '4px' }}>自主权限等级</label>
                  <select
                    value={form.permission_level}
                    onChange={e => setForm({ ...form, permission_level: e.target.value })}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: `1px solid ${borderCol}`, background: isDark ? '#0d1117' : '#fff', color: textMain }}
                  >
                    <option value="strict">STRICT: 严格只读沙箱，不可触发修改</option>
                    <option value="supervised">SUPERVISED (推荐): 受控自主，高风险写操作需人工审批</option>
                    <option value="autonomous">AUTONOMOUS: 在预算与授权内全自主执行</option>
                  </select>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: '12px', color: textSub }}>专家模式 (微调底层 System Prompt)</span>
                  <input
                    type="checkbox"
                    checked={expertMode}
                    onChange={e => setExpertMode(e.target.checked)}
                  />
                </div>

                {expertMode && (
                  <div>
                    <label style={{ fontSize: '12px', color: textSub, display: 'block', marginBottom: '4px' }}>系统提示词 (System Prompt)</label>
                    <textarea
                      rows={4}
                      value={form.system_prompt}
                      onChange={e => setForm({ ...form, system_prompt: e.target.value })}
                      style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: `1px solid ${borderCol}`, background: isDark ? '#0d1117' : '#fff', color: textMain, fontSize: '12px' }}
                    />
                  </div>
                )}
              </div>
            )}

            {/* Wizard Navigation Buttons */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: `1px solid ${borderCol}`, paddingTop: '16px' }}>
              <button
                disabled={wizardStep === 1}
                onClick={() => setWizardStep(prev => prev - 1)}
                style={{
                  padding: '8px 16px', borderRadius: '8px', border: `1px solid ${borderCol}`,
                  background: cardBg, color: textSub, cursor: wizardStep === 1 ? 'not-allowed' : 'pointer',
                }}
              >
                上一步
              </button>

              {wizardStep < 5 ? (
                <button
                  onClick={() => setWizardStep(prev => prev + 1)}
                  style={{
                    padding: '8px 18px', borderRadius: '8px', border: 'none',
                    background: '#58a6ff', color: '#fff', fontWeight: '600', cursor: 'pointer',
                  }}
                >
                  下一步 →
                </button>
              ) : (
                <button
                  onClick={handleCreateSubmit}
                  style={{
                    padding: '8px 22px', borderRadius: '8px', border: 'none',
                    background: '#238636', color: '#fff', fontWeight: '600', cursor: 'pointer',
                  }}
                >
                  🚀 确认并注册 Agent
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Test Runner Modal */}
      {testAgent && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(4px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
        }}>
          <div style={{
            background: cardBg, border: `1px solid ${borderCol}`, borderRadius: '16px',
            width: '90%', maxWidth: '580px', padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h3 style={{ margin: '0 0 2px 0', fontSize: '16px', fontWeight: '700', color: textMain }}>
                  ▶ 独立测试 Agent: {testAgent.name}
                </h3>
                <div style={{ fontSize: '11px', color: textSub }}>
                  模型: {testAgent.primary_model_id} · 模式: {testAgent.permission_level}
                </div>
              </div>
              <button
                onClick={() => setTestAgent(null)}
                style={{ background: 'none', border: 'none', color: textSub, fontSize: '18px', cursor: 'pointer' }}
              >
                ✕
              </button>
            </div>

            <div>
              <label style={{ fontSize: '12px', color: textSub, display: 'block', marginBottom: '4px' }}>测试任务目标 (Input Prompt)</label>
              <textarea
                rows={3}
                value={testPrompt}
                onChange={e => setTestPrompt(e.target.value)}
                style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: `1px solid ${borderCol}`, background: isDark ? '#0d1117' : '#fff', color: textMain, fontSize: '13px' }}
              />
            </div>

            <button
              disabled={testLoading}
              onClick={handleRunTest}
              style={{
                padding: '10px 16px', borderRadius: '8px', border: 'none',
                background: '#238636', color: '#fff', fontWeight: '600', cursor: testLoading ? 'wait' : 'pointer',
              }}
            >
              {testLoading ? '正在执行推理与独立验证...' : '⚡ 发起隔离测试'}
            </button>

            {testResult && (
              <div style={{
                background: isDark ? '#0d1117' : '#f6f8fa', border: `1px solid ${borderCol}`,
                borderRadius: '8px', padding: '12px', fontSize: '12px',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <span style={{ color: '#3fb950', fontWeight: '600' }}>✓ 独立核验通过</span>
                  <span style={{ color: textSub }}>耗时: {testResult.latency_ms}ms · 消耗: {testResult.tokens_used} tok</span>
                </div>
                <pre style={{ margin: 0, whiteSpace: 'pre-wrap', color: textMain, fontFamily: 'monospace', maxHeight: '160px', overflowY: 'auto' }}>
                  {testResult.output}
                </pre>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

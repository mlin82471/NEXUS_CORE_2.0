import React, { useState, useEffect } from 'react';
import { ModelItem, ProviderPresetItem } from '../types.ts';

const API_BASE = typeof window !== 'undefined' && window.location.origin.startsWith('http') ? '' : 'http://127.0.0.1:8000';

interface ModelCenterProps {
  isDark?: boolean;
}

export const ModelCenter: React.FC<ModelCenterProps> = ({ isDark = true }) => {
  const [models, setModels] = useState<ModelItem[]>([]);
  const [providers, setProviders] = useState<ProviderPresetItem[]>([]);
  const [routingPolicy, setRoutingPolicy] = useState<any>({
    mode: 'auto_complexity',
    manual_model_id: 'deepseek-chat',
    cost_threshold_usd_per_m: 1.0,
    fallback_model_id: 'qwen-plus',
  });
  const [loading, setLoading] = useState(true);

  // Add Model Modal State
  const [showAddModal, setShowAddModal] = useState(false);
  const [addForm, setAddForm] = useState({
    provider_type: 'deepseek',
    model_id: '',
    display_name: '',
    api_base: '',
    api_key: '',
  });

  // Ping Testing State
  const [pingTesting, setPingTesting] = useState(false);
  const [pingResult, setPingResult] = useState<any>(null);

  const fetchModels = async () => {
    try {
      setLoading(true);
      const res = await fetch(`${API_BASE}/api/models`);
      if (res.ok) setModels(await res.json());
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const fetchProviders = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/models/providers`);
      if (res.ok) setProviders(await res.json());
    } catch (err) {
      console.error(err);
    }
  };

  const fetchPolicy = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/models/routing/policy`);
      if (res.ok) setRoutingPolicy(await res.json());
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchModels();
    fetchProviders();
    fetchPolicy();
  }, []);

  const handleProviderSelect = (ptype: string) => {
    const p = providers.find(item => item.provider_type === ptype);
    if (p) {
      setAddForm(prev => ({
        ...prev,
        provider_type: ptype,
        api_base: p.default_api_base,
        model_id: p.recommended_models[0] || '',
        display_name: `${p.display_name} - ${p.recommended_models[0] || 'Model'}`,
      }));
    }
  };

  const handleTestConnection = async () => {
    try {
      setPingTesting(true);
      setPingResult(null);
      const res = await fetch(`${API_BASE}/api/models/test-connection`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider_type: addForm.provider_type,
          api_base: addForm.api_base,
          api_key: addForm.api_key || 'mock-key',
          model_id: addForm.model_id,
        }),
      });
      const data = await res.json();
      setPingResult(data);
    } catch (err: any) {
      setPingResult({ ok: false, error: err.message });
    } finally {
      setPingTesting(false);
    }
  };

  const handleAddModelSubmit = async () => {
    if (!addForm.model_id || !addForm.api_key) {
      alert('请填写模型 ID 与 API Key');
      return;
    }
    try {
      const res = await fetch(`${API_BASE}/api/models`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(addForm),
      });
      if (res.ok) {
        setShowAddModal(false);
        fetchModels();
      } else {
        const err = await res.json();
        alert(`添加失败: ${err.detail || '未知异常'}`);
      }
    } catch (err: any) {
      alert(`网络错误: ${err.message}`);
    }
  };

  const handleSavePolicy = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/models/routing/policy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(routingPolicy),
      });
      if (res.ok) {
        alert('智能路由策略已成功保存并实时生效！');
      }
    } catch (err: any) {
      alert(`保存失败: ${err.message}`);
    }
  };

  const cardBg = isDark ? '#161b22' : '#ffffff';
  const borderCol = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)';
  const textMain = isDark ? '#f0f6fc' : '#1d1d1f';
  const textSub = isDark ? '#8b949e' : '#86868b';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '14px' }}>
        <div>
          <h2 style={{ margin: '0 0 4px 0', fontSize: '20px', fontWeight: '700', color: textMain }}>
            🌐 模型接入与管理中心
          </h2>
          <div style={{ fontSize: '13px', color: textSub }}>
            主流服务商插件化预设 · 秘钥脱敏防护 · 延迟测速 · 上下文参数 · 智能多级路由
          </div>
        </div>

        <button
          onClick={() => {
            setShowAddModal(true);
            handleProviderSelect('deepseek');
          }}
          style={{
            padding: '10px 18px', borderRadius: '10px', border: 'none',
            background: '#238636', color: '#ffffff', fontWeight: '600',
            fontSize: '13px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px',
          }}
        >
          <span>+</span> 接入新模型服务商
        </button>
      </div>

      {/* Provider Presets Banner */}
      <div className="apple-card" style={{ background: cardBg, border: `1px solid ${borderCol}`, borderRadius: '16px', padding: '18px', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', boxShadow: isDark ? '0 8px 24px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.06)' : '0 8px 24px rgba(0,0,0,0.04), inset 0 1px 0 rgba(255,255,255,0.9)' }}>
        <h3 style={{ margin: '0 0 12px 0', fontSize: '14px', fontWeight: '600', color: textMain }}>
          🧩 支持的官方模型服务商预设
        </h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '10px' }}>
          {providers.map(p => (
            <div
              key={p.provider_type}
              onClick={() => {
                setShowAddModal(true);
                handleProviderSelect(p.provider_type);
              }}
              className="apple-card"
              style={{
                padding: '12px', borderRadius: '10px', border: `1px solid ${borderCol}`,
                background: isDark ? '#0d1117' : '#f9fafb', cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: '10px',
              }}
            >
              <span style={{ fontSize: '22px' }}>{p.icon}</span>
              <div>
                <div style={{ fontSize: '13px', fontWeight: '600', color: textMain }}>{p.display_name}</div>
                <div style={{ fontSize: '11px', color: textSub }}>{p.recommended_models.length} 个推荐模型</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Dynamic Routing Policy Setting Card */}
      <div className="apple-card" style={{ background: cardBg, border: `1px solid ${borderCol}`, borderRadius: '16px', padding: '20px', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', boxShadow: isDark ? '0 8px 24px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.06)' : '0 8px 24px rgba(0,0,0,0.04), inset 0 1px 0 rgba(255,255,255,0.9)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h3 style={{ margin: 0, fontSize: '15px', fontWeight: '600', color: textMain }}>
            🎯 智能模型路由策略 (Smart Routing Engine)
          </h3>
          <button
            onClick={handleSavePolicy}
            style={{ padding: '6px 14px', borderRadius: '6px', border: 'none', background: '#58a6ff', color: '#fff', fontSize: '12px', fontWeight: '600', cursor: 'pointer' }}
          >
            保存策略
          </button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px' }}>
          {/* Mode 1: Auto Complexity */}
          <div
            onClick={() => setRoutingPolicy({ ...routingPolicy, mode: 'auto_complexity' })}
            style={{
              padding: '14px', borderRadius: '10px', border: `1px solid ${routingPolicy.mode === 'auto_complexity' ? '#58a6ff' : borderCol}`,
              background: routingPolicy.mode === 'auto_complexity' ? 'rgba(56, 139, 253, 0.12)' : isDark ? '#0d1117' : '#f9fafb',
              cursor: 'pointer',
            }}
          >
            <div style={{ fontSize: '14px', fontWeight: '700', color: textMain, marginBottom: '4px' }}>
              🤖 复杂度自适应 (推荐)
            </div>
            <div style={{ fontSize: '12px', color: textSub }}>
              简单任务选低价快速模型；复杂架构或多轮推理自动路由至 DeepSeek R1 / Qwen Max。
            </div>
          </div>

          {/* Mode 2: Cost Optimized */}
          <div
            onClick={() => setRoutingPolicy({ ...routingPolicy, mode: 'cost_optimized' })}
            style={{
              padding: '14px', borderRadius: '10px', border: `1px solid ${routingPolicy.mode === 'cost_optimized' ? '#58a6ff' : borderCol}`,
              background: routingPolicy.mode === 'cost_optimized' ? 'rgba(56, 139, 253, 0.12)' : isDark ? '#0d1117' : '#f9fafb',
              cursor: 'pointer',
            }}
          >
            <div style={{ fontSize: '14px', fontWeight: '700', color: textMain, marginBottom: '4px' }}>
              💰 成本优先模式
            </div>
            <div style={{ fontSize: '12px', color: textSub }}>
              在满足质量阈值前提下，优先选取单价最低模型 (如 DeepSeek V3 $0.14/M 或本地 Ollama $0)。
            </div>
          </div>

          {/* Mode 3: Manual Mode */}
          <div
            onClick={() => setRoutingPolicy({ ...routingPolicy, mode: 'manual' })}
            style={{
              padding: '14px', borderRadius: '10px', border: `1px solid ${routingPolicy.mode === 'manual' ? '#58a6ff' : borderCol}`,
              background: routingPolicy.mode === 'manual' ? 'rgba(56, 139, 253, 0.12)' : isDark ? '#0d1117' : '#f9fafb',
              cursor: 'pointer',
            }}
          >
            <div style={{ fontSize: '14px', fontWeight: '700', color: textMain, marginBottom: '4px' }}>
              ⚙️ 手动指定模型
            </div>
            <div style={{ fontSize: '12px', color: textSub }}>
              固定由特定模型承揽所有分发子任务。
            </div>
          </div>
        </div>
      </div>

      {/* Configured Models Table */}
      <div style={{ background: cardBg, border: `1px solid ${borderCol}`, borderRadius: '16px', overflow: 'hidden' }}>
        <div style={{ padding: '16px 20px', borderBottom: `1px solid ${borderCol}` }}>
          <h3 style={{ margin: 0, fontSize: '15px', fontWeight: '600', color: textMain }}>
            📋 已接入运行的模型列表 ({models.length})
          </h3>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'left' }}>
            <thead>
              <tr style={{ background: isDark ? 'rgba(0,0,0,0.2)' : 'rgba(0,0,0,0.02)', color: textSub, borderBottom: `1px solid ${borderCol}` }}>
                <th style={{ padding: '12px 18px' }}>模型 ID / 服务商</th>
                <th style={{ padding: '12px 14px' }}>API 端点与凭证</th>
                <th style={{ padding: '12px 14px' }}>连通延迟</th>
                <th style={{ padding: '12px 14px' }}>能力特性</th>
                <th style={{ padding: '12px 14px' }}>上下文窗口</th>
                <th style={{ padding: '12px 14px' }}>费率 (输入 / 输出)</th>
                <th style={{ padding: '12px 18px', textAlign: 'right' }}>状态</th>
              </tr>
            </thead>
            <tbody>
              {models.map(m => (
                <tr key={m.model_id} style={{ borderBottom: `1px solid ${borderCol}` }}>
                  <td style={{ padding: '14px 18px' }}>
                    <div style={{ fontWeight: '600', color: textMain }}>{m.display_name}</div>
                    <div style={{ fontSize: '11px', color: textSub, fontFamily: 'monospace' }}>{m.model_id}</div>
                  </td>
                  <td style={{ padding: '14px 14px' }}>
                    <div style={{ fontSize: '11px', color: textSub, overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '200px' }}>
                      {m.api_base}
                    </div>
                    <div style={{ fontSize: '11px', color: '#58a6ff', fontFamily: 'monospace' }}>
                      {m.credential_ref}
                    </div>
                  </td>
                  <td style={{ padding: '14px 14px' }}>
                    <span style={{ fontSize: '12px', color: '#3fb950', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#3fb950' }} />
                      {m.last_ping_ms}ms
                    </span>
                  </td>
                  <td style={{ padding: '14px 14px' }}>
                    <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                      {m.capabilities.supports_tools && <span style={{ fontSize: '10px', padding: '1px 5px', borderRadius: '4px', background: 'rgba(56, 139, 253, 0.15)', color: '#58a6ff' }}>Tools</span>}
                      {m.capabilities.supports_reasoning && <span style={{ fontSize: '10px', padding: '1px 5px', borderRadius: '4px', background: 'rgba(188, 140, 255, 0.15)', color: '#bc8cff' }}>Reasoner</span>}
                      {m.capabilities.supports_vision && <span style={{ fontSize: '10px', padding: '1px 5px', borderRadius: '4px', background: 'rgba(63, 185, 80, 0.15)', color: '#3fb950' }}>Vision</span>}
                    </div>
                  </td>
                  <td style={{ padding: '14px 14px', color: textMain, fontWeight: '500' }}>
                    {(m.capabilities.context_window / 1000).toFixed(0)}k tokens
                  </td>
                  <td style={{ padding: '14px 14px', color: textSub }}>
                    ${m.pricing.input_price_per_m} / ${m.pricing.output_price_per_m} <span style={{ fontSize: '10px' }}>/ 1M</span>
                  </td>
                  <td style={{ padding: '14px 18px', textAlign: 'right' }}>
                    <span style={{
                      fontSize: '11px', padding: '2px 8px', borderRadius: '10px',
                      background: m.enabled ? 'rgba(63, 185, 80, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                      color: m.enabled ? '#3fb950' : '#f85149', fontWeight: '600',
                    }}>
                      {m.enabled ? '已启用' : '未就绪'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Model Modal */}
      {showAddModal && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(4px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
        }}>
          <div className="apple-modal-box" style={{
            background: cardBg, border: `1px solid ${borderCol}`, borderRadius: '16px',
            width: '90%', maxWidth: '580px', padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px',
            boxShadow: '0 24px 48px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.1)',
            backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, fontSize: '17px', fontWeight: '700', color: textMain }}>
                🌐 接入新大模型服务商
              </h3>
              <button onClick={() => setShowAddModal(false)} style={{ background: 'none', border: 'none', color: textSub, fontSize: '18px', cursor: 'pointer' }}>✕</button>
            </div>

            <div>
              <label style={{ fontSize: '12px', color: textSub, display: 'block', marginBottom: '4px' }}>选择服务商类型</label>
              <select
                value={addForm.provider_type}
                onChange={e => handleProviderSelect(e.target.value)}
                style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: `1px solid ${borderCol}`, background: isDark ? '#0d1117' : '#fff', color: textMain }}
              >
                {providers.map(p => (
                  <option key={p.provider_type} value={p.provider_type}>{p.display_name}</option>
                ))}
              </select>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div>
                <label style={{ fontSize: '12px', color: textSub, display: 'block', marginBottom: '4px' }}>模型 ID</label>
                <input
                  type="text"
                  placeholder="deepseek-chat"
                  value={addForm.model_id}
                  onChange={e => setAddForm({ ...addForm, model_id: e.target.value })}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: `1px solid ${borderCol}`, background: isDark ? '#0d1117' : '#fff', color: textMain }}
                />
              </div>
              <div>
                <label style={{ fontSize: '12px', color: textSub, display: 'block', marginBottom: '4px' }}>显示名称</label>
                <input
                  type="text"
                  placeholder="DeepSeek V3"
                  value={addForm.display_name}
                  onChange={e => setAddForm({ ...addForm, display_name: e.target.value })}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: `1px solid ${borderCol}`, background: isDark ? '#0d1117' : '#fff', color: textMain }}
                />
              </div>
            </div>

            <div>
              <label style={{ fontSize: '12px', color: textSub, display: 'block', marginBottom: '4px' }}>API 端点 URL (API Base)</label>
              <input
                type="text"
                value={addForm.api_base}
                onChange={e => setAddForm({ ...addForm, api_base: e.target.value })}
                style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: `1px solid ${borderCol}`, background: isDark ? '#0d1117' : '#fff', color: textMain }}
              />
            </div>

            <div>
              <label style={{ fontSize: '12px', color: textSub, display: 'block', marginBottom: '4px' }}>API Key (存入受保护 Secret Store，前端脱敏不回显明文)</label>
              <input
                type="password"
                placeholder="sk-..."
                value={addForm.api_key}
                onChange={e => setAddForm({ ...addForm, api_key: e.target.value })}
                style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: `1px solid ${borderCol}`, background: isDark ? '#0d1117' : '#fff', color: textMain }}
              />
            </div>

            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                disabled={pingTesting}
                onClick={handleTestConnection}
                style={{
                  padding: '8px 14px', borderRadius: '8px', border: `1px solid ${borderCol}`,
                  background: isDark ? '#1f2937' : '#f0f7ff', color: '#58a6ff', fontSize: '12px', fontWeight: '600', cursor: pingTesting ? 'wait' : 'pointer',
                }}
              >
                {pingTesting ? '正在探测连通性...' : '⚡ 测速与连接测试'}
              </button>
            </div>

            {pingResult && (
              <div style={{
                background: pingResult.ok ? 'rgba(63, 185, 80, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                border: `1px solid ${pingResult.ok ? '#3fb950' : '#ef4444'}`,
                borderRadius: '8px', padding: '10px 14px', fontSize: '12px',
                color: pingResult.ok ? '#3fb950' : '#ef4444',
              }}>
                <div><strong>{pingResult.ok ? '✓ 连接成功' : '✕ 连接失败'}:</strong> {pingResult.message || pingResult.error}</div>
                {pingResult.reported_models && (
                  <div style={{ fontSize: '11px', marginTop: '4px', color: textSub }}>
                    探测到可用模型: {pingResult.reported_models.join(', ')}
                  </div>
                )}
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
              <button
                onClick={() => setShowAddModal(false)}
                style={{ padding: '8px 16px', borderRadius: '8px', border: `1px solid ${borderCol}`, background: cardBg, color: textSub, cursor: 'pointer' }}
              >
                取消
              </button>
              <button
                onClick={handleAddModelSubmit}
                style={{ padding: '8px 20px', borderRadius: '8px', border: 'none', background: '#238636', color: '#fff', fontWeight: '600', cursor: 'pointer' }}
              >
                保存模型接入
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

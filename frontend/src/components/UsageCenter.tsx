import React, { useState, useEffect } from 'react';
import { AgentRankingItem, ModelCostItem, TaskCostAuditItem, UsageSummaryData } from '../types.ts';

const API_BASE = 'http://127.0.0.1:8000';

interface UsageCenterProps {
  isDark?: boolean;
}

export const UsageCenter: React.FC<UsageCenterProps> = ({ isDark = true }) => {
  const [summary, setSummary] = useState<UsageSummaryData | null>(null);
  const [rankings, setRankings] = useState<AgentRankingItem[]>([]);
  const [modelCosts, setModelCosts] = useState<ModelCostItem[]>([]);
  const [taskAudits, setTaskAudits] = useState<TaskCostAuditItem[]>([]);
  const [records, setRecords] = useState<any[]>([]);
  const [activeSubTab, setActiveSubTab] = useState<'agents' | 'models' | 'retries' | 'records' | 'budget'>('agents');
  const [budgetStatus, setBudgetStatus] = useState<any>(null);

  const fetchAllUsage = async () => {
    try {
      const [rSum, rRank, rMod, rAud, rRec, rBud] = await Promise.all([
        fetch(`${API_BASE}/api/usage/summary`),
        fetch(`${API_BASE}/api/usage/by-agent`),
        fetch(`${API_BASE}/api/usage/by-model`),
        fetch(`${API_BASE}/api/usage/task-audits`),
        fetch(`${API_BASE}/api/usage/records?limit=25`),
        fetch(`${API_BASE}/api/usage/budget/check`),
      ]);

      if (rSum.ok) setSummary(await rSum.json());
      if (rRank.ok) setRankings(await rRank.json());
      if (rMod.ok) setModelCosts(await rMod.json());
      if (rAud.ok) setTaskAudits(await rAud.json());
      if (rRec.ok) setRecords(await rRec.json());
      if (rBud.ok) setBudgetStatus(await rBud.json());
    } catch (err) {
      console.error('Failed to load usage data', err);
    }
  };

  useEffect(() => {
    fetchAllUsage();
  }, []);

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
            📊 Token 与成本监控中心
          </h2>
          <div style={{ fontSize: '13px', color: textSub }}>
            真实 vs 估算严格分轨 · 5维穿透报表 · 任务重试溢价审计 · 多层级预算熔断
          </div>
        </div>

        <button
          onClick={fetchAllUsage}
          style={{
            padding: '8px 16px', borderRadius: '8px', border: `1px solid ${borderCol}`,
            background: isDark ? '#1f2937' : '#f0f7ff', color: '#58a6ff',
            fontSize: '12px', fontWeight: '600', cursor: 'pointer',
          }}
        >
          🔄 实时刷新对账
        </button>
      </div>

      {/* Audit Transparency Strip */}
      <div style={{
        background: isDark ? 'rgba(63, 185, 80, 0.08)' : 'rgba(52, 199, 89, 0.08)',
        border: '1px solid rgba(63, 185, 80, 0.25)',
        borderRadius: '12px', padding: '14px 20px',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ fontSize: '18px' }}>🛡️</span>
          <div>
            <div style={{ fontSize: '13px', fontWeight: '600', color: textMain }}>
              工程级真实 Token 审计保障体系 (RFC 8785 签名保护)
            </div>
            <div style={{ fontSize: '12px', color: textSub }}>
              本系统严格区分 <strong>Provider 官方回传 (`provider_reported`)</strong> 与字符估算值 (`estimated`)，杜绝假数据混入计费报表。
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          <span style={{ fontSize: '12px', padding: '4px 10px', borderRadius: '6px', background: 'rgba(63, 185, 80, 0.2)', color: '#3fb950', fontWeight: '600' }}>
            ✓ 真实用量: {summary?.real_tokens_pct || 100}%
          </span>
          <span style={{ fontSize: '12px', padding: '4px 10px', borderRadius: '6px', background: 'rgba(210, 153, 34, 0.2)', color: '#d29922', fontWeight: '600' }}>
            估算用量: {summary?.estimated_tokens_pct || 0}%
          </span>
        </div>
      </div>

      {/* KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px' }}>
        <div style={{ background: cardBg, border: `1px solid ${borderCol}`, borderRadius: '14px', padding: '18px' }}>
          <div style={{ fontSize: '12px', color: textSub, marginBottom: '6px' }}>今日消耗 Token</div>
          <div style={{ fontSize: '26px', fontWeight: '700', color: textMain, letterSpacing: '-0.02em' }}>
            {((summary?.today_tokens || 0) / 1000).toFixed(1)}k
          </div>
          <div style={{ fontSize: '11px', color: textSub, marginTop: '4px' }}>全系统所有 Agent 汇总</div>
        </div>

        <div style={{ background: cardBg, border: `1px solid ${borderCol}`, borderRadius: '14px', padding: '18px' }}>
          <div style={{ fontSize: '12px', color: textSub, marginBottom: '6px' }}>今日预估费用</div>
          <div style={{ fontSize: '26px', fontWeight: '700', color: '#3fb950', letterSpacing: '-0.02em' }}>
            ${(summary?.today_cost_usd || 0).toFixed(2)}
          </div>
          <div style={{ fontSize: '11px', color: textSub, marginTop: '4px' }}>
            按服务商费率核算 (约 ¥{((summary?.today_cost_usd || 0) * 7.25).toFixed(2)})
          </div>
        </div>

        <div style={{ background: cardBg, border: `1px solid ${borderCol}`, borderRadius: '14px', padding: '18px' }}>
          <div style={{ fontSize: '12px', color: textSub, marginBottom: '6px' }}>执行任务数</div>
          <div style={{ fontSize: '26px', fontWeight: '700', color: textMain, letterSpacing: '-0.02em' }}>
            {summary?.today_tasks_count || 0}
          </div>
          <div style={{ fontSize: '11px', color: textSub, marginTop: '4px' }}>真实任务实例</div>
        </div>

        <div style={{ background: cardBg, border: `1px solid ${borderCol}`, borderRadius: '14px', padding: '18px' }}>
          <div style={{ fontSize: '12px', color: textSub, marginBottom: '6px' }}>单任务平均消耗</div>
          <div style={{ fontSize: '26px', fontWeight: '700', color: textMain, letterSpacing: '-0.02em' }}>
            {((summary?.avg_tokens_per_task || 0) / 1000).toFixed(1)}k
          </div>
          <div style={{ fontSize: '11px', color: textSub, marginTop: '4px' }}>Tokens / Task</div>
        </div>
      </div>

      {/* Sub Tabs Navigation */}
      <div style={{ display: 'flex', gap: '8px', borderBottom: `1px solid ${borderCol}`, paddingBottom: '12px', overflowX: 'auto' }}>
        {[
          { key: 'agents', label: '🤖 Agent 消耗排行' },
          { key: 'models', label: '🌐 模型费用分布' },
          { key: 'retries', label: '⚠️ 重试溢价审计' },
          { key: 'records', label: '📋 明细流水对账' },
          { key: 'budget', label: '🛡️ 预算熔断策略' },
        ].map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveSubTab(tab.key as any)}
            style={{
              padding: '8px 16px', borderRadius: '8px', border: 'none',
              background: activeSubTab === tab.key ? '#58a6ff' : isDark ? '#161b22' : 'rgba(0,0,0,0.04)',
              color: activeSubTab === tab.key ? '#ffffff' : textSub,
              fontSize: '13px', fontWeight: '600', cursor: 'pointer', whiteSpace: 'nowrap',
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* View 1: Agent Rankings */}
      {activeSubTab === 'agents' && (
        <div style={{ background: cardBg, border: `1px solid ${borderCol}`, borderRadius: '16px', overflow: 'hidden' }}>
          <div style={{ padding: '16px 20px', borderBottom: `1px solid ${borderCol}` }}>
            <h3 style={{ margin: 0, fontSize: '15px', fontWeight: '600', color: textMain }}>
              Agent 累计消耗与产出性价比排行榜
            </h3>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'left' }}>
              <thead>
                <tr style={{ background: isDark ? 'rgba(0,0,0,0.2)' : 'rgba(0,0,0,0.02)', color: textSub, borderBottom: `1px solid ${borderCol}` }}>
                  <th style={{ padding: '12px 18px' }}>排名 / Agent</th>
                  <th style={{ padding: '12px 14px' }}>总消耗 Tokens</th>
                  <th style={{ padding: '12px 14px' }}>预估成本 (USD)</th>
                  <th style={{ padding: '12px 14px' }}>执行任务数</th>
                  <th style={{ padding: '12px 14px' }}>平均消耗 / 任务</th>
                  <th style={{ padding: '12px 18px', textAlign: 'right' }}>效率评分</th>
                </tr>
              </thead>
              <tbody>
                {rankings.map((r, i) => (
                  <tr key={r.agent_id} style={{ borderBottom: `1px solid ${borderCol}` }}>
                    <td style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <span style={{
                        width: '20px', height: '20px', borderRadius: '50%',
                        background: i === 0 ? 'rgba(210, 153, 34, 0.2)' : 'rgba(255,255,255,0.06)',
                        color: i === 0 ? '#d29922' : textSub,
                        display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: '700',
                      }}>
                        {i + 1}
                      </span>
                      <div>
                        <div style={{ fontWeight: '600', color: textMain }}>{r.agent_name}</div>
                        <div style={{ fontSize: '11px', color: textSub, fontFamily: 'monospace' }}>{r.agent_id}</div>
                      </div>
                    </td>
                    <td style={{ padding: '14px 14px', fontWeight: '600', color: textMain }}>
                      {r.total_tokens.toLocaleString()}
                    </td>
                    <td style={{ padding: '14px 14px', color: '#3fb950', fontWeight: '500' }}>
                      ${r.total_cost_usd.toFixed(4)}
                    </td>
                    <td style={{ padding: '14px 14px', color: textMain }}>
                      {r.task_count} 次
                    </td>
                    <td style={{ padding: '14px 14px', color: textSub }}>
                      {r.avg_tokens_per_task.toLocaleString()} tok
                    </td>
                    <td style={{ padding: '14px 18px', textAlign: 'right' }}>
                      <span style={{ fontSize: '12px', padding: '2px 8px', borderRadius: '6px', background: 'rgba(63, 185, 80, 0.15)', color: '#3fb950', fontWeight: '600' }}>
                        {(r.efficiency_score * 100).toFixed(0)}分
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* View 2: Model Distribution */}
      {activeSubTab === 'models' && (
        <div style={{ background: cardBg, border: `1px solid ${borderCol}`, borderRadius: '16px', overflow: 'hidden' }}>
          <div style={{ padding: '16px 20px', borderBottom: `1px solid ${borderCol}` }}>
            <h3 style={{ margin: 0, fontSize: '15px', fontWeight: '600', color: textMain }}>
              大模型费用占比与调用规模分布
            </h3>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'left' }}>
              <thead>
                <tr style={{ background: isDark ? 'rgba(0,0,0,0.2)' : 'rgba(0,0,0,0.02)', color: textSub, borderBottom: `1px solid ${borderCol}` }}>
                  <th style={{ padding: '12px 18px' }}>模型 ID</th>
                  <th style={{ padding: '12px 14px' }}>服务商</th>
                  <th style={{ padding: '12px 14px' }}>总消耗 Tokens</th>
                  <th style={{ padding: '12px 14px' }}>预估成本 (USD)</th>
                  <th style={{ padding: '12px 18px', textAlign: 'right' }}>费用占比</th>
                </tr>
              </thead>
              <tbody>
                {modelCosts.map(m => (
                  <tr key={m.model_id} style={{ borderBottom: `1px solid ${borderCol}` }}>
                    <td style={{ padding: '14px 18px', fontWeight: '600', color: textMain }}>{m.model_id}</td>
                    <td style={{ padding: '14px 14px', color: '#58a6ff' }}>{m.provider_id}</td>
                    <td style={{ padding: '14px 14px', color: textMain }}>{m.total_tokens.toLocaleString()}</td>
                    <td style={{ padding: '14px 14px', color: '#3fb950', fontWeight: '500' }}>${m.cost_usd.toFixed(4)}</td>
                    <td style={{ padding: '14px 18px', textAlign: 'right' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '8px' }}>
                        <div style={{ width: '80px', height: '6px', background: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)', borderRadius: '3px', overflow: 'hidden' }}>
                          <div style={{ width: `${m.share_pct}%`, height: '100%', background: '#58a6ff', borderRadius: '3px' }} />
                        </div>
                        <span style={{ fontSize: '12px', fontWeight: '600', color: textMain }}>{m.share_pct}%</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* View 3: Task Retry Audits */}
      {activeSubTab === 'retries' && (
        <div style={{ background: cardBg, border: `1px solid ${borderCol}`, borderRadius: '16px', overflow: 'hidden' }}>
          <div style={{ padding: '16px 20px', borderBottom: `1px solid ${borderCol}` }}>
            <h3 style={{ margin: 0, fontSize: '15px', fontWeight: '600', color: textMain }}>
              ⚠️ 任务重试膨胀审计 (识别因重试浪费的成本)
            </h3>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'left' }}>
              <thead>
                <tr style={{ background: isDark ? 'rgba(0,0,0,0.2)' : 'rgba(0,0,0,0.02)', color: textSub, borderBottom: `1px solid ${borderCol}` }}>
                  <th style={{ padding: '12px 18px' }}>任务 ID</th>
                  <th style={{ padding: '12px 14px' }}>总消耗 Tokens</th>
                  <th style={{ padding: '12px 14px' }}>重试消耗 Tokens</th>
                  <th style={{ padding: '12px 14px' }}>总成本 (USD)</th>
                  <th style={{ padding: '12px 18px', textAlign: 'right' }}>重试额外溢价占比</th>
                </tr>
              </thead>
              <tbody>
                {taskAudits.map(t => (
                  <tr key={t.task_id} style={{ borderBottom: `1px solid ${borderCol}` }}>
                    <td style={{ padding: '14px 18px', fontFamily: 'monospace', color: textMain, fontWeight: '600' }}>{t.task_id}</td>
                    <td style={{ padding: '14px 14px', color: textMain }}>{t.total_tokens.toLocaleString()}</td>
                    <td style={{ padding: '14px 14px', color: t.retry_tokens > 0 ? '#f85149' : textSub }}>{t.retry_tokens.toLocaleString()}</td>
                    <td style={{ padding: '14px 14px', color: '#3fb950' }}>${t.total_cost_usd.toFixed(4)}</td>
                    <td style={{ padding: '14px 18px', textAlign: 'right' }}>
                      <span style={{
                        fontSize: '11px', padding: '2px 8px', borderRadius: '6px',
                        background: t.retry_overhead_pct > 0 ? 'rgba(239, 68, 68, 0.15)' : 'rgba(63, 185, 80, 0.15)',
                        color: t.retry_overhead_pct > 0 ? '#f85149' : '#3fb950', fontWeight: '600',
                      }}>
                        {t.retry_overhead_pct}%
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* View 4: Itemized Records */}
      {activeSubTab === 'records' && (
        <div style={{ background: cardBg, border: `1px solid ${borderCol}`, borderRadius: '16px', overflow: 'hidden' }}>
          <div style={{ padding: '16px 20px', borderBottom: `1px solid ${borderCol}` }}>
            <h3 style={{ margin: 0, fontSize: '15px', fontWeight: '600', color: textMain }}>
              📋 实时 Token 流水账本 (最近 25 条)
            </h3>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', textAlign: 'left' }}>
              <thead>
                <tr style={{ background: isDark ? 'rgba(0,0,0,0.2)' : 'rgba(0,0,0,0.02)', color: textSub, borderBottom: `1px solid ${borderCol}` }}>
                  <th style={{ padding: '10px 14px' }}>流水号 / 任务</th>
                  <th style={{ padding: '10px 12px' }}>Agent</th>
                  <th style={{ padding: '10px 12px' }}>模型</th>
                  <th style={{ padding: '10px 12px' }}>Input</th>
                  <th style={{ padding: '10px 12px' }}>Output</th>
                  <th style={{ padding: '10px 12px' }}>Cached</th>
                  <th style={{ padding: '10px 12px' }}>Reasoning</th>
                  <th style={{ padding: '10px 12px' }}>总 Tokens</th>
                  <th style={{ padding: '10px 12px' }}>费用</th>
                  <th style={{ padding: '10px 14px', textAlign: 'right' }}>口径来源</th>
                </tr>
              </thead>
              <tbody>
                {records.map(rec => (
                  <tr key={rec.record_id} style={{ borderBottom: `1px solid ${borderCol}` }}>
                    <td style={{ padding: '10px 14px', fontFamily: 'monospace' }}>
                      <div style={{ color: textMain, fontWeight: '600' }}>{rec.task_id}</div>
                      <div style={{ fontSize: '10px', color: textSub }}>{rec.record_id}</div>
                    </td>
                    <td style={{ padding: '10px 12px', color: '#58a6ff' }}>{rec.agent_id}</td>
                    <td style={{ padding: '10px 12px', color: textMain }}>{rec.model_id}</td>
                    <td style={{ padding: '10px 12px', color: textSub }}>{rec.prompt_tokens}</td>
                    <td style={{ padding: '10px 12px', color: textSub }}>{rec.completion_tokens}</td>
                    <td style={{ padding: '10px 12px', color: textSub }}>{rec.cached_tokens}</td>
                    <td style={{ padding: '10px 12px', color: textSub }}>{rec.reasoning_tokens}</td>
                    <td style={{ padding: '10px 12px', fontWeight: '700', color: textMain }}>{rec.total_tokens}</td>
                    <td style={{ padding: '10px 12px', color: '#3fb950', fontWeight: '600' }}>${rec.cost_usd.toFixed(4)}</td>
                    <td style={{ padding: '10px 14px', textAlign: 'right' }}>
                      <span style={{
                        fontSize: '10px', padding: '1px 6px', borderRadius: '4px',
                        background: rec.usage_source === 'provider_reported' ? 'rgba(63, 185, 80, 0.15)' : 'rgba(56, 139, 253, 0.15)',
                        color: rec.usage_source === 'provider_reported' ? '#3fb950' : '#58a6ff', fontWeight: '600',
                      }}>
                        {rec.usage_source}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* View 5: Budget Guard Policies */}
      {activeSubTab === 'budget' && (
        <div style={{ background: cardBg, border: `1px solid ${borderCol}`, borderRadius: '16px', padding: '20px' }}>
          <h3 style={{ margin: '0 0 14px 0', fontSize: '15px', fontWeight: '600', color: textMain }}>
            🛡️ 分层预算控制台 (强制性 B0 协议约束)
          </h3>
          <p style={{ margin: '0 0 16px 0', fontSize: '13px', color: textSub, lineHeight: 1.5 }}>
            预算控制不仅仅是前端告警。所有限制均下沉至后端 B0 状态机与 B1 执行引擎，一旦达到 100% 阈值立即强制阻断，避免天价账单。
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px' }}>
            <div style={{ background: isDark ? '#0d1117' : '#f9fafb', border: `1px solid ${borderCol}`, borderRadius: '12px', padding: '16px' }}>
              <div style={{ fontSize: '14px', fontWeight: '700', color: textMain, marginBottom: '6px' }}>每日全局预算 (Daily Global)</div>
              <div style={{ fontSize: '12px', color: textSub, marginBottom: '10px' }}>上限: 1,000,000 Tokens · 告警线: 80%</div>
              <div style={{ fontSize: '12px', color: '#3fb950', fontWeight: '600' }}>熔断行为: BLOCK (直接阻断新任务提交)</div>
            </div>

            <div style={{ background: isDark ? '#0d1117' : '#f9fafb', border: `1px solid ${borderCol}`, borderRadius: '12px', padding: '16px' }}>
              <div style={{ fontSize: '14px', fontWeight: '700', color: textMain, marginBottom: '6px' }}>单任务预算 (Per-Task SLA)</div>
              <div style={{ fontSize: '12px', color: textSub, marginBottom: '10px' }}>上限: 100,000 Tokens · 告警线: 80%</div>
              <div style={{ fontSize: '12px', color: '#58a6ff', fontWeight: '600' }}>熔断行为: DEGRADE (自动降级至低成本模型)</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

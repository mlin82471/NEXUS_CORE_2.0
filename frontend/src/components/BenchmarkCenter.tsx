import React, { useState } from 'react';

const API_BASE = 'http://127.0.0.1:8000';

export const BenchmarkCenter: React.FC = () => {
  const [goal, setGoal] = useState('计算 2+2 的结果');
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState<any | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleRunCompare = async () => {
    if (!goal.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/benchmark/compare`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ goal: goal.trim(), task_type: 'general' })
      });
      if (!res.ok) throw new Error(`对照测试失败 HTTP ${res.status}`);
      setReport(await res.json());
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ background: '#fff', borderRadius: '18px', padding: '24px', border: '1px solid rgba(0,0,0,0.06)' }}>
      <h2 style={{ fontSize: '18px', fontWeight: '600', color: '#1d1d1f', marginBottom: '8px' }}>
        ⚖️ 单 Agent vs 多 Agent A/B 对照基准中心 (§7 收益验证)
      </h2>
      <p style={{ fontSize: '13px', color: '#86868b', marginBottom: '20px' }}>
        严格贯彻“不能为了多 Agent 而多 Agent”原则：同输入物理对照单 Agent 与多 Agent 协作，计算 Token 放大倍数与时间差异。
      </p>

      <div style={{ marginBottom: '16px' }}>
        <label style={{ display: 'block', fontSize: '12px', fontWeight: '500', color: '#86868b', marginBottom: '6px' }}>实验测试目标</label>
        <div style={{ display: 'flex', gap: '10px' }}>
          <input
            type="text"
            value={goal}
            onChange={e => setGoal(e.target.value)}
            placeholder="例如：计算 2+2 的结果 或 编写快速排序算法并测试"
            style={{ flex: 1, padding: '10px 14px', borderRadius: '10px', border: '1px solid #d2d2d7', fontSize: '13px' }}
          />
          <button
            onClick={handleRunCompare}
            disabled={loading}
            style={{
              padding: '10px 20px', borderRadius: '10px', border: 'none',
              background: '#0071e3', color: '#fff', fontSize: '13px', fontWeight: '600', cursor: 'pointer'
            }}
          >
            {loading ? '🔬 正在并发对照运行...' : '🔬 启动双模式对照实验'}
          </button>
        </div>
      </div>

      {error && (
        <div style={{ padding: '12px', background: '#ffebe9', color: '#cf222e', borderRadius: '8px', fontSize: '13px', marginBottom: '16px' }}>
          {error}
        </div>
      )}

      {report && (
        <div style={{ border: '1px solid #e5e5ea', borderRadius: '14px', padding: '20px', background: '#fafafc', marginTop: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <span style={{ fontSize: '15px', fontWeight: '600', color: report.recommendation === 'use_single_agent' ? '#0071e3' : '#34c759' }}>
              📊 智能主控判定: {report.recommendation === 'use_single_agent' ? '推荐单 Agent 直达 (避免冗余开销)' : '推荐多 Agent 协作 (解耦与验证价值成立)'}
            </span>
            <span style={{ fontSize: '12px', color: '#86868b' }}>
              分类复杂度: <strong>{report.complexity}</strong>
            </span>
          </div>

          <div style={{ fontSize: '13px', color: '#1d1d1f', background: '#fff', padding: '12px', borderRadius: '8px', border: '1px solid #e5e5ea', marginBottom: '16px' }}>
            {report.reason}
          </div>

          <table style={{ width: '100%', fontSize: '13px', borderCollapse: 'collapse', background: '#fff', borderRadius: '8px', overflow: 'hidden', border: '1px solid #e5e5ea' }}>
            <thead>
              <tr style={{ background: '#f5f5f7', borderBottom: '1px solid #e5e5ea', textAlign: 'left', color: '#86868b' }}>
                <th style={{ padding: '10px 14px' }}>对比维度</th>
                <th style={{ padding: '10px 14px' }}>单 Agent 模式 (Mode A)</th>
                <th style={{ padding: '10px 14px' }}>多 Agent 编排模式 (Mode B)</th>
                <th style={{ padding: '10px 14px' }}>对比差异 / 放大倍率</th>
              </tr>
            </thead>
            <tbody>
              <tr style={{ borderBottom: '1px solid #e5e5ea' }}>
                <td style={{ padding: '10px 14px', fontWeight: '500' }}>消耗总 Token</td>
                <td style={{ padding: '10px 14px' }}>{report.single_agent.total_tokens}</td>
                <td style={{ padding: '10px 14px' }}>{report.multi_agent.total_tokens}</td>
                <td style={{ padding: '10px 14px', color: '#ff9500', fontWeight: '600' }}>{report.token_multiplier}x 消耗</td>
              </tr>
              <tr style={{ borderBottom: '1px solid #e5e5ea' }}>
                <td style={{ padding: '10px 14px', fontWeight: '500' }}>执行耗时</td>
                <td style={{ padding: '10px 14px' }}>{report.single_agent.elapsed_seconds} s</td>
                <td style={{ padding: '10px 14px' }}>{report.multi_agent.elapsed_seconds} s</td>
                <td style={{ padding: '10px 14px' }}>Δ {report.time_delta_seconds} s</td>
              </tr>
              <tr>
                <td style={{ padding: '10px 14px', fontWeight: '500' }}>执行步骤与状态</td>
                <td style={{ padding: '10px 14px' }}>1 步 ({report.single_agent.status})</td>
                <td style={{ padding: '10px 14px' }}>{report.multi_agent.steps_count} 步 ({report.multi_agent.status})</td>
                <td style={{ padding: '10px 14px' }}>{report.multi_agent.status === 'success' ? '✅ 全部成功' : '⚠️ 存在失败'}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

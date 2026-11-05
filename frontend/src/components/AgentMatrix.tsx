import React, { useState, useEffect } from 'react';
import { AgentMetric } from '../types.ts';

const API_BASE = 'http://127.0.0.1:8000';

export const AgentMatrix: React.FC = () => {
  const [metrics, setMetrics] = useState<AgentMetric[]>([]);
  const [agents, setAgents] = useState<any[]>([]);

  const fetchData = async () => {
    try {
      const [r1, r2] = await Promise.all([
        fetch(`${API_BASE}/metrics/agents`),
        fetch(`${API_BASE}/agents`)
      ]);
      if (r1.ok) setMetrics(await r1.json());
      if (r2.ok) setAgents(await r2.json());
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  return (
    <div style={{ background: '#fff', borderRadius: '18px', padding: '24px', border: '1px solid rgba(0,0,0,0.06)' }}>
      <h2 style={{ fontSize: '18px', fontWeight: '600', color: '#1d1d1f', marginBottom: '8px' }}>
        🤖 专业 Agent 遥测与注册集群
      </h2>
      <p style={{ fontSize: '13px', color: '#86868b', marginBottom: '20px' }}>
        实时追踪每个专业执行节点（Hermes、Antigravity、DSH）的成功率、总调用量与 Token 消耗比。
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '16px' }}>
        {agents.map(a => {
          const m = metrics.find(item => item.agent_id === a.id);
          const rate = m ? Math.round(m.success_rate * 100) : 100;
          return (
            <div key={a.id} style={{ border: '1px solid #e5e5ea', borderRadius: '14px', padding: '16px', background: '#fafafc' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <strong style={{ fontSize: '14px', color: '#1d1d1f' }}>{a.name}</strong>
                <span style={{ fontSize: '11px', fontWeight: '600', padding: '2px 8px', borderRadius: '6px', background: '#e8f2ff', color: '#0071e3' }}>
                  {a.adapter_type}
                </span>
              </div>
              <div style={{ fontSize: '12px', color: '#86868b', marginBottom: '12px' }}>
                角色: <strong>{a.role}</strong> | 认证: {a.verification_status}
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', borderTop: '1px solid #e5e5ea', paddingTop: '8px' }}>
                <span>调用: <strong>{m?.total_calls || 0}</strong></span>
                <span>成功率: <strong style={{ color: rate >= 80 ? '#34c759' : '#ff3b30' }}>{rate}%</strong></span>
                <span>Token: <strong>{m?.total_tokens || 0}</strong></span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

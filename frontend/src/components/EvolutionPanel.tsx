import React, { useState, useEffect } from 'react';
import { EvolutionProposal } from '../types.ts';

const API_BASE = 'http://127.0.0.1:8000';

interface SweeperStatus {
  enabled: boolean;
  is_running: boolean;
  interval_seconds: number;
  total_sweeps: number;
  last_sweep_at: string | null;
}

export const EvolutionPanel: React.FC = () => {
  const [proposals, setProposals] = useState<EvolutionProposal[]>([]);
  const [sweeperStatus, setSweeperStatus] = useState<SweeperStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const fetchProposals = async () => {
    try {
      const res = await fetch(`${API_BASE}/evolution/proposals`);
      if (res.ok) {
        setProposals(await res.json());
      }
    } catch (e) {
      console.error(e);
    }
  };

  const fetchSweeperStatus = async () => {
    try {
      const res = await fetch(`${API_BASE}/evolution/sweeper/status`);
      if (res.ok) {
        setSweeperStatus(await res.json());
      }
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    fetchProposals();
    fetchSweeperStatus();
  }, []);

  const handleTriggerSweep = async () => {
    setLoading(true);
    setMsg('正在触发自主演进巡检与沙箱全流程验证...');
    try {
      const res = await fetch(`${API_BASE}/evolution/sweeper/trigger`, { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        setMsg(`巡检 #${data.sweep_id} 完成（耗时 ${data.duration_seconds}s）！发现新提案: ${data.new_proposals_found}，沙箱通过待审批: ${data.verified_pending_approval}`);
        fetchProposals();
        fetchSweeperStatus();
      }
    } catch (e: any) {
      setMsg(`巡检触发异常: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleRunDiagnosis = async () => {
    setLoading(true);
    setMsg('正在基于历史遥测指标与失败 RCA 执行全量自演进分析...');
    try {
      const res = await fetch(`${API_BASE}/evolution/analyze`, { method: 'POST' });
      if (res.ok) {
        const found = await res.json();
        setMsg(`诊断完成，发现 ${found.length} 个优化提案！已通过沙箱预演。`);
        fetchProposals();
      }
    } catch (e: any) {
      setMsg(`分析失败: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (id: string) => {
    const token = prompt('请输入批准口令 (NEXUS_APPROVAL_TOKEN):', 'nexus-dev-approval-token') || 'nexus-dev-approval-token';
    try {
      const res = await fetch(`${API_BASE}/evolution/proposals/${id}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ approval_token: token, comment: 'Web UI User Approval' })
      });
      if (res.ok) {
        alert('提案已批准并原子生效！');
        fetchProposals();
      } else {
        const err = await res.json();
        alert(`批准失败: ${err.detail || '未知原因'}`);
      }
    } catch (e: any) {
      alert(`网络异常: ${e.message}`);
    }
  };

  const handleRollback = async (id: string) => {
    if (!confirm('确认回滚此生效提案并恢复到之前快照吗？')) return;
    try {
      const res = await fetch(`${API_BASE}/evolution/proposals/${id}/rollback`, { method: 'POST' });
      if (res.ok) {
        alert('提案已安全回滚！');
        fetchProposals();
      } else {
        const err = await res.json();
        alert(`回滚失败: ${err.detail || '未知原因'}`);
      }
    } catch (e: any) {
      alert(`网络异常: ${e.message}`);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Autonomous Sweeper Live Card */}
      <div style={{
        background: '#ffffff',
        borderRadius: '18px',
        padding: '20px 24px',
        border: '1px solid rgba(0,0,0,0.06)',
        boxShadow: '0 8px 24px rgba(0,0,0,0.03)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '16px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div style={{
            width: '42px', height: '42px', borderRadius: '12px',
            background: sweeperStatus?.is_running ? '#e6f7ed' : '#fff4e5',
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px'
          }}>
            🤖
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <h3 style={{ fontSize: '16px', fontWeight: '600', margin: 0, color: '#1d1d1f' }}>
                自主演进守护巡检器 (Autonomous Sweeper)
              </h3>
              <span style={{
                fontSize: '11px', padding: '2px 8px', borderRadius: '10px',
                background: sweeperStatus?.is_running ? '#e6f7ed' : '#f2f2f7',
                color: sweeperStatus?.is_running ? '#1b803a' : '#8e8e93',
                fontWeight: '600', display: 'flex', alignItems: 'center', gap: '4px'
              }}>
                <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: sweeperStatus?.is_running ? '#34c759' : '#8e8e93' }} />
                {sweeperStatus?.is_running ? '常驻运行中' : '未就绪'}
              </span>
            </div>
            <div style={{ fontSize: '12px', color: '#86868b', marginTop: '4px' }}>
              巡检周期: <strong>{sweeperStatus?.interval_seconds || 300}s</strong> | 
              累计巡检: <strong>{sweeperStatus?.total_sweeps || 0} 次</strong> | 
              最近执行: <strong>{sweeperStatus?.last_sweep_at ? sweeperStatus.last_sweep_at.slice(11, 19) : '等待首次触发'}</strong>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '10px' }}>
          <button
            onClick={handleTriggerSweep}
            disabled={loading}
            style={{
              padding: '9px 18px',
              borderRadius: '10px',
              border: 'none',
              background: '#0071e3',
              color: '#fff',
              fontSize: '13px',
              fontWeight: '600',
              cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.7 : 1,
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            ⚡ 立即触发自主巡检
          </button>
          <button
            onClick={handleRunDiagnosis}
            disabled={loading}
            style={{
              padding: '9px 18px',
              borderRadius: '10px',
              border: '1px solid #d2d2d7',
              background: '#fff',
              color: '#1d1d1f',
              fontSize: '13px',
              fontWeight: '600',
              cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.7 : 1
            }}
          >
            🔍 手动深度诊断
          </button>
        </div>
      </div>

      {msg && (
        <div style={{ padding: '12px 16px', background: '#e8f2ff', color: '#0071e3', borderRadius: '12px', fontSize: '13px' }}>
          {msg}
        </div>
      )}

      {/* Proposals List Card */}
      <div style={{ background: '#ffffff', borderRadius: '18px', padding: '24px', border: '1px solid rgba(0,0,0,0.06)', boxShadow: '0 8px 24px rgba(0,0,0,0.03)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <div>
            <h2 style={{ fontSize: '18px', fontWeight: '600', color: '#1d1d1f', margin: 0 }}>🧬 受控自演进提案库</h2>
            <p style={{ fontSize: '13px', color: '#86868b', margin: '4px 0 0' }}>高风险变更强制沙箱预演、多级安全防线与人工双因子审批门禁</p>
          </div>
          <button
            onClick={fetchProposals}
            style={{ padding: '6px 14px', borderRadius: '8px', border: '1px solid #d2d2d7', background: '#fff', fontSize: '12px', cursor: 'pointer' }}
          >
            🔄 刷新列表
          </button>
        </div>

        {proposals.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px', color: '#8e8e93', fontSize: '13px' }}>
            暂无演进提案，系统处于稳态运行。点击上方“立即触发自主巡检”可实时诊断。
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {proposals.map(p => (
              <div key={p.id} style={{ border: '1px solid #e5e5ea', borderRadius: '12px', padding: '18px', background: '#fafafc' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10px' }}>
                  <div>
                    <span style={{ fontSize: '11px', fontWeight: '600', padding: '3px 8px', borderRadius: '6px', background: '#e8f2ff', color: '#0071e3', marginRight: '8px' }}>
                      {p.proposal_type}
                    </span>
                    <strong style={{ fontSize: '15px', color: '#1d1d1f' }}>{p.title}</strong>
                    <span style={{ marginLeft: '10px', fontSize: '12px', color: '#86868b', fontFamily: 'monospace' }}>ID: {p.id}</span>
                  </div>
                  <div>
                    <span style={{
                      padding: '4px 10px', borderRadius: '12px', fontSize: '11px', fontWeight: '600',
                      background: p.status === 'applied' ? '#e3f9e5' : (p.status === 'pending_approval' || p.status === 'test_passed' ? '#fff4e5' : '#f2f2f7'),
                      color: p.status === 'applied' ? '#1a7f37' : (p.status === 'pending_approval' || p.status === 'test_passed' ? '#9a6700' : '#8e8e93')
                    }}>
                      {p.status}
                    </span>
                  </div>
                </div>

                <p style={{ fontSize: '13px', color: '#424245', lineHeight: '1.5', margin: '0 0 12px' }}>{p.description}</p>

                {/* Diff Preview */}
                <div style={{ background: '#1d1d1f', color: '#e5e5ea', padding: '12px', borderRadius: '8px', fontSize: '11px', fontFamily: 'monospace', overflowX: 'auto', marginBottom: '12px' }}>
                  {JSON.stringify(p.proposed_diff, null, 2)}
                </div>

                {/* Actions */}
                <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                  {(p.status === 'pending_approval' || p.status === 'test_passed') && (
                    <button
                      onClick={() => handleApprove(p.id)}
                      style={{ padding: '6px 16px', borderRadius: '8px', border: 'none', background: '#34c759', color: '#fff', fontSize: '12px', fontWeight: '600', cursor: 'pointer' }}
                    >
                      ✓ 批准并原子生效
                    </button>
                  )}
                  {p.status === 'applied' && (
                    <button
                      onClick={() => handleRollback(p.id)}
                      style={{ padding: '6px 16px', borderRadius: '8px', border: '1px solid #ff3b30', background: '#fff', color: '#ff3b30', fontSize: '12px', fontWeight: '600', cursor: 'pointer' }}
                    >
                      ↩️ 一键回滚
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default EvolutionPanel;

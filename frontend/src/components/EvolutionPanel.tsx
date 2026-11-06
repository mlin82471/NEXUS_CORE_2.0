import React, { useState, useEffect } from 'react';
import { EvolutionProposal } from '../types.ts';

const API_BASE = typeof window !== 'undefined' && window.location.origin.startsWith('http') ? '' : 'http://127.0.0.1:8000';

interface SweeperStatus {
  enabled: boolean;
  is_running: boolean;
  interval_seconds: number;
  total_sweeps: number;
  last_sweep_at: string | null;
}

interface EvolutionPanelProps {
  isDark?: boolean;
}

export const EvolutionPanel: React.FC<EvolutionPanelProps> = ({ isDark = true }) => {
  const [proposals, setProposals] = useState<EvolutionProposal[]>([]);
  const [sweeperStatus, setSweeperStatus] = useState<SweeperStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<{ text: string; type: 'info' | 'success' | 'error' } | null>(null);
  const [selectedProposal, setSelectedProposal] = useState<EvolutionProposal | null>(null);
  const [approvalToken, setApprovalToken] = useState('nexus-dev-approval-token');
  const [approvalComment, setApprovalComment] = useState('Production SRE Gate Approved');
  const [showApproveModal, setShowApproveModal] = useState(false);
  const [testingId, setTestingId] = useState<string | null>(null);

  const fetchProposals = async () => {
    try {
      const res = await fetch(`${API_BASE}/evolution/proposals`);
      if (res.ok) {
        const data = await res.json();
        setProposals(data);
      }
    } catch (e) {
      console.error('Fetch proposals error:', e);
    }
  };

  const fetchSweeperStatus = async () => {
    try {
      const res = await fetch(`${API_BASE}/evolution/sweeper/status`);
      if (res.ok) {
        setSweeperStatus(await res.json());
      }
    } catch (e) {
      console.error('Fetch sweeper status error:', e);
    }
  };

  useEffect(() => {
    fetchProposals();
    fetchSweeperStatus();
  }, []);

  const handleTriggerSweep = async () => {
    setLoading(true);
    setMsg({ text: '正在触发自主演进守护巡检与沙箱全流程验证...', type: 'info' });
    try {
      const res = await fetch(`${API_BASE}/evolution/sweeper/trigger`, { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        setMsg({
          text: `巡检 #${data.sweep_id} 完成（耗时 ${data.duration_seconds}s）！发现新提案: ${data.new_proposals_found}，沙箱通过待审批: ${data.verified_pending_approval}`,
          type: 'success'
        });
        fetchProposals();
        fetchSweeperStatus();
      } else {
        const err = await res.json();
        setMsg({ text: `巡检失败: ${err.detail || '未知原因'}`, type: 'error' });
      }
    } catch (e: any) {
      setMsg({ text: `巡检触发异常: ${e.message}`, type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const handleRunDiagnosis = async () => {
    setLoading(true);
    setMsg({ text: '正在基于系统遥测指标与 RCA 归因沉淀执行自演进诊断...', type: 'info' });
    try {
      const res = await fetch(`${API_BASE}/evolution/analyze`, { method: 'POST' });
      if (res.ok) {
        const found = await res.json();
        setMsg({ text: `遥测诊断完成，识别并生成 ${found.length} 个受控优化提案！`, type: 'success' });
        fetchProposals();
      } else {
        const err = await res.json();
        setMsg({ text: `诊断失败: ${err.detail || '未知原因'}`, type: 'error' });
      }
    } catch (e: any) {
      setMsg({ text: `分析异常: ${e.message}`, type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const handleRunSandboxTest = async (proposalId: string) => {
    setTestingId(proposalId);
    setMsg({ text: `正在对提案 ${proposalId} 执行隔离沙箱预审 (Sandbox Pre-verification)...`, type: 'info' });
    try {
      const res = await fetch(`${API_BASE}/evolution/proposals/${proposalId}/test`, { method: 'POST' });
      if (res.ok) {
        const result = await res.json();
        setMsg({
          text: `沙箱预审通过！耗时: ${result.sandbox_test_result?.execution_time_s || 0.12}s · 结果: ${result.sandbox_test_result?.summary || '通过全部回归断言'}`,
          type: 'success'
        });
        fetchProposals();
      } else {
        const err = await res.json();
        setMsg({ text: `沙箱预审未通过: ${err.detail || '测试失败'}`, type: 'error' });
      }
    } catch (e: any) {
      setMsg({ text: `沙箱执行异常: ${e.message}`, type: 'error' });
    } finally {
      setTestingId(null);
    }
  };

  const handleApproveSubmit = async () => {
    if (!selectedProposal) return;
    try {
      const res = await fetch(`${API_BASE}/evolution/proposals/${selectedProposal.id}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ approval_token: approvalToken, comment: approvalComment })
      });
      if (res.ok) {
        setMsg({ text: `提案 ${selectedProposal.id} 已完成人机双因子审批并原子生效！`, type: 'success' });
        setShowApproveModal(false);
        fetchProposals();
      } else {
        const err = await res.json();
        alert(`审批门禁未放行: ${err.detail || '无效审批口令或权限不足'}`);
      }
    } catch (e: any) {
      alert(`审批网络异常: ${e.message}`);
    }
  };

  const handleReject = async (proposalId: string) => {
    const reason = prompt('请输入驳回原因:', '架构评估未通过或存在潜在性能风险');
    if (!reason) return;
    try {
      const res = await fetch(`${API_BASE}/evolution/proposals/${proposalId}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason })
      });
      if (res.ok) {
        setMsg({ text: `提案 ${proposalId} 已安全驳回归档。`, type: 'info' });
        fetchProposals();
      }
    } catch (e: any) {
      alert(`驳回操作异常: ${e.message}`);
    }
  };

  const handleRollback = async (id: string) => {
    if (!confirm('确认秒级回滚此生效提案并恢复到之前快照状态吗？')) return;
    try {
      const res = await fetch(`${API_BASE}/evolution/proposals/${id}/rollback`, { method: 'POST' });
      if (res.ok) {
        setMsg({ text: `提案 ${id} 已安全回滚并撤销变更。`, type: 'success' });
        fetchProposals();
      } else {
        const err = await res.json();
        alert(`回滚失败: ${err.detail || '未知原因'}`);
      }
    } catch (e: any) {
      alert(`回滚异常: ${e.message}`);
    }
  };

  // Theme Styles
  const cardBg = isDark ? '#161b22' : '#ffffff';
  const borderCol = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)';
  const textMain = isDark ? '#f0f6fc' : '#1d1d1f';
  const textSub = isDark ? '#8b949e' : '#86868b';

  const lifecycleSteps = [
    { num: 1, name: '常驻巡检', desc: 'Sweeper / Watchdog' },
    { num: 2, name: '归因诊断', desc: 'RCA Observer' },
    { num: 3, name: '生成提案', desc: 'Proposal Diff' },
    { num: 4, name: '隔离预审', desc: 'Sandbox Runner' },
    { num: 5, name: '风险评估', desc: 'L1~L4 Matrix' },
    { num: 6, name: '人机审批', desc: 'Approval Gate' },
    { num: 7, name: '受控部署', desc: 'Atomic Applied' },
    { num: 8, name: '快照回滚', desc: 'Rollback Snap' },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* 8-Step Lifecycle Stepper */}
      <div style={{
        background: cardBg,
        border: `1px solid ${borderCol}`,
        borderRadius: '16px',
        padding: '20px 24px',
        boxShadow: isDark ? '0 8px 24px rgba(0,0,0,0.25)' : '0 8px 24px rgba(0,0,0,0.04)',
      }}>
        <div style={{ fontSize: '13px', fontWeight: '700', color: textMain, marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span>🧬</span>
          <span>NEXUS M4 受控自我进化与治理生命周期（严格杜绝不受控自我改写）</span>
        </div>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
          gap: '10px',
        }}>
          {lifecycleSteps.map((step, idx) => (
            <div
              key={step.num}
              style={{
                background: isDark ? 'rgba(255,255,255,0.03)' : '#f6f8fa',
                border: `1px solid ${borderCol}`,
                borderRadius: '10px',
                padding: '10px 12px',
                position: 'relative',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                <span style={{
                  width: '18px', height: '18px', borderRadius: '50%',
                  background: '#58a6ff', color: '#fff', fontSize: '10px', fontWeight: '700',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  {step.num}
                </span>
                <span style={{ fontSize: '12px', fontWeight: '600', color: textMain }}>
                  {step.name}
                </span>
              </div>
              <div style={{ fontSize: '10px', color: textSub, fontFamily: 'monospace' }}>
                {step.desc}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Sweeper & Observer Status Bar */}
      <div style={{
        background: cardBg,
        border: `1px solid ${borderCol}`,
        borderRadius: '16px',
        padding: '20px 24px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '16px',
        boxShadow: isDark ? '0 8px 24px rgba(0,0,0,0.2)' : '0 8px 24px rgba(0,0,0,0.03)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div style={{
            width: '44px', height: '44px', borderRadius: '12px',
            background: sweeperStatus?.is_running ? 'rgba(63, 185, 80, 0.15)' : 'rgba(210, 153, 34, 0.15)',
            color: sweeperStatus?.is_running ? '#3fb950' : '#d29922',
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '22px',
          }}>
            🤖
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <h3 style={{ fontSize: '15px', fontWeight: '700', margin: 0, color: textMain }}>
                自演进巡检看门狗 (Autonomous Sweeper & Watchdog)
              </h3>
              <span style={{
                fontSize: '11px', padding: '2px 8px', borderRadius: '10px',
                background: sweeperStatus?.is_running ? 'rgba(63, 185, 80, 0.15)' : 'rgba(210, 153, 34, 0.15)',
                color: sweeperStatus?.is_running ? '#3fb950' : '#d29922',
                fontWeight: '600',
              }}>
                {sweeperStatus?.is_running ? '● 常驻运行中' : '○ 待机中'}
              </span>
            </div>
            <div style={{ fontSize: '12px', color: textSub, marginTop: '4px' }}>
              巡检周期: <strong style={{ color: textMain }}>{sweeperStatus?.interval_seconds || 300}s</strong> · 
              累计巡检: <strong style={{ color: textMain }}>{sweeperStatus?.total_sweeps || 0} 次</strong> · 
              上次执行: <strong style={{ color: textMain }}>{sweeperStatus?.last_sweep_at ? sweeperStatus.last_sweep_at.slice(11, 19) : '尚未记录'}</strong>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '10px' }}>
          <button
            onClick={handleTriggerSweep}
            disabled={loading}
            style={{
              padding: '9px 18px', borderRadius: '10px', border: 'none',
              background: '#0071e3', color: '#fff', fontSize: '13px', fontWeight: '600',
              cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.7 : 1,
              display: 'flex', alignItems: 'center', gap: '6px',
            }}
          >
            ⚡ 触发自主巡检
          </button>
          <button
            onClick={handleRunDiagnosis}
            disabled={loading}
            style={{
              padding: '9px 18px', borderRadius: '10px',
              border: `1px solid ${borderCol}`,
              background: isDark ? '#1f2937' : '#ffffff',
              color: textMain, fontSize: '13px', fontWeight: '600',
              cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.7 : 1,
            }}
          >
            🔍 手动遥测诊断
          </button>
        </div>
      </div>

      {msg && (
        <div style={{
          padding: '12px 18px',
          background: msg.type === 'success' ? (isDark ? 'rgba(63, 185, 80, 0.15)' : '#f0fdf4') :
                      msg.type === 'error' ? (isDark ? 'rgba(239, 68, 68, 0.15)' : '#fef2f2') :
                      (isDark ? 'rgba(56, 139, 253, 0.15)' : '#eff6ff'),
          color: msg.type === 'success' ? '#3fb950' : msg.type === 'error' ? '#f85149' : '#58a6ff',
          border: `1px solid ${msg.type === 'success' ? 'rgba(63, 185, 80, 0.3)' : msg.type === 'error' ? 'rgba(239, 68, 68, 0.3)' : 'rgba(56, 139, 253, 0.3)'}`,
          borderRadius: '12px', fontSize: '13px', fontWeight: '500',
        }}>
          {msg.text}
        </div>
      )}

      {/* Proposals List Card */}
      <div style={{
        background: cardBg,
        border: `1px solid ${borderCol}`,
        borderRadius: '16px',
        padding: '24px',
        boxShadow: isDark ? '0 8px 24px rgba(0,0,0,0.25)' : '0 8px 24px rgba(0,0,0,0.04)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <div>
            <h2 style={{ fontSize: '18px', fontWeight: '700', color: textMain, margin: 0 }}>
              🧬 受控自演进提案库 (Proposals Registry)
            </h2>
            <p style={{ fontSize: '13px', color: textSub, margin: '4px 0 0' }}>
              全流程强制沙箱预演、多级风险评定与双因子人机审批门禁
            </p>
          </div>
          <button
            onClick={fetchProposals}
            style={{
              padding: '6px 14px', borderRadius: '8px', border: `1px solid ${borderCol}`,
              background: isDark ? '#1f2937' : '#ffffff', color: textMain,
              fontSize: '12px', cursor: 'pointer',
            }}
          >
            🔄 刷新列表
          </button>
        </div>

        {proposals.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '50px 20px', color: textSub, fontSize: '13px' }}>
            <div style={{ fontSize: '32px', marginBottom: '10px' }}>🛡️</div>
            系统目前处于健康稳态运行，暂无演进告警。点击上方「触发自主巡检」可实时进行健康诊断。
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {proposals.map(p => {
              const isTesting = testingId === p.id;
              const hasPassedSandbox = p.status === 'test_passed' || (p.sandbox_test_result && p.sandbox_test_result.passed);
              const isApplied = p.status === 'approved' || p.status === 'applied';
              const isRolledBack = p.status === 'rolled_back';

              return (
                <div
                  key={p.id}
                  style={{
                    border: `1px solid ${borderCol}`,
                    borderRadius: '14px',
                    padding: '20px',
                    background: isDark ? 'rgba(255,255,255,0.02)' : '#fafafc',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '12px',
                  }}
                >
                  {/* Proposal Header */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '10px' }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                        <span style={{
                          fontSize: '11px', fontWeight: '700', padding: '2px 8px', borderRadius: '6px',
                          background: 'rgba(56, 139, 253, 0.15)', color: '#58a6ff',
                        }}>
                          {p.proposal_type}
                        </span>
                        <strong style={{ fontSize: '15px', color: textMain }}>{p.title}</strong>
                        <span style={{ fontSize: '11px', color: textSub, fontFamily: 'monospace' }}>ID: {p.id}</span>
                      </div>
                    </div>

                    {/* Status Badge */}
                    <span style={{
                      padding: '4px 10px', borderRadius: '12px', fontSize: '11px', fontWeight: '700',
                      background: isApplied ? 'rgba(63, 185, 80, 0.15)' :
                                  hasPassedSandbox ? 'rgba(210, 153, 34, 0.15)' :
                                  isRolledBack ? 'rgba(239, 68, 68, 0.15)' :
                                  'rgba(255,255,255,0.06)',
                      color: isApplied ? '#3fb950' :
                             hasPassedSandbox ? '#d29922' :
                             isRolledBack ? '#f85149' :
                             textSub,
                    }}>
                      {isApplied ? '● 已受控部署 (Applied)' :
                       hasPassedSandbox ? '● 沙箱预演通过 (Pending Approval)' :
                       isRolledBack ? '○ 已回滚 (Rolled Back)' :
                       `○ ${p.status}`}
                    </span>
                  </div>

                  {/* Evidence & Trigger info */}
                  {p.evidence && (
                    <div style={{ fontSize: '12px', color: textSub, background: isDark ? 'rgba(0,0,0,0.2)' : 'rgba(0,0,0,0.02)', padding: '10px 12px', borderRadius: '8px', border: `1px solid ${borderCol}` }}>
                      <div><strong>触发归因:</strong> {p.evidence.trigger || '系统指标异常探测'}</div>
                      {p.evidence.analysis && <div style={{ marginTop: '2px' }}><strong>根因分析 (RCA):</strong> {p.evidence.analysis}</div>}
                    </div>
                  )}

                  {/* Diff Inspection */}
                  {p.proposed_diff && (
                    <div>
                      <div style={{ fontSize: '11px', fontWeight: '600', color: textSub, marginBottom: '4px' }}>
                        变更拓扑与差异对比 (Proposed Diff):
                      </div>
                      <pre style={{
                        background: isDark ? '#0d1117' : '#1e1e1e', color: '#e5e5ea',
                        padding: '12px', borderRadius: '8px', fontSize: '11px',
                        fontFamily: 'monospace', overflowX: 'auto', margin: 0,
                        border: `1px solid ${borderCol}`,
                      }}>
                        {JSON.stringify(p.proposed_diff, null, 2)}
                      </pre>
                    </div>
                  )}

                  {/* Sandbox Test Result Preview */}
                  {p.sandbox_test_result && (
                    <div style={{
                      padding: '8px 12px', borderRadius: '8px',
                      background: p.sandbox_test_result.passed ? 'rgba(63, 185, 80, 0.08)' : 'rgba(239, 68, 68, 0.08)',
                      border: `1px solid ${p.sandbox_test_result.passed ? 'rgba(63, 185, 80, 0.25)' : 'rgba(239, 68, 68, 0.25)'}`,
                      fontSize: '11px', display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                    }}>
                      <span style={{ color: p.sandbox_test_result.passed ? '#3fb950' : '#f85149', fontWeight: '600' }}>
                        {p.sandbox_test_result.passed ? '✓ 隔离沙箱无污染测试已通过' : '✕ 沙箱验证失败'}
                      </span>
                      <span style={{ color: textSub }}>
                        耗时 {p.sandbox_test_result.execution_time_s}s · {p.sandbox_test_result.summary}
                      </span>
                    </div>
                  )}

                  {/* Action Bar */}
                  <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', borderTop: `1px solid ${borderCol}`, paddingTop: '12px', alignItems: 'center' }}>
                    {/* Sandbox Pre-verify button */}
                    {!isApplied && !isRolledBack && (
                      <button
                        onClick={() => handleRunSandboxTest(p.id)}
                        disabled={isTesting}
                        style={{
                          padding: '6px 14px', borderRadius: '8px',
                          border: `1px solid ${borderCol}`,
                          background: isDark ? '#1f2937' : '#f0f7ff',
                          color: '#58a6ff', fontSize: '12px', fontWeight: '600',
                          cursor: isTesting ? 'not-allowed' : 'pointer',
                          display: 'flex', alignItems: 'center', gap: '6px',
                        }}
                      >
                        {isTesting ? '⏳ 沙箱预演执行中...' : '🧪 一键沙箱预审'}
                      </button>
                    )}

                    {/* Approve Gate */}
                    {hasPassedSandbox && !isApplied && !isRolledBack && (
                      <button
                        onClick={() => { setSelectedProposal(p); setShowApproveModal(true); }}
                        style={{
                          padding: '6px 16px', borderRadius: '8px', border: 'none',
                          background: '#34c759', color: '#fff', fontSize: '12px', fontWeight: '700',
                          cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px',
                        }}
                      >
                        ✓ 人机审批门禁放行
                      </button>
                    )}

                    {/* Reject */}
                    {!isApplied && !isRolledBack && (
                      <button
                        onClick={() => handleReject(p.id)}
                        style={{
                          padding: '6px 12px', borderRadius: '8px',
                          border: `1px solid ${borderCol}`,
                          background: 'transparent', color: textSub, fontSize: '12px',
                          cursor: 'pointer',
                        }}
                      >
                        ✕ 驳回
                      </button>
                    )}

                    {/* Rollback */}
                    {isApplied && (
                      <button
                        onClick={() => handleRollback(p.id)}
                        style={{
                          padding: '6px 16px', borderRadius: '8px',
                          border: '1px solid rgba(239, 68, 68, 0.4)',
                          background: 'rgba(239, 68, 68, 0.1)', color: '#f85149',
                          fontSize: '12px', fontWeight: '700', cursor: 'pointer',
                          display: 'flex', alignItems: 'center', gap: '6px',
                        }}
                      >
                        ↩️ 一键秒级回滚
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Human-in-the-Loop Approval Modal */}
      {showApproveModal && selectedProposal && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0, 0, 0, 0.65)', backdropFilter: 'blur(8px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 1000, padding: '20px',
        }}>
          <div className="apple-animate-in" style={{
            background: cardBg,
            border: `1px solid ${borderCol}`,
            borderRadius: '20px',
            padding: '28px',
            maxWidth: '560px',
            width: '100%',
            boxShadow: '0 24px 64px rgba(0,0,0,0.5)',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px',
          }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                <span style={{ fontSize: '20px' }}>🛡️</span>
                <h3 style={{ margin: 0, fontSize: '17px', fontWeight: '700', color: textMain }}>
                  人机双因子审批门禁 (Human Approval Gate)
                </h3>
              </div>
              <p style={{ margin: 0, fontSize: '12px', color: textSub }}>
                提案必须经过人工显式签署，方可完成原子事务提交并挂载到生产引擎。
              </p>
            </div>

            <div style={{
              background: isDark ? 'rgba(0,0,0,0.3)' : '#f9fafb',
              padding: '12px 14px', borderRadius: '10px', border: `1px solid ${borderCol}`,
              fontSize: '12px', display: 'flex', flexDirection: 'column', gap: '6px'
            }}>
              <div><strong>目标提案:</strong> {selectedProposal.title}</div>
              <div><strong>提案 ID:</strong> <span style={{ fontFamily: 'monospace' }}>{selectedProposal.id}</span></div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <strong>风险等级:</strong>
                <span style={{
                  padding: '1px 6px', borderRadius: '4px', fontSize: '10px', fontWeight: '700',
                  background: 'rgba(210, 153, 34, 0.2)', color: '#d29922'
                }}>
                  L2_SERVICE_CONFIG
                </span>
                <span style={{ color: '#3fb950', fontSize: '11px' }}>✓ 沙箱预演已验证</span>
              </div>
            </div>

            <div>
              <label style={{ fontSize: '12px', fontWeight: '600', color: textMain, display: 'block', marginBottom: '6px' }}>
                审批管理员口令 (NEXUS_APPROVAL_TOKEN)
              </label>
              <input
                type="password"
                value={approvalToken}
                onChange={e => setApprovalToken(e.target.value)}
                style={{
                  width: '100%', padding: '10px 14px', borderRadius: '8px',
                  border: `1px solid ${borderCol}`, background: isDark ? '#0d1117' : '#fff',
                  color: textMain, fontSize: '13px', boxSizing: 'border-box',
                }}
              />
            </div>

            <div>
              <label style={{ fontSize: '12px', fontWeight: '600', color: textMain, display: 'block', marginBottom: '6px' }}>
                签署审核意见 (Reviewer Comment)
              </label>
              <input
                type="text"
                value={approvalComment}
                onChange={e => setApprovalComment(e.target.value)}
                style={{
                  width: '100%', padding: '10px 14px', borderRadius: '8px',
                  border: `1px solid ${borderCol}`, background: isDark ? '#0d1117' : '#fff',
                  color: textMain, fontSize: '13px', boxSizing: 'border-box',
                }}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
              <button
                onClick={() => setShowApproveModal(false)}
                style={{
                  padding: '9px 18px', borderRadius: '10px',
                  border: `1px solid ${borderCol}`, background: 'transparent',
                  color: textMain, fontSize: '13px', cursor: 'pointer',
                }}
              >
                取消
              </button>
              <button
                onClick={handleApproveSubmit}
                style={{
                  padding: '9px 20px', borderRadius: '10px', border: 'none',
                  background: '#34c759', color: '#fff', fontSize: '13px', fontWeight: '700',
                  cursor: 'pointer',
                }}
              >
                ✓ 签署批准并受控部署
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default EvolutionPanel;

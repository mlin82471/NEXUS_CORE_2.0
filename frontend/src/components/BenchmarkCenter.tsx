import React, { useState, useEffect } from 'react';

const API_BASE = 'http://127.0.0.1:8000';

interface BenchmarkCenterProps {
  isDark?: boolean;
}

export const BenchmarkCenter: React.FC<BenchmarkCenterProps> = ({ isDark = true }) => {
  const [activeTab, setActiveTab] = useState<'arena' | 'ab_comparator'>('arena');

  // Arena State
  const [arenaGoal, setArenaGoal] = useState('编写一个 Python 函数，使用双指针高效反转字符串中的元音字母并写出测试用例');
  const [selectedModels, setSelectedModels] = useState<string[]>(['deepseek-chat', 'deepseek-reasoner', 'qwen-plus']);
  const [arenaLoading, setArenaLoading] = useState(false);
  const [arenaReport, setArenaReport] = useState<any | null>(null);
  const [arenaRankings, setArenaRankings] = useState<any[]>([]);

  // A/B Comparator State
  const [abGoal, setAbGoal] = useState('计算 2+2 的结果');
  const [abLoading, setAbLoading] = useState(false);
  const [abReport, setAbReport] = useState<any | null>(null);

  const fetchRankings = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/benchmark/arena/rankings`);
      if (res.ok) setArenaRankings(await res.json());
    } catch (err) {
      console.error(err);
    }
  };

  const fetchHistory = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/benchmark/arena/history?limit=1`);
      if (res.ok) {
        const list = await res.json();
        if (list && list.length > 0 && !arenaReport) {
          setArenaReport(list[0]);
        }
      }
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchRankings();
    fetchHistory();
  }, []);

  const handleToggleModel = (m: string) => {
    if (selectedModels.includes(m)) {
      if (selectedModels.length > 2) {
        setSelectedModels(selectedModels.filter(x => x !== m));
      } else {
        alert('至少保留 2 个模型进行竞技对比！');
      }
    } else {
      if (selectedModels.length < 5) {
        setSelectedModels([...selectedModels, m]);
      } else {
        alert('最多支持 5 个模型同台竞技');
      }
    }
  };

  const handleRunArena = async () => {
    if (!arenaGoal.trim()) return;
    setArenaLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/benchmark/arena`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          goal: arenaGoal.trim(),
          candidate_models: selectedModels,
          task_type: 'coding',
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setArenaReport(data);
        fetchRankings();
      }
    } catch (err: any) {
      alert(`测试异常: ${err.message}`);
    } finally {
      setArenaLoading(false);
    }
  };

  const handleRunAB = async () => {
    if (!abGoal.trim()) return;
    setAbLoading(true);
    try {
      const res = await fetch(`${API_BASE}/benchmark/compare`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ goal: abGoal.trim(), task_type: 'general' }),
      });
      if (res.ok) setAbReport(await res.json());
    } catch (err: any) {
      alert(`对照失败: ${err.message}`);
    } finally {
      setAbLoading(false);
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
            🔬 性能对比实验室 (Benchmark Arena Lab)
          </h2>
          <div style={{ fontSize: '13px', color: textSub }}>
            同任务多模型竞速大比武 · 速度/质量/成本多维打分 · 数据驱动智能模型路由
          </div>
        </div>

        {/* Tab switch */}
        <div style={{ display: 'flex', gap: '8px', background: isDark ? 'rgba(0,0,0,0.3)' : 'rgba(0,0,0,0.04)', padding: '4px', borderRadius: '10px' }}>
          <button
            onClick={() => setActiveTab('arena')}
            style={{
              padding: '6px 14px', borderRadius: '8px', border: 'none',
              background: activeTab === 'arena' ? '#58a6ff' : 'transparent',
              color: activeTab === 'arena' ? '#fff' : textSub,
              fontSize: '12px', fontWeight: '600', cursor: 'pointer',
            }}
          >
            ⚔️ 多模型竞速大比武
          </button>
          <button
            onClick={() => setActiveTab('ab_comparator')}
            style={{
              padding: '6px 14px', borderRadius: '8px', border: 'none',
              background: activeTab === 'ab_comparator' ? '#58a6ff' : 'transparent',
              color: activeTab === 'ab_comparator' ? '#fff' : textSub,
              fontSize: '12px', fontWeight: '600', cursor: 'pointer',
            }}
          >
            ⚖️ 单/多 Agent A/B 对照
          </button>
        </div>
      </div>

      {/* Tab 1: Multi-Model Arena */}
      {activeTab === 'arena' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Arena Input Block */}
          <div style={{ background: cardBg, border: `1px solid ${borderCol}`, borderRadius: '16px', padding: '20px' }}>
            <h3 style={{ margin: '0 0 10px 0', fontSize: '15px', fontWeight: '600', color: textMain }}>
              🎯 输入测试任务目标 (Arena Prompt)
            </h3>
            <textarea
              rows={2}
              value={arenaGoal}
              onChange={e => setArenaGoal(e.target.value)}
              style={{
                width: '100%', padding: '10px 14px', borderRadius: '10px',
                border: `1px solid ${borderCol}`, background: isDark ? '#0d1117' : '#fff',
                color: textMain, fontSize: '13px', marginBottom: '14px',
              }}
            />

            <div style={{ marginBottom: '16px' }}>
              <div style={{ fontSize: '12px', color: textSub, marginBottom: '8px' }}>
                选择同台竞技模型 (2~5 个):
              </div>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                {[
                  'deepseek-chat', 'deepseek-reasoner', 'qwen-plus', 'qwen-max',
                  'gpt-4o', 'claude-3-5-sonnet', 'gemini-2.0-flash'
                ].map(m => {
                  const isSel = selectedModels.includes(m);
                  return (
                    <button
                      key={m}
                      onClick={() => handleToggleModel(m)}
                      style={{
                        padding: '6px 12px', borderRadius: '8px',
                        border: `1px solid ${isSel ? '#58a6ff' : borderCol}`,
                        background: isSel ? 'rgba(56, 139, 253, 0.15)' : isDark ? '#0d1117' : '#f9fafb',
                        color: isSel ? '#58a6ff' : textSub,
                        fontSize: '12px', fontWeight: isSel ? '600' : '400', cursor: 'pointer',
                      }}
                    >
                      {isSel ? '✓ ' : '+ '}{m}
                    </button>
                  );
                })}
              </div>
            </div>

            <button
              disabled={arenaLoading}
              onClick={handleRunArena}
              style={{
                padding: '10px 24px', borderRadius: '10px', border: 'none',
                background: '#238636', color: '#fff', fontSize: '13px', fontWeight: '600',
                cursor: arenaLoading ? 'wait' : 'pointer', display: 'inline-flex', alignItems: 'center', gap: '8px',
              }}
            >
              {arenaLoading ? '⚡ 正在并发执行模型推理与独立评估...' : '⚡ 启动多模型竞技大比武'}
            </button>
          </div>

          {/* Arena Battle Cards & Winner Badges */}
          {arenaReport && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {/* Winner Header Strip */}
              <div style={{
                background: isDark ? 'linear-gradient(135deg, rgba(210, 153, 34, 0.15) 0%, rgba(56, 139, 253, 0.1) 100%)' : 'linear-gradient(135deg, #fffbeb 0%, #eff6ff 100%)',
                border: '1px solid rgba(210, 153, 34, 0.3)',
                borderRadius: '14px', padding: '16px 20px',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px',
              }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                    <span style={{ fontSize: '18px' }}>👑</span>
                    <strong style={{ fontSize: '14px', color: '#d29922' }}>
                      综合性价比桂冠：{arenaReport.winner_overall}
                    </strong>
                  </div>
                  <div style={{ fontSize: '12px', color: textSub }}>
                    {arenaReport.recommendation}
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '11px', padding: '4px 8px', borderRadius: '6px', background: 'rgba(63, 185, 80, 0.2)', color: '#3fb950', fontWeight: '600' }}>
                    💰 最省成本: {arenaReport.winner_cost}
                  </span>
                  <span style={{ fontSize: '11px', padding: '4px 8px', borderRadius: '6px', background: 'rgba(56, 139, 253, 0.2)', color: '#58a6ff', fontWeight: '600' }}>
                    ⚡ 响应最快: {arenaReport.winner_speed}
                  </span>
                  <span style={{ fontSize: '11px', padding: '4px 8px', borderRadius: '6px', background: 'rgba(188, 140, 255, 0.2)', color: '#bc8cff', fontWeight: '600' }}>
                    🎯 质量最高: {arenaReport.winner_quality}
                  </span>
                </div>
              </div>

              {/* Side-by-Side Model Battle Cards */}
              <div style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fit, minmax(280px, 1fr))`, gap: '16px' }}>
                {arenaReport.results.map((res: any) => {
                  const isOverallWinner = res.model_id === arenaReport.winner_overall;
                  return (
                    <div
                      key={res.model_id}
                      style={{
                        background: cardBg,
                        border: `1px solid ${isOverallWinner ? '#d29922' : borderCol}`,
                        borderRadius: '14px', padding: '18px',
                        display: 'flex', flexDirection: 'column', gap: '12px',
                        position: 'relative',
                        boxShadow: isOverallWinner ? '0 0 16px rgba(210, 153, 34, 0.15)' : 'none',
                      }}
                    >
                      {isOverallWinner && (
                        <span style={{
                          position: 'absolute', top: '-10px', right: '14px',
                          background: '#d29922', color: '#fff', fontSize: '10px', fontWeight: '700',
                          padding: '2px 8px', borderRadius: '10px',
                        }}>
                          ★ WINNER
                        </span>
                      )}

                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div>
                          <div style={{ fontSize: '14px', fontWeight: '700', color: textMain }}>{res.model_id}</div>
                          <div style={{ fontSize: '11px', color: textSub }}>{res.provider_id.toUpperCase()}</div>
                        </div>
                        <span style={{
                          fontSize: '11px', padding: '2px 6px', borderRadius: '6px',
                          background: res.verification_passed ? 'rgba(63, 185, 80, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                          color: res.verification_passed ? '#3fb950' : '#ef4444', fontWeight: '600',
                        }}>
                          {res.verification_passed ? '✓ 核验通过' : '✕ 核验失败'}
                        </span>
                      </div>

                      {/* Metrics 4-grid */}
                      <div style={{
                        display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px',
                        background: isDark ? 'rgba(0,0,0,0.2)' : 'rgba(0,0,0,0.02)',
                        padding: '10px', borderRadius: '8px', border: `1px solid ${borderCol}`,
                      }}>
                        <div>
                          <div style={{ fontSize: '10px', color: textSub }}>总 Token</div>
                          <div style={{ fontSize: '13px', fontWeight: '700', color: textMain }}>{res.total_tokens}</div>
                        </div>
                        <div>
                          <div style={{ fontSize: '10px', color: textSub }}>费用 (USD)</div>
                          <div style={{ fontSize: '13px', fontWeight: '700', color: '#3fb950' }}>${res.cost_usd.toFixed(5)}</div>
                        </div>
                        <div>
                          <div style={{ fontSize: '10px', color: textSub }}>响应时间</div>
                          <div style={{ fontSize: '13px', fontWeight: '700', color: textMain }}>{res.elapsed_seconds}s</div>
                        </div>
                        <div>
                          <div style={{ fontSize: '10px', color: textSub }}>性价比指数</div>
                          <div style={{ fontSize: '13px', fontWeight: '700', color: '#58a6ff' }}>{res.cost_performance_index.toFixed(0)}</div>
                        </div>
                      </div>

                      {/* Evaluator Quality Notes */}
                      <div style={{ fontSize: '11px', color: textSub, lineHeight: 1.4 }}>
                        <strong>核验结果:</strong> {res.evaluator_notes}
                      </div>

                      {/* Code Output Excerpt */}
                      <div style={{
                        background: isDark ? '#0d1117' : '#f6f8fa', border: `1px solid ${borderCol}`,
                        borderRadius: '6px', padding: '8px', fontSize: '11px', fontFamily: 'monospace',
                        maxHeight: '100px', overflowY: 'auto', color: textMain,
                      }}>
                        <pre style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{res.output_preview}</pre>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Historical Arena Aggregate Rankings */}
          <div style={{ background: cardBg, border: `1px solid ${borderCol}`, borderRadius: '16px', overflow: 'hidden' }}>
            <div style={{ padding: '16px 20px', borderBottom: `1px solid ${borderCol}` }}>
              <h3 style={{ margin: 0, fontSize: '15px', fontWeight: '600', color: textMain }}>
                📊 大模型真实数据胜率天梯 (Empirical Data-Driven Leaderboard)
              </h3>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'left' }}>
                <thead>
                  <tr style={{ background: isDark ? 'rgba(0,0,0,0.2)' : 'rgba(0,0,0,0.02)', color: textSub, borderBottom: `1px solid ${borderCol}` }}>
                    <th style={{ padding: '12px 18px' }}>模型 ID</th>
                    <th style={{ padding: '12px 14px' }}>对决场次</th>
                    <th style={{ padding: '12px 14px' }}>综合胜率</th>
                    <th style={{ padding: '12px 14px' }}>平均单次费用</th>
                    <th style={{ padding: '12px 14px' }}>平均延迟</th>
                    <th style={{ padding: '12px 18px', textAlign: 'right' }}>平均质量分</th>
                  </tr>
                </thead>
                <tbody>
                  {arenaRankings.map((r, i) => (
                    <tr key={r.model_id} style={{ borderBottom: `1px solid ${borderCol}` }}>
                      <td style={{ padding: '14px 18px', fontWeight: '600', color: textMain }}>{r.model_id}</td>
                      <td style={{ padding: '14px 14px', color: textSub }}>{r.matches} 场</td>
                      <td style={{ padding: '14px 14px' }}>
                        <span style={{ fontSize: '12px', padding: '2px 8px', borderRadius: '6px', background: 'rgba(56, 139, 253, 0.15)', color: '#58a6ff', fontWeight: '700' }}>
                          {r.win_rate_pct}%
                        </span>
                      </td>
                      <td style={{ padding: '14px 14px', color: '#3fb950' }}>${r.avg_cost_usd.toFixed(5)}</td>
                      <td style={{ padding: '14px 14px', color: textSub }}>{r.avg_latency_ms}ms</td>
                      <td style={{ padding: '14px 18px', textAlign: 'right', fontWeight: '600', color: textMain }}>
                        {(r.avg_quality_score * 100).toFixed(0)}分
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Tab 2: Single vs Multi-Agent A/B Comparator */}
      {activeTab === 'ab_comparator' && (
        <div style={{ background: cardBg, borderRadius: '16px', padding: '24px', border: `1px solid ${borderCol}` }}>
          <h3 style={{ fontSize: '16px', fontWeight: '600', color: textMain, marginBottom: '8px' }}>
            ⚖️ 单 Agent vs 多 Agent A/B 对照基准中心 (§7 收益验证)
          </h3>
          <p style={{ fontSize: '13px', color: textSub, marginBottom: '20px' }}>
            严格贯彻“不能为了多 Agent 而多 Agent”原则：同输入物理对照单 Agent 与多 Agent 协作，计算 Token 放大倍数与时间差异。
          </p>

          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: '500', color: textSub, marginBottom: '6px' }}>实验测试目标</label>
            <div style={{ display: 'flex', gap: '10px' }}>
              <input
                type="text"
                value={abGoal}
                onChange={e => setAbGoal(e.target.value)}
                placeholder="例如：计算 2+2 的结果 或 编写快速排序算法并测试"
                style={{ flex: 1, padding: '10px 14px', borderRadius: '10px', border: `1px solid ${borderCol}`, background: isDark ? '#0d1117' : '#fff', color: textMain, fontSize: '13px' }}
              />
              <button
                onClick={handleRunAB}
                disabled={abLoading}
                style={{
                  padding: '10px 20px', borderRadius: '10px', border: 'none',
                  background: '#58a6ff', color: '#fff', fontSize: '13px', fontWeight: '600', cursor: 'pointer'
                }}
              >
                {abLoading ? '🔬 正在并发对照运行...' : '🔬 启动双模式对照实验'}
              </button>
            </div>
          </div>

          {abReport && (
            <div style={{ marginTop: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                {/* Single Agent Card */}
                <div style={{ background: isDark ? '#0d1117' : '#f6f8fa', border: `1px solid ${borderCol}`, borderRadius: '12px', padding: '16px' }}>
                  <div style={{ fontSize: '14px', fontWeight: '600', color: textMain, marginBottom: '8px' }}>⚡ 单 Agent 直达模式</div>
                  <div style={{ fontSize: '12px', color: textSub }}>Token: {abReport.single_agent.total_tokens} | 耗时: {abReport.single_agent.elapsed_seconds.toFixed(2)}s</div>
                  <pre style={{ margin: '8px 0 0 0', fontSize: '11px', color: textMain, whiteSpace: 'pre-wrap' }}>{abReport.single_agent.result_excerpt}</pre>
                </div>

                {/* Multi Agent Card */}
                <div style={{ background: isDark ? '#0d1117' : '#f6f8fa', border: `1px solid ${borderCol}`, borderRadius: '12px', padding: '16px' }}>
                  <div style={{ fontSize: '14px', fontWeight: '600', color: textMain, marginBottom: '8px' }}>🤖 多 Agent 协同模式</div>
                  <div style={{ fontSize: '12px', color: textSub }}>Token: {abReport.multi_agent.total_tokens} | 耗时: {abReport.multi_agent.elapsed_seconds.toFixed(2)}s</div>
                  <pre style={{ margin: '8px 0 0 0', fontSize: '11px', color: textMain, whiteSpace: 'pre-wrap' }}>{abReport.multi_agent.result_excerpt}</pre>
                </div>
              </div>

              <div style={{ padding: '12px 16px', borderRadius: '10px', background: 'rgba(56, 139, 253, 0.1)', color: '#58a6ff', fontSize: '13px' }}>
                <strong>决策建议：</strong> {abReport.recommendation === 'use_single_agent' ? '推荐单 Agent 直达（节省 Token）' : '推荐多 Agent 协同（任务需分工）'} · {abReport.reason}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

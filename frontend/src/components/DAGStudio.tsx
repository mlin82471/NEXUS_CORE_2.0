import React, { useState, useEffect } from 'react';
import { PlanStep, TaskDetail } from '../types.ts';
import { DAGTopology } from './DAGTopology.tsx';

const API_BASE = 'http://127.0.0.1:8000';

// Built-in Demo Scenarios for Rich DAG Visualization
const DEMO_SCENARIOS: Record<string, { name: string; description: string; steps: PlanStep[] }> = {
  lru_cache: {
    name: '🚀 高并发分布式 LRU 缓存系统',
    description: '包含需求接口契约、核心双向链表+哈希表、高并发分段锁加固与独立 Evaluator 验证',
    steps: [
      {
        step_key: 's1_spec',
        step_order: 0,
        status: 'success',
        role: 'research',
        goal: '检索高并发 LRU 缓存设计规范，定义 HashLRU 泛型接口与并发淘汰指标',
        depends_on: [],
        attempts: 1,
        result: '已完成契约设计：支持 O(1) Get/Put，具备 Striped-Lock 分段锁与 TTL 自动失效机制。'
      },
      {
        step_key: 's2_core_engine',
        step_order: 1,
        status: 'success',
        role: 'coding',
        goal: '编写基于双向链表与哈希表的双亲节点 O(1) 核心存储与移位淘汰引擎',
        depends_on: ['s1_spec'],
        attempts: 1,
        result: '核心引擎已构建，通过 10,000 次容量溢出淘汰边界测试。'
      },
      {
        step_key: 's3_concurrency_guard',
        step_order: 2,
        status: 'success',
        role: 'coding',
        goal: '引入分段读写锁 (Striped RWLock) 与原子计数器，消除热点锁竞争',
        depends_on: ['s2_core_engine'],
        attempts: 1,
        result: '支持 32 分段锁，并发 100 线程压测下无死锁且命中率统计精准。'
      },
      {
        step_key: 's4_metrics_exporter',
        step_order: 3,
        status: 'success',
        role: 'analysis',
        goal: '埋点 Prometheus 格式指标 (HitRate, MissRate, EvictionCount, P99 Latency)',
        depends_on: ['s2_core_engine'],
        attempts: 1,
        result: '指标导出器构建完毕，暴露 /metrics 接口，延迟统计在 0.2ms 以内。'
      },
      {
        step_key: 's5_formal_verifier',
        step_order: 4,
        status: 'success',
        role: 'evaluator',
        goal: '独立 Evaluator 执行代码静态 AST 分析与高并发竞态条件模糊测试',
        depends_on: ['s3_concurrency_guard', 's4_metrics_exporter'],
        attempts: 1,
        result: 'Evaluator 独立核验：26 项单元测试与 5 项并发竞态测试 100% 通过，核验通过！'
      }
    ]
  },
  microservices: {
    name: '🌐 微服务金丝雀热发布与多阶段回退',
    description: '包含流量拓扑探测、金丝雀容器灰度分流、动态健康探针与自动化熔断回滚',
    steps: [
      {
        step_key: 'm1_schema_audit',
        step_order: 0,
        status: 'success',
        role: 'analysis',
        goal: '微服务契约与数据库 Schema 兼容性静态审计',
        depends_on: [],
        attempts: 1,
        result: 'Schema 向前兼容性校验通过，无阻断性列删除。'
      },
      {
        step_key: 'm2_canary_deploy',
        step_order: 1,
        status: 'success',
        role: 'coding',
        goal: '下发 10% 金丝雀流量路由与新版容器部署',
        depends_on: ['m1_schema_audit'],
        attempts: 1,
        result: 'Pod canary-v2 启动完成，注入流量占比 10%。'
      },
      {
        step_key: 'm3_telemetry_probe',
        step_order: 2,
        status: 'running',
        role: 'analysis',
        goal: '持续监控 P99 延迟与 5xx 错误率探针',
        depends_on: ['m2_canary_deploy'],
        attempts: 1,
        result: '实时探测中：错误率 0.01%，延迟稳定在 12ms。'
      },
      {
        step_key: 'm4_security_scan',
        step_order: 3,
        status: 'running',
        role: 'research',
        goal: '动态调用 SAST/DAST 安全漏扫探针排查权限越权',
        depends_on: ['m2_canary_deploy'],
        attempts: 1,
        result: '安全规则扫描进行中：未发现提权脆弱性。'
      },
      {
        step_key: 'm5_production_promote',
        step_order: 4,
        status: 'pending',
        role: 'evaluator',
        goal: 'Evaluator 校验健康门禁并全量放行 100% 生产流量',
        depends_on: ['m3_telemetry_probe', 'm4_security_scan'],
        attempts: 0,
        result: '等待前置探针与安全扫描通过...'
      }
    ]
  },
  financial_pipeline: {
    name: '💳 金融级 CAS 实时对账结算流水线',
    description: '多数据源增量账单抓取、CAS 状态原子核对、异常冲正与审计快照',
    steps: [
      {
        step_key: 'f1_ingest',
        step_order: 0,
        status: 'success',
        role: 'coding',
        goal: '批量解析上游支付网关结算单与本地流水账单',
        depends_on: [],
        attempts: 1,
        result: '已解析 500,000 笔流水，校验和匹配一致。'
      },
      {
        step_key: 'f2_cas_reconcile',
        step_order: 1,
        status: 'success',
        role: 'analysis',
        goal: '基于 CAS 乐观锁对比借贷借方金额与状态机终态',
        depends_on: ['f1_ingest'],
        attempts: 1,
        result: '对账完成，平账率 99.998%，检出 11 笔挂账差异单。'
      },
      {
        step_key: 'f3_dispute_handler',
        step_order: 2,
        status: 'success',
        role: 'coding',
        goal: '触发自动冲正补偿事务与差错退款工作流',
        depends_on: ['f2_cas_reconcile'],
        attempts: 1,
        result: '11 笔差异单自动发起冲正校验，其中 9 笔修复完成，2 笔转人工复核。'
      },
      {
        step_key: 'f4_audit_snapshot',
        step_order: 3,
        status: 'success',
        role: 'evaluator',
        goal: '生成 RFC 8785 签名对账不可篡改存证与审计快照',
        depends_on: ['f2_cas_reconcile', 'f3_dispute_handler'],
        attempts: 1,
        result: 'SHA-256 存证哈希生成并完成不可篡改归档。'
      }
    ]
  }
};

export const DAGStudio: React.FC = () => {
  const [selectedScenarioKey, setSelectedScenarioKey] = useState<string>('lru_cache');
  const [serverTasks, setServerTasks] = useState<Array<{ id: string; goal: string; status: string }>>([]);
  const [selectedTaskId, setSelectedTaskId] = useState<string>('');
  const [currentSteps, setCurrentSteps] = useState<PlanStep[]>(DEMO_SCENARIOS.lru_cache.steps);
  const [selectedStep, setSelectedStep] = useState<PlanStep | null>(DEMO_SCENARIOS.lru_cache.steps[0]);
  const [activeTab, setActiveTab] = useState<'scenario' | 'task'>('scenario');
  const [isLoading, setIsLoading] = useState<boolean>(false);

  // Load server tasks on mount
  useEffect(() => {
    fetch(`${API_BASE}/tasks`)
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data)) {
          setServerTasks(data);
        }
      })
      .catch(() => {});
  }, []);

  const handleSelectScenario = (key: string) => {
    setSelectedScenarioKey(key);
    setActiveTab('scenario');
    const sc = DEMO_SCENARIOS[key];
    if (sc) {
      setCurrentSteps(sc.steps);
      setSelectedStep(sc.steps[0] || null);
    }
  };

  const handleSelectTask = async (taskId: string) => {
    if (!taskId) return;
    setSelectedTaskId(taskId);
    setActiveTab('task');
    setIsLoading(true);
    try {
      const res = await fetch(`${API_BASE}/tasks/${taskId}`);
      if (res.ok) {
        const detail: TaskDetail = await res.json();
        setCurrentSteps(detail.steps || []);
        setSelectedStep((detail.steps && detail.steps[0]) || null);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  };

  // Find upstream and downstream nodes for the selected step
  const upstreamSteps = selectedStep
    ? currentSteps.filter(s => selectedStep.depends_on?.includes(s.step_key))
    : [];

  const downstreamSteps = selectedStep
    ? currentSteps.filter(s => s.depends_on?.includes(selectedStep.step_key))
    : [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Top Banner & Control Deck */}
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
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <h2 style={{ fontSize: '18px', fontWeight: '600', margin: 0, color: '#1d1d1f' }}>
              🕸️ 交互式 DAG 编排拓扑工作台
            </h2>
            <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '10px', background: '#e8f2ff', color: '#0071e3', fontWeight: '600' }}>
              React + SVG + Drag & Drop
            </span>
          </div>
          <p style={{ margin: '4px 0 0', fontSize: '12px', color: '#86868b' }}>
            基于 Kahn 拓扑排序算法、三次贝塞尔动态力导向曲线与 SVG 节点无级拖拽平移
          </p>
        </div>

        {/* Source Switcher */}
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          {/* Scenario Selector */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontSize: '12px', color: '#86868b', fontWeight: '500' }}>预设拓扑:</span>
            <select
              value={activeTab === 'scenario' ? selectedScenarioKey : ''}
              onChange={e => handleSelectScenario(e.target.value)}
              style={{
                padding: '6px 12px',
                borderRadius: '8px',
                border: '1px solid #d2d2d7',
                fontSize: '12px',
                background: '#fff',
                cursor: 'pointer',
              }}
            >
              {Object.entries(DEMO_SCENARIOS).map(([k, sc]) => (
                <option key={k} value={k}>{sc.name}</option>
              ))}
            </select>
          </div>

          {/* Server Real Tasks Selector */}
          {serverTasks.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ fontSize: '12px', color: '#86868b', fontWeight: '500' }}>真实任务:</span>
              <select
                value={activeTab === 'task' ? selectedTaskId : ''}
                onChange={e => handleSelectTask(e.target.value)}
                style={{
                  padding: '6px 12px',
                  borderRadius: '8px',
                  border: '1px solid #d2d2d7',
                  fontSize: '12px',
                  background: '#fff',
                  cursor: 'pointer',
                  maxWidth: '220px',
                }}
              >
                <option value="">-- 选择后端任务 --</option>
                {serverTasks.map(t => (
                  <option key={t.id} value={t.id}>
                    [{t.status}] {t.id.slice(0, 8)} - {t.goal.slice(0, 20)}...
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      </div>

      {/* Main DAG Workspace Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: '20px' }}>
        {/* Left Side: Interactive SVG DAG Canvas */}
        <div style={{
          background: '#ffffff',
          borderRadius: '18px',
          padding: '20px',
          border: '1px solid rgba(0,0,0,0.06)',
          boxShadow: '0 8px 24px rgba(0,0,0,0.03)',
          display: 'flex',
          flexDirection: 'column',
          gap: '14px',
        }}>
          {/* Canvas Header Info */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <span style={{ fontSize: '13px', fontWeight: '600', color: '#1d1d1f' }}>
                拓扑图视图
              </span>
              <span style={{ fontSize: '12px', color: '#86868b' }}>
                总步骤: <strong>{currentSteps.length}</strong> | 
                已完成: <strong style={{ color: '#34c759' }}>{currentSteps.filter(s => s.status === 'success').length}</strong> | 
                执行中: <strong style={{ color: '#0071e3' }}>{currentSteps.filter(s => s.status === 'running').length}</strong>
              </span>
            </div>

            <div style={{ fontSize: '11px', color: '#86868b' }}>
              🎯 点击任意节点查看详细属性与上下文输出
            </div>
          </div>

          {/* Interactive DAG Canvas */}
          <DAGTopology
            steps={currentSteps}
            selectedKey={selectedStep?.step_key}
            onSelectStep={setSelectedStep}
            height={520}
            interactive={true}
          />
        </div>

        {/* Right Side: Step Inspector Drawer */}
        <div style={{
          background: '#ffffff',
          borderRadius: '18px',
          padding: '20px',
          border: '1px solid rgba(0,0,0,0.06)',
          boxShadow: '0 8px 24px rgba(0,0,0,0.03)',
          display: 'flex',
          flexDirection: 'column',
          height: '590px',
          overflowY: 'auto',
        }}>
          <h3 style={{ fontSize: '15px', fontWeight: '600', marginBottom: '14px', color: '#1d1d1f', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span>🔍 步骤属性检查器</span>
          </h3>

          {selectedStep ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', fontSize: '12px' }}>
              {/* Step Identification */}
              <div style={{ background: '#f5f5f7', padding: '12px', borderRadius: '10px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                  <strong style={{ fontSize: '14px', color: '#0071e3' }}>{selectedStep.step_key}</strong>
                  <span style={{
                    padding: '2px 8px',
                    borderRadius: '6px',
                    fontSize: '11px',
                    fontWeight: '600',
                    background: selectedStep.status === 'success' ? '#e6f7ed' : '#fff4e5',
                    color: selectedStep.status === 'success' ? '#1b803a' : '#c46900',
                  }}>
                    {selectedStep.status.toUpperCase()}
                  </span>
                </div>
                <div style={{ color: '#86868b' }}>
                  角色: <strong>{selectedStep.role}</strong> · 顺序: <strong>#{selectedStep.step_order}</strong> · 尝试: <strong>{selectedStep.attempts} 次</strong>
                </div>
              </div>

              {/* Step Goal */}
              <div>
                <label style={{ fontWeight: '600', color: '#1d1d1f', display: 'block', marginBottom: '4px' }}>步骤目标</label>
                <div style={{ color: '#424245', background: '#fafafc', border: '1px solid #e5e5ea', padding: '10px', borderRadius: '8px', lineHeight: '1.5' }}>
                  {selectedStep.goal}
                </div>
              </div>

              {/* Upstream Prerequisites */}
              <div>
                <label style={{ fontWeight: '600', color: '#1d1d1f', display: 'block', marginBottom: '4px' }}>前置依赖 (Depends On)</label>
                {upstreamSteps.length > 0 ? (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                    {upstreamSteps.map(u => (
                      <button
                        key={u.step_key}
                        onClick={() => setSelectedStep(u)}
                        style={{
                          padding: '4px 8px',
                          borderRadius: '6px',
                          border: '1px solid #d2d2d7',
                          background: '#fff',
                          cursor: 'pointer',
                          fontSize: '11px',
                          color: '#0071e3',
                          fontWeight: '500',
                        }}
                      >
                        ⬅️ {u.step_key} ({u.role})
                      </button>
                    ))}
                  </div>
                ) : (
                  <span style={{ color: '#86868b', fontStyle: 'italic' }}>无依赖 (初始根节点)</span>
                )}
              </div>

              {/* Downstream Successors */}
              <div>
                <label style={{ fontWeight: '600', color: '#1d1d1f', display: 'block', marginBottom: '4px' }}>后继步骤 (Downstream)</label>
                {downstreamSteps.length > 0 ? (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                    {downstreamSteps.map(d => (
                      <button
                        key={d.step_key}
                        onClick={() => setSelectedStep(d)}
                        style={{
                          padding: '4px 8px',
                          borderRadius: '6px',
                          border: '1px solid #d2d2d7',
                          background: '#fff',
                          cursor: 'pointer',
                          fontSize: '11px',
                          color: '#0071e3',
                          fontWeight: '500',
                        }}
                      >
                        ➡️ {d.step_key} ({d.role})
                      </button>
                    ))}
                  </div>
                ) : (
                  <span style={{ color: '#86868b', fontStyle: 'italic' }}>无后继 (叶子终态节点)</span>
                )}
              </div>

              {/* Execution Output Result */}
              <div>
                <label style={{ fontWeight: '600', color: '#1d1d1f', display: 'block', marginBottom: '4px' }}>执行输出 / 验证结果</label>
                <div style={{
                  maxHeight: '180px',
                  overflowY: 'auto',
                  background: '#1d1d1f',
                  color: '#e5e5ea',
                  padding: '10px',
                  borderRadius: '8px',
                  fontSize: '11px',
                  fontFamily: 'SF Mono, Menlo, monospace',
                  whiteSpace: 'pre-wrap',
                  lineHeight: '1.4',
                }}>
                  {selectedStep.result || (selectedStep.error ? `错误: ${selectedStep.error}` : '暂无输出')}
                </div>
              </div>
            </div>
          ) : (
            <div style={{ margin: 'auto', textAlign: 'center', color: '#8e8e93', fontSize: '13px' }}>
              请在左侧点击任意节点查看属性
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default DAGStudio;

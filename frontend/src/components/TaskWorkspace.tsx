import React, { useState } from 'react';
import { TaskDetail, PlanStep } from '../types.ts';
import { DAGTopology } from './DAGTopology.tsx';

const API_BASE = typeof window !== 'undefined' && window.location.origin.startsWith('http') ? '' : 'http://127.0.0.1:8000';

export const TaskWorkspace: React.FC = () => {
  const [goal, setGoal] = useState('');
  const [taskType, setTaskType] = useState('coding');
  const [execMode, setExecMode] = useState<'orchestrated' | 'single_agent'>('orchestrated');
  const [currentTask, setCurrentTask] = useState<TaskDetail | null>(null);
  const [selectedStep, setSelectedStep] = useState<PlanStep | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLaunchTask = async () => {
    if (!goal.trim()) return;
    setError(null);
    setIsStreaming(true);
    setSelectedStep(null);

    try {
      // 1. Create task
      const r1 = await fetch(`${API_BASE}/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          goal: goal.trim(),
          task_type: taskType,
          execution_mode: execMode,
          risk_suggestion: 'low'
        })
      });
      if (!r1.ok) throw new Error(`创建任务失败 HTTP ${r1.status}`);
      const tdata = await r1.json();
      const taskId = tdata.task_id;

      // 2. Fetch full details initially
      const r2 = await fetch(`${API_BASE}/tasks/${taskId}`);
      const initialDetail: TaskDetail = await r2.json();
      setCurrentTask(initialDetail);

      // 3. Launch async
      await fetch(`${API_BASE}/tasks/${taskId}/execute_async`, { method: 'POST' });

      // 4. Subscribe to SSE stream
      const sse = new EventSource(`${API_BASE}/tasks/${taskId}/stream`);

      sse.addEventListener('step_started', async () => {
        const ref = await fetch(`${API_BASE}/tasks/${taskId}`);
        if (ref.ok) setCurrentTask(await ref.json());
      });

      sse.addEventListener('step_completed', async () => {
        const ref = await fetch(`${API_BASE}/tasks/${taskId}`);
        if (ref.ok) setCurrentTask(await ref.json());
      });

      sse.addEventListener('task_finished', async () => {
        const ref = await fetch(`${API_BASE}/tasks/${taskId}`);
        if (ref.ok) setCurrentTask(await ref.json());
        setIsStreaming(false);
        sse.close();
      });

      sse.addEventListener('task_error', async (e: any) => {
        setError(`执行异常: ${e.data || '未知错误'}`);
        setIsStreaming(false);
        sse.close();
      });

    } catch (err: any) {
      setError(err.message || '网络请求异常');
      setIsStreaming(false);
    }
  };

  const handleCancel = async () => {
    if (!currentTask) return;
    try {
      await fetch(`${API_BASE}/tasks/${currentTask.id}/cancel`, { method: 'POST' });
      setIsStreaming(false);
    } catch (err: any) {
      setError(err.message);
    }
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '380px 1fr', gap: '24px' }}>
      {/* Left Column: Input Form */}
      <div style={{ background: '#fff', borderRadius: '18px', padding: '24px', border: '1px solid rgba(0,0,0,0.06)', boxShadow: '0 8px 24px rgba(0,0,0,0.04)' }}>
        <h2 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '16px', color: '#1d1d1f' }}>📝 编排新任务</h2>
        
        <div style={{ marginBottom: '16px' }}>
          <label style={{ display: 'block', fontSize: '12px', fontWeight: '500', color: '#86868b', marginBottom: '6px' }}>任务目标 (Goal)</label>
          <textarea
            value={goal}
            onChange={e => setGoal(e.target.value)}
            placeholder="例如：设计并实现一个支持 LRU 淘汰策略的高并发线程安全缓存类，并编写测试用例..."
            style={{ width: '100%', height: '110px', padding: '12px', borderRadius: '10px', border: '1px solid #d2d2d7', fontSize: '13px', fontFamily: 'inherit', resize: 'vertical' }}
          />
        </div>

        <div style={{ marginBottom: '16px' }}>
          <label style={{ display: 'block', fontSize: '12px', fontWeight: '500', color: '#86868b', marginBottom: '6px' }}>任务专业域</label>
          <select
            value={taskType}
            onChange={e => setTaskType(e.target.value)}
            style={{ width: '100%', padding: '10px', borderRadius: '10px', border: '1px solid #d2d2d7', fontSize: '13px' }}
          >
            <option value="coding">coding - 软件工程与代码实现 (Antigravity)</option>
            <option value="analysis">analysis - 逻辑与数据分析 (Hermes/DSH)</option>
            <option value="research">research - 前沿调研与方案比选</option>
            <option value="knowledge">knowledge - 知识归纳与问答</option>
            <option value="execution">execution - 系统诊断与脚本执行</option>
          </select>
        </div>

        <div style={{ marginBottom: '20px' }}>
          <label style={{ display: 'block', fontSize: '12px', fontWeight: '500', color: '#86868b', marginBottom: '6px' }}>执行调度模式</label>
          <select
            value={execMode}
            onChange={e => setExecMode(e.target.value as any)}
            style={{ width: '100%', padding: '10px', borderRadius: '10px', border: '1px solid #d2d2d7', fontSize: '13px' }}
          >
            <option value="orchestrated">🤖 智能动态编排 (依据复杂度自动解耦)</option>
            <option value="single_agent">⚡ 强制单 Agent 直达 (极限低 Token 消耗)</option>
          </select>
        </div>

        <div style={{ display: 'flex', gap: '10px' }}>
          <button
            onClick={handleLaunchTask}
            disabled={isStreaming}
            style={{
              flex: 1, padding: '12px', borderRadius: '10px', border: 'none',
              background: isStreaming ? '#8e8e93' : '#0071e3', color: '#fff',
              fontSize: '13px', fontWeight: '600', cursor: isStreaming ? 'not-allowed' : 'pointer'
            }}
          >
            {isStreaming ? '📡 正在推流执行...' : '🚀 启动流式执行 (SSE)'}
          </button>
          {isStreaming && (
            <button
              onClick={handleCancel}
              style={{
                padding: '12px 16px', borderRadius: '10px', border: 'none',
                background: '#ff3b30', color: '#fff', fontSize: '13px', fontWeight: '600', cursor: 'pointer'
              }}
            >
              ⏹️ 取消
            </button>
          )}
        </div>

        {error && (
          <div style={{ marginTop: '14px', padding: '10px', background: '#ffebe9', color: '#cf222e', borderRadius: '8px', fontSize: '12px' }}>
            {error}
          </div>
        )}
      </div>

      {/* Right Column: DAG & Live Monitor */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {currentTask ? (
          <>
            {/* Task Meta Header */}
            <div style={{ background: '#fff', borderRadius: '16px', padding: '18px 24px', border: '1px solid rgba(0,0,0,0.06)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <span style={{ fontFamily: 'monospace', fontWeight: '600', color: '#0071e3', fontSize: '14px' }}>
                  {currentTask.id}
                </span>
                <span style={{ marginLeft: '12px', fontSize: '12px', padding: '3px 10px', borderRadius: '12px', background: currentTask.status === 'success' ? '#e3f9e5' : '#e8f2ff', color: currentTask.status === 'success' ? '#1a7f37' : '#0071e3', fontWeight: '600' }}>
                  {currentTask.status}
                </span>
                <span style={{ marginLeft: '8px', fontSize: '12px', color: '#86868b' }}>
                  复杂度: <strong>{currentTask.complexity}</strong> | 路由模型: <strong>{currentTask.routing_decision?.model_name || 'default'}</strong>
                </span>
              </div>
              <div style={{ fontSize: '12px', color: '#86868b' }}>
                步骤数: {currentTask.steps.length}
              </div>
            </div>

            {/* Interactive DAG Topology */}
            <div style={{ background: '#fff', borderRadius: '16px', padding: '20px', border: '1px solid rgba(0,0,0,0.06)' }}>
              <div style={{ fontSize: '13px', fontWeight: '600', color: '#1d1d1f', marginBottom: '12px' }}>
                🗺️ 任务 DAG 编排拓扑图（点击节点查看详细输入输出）
              </div>
              <DAGTopology
                steps={currentTask.steps}
                selectedKey={selectedStep?.step_key}
                onSelectStep={s => setSelectedStep(s)}
              />
            </div>

            {/* Step Detail Drawer */}
            {selectedStep && (
              <div style={{ background: '#fff', borderRadius: '16px', padding: '20px', border: '1px solid #0071e3', boxShadow: '0 4px 16px rgba(0,113,227,0.08)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <strong>节点详情: {selectedStep.step_key} [{selectedStep.role}]</strong>
                  <span style={{ color: '#0071e3', fontWeight: '600', fontSize: '12px' }}>状态: {selectedStep.status}</span>
                </div>
                <div style={{ fontSize: '12px', color: '#86868b', marginBottom: '8px' }}>
                  目标: {selectedStep.goal}
                </div>
                {selectedStep.result && (
                  <pre style={{ background: '#f5f5f7', padding: '12px', borderRadius: '8px', fontSize: '12px', maxHeight: '200px', overflow: 'auto', fontFamily: 'monospace' }}>
                    {selectedStep.result}
                  </pre>
                )}
                {selectedStep.error && (
                  <div style={{ color: '#ff3b30', fontSize: '12px', marginTop: '6px' }}>
                    错误: {selectedStep.error}
                  </div>
                )}
              </div>
            )}
          </>
        ) : (
          <div style={{ background: '#fff', borderRadius: '16px', padding: '60px', textAlign: 'center', color: '#8e8e93', border: '1px solid rgba(0,0,0,0.06)' }}>
            左侧输入任务目标并点击“启动流式执行”，即可在此实时查看交互式 DAG 拓扑节点流转与实时输出。
          </div>
        )}
      </div>
    </div>
  );
};

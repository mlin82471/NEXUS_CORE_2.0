import React, { useState, useEffect } from 'react';
import { TaskWorkspace } from './components/TaskWorkspace.tsx';
import { DAGStudio } from './components/DAGStudio.tsx';
import { BenchmarkCenter } from './components/BenchmarkCenter.tsx';
import { EvolutionPanel } from './components/EvolutionPanel.tsx';
import { MemoryInspector } from './components/MemoryInspector.tsx';
import { AgentMatrix } from './components/AgentMatrix.tsx';

const VALID_TABS = ['tasks', 'dag', 'benchmark', 'evolution', 'memory', 'agents'] as const;
type TabType = typeof VALID_TABS[number];

export const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabType>('tasks');
  const [isServerOnline, setIsServerOnline] = useState<boolean | null>(null);

  // Sync with URL Hash routing (Multi-route support)
  useEffect(() => {
    const handleHashChange = () => {
      const rawHash = window.location.hash.replace('#/', '').replace('#', '');
      if (VALID_TABS.includes(rawHash as TabType)) {
        setActiveTab(rawHash as TabType);
      }
    };

    // Initial check
    handleHashChange();

    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  const handleTabClick = (tab: TabType) => {
    setActiveTab(tab);
    window.location.hash = `#/${tab}`;
  };

  useEffect(() => {
    fetch('http://127.0.0.1:8000/health')
      .then(res => setIsServerOnline(res.ok))
      .catch(() => setIsServerOnline(false));
  }, []);

  const navItems = [
    { key: 'tasks', label: '📝 任务编排与实时流' },
    { key: 'dag', label: '🕸️ DAG 拓扑全景工作台' },
    { key: 'benchmark', label: '⚖️ A/B 对照基准' },
    { key: 'evolution', label: '🧬 M4 自我进化与治理' },
    { key: 'memory', label: '🧠 M3 长期记忆库' },
    { key: 'agents', label: '🤖 专业 Agent 遥测' },
  ];

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(180deg, #f5f5f7 0%, #e8ebed 100%)', color: '#1d1d1f', fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", sans-serif' }}>
      {/* Top Header */}
      <header style={{
        background: 'rgba(255, 255, 255, 0.85)',
        backdropFilter: 'blur(20px)',
        borderBottom: '1px solid rgba(0,0,0,0.06)',
        padding: '14px 32px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        position: 'sticky',
        top: 0,
        zIndex: 100,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <h1 style={{ fontSize: '18px', fontWeight: '600', letterSpacing: '-0.02em', margin: 0 }}>
            ⚡ NEXUS CORE 2.0
          </h1>
          <span style={{ fontSize: '11px', fontWeight: '600', padding: '3px 9px', borderRadius: '12px', background: '#e8f2ff', color: '#0071e3' }}>
            Production Dashboard (React + TS + Tailwind)
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span style={{
            fontSize: '12px', display: 'flex', alignItems: 'center', gap: '6px',
            color: isServerOnline ? '#34c759' : '#ff3b30', fontWeight: '500'
          }}>
            <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: isServerOnline ? '#34c759' : '#ff3b30' }} />
            {isServerOnline ? '主控核心在线 (8000)' : '主控核心未就绪'}
          </span>
        </div>
      </header>

      {/* Nav Tabs */}
      <div style={{ maxWidth: '1260px', margin: '20px auto 0', padding: '0 24px' }}>
        <div style={{ display: 'flex', gap: '8px', borderBottom: '1px solid rgba(0,0,0,0.06)', paddingBottom: '12px', overflowX: 'auto' }}>
          {navItems.map(item => {
            const isActive = activeTab === item.key;
            return (
              <button
                key={item.key}
                onClick={() => handleTabClick(item.key as TabType)}
                style={{
                  padding: '8px 16px',
                  borderRadius: '10px',
                  border: 'none',
                  background: isActive ? '#0071e3' : 'rgba(0,0,0,0.04)',
                  color: isActive ? '#fff' : '#1d1d1f',
                  fontSize: '13px',
                  fontWeight: '600',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                  whiteSpace: 'nowrap',
                }}
              >
                {item.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Main Content Area */}
      <main style={{ maxWidth: '1260px', margin: '20px auto 60px', padding: '0 24px' }}>
        {activeTab === 'tasks' && <TaskWorkspace />}
        {activeTab === 'dag' && <DAGStudio />}
        {activeTab === 'benchmark' && <BenchmarkCenter />}
        {activeTab === 'evolution' && <EvolutionPanel />}
        {activeTab === 'memory' && <MemoryInspector />}
        {activeTab === 'agents' && <AgentMatrix />}
      </main>
    </div>
  );
};

export default App;

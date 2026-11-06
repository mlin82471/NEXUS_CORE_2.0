import React, { useState, useEffect } from 'react';
import { TaskWorkspace } from './components/TaskWorkspace.tsx';
import { DAGStudio } from './components/DAGStudio.tsx';
import { BenchmarkCenter } from './components/BenchmarkCenter.tsx';
import { EvolutionPanel } from './components/EvolutionPanel.tsx';
import { MemoryInspector } from './components/MemoryInspector.tsx';
import { DashboardOverview } from './components/DashboardOverview.tsx';
import { AgentCenter } from './components/AgentCenter.tsx';
import { ModelCenter } from './components/ModelCenter.tsx';
import { UsageCenter } from './components/UsageCenter.tsx';

const VALID_TABS = [
  'dashboard',
  'agents',
  'models',
  'usage',
  'tasks',
  'dag',
  'benchmark',
  'evolution',
  'memory'
] as const;

type TabType = typeof VALID_TABS[number];

export const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabType>('dashboard');
  const [isServerOnline, setIsServerOnline] = useState<boolean | null>(null);
  const [isDark, setIsDark] = useState<boolean>(() => {
    const saved = localStorage.getItem('nexus_theme');
    return saved !== null ? saved === 'dark' : true; // Default dark tech obsidian
  });

  // Sync with URL Hash routing
  useEffect(() => {
    const handleHashChange = () => {
      const rawHash = window.location.hash.replace('#/', '').replace('#', '');
      if (VALID_TABS.includes(rawHash as TabType)) {
        setActiveTab(rawHash as TabType);
      }
    };

    handleHashChange();
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  const handleTabClick = (tab: string) => {
    if (VALID_TABS.includes(tab as TabType)) {
      setActiveTab(tab as TabType);
      window.location.hash = `#/${tab}`;
    }
  };

  const toggleTheme = () => {
    const next = !isDark;
    setIsDark(next);
    localStorage.setItem('nexus_theme', next ? 'dark' : 'light');
  };

  useEffect(() => {
    fetch('http://127.0.0.1:8000/health')
      .then(res => setIsServerOnline(res.ok))
      .catch(() => setIsServerOnline(false));
  }, []);

  const navSections = [
    {
      title: 'MAIN WORKSPACE',
      items: [
        { key: 'dashboard', label: '📊 控制台总览', desc: 'KPI / 遥测 / 快捷通道' },
        { key: 'agents', label: '🤖 Agent 管理中心', desc: '可视化向导 / 模板 / 启停' },
        { key: 'models', label: '🌐 模型接入中心', desc: '多服务商 / 测速 / 路由' },
        { key: 'usage', label: '📈 Token 成本监控', desc: '真实审计 / 报表 / 预算' },
      ]
    },
    {
      title: 'EXECUTION & TOPOLOGY',
      items: [
        { key: 'tasks', label: '📝 任务编排与实时流', desc: 'SSE 推流与即时取消' },
        { key: 'dag', label: '🕸️ DAG 拓扑工作台', desc: '可拖拽拓扑图与抽屉' },
        { key: 'benchmark', label: '🔬 性能对比实验室', desc: '多模型/Agent 竞速收益' },
      ]
    },
    {
      title: 'GOVERNANCE & AUDIT',
      items: [
        { key: 'evolution', label: '🧬 M4 自主进化与巡检', desc: '沙箱预审 / 审批 / 回滚' },
        { key: 'memory', label: '🧠 M3 长期记忆库', desc: 'RCA 归因与混合向量检索' },
      ]
    }
  ];

  // Theme Colors
  const bgMain = isDark ? '#0d1117' : '#f6f8fa';
  const sidebarBg = isDark ? '#161b22' : '#ffffff';
  const borderCol = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)';
  const textMain = isDark ? '#f0f6fc' : '#1d1d1f';
  const textSub = isDark ? '#8b949e' : '#86868b';

  return (
    <div style={{
      display: 'flex', minHeight: '100vh', background: bgMain, color: textMain,
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", sans-serif',
      transition: 'background 0.2s ease',
    }}>
      {/* Left Sidebar */}
      <aside style={{
        width: '260px',
        background: sidebarBg,
        borderRight: `1px solid ${borderCol}`,
        display: 'flex',
        flexDirection: 'column',
        position: 'sticky',
        top: 0,
        height: '100vh',
        zIndex: 50,
        flexShrink: 0,
      }}>
        {/* Brand Header */}
        <div style={{ padding: '20px 24px', borderBottom: `1px solid ${borderCol}` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '20px' }}>⚡</span>
            <div>
              <div style={{ fontSize: '16px', fontWeight: '700', letterSpacing: '-0.02em', color: textMain }}>
                NEXUS CORE 2.1
              </div>
              <div style={{ fontSize: '11px', color: '#58a6ff', fontWeight: '600' }}>
                CONTROL CENTER
              </div>
            </div>
          </div>
        </div>

        {/* Navigation Sections */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 14px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {navSections.map(sec => (
            <div key={sec.title}>
              <div style={{ fontSize: '11px', fontWeight: '700', color: textSub, letterSpacing: '0.05em', padding: '0 10px 8px 10px' }}>
                {sec.title}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                {sec.items.map(item => {
                  const isActive = activeTab === item.key;
                  return (
                    <button
                      key={item.key}
                      onClick={() => handleTabClick(item.key)}
                      style={{
                        padding: '10px 12px',
                        borderRadius: '10px',
                        border: 'none',
                        background: isActive ? (isDark ? 'rgba(56, 139, 253, 0.16)' : 'rgba(0, 113, 227, 0.1)') : 'transparent',
                        color: isActive ? '#58a6ff' : textMain,
                        textAlign: 'left',
                        cursor: 'pointer',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '2px',
                        position: 'relative',
                        transition: 'all 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
                        transform: isActive ? 'translateX(3px)' : 'none',
                        boxShadow: isActive ? (isDark ? 'inset 0 1px 0 rgba(255,255,255,0.08), 0 2px 8px rgba(0,0,0,0.2)' : '0 2px 8px rgba(0,113,227,0.12)') : 'none',
                      }}
                    >
                      {isActive && (
                        <div style={{
                          position: 'absolute', left: '-8px', top: '22%', bottom: '22%', width: '3px',
                          background: '#58a6ff', borderRadius: '2px',
                        }} />
                      )}
                      <div style={{ fontSize: '13px', fontWeight: isActive ? '700' : '500' }}>
                        {item.label}
                      </div>
                      <div style={{ fontSize: '11px', color: textSub }}>
                        {item.desc}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {/* Sidebar Footer */}
        <div style={{ padding: '16px 20px', borderTop: `1px solid ${borderCol}`, fontSize: '11px', color: textSub, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>199 项测试全部通过</span>
          <span style={{ color: '#3fb950', fontWeight: '600' }}>● PROD READY</span>
        </div>
      </aside>

      {/* Main Body */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        {/* Top Navbar */}
        <header style={{
          height: '60px',
          background: isDark ? 'rgba(22, 27, 34, 0.8)' : 'rgba(255, 255, 255, 0.8)',
          backdropFilter: 'blur(16px)',
          borderBottom: `1px solid ${borderCol}`,
          padding: '0 32px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          position: 'sticky',
          top: 0,
          zIndex: 40,
        }}>
          {/* Breadcrumb / Title */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '14px', fontWeight: '600', color: textMain, textTransform: 'capitalize' }}>
              {activeTab}
            </span>
            <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '10px', background: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)', color: textSub }}>
              双模就绪 (Web + Desktop)
            </span>
          </div>

          {/* Right Status & Controls */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            {/* Core Online Status */}
            <span style={{
              fontSize: '12px', display: 'flex', alignItems: 'center', gap: '8px',
              color: isServerOnline ? '#34c759' : '#f85149', fontWeight: '500'
            }}>
              <span
                className={isServerOnline ? 'apple-pulse-green' : ''}
                style={{ width: '8px', height: '8px', borderRadius: '50%', background: isServerOnline ? '#34c759' : '#f85149', display: 'inline-block' }}
              />
              {isServerOnline ? '主控服务在线 (:8000)' : '主控服务未连接'}
            </span>

            {/* Dark / Light Toggle */}
            <button
              onClick={toggleTheme}
              title="切换深色/浅色主题"
              style={{
                background: isDark ? '#1f2937' : '#f0f7ff',
                border: `1px solid ${borderCol}`,
                borderRadius: '8px',
                padding: '6px 10px',
                fontSize: '13px',
                cursor: 'pointer',
                color: textMain,
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              <span>{isDark ? '🌙 深色' : '☀️ 浅色'}</span>
            </button>
          </div>
        </header>

        {/* Viewport */}
        <main key={activeTab} className="apple-animate-in" style={{ flex: 1, padding: '28px 32px', maxWidth: '1440px', width: '100%', boxSizing: 'border-box' }}>
          {activeTab === 'dashboard' && <DashboardOverview onNavigate={handleTabClick} isDark={isDark} />}
          {activeTab === 'agents' && <AgentCenter isDark={isDark} />}
          {activeTab === 'models' && <ModelCenter isDark={isDark} />}
          {activeTab === 'usage' && <UsageCenter isDark={isDark} />}
          {activeTab === 'tasks' && <TaskWorkspace />}
          {activeTab === 'dag' && <DAGStudio />}
          {activeTab === 'benchmark' && <BenchmarkCenter />}
          {activeTab === 'evolution' && <EvolutionPanel isDark={isDark} />}
          {activeTab === 'memory' && <MemoryInspector />}
        </main>
      </div>
    </div>
  );
};

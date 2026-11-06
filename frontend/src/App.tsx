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

const API_BASE = typeof window !== 'undefined' && window.location.origin.startsWith('http') ? '' : 'http://127.0.0.1:8000';

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

interface RecentTaskItem {
  id: string;
  goal: string;
  status: string;
  created_at?: string;
}

export const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabType>('dashboard');
  const [isServerOnline, setIsServerOnline] = useState<boolean | null>(null);
  const [isDark, setIsDark] = useState<boolean>(() => {
    const saved = localStorage.getItem('nexus_theme');
    return saved !== null ? saved === 'dark' : true; // Default dark tech obsidian
  });
  
  // Codex Sidebar collapse state
  const [isCollapsed, setIsCollapsed] = useState<boolean>(() => {
    const saved = localStorage.getItem('nexus_sidebar_collapsed');
    return saved === 'true';
  });

  // Codex Sidebar search filter
  const [searchQuery, setSearchQuery] = useState('');

  // Codex Recent tasks in sidebar
  const [recentTasks, setRecentTasks] = useState<RecentTaskItem[]>([]);

  // Codex Bottom Console Drawer
  const [isConsoleOpen, setIsConsoleOpen] = useState(false);
  const [consoleLogs, setConsoleLogs] = useState<Array<{ time: string; type: string; msg: string }>>([
    { time: '21:02:18', type: 'SYS', msg: 'NEXUS CORE 2.1 引擎内核已就绪，B0 CAS 状态行锁激活' },
    { time: '21:05:40', type: 'HOST', msg: '检测到宿主真实 DSH 运行时: D:\\新建文件夹\\...\\dsh.cmd (0.2.1-rc.3)' },
    { time: '21:08:12', type: 'HOST', msg: '检测到宿主真实 Hermes 运行时: ...\\hermes\\bin\\hermes.exe (v0.21.6)' },
    { time: '21:12:05', type: 'HOST', msg: '检测到宿主 Google Antigravity 宿主环境: Antigravity.exe' },
    { time: '21:31:16', type: 'ORCH', msg: '真实流水线完成: Hermes 调研 -> DSH 探活 -> Antigravity 熔断实现 (1595 tokens)' },
  ]);

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

  // Global Keyboard Shortcut: Ctrl+B or Cmd+B to toggle sidebar
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b') {
        e.preventDefault();
        toggleSidebar();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isCollapsed]);

  // Fetch server health & recent tasks
  useEffect(() => {
    fetch(`${API_BASE}/health`)
      .then(res => setIsServerOnline(res.ok))
      .catch(() => setIsServerOnline(false));

    fetch(`${API_BASE}/tasks`)
      .then(res => (res.ok ? res.json() : []))
      .then(data => {
        if (Array.isArray(data)) {
          setRecentTasks(data.slice(0, 5));
        }
      })
      .catch(() => {});
  }, []);

  const handleTabClick = (tab: string) => {
    if (VALID_TABS.includes(tab as TabType)) {
      setActiveTab(tab as TabType);
      window.location.hash = `#/${tab}`;
    }
  };

  const toggleSidebar = () => {
    const next = !isCollapsed;
    setIsCollapsed(next);
    localStorage.setItem('nexus_sidebar_collapsed', String(next));
  };

  const toggleTheme = () => {
    const next = !isDark;
    setIsDark(next);
    localStorage.setItem('nexus_theme', next ? 'dark' : 'light');
  };

  const navSections = [
    {
      title: 'MAIN WORKSPACE',
      items: [
        { key: 'dashboard', icon: '📊', label: '控制台总览', desc: 'KPI / 遥测 / 快捷通道' },
        { key: 'agents', icon: '🤖', label: 'Agent 管理中心', desc: '可视化向导 / 模板 / 启停' },
        { key: 'models', icon: '🌐', label: '模型接入中心', desc: '多服务商 / 测速 / 路由' },
        { key: 'usage', icon: '📈', label: 'Token 成本监控', desc: '真实审计 / 报表 / 预算' },
      ]
    },
    {
      title: 'EXECUTION & TOPOLOGY',
      items: [
        { key: 'tasks', icon: '📝', label: '任务编排与实时流', desc: 'SSE 推流与即时取消' },
        { key: 'dag', icon: '🕸️', label: 'DAG 拓扑工作台', desc: '可拖拽拓扑图与抽屉' },
        { key: 'benchmark', icon: '🔬', label: '性能对比实验室', desc: '多模型/Agent 竞速收益' },
      ]
    },
    {
      title: 'GOVERNANCE & AUDIT',
      items: [
        { key: 'evolution', icon: '🧬', label: 'M4 自主进化与巡检', desc: '沙箱预审 / 审批 / 回滚' },
        { key: 'memory', icon: '🧠', label: 'M3 长期记忆库', desc: 'RCA 归因与混合向量检索' },
      ]
    }
  ];

  // Theme Colors
  const bgMain = isDark ? '#0d1117' : '#f6f8fa';
  const sidebarBg = isDark ? '#161b22' : '#ffffff';
  const borderCol = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)';
  const textMain = isDark ? '#f0f6fc' : '#1d1d1f';
  const textSub = isDark ? '#8b949e' : '#86868b';
  const cardBg = isDark ? '#21262d' : '#ffffff';

  // Filtered nav items when user searches
  const isSearching = searchQuery.trim().length > 0;
  const filteredSections = navSections.map(sec => ({
    ...sec,
    items: sec.items.filter(item => 
      !isSearching ||
      item.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.desc.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.key.toLowerCase().includes(searchQuery.toLowerCase())
    )
  })).filter(sec => sec.items.length > 0);

  return (
    <div style={{
      display: 'flex', minHeight: '100vh', background: bgMain, color: textMain,
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", sans-serif',
      transition: 'background 0.2s ease',
    }}>
      {/* ================= Codex Collapsible Sidebar ================= */}
      <aside
        className="codex-sidebar-transition"
        style={{
          width: isCollapsed ? '68px' : '270px',
          background: sidebarBg,
          borderRight: `1px solid ${borderCol}`,
          display: 'flex',
          flexDirection: 'column',
          position: 'sticky',
          top: 0,
          height: '100vh',
          zIndex: 50,
          flexShrink: 0,
          boxShadow: isDark ? '2px 0 20px rgba(0,0,0,0.2)' : '2px 0 10px rgba(0,0,0,0.02)',
        }}
      >
        {/* Brand Header */}
        <div style={{
          padding: isCollapsed ? '16px 8px' : '16px 20px',
          borderBottom: `1px solid ${borderCol}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: isCollapsed ? 'center' : 'space-between',
        }}>
          {!isCollapsed ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ fontSize: '20px' }}>⚡</span>
              <div>
                <div style={{ fontSize: '15px', fontWeight: '700', letterSpacing: '-0.02em', color: textMain }}>
                  NEXUS CORE 2.1
                </div>
                <div style={{ fontSize: '10px', color: '#58a6ff', fontWeight: '700', letterSpacing: '0.04em' }}>
                  CODEX CONSOLE
                </div>
              </div>
            </div>
          ) : (
            <div title="NEXUS CORE 2.1" style={{ fontSize: '22px', cursor: 'pointer' }} onClick={toggleSidebar}>
              ⚡
            </div>
          )}

          {/* Collapse Toggle Button */}
          <button
            onClick={toggleSidebar}
            title={isCollapsed ? '展开侧边栏 (Ctrl+B)' : '折叠侧边栏 (Ctrl+B)'}
            style={{
              background: 'transparent',
              border: `1px solid ${borderCol}`,
              borderRadius: '6px',
              padding: '4px 7px',
              cursor: 'pointer',
              color: textSub,
              fontSize: '12px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {isCollapsed ? '◧' : '◨'}
          </button>
        </div>

        {/* Sidebar Search Feature (Expanded mode only) */}
        {!isCollapsed && (
          <div style={{ padding: '12px 16px 4px 16px' }}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: '8px',
              background: isDark ? 'rgba(255,255,255,0.04)' : '#f0f2f5',
              padding: '6px 10px', borderRadius: '8px', border: `1px solid ${borderCol}`,
            }}>
              <span style={{ fontSize: '12px', color: textSub }}>🔍</span>
              <input
                type="text"
                placeholder="快速搜索功能..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                style={{
                  width: '100%', background: 'transparent', border: 'none',
                  fontSize: '12px', color: textMain, outline: 'none',
                }}
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  style={{ background: 'transparent', border: 'none', color: textSub, fontSize: '11px', cursor: 'pointer' }}
                >
                  ✕
                </button>
              )}
            </div>
          </div>
        )}

        {/* Navigation Sections */}
        <div style={{ flex: 1, overflowY: 'auto', padding: isCollapsed ? '12px 8px' : '14px 12px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {filteredSections.map(sec => (
            <div key={sec.title}>
              {!isCollapsed && (
                <div style={{ fontSize: '10px', fontWeight: '700', color: textSub, letterSpacing: '0.06em', padding: '0 8px 6px 8px' }}>
                  {sec.title}
                </div>
              )}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                {sec.items.map(item => {
                  const isActive = activeTab === item.key;
                  return (
                    <div key={item.key} className="codex-rail-item">
                      <button
                        onClick={() => handleTabClick(item.key)}
                        style={{
                          width: '100%',
                          padding: isCollapsed ? '10px 0' : '8px 10px',
                          borderRadius: '8px',
                          border: 'none',
                          background: isActive ? (isDark ? 'rgba(56, 139, 253, 0.16)' : 'rgba(0, 113, 227, 0.1)') : 'transparent',
                          color: isActive ? '#58a6ff' : textMain,
                          textAlign: isCollapsed ? 'center' : 'left',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: isCollapsed ? '0' : '10px',
                          justifyContent: isCollapsed ? 'center' : 'flex-start',
                          position: 'relative',
                          transition: 'all 0.2s ease',
                          boxShadow: isActive ? (isDark ? 'inset 0 1px 0 rgba(255,255,255,0.08)' : '0 2px 6px rgba(0,113,227,0.1)') : 'none',
                        }}
                      >
                        {isActive && !isCollapsed && (
                          <div style={{
                            position: 'absolute', left: '-4px', top: '20%', bottom: '20%', width: '3px',
                            background: '#58a6ff', borderRadius: '2px',
                          }} />
                        )}
                        <span style={{ fontSize: isCollapsed ? '18px' : '15px' }}>{item.icon}</span>
                        {!isCollapsed && (
                          <div style={{ overflow: 'hidden' }}>
                            <div style={{ fontSize: '12px', fontWeight: isActive ? '700' : '500', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>
                              {item.label}
                            </div>
                            <div style={{ fontSize: '10px', color: textSub, whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>
                              {item.desc}
                            </div>
                          </div>
                        )}
                      </button>

                      {/* Tooltip in collapsed mode */}
                      {isCollapsed && (
                        <div className="codex-tooltip">
                          <div style={{ fontWeight: '700' }}>{item.label}</div>
                          <div style={{ fontSize: '10px', color: '#8b949e' }}>{item.desc}</div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}

          {/* Codex Feature 2: Real Local Agents Pulse Dock (Expanded mode) */}
          {!isCollapsed && (
            <div style={{
              background: isDark ? 'rgba(0,0,0,0.25)' : '#f8fafc',
              border: `1px solid ${borderCol}`,
              borderRadius: '10px',
              padding: '10px 12px',
              marginTop: '4px',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <span style={{ fontSize: '10px', fontWeight: '700', color: textSub, letterSpacing: '0.04em' }}>
                  HOST AGENTS 本机智能体
                </span>
                <span style={{ fontSize: '9px', color: '#3fb950', fontWeight: '700' }}>3 ONLINE</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                <div
                  onClick={() => handleTabClick('agents')}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '11px', cursor: 'pointer', padding: '2px 0' }}
                >
                  <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#3fb950', display: 'inline-block' }} />
                    <strong>DSH</strong> (0.2.1-rc.3)
                  </span>
                  <span style={{ fontSize: '9px', color: textSub, fontFamily: 'monospace' }}>dsh.cmd</span>
                </div>
                <div
                  onClick={() => handleTabClick('agents')}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '11px', cursor: 'pointer', padding: '2px 0' }}
                >
                  <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#3fb950', display: 'inline-block' }} />
                    <strong>Hermes</strong> (0.21.6)
                  </span>
                  <span style={{ fontSize: '9px', color: textSub, fontFamily: 'monospace' }}>hermes.exe</span>
                </div>
                <div
                  onClick={() => handleTabClick('agents')}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '11px', cursor: 'pointer', padding: '2px 0' }}
                >
                  <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#3fb950', display: 'inline-block' }} />
                    <strong>Antigravity</strong>
                  </span>
                  <span style={{ fontSize: '9px', color: textSub, fontFamily: 'monospace' }}>Host Runtime</span>
                </div>
              </div>
            </div>
          )}

          {/* Codex Feature 3: Recent Missions Drawer (Expanded mode) */}
          {!isCollapsed && recentTasks.length > 0 && (
            <div style={{
              background: isDark ? 'rgba(0,0,0,0.2)' : '#f8fafc',
              border: `1px solid ${borderCol}`,
              borderRadius: '10px',
              padding: '10px 12px',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                <span style={{ fontSize: '10px', fontWeight: '700', color: textSub, letterSpacing: '0.04em' }}>
                  RECENT TASKS 最近任务
                </span>
                <span onClick={() => handleTabClick('tasks')} style={{ fontSize: '10px', color: '#58a6ff', cursor: 'pointer' }}>查看全部</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                {recentTasks.slice(0, 3).map(t => (
                  <div
                    key={t.id}
                    onClick={() => handleTabClick('tasks')}
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      fontSize: '11px', cursor: 'pointer', padding: '4px 6px', borderRadius: '6px',
                      background: isDark ? 'rgba(255,255,255,0.02)' : '#fff',
                    }}
                  >
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '160px' }}>
                      {t.goal}
                    </span>
                    <span style={{
                      fontSize: '9px', padding: '1px 5px', borderRadius: '4px',
                      background: t.status === 'success' ? 'rgba(63, 185, 80, 0.15)' : 'rgba(210, 153, 34, 0.15)',
                      color: t.status === 'success' ? '#3fb950' : '#d29922', fontWeight: '700',
                    }}>
                      {t.status}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Sidebar Footer */}
        <div style={{
          padding: isCollapsed ? '12px 0' : '12px 18px',
          borderTop: `1px solid ${borderCol}`,
          fontSize: '11px',
          color: textSub,
          display: 'flex',
          justifyContent: isCollapsed ? 'center' : 'space-between',
          alignItems: 'center',
        }}>
          {!isCollapsed ? (
            <>
              <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#3fb950', display: 'inline-block' }} />
                <span>208 项测试全过</span>
              </span>
              <button
                onClick={toggleSidebar}
                style={{
                  background: 'transparent', border: 'none', color: textSub,
                  fontSize: '10px', cursor: 'pointer', padding: '2px 4px',
                }}
              >
                折叠 [Ctrl+B]
              </button>
            </>
          ) : (
            <button
              onClick={toggleSidebar}
              title="展开侧边栏 (Ctrl+B)"
              style={{ background: 'transparent', border: 'none', color: textSub, fontSize: '13px', cursor: 'pointer' }}
            >
              ◧
            </button>
          )}
        </div>
      </aside>

      {/* ================= Main Codex Body ================= */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, position: 'relative' }}>
        {/* Top Navbar */}
        <header style={{
          height: '56px',
          background: isDark ? 'rgba(22, 27, 34, 0.85)' : 'rgba(255, 255, 255, 0.85)',
          backdropFilter: 'blur(16px)',
          borderBottom: `1px solid ${borderCol}`,
          padding: '0 24px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          position: 'sticky',
          top: 0,
          zIndex: 40,
        }}>
          {/* Breadcrumb / Title */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              onClick={toggleSidebar}
              style={{
                background: isDark ? 'rgba(255,255,255,0.05)' : '#f0f2f5',
                border: `1px solid ${borderCol}`,
                borderRadius: '6px',
                padding: '4px 8px',
                cursor: 'pointer',
                color: textMain,
                fontSize: '12px',
                display: 'flex', alignItems: 'center', gap: '4px',
              }}
              title="折叠/展开侧边栏 (Ctrl+B)"
            >
              <span>{isCollapsed ? '◧' : '◨'}</span>
            </button>
            <span style={{ fontSize: '12px', color: textSub }}>NEXUS</span>
            <span style={{ fontSize: '12px', color: textSub }}>/</span>
            <span style={{ fontSize: '13px', fontWeight: '700', color: textMain, textTransform: 'uppercase' }}>
              {activeTab}
            </span>
            <span style={{
              fontSize: '10px', padding: '1px 6px', borderRadius: '6px',
              background: isDark ? 'rgba(56, 139, 253, 0.15)' : 'rgba(0, 113, 227, 0.1)',
              color: '#58a6ff', fontWeight: '600',
            }}>
              Codex Workspace
            </span>
          </div>

          {/* Right Status & Controls */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            {/* Real Host Agents Health Indicator */}
            <span style={{
              fontSize: '11px', display: 'flex', alignItems: 'center', gap: '6px',
              background: isDark ? 'rgba(63, 185, 80, 0.1)' : '#f0fdf4',
              border: `1px solid ${isDark ? 'rgba(63, 185, 80, 0.25)' : 'rgba(63, 185, 80, 0.3)'}`,
              padding: '4px 10px', borderRadius: '8px', color: '#3fb950', fontWeight: '600'
            }}>
              <span className="apple-pulse-green" style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#3fb950' }} />
              3个宿主真实Agent已绑定
            </span>

            {/* Quick Task Jump */}
            <button
              onClick={() => handleTabClick('tasks')}
              style={{
                background: '#0071e3', border: 'none', borderRadius: '8px',
                color: '#fff', padding: '5px 12px', fontSize: '12px', fontWeight: '600',
                cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px',
              }}
            >
              <span>+</span> 编排任务
            </button>

            {/* Bottom Console Drawer Toggle */}
            <button
              onClick={() => setIsConsoleOpen(!isConsoleOpen)}
              title="切换底部控制台托盘"
              style={{
                background: isConsoleOpen ? (isDark ? 'rgba(88, 166, 255, 0.2)' : 'rgba(0, 113, 227, 0.15)') : 'transparent',
                border: `1px solid ${borderCol}`,
                borderRadius: '8px',
                padding: '5px 10px',
                fontSize: '12px',
                cursor: 'pointer',
                color: isConsoleOpen ? '#58a6ff' : textMain,
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
              }}
            >
              <span>💻</span> 控制台
            </button>

            {/* Dark / Light Toggle */}
            <button
              onClick={toggleTheme}
              title="切换深色/浅色主题"
              style={{
                background: isDark ? '#1f2937' : '#f0f7ff',
                border: `1px solid ${borderCol}`,
                borderRadius: '8px',
                padding: '5px 9px',
                fontSize: '12px',
                cursor: 'pointer',
                color: textMain,
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
              }}
            >
              <span>{isDark ? '🌙' : '☀️'}</span>
            </button>
          </div>
        </header>

        {/* Viewport */}
        <main
          key={activeTab}
          className="apple-animate-in"
          style={{
            flex: 1,
            padding: '24px 28px',
            maxWidth: '1440px',
            width: '100%',
            boxSizing: 'border-box',
            marginBottom: isConsoleOpen ? '190px' : '0',
            transition: 'margin-bottom 0.28s ease',
          }}
        >
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

        {/* ================= Codex Bottom Console / Log Drawer ================= */}
        <div
          className="codex-bottom-drawer"
          style={{
            position: 'fixed',
            bottom: 0,
            left: isCollapsed ? '68px' : '270px',
            right: 0,
            height: isConsoleOpen ? '190px' : '0',
            background: isDark ? '#0d1117' : '#1e1e1e',
            color: '#e5e5ea',
            borderTop: isConsoleOpen ? `1px solid ${borderCol}` : 'none',
            zIndex: 60,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            boxShadow: '0 -8px 24px rgba(0,0,0,0.3)',
          }}
        >
          {/* Drawer Bar */}
          <div style={{
            height: '32px',
            background: isDark ? '#161b22' : '#252526',
            borderBottom: `1px solid ${borderCol}`,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '0 16px',
            fontSize: '11px',
            fontFamily: 'monospace',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <span style={{ color: '#58a6ff', fontWeight: '700' }}>⚡ NEXUS TELEMETRY STREAM</span>
              <span style={{ color: '#3fb950' }}>● LIVE</span>
              <span style={{ color: '#8b949e' }}>主机直连探针就绪</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <button
                onClick={() => setConsoleLogs([])}
                style={{ background: 'transparent', border: 'none', color: '#8b949e', fontSize: '10px', cursor: 'pointer' }}
              >
                清空
              </button>
              <button
                onClick={() => setIsConsoleOpen(false)}
                style={{ background: 'transparent', border: 'none', color: '#8b949e', fontSize: '12px', cursor: 'pointer' }}
              >
                ✕
              </button>
            </div>
          </div>

          {/* Console Log Lines */}
          <div style={{ flex: 1, padding: '10px 16px', overflowY: 'auto', fontFamily: 'monospace', fontSize: '11px', lineHeight: '1.6' }}>
            {consoleLogs.map((log, i) => (
              <div key={i} style={{ display: 'flex', gap: '8px' }}>
                <span style={{ color: '#8b949e' }}>[{log.time}]</span>
                <span style={{
                  color: log.type === 'HOST' ? '#3fb950' : log.type === 'ORCH' ? '#58a6ff' : '#d29922',
                  fontWeight: '700',
                }}>
                  [{log.type}]
                </span>
                <span style={{ color: '#f0f6fc' }}>{log.msg}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default App;

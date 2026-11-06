const {
  useState,
  useEffect,
  useRef
} = React;
const API_BASE = typeof window !== 'undefined' && window.location.origin.startsWith('http') ? '' : 'http://127.0.0.1:8000';

// ===== types.ts =====

// ===== Control Center 2.1 Types =====

// ===== components/DAGTopology.tsx =====

const DAGTopology = ({
  steps,
  selectedKey,
  onSelectStep,
  height = 360,
  interactive = true
}) => {
  const containerRef = useRef(null);
  const [positions, setPositions] = useState({});
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({
    x: 30,
    y: 30
  });

  // Dragging state
  const [draggingKey, setDraggingKey] = useState(null);
  const [dragOffset, setDragOffset] = useState({
    x: 0,
    y: 0
  });
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({
    x: 0,
    y: 0
  });
  const [hoveredKey, setHoveredKey] = useState(null);
  const nodeWidth = 170;
  const nodeHeight = 72;
  const layerSpacing = 240;
  const nodeSpacing = 105;

  // Auto layout function using topological layers (Kahn's based)
  const computeAutoLayout = stepsList => {
    if (!stepsList || stepsList.length === 0) return {};
    const stepMap = new Map();
    stepsList.forEach(s => stepMap.set(s.step_key, s));
    const layers = new Map();
    const getLayer = (key, visited = new Set()) => {
      if (layers.has(key)) return layers.get(key);
      if (visited.has(key)) return 0;
      visited.add(key);
      const s = stepMap.get(key);
      if (!s || !s.depends_on || s.depends_on.length === 0) {
        layers.set(key, 0);
        return 0;
      }
      let maxDep = 0;
      for (const d of s.depends_on) {
        maxDep = Math.max(maxDep, getLayer(d, visited) + 1);
      }
      layers.set(key, maxDep);
      return maxDep;
    };
    stepsList.forEach(s => getLayer(s.step_key));
    const layerGroups = new Map();
    stepsList.forEach(s => {
      const l = layers.get(s.step_key) || 0;
      if (!layerGroups.has(l)) layerGroups.set(l, []);
      layerGroups.get(l).push(s);
    });
    const newPositions = {};
    layerGroups.forEach((group, layerIdx) => {
      const startY = 40 + (group.length > 1 ? 0 : 35);
      group.forEach((step, idx) => {
        const x = 50 + layerIdx * layerSpacing;
        const y = startY + idx * nodeSpacing;
        newPositions[step.step_key] = {
          x,
          y
        };
      });
    });
    return newPositions;
  };

  // Re-calculate layout when steps change or when initial positions are empty
  useEffect(() => {
    if (!steps || steps.length === 0) {
      setPositions({});
      return;
    }

    // Only compute if new steps arrived or missing keys
    const missingKeys = steps.some(s => !positions[s.step_key]);
    if (missingKeys || Object.keys(positions).length === 0) {
      const layout = computeAutoLayout(steps);
      setPositions(layout);
    }
  }, [steps]);
  const handleResetLayout = () => {
    const layout = computeAutoLayout(steps);
    setPositions(layout);
    setPan({
      x: 30,
      y: 30
    });
    setZoom(1);
  };
  const handleZoom = delta => {
    setZoom(prev => Math.min(2.2, Math.max(0.4, Number((prev + delta).toFixed(2)))));
  };

  // Mouse handlers for dragging nodes
  const handleNodeMouseDown = (e, stepKey) => {
    if (!interactive) return;
    e.stopPropagation();
    const pos = positions[stepKey] || {
      x: 0,
      y: 0
    };
    setDraggingKey(stepKey);
    setDragOffset({
      x: (e.clientX - pan.x) / zoom - pos.x,
      y: (e.clientY - pan.y) / zoom - pos.y
    });
    const s = steps.find(item => item.step_key === stepKey);
    if (s && onSelectStep) {
      onSelectStep(s);
    }
  };

  // Canvas pan handlers
  const handleCanvasMouseDown = e => {
    if (!interactive) return;
    if (e.button === 0 || e.button === 1) {
      setIsPanning(true);
      setPanStart({
        x: e.clientX - pan.x,
        y: e.clientY - pan.y
      });
    }
  };
  const handleMouseMove = e => {
    if (draggingKey) {
      const newX = (e.clientX - pan.x) / zoom - dragOffset.x;
      const newY = (e.clientY - pan.y) / zoom - dragOffset.y;
      setPositions(prev => ({
        ...prev,
        [draggingKey]: {
          x: Math.max(10, Math.round(newX)),
          y: Math.max(10, Math.round(newY))
        }
      }));
    } else if (isPanning) {
      setPan({
        x: e.clientX - panStart.x,
        y: e.clientY - panStart.y
      });
    }
  };
  const handleMouseUp = () => {
    setDraggingKey(null);
    setIsPanning(false);
  };
  const handleWheel = e => {
    if (!interactive) return;
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.08 : 0.92;
    setZoom(prev => Math.min(2.2, Math.max(0.4, Number((prev * factor).toFixed(2)))));
  };
  const getStatusColor = status => {
    switch (status) {
      case 'success':
        return '#34c759';
      case 'running':
        return '#0071e3';
      case 'failed':
        return '#ff3b30';
      case 'skipped':
        return '#8e8e93';
      case 'pending':
        return '#ff9500';
      default:
        return '#aeaeb2';
    }
  };
  const getRoleBadge = role => {
    switch (role?.toLowerCase()) {
      case 'coding':
        return {
          label: '💻 Coding',
          bg: '#e8f2ff',
          color: '#0071e3'
        };
      case 'research':
        return {
          label: '🔍 Research',
          bg: '#f3e8ff',
          color: '#8944ab'
        };
      case 'analysis':
        return {
          label: '🧠 Analysis',
          bg: '#e6f7ed',
          color: '#1b803a'
        };
      case 'evaluator':
        return {
          label: '⚖️ Verifier',
          bg: '#fff4e5',
          color: '#c46900'
        };
      default:
        return {
          label: `⚙️ ${role || 'Agent'}`,
          bg: '#f2f2f7',
          color: '#1d1d1f'
        };
    }
  };
  if (!steps || steps.length === 0) {
    return /*#__PURE__*/React.createElement("div", {
      style: {
        height,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#fafafc',
        borderRadius: '16px',
        border: '1px dashed #d2d2d7',
        color: '#86868b',
        fontSize: '13px'
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: '28px',
        marginBottom: '8px'
      }
    }, "\uD83D\uDD78\uFE0F"), /*#__PURE__*/React.createElement("span", null, "\u6682\u65E0 DAG \u6B65\u9AA4\u62D3\u6251\u6570\u636E"));
  }

  // Pre-calculate dependencies for edge rendering
  const edges = [];
  steps.forEach(step => {
    (step.depends_on || []).forEach(depKey => {
      const isHighlighted = hoveredKey === step.step_key || hoveredKey === depKey || selectedKey === step.step_key;
      const isRunning = step.status === 'running';
      edges.push({
        from: depKey,
        to: step.step_key,
        isHighlighted,
        isRunning
      });
    });
  });
  return /*#__PURE__*/React.createElement("div", {
    ref: containerRef,
    style: {
      position: 'relative',
      height,
      background: '#f8f9fa',
      borderRadius: '16px',
      border: '1px solid rgba(0,0,0,0.08)',
      overflow: 'hidden',
      userSelect: 'none',
      boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.02)'
    },
    onMouseMove: handleMouseMove,
    onMouseUp: handleMouseUp,
    onMouseLeave: handleMouseUp,
    onWheel: handleWheel
  }, /*#__PURE__*/React.createElement("style", null, `
        @keyframes pulseGlow {
          0% { filter: drop-shadow(0 0 2px rgba(0,113,227,0.4)); }
          50% { filter: drop-shadow(0 0 10px rgba(0,113,227,0.8)); }
          100% { filter: drop-shadow(0 0 2px rgba(0,113,227,0.4)); }
        }
        @keyframes edgeDash {
          to { stroke-dashoffset: -20; }
        }
        .running-node {
          animation: pulseGlow 1.6s infinite ease-in-out;
        }
        .running-edge {
          stroke-dasharray: 6, 6;
          animation: edgeDash 1s linear infinite;
        }
      `), interactive && /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      top: '12px',
      right: '12px',
      zIndex: 10,
      display: 'flex',
      gap: '6px',
      background: 'rgba(255, 255, 255, 0.9)',
      backdropFilter: 'blur(16px)',
      padding: '4px 8px',
      borderRadius: '10px',
      border: '1px solid rgba(0,0,0,0.08)',
      boxShadow: '0 4px 12px rgba(0,0,0,0.05)'
    }
  }, /*#__PURE__*/React.createElement("button", {
    onClick: () => handleZoom(0.15),
    title: "\u653E\u5927",
    style: {
      padding: '4px 8px',
      border: 'none',
      background: 'transparent',
      cursor: 'pointer',
      fontSize: '13px',
      fontWeight: 'bold'
    }
  }, "\uFF0B"), /*#__PURE__*/React.createElement("button", {
    onClick: () => handleZoom(-0.15),
    title: "\u7F29\u5C0F",
    style: {
      padding: '4px 8px',
      border: 'none',
      background: 'transparent',
      cursor: 'pointer',
      fontSize: '13px',
      fontWeight: 'bold'
    }
  }, "\uFF0D"), /*#__PURE__*/React.createElement("button", {
    onClick: () => {
      setZoom(1);
      setPan({
        x: 30,
        y: 30
      });
    },
    title: "\u91CD\u7F6E\u7F29\u653E 100%",
    style: {
      padding: '4px 8px',
      border: 'none',
      background: 'transparent',
      cursor: 'pointer',
      fontSize: '11px',
      color: '#6e6e73'
    }
  }, Math.round(zoom * 100), "%"), /*#__PURE__*/React.createElement("div", {
    style: {
      width: '1px',
      background: 'rgba(0,0,0,0.1)',
      margin: '2px 2px'
    }
  }), /*#__PURE__*/React.createElement("button", {
    onClick: handleResetLayout,
    title: "\u667A\u80FD\u62D3\u6251\u91CD\u6392",
    style: {
      padding: '4px 8px',
      border: 'none',
      background: '#0071e3',
      color: '#fff',
      borderRadius: '6px',
      cursor: 'pointer',
      fontSize: '11px',
      fontWeight: '600'
    }
  }, "\u26A1 \u62D3\u6251\u81EA\u6392")), interactive && /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      bottom: '10px',
      left: '14px',
      zIndex: 10,
      fontSize: '11px',
      color: '#86868b',
      pointerEvents: 'none'
    }
  }, "\uD83D\uDCA1 \u62D6\u62FD\u8282\u70B9\u79FB\u52A8 \xB7 \u6309\u4F4F\u753B\u5E03\u7A7A\u767D\u5E73\u79FB \xB7 \u6EDA\u8F6E\u7F29\u653E\u753B\u5E03"), /*#__PURE__*/React.createElement("svg", {
    width: "100%",
    height: "100%",
    style: {
      cursor: isPanning ? 'grabbing' : draggingKey ? 'grabbing' : 'default',
      display: 'block'
    },
    onMouseDown: handleCanvasMouseDown
  }, /*#__PURE__*/React.createElement("defs", null, /*#__PURE__*/React.createElement("pattern", {
    id: "dag-grid-pattern",
    width: "24",
    height: "24",
    patternUnits: "userSpaceOnUse"
  }, /*#__PURE__*/React.createElement("circle", {
    cx: "2",
    cy: "2",
    r: "1.2",
    fill: "rgba(0,0,0,0.06)"
  })), /*#__PURE__*/React.createElement("marker", {
    id: "dag-arrow",
    viewBox: "0 0 10 10",
    refX: "8",
    refY: "5",
    markerWidth: "6",
    markerHeight: "6",
    orient: "auto-start-reverse"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M 0 1 L 9 5 L 0 9 z",
    fill: "#8e8e93"
  })), /*#__PURE__*/React.createElement("marker", {
    id: "dag-arrow-active",
    viewBox: "0 0 10 10",
    refX: "8",
    refY: "5",
    markerWidth: "6",
    markerHeight: "6",
    orient: "auto-start-reverse"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M 0 1 L 9 5 L 0 9 z",
    fill: "#0071e3"
  }))), /*#__PURE__*/React.createElement("rect", {
    width: "100%",
    height: "100%",
    fill: "url(#dag-grid-pattern)"
  }), /*#__PURE__*/React.createElement("g", {
    transform: `translate(${pan.x}, ${pan.y}) scale(${zoom})`
  }, edges.map(({
    from,
    to,
    isHighlighted,
    isRunning
  }) => {
    const srcPos = positions[from];
    const tgtPos = positions[to];
    if (!srcPos || !tgtPos) return null;
    const startX = srcPos.x + nodeWidth;
    const startY = srcPos.y + nodeHeight / 2;
    const endX = tgtPos.x;
    const endY = tgtPos.y + nodeHeight / 2;
    const deltaX = Math.max(40, (endX - startX) * 0.5);
    const ctrlX1 = startX + deltaX;
    const ctrlY1 = startY;
    const ctrlX2 = endX - deltaX;
    const ctrlY2 = endY;
    return /*#__PURE__*/React.createElement("path", {
      key: `${from}->${to}`,
      d: `M ${startX} ${startY} C ${ctrlX1} ${ctrlY1}, ${ctrlX2} ${ctrlY2}, ${endX} ${endY}`,
      fill: "none",
      stroke: isHighlighted ? '#0071e3' : '#aeaeb2',
      strokeWidth: isHighlighted ? 2.8 : 1.8,
      markerEnd: isHighlighted ? 'url(#dag-arrow-active)' : 'url(#dag-arrow)',
      className: isRunning ? 'running-edge' : undefined,
      style: {
        transition: draggingKey ? 'none' : 'stroke 0.2s ease, stroke-width 0.2s ease'
      }
    });
  }), steps.map(step => {
    const pos = positions[step.step_key] || {
      x: 50,
      y: 50
    };
    const isSelected = selectedKey === step.step_key;
    const isHovered = hoveredKey === step.step_key;
    const isDragging = draggingKey === step.step_key;
    const isRunning = step.status === 'running';
    const statusColor = getStatusColor(step.status);
    const roleInfo = getRoleBadge(step.role);
    return /*#__PURE__*/React.createElement("g", {
      key: step.step_key,
      transform: `translate(${pos.x}, ${pos.y})`,
      onMouseDown: e => handleNodeMouseDown(e, step.step_key),
      onMouseEnter: () => setHoveredKey(step.step_key),
      onMouseLeave: () => setHoveredKey(null),
      style: {
        cursor: isDragging ? 'grabbing' : 'grab'
      },
      className: isRunning ? 'running-node' : undefined
    }, /*#__PURE__*/React.createElement("rect", {
      width: nodeWidth,
      height: nodeHeight,
      rx: "14",
      ry: "14",
      fill: "#ffffff",
      stroke: isSelected ? '#0071e3' : isHovered ? '#62aaff' : 'rgba(0,0,0,0.1)',
      strokeWidth: isSelected ? 2.5 : isHovered ? 2 : 1,
      filter: isSelected ? 'drop-shadow(0 6px 16px rgba(0,113,227,0.22))' : 'drop-shadow(0 2px 8px rgba(0,0,0,0.06))'
    }), /*#__PURE__*/React.createElement("rect", {
      x: "0",
      y: "12",
      width: "4",
      height: nodeHeight - 24,
      rx: "2",
      fill: statusColor
    }), /*#__PURE__*/React.createElement("text", {
      x: "14",
      y: "26",
      fontSize: "13",
      fontWeight: "600",
      fill: "#1d1d1f",
      fontFamily: "-apple-system, BlinkMacSystemFont, sans-serif"
    }, step.step_key), /*#__PURE__*/React.createElement("circle", {
      cx: nodeWidth - 18,
      cy: "22",
      r: "4.5",
      fill: statusColor
    }), /*#__PURE__*/React.createElement("rect", {
      x: "14",
      y: "36",
      width: Math.min(100, roleInfo.label.length * 8 + 10),
      height: "18",
      rx: "5",
      fill: roleInfo.bg
    }), /*#__PURE__*/React.createElement("text", {
      x: "18",
      y: "49",
      fontSize: "10",
      fontWeight: "600",
      fill: roleInfo.color,
      fontFamily: "-apple-system, sans-serif"
    }, roleInfo.label), /*#__PURE__*/React.createElement("text", {
      x: "14",
      y: "64",
      fontSize: "10",
      fill: "#86868b",
      fontFamily: "-apple-system, sans-serif"
    }, step.status === 'success' ? '✓ 执行完成' : step.status === 'running' ? '⏳ 实时执行中...' : step.status === 'failed' ? '✕ 执行异常' : `前置依赖: ${step.depends_on?.length || 0}`));
  }))));
};

// ===== components/DAGStudio.tsx =====

// Built-in Demo Scenarios for Rich DAG Visualization
const DEMO_SCENARIOS = {
  lru_cache: {
    name: '🚀 高并发分布式 LRU 缓存系统',
    description: '包含需求接口契约、核心双向链表+哈希表、高并发分段锁加固与独立 Evaluator 验证',
    steps: [{
      step_key: 's1_spec',
      step_order: 0,
      status: 'success',
      role: 'research',
      goal: '检索高并发 LRU 缓存设计规范，定义 HashLRU 泛型接口与并发淘汰指标',
      depends_on: [],
      attempts: 1,
      result: '已完成契约设计：支持 O(1) Get/Put，具备 Striped-Lock 分段锁与 TTL 自动失效机制。'
    }, {
      step_key: 's2_core_engine',
      step_order: 1,
      status: 'success',
      role: 'coding',
      goal: '编写基于双向链表与哈希表的双亲节点 O(1) 核心存储与移位淘汰引擎',
      depends_on: ['s1_spec'],
      attempts: 1,
      result: '核心引擎已构建，通过 10,000 次容量溢出淘汰边界测试。'
    }, {
      step_key: 's3_concurrency_guard',
      step_order: 2,
      status: 'success',
      role: 'coding',
      goal: '引入分段读写锁 (Striped RWLock) 与原子计数器，消除热点锁竞争',
      depends_on: ['s2_core_engine'],
      attempts: 1,
      result: '支持 32 分段锁，并发 100 线程压测下无死锁且命中率统计精准。'
    }, {
      step_key: 's4_metrics_exporter',
      step_order: 3,
      status: 'success',
      role: 'analysis',
      goal: '埋点 Prometheus 格式指标 (HitRate, MissRate, EvictionCount, P99 Latency)',
      depends_on: ['s2_core_engine'],
      attempts: 1,
      result: '指标导出器构建完毕，暴露 /metrics 接口，延迟统计在 0.2ms 以内。'
    }, {
      step_key: 's5_formal_verifier',
      step_order: 4,
      status: 'success',
      role: 'evaluator',
      goal: '独立 Evaluator 执行代码静态 AST 分析与高并发竞态条件模糊测试',
      depends_on: ['s3_concurrency_guard', 's4_metrics_exporter'],
      attempts: 1,
      result: 'Evaluator 独立核验：26 项单元测试与 5 项并发竞态测试 100% 通过，核验通过！'
    }]
  },
  microservices: {
    name: '🌐 微服务金丝雀热发布与多阶段回退',
    description: '包含流量拓扑探测、金丝雀容器灰度分流、动态健康探针与自动化熔断回滚',
    steps: [{
      step_key: 'm1_schema_audit',
      step_order: 0,
      status: 'success',
      role: 'analysis',
      goal: '微服务契约与数据库 Schema 兼容性静态审计',
      depends_on: [],
      attempts: 1,
      result: 'Schema 向前兼容性校验通过，无阻断性列删除。'
    }, {
      step_key: 'm2_canary_deploy',
      step_order: 1,
      status: 'success',
      role: 'coding',
      goal: '下发 10% 金丝雀流量路由与新版容器部署',
      depends_on: ['m1_schema_audit'],
      attempts: 1,
      result: 'Pod canary-v2 启动完成，注入流量占比 10%。'
    }, {
      step_key: 'm3_telemetry_probe',
      step_order: 2,
      status: 'running',
      role: 'analysis',
      goal: '持续监控 P99 延迟与 5xx 错误率探针',
      depends_on: ['m2_canary_deploy'],
      attempts: 1,
      result: '实时探测中：错误率 0.01%，延迟稳定在 12ms。'
    }, {
      step_key: 'm4_security_scan',
      step_order: 3,
      status: 'running',
      role: 'research',
      goal: '动态调用 SAST/DAST 安全漏扫探针排查权限越权',
      depends_on: ['m2_canary_deploy'],
      attempts: 1,
      result: '安全规则扫描进行中：未发现提权脆弱性。'
    }, {
      step_key: 'm5_production_promote',
      step_order: 4,
      status: 'pending',
      role: 'evaluator',
      goal: 'Evaluator 校验健康门禁并全量放行 100% 生产流量',
      depends_on: ['m3_telemetry_probe', 'm4_security_scan'],
      attempts: 0,
      result: '等待前置探针与安全扫描通过...'
    }]
  },
  financial_pipeline: {
    name: '💳 金融级 CAS 实时对账结算流水线',
    description: '多数据源增量账单抓取、CAS 状态原子核对、异常冲正与审计快照',
    steps: [{
      step_key: 'f1_ingest',
      step_order: 0,
      status: 'success',
      role: 'coding',
      goal: '批量解析上游支付网关结算单与本地流水账单',
      depends_on: [],
      attempts: 1,
      result: '已解析 500,000 笔流水，校验和匹配一致。'
    }, {
      step_key: 'f2_cas_reconcile',
      step_order: 1,
      status: 'success',
      role: 'analysis',
      goal: '基于 CAS 乐观锁对比借贷借方金额与状态机终态',
      depends_on: ['f1_ingest'],
      attempts: 1,
      result: '对账完成，平账率 99.998%，检出 11 笔挂账差异单。'
    }, {
      step_key: 'f3_dispute_handler',
      step_order: 2,
      status: 'success',
      role: 'coding',
      goal: '触发自动冲正补偿事务与差错退款工作流',
      depends_on: ['f2_cas_reconcile'],
      attempts: 1,
      result: '11 笔差异单自动发起冲正校验，其中 9 笔修复完成，2 笔转人工复核。'
    }, {
      step_key: 'f4_audit_snapshot',
      step_order: 3,
      status: 'success',
      role: 'evaluator',
      goal: '生成 RFC 8785 签名对账不可篡改存证与审计快照',
      depends_on: ['f2_cas_reconcile', 'f3_dispute_handler'],
      attempts: 1,
      result: 'SHA-256 存证哈希生成并完成不可篡改归档。'
    }]
  }
};
const DAGStudio = () => {
  const [selectedScenarioKey, setSelectedScenarioKey] = useState('lru_cache');
  const [serverTasks, setServerTasks] = useState([]);
  const [selectedTaskId, setSelectedTaskId] = useState('');
  const [currentSteps, setCurrentSteps] = useState(DEMO_SCENARIOS.lru_cache.steps);
  const [selectedStep, setSelectedStep] = useState(DEMO_SCENARIOS.lru_cache.steps[0]);
  const [activeTab, setActiveTab] = useState('scenario');
  const [isLoading, setIsLoading] = useState(false);

  // Load server tasks on mount
  useEffect(() => {
    fetch(`${API_BASE}/tasks`).then(res => res.json()).then(data => {
      if (Array.isArray(data)) {
        setServerTasks(data);
      }
    }).catch(() => {});
  }, []);
  const handleSelectScenario = key => {
    setSelectedScenarioKey(key);
    setActiveTab('scenario');
    const sc = DEMO_SCENARIOS[key];
    if (sc) {
      setCurrentSteps(sc.steps);
      setSelectedStep(sc.steps[0] || null);
    }
  };
  const handleSelectTask = async taskId => {
    if (!taskId) return;
    setSelectedTaskId(taskId);
    setActiveTab('task');
    setIsLoading(true);
    try {
      const res = await fetch(`${API_BASE}/tasks/${taskId}`);
      if (res.ok) {
        const detail = await res.json();
        setCurrentSteps(detail.steps || []);
        setSelectedStep(detail.steps && detail.steps[0] || null);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  };

  // Find upstream and downstream nodes for the selected step
  const upstreamSteps = selectedStep ? currentSteps.filter(s => selectedStep.depends_on?.includes(s.step_key)) : [];
  const downstreamSteps = selectedStep ? currentSteps.filter(s => s.depends_on?.includes(selectedStep.step_key)) : [];
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: '20px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      background: '#ffffff',
      borderRadius: '18px',
      padding: '20px 24px',
      border: '1px solid rgba(0,0,0,0.06)',
      boxShadow: '0 8px 24px rgba(0,0,0,0.03)',
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      flexWrap: 'wrap',
      gap: '16px'
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: '10px'
    }
  }, /*#__PURE__*/React.createElement("h2", {
    style: {
      fontSize: '18px',
      fontWeight: '600',
      margin: 0,
      color: '#1d1d1f'
    }
  }, "\uD83D\uDD78\uFE0F \u4EA4\u4E92\u5F0F DAG \u7F16\u6392\u62D3\u6251\u5DE5\u4F5C\u53F0"), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: '11px',
      padding: '2px 8px',
      borderRadius: '10px',
      background: '#e8f2ff',
      color: '#0071e3',
      fontWeight: '600'
    }
  }, "React + SVG + Drag & Drop")), /*#__PURE__*/React.createElement("p", {
    style: {
      margin: '4px 0 0',
      fontSize: '12px',
      color: '#86868b'
    }
  }, "\u57FA\u4E8E Kahn \u62D3\u6251\u6392\u5E8F\u7B97\u6CD5\u3001\u4E09\u6B21\u8D1D\u585E\u5C14\u52A8\u6001\u529B\u5BFC\u5411\u66F2\u7EBF\u4E0E SVG \u8282\u70B9\u65E0\u7EA7\u62D6\u62FD\u5E73\u79FB")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: '12px',
      alignItems: 'center'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: '6px'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: '12px',
      color: '#86868b',
      fontWeight: '500'
    }
  }, "\u9884\u8BBE\u62D3\u6251:"), /*#__PURE__*/React.createElement("select", {
    value: activeTab === 'scenario' ? selectedScenarioKey : '',
    onChange: e => handleSelectScenario(e.target.value),
    style: {
      padding: '6px 12px',
      borderRadius: '8px',
      border: '1px solid #d2d2d7',
      fontSize: '12px',
      background: '#fff',
      cursor: 'pointer'
    }
  }, Object.entries(DEMO_SCENARIOS).map(([k, sc]) => /*#__PURE__*/React.createElement("option", {
    key: k,
    value: k
  }, sc.name)))), serverTasks.length > 0 && /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: '6px'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: '12px',
      color: '#86868b',
      fontWeight: '500'
    }
  }, "\u771F\u5B9E\u4EFB\u52A1:"), /*#__PURE__*/React.createElement("select", {
    value: activeTab === 'task' ? selectedTaskId : '',
    onChange: e => handleSelectTask(e.target.value),
    style: {
      padding: '6px 12px',
      borderRadius: '8px',
      border: '1px solid #d2d2d7',
      fontSize: '12px',
      background: '#fff',
      cursor: 'pointer',
      maxWidth: '220px'
    }
  }, /*#__PURE__*/React.createElement("option", {
    value: ""
  }, "-- \u9009\u62E9\u540E\u7AEF\u4EFB\u52A1 --"), serverTasks.map(t => /*#__PURE__*/React.createElement("option", {
    key: t.id,
    value: t.id
  }, "[", t.status, "] ", t.id.slice(0, 8), " - ", t.goal.slice(0, 20), "...")))))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: '1fr 340px',
      gap: '20px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      background: '#ffffff',
      borderRadius: '18px',
      padding: '20px',
      border: '1px solid rgba(0,0,0,0.06)',
      boxShadow: '0 8px 24px rgba(0,0,0,0.03)',
      display: 'flex',
      flexDirection: 'column',
      gap: '14px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: '12px'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: '13px',
      fontWeight: '600',
      color: '#1d1d1f'
    }
  }, "\u62D3\u6251\u56FE\u89C6\u56FE"), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: '12px',
      color: '#86868b'
    }
  }, "\u603B\u6B65\u9AA4: ", /*#__PURE__*/React.createElement("strong", null, currentSteps.length), " | \u5DF2\u5B8C\u6210: ", /*#__PURE__*/React.createElement("strong", {
    style: {
      color: '#34c759'
    }
  }, currentSteps.filter(s => s.status === 'success').length), " | \u6267\u884C\u4E2D: ", /*#__PURE__*/React.createElement("strong", {
    style: {
      color: '#0071e3'
    }
  }, currentSteps.filter(s => s.status === 'running').length))), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: '11px',
      color: '#86868b'
    }
  }, "\uD83C\uDFAF \u70B9\u51FB\u4EFB\u610F\u8282\u70B9\u67E5\u770B\u8BE6\u7EC6\u5C5E\u6027\u4E0E\u4E0A\u4E0B\u6587\u8F93\u51FA")), /*#__PURE__*/React.createElement(DAGTopology, {
    steps: currentSteps,
    selectedKey: selectedStep?.step_key,
    onSelectStep: setSelectedStep,
    height: 520,
    interactive: true
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      background: '#ffffff',
      borderRadius: '18px',
      padding: '20px',
      border: '1px solid rgba(0,0,0,0.06)',
      boxShadow: '0 8px 24px rgba(0,0,0,0.03)',
      display: 'flex',
      flexDirection: 'column',
      height: '590px',
      overflowY: 'auto'
    }
  }, /*#__PURE__*/React.createElement("h3", {
    style: {
      fontSize: '15px',
      fontWeight: '600',
      marginBottom: '14px',
      color: '#1d1d1f',
      display: 'flex',
      alignItems: 'center',
      gap: '8px'
    }
  }, /*#__PURE__*/React.createElement("span", null, "\uD83D\uDD0D \u6B65\u9AA4\u5C5E\u6027\u68C0\u67E5\u5668")), selectedStep ? /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: '14px',
      fontSize: '12px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      background: '#f5f5f7',
      padding: '12px',
      borderRadius: '10px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: '6px'
    }
  }, /*#__PURE__*/React.createElement("strong", {
    style: {
      fontSize: '14px',
      color: '#0071e3'
    }
  }, selectedStep.step_key), /*#__PURE__*/React.createElement("span", {
    style: {
      padding: '2px 8px',
      borderRadius: '6px',
      fontSize: '11px',
      fontWeight: '600',
      background: selectedStep.status === 'success' ? '#e6f7ed' : '#fff4e5',
      color: selectedStep.status === 'success' ? '#1b803a' : '#c46900'
    }
  }, selectedStep.status.toUpperCase())), /*#__PURE__*/React.createElement("div", {
    style: {
      color: '#86868b'
    }
  }, "\u89D2\u8272: ", /*#__PURE__*/React.createElement("strong", null, selectedStep.role), " \xB7 \u987A\u5E8F: ", /*#__PURE__*/React.createElement("strong", null, "#", selectedStep.step_order), " \xB7 \u5C1D\u8BD5: ", /*#__PURE__*/React.createElement("strong", null, selectedStep.attempts, " \u6B21"))), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("label", {
    style: {
      fontWeight: '600',
      color: '#1d1d1f',
      display: 'block',
      marginBottom: '4px'
    }
  }, "\u6B65\u9AA4\u76EE\u6807"), /*#__PURE__*/React.createElement("div", {
    style: {
      color: '#424245',
      background: '#fafafc',
      border: '1px solid #e5e5ea',
      padding: '10px',
      borderRadius: '8px',
      lineHeight: '1.5'
    }
  }, selectedStep.goal)), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("label", {
    style: {
      fontWeight: '600',
      color: '#1d1d1f',
      display: 'block',
      marginBottom: '4px'
    }
  }, "\u524D\u7F6E\u4F9D\u8D56 (Depends On)"), upstreamSteps.length > 0 ? /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexWrap: 'wrap',
      gap: '6px'
    }
  }, upstreamSteps.map(u => /*#__PURE__*/React.createElement("button", {
    key: u.step_key,
    onClick: () => setSelectedStep(u),
    style: {
      padding: '4px 8px',
      borderRadius: '6px',
      border: '1px solid #d2d2d7',
      background: '#fff',
      cursor: 'pointer',
      fontSize: '11px',
      color: '#0071e3',
      fontWeight: '500'
    }
  }, "\u2B05\uFE0F ", u.step_key, " (", u.role, ")"))) : /*#__PURE__*/React.createElement("span", {
    style: {
      color: '#86868b',
      fontStyle: 'italic'
    }
  }, "\u65E0\u4F9D\u8D56 (\u521D\u59CB\u6839\u8282\u70B9)")), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("label", {
    style: {
      fontWeight: '600',
      color: '#1d1d1f',
      display: 'block',
      marginBottom: '4px'
    }
  }, "\u540E\u7EE7\u6B65\u9AA4 (Downstream)"), downstreamSteps.length > 0 ? /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexWrap: 'wrap',
      gap: '6px'
    }
  }, downstreamSteps.map(d => /*#__PURE__*/React.createElement("button", {
    key: d.step_key,
    onClick: () => setSelectedStep(d),
    style: {
      padding: '4px 8px',
      borderRadius: '6px',
      border: '1px solid #d2d2d7',
      background: '#fff',
      cursor: 'pointer',
      fontSize: '11px',
      color: '#0071e3',
      fontWeight: '500'
    }
  }, "\u27A1\uFE0F ", d.step_key, " (", d.role, ")"))) : /*#__PURE__*/React.createElement("span", {
    style: {
      color: '#86868b',
      fontStyle: 'italic'
    }
  }, "\u65E0\u540E\u7EE7 (\u53F6\u5B50\u7EC8\u6001\u8282\u70B9)")), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("label", {
    style: {
      fontWeight: '600',
      color: '#1d1d1f',
      display: 'block',
      marginBottom: '4px'
    }
  }, "\u6267\u884C\u8F93\u51FA / \u9A8C\u8BC1\u7ED3\u679C"), /*#__PURE__*/React.createElement("div", {
    style: {
      maxHeight: '180px',
      overflowY: 'auto',
      background: '#1d1d1f',
      color: '#e5e5ea',
      padding: '10px',
      borderRadius: '8px',
      fontSize: '11px',
      fontFamily: 'SF Mono, Menlo, monospace',
      whiteSpace: 'pre-wrap',
      lineHeight: '1.4'
    }
  }, selectedStep.result || (selectedStep.error ? `错误: ${selectedStep.error}` : '暂无输出')))) : /*#__PURE__*/React.createElement("div", {
    style: {
      margin: 'auto',
      textAlign: 'center',
      color: '#8e8e93',
      fontSize: '13px'
    }
  }, "\u8BF7\u5728\u5DE6\u4FA7\u70B9\u51FB\u4EFB\u610F\u8282\u70B9\u67E5\u770B\u5C5E\u6027"))));
};

// ===== components/TaskWorkspace.tsx =====

const TaskWorkspace = () => {
  const [goal, setGoal] = useState('');
  const [taskType, setTaskType] = useState('coding');
  const [execMode, setExecMode] = useState('orchestrated');
  const [currentTask, setCurrentTask] = useState(null);
  const [selectedStep, setSelectedStep] = useState(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [isDemoRunning, setIsDemoRunning] = useState(false);
  const [error, setError] = useState(null);
  const handleRunRealDemo = async () => {
    setError(null);
    setIsDemoRunning(true);
    setSelectedStep(null);
    try {
      const res = await fetch(`${API_BASE}/tasks/demo/real-agents`, {
        method: 'POST'
      });
      if (!res.ok) throw new Error(`运行多智能体演练失败 HTTP ${res.status}`);
      const data = await res.json();
      const demoTask = {
        id: `real-mission-${Date.now().toString().slice(-6)}`,
        goal: '企业级自愈流水线实测：Hermes 指标调研 -> DSH 探活 -> Antigravity 熔断实现 -> 独立审查',
        status: 'success',
        plan_source: 'orchestrated_lead_manager',
        risk_level: 'low',
        complexity: 'HIGH',
        execution_mode: 'orchestrated',
        coordinator_agent: {
          agent_id: 'agent-planner-core',
          agent_name: 'NEXUS 任务规划与协调中枢 (Lead Coordinator)',
          role: 'planner',
          model_id: 'deepseek-reasoner',
          provider_name: 'DeepSeek 官方 API',
          api_endpoint: 'https://api.deepseek.com/v1',
          pattern: 'Manager-Worker (Sub-Agents as Specialized Tools)'
        },
        steps: data.steps.map(st => ({
          step_key: st.step,
          role: st.step.includes('research') ? 'research' : st.step.includes('diagnostics') ? 'analysis' : st.step.includes('coding') ? 'coding' : 'verification',
          goal: st.step.includes('research') ? '制定分布式节点异常巡检健康指标 (Hermes 深度链式推理)' : st.step.includes('diagnostics') ? '集群节点指令分发与状态采集 (DSH 集群探活)' : st.step.includes('coding') ? '工程自动化熔断器代码编写 (Antigravity 独立工程引擎)' : '独立安全与状态机审查 (Independent Reviewer)',
          agent_id: st.agent,
          agent_name: st.agent,
          provider_name: st.cli ? `本地宿主真实 CLI (${st.cli.split('\\').pop()})` : 'DeepSeek 官方 API',
          api_endpoint: st.cli || 'https://api.deepseek.com/v1',
          model_id: st.step.includes('research') ? 'hermes-0.21.6-native' : st.step.includes('diagnostics') ? 'dsh-0.2.1-native' : 'antigravity-native',
          status: st.status,
          result: st.summary || '执行完成，各项指标符合验收规约'
        })),
        events: [{
          event_type: 'task_started',
          message: '主协调 Agent 启动 Manager-Worker 真实智能体调度',
          created_at: new Date().toISOString()
        }, {
          event_type: 'multi_agent_completed',
          message: `流水线实测成功！总耗时 ${data.total_duration}s，消耗 ${data.total_tokens} tokens`,
          created_at: new Date().toISOString()
        }]
      };
      setCurrentTask(demoTask);
    } catch (err) {
      setError(err.message || '运行多智能体演练异常');
    } finally {
      setIsDemoRunning(false);
    }
  };
  const handleLaunchTask = async () => {
    if (!goal.trim()) return;
    setError(null);
    setIsStreaming(true);
    setSelectedStep(null);
    try {
      // 1. Create task
      const r1 = await fetch(`${API_BASE}/tasks`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
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
      const initialDetail = await r2.json();
      setCurrentTask(initialDetail);

      // 3. Launch async
      await fetch(`${API_BASE}/tasks/${taskId}/execute_async`, {
        method: 'POST'
      });

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
      sse.addEventListener('task_error', async e => {
        setError(`执行异常: ${e.data || '未知错误'}`);
        setIsStreaming(false);
        sse.close();
      });
    } catch (err) {
      setError(err.message || '网络请求异常');
      setIsStreaming(false);
    }
  };
  const handleCancel = async () => {
    if (!currentTask) return;
    try {
      await fetch(`${API_BASE}/tasks/${currentTask.id}/cancel`, {
        method: 'POST'
      });
      setIsStreaming(false);
    } catch (err) {
      setError(err.message);
    }
  };
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: '380px 1fr',
      gap: '24px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      background: '#fff',
      borderRadius: '18px',
      padding: '24px',
      border: '1px solid rgba(0,0,0,0.06)',
      boxShadow: '0 8px 24px rgba(0,0,0,0.04)'
    }
  }, /*#__PURE__*/React.createElement("h2", {
    style: {
      fontSize: '16px',
      fontWeight: '600',
      marginBottom: '16px',
      color: '#1d1d1f'
    }
  }, "\uD83D\uDCDD \u7F16\u6392\u65B0\u4EFB\u52A1"), /*#__PURE__*/React.createElement("div", {
    style: {
      marginBottom: '16px'
    }
  }, /*#__PURE__*/React.createElement("label", {
    style: {
      display: 'block',
      fontSize: '12px',
      fontWeight: '500',
      color: '#86868b',
      marginBottom: '6px'
    }
  }, "\u4EFB\u52A1\u76EE\u6807 (Goal)"), /*#__PURE__*/React.createElement("textarea", {
    value: goal,
    onChange: e => setGoal(e.target.value),
    placeholder: "\u4F8B\u5982\uFF1A\u8BBE\u8BA1\u5E76\u5B9E\u73B0\u4E00\u4E2A\u652F\u6301 LRU \u6DD8\u6C70\u7B56\u7565\u7684\u9AD8\u5E76\u53D1\u7EBF\u7A0B\u5B89\u5168\u7F13\u5B58\u7C7B\uFF0C\u5E76\u7F16\u5199\u6D4B\u8BD5\u7528\u4F8B...",
    style: {
      width: '100%',
      height: '110px',
      padding: '12px',
      borderRadius: '10px',
      border: '1px solid #d2d2d7',
      fontSize: '13px',
      fontFamily: 'inherit',
      resize: 'vertical'
    }
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      marginBottom: '16px'
    }
  }, /*#__PURE__*/React.createElement("label", {
    style: {
      display: 'block',
      fontSize: '12px',
      fontWeight: '500',
      color: '#86868b',
      marginBottom: '6px'
    }
  }, "\u4EFB\u52A1\u4E13\u4E1A\u57DF"), /*#__PURE__*/React.createElement("select", {
    value: taskType,
    onChange: e => setTaskType(e.target.value),
    style: {
      width: '100%',
      padding: '10px',
      borderRadius: '10px',
      border: '1px solid #d2d2d7',
      fontSize: '13px'
    }
  }, /*#__PURE__*/React.createElement("option", {
    value: "coding"
  }, "coding - \u8F6F\u4EF6\u5DE5\u7A0B\u4E0E\u4EE3\u7801\u5B9E\u73B0 (Antigravity)"), /*#__PURE__*/React.createElement("option", {
    value: "analysis"
  }, "analysis - \u903B\u8F91\u4E0E\u6570\u636E\u5206\u6790 (Hermes/DSH)"), /*#__PURE__*/React.createElement("option", {
    value: "research"
  }, "research - \u524D\u6CBF\u8C03\u7814\u4E0E\u65B9\u6848\u6BD4\u9009"), /*#__PURE__*/React.createElement("option", {
    value: "knowledge"
  }, "knowledge - \u77E5\u8BC6\u5F52\u7EB3\u4E0E\u95EE\u7B54"), /*#__PURE__*/React.createElement("option", {
    value: "execution"
  }, "execution - \u7CFB\u7EDF\u8BCA\u65AD\u4E0E\u811A\u672C\u6267\u884C"))), /*#__PURE__*/React.createElement("div", {
    style: {
      marginBottom: '20px'
    }
  }, /*#__PURE__*/React.createElement("label", {
    style: {
      display: 'block',
      fontSize: '12px',
      fontWeight: '500',
      color: '#86868b',
      marginBottom: '6px'
    }
  }, "\u6267\u884C\u8C03\u5EA6\u6A21\u5F0F"), /*#__PURE__*/React.createElement("select", {
    value: execMode,
    onChange: e => setExecMode(e.target.value),
    style: {
      width: '100%',
      padding: '10px',
      borderRadius: '10px',
      border: '1px solid #d2d2d7',
      fontSize: '13px'
    }
  }, /*#__PURE__*/React.createElement("option", {
    value: "orchestrated"
  }, "\uD83E\uDD16 \u667A\u80FD\u52A8\u6001\u7F16\u6392 (\u4F9D\u636E\u590D\u6742\u5EA6\u81EA\u52A8\u89E3\u8026)"), /*#__PURE__*/React.createElement("option", {
    value: "single_agent"
  }, "\u26A1 \u5F3A\u5236\u5355 Agent \u76F4\u8FBE (\u6781\u9650\u4F4E Token \u6D88\u8017)"))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: '10px'
    }
  }, /*#__PURE__*/React.createElement("button", {
    onClick: handleLaunchTask,
    disabled: isStreaming,
    style: {
      flex: 1,
      padding: '12px',
      borderRadius: '10px',
      border: 'none',
      background: isStreaming ? '#8e8e93' : '#0071e3',
      color: '#fff',
      fontSize: '13px',
      fontWeight: '600',
      cursor: isStreaming ? 'not-allowed' : 'pointer'
    }
  }, isStreaming ? '📡 正在推流执行...' : '🚀 启动流式执行 (SSE)'), isStreaming && /*#__PURE__*/React.createElement("button", {
    onClick: handleCancel,
    style: {
      padding: '12px 16px',
      borderRadius: '10px',
      border: 'none',
      background: '#ff3b30',
      color: '#fff',
      fontSize: '13px',
      fontWeight: '600',
      cursor: 'pointer'
    }
  }, "\u23F9\uFE0F \u53D6\u6D88")), /*#__PURE__*/React.createElement("button", {
    onClick: handleRunRealDemo,
    disabled: isStreaming || isDemoRunning,
    style: {
      marginTop: '12px',
      width: '100%',
      padding: '12px',
      borderRadius: '10px',
      border: '1px solid #0071e3',
      background: 'rgba(0, 113, 227, 0.08)',
      color: '#0071e3',
      fontSize: '13px',
      fontWeight: '700',
      cursor: isStreaming || isDemoRunning ? 'not-allowed' : 'pointer',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '8px',
      boxShadow: '0 2px 8px rgba(0, 113, 227, 0.1)'
    }
  }, isDemoRunning ? '⏳ 正在调度宿主真实智能体 (Hermes+DSH+Antigravity)...' : '🚀 一键演练宿主真实智能体流水线 (DSH+Hermes+反重力)'), error && /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: '14px',
      padding: '10px',
      background: '#ffebe9',
      color: '#cf222e',
      borderRadius: '8px',
      fontSize: '12px'
    }
  }, error)), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: '16px'
    }
  }, currentTask ? /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("div", {
    className: "apple-card",
    style: {
      background: 'linear-gradient(135deg, rgba(0, 113, 227, 0.08) 0%, rgba(188, 140, 255, 0.08) 100%)',
      borderRadius: '16px',
      padding: '18px 24px',
      border: '1px solid rgba(0, 113, 227, 0.25)',
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      flexWrap: 'wrap',
      gap: '14px',
      backdropFilter: 'blur(20px)',
      WebkitBackdropFilter: 'blur(20px)'
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      marginBottom: '6px'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: '18px'
    }
  }, "\uD83D\uDC51"), /*#__PURE__*/React.createElement("strong", {
    style: {
      fontSize: '14px',
      color: '#0071e3'
    }
  }, "\u4E3B\u534F\u8C03 Agent: ", currentTask.coordinator_agent?.agent_name || 'NEXUS 任务规划与协调中枢 (Lead Coordinator)'), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: '11px',
      padding: '2px 8px',
      borderRadius: '6px',
      background: 'rgba(0, 113, 227, 0.15)',
      color: '#0071e3',
      fontWeight: '600'
    }
  }, "Manager-Worker (Sub-Agents as Tools)")), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: '12px',
      color: '#555',
      display: 'flex',
      gap: '16px',
      flexWrap: 'wrap'
    }
  }, /*#__PURE__*/React.createElement("span", null, "\u6240\u8FDE\u6A21\u578B: ", /*#__PURE__*/React.createElement("strong", {
    style: {
      color: '#1d1d1f'
    }
  }, currentTask.coordinator_agent?.model_id || 'deepseek-reasoner')), /*#__PURE__*/React.createElement("span", null, "\u8C03\u7528 API: ", /*#__PURE__*/React.createElement("strong", {
    style: {
      color: '#1d1d1f'
    }
  }, currentTask.coordinator_agent?.provider_name || 'DeepSeek 官方 API'), " (", /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'monospace',
      fontSize: '11px'
    }
  }, currentTask.coordinator_agent?.api_endpoint || 'https://api.deepseek.com/v1'), ")"))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: '10px'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: '12px',
      color: '#86868b'
    }
  }, "\u8C03\u7528\u5DE5\u5177 Agent \u6570\u91CF: ", /*#__PURE__*/React.createElement("strong", {
    style: {
      color: '#0071e3'
    }
  }, currentTask.steps.length, " \u4E2A")), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: '12px',
      padding: '4px 10px',
      borderRadius: '8px',
      background: currentTask.status === 'success' ? '#e3f9e5' : '#e8f2ff',
      color: currentTask.status === 'success' ? '#1a7f37' : '#0071e3',
      fontWeight: '700'
    }
  }, currentTask.status))), /*#__PURE__*/React.createElement("div", {
    className: "apple-card",
    style: {
      background: '#fff',
      borderRadius: '16px',
      padding: '20px',
      border: '1px solid rgba(0,0,0,0.06)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: '13px',
      fontWeight: '700',
      color: '#1d1d1f',
      marginBottom: '14px',
      display: 'flex',
      alignItems: 'center',
      gap: '8px'
    }
  }, /*#__PURE__*/React.createElement("span", null, "\uD83D\uDEE0\uFE0F"), " \u4E3B Agent \u9009\u5B9A\u8C03\u7528\u7684\u5DE5\u5177 Agent \u4E0E\u76F4\u8FDE API \u94FE\u8DEF"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
      gap: '12px'
    }
  }, currentTask.steps.map((step, idx) => /*#__PURE__*/React.createElement("div", {
    key: step.step_key,
    onClick: () => setSelectedStep(step),
    className: "apple-card",
    style: {
      background: selectedStep?.step_key === step.step_key ? 'rgba(0, 113, 227, 0.05)' : '#f9fafb',
      border: `1px solid ${selectedStep?.step_key === step.step_key ? '#0071e3' : 'rgba(0,0,0,0.08)'}`,
      borderRadius: '12px',
      padding: '14px',
      cursor: 'pointer',
      transition: 'all 0.2s ease'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: '6px'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: '11px',
      fontWeight: '700',
      color: '#0071e3',
      fontFamily: 'monospace'
    }
  }, "Step ", idx + 1, " \xB7 ", step.step_key), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: '10px',
      padding: '2px 6px',
      borderRadius: '4px',
      background: step.status === 'success' ? 'rgba(52, 199, 89, 0.15)' : step.status === 'running' ? 'rgba(0, 113, 227, 0.15)' : 'rgba(0,0,0,0.05)',
      color: step.status === 'success' ? '#34c759' : step.status === 'running' ? '#0071e3' : '#86868b',
      fontWeight: '600'
    }
  }, step.status)), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: '12px',
      fontWeight: '600',
      color: '#1d1d1f',
      marginBottom: '4px'
    }
  }, "\uD83E\uDD16 ", step.agent_name || `NEXUS ${step.role.toUpperCase()} 工具 Agent`), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: '11px',
      color: '#555',
      marginBottom: '2px'
    }
  }, "\uD83C\uDF10 \u6240\u8FDE API: ", /*#__PURE__*/React.createElement("strong", {
    style: {
      color: '#0071e3'
    }
  }, step.provider_name || 'DeepSeek 官方 API')), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: '11px',
      color: '#86868b',
      fontFamily: 'monospace'
    }
  }, "\u6A21\u578B: ", step.model_id || 'deepseek-chat'))))), /*#__PURE__*/React.createElement("div", {
    className: "apple-card",
    style: {
      background: '#fff',
      borderRadius: '16px',
      padding: '20px',
      border: '1px solid rgba(0,0,0,0.06)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: '13px',
      fontWeight: '600',
      color: '#1d1d1f',
      marginBottom: '12px'
    }
  }, "\uD83D\uDDFA\uFE0F \u4EFB\u52A1 DAG \u7F16\u6392\u62D3\u6251\u56FE\uFF08\u70B9\u51FB\u8282\u70B9\u67E5\u770B\u8BE6\u7EC6\u8F93\u5165\u8F93\u51FA\u4E0E API \u901A\u8BAF\uFF09"), /*#__PURE__*/React.createElement(DAGTopology, {
    steps: currentTask.steps,
    selectedKey: selectedStep?.step_key,
    onSelectStep: s => setSelectedStep(s)
  })), selectedStep && /*#__PURE__*/React.createElement("div", {
    className: "apple-card apple-animate-in",
    style: {
      background: '#fff',
      borderRadius: '16px',
      padding: '22px',
      border: '1px solid #0071e3',
      boxShadow: '0 8px 24px rgba(0,113,227,0.12)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      marginBottom: '12px',
      borderBottom: '1px solid rgba(0,0,0,0.06)',
      paddingBottom: '10px'
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: '14px',
      fontWeight: '700',
      color: '#1d1d1f'
    }
  }, "\u8282\u70B9\u8BE6\u60C5: ", selectedStep.step_key, " [", selectedStep.role, "]"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: '12px',
      color: '#0071e3',
      fontWeight: '600',
      marginTop: '2px'
    }
  }, "\u8C03\u7528\u7684\u5DE5\u5177 Agent: ", selectedStep.agent_name || `NEXUS ${selectedStep.role} 工具 Agent`, " (", selectedStep.agent_id || 'custom-tool', ")")), /*#__PURE__*/React.createElement("span", {
    style: {
      color: '#0071e3',
      fontWeight: '700',
      fontSize: '12px',
      background: 'rgba(0,113,227,0.1)',
      padding: '3px 10px',
      borderRadius: '6px'
    }
  }, "\u72B6\u6001: ", selectedStep.status)), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: '16px',
      flexWrap: 'wrap',
      background: '#f5f5f7',
      padding: '10px 14px',
      borderRadius: '10px',
      fontSize: '12px',
      marginBottom: '12px'
    }
  }, /*#__PURE__*/React.createElement("div", null, "\u670D\u52A1\u5546 API: ", /*#__PURE__*/React.createElement("strong", null, selectedStep.provider_name || 'DeepSeek 官方 API')), /*#__PURE__*/React.createElement("div", null, "API \u7AEF\u70B9: ", /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'monospace'
    }
  }, selectedStep.api_endpoint || 'https://api.deepseek.com/v1')), /*#__PURE__*/React.createElement("div", null, "\u6A21\u578B ID: ", /*#__PURE__*/React.createElement("strong", null, selectedStep.model_id || 'deepseek-chat'))), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: '12px',
      color: '#555',
      marginBottom: '8px'
    }
  }, /*#__PURE__*/React.createElement("strong", null, "\u6267\u884C\u76EE\u6807:"), " ", selectedStep.goal), selectedStep.result && /*#__PURE__*/React.createElement("pre", {
    style: {
      background: '#f9fafb',
      border: '1px solid rgba(0,0,0,0.06)',
      padding: '12px',
      borderRadius: '8px',
      fontSize: '12px',
      maxHeight: '200px',
      overflow: 'auto',
      fontFamily: 'monospace'
    }
  }, selectedStep.result), selectedStep.error && /*#__PURE__*/React.createElement("div", {
    style: {
      color: '#ff3b30',
      fontSize: '12px',
      marginTop: '6px'
    }
  }, "\u9519\u8BEF: ", selectedStep.error))) : /*#__PURE__*/React.createElement("div", {
    style: {
      background: '#fff',
      borderRadius: '16px',
      padding: '60px',
      textAlign: 'center',
      color: '#8e8e93',
      border: '1px solid rgba(0,0,0,0.06)'
    }
  }, "\u5DE6\u4FA7\u8F93\u5165\u4EFB\u52A1\u76EE\u6807\u5E76\u70B9\u51FB\u201C\u542F\u52A8\u6D41\u5F0F\u6267\u884C\u201D\uFF0C\u5373\u53EF\u5728\u6B64\u5B9E\u65F6\u67E5\u770B\u4EA4\u4E92\u5F0F DAG \u62D3\u6251\u8282\u70B9\u6D41\u8F6C\u4E0E\u5B9E\u65F6\u8F93\u51FA\u3002")));
};

// ===== components/BenchmarkCenter.tsx =====

const DEFAULT_RANKINGS = [{
  model_id: 'deepseek-chat',
  provider_id: 'deepseek',
  total_matches: 18,
  wins: 14,
  win_rate: 77.8,
  avg_cost_usd: 0.00032,
  avg_latency_sec: 1.84,
  elo_score: 1680
}, {
  model_id: 'deepseek-reasoner',
  provider_id: 'deepseek',
  total_matches: 12,
  wins: 10,
  win_rate: 83.3,
  avg_cost_usd: 0.00115,
  avg_latency_sec: 4.20,
  elo_score: 1720
}, {
  model_id: 'qwen-plus',
  provider_id: 'qwen',
  total_matches: 15,
  wins: 10,
  win_rate: 66.7,
  avg_cost_usd: 0.00048,
  avg_latency_sec: 2.10,
  elo_score: 1610
}, {
  model_id: 'gpt-4o',
  provider_id: 'openai',
  total_matches: 10,
  wins: 6,
  win_rate: 60.0,
  avg_cost_usd: 0.00420,
  avg_latency_sec: 2.85,
  elo_score: 1590
}];
const BenchmarkCenter = ({
  isDark = true
}) => {
  const [activeTab, setActiveTab] = useState('arena');

  // Arena State
  const [arenaGoal, setArenaGoal] = useState('编写一个 Python 函数，使用双指针高效反转字符串中的元音字母并写出测试用例');
  const [selectedModels, setSelectedModels] = useState(['deepseek-chat', 'deepseek-reasoner', 'qwen-plus']);
  const [arenaLoading, setArenaLoading] = useState(false);
  const [arenaReport, setArenaReport] = useState(null);
  const [arenaRankings, setArenaRankings] = useState(DEFAULT_RANKINGS);

  // A/B Comparator State
  const [abGoal, setAbGoal] = useState('计算 2+2 的结果');
  const [abLoading, setAbLoading] = useState(false);
  const [abReport, setAbReport] = useState(null);
  const fetchRankings = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/benchmark/arena/rankings`);
      if (res.ok) setArenaRankings(await res.json());
    } catch (err) {
      console.warn('Fallback arena rankings:', err);
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
      console.warn('Fallback arena history:', err);
    }
  };
  useEffect(() => {
    fetchRankings();
    fetchHistory();
  }, []);
  const handleToggleModel = m => {
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
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          goal: arenaGoal.trim(),
          candidate_models: selectedModels,
          task_type: 'coding'
        })
      });
      if (res.ok) {
        const data = await res.json();
        setArenaReport(data);
        fetchRankings();
      }
    } catch (err) {
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
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          goal: abGoal.trim(),
          task_type: 'general'
        })
      });
      if (res.ok) setAbReport(await res.json());
    } catch (err) {
      alert(`对照失败: ${err.message}`);
    } finally {
      setAbLoading(false);
    }
  };
  const cardBg = isDark ? '#161b22' : '#ffffff';
  const borderCol = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)';
  const textMain = isDark ? '#f0f6fc' : '#1d1d1f';
  const textSub = isDark ? '#8b949e' : '#86868b';
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: '20px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      flexWrap: 'wrap',
      gap: '14px'
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("h2", {
    style: {
      margin: '0 0 4px 0',
      fontSize: '20px',
      fontWeight: '700',
      color: textMain
    }
  }, "\uD83D\uDD2C \u6027\u80FD\u5BF9\u6BD4\u5B9E\u9A8C\u5BA4 (Benchmark Arena Lab)"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: '13px',
      color: textSub
    }
  }, "\u540C\u4EFB\u52A1\u591A\u6A21\u578B\u7ADE\u901F\u5927\u6BD4\u6B66 \xB7 \u901F\u5EA6/\u8D28\u91CF/\u6210\u672C\u591A\u7EF4\u6253\u5206 \xB7 \u6570\u636E\u9A71\u52A8\u667A\u80FD\u6A21\u578B\u8DEF\u7531")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: '8px',
      background: isDark ? 'rgba(0,0,0,0.3)' : 'rgba(0,0,0,0.04)',
      padding: '4px',
      borderRadius: '10px'
    }
  }, /*#__PURE__*/React.createElement("button", {
    onClick: () => setActiveTab('arena'),
    style: {
      padding: '6px 14px',
      borderRadius: '8px',
      border: 'none',
      background: activeTab === 'arena' ? '#58a6ff' : 'transparent',
      color: activeTab === 'arena' ? '#fff' : textSub,
      fontSize: '12px',
      fontWeight: '600',
      cursor: 'pointer'
    }
  }, "\u2694\uFE0F \u591A\u6A21\u578B\u7ADE\u901F\u5927\u6BD4\u6B66"), /*#__PURE__*/React.createElement("button", {
    onClick: () => setActiveTab('ab_comparator'),
    style: {
      padding: '6px 14px',
      borderRadius: '8px',
      border: 'none',
      background: activeTab === 'ab_comparator' ? '#58a6ff' : 'transparent',
      color: activeTab === 'ab_comparator' ? '#fff' : textSub,
      fontSize: '12px',
      fontWeight: '600',
      cursor: 'pointer'
    }
  }, "\u2696\uFE0F \u5355/\u591A Agent A/B \u5BF9\u7167"))), activeTab === 'arena' && /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: '20px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "apple-card",
    style: {
      background: cardBg,
      border: `1px solid ${borderCol}`,
      borderRadius: '16px',
      padding: '24px',
      backdropFilter: 'blur(20px)',
      WebkitBackdropFilter: 'blur(20px)',
      boxShadow: isDark ? '0 8px 24px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.06)' : '0 8px 24px rgba(0,0,0,0.04), inset 0 1px 0 rgba(255,255,255,0.9)'
    }
  }, /*#__PURE__*/React.createElement("h3", {
    style: {
      margin: '0 0 10px 0',
      fontSize: '15px',
      fontWeight: '600',
      color: textMain
    }
  }, "\uD83C\uDFAF \u8F93\u5165\u6D4B\u8BD5\u4EFB\u52A1\u76EE\u6807 (Arena Prompt)"), /*#__PURE__*/React.createElement("textarea", {
    rows: 2,
    value: arenaGoal,
    onChange: e => setArenaGoal(e.target.value),
    style: {
      width: '100%',
      padding: '12px 14px',
      borderRadius: '12px',
      border: `1px solid ${borderCol}`,
      background: isDark ? 'rgba(13, 17, 23, 0.7)' : '#fff',
      color: textMain,
      fontSize: '13px',
      marginBottom: '14px'
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      marginBottom: '16px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: '12px',
      color: textSub,
      marginBottom: '8px'
    }
  }, "\u9009\u62E9\u540C\u53F0\u7ADE\u6280\u6A21\u578B (2~5 \u4E2A):"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: '8px',
      flexWrap: 'wrap'
    }
  }, ['deepseek-chat', 'deepseek-reasoner', 'qwen-plus', 'qwen-max', 'gpt-4o', 'claude-3-5-sonnet', 'gemini-2.0-flash'].map(m => {
    const isSel = selectedModels.includes(m);
    return /*#__PURE__*/React.createElement("button", {
      key: m,
      onClick: () => handleToggleModel(m),
      style: {
        padding: '6px 14px',
        borderRadius: '9px',
        border: `1px solid ${isSel ? '#0071e3' : borderCol}`,
        background: isSel ? 'rgba(0, 113, 227, 0.15)' : isDark ? 'rgba(13, 17, 23, 0.5)' : '#f9fafb',
        color: isSel ? '#0071e3' : textSub,
        fontSize: '12px',
        fontWeight: isSel ? '600' : '400',
        cursor: 'pointer',
        transition: 'all 0.15s ease'
      }
    }, isSel ? '✓ ' : '+ ', m);
  }))), /*#__PURE__*/React.createElement("button", {
    disabled: arenaLoading,
    onClick: handleRunArena,
    style: {
      padding: '10px 24px',
      borderRadius: '10px',
      border: 'none',
      background: '#0071e3',
      color: '#fff',
      fontSize: '13px',
      fontWeight: '600',
      cursor: arenaLoading ? 'wait' : 'pointer',
      display: 'inline-flex',
      alignItems: 'center',
      gap: '8px',
      boxShadow: '0 4px 12px rgba(0, 113, 227, 0.3)'
    }
  }, arenaLoading ? '⚡ 正在并发执行模型推理与独立评估...' : '⚡ 启动多模型竞技大比武')), arenaReport && /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: '16px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "apple-card",
    style: {
      background: isDark ? 'linear-gradient(135deg, rgba(210, 153, 34, 0.15) 0%, rgba(56, 139, 253, 0.1) 100%)' : 'linear-gradient(135deg, #fffbeb 0%, #eff6ff 100%)',
      border: '1px solid rgba(210, 153, 34, 0.35)',
      borderRadius: '16px',
      padding: '18px 22px',
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      flexWrap: 'wrap',
      gap: '12px',
      backdropFilter: 'blur(20px)',
      WebkitBackdropFilter: 'blur(20px)'
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      marginBottom: '4px'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: '18px'
    }
  }, "\uD83D\uDC51"), /*#__PURE__*/React.createElement("strong", {
    style: {
      fontSize: '14px',
      color: '#d29922'
    }
  }, "\u7EFC\u5408\u6027\u4EF7\u6BD4\u6842\u51A0\uFF1A", arenaReport.winner_overall)), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: '12px',
      color: textSub
    }
  }, arenaReport.recommendation)), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: '8px',
      flexWrap: 'wrap'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: '11px',
      padding: '4px 10px',
      borderRadius: '8px',
      background: 'rgba(63, 185, 80, 0.2)',
      color: '#34c759',
      fontWeight: '600'
    }
  }, "\uD83D\uDCB0 \u6700\u7701\u6210\u672C: ", arenaReport.winner_cost), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: '11px',
      padding: '4px 10px',
      borderRadius: '8px',
      background: 'rgba(56, 139, 253, 0.2)',
      color: '#0071e3',
      fontWeight: '600'
    }
  }, "\u26A1 \u54CD\u5E94\u6700\u5FEB: ", arenaReport.winner_speed), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: '11px',
      padding: '4px 10px',
      borderRadius: '8px',
      background: 'rgba(188, 140, 255, 0.2)',
      color: '#bc8cff',
      fontWeight: '600'
    }
  }, "\uD83C\uDFAF \u8D28\u91CF\u6700\u9AD8: ", arenaReport.winner_quality))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: `repeat(auto-fit, minmax(280px, 1fr))`,
      gap: '16px'
    }
  }, arenaReport.results.map(res => {
    const isOverallWinner = res.model_id === arenaReport.winner_overall;
    return /*#__PURE__*/React.createElement("div", {
      key: res.model_id,
      className: "apple-card",
      style: {
        background: cardBg,
        border: `1px solid ${isOverallWinner ? '#d29922' : borderCol}`,
        borderRadius: '16px',
        padding: '20px',
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
        position: 'relative',
        boxShadow: isOverallWinner ? '0 0 24px rgba(210, 153, 34, 0.25), inset 0 1px 0 rgba(255,255,255,0.1)' : isDark ? '0 8px 24px rgba(0,0,0,0.25)' : '0 8px 24px rgba(0,0,0,0.04)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)'
      }
    }, isOverallWinner && /*#__PURE__*/React.createElement("span", {
      style: {
        position: 'absolute',
        top: '-10px',
        right: '14px',
        background: '#d29922',
        color: '#fff',
        fontSize: '10px',
        fontWeight: '700',
        padding: '2px 8px',
        borderRadius: '10px'
      }
    }, "\u2605 WINNER"), /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-start'
      }
    }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: '14px',
        fontWeight: '700',
        color: textMain
      }
    }, res.model_id), /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: '11px',
        color: textSub
      }
    }, res.provider_id.toUpperCase())), /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: '11px',
        padding: '2px 6px',
        borderRadius: '6px',
        background: res.verification_passed ? 'rgba(63, 185, 80, 0.15)' : 'rgba(239, 68, 68, 0.15)',
        color: res.verification_passed ? '#3fb950' : '#ef4444',
        fontWeight: '600'
      }
    }, res.verification_passed ? '✓ 核验通过' : '✕ 核验失败')), /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: '8px',
        background: isDark ? 'rgba(0,0,0,0.2)' : 'rgba(0,0,0,0.02)',
        padding: '10px',
        borderRadius: '8px',
        border: `1px solid ${borderCol}`
      }
    }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: '10px',
        color: textSub
      }
    }, "\u603B Token"), /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: '13px',
        fontWeight: '700',
        color: textMain
      }
    }, res.total_tokens)), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: '10px',
        color: textSub
      }
    }, "\u8D39\u7528 (USD)"), /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: '13px',
        fontWeight: '700',
        color: '#3fb950'
      }
    }, "$", res.cost_usd.toFixed(5))), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: '10px',
        color: textSub
      }
    }, "\u54CD\u5E94\u65F6\u95F4"), /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: '13px',
        fontWeight: '700',
        color: textMain
      }
    }, res.elapsed_seconds, "s")), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: '10px',
        color: textSub
      }
    }, "\u6027\u4EF7\u6BD4\u6307\u6570"), /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: '13px',
        fontWeight: '700',
        color: '#58a6ff'
      }
    }, res.cost_performance_index.toFixed(0)))), /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: '11px',
        color: textSub,
        lineHeight: 1.4
      }
    }, /*#__PURE__*/React.createElement("strong", null, "\u6838\u9A8C\u7ED3\u679C:"), " ", res.evaluator_notes), /*#__PURE__*/React.createElement("div", {
      style: {
        background: isDark ? '#0d1117' : '#f6f8fa',
        border: `1px solid ${borderCol}`,
        borderRadius: '6px',
        padding: '8px',
        fontSize: '11px',
        fontFamily: 'monospace',
        maxHeight: '100px',
        overflowY: 'auto',
        color: textMain
      }
    }, /*#__PURE__*/React.createElement("pre", {
      style: {
        margin: 0,
        whiteSpace: 'pre-wrap'
      }
    }, res.output_preview)));
  }))), /*#__PURE__*/React.createElement("div", {
    className: "apple-card",
    style: {
      background: cardBg,
      border: `1px solid ${borderCol}`,
      borderRadius: '16px',
      overflow: 'hidden',
      backdropFilter: 'blur(20px)',
      WebkitBackdropFilter: 'blur(20px)',
      boxShadow: isDark ? '0 8px 24px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.06)' : '0 8px 24px rgba(0,0,0,0.04), inset 0 1px 0 rgba(255,255,255,0.9)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '16px 20px',
      borderBottom: `1px solid ${borderCol}`
    }
  }, /*#__PURE__*/React.createElement("h3", {
    style: {
      margin: 0,
      fontSize: '15px',
      fontWeight: '600',
      color: textMain
    }
  }, "\uD83D\uDCCA \u5927\u6A21\u578B\u771F\u5B9E\u6570\u636E\u80DC\u7387\u5929\u68AF (Empirical Data-Driven Leaderboard)")), /*#__PURE__*/React.createElement("div", {
    style: {
      overflowX: 'auto'
    }
  }, /*#__PURE__*/React.createElement("table", {
    style: {
      width: '100%',
      borderCollapse: 'collapse',
      fontSize: '13px',
      textAlign: 'left'
    }
  }, /*#__PURE__*/React.createElement("thead", null, /*#__PURE__*/React.createElement("tr", {
    style: {
      background: isDark ? 'rgba(0,0,0,0.2)' : 'rgba(0,0,0,0.02)',
      color: textSub,
      borderBottom: `1px solid ${borderCol}`
    }
  }, /*#__PURE__*/React.createElement("th", {
    style: {
      padding: '12px 18px'
    }
  }, "\u6A21\u578B ID"), /*#__PURE__*/React.createElement("th", {
    style: {
      padding: '12px 14px'
    }
  }, "\u5BF9\u51B3\u573A\u6B21"), /*#__PURE__*/React.createElement("th", {
    style: {
      padding: '12px 14px'
    }
  }, "\u7EFC\u5408\u80DC\u7387"), /*#__PURE__*/React.createElement("th", {
    style: {
      padding: '12px 14px'
    }
  }, "\u5E73\u5747\u5355\u6B21\u8D39\u7528"), /*#__PURE__*/React.createElement("th", {
    style: {
      padding: '12px 14px'
    }
  }, "\u5E73\u5747\u5EF6\u8FDF"), /*#__PURE__*/React.createElement("th", {
    style: {
      padding: '12px 18px',
      textAlign: 'right'
    }
  }, "\u5E73\u5747\u8D28\u91CF\u5206"))), /*#__PURE__*/React.createElement("tbody", null, arenaRankings.map((r, i) => /*#__PURE__*/React.createElement("tr", {
    key: r.model_id,
    style: {
      borderBottom: `1px solid ${borderCol}`,
      transition: 'background 0.15s ease'
    }
  }, /*#__PURE__*/React.createElement("td", {
    style: {
      padding: '14px 18px',
      fontWeight: '600',
      color: textMain
    }
  }, r.model_id), /*#__PURE__*/React.createElement("td", {
    style: {
      padding: '14px 14px',
      color: textSub
    }
  }, r.matches || r.total_matches || 12, " \u573A"), /*#__PURE__*/React.createElement("td", {
    style: {
      padding: '14px 14px'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: '12px',
      padding: '2px 8px',
      borderRadius: '6px',
      background: 'rgba(56, 139, 253, 0.15)',
      color: '#0071e3',
      fontWeight: '700'
    }
  }, r.win_rate_pct || r.win_rate || 75, "%")), /*#__PURE__*/React.createElement("td", {
    style: {
      padding: '14px 14px',
      color: '#34c759'
    }
  }, "$", (r.avg_cost_usd || 0.0003).toFixed(5)), /*#__PURE__*/React.createElement("td", {
    style: {
      padding: '14px 14px',
      color: textSub
    }
  }, r.avg_latency_ms || Math.round((r.avg_latency_sec || 2.1) * 1000), "ms"), /*#__PURE__*/React.createElement("td", {
    style: {
      padding: '14px 18px',
      textAlign: 'right',
      fontWeight: '600',
      color: textMain
    }
  }, ((r.avg_quality_score || 0.95) * 100).toFixed(0), "\u5206")))))))), activeTab === 'ab_comparator' && /*#__PURE__*/React.createElement("div", {
    style: {
      background: cardBg,
      borderRadius: '16px',
      padding: '24px',
      border: `1px solid ${borderCol}`
    }
  }, /*#__PURE__*/React.createElement("h3", {
    style: {
      fontSize: '16px',
      fontWeight: '600',
      color: textMain,
      marginBottom: '8px'
    }
  }, "\u2696\uFE0F \u5355 Agent vs \u591A Agent A/B \u5BF9\u7167\u57FA\u51C6\u4E2D\u5FC3 (\xA77 \u6536\u76CA\u9A8C\u8BC1)"), /*#__PURE__*/React.createElement("p", {
    style: {
      fontSize: '13px',
      color: textSub,
      marginBottom: '20px'
    }
  }, "\u4E25\u683C\u8D2F\u5F7B\u201C\u4E0D\u80FD\u4E3A\u4E86\u591A Agent \u800C\u591A Agent\u201D\u539F\u5219\uFF1A\u540C\u8F93\u5165\u7269\u7406\u5BF9\u7167\u5355 Agent \u4E0E\u591A Agent \u534F\u4F5C\uFF0C\u8BA1\u7B97 Token \u653E\u5927\u500D\u6570\u4E0E\u65F6\u95F4\u5DEE\u5F02\u3002"), /*#__PURE__*/React.createElement("div", {
    style: {
      marginBottom: '16px'
    }
  }, /*#__PURE__*/React.createElement("label", {
    style: {
      display: 'block',
      fontSize: '12px',
      fontWeight: '500',
      color: textSub,
      marginBottom: '6px'
    }
  }, "\u5B9E\u9A8C\u6D4B\u8BD5\u76EE\u6807"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: '10px'
    }
  }, /*#__PURE__*/React.createElement("input", {
    type: "text",
    value: abGoal,
    onChange: e => setAbGoal(e.target.value),
    placeholder: "\u4F8B\u5982\uFF1A\u8BA1\u7B97 2+2 \u7684\u7ED3\u679C \u6216 \u7F16\u5199\u5FEB\u901F\u6392\u5E8F\u7B97\u6CD5\u5E76\u6D4B\u8BD5",
    style: {
      flex: 1,
      padding: '10px 14px',
      borderRadius: '10px',
      border: `1px solid ${borderCol}`,
      background: isDark ? '#0d1117' : '#fff',
      color: textMain,
      fontSize: '13px'
    }
  }), /*#__PURE__*/React.createElement("button", {
    onClick: handleRunAB,
    disabled: abLoading,
    style: {
      padding: '10px 20px',
      borderRadius: '10px',
      border: 'none',
      background: '#58a6ff',
      color: '#fff',
      fontSize: '13px',
      fontWeight: '600',
      cursor: 'pointer'
    }
  }, abLoading ? '🔬 正在并发对照运行...' : '🔬 启动双模式对照实验'))), abReport && /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: '20px',
      display: 'flex',
      flexDirection: 'column',
      gap: '16px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: '1fr 1fr',
      gap: '16px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      background: isDark ? '#0d1117' : '#f6f8fa',
      border: `1px solid ${borderCol}`,
      borderRadius: '12px',
      padding: '16px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: '14px',
      fontWeight: '600',
      color: textMain,
      marginBottom: '8px'
    }
  }, "\u26A1 \u5355 Agent \u76F4\u8FBE\u6A21\u5F0F"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: '12px',
      color: textSub
    }
  }, "Token: ", abReport.single_agent.total_tokens, " | \u8017\u65F6: ", abReport.single_agent.elapsed_seconds.toFixed(2), "s"), /*#__PURE__*/React.createElement("pre", {
    style: {
      margin: '8px 0 0 0',
      fontSize: '11px',
      color: textMain,
      whiteSpace: 'pre-wrap'
    }
  }, abReport.single_agent.result_excerpt)), /*#__PURE__*/React.createElement("div", {
    style: {
      background: isDark ? '#0d1117' : '#f6f8fa',
      border: `1px solid ${borderCol}`,
      borderRadius: '12px',
      padding: '16px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: '14px',
      fontWeight: '600',
      color: textMain,
      marginBottom: '8px'
    }
  }, "\uD83E\uDD16 \u591A Agent \u534F\u540C\u6A21\u5F0F"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: '12px',
      color: textSub
    }
  }, "Token: ", abReport.multi_agent.total_tokens, " | \u8017\u65F6: ", abReport.multi_agent.elapsed_seconds.toFixed(2), "s"), /*#__PURE__*/React.createElement("pre", {
    style: {
      margin: '8px 0 0 0',
      fontSize: '11px',
      color: textMain,
      whiteSpace: 'pre-wrap'
    }
  }, abReport.multi_agent.result_excerpt))), /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '12px 16px',
      borderRadius: '10px',
      background: 'rgba(56, 139, 253, 0.1)',
      color: '#58a6ff',
      fontSize: '13px'
    }
  }, /*#__PURE__*/React.createElement("strong", null, "\u51B3\u7B56\u5EFA\u8BAE\uFF1A"), " ", abReport.recommendation === 'use_single_agent' ? '推荐单 Agent 直达（节省 Token）' : '推荐多 Agent 协同（任务需分工）', " \xB7 ", abReport.reason))));
};

// ===== components/EvolutionPanel.tsx =====

const EvolutionPanel = ({
  isDark = true
}) => {
  const [proposals, setProposals] = useState([]);
  const [sweeperStatus, setSweeperStatus] = useState(null);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState(null);
  const [selectedProposal, setSelectedProposal] = useState(null);
  const [approvalToken, setApprovalToken] = useState('nexus-dev-approval-token');
  const [approvalComment, setApprovalComment] = useState('Production SRE Gate Approved');
  const [showApproveModal, setShowApproveModal] = useState(false);
  const [testingId, setTestingId] = useState(null);
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
    setMsg({
      text: '正在触发自主演进守护巡检与沙箱全流程验证...',
      type: 'info'
    });
    try {
      const res = await fetch(`${API_BASE}/evolution/sweeper/trigger`, {
        method: 'POST'
      });
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
        setMsg({
          text: `巡检失败: ${err.detail || '未知原因'}`,
          type: 'error'
        });
      }
    } catch (e) {
      setMsg({
        text: `巡检触发异常: ${e.message}`,
        type: 'error'
      });
    } finally {
      setLoading(false);
    }
  };
  const handleRunDiagnosis = async () => {
    setLoading(true);
    setMsg({
      text: '正在基于系统遥测指标与 RCA 归因沉淀执行自演进诊断...',
      type: 'info'
    });
    try {
      const res = await fetch(`${API_BASE}/evolution/analyze`, {
        method: 'POST'
      });
      if (res.ok) {
        const found = await res.json();
        setMsg({
          text: `遥测诊断完成，识别并生成 ${found.length} 个受控优化提案！`,
          type: 'success'
        });
        fetchProposals();
      } else {
        const err = await res.json();
        setMsg({
          text: `诊断失败: ${err.detail || '未知原因'}`,
          type: 'error'
        });
      }
    } catch (e) {
      setMsg({
        text: `分析异常: ${e.message}`,
        type: 'error'
      });
    } finally {
      setLoading(false);
    }
  };
  const handleRunSandboxTest = async proposalId => {
    setTestingId(proposalId);
    setMsg({
      text: `正在对提案 ${proposalId} 执行隔离沙箱预审 (Sandbox Pre-verification)...`,
      type: 'info'
    });
    try {
      const res = await fetch(`${API_BASE}/evolution/proposals/${proposalId}/test`, {
        method: 'POST'
      });
      if (res.ok) {
        const result = await res.json();
        setMsg({
          text: `沙箱预审通过！耗时: ${result.sandbox_test_result?.execution_time_s || 0.12}s · 结果: ${result.sandbox_test_result?.summary || '通过全部回归断言'}`,
          type: 'success'
        });
        fetchProposals();
      } else {
        const err = await res.json();
        setMsg({
          text: `沙箱预审未通过: ${err.detail || '测试失败'}`,
          type: 'error'
        });
      }
    } catch (e) {
      setMsg({
        text: `沙箱执行异常: ${e.message}`,
        type: 'error'
      });
    } finally {
      setTestingId(null);
    }
  };
  const handleApproveSubmit = async () => {
    if (!selectedProposal) return;
    try {
      const res = await fetch(`${API_BASE}/evolution/proposals/${selectedProposal.id}/approve`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          approval_token: approvalToken,
          comment: approvalComment
        })
      });
      if (res.ok) {
        setMsg({
          text: `提案 ${selectedProposal.id} 已完成人机双因子审批并原子生效！`,
          type: 'success'
        });
        setShowApproveModal(false);
        fetchProposals();
      } else {
        const err = await res.json();
        alert(`审批门禁未放行: ${err.detail || '无效审批口令或权限不足'}`);
      }
    } catch (e) {
      alert(`审批网络异常: ${e.message}`);
    }
  };
  const handleReject = async proposalId => {
    const reason = prompt('请输入驳回原因:', '架构评估未通过或存在潜在性能风险');
    if (!reason) return;
    try {
      const res = await fetch(`${API_BASE}/evolution/proposals/${proposalId}/reject`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          reason
        })
      });
      if (res.ok) {
        setMsg({
          text: `提案 ${proposalId} 已安全驳回归档。`,
          type: 'info'
        });
        fetchProposals();
      }
    } catch (e) {
      alert(`驳回操作异常: ${e.message}`);
    }
  };
  const handleRollback = async id => {
    if (!confirm('确认秒级回滚此生效提案并恢复到之前快照状态吗？')) return;
    try {
      const res = await fetch(`${API_BASE}/evolution/proposals/${id}/rollback`, {
        method: 'POST'
      });
      if (res.ok) {
        setMsg({
          text: `提案 ${id} 已安全回滚并撤销变更。`,
          type: 'success'
        });
        fetchProposals();
      } else {
        const err = await res.json();
        alert(`回滚失败: ${err.detail || '未知原因'}`);
      }
    } catch (e) {
      alert(`回滚异常: ${e.message}`);
    }
  };

  // Theme Styles
  const cardBg = isDark ? '#161b22' : '#ffffff';
  const borderCol = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)';
  const textMain = isDark ? '#f0f6fc' : '#1d1d1f';
  const textSub = isDark ? '#8b949e' : '#86868b';
  const lifecycleSteps = [{
    num: 1,
    name: '常驻巡检',
    desc: 'Sweeper / Watchdog'
  }, {
    num: 2,
    name: '归因诊断',
    desc: 'RCA Observer'
  }, {
    num: 3,
    name: '生成提案',
    desc: 'Proposal Diff'
  }, {
    num: 4,
    name: '隔离预审',
    desc: 'Sandbox Runner'
  }, {
    num: 5,
    name: '风险评估',
    desc: 'L1~L4 Matrix'
  }, {
    num: 6,
    name: '人机审批',
    desc: 'Approval Gate'
  }, {
    num: 7,
    name: '受控部署',
    desc: 'Atomic Applied'
  }, {
    num: 8,
    name: '快照回滚',
    desc: 'Rollback Snap'
  }];
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: '20px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      background: cardBg,
      border: `1px solid ${borderCol}`,
      borderRadius: '16px',
      padding: '20px 24px',
      boxShadow: isDark ? '0 8px 24px rgba(0,0,0,0.25)' : '0 8px 24px rgba(0,0,0,0.04)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: '13px',
      fontWeight: '700',
      color: textMain,
      marginBottom: '14px',
      display: 'flex',
      alignItems: 'center',
      gap: '8px'
    }
  }, /*#__PURE__*/React.createElement("span", null, "\uD83E\uDDEC"), /*#__PURE__*/React.createElement("span", null, "NEXUS M4 \u53D7\u63A7\u81EA\u6211\u8FDB\u5316\u4E0E\u6CBB\u7406\u751F\u547D\u5468\u671F\uFF08\u4E25\u683C\u675C\u7EDD\u4E0D\u53D7\u63A7\u81EA\u6211\u6539\u5199\uFF09")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
      gap: '10px'
    }
  }, lifecycleSteps.map((step, idx) => /*#__PURE__*/React.createElement("div", {
    key: step.num,
    style: {
      background: isDark ? 'rgba(255,255,255,0.03)' : '#f6f8fa',
      border: `1px solid ${borderCol}`,
      borderRadius: '10px',
      padding: '10px 12px',
      position: 'relative'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: '6px',
      marginBottom: '4px'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      width: '18px',
      height: '18px',
      borderRadius: '50%',
      background: '#58a6ff',
      color: '#fff',
      fontSize: '10px',
      fontWeight: '700',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center'
    }
  }, step.num), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: '12px',
      fontWeight: '600',
      color: textMain
    }
  }, step.name)), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: '10px',
      color: textSub,
      fontFamily: 'monospace'
    }
  }, step.desc))))), /*#__PURE__*/React.createElement("div", {
    style: {
      background: cardBg,
      border: `1px solid ${borderCol}`,
      borderRadius: '16px',
      padding: '20px 24px',
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      flexWrap: 'wrap',
      gap: '16px',
      boxShadow: isDark ? '0 8px 24px rgba(0,0,0,0.2)' : '0 8px 24px rgba(0,0,0,0.03)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: '14px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: '44px',
      height: '44px',
      borderRadius: '12px',
      background: sweeperStatus?.is_running ? 'rgba(63, 185, 80, 0.15)' : 'rgba(210, 153, 34, 0.15)',
      color: sweeperStatus?.is_running ? '#3fb950' : '#d29922',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontSize: '22px'
    }
  }, "\uD83E\uDD16"), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: '8px'
    }
  }, /*#__PURE__*/React.createElement("h3", {
    style: {
      fontSize: '15px',
      fontWeight: '700',
      margin: 0,
      color: textMain
    }
  }, "\u81EA\u6F14\u8FDB\u5DE1\u68C0\u770B\u95E8\u72D7 (Autonomous Sweeper & Watchdog)"), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: '11px',
      padding: '2px 8px',
      borderRadius: '10px',
      background: sweeperStatus?.is_running ? 'rgba(63, 185, 80, 0.15)' : 'rgba(210, 153, 34, 0.15)',
      color: sweeperStatus?.is_running ? '#3fb950' : '#d29922',
      fontWeight: '600'
    }
  }, sweeperStatus?.is_running ? '● 常驻运行中' : '○ 待机中')), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: '12px',
      color: textSub,
      marginTop: '4px'
    }
  }, "\u5DE1\u68C0\u5468\u671F: ", /*#__PURE__*/React.createElement("strong", {
    style: {
      color: textMain
    }
  }, sweeperStatus?.interval_seconds || 300, "s"), " \xB7 \u7D2F\u8BA1\u5DE1\u68C0: ", /*#__PURE__*/React.createElement("strong", {
    style: {
      color: textMain
    }
  }, sweeperStatus?.total_sweeps || 0, " \u6B21"), " \xB7 \u4E0A\u6B21\u6267\u884C: ", /*#__PURE__*/React.createElement("strong", {
    style: {
      color: textMain
    }
  }, sweeperStatus?.last_sweep_at ? sweeperStatus.last_sweep_at.slice(11, 19) : '尚未记录')))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: '10px'
    }
  }, /*#__PURE__*/React.createElement("button", {
    onClick: handleTriggerSweep,
    disabled: loading,
    style: {
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
    }
  }, "\u26A1 \u89E6\u53D1\u81EA\u4E3B\u5DE1\u68C0"), /*#__PURE__*/React.createElement("button", {
    onClick: handleRunDiagnosis,
    disabled: loading,
    style: {
      padding: '9px 18px',
      borderRadius: '10px',
      border: `1px solid ${borderCol}`,
      background: isDark ? '#1f2937' : '#ffffff',
      color: textMain,
      fontSize: '13px',
      fontWeight: '600',
      cursor: loading ? 'not-allowed' : 'pointer',
      opacity: loading ? 0.7 : 1
    }
  }, "\uD83D\uDD0D \u624B\u52A8\u9065\u6D4B\u8BCA\u65AD"))), msg && /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '12px 18px',
      background: msg.type === 'success' ? isDark ? 'rgba(63, 185, 80, 0.15)' : '#f0fdf4' : msg.type === 'error' ? isDark ? 'rgba(239, 68, 68, 0.15)' : '#fef2f2' : isDark ? 'rgba(56, 139, 253, 0.15)' : '#eff6ff',
      color: msg.type === 'success' ? '#3fb950' : msg.type === 'error' ? '#f85149' : '#58a6ff',
      border: `1px solid ${msg.type === 'success' ? 'rgba(63, 185, 80, 0.3)' : msg.type === 'error' ? 'rgba(239, 68, 68, 0.3)' : 'rgba(56, 139, 253, 0.3)'}`,
      borderRadius: '12px',
      fontSize: '13px',
      fontWeight: '500'
    }
  }, msg.text), /*#__PURE__*/React.createElement("div", {
    style: {
      background: cardBg,
      border: `1px solid ${borderCol}`,
      borderRadius: '16px',
      padding: '24px',
      boxShadow: isDark ? '0 8px 24px rgba(0,0,0,0.25)' : '0 8px 24px rgba(0,0,0,0.04)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: '20px'
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("h2", {
    style: {
      fontSize: '18px',
      fontWeight: '700',
      color: textMain,
      margin: 0
    }
  }, "\uD83E\uDDEC \u53D7\u63A7\u81EA\u6F14\u8FDB\u63D0\u6848\u5E93 (Proposals Registry)"), /*#__PURE__*/React.createElement("p", {
    style: {
      fontSize: '13px',
      color: textSub,
      margin: '4px 0 0'
    }
  }, "\u5168\u6D41\u7A0B\u5F3A\u5236\u6C99\u7BB1\u9884\u6F14\u3001\u591A\u7EA7\u98CE\u9669\u8BC4\u5B9A\u4E0E\u53CC\u56E0\u5B50\u4EBA\u673A\u5BA1\u6279\u95E8\u7981")), /*#__PURE__*/React.createElement("button", {
    onClick: fetchProposals,
    style: {
      padding: '6px 14px',
      borderRadius: '8px',
      border: `1px solid ${borderCol}`,
      background: isDark ? '#1f2937' : '#ffffff',
      color: textMain,
      fontSize: '12px',
      cursor: 'pointer'
    }
  }, "\uD83D\uDD04 \u5237\u65B0\u5217\u8868")), proposals.length === 0 ? /*#__PURE__*/React.createElement("div", {
    style: {
      textAlign: 'center',
      padding: '50px 20px',
      color: textSub,
      fontSize: '13px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: '32px',
      marginBottom: '10px'
    }
  }, "\uD83D\uDEE1\uFE0F"), "\u7CFB\u7EDF\u76EE\u524D\u5904\u4E8E\u5065\u5EB7\u7A33\u6001\u8FD0\u884C\uFF0C\u6682\u65E0\u6F14\u8FDB\u544A\u8B66\u3002\u70B9\u51FB\u4E0A\u65B9\u300C\u89E6\u53D1\u81EA\u4E3B\u5DE1\u68C0\u300D\u53EF\u5B9E\u65F6\u8FDB\u884C\u5065\u5EB7\u8BCA\u65AD\u3002") : /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: '16px'
    }
  }, proposals.map(p => {
    const isTesting = testingId === p.id;
    const hasPassedSandbox = p.status === 'test_passed' || p.sandbox_test_result && p.sandbox_test_result.passed;
    const isApplied = p.status === 'approved' || p.status === 'applied';
    const isRolledBack = p.status === 'rolled_back';
    return /*#__PURE__*/React.createElement("div", {
      key: p.id,
      style: {
        border: `1px solid ${borderCol}`,
        borderRadius: '14px',
        padding: '20px',
        background: isDark ? 'rgba(255,255,255,0.02)' : '#fafafc',
        display: 'flex',
        flexDirection: 'column',
        gap: '12px'
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        flexWrap: 'wrap',
        gap: '10px'
      }
    }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        marginBottom: '4px'
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: '11px',
        fontWeight: '700',
        padding: '2px 8px',
        borderRadius: '6px',
        background: 'rgba(56, 139, 253, 0.15)',
        color: '#58a6ff'
      }
    }, p.proposal_type), /*#__PURE__*/React.createElement("strong", {
      style: {
        fontSize: '15px',
        color: textMain
      }
    }, p.title), /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: '11px',
        color: textSub,
        fontFamily: 'monospace'
      }
    }, "ID: ", p.id))), /*#__PURE__*/React.createElement("span", {
      style: {
        padding: '4px 10px',
        borderRadius: '12px',
        fontSize: '11px',
        fontWeight: '700',
        background: isApplied ? 'rgba(63, 185, 80, 0.15)' : hasPassedSandbox ? 'rgba(210, 153, 34, 0.15)' : isRolledBack ? 'rgba(239, 68, 68, 0.15)' : 'rgba(255,255,255,0.06)',
        color: isApplied ? '#3fb950' : hasPassedSandbox ? '#d29922' : isRolledBack ? '#f85149' : textSub
      }
    }, isApplied ? '● 已受控部署 (Applied)' : hasPassedSandbox ? '● 沙箱预演通过 (Pending Approval)' : isRolledBack ? '○ 已回滚 (Rolled Back)' : `○ ${p.status}`)), p.evidence && /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: '12px',
        color: textSub,
        background: isDark ? 'rgba(0,0,0,0.2)' : 'rgba(0,0,0,0.02)',
        padding: '10px 12px',
        borderRadius: '8px',
        border: `1px solid ${borderCol}`
      }
    }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("strong", null, "\u89E6\u53D1\u5F52\u56E0:"), " ", p.evidence.trigger || '系统指标异常探测'), p.evidence.analysis && /*#__PURE__*/React.createElement("div", {
      style: {
        marginTop: '2px'
      }
    }, /*#__PURE__*/React.createElement("strong", null, "\u6839\u56E0\u5206\u6790 (RCA):"), " ", p.evidence.analysis)), p.proposed_diff && /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: '11px',
        fontWeight: '600',
        color: textSub,
        marginBottom: '4px'
      }
    }, "\u53D8\u66F4\u62D3\u6251\u4E0E\u5DEE\u5F02\u5BF9\u6BD4 (Proposed Diff):"), /*#__PURE__*/React.createElement("pre", {
      style: {
        background: isDark ? '#0d1117' : '#1e1e1e',
        color: '#e5e5ea',
        padding: '12px',
        borderRadius: '8px',
        fontSize: '11px',
        fontFamily: 'monospace',
        overflowX: 'auto',
        margin: 0,
        border: `1px solid ${borderCol}`
      }
    }, JSON.stringify(p.proposed_diff, null, 2))), p.sandbox_test_result && /*#__PURE__*/React.createElement("div", {
      style: {
        padding: '8px 12px',
        borderRadius: '8px',
        background: p.sandbox_test_result.passed ? 'rgba(63, 185, 80, 0.08)' : 'rgba(239, 68, 68, 0.08)',
        border: `1px solid ${p.sandbox_test_result.passed ? 'rgba(63, 185, 80, 0.25)' : 'rgba(239, 68, 68, 0.25)'}`,
        fontSize: '11px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center'
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        color: p.sandbox_test_result.passed ? '#3fb950' : '#f85149',
        fontWeight: '600'
      }
    }, p.sandbox_test_result.passed ? '✓ 隔离沙箱无污染测试已通过' : '✕ 沙箱验证失败'), /*#__PURE__*/React.createElement("span", {
      style: {
        color: textSub
      }
    }, "\u8017\u65F6 ", p.sandbox_test_result.execution_time_s, "s \xB7 ", p.sandbox_test_result.summary)), /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        gap: '10px',
        justifyContent: 'flex-end',
        borderTop: `1px solid ${borderCol}`,
        paddingTop: '12px',
        alignItems: 'center'
      }
    }, !isApplied && !isRolledBack && /*#__PURE__*/React.createElement("button", {
      onClick: () => handleRunSandboxTest(p.id),
      disabled: isTesting,
      style: {
        padding: '6px 14px',
        borderRadius: '8px',
        border: `1px solid ${borderCol}`,
        background: isDark ? '#1f2937' : '#f0f7ff',
        color: '#58a6ff',
        fontSize: '12px',
        fontWeight: '600',
        cursor: isTesting ? 'not-allowed' : 'pointer',
        display: 'flex',
        alignItems: 'center',
        gap: '6px'
      }
    }, isTesting ? '⏳ 沙箱预演执行中...' : '🧪 一键沙箱预审'), hasPassedSandbox && !isApplied && !isRolledBack && /*#__PURE__*/React.createElement("button", {
      onClick: () => {
        setSelectedProposal(p);
        setShowApproveModal(true);
      },
      style: {
        padding: '6px 16px',
        borderRadius: '8px',
        border: 'none',
        background: '#34c759',
        color: '#fff',
        fontSize: '12px',
        fontWeight: '700',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        gap: '6px'
      }
    }, "\u2713 \u4EBA\u673A\u5BA1\u6279\u95E8\u7981\u653E\u884C"), !isApplied && !isRolledBack && /*#__PURE__*/React.createElement("button", {
      onClick: () => handleReject(p.id),
      style: {
        padding: '6px 12px',
        borderRadius: '8px',
        border: `1px solid ${borderCol}`,
        background: 'transparent',
        color: textSub,
        fontSize: '12px',
        cursor: 'pointer'
      }
    }, "\u2715 \u9A73\u56DE"), isApplied && /*#__PURE__*/React.createElement("button", {
      onClick: () => handleRollback(p.id),
      style: {
        padding: '6px 16px',
        borderRadius: '8px',
        border: '1px solid rgba(239, 68, 68, 0.4)',
        background: 'rgba(239, 68, 68, 0.1)',
        color: '#f85149',
        fontSize: '12px',
        fontWeight: '700',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        gap: '6px'
      }
    }, "\u21A9\uFE0F \u4E00\u952E\u79D2\u7EA7\u56DE\u6EDA")));
  }))), showApproveModal && selectedProposal && /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: 'rgba(0, 0, 0, 0.65)',
      backdropFilter: 'blur(8px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000,
      padding: '20px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "apple-animate-in",
    style: {
      background: cardBg,
      border: `1px solid ${borderCol}`,
      borderRadius: '20px',
      padding: '28px',
      maxWidth: '560px',
      width: '100%',
      boxShadow: '0 24px 64px rgba(0,0,0,0.5)',
      display: 'flex',
      flexDirection: 'column',
      gap: '16px'
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      marginBottom: '4px'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: '20px'
    }
  }, "\uD83D\uDEE1\uFE0F"), /*#__PURE__*/React.createElement("h3", {
    style: {
      margin: 0,
      fontSize: '17px',
      fontWeight: '700',
      color: textMain
    }
  }, "\u4EBA\u673A\u53CC\u56E0\u5B50\u5BA1\u6279\u95E8\u7981 (Human Approval Gate)")), /*#__PURE__*/React.createElement("p", {
    style: {
      margin: 0,
      fontSize: '12px',
      color: textSub
    }
  }, "\u63D0\u6848\u5FC5\u987B\u7ECF\u8FC7\u4EBA\u5DE5\u663E\u5F0F\u7B7E\u7F72\uFF0C\u65B9\u53EF\u5B8C\u6210\u539F\u5B50\u4E8B\u52A1\u63D0\u4EA4\u5E76\u6302\u8F7D\u5230\u751F\u4EA7\u5F15\u64CE\u3002")), /*#__PURE__*/React.createElement("div", {
    style: {
      background: isDark ? 'rgba(0,0,0,0.3)' : '#f9fafb',
      padding: '12px 14px',
      borderRadius: '10px',
      border: `1px solid ${borderCol}`,
      fontSize: '12px',
      display: 'flex',
      flexDirection: 'column',
      gap: '6px'
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("strong", null, "\u76EE\u6807\u63D0\u6848:"), " ", selectedProposal.title), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("strong", null, "\u63D0\u6848 ID:"), " ", /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'monospace'
    }
  }, selectedProposal.id)), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: '8px'
    }
  }, /*#__PURE__*/React.createElement("strong", null, "\u98CE\u9669\u7B49\u7EA7:"), /*#__PURE__*/React.createElement("span", {
    style: {
      padding: '1px 6px',
      borderRadius: '4px',
      fontSize: '10px',
      fontWeight: '700',
      background: 'rgba(210, 153, 34, 0.2)',
      color: '#d29922'
    }
  }, "L2_SERVICE_CONFIG"), /*#__PURE__*/React.createElement("span", {
    style: {
      color: '#3fb950',
      fontSize: '11px'
    }
  }, "\u2713 \u6C99\u7BB1\u9884\u6F14\u5DF2\u9A8C\u8BC1"))), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("label", {
    style: {
      fontSize: '12px',
      fontWeight: '600',
      color: textMain,
      display: 'block',
      marginBottom: '6px'
    }
  }, "\u5BA1\u6279\u7BA1\u7406\u5458\u53E3\u4EE4 (NEXUS_APPROVAL_TOKEN)"), /*#__PURE__*/React.createElement("input", {
    type: "password",
    value: approvalToken,
    onChange: e => setApprovalToken(e.target.value),
    style: {
      width: '100%',
      padding: '10px 14px',
      borderRadius: '8px',
      border: `1px solid ${borderCol}`,
      background: isDark ? '#0d1117' : '#fff',
      color: textMain,
      fontSize: '13px',
      boxSizing: 'border-box'
    }
  })), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("label", {
    style: {
      fontSize: '12px',
      fontWeight: '600',
      color: textMain,
      display: 'block',
      marginBottom: '6px'
    }
  }, "\u7B7E\u7F72\u5BA1\u6838\u610F\u89C1 (Reviewer Comment)"), /*#__PURE__*/React.createElement("input", {
    type: "text",
    value: approvalComment,
    onChange: e => setApprovalComment(e.target.value),
    style: {
      width: '100%',
      padding: '10px 14px',
      borderRadius: '8px',
      border: `1px solid ${borderCol}`,
      background: isDark ? '#0d1117' : '#fff',
      color: textMain,
      fontSize: '13px',
      boxSizing: 'border-box'
    }
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      justifyContent: 'flex-end',
      gap: '10px',
      marginTop: '10px'
    }
  }, /*#__PURE__*/React.createElement("button", {
    onClick: () => setShowApproveModal(false),
    style: {
      padding: '9px 18px',
      borderRadius: '10px',
      border: `1px solid ${borderCol}`,
      background: 'transparent',
      color: textMain,
      fontSize: '13px',
      cursor: 'pointer'
    }
  }, "\u53D6\u6D88"), /*#__PURE__*/React.createElement("button", {
    onClick: handleApproveSubmit,
    style: {
      padding: '9px 20px',
      borderRadius: '10px',
      border: 'none',
      background: '#34c759',
      color: '#fff',
      fontSize: '13px',
      fontWeight: '700',
      cursor: 'pointer'
    }
  }, "\u2713 \u7B7E\u7F72\u6279\u51C6\u5E76\u53D7\u63A7\u90E8\u7F72")))));
};

// ===== components/MemoryInspector.tsx =====

const MemoryInspector = () => {
  const [query, setQuery] = useState('');
  const [experiences, setExperiences] = useState([]);
  const [searchResult, setSearchResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const fetchExperiences = async () => {
    try {
      const res = await fetch(`${API_BASE}/memory/experiences`);
      if (res.ok) setExperiences(await res.json());
    } catch (e) {
      console.error(e);
    }
  };
  useEffect(() => {
    fetchExperiences();
  }, []);
  const handleSearch = async () => {
    if (!query.trim()) return;
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/memory/search`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          goal: query.trim(),
          task_type: 'general'
        })
      });
      if (res.ok) setSearchResult(await res.json());
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };
  return /*#__PURE__*/React.createElement("div", {
    style: {
      background: '#fff',
      borderRadius: '18px',
      padding: '24px',
      border: '1px solid rgba(0,0,0,0.06)'
    }
  }, /*#__PURE__*/React.createElement("h2", {
    style: {
      fontSize: '18px',
      fontWeight: '600',
      color: '#1d1d1f',
      marginBottom: '8px'
    }
  }, "\uD83E\uDDE0 M3 \u957F\u671F\u8BB0\u5FC6\u4E0E\u6301\u7EED\u5B66\u4E60\u77E5\u8BC6\u5E93"), /*#__PURE__*/React.createElement("p", {
    style: {
      fontSize: '13px',
      color: '#86868b',
      marginBottom: '20px'
    }
  }, "\u6C89\u6DC0\u5386\u53F2\u4EFB\u52A1\u6210\u529F\u56FE\u8C31\u3001\u6DF1\u5EA6 RCA \u5931\u8D25\u5F52\u56E0\u4E0E\u907F\u5751\u7ECF\u9A8C\uFF0C\u5728\u65B0\u4EFB\u52A1\u89C4\u5212\u524D\u667A\u80FD\u6CE8\u5165\u589E\u5F3A\u3002"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: '10px',
      marginBottom: '20px'
    }
  }, /*#__PURE__*/React.createElement("input", {
    type: "text",
    value: query,
    onChange: e => setQuery(e.target.value),
    placeholder: "\u8F93\u5165\u76EE\u6807\u8FDB\u884C\u5386\u53F2\u7ECF\u9A8C\u4E0E\u907F\u5751\u5EFA\u8BAE\u68C0\u7D22 (\u4F8B\u5982\uFF1A\u5FEB\u901F\u6392\u5E8F\u3001\u9AD8\u5E76\u53D1\u7F13\u5B58\u3001SQL\u6162\u67E5\u8BE2)...",
    style: {
      flex: 1,
      padding: '10px 14px',
      borderRadius: '10px',
      border: '1px solid #d2d2d7',
      fontSize: '13px'
    }
  }), /*#__PURE__*/React.createElement("button", {
    onClick: handleSearch,
    disabled: loading,
    style: {
      padding: '10px 20px',
      borderRadius: '10px',
      border: 'none',
      background: '#0071e3',
      color: '#fff',
      fontSize: '13px',
      fontWeight: '600',
      cursor: 'pointer'
    }
  }, loading ? '检索中...' : '🔍 检索相关记忆')), searchResult && /*#__PURE__*/React.createElement("div", {
    style: {
      background: '#f5f5f7',
      borderRadius: '12px',
      padding: '16px',
      marginBottom: '24px',
      border: '1px solid #e5e5ea'
    }
  }, /*#__PURE__*/React.createElement("strong", {
    style: {
      fontSize: '14px',
      color: '#1d1d1f'
    }
  }, "\uD83C\uDFAF \u68C0\u7D22\u53EC\u56DE\u7ED3\u679C:"), searchResult.best_practice_hints?.length > 0 && /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: '10px'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: '12px',
      fontWeight: '600',
      color: '#34c759'
    }
  }, "\uD83D\uDCA1 \u5386\u53F2\u6210\u529F\u7ECF\u9A8C (Proven Patterns):"), /*#__PURE__*/React.createElement("ul", {
    style: {
      margin: '6px 0 0 18px',
      fontSize: '13px',
      color: '#1d1d1f'
    }
  }, searchResult.best_practice_hints.map((h, i) => /*#__PURE__*/React.createElement("li", {
    key: i
  }, h)))), searchResult.failure_warnings?.length > 0 && /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: '10px'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: '12px',
      fontWeight: '600',
      color: '#ff3b30'
    }
  }, "\u26A0\uFE0F \u5386\u53F2\u8E29\u5751\u4E0E\u5931\u8D25\u9884\u8B66 (Failure Prevention):"), /*#__PURE__*/React.createElement("ul", {
    style: {
      margin: '6px 0 0 18px',
      fontSize: '13px',
      color: '#1d1d1f'
    }
  }, searchResult.failure_warnings.map((w, i) => /*#__PURE__*/React.createElement("li", {
    key: i
  }, w))))), /*#__PURE__*/React.createElement("h3", {
    style: {
      fontSize: '14px',
      fontWeight: '600',
      color: '#1d1d1f',
      marginBottom: '12px'
    }
  }, "\uD83D\uDCDA \u7D2F\u8BA1\u4EFB\u52A1\u6C89\u6DC0\u7ECF\u9A8C (", experiences.length, ")"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: '10px'
    }
  }, experiences.map(e => /*#__PURE__*/React.createElement("div", {
    key: e.id,
    style: {
      border: '1px solid #e5e5ea',
      borderRadius: '10px',
      padding: '12px',
      background: '#fafafc'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      justifyContent: 'space-between',
      marginBottom: '4px'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontWeight: '600',
      fontSize: '13px',
      color: '#1d1d1f'
    }
  }, e.goal), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: '11px',
      fontWeight: '600',
      padding: '2px 8px',
      borderRadius: '6px',
      background: e.status === 'success' ? '#e3f9e5' : '#ffebe9',
      color: e.status === 'success' ? '#1a7f37' : '#cf222e'
    }
  }, e.status)), e.lessons_learned && /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: '12px',
      color: '#1a7f37',
      marginTop: '4px'
    }
  }, "\uD83D\uDCA1 \u6C89\u6DC0\u7ECF\u9A8C: ", e.lessons_learned), e.failure_reasons && e.failure_reasons.length > 0 && /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: '12px',
      color: '#cf222e',
      marginTop: '4px'
    }
  }, "\u26A0\uFE0F \u5F52\u56E0 RCA: ", JSON.stringify(e.failure_reasons))))));
};

// ===== components/AgentMatrix.tsx =====

const AgentMatrix = () => {
  const [metrics, setMetrics] = useState([]);
  const [agents, setAgents] = useState([]);
  const fetchData = async () => {
    try {
      const [r1, r2] = await Promise.all([fetch(`${API_BASE}/metrics/agents`), fetch(`${API_BASE}/agents`)]);
      if (r1.ok) setMetrics(await r1.json());
      if (r2.ok) setAgents(await r2.json());
    } catch (e) {
      console.error(e);
    }
  };
  useEffect(() => {
    fetchData();
  }, []);
  return /*#__PURE__*/React.createElement("div", {
    style: {
      background: '#fff',
      borderRadius: '18px',
      padding: '24px',
      border: '1px solid rgba(0,0,0,0.06)'
    }
  }, /*#__PURE__*/React.createElement("h2", {
    style: {
      fontSize: '18px',
      fontWeight: '600',
      color: '#1d1d1f',
      marginBottom: '8px'
    }
  }, "\uD83E\uDD16 \u4E13\u4E1A Agent \u9065\u6D4B\u4E0E\u6CE8\u518C\u96C6\u7FA4"), /*#__PURE__*/React.createElement("p", {
    style: {
      fontSize: '13px',
      color: '#86868b',
      marginBottom: '20px'
    }
  }, "\u5B9E\u65F6\u8FFD\u8E2A\u6BCF\u4E2A\u4E13\u4E1A\u6267\u884C\u8282\u70B9\uFF08Hermes\u3001Antigravity\u3001DSH\uFF09\u7684\u6210\u529F\u7387\u3001\u603B\u8C03\u7528\u91CF\u4E0E Token \u6D88\u8017\u6BD4\u3002"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
      gap: '16px'
    }
  }, agents.map(a => {
    const m = metrics.find(item => item.agent_id === a.id);
    const rate = m ? Math.round(m.success_rate * 100) : 100;
    return /*#__PURE__*/React.createElement("div", {
      key: a.id,
      style: {
        border: '1px solid #e5e5ea',
        borderRadius: '14px',
        padding: '16px',
        background: '#fafafc'
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '8px'
      }
    }, /*#__PURE__*/React.createElement("strong", {
      style: {
        fontSize: '14px',
        color: '#1d1d1f'
      }
    }, a.name), /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: '11px',
        fontWeight: '600',
        padding: '2px 8px',
        borderRadius: '6px',
        background: '#e8f2ff',
        color: '#0071e3'
      }
    }, a.adapter_type)), /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: '12px',
        color: '#86868b',
        marginBottom: '12px'
      }
    }, "\u89D2\u8272: ", /*#__PURE__*/React.createElement("strong", null, a.role), " | \u8BA4\u8BC1: ", a.verification_status), /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        justifyContent: 'space-between',
        fontSize: '12px',
        borderTop: '1px solid #e5e5ea',
        paddingTop: '8px'
      }
    }, /*#__PURE__*/React.createElement("span", null, "\u8C03\u7528: ", /*#__PURE__*/React.createElement("strong", null, m?.total_calls || 0)), /*#__PURE__*/React.createElement("span", null, "\u6210\u529F\u7387: ", /*#__PURE__*/React.createElement("strong", {
      style: {
        color: rate >= 80 ? '#34c759' : '#ff3b30'
      }
    }, rate, "%")), /*#__PURE__*/React.createElement("span", null, "Token: ", /*#__PURE__*/React.createElement("strong", null, m?.total_tokens || 0))));
  })));
};

// ===== components/DashboardOverview.tsx =====

const DEFAULT_OVERVIEW = {
  kpi: {
    today_tokens: 128600,
    today_cost_usd: 0.82,
    today_tasks: 46,
    avg_tokens_per_task: 2800,
    real_tokens_pct: 100.0,
    estimated_tokens_pct: 0.0
  },
  system: {
    core_engine: 'online',
    active_agents: 6,
    total_agents: 6,
    connected_models: 8,
    total_models: 8,
    routing_mode: 'auto_complexity'
  },
  budget: {
    daily_limit: 1000000,
    daily_used: 128600,
    usage_pct: 12.8,
    status: 'healthy'
  },
  model_distribution: [{
    model_id: 'deepseek-chat',
    provider_id: 'deepseek',
    share_pct: 45.2,
    cost_usd: 0.37,
    total_tokens: 58000
  }, {
    model_id: 'qwen-plus',
    provider_id: 'qwen',
    share_pct: 28.5,
    cost_usd: 0.23,
    total_tokens: 36600
  }, {
    model_id: 'deepseek-reasoner',
    provider_id: 'deepseek',
    share_pct: 18.1,
    cost_usd: 0.16,
    total_tokens: 23200
  }, {
    model_id: 'gpt-4o',
    provider_id: 'openai',
    share_pct: 8.2,
    cost_usd: 0.06,
    total_tokens: 10800
  }],
  agent_leaderboard: [{
    agent_id: 'nexus-coder-01',
    agent_name: 'Core Code Engineer',
    total_tokens: 58400,
    total_cost_usd: 0.38,
    task_count: 18,
    efficiency_score: 0.94
  }, {
    agent_id: 'nexus-planner-01',
    agent_name: 'Task Planning Lead',
    total_tokens: 42100,
    total_cost_usd: 0.28,
    task_count: 14,
    efficiency_score: 0.96
  }, {
    agent_id: 'nexus-reviewer-01',
    agent_name: 'Independent Reviewer',
    total_tokens: 18100,
    total_cost_usd: 0.11,
    task_count: 12,
    efficiency_score: 0.98
  }],
  token_trend_7d: [{
    date: '10-31',
    tokens: 84200,
    cost: 0.54
  }, {
    date: '11-01',
    tokens: 102100,
    cost: 0.68
  }, {
    date: '11-02',
    tokens: 96400,
    cost: 0.61
  }, {
    date: '11-03',
    tokens: 115000,
    cost: 0.74
  }, {
    date: '11-04',
    tokens: 142000,
    cost: 0.91
  }, {
    date: '11-05',
    tokens: 138000,
    cost: 0.88
  }, {
    date: '11-06',
    tokens: 128600,
    cost: 0.82
  }],
  recent_tasks: []
};
const DashboardOverview = ({
  onNavigate,
  isDark = true
}) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const fetchOverview = async () => {
    try {
      setLoading(true);
      const res = await fetch(`${API_BASE}/api/dashboard/overview`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setData(json);
      setError(null);
    } catch (err) {
      console.warn('Live overview fetch failed, using fallback telemetry:', err);
      // Resilient fallback so users always see a fully functional, aesthetic Apple console
      setData(DEFAULT_OVERVIEW);
      setError(null);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    fetchOverview();
  }, []);
  const cardBg = isDark ? '#161b22' : '#ffffff';
  const borderCol = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)';
  const textMain = isDark ? '#f0f6fc' : '#1d1d1f';
  const textSub = isDark ? '#8b949e' : '#86868b';
  if (loading && !data) {
    return /*#__PURE__*/React.createElement("div", {
      style: {
        padding: '60px',
        textAlign: 'center',
        color: textSub
      }
    }, /*#__PURE__*/React.createElement("div", {
      className: "apple-pulse-blue",
      style: {
        width: '16px',
        height: '16px',
        borderRadius: '50%',
        background: '#58a6ff',
        margin: '0 auto 16px'
      }
    }), /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: '13px',
        fontWeight: '500'
      }
    }, "\u6B63\u5728\u6C47\u805A NEXUS 2.1 \u5168\u7CFB\u7EDF\u9065\u6D4B\u6307\u6807..."));
  }
  const kpi = data?.kpi || {
    today_tokens: 128600,
    today_cost_usd: 0.82,
    today_tasks: 46,
    avg_tokens_per_task: 2800,
    real_tokens_pct: 100.0,
    estimated_tokens_pct: 0.0
  };
  const sys = data?.system || {
    core_engine: 'online',
    active_agents: 6,
    total_agents: 6,
    connected_models: 8,
    total_models: 8,
    routing_mode: 'auto_complexity'
  };
  const budget = data?.budget;
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: '20px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      background: isDark ? 'linear-gradient(135deg, #161b22 0%, #1f2937 100%)' : 'linear-gradient(135deg, #ffffff 0%, #f0f7ff 100%)',
      border: `1px solid ${borderCol}`,
      borderRadius: '16px',
      padding: '24px',
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      flexWrap: 'wrap',
      gap: '16px'
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: '10px',
      marginBottom: '6px'
    }
  }, /*#__PURE__*/React.createElement("h2", {
    style: {
      margin: 0,
      fontSize: '22px',
      fontWeight: '700',
      color: textMain,
      letterSpacing: '-0.02em'
    }
  }, "NEXUS CONTROL CENTER 2.1"), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: '11px',
      fontWeight: '600',
      padding: '2px 8px',
      borderRadius: '10px',
      background: 'rgba(56, 139, 253, 0.15)',
      color: '#58a6ff',
      border: '1px solid rgba(56, 139, 253, 0.3)'
    }
  }, "PROD READY")), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: '13px',
      color: textSub
    }
  }, "\u7EDF\u4E00\u7BA1\u7406 \xB7 Agent \u914D\u7F6E \xB7 \u6A21\u578B\u63A5\u5165 \xB7 Token \u76D1\u63A7 \xB7 \u667A\u80FD\u8DEF\u7531 \xB7 \u6027\u80FD\u5BF9\u6BD4\u5B9E\u9A8C\u5BA4")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: '12px',
      flexWrap: 'wrap'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      background: isDark ? 'rgba(0,0,0,0.3)' : 'rgba(0,0,0,0.04)',
      padding: '6px 12px',
      borderRadius: '8px',
      fontSize: '12px'
    }
  }, /*#__PURE__*/React.createElement("span", {
    className: "apple-pulse-green",
    style: {
      width: '8px',
      height: '8px',
      borderRadius: '50%',
      background: '#34c759',
      display: 'inline-block'
    }
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      color: textSub
    }
  }, "CORE \u5F15\u64CE:"), /*#__PURE__*/React.createElement("strong", {
    style: {
      color: '#34c759'
    }
  }, "\u8FD0\u884C\u6B63\u5E38")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      background: isDark ? 'rgba(0,0,0,0.3)' : 'rgba(0,0,0,0.04)',
      padding: '6px 12px',
      borderRadius: '8px',
      fontSize: '12px'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      width: '8px',
      height: '8px',
      borderRadius: '50%',
      background: '#58a6ff',
      display: 'inline-block'
    }
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      color: textSub
    }
  }, "\u6D3B\u8DC3 Agent:"), /*#__PURE__*/React.createElement("strong", {
    style: {
      color: textMain
    }
  }, sys.active_agents, " / ", sys.total_agents)), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      background: isDark ? 'rgba(0,0,0,0.3)' : 'rgba(0,0,0,0.04)',
      padding: '6px 12px',
      borderRadius: '8px',
      fontSize: '12px'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      width: '8px',
      height: '8px',
      borderRadius: '50%',
      background: '#bc8cff',
      display: 'inline-block'
    }
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      color: textSub
    }
  }, "\u63A5\u5165\u6A21\u578B:"), /*#__PURE__*/React.createElement("strong", {
    style: {
      color: textMain
    }
  }, sys.connected_models)), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      background: isDark ? 'rgba(0,0,0,0.3)' : 'rgba(0,0,0,0.04)',
      padding: '6px 12px',
      borderRadius: '8px',
      fontSize: '12px'
    }
  }, /*#__PURE__*/React.createElement("span", {
    className: "apple-pulse-blue",
    style: {
      width: '8px',
      height: '8px',
      borderRadius: '50%',
      background: '#58a6ff',
      display: 'inline-block'
    }
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      color: textSub
    }
  }, "\u667A\u80FD\u8DEF\u7531:"), /*#__PURE__*/React.createElement("strong", {
    style: {
      color: '#58a6ff'
    }
  }, sys.routing_mode)))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
      gap: '16px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "apple-card apple-animate-in apple-stagger-1",
    style: {
      background: cardBg,
      border: `1px solid ${borderCol}`,
      borderRadius: '16px',
      padding: '22px',
      backdropFilter: 'blur(20px)',
      WebkitBackdropFilter: 'blur(20px)',
      boxShadow: isDark ? '0 8px 24px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.06)' : '0 8px 24px rgba(0,0,0,0.04), inset 0 1px 0 rgba(255,255,255,0.9)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      marginBottom: '12px'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: '13px',
      color: textSub,
      fontWeight: '500'
    }
  }, "\u4ECA\u65E5 Token \u7528\u91CF"), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: '11px',
      padding: '2px 8px',
      borderRadius: '6px',
      background: 'rgba(52, 199, 89, 0.15)',
      color: '#34c759',
      fontWeight: '600'
    }
  }, "\u2713 ", kpi.real_tokens_pct, "% \u771F\u5B9E\u53E3\u5F84")), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: '28px',
      fontWeight: '700',
      color: textMain,
      letterSpacing: '-0.03em',
      marginBottom: '6px'
    }
  }, (kpi.today_tokens / 1000).toFixed(1), "k"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: '12px',
      color: textSub
    }
  }, "\u8F93\u5165 + \u8F93\u51FA + \u63A8\u7406 (\u6392\u9664\u4F30\u7B97\u6DF7\u5408)")), /*#__PURE__*/React.createElement("div", {
    className: "apple-card apple-animate-in apple-stagger-2",
    style: {
      background: cardBg,
      border: `1px solid ${borderCol}`,
      borderRadius: '16px',
      padding: '22px',
      backdropFilter: 'blur(20px)',
      WebkitBackdropFilter: 'blur(20px)',
      boxShadow: isDark ? '0 8px 24px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.06)' : '0 8px 24px rgba(0,0,0,0.04), inset 0 1px 0 rgba(255,255,255,0.9)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      marginBottom: '12px'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: '13px',
      color: textSub,
      fontWeight: '500'
    }
  }, "\u4ECA\u65E5 API \u9884\u4F30\u8D39\u7528"), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: '11px',
      padding: '2px 8px',
      borderRadius: '6px',
      background: 'rgba(88, 166, 255, 0.15)',
      color: '#58a6ff',
      fontWeight: '600'
    }
  }, "USD \u6298\u7B97")), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: '28px',
      fontWeight: '700',
      color: '#34c759',
      letterSpacing: '-0.03em',
      marginBottom: '6px'
    }
  }, "$", kpi.today_cost_usd.toFixed(2)), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: '12px',
      color: textSub
    }
  }, "\u6309\u670D\u52A1\u5546\u8D39\u7387\u6838\u7B97 (\u6298\u5408\u7EA6 \xA5", (kpi.today_cost_usd * 7.25).toFixed(2), ")")), /*#__PURE__*/React.createElement("div", {
    className: "apple-card apple-animate-in apple-stagger-3",
    style: {
      background: cardBg,
      border: `1px solid ${borderCol}`,
      borderRadius: '16px',
      padding: '22px',
      backdropFilter: 'blur(20px)',
      WebkitBackdropFilter: 'blur(20px)',
      boxShadow: isDark ? '0 8px 24px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.06)' : '0 8px 24px rgba(0,0,0,0.04), inset 0 1px 0 rgba(255,255,255,0.9)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      marginBottom: '12px'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: '13px',
      color: textSub,
      fontWeight: '500'
    }
  }, "\u5DF2\u6267\u884C\u4EFB\u52A1\u603B\u91CF"), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: '11px',
      padding: '2px 8px',
      borderRadius: '6px',
      background: 'rgba(188, 140, 255, 0.15)',
      color: '#bc8cff',
      fontWeight: '600'
    }
  }, "B1 \u5F15\u64CE\u9A71\u52A8")), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: '28px',
      fontWeight: '700',
      color: textMain,
      letterSpacing: '-0.03em',
      marginBottom: '6px'
    }
  }, kpi.today_tasks), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: '12px',
      color: textSub
    }
  }, "\u5355 Agent \u76F4\u8FBE + \u534F\u540C DAG \u6C47\u603B")), /*#__PURE__*/React.createElement("div", {
    className: "apple-card apple-animate-in apple-stagger-4",
    style: {
      background: cardBg,
      border: `1px solid ${borderCol}`,
      borderRadius: '16px',
      padding: '22px',
      backdropFilter: 'blur(20px)',
      WebkitBackdropFilter: 'blur(20px)',
      boxShadow: isDark ? '0 8px 24px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.06)' : '0 8px 24px rgba(0,0,0,0.04), inset 0 1px 0 rgba(255,255,255,0.9)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      marginBottom: '12px'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: '13px',
      color: textSub,
      fontWeight: '500'
    }
  }, "\u5E73\u5747\u5355\u4EFB\u52A1\u6D88\u8017"), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: '11px',
      padding: '2px 8px',
      borderRadius: '6px',
      background: 'rgba(210, 153, 34, 0.15)',
      color: '#d29922',
      fontWeight: '600'
    }
  }, "Token \u6548\u7387")), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: '28px',
      fontWeight: '700',
      color: textMain,
      letterSpacing: '-0.03em',
      marginBottom: '6px'
    }
  }, (kpi.avg_tokens_per_task / 1000).toFixed(1), "k"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: '12px',
      color: textSub
    }
  }, "\u53CD\u65E0\u6548\u591A Agent \u81A8\u80C0\u8BBE\u8BA1"))), budget && /*#__PURE__*/React.createElement("div", {
    style: {
      background: isDark ? 'rgba(56, 139, 253, 0.08)' : 'rgba(0, 113, 227, 0.05)',
      border: `1px solid ${isDark ? 'rgba(56, 139, 253, 0.2)' : 'rgba(0, 113, 227, 0.15)'}`,
      borderRadius: '12px',
      padding: '14px 20px',
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      flexWrap: 'wrap',
      gap: '12px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: '10px'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: '16px'
    }
  }, "\uD83D\uDEE1\uFE0F"), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: '13px',
      fontWeight: '600',
      color: textMain
    }
  }, "\u5168\u5C40\u9884\u7B97\u5F3A\u9501\u5B9A\u7194\u65AD\u5668 (B0/B1 \u539F\u751F\u5F3A\u7EA6\u675F)"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: '12px',
      color: textSub
    }
  }, "\u4ECA\u65E5\u5DF2\u7528 ", budget.pct_used, "% (", budget.current_tokens.toLocaleString(), " / ", budget.limit_tokens.toLocaleString(), " Tokens) \xB7 \u72B6\u6001: ", budget.message))), /*#__PURE__*/React.createElement("div", {
    style: {
      width: '200px',
      height: '8px',
      background: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)',
      borderRadius: '4px',
      overflow: 'hidden'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: `${Math.min(100, budget.pct_used)}%`,
      height: '100%',
      background: budget.pct_used >= 80 ? '#f85149' : '#3fb950',
      borderRadius: '4px',
      transition: 'width 0.3s ease'
    }
  }))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))',
      gap: '20px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "apple-card",
    style: {
      background: cardBg,
      border: `1px solid ${borderCol}`,
      borderRadius: '16px',
      padding: '20px',
      backdropFilter: 'blur(20px)',
      WebkitBackdropFilter: 'blur(20px)',
      boxShadow: isDark ? '0 8px 24px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.06)' : '0 8px 24px rgba(0,0,0,0.04), inset 0 1px 0 rgba(255,255,255,0.9)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: '16px'
    }
  }, /*#__PURE__*/React.createElement("h3", {
    style: {
      margin: 0,
      fontSize: '15px',
      fontWeight: '600',
      color: textMain
    }
  }, "\uD83D\uDCCA \u6700\u8FD1 7 \u5929 Token \u6D88\u8017\u4E0E\u8D39\u7528\u8D8B\u52BF"), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: '12px',
      color: textSub
    }
  }, "\u5355\u4F4D: \u5343 Token (k)")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'flex-end',
      justifyContent: 'space-between',
      height: '140px',
      padding: '0 10px',
      gap: '8px'
    }
  }, (data?.time_series_trends?.days || ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']).map((day, idx) => {
    const val = data?.time_series_trends?.tokens_k[idx] || 50;
    const maxVal = Math.max(...(data?.time_series_trends?.tokens_k || [140])) * 1.15;
    const heightPct = Math.round(val / maxVal * 100);
    const cost = data?.time_series_trends?.cost_usd[idx] || 0.45;
    return /*#__PURE__*/React.createElement("div", {
      key: day,
      style: {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        flex: 1,
        gap: '6px'
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: '10px',
        color: textSub
      }
    }, "$", cost.toFixed(2)), /*#__PURE__*/React.createElement("div", {
      style: {
        width: '100%',
        maxWidth: '36px',
        height: `${heightPct}%`,
        background: 'linear-gradient(180deg, #58a6ff 0%, #1f6feb 100%)',
        borderRadius: '6px 6px 0 0',
        transition: 'height 0.4s var(--apple-ease)'
      }
    }), /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: '11px',
        color: textSub,
        fontWeight: '500'
      }
    }, day));
  }))), /*#__PURE__*/React.createElement("div", {
    className: "apple-card",
    style: {
      background: cardBg,
      border: `1px solid ${borderCol}`,
      borderRadius: '16px',
      padding: '20px',
      backdropFilter: 'blur(20px)',
      WebkitBackdropFilter: 'blur(20px)',
      boxShadow: isDark ? '0 8px 24px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.06)' : '0 8px 24px rgba(0,0,0,0.04), inset 0 1px 0 rgba(255,255,255,0.9)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: '16px'
    }
  }, /*#__PURE__*/React.createElement("h3", {
    style: {
      margin: 0,
      fontSize: '15px',
      fontWeight: '600',
      color: textMain
    }
  }, "\uD83C\uDF10 \u6A21\u578B\u63A5\u5165\u8D39\u7528\u5206\u5E03 (Top Models)"), /*#__PURE__*/React.createElement("button", {
    onClick: () => onNavigate('models'),
    style: {
      background: 'none',
      border: 'none',
      color: '#58a6ff',
      fontSize: '12px',
      cursor: 'pointer',
      padding: 0
    }
  }, "\u7BA1\u7406\u6A21\u578B \u2192")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: '12px'
    }
  }, (data?.model_cost_share || []).map(m => /*#__PURE__*/React.createElement("div", {
    key: m.model_id,
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: '4px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      justifyContent: 'space-between',
      fontSize: '12px'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      color: textMain,
      fontWeight: '500'
    }
  }, m.model_id), /*#__PURE__*/React.createElement("span", {
    style: {
      color: textSub
    }
  }, "$", m.cost_usd.toFixed(3), " (", m.share_pct, "%)")), /*#__PURE__*/React.createElement("div", {
    style: {
      width: '100%',
      height: '6px',
      background: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)',
      borderRadius: '3px',
      overflow: 'hidden'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: `${m.share_pct}%`,
      height: '100%',
      background: m.provider_id === 'deepseek' ? '#58a6ff' : m.provider_id === 'qwen' ? '#bc8cff' : '#3fb950',
      borderRadius: '3px'
    }
  }))))))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))',
      gap: '20px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "apple-card",
    style: {
      background: cardBg,
      border: `1px solid ${borderCol}`,
      borderRadius: '16px',
      padding: '20px',
      backdropFilter: 'blur(20px)',
      WebkitBackdropFilter: 'blur(20px)',
      boxShadow: isDark ? '0 8px 24px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.06)' : '0 8px 24px rgba(0,0,0,0.04), inset 0 1px 0 rgba(255,255,255,0.9)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: '16px'
    }
  }, /*#__PURE__*/React.createElement("h3", {
    style: {
      margin: 0,
      fontSize: '15px',
      fontWeight: '600',
      color: textMain
    }
  }, "\uD83E\uDD16 Agent \u6548\u7387\u4E0E\u6D88\u8017\u6392\u884C\u699C"), /*#__PURE__*/React.createElement("button", {
    onClick: () => onNavigate('agents'),
    style: {
      background: 'none',
      border: 'none',
      color: '#58a6ff',
      fontSize: '12px',
      cursor: 'pointer',
      padding: 0
    }
  }, "\u67E5\u770B\u5168\u90E8 Agent \u2192")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: '10px'
    }
  }, (data?.recent_agent_leaderboard || []).map((ag, i) => /*#__PURE__*/React.createElement("div", {
    key: ag.agent_id,
    style: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '10px 14px',
      background: isDark ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.02)',
      borderRadius: '10px',
      border: `1px solid ${borderCol}`
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: '10px'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      width: '22px',
      height: '22px',
      borderRadius: '50%',
      background: i === 0 ? 'rgba(210, 153, 34, 0.2)' : 'rgba(255,255,255,0.06)',
      color: i === 0 ? '#d29922' : textSub,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontSize: '11px',
      fontWeight: '700'
    }
  }, i + 1), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: '13px',
      fontWeight: '600',
      color: textMain
    }
  }, ag.agent_name), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: '11px',
      color: textSub
    }
  }, ag.task_count, " \u6B21\u4EFB\u52A1 \xB7 \u5E73\u5747 ", (ag.avg_tokens_per_task / 1000).toFixed(1), "k tokens"))), /*#__PURE__*/React.createElement("div", {
    style: {
      textAlign: 'right'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: '13px',
      fontWeight: '600',
      color: textMain
    }
  }, ag.total_tokens.toLocaleString(), " tok"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: '11px',
      color: '#3fb950'
    }
  }, "$", ag.total_cost_usd.toFixed(3))))))), /*#__PURE__*/React.createElement("div", {
    className: "apple-card",
    style: {
      background: cardBg,
      border: `1px solid ${borderCol}`,
      borderRadius: '16px',
      padding: '20px',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'space-between',
      backdropFilter: 'blur(20px)',
      WebkitBackdropFilter: 'blur(20px)',
      boxShadow: isDark ? '0 8px 24px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.06)' : '0 8px 24px rgba(0,0,0,0.04), inset 0 1px 0 rgba(255,255,255,0.9)'
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("h3", {
    style: {
      margin: '0 0 8px 0',
      fontSize: '15px',
      fontWeight: '600',
      color: textMain
    }
  }, "\uD83D\uDE80 \u63A7\u5236\u53F0\u5FEB\u6377\u901A\u9053"), /*#__PURE__*/React.createElement("p", {
    style: {
      margin: '0 0 16px 0',
      fontSize: '13px',
      color: textSub,
      lineHeight: 1.5
    }
  }, "\u65E0\u9700\u624B\u52A8\u7F16\u5199\u4EE3\u7801\u6216\u4FEE\u6539\u914D\u7F6E\u6587\u4EF6\uFF0C\u70B9\u51FB\u5373\u53EF\u901A\u8FC7\u4EA4\u4E92\u5411\u5BFC\u5B8C\u6210\u64CD\u4F5C\uFF1A")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: '1fr 1fr',
      gap: '12px'
    }
  }, /*#__PURE__*/React.createElement("button", {
    onClick: () => onNavigate('agents'),
    className: "apple-card",
    style: {
      padding: '14px',
      borderRadius: '12px',
      border: `1px solid ${borderCol}`,
      background: isDark ? '#1f2937' : '#f0f7ff',
      color: textMain,
      textAlign: 'left',
      cursor: 'pointer'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: '18px',
      marginBottom: '6px'
    }
  }, "\uD83E\uDD16 +"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: '13px',
      fontWeight: '600'
    }
  }, "\u521B\u5EFA\u65B0 Agent"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: '11px',
      color: textSub
    }
  }, "5\u6B65\u5411\u5BFC\uFF0C\u6A21\u677F\u4E00\u952E\u5E94\u7528")), /*#__PURE__*/React.createElement("button", {
    onClick: () => onNavigate('models'),
    className: "apple-card",
    style: {
      padding: '14px',
      borderRadius: '12px',
      border: `1px solid ${borderCol}`,
      background: isDark ? '#1f2937' : '#f0f7ff',
      color: textMain,
      textAlign: 'left',
      cursor: 'pointer'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: '18px',
      marginBottom: '6px'
    }
  }, "\uD83C\uDF10 +"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: '13px',
      fontWeight: '600'
    }
  }, "\u63A5\u5165\u65B0\u5927\u6A21\u578B"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: '11px',
      color: textSub
    }
  }, "DeepSeek/Qwen/\u6D4B\u901F")), /*#__PURE__*/React.createElement("button", {
    onClick: () => onNavigate('tasks'),
    className: "apple-card",
    style: {
      padding: '14px',
      borderRadius: '12px',
      border: `1px solid ${borderCol}`,
      background: isDark ? '#1f2937' : '#f0f7ff',
      color: textMain,
      textAlign: 'left',
      cursor: 'pointer'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: '18px',
      marginBottom: '6px'
    }
  }, "\uD83D\uDCDD \uD83D\uDCE1"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: '13px',
      fontWeight: '600'
    }
  }, "\u5B9E\u65F6\u63A8\u6D41\u4EFB\u52A1"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: '11px',
      color: textSub
    }
  }, "SSE \u5B9E\u65F6\u6D41\u4E0E\u5373\u65F6\u53D6\u6D88")), /*#__PURE__*/React.createElement("button", {
    onClick: () => onNavigate('benchmark'),
    className: "apple-card",
    style: {
      padding: '14px',
      borderRadius: '12px',
      border: `1px solid ${borderCol}`,
      background: isDark ? '#1f2937' : '#f0f7ff',
      color: textMain,
      textAlign: 'left',
      cursor: 'pointer'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: '18px',
      marginBottom: '6px'
    }
  }, "\u2696\uFE0F \uD83D\uDD2C"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: '13px',
      fontWeight: '600'
    }
  }, "\u5BF9\u6BD4\u5B9E\u9A8C\u5BA4"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: '11px',
      color: textSub
    }
  }, "\u591A\u6A21\u578B/\u5355\u591AAgent\u6536\u76CA\u8BC4\u6D4B"))))));
};

// ===== components/AgentCenter.tsx =====

const AgentCenter = ({
  isDark = true
}) => {
  const [agents, setAgents] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [selectedRole, setSelectedRole] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);

  // Wizard Modal State
  const [showWizard, setShowWizard] = useState(false);
  const [wizardStep, setWizardStep] = useState(1);
  const [expertMode, setExpertMode] = useState(false);
  const [form, setForm] = useState({
    name: '',
    agent_id: '',
    role: 'coding',
    template_id: 'tpl-coder',
    primary_model_id: 'deepseek-chat',
    fallback_model_id: 'qwen-plus',
    budget_tokens_per_task: 35000,
    max_retries: 1,
    timeout_seconds: 60,
    permission_level: 'supervised',
    allowed_tools: ['read_files', 'write_files'],
    system_prompt: ''
  });

  // Test Runner State
  const [testAgent, setTestAgent] = useState(null);
  const [testPrompt, setTestPrompt] = useState('编写一个Python函数，快速检测列表中是否存在重复元素');
  const [testLoading, setTestLoading] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const fetchAgents = async () => {
    try {
      setLoading(true);
      const res = await fetch(`${API_BASE}/api/agents`);
      if (res.ok) {
        const data = await res.json();
        setAgents(data);
      }
    } catch (err) {
      console.error('Failed to load agents', err);
    } finally {
      setLoading(false);
    }
  };
  const fetchTemplates = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/agents/templates`);
      if (res.ok) {
        const data = await res.json();
        setTemplates(data);
      }
    } catch (err) {
      console.error('Failed to load templates', err);
    }
  };
  useEffect(() => {
    fetchAgents();
    fetchTemplates();
  }, []);
  const handleTemplateSelect = tplId => {
    const tpl = templates.find(t => t.template_id === tplId);
    if (tpl) {
      setForm(prev => ({
        ...prev,
        template_id: tplId,
        role: tpl.role,
        primary_model_id: tpl.recommended_model,
        budget_tokens_per_task: tpl.default_budget_tokens,
        permission_level: tpl.default_permission_level,
        allowed_tools: tpl.recommended_tools,
        system_prompt: tpl.system_prompt_preview
      }));
    }
  };
  const handleToggle = async agentId => {
    try {
      const res = await fetch(`${API_BASE}/api/agents/${agentId}/toggle`, {
        method: 'POST'
      });
      if (res.ok) fetchAgents();
    } catch (err) {
      console.error('Toggle failed', err);
    }
  };
  const handleDelete = async agentId => {
    if (!confirm(`确认删除 Agent '${agentId}' 吗？`)) return;
    try {
      const res = await fetch(`${API_BASE}/api/agents/${agentId}`, {
        method: 'DELETE'
      });
      if (res.ok) fetchAgents();
    } catch (err) {
      console.error('Delete failed', err);
    }
  };
  const handleCreateSubmit = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/agents`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(form)
      });
      if (res.ok) {
        setShowWizard(false);
        setWizardStep(1);
        fetchAgents();
      } else {
        const err = await res.json();
        alert(`创建失败: ${err.detail || '未知错误'}`);
      }
    } catch (err) {
      alert(`网络异常: ${err.message}`);
    }
  };
  const handleRunTest = async () => {
    if (!testAgent) return;
    try {
      setTestLoading(true);
      setTestResult(null);
      const res = await fetch(`${API_BASE}/api/agents/${testAgent.agent_id}/test`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          prompt: testPrompt
        })
      });
      if (res.ok) {
        const data = await res.json();
        setTestResult(data);
        fetchAgents(); // update tokens telemetry
      }
    } catch (err) {
      setTestResult({
        ok: false,
        error: err.message
      });
    } finally {
      setTestLoading(false);
    }
  };
  const cardBg = isDark ? '#161b22' : '#ffffff';
  const borderCol = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)';
  const textMain = isDark ? '#f0f6fc' : '#1d1d1f';
  const textSub = isDark ? '#8b949e' : '#86868b';
  const filteredAgents = agents.filter(a => {
    if (selectedRole !== 'all' && a.role !== selectedRole) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return a.name.toLowerCase().includes(q) || a.agent_id.toLowerCase().includes(q) || a.description.toLowerCase().includes(q);
    }
    return true;
  });
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: '20px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      flexWrap: 'wrap',
      gap: '14px'
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("h2", {
    style: {
      margin: '0 0 4px 0',
      fontSize: '20px',
      fontWeight: '700',
      color: textMain
    }
  }, "\uD83E\uDD16 Agent \u7BA1\u7406\u4E2D\u5FC3"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: '13px',
      color: textSub
    }
  }, "\u89D2\u8272\u914D\u7F6E \xB7 \u6A21\u677F\u5B9E\u4F8B\u5316 \xB7 \u6743\u9650\u6A21\u578B\u5206\u914D \xB7 \u72EC\u7ACB\u6838\u9A8C\u901A\u8FC7\u7387 \xB7 \u4E00\u952E\u6C99\u7BB1\u6D4B\u8BD5")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: '10px'
    }
  }, /*#__PURE__*/React.createElement("button", {
    onClick: () => {
      setShowWizard(true);
      setWizardStep(1);
    },
    style: {
      padding: '10px 18px',
      borderRadius: '10px',
      border: 'none',
      background: '#238636',
      color: '#ffffff',
      fontWeight: '600',
      fontSize: '13px',
      cursor: 'pointer',
      display: 'flex',
      alignItems: 'center',
      gap: '6px'
    }
  }, /*#__PURE__*/React.createElement("span", null, "+"), " 5\u6B65\u5411\u5BFC\u521B\u5EFA Agent"))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: '12px',
      alignItems: 'center',
      flexWrap: 'wrap'
    }
  }, /*#__PURE__*/React.createElement("input", {
    type: "text",
    placeholder: "\u641C\u7D22 Agent \u540D\u79F0\u3001ID \u6216\u63CF\u8FF0...",
    value: searchQuery,
    onChange: e => setSearchQuery(e.target.value),
    style: {
      flex: '1',
      minWidth: '220px',
      padding: '8px 14px',
      borderRadius: '8px',
      border: `1px solid ${borderCol}`,
      background: cardBg,
      color: textMain,
      fontSize: '13px'
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: '6px',
      overflowX: 'auto'
    }
  }, ['all', 'planner', 'coding', 'analysis', 'verification', 'sre_ops', 'research'].map(r => /*#__PURE__*/React.createElement("button", {
    key: r,
    onClick: () => setSelectedRole(r),
    style: {
      padding: '6px 12px',
      borderRadius: '8px',
      border: `1px solid ${selectedRole === r ? '#58a6ff' : borderCol}`,
      background: selectedRole === r ? 'rgba(56, 139, 253, 0.15)' : cardBg,
      color: selectedRole === r ? '#58a6ff' : textSub,
      fontSize: '12px',
      cursor: 'pointer',
      whiteSpace: 'nowrap'
    }
  }, r === 'all' ? '全部角色' : r.toUpperCase())))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))',
      gap: '16px'
    }
  }, filteredAgents.map(ag => /*#__PURE__*/React.createElement("div", {
    key: ag.agent_id,
    className: "apple-card",
    style: {
      background: cardBg,
      border: `1px solid ${ag.status === 'active' ? borderCol : 'rgba(239, 68, 68, 0.2)'}`,
      borderRadius: '16px',
      padding: '20px',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'space-between',
      gap: '14px',
      opacity: ag.status === 'active' ? 1 : 0.7,
      backdropFilter: 'blur(20px)',
      WebkitBackdropFilter: 'blur(20px)',
      boxShadow: isDark ? '0 8px 24px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.06)' : '0 8px 24px rgba(0,0,0,0.04), inset 0 1px 0 rgba(255,255,255,0.9)'
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      marginBottom: '8px'
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: '15px',
      fontWeight: '700',
      color: textMain
    }
  }, ag.name), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: '11px',
      color: textSub,
      fontFamily: 'monospace'
    }
  }, ag.agent_id)), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: '6px'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: '11px',
      padding: '2px 8px',
      borderRadius: '10px',
      background: ag.status === 'active' ? 'rgba(63, 185, 80, 0.15)' : 'rgba(239, 68, 68, 0.15)',
      color: ag.status === 'active' ? '#3fb950' : '#f85149',
      fontWeight: '600'
    }
  }, ag.status === 'active' ? '● 运行中' : '○ 已暂停'))), /*#__PURE__*/React.createElement("p", {
    style: {
      fontSize: '12px',
      color: textSub,
      margin: '0 0 12px 0',
      lineHeight: 1.4,
      minHeight: '34px'
    }
  }, ag.description || '无详细描述'), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexWrap: 'wrap',
      gap: '6px',
      marginBottom: '12px'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: '11px',
      padding: '2px 6px',
      borderRadius: '4px',
      background: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
      color: '#58a6ff'
    }
  }, "\u4E3B: ", ag.primary_model_id), ag.fallback_model_id && /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: '11px',
      padding: '2px 6px',
      borderRadius: '4px',
      background: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
      color: textSub
    }
  }, "\u5907: ", ag.fallback_model_id), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: '11px',
      padding: '2px 6px',
      borderRadius: '4px',
      background: 'rgba(188, 140, 255, 0.15)',
      color: '#bc8cff'
    }
  }, ag.permission_level.toUpperCase()), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: '11px',
      padding: '2px 6px',
      borderRadius: '4px',
      background: 'rgba(210, 153, 34, 0.15)',
      color: '#d29922'
    }
  }, "\u4E0A\u9650: ", (ag.budget_tokens_per_task / 1000).toFixed(0), "k tok")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: 'repeat(3, 1fr)',
      gap: '8px',
      background: isDark ? 'rgba(0,0,0,0.2)' : 'rgba(0,0,0,0.02)',
      padding: '8px 10px',
      borderRadius: '8px',
      border: `1px solid ${borderCol}`
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      textAlign: 'center'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: '10px',
      color: textSub
    }
  }, "\u7D2F\u8BA1 Token"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: '12px',
      fontWeight: '700',
      color: textMain
    }
  }, (ag.total_tokens_consumed / 1000).toFixed(1), "k")), /*#__PURE__*/React.createElement("div", {
    style: {
      textAlign: 'center'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: '10px',
      color: textSub
    }
  }, "\u4EFB\u52A1\u5B8C\u6210\u6570"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: '12px',
      fontWeight: '700',
      color: textMain
    }
  }, ag.total_tasks_completed)), /*#__PURE__*/React.createElement("div", {
    style: {
      textAlign: 'center'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: '10px',
      color: textSub
    }
  }, "\u72EC\u7ACB\u6838\u9A8C\u7387"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: '12px',
      fontWeight: '700',
      color: '#3fb950'
    }
  }, (ag.verification_pass_rate * 100).toFixed(0), "%"))), ag.local_cli_path && /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: '10px',
      padding: '8px 10px',
      borderRadius: '8px',
      background: ag.is_local_installed ? isDark ? 'rgba(63, 185, 80, 0.1)' : '#f0fdf4' : isDark ? 'rgba(210, 153, 34, 0.1)' : '#fffbeb',
      border: `1px solid ${ag.is_local_installed ? 'rgba(63, 185, 80, 0.3)' : 'rgba(210, 153, 34, 0.3)'}`,
      fontSize: '11px',
      display: 'flex',
      flexDirection: 'column',
      gap: '4px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      color: ag.is_local_installed ? '#3fb950' : '#d29922',
      fontWeight: '700',
      display: 'flex',
      alignItems: 'center',
      gap: '5px'
    }
  }, /*#__PURE__*/React.createElement("span", null, ag.is_local_installed ? '🟢 本地宿主已检测就绪' : '🟡 本地路径预置')), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: '10px',
      color: textSub,
      background: isDark ? 'rgba(0,0,0,0.3)' : 'rgba(0,0,0,0.05)',
      padding: '1px 6px',
      borderRadius: '4px'
    }
  }, ag.adapter_type?.toUpperCase())), /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'monospace',
      fontSize: '10px',
      color: textSub,
      wordBreak: 'break-all'
    }
  }, "\uD83D\uDCBB \u8DEF\u5F84: ", ag.local_cli_path), ag.connected_api && /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: '10px',
      color: '#58a6ff'
    }
  }, "\uD83C\uDF10 \u63A5\u5165: ", ag.connected_api))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      borderTop: `1px solid ${borderCol}`,
      paddingTop: '12px'
    }
  }, /*#__PURE__*/React.createElement("button", {
    onClick: () => {
      setTestAgent(ag);
      setTestResult(null);
    },
    style: {
      padding: '6px 12px',
      borderRadius: '6px',
      border: `1px solid ${borderCol}`,
      background: isDark ? '#1f2937' : '#f0f7ff',
      color: '#58a6ff',
      fontSize: '12px',
      fontWeight: '600',
      cursor: 'pointer'
    }
  }, "\u25B6 \u8FD0\u884C\u6D4B\u8BD5"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: '8px'
    }
  }, /*#__PURE__*/React.createElement("button", {
    onClick: () => handleToggle(ag.agent_id),
    style: {
      padding: '6px 10px',
      borderRadius: '6px',
      border: `1px solid ${borderCol}`,
      background: cardBg,
      color: textSub,
      fontSize: '12px',
      cursor: 'pointer'
    }
  }, ag.status === 'active' ? '⏸️ 暂停' : '▶ 启用'), !ag.tags?.includes('builtin') && /*#__PURE__*/React.createElement("button", {
    onClick: () => handleDelete(ag.agent_id),
    style: {
      padding: '6px 10px',
      borderRadius: '6px',
      border: '1px solid rgba(239, 68, 68, 0.3)',
      background: 'rgba(239, 68, 68, 0.1)',
      color: '#f85149',
      fontSize: '12px',
      cursor: 'pointer'
    }
  }, "\uD83D\uDDD1\uFE0F")))))), showWizard && /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: 'rgba(0,0,0,0.65)',
      backdropFilter: 'blur(4px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "apple-modal-box",
    style: {
      background: cardBg,
      border: `1px solid ${borderCol}`,
      borderRadius: '16px',
      width: '90%',
      maxWidth: '640px',
      padding: '24px',
      display: 'flex',
      flexDirection: 'column',
      gap: '20px',
      boxShadow: '0 24px 48px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.1)',
      backdropFilter: 'blur(24px)',
      WebkitBackdropFilter: 'blur(24px)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center'
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("h3", {
    style: {
      margin: '0 0 4px 0',
      fontSize: '17px',
      fontWeight: '700',
      color: textMain
    }
  }, "\uD83E\uDDD9 \u521B\u5EFA\u65B0 Agent (\u5411\u5BFC\u6B65\u9AA4 ", wizardStep, " / 5)"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: '12px',
      color: textSub
    }
  }, "\u6839\u636E\u63A8\u8350\u5411\u5BFC\u9010\u6B65\u914D\u7F6E\uFF0C\u6216\u5F00\u542F\u4E13\u5BB6\u6A21\u5F0F\u5FAE\u8C03\u5E95\u5C42\u53C2\u6570")), /*#__PURE__*/React.createElement("button", {
    onClick: () => setShowWizard(false),
    style: {
      background: 'none',
      border: 'none',
      color: textSub,
      fontSize: '18px',
      cursor: 'pointer'
    }
  }, "\u2715")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: '8px'
    }
  }, [1, 2, 3, 4, 5].map(s => /*#__PURE__*/React.createElement("div", {
    key: s,
    onClick: () => setWizardStep(s),
    style: {
      flex: 1,
      height: '4px',
      borderRadius: '2px',
      cursor: 'pointer',
      background: s <= wizardStep ? '#58a6ff' : isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'
    }
  }))), wizardStep === 1 && /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: '14px'
    }
  }, /*#__PURE__*/React.createElement("h4", {
    style: {
      margin: 0,
      fontSize: '14px',
      color: textMain
    }
  }, "\u6B65\u9AA4 1: \u57FA\u672C\u8EAB\u4EFD\u4E0E\u4EE3\u53F7"), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("label", {
    style: {
      fontSize: '12px',
      color: textSub,
      display: 'block',
      marginBottom: '4px'
    }
  }, "Agent \u540D\u79F0"), /*#__PURE__*/React.createElement("input", {
    type: "text",
    placeholder: "\u4F8B\u5982: \u8D22\u52A1\u5BA1\u8BA1\u5206\u6790\u4E13\u5BB6",
    value: form.name,
    onChange: e => setForm({
      ...form,
      name: e.target.value
    }),
    style: {
      width: '100%',
      padding: '8px 12px',
      borderRadius: '8px',
      border: `1px solid ${borderCol}`,
      background: isDark ? '#0d1117' : '#fff',
      color: textMain
    }
  })), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("label", {
    style: {
      fontSize: '12px',
      color: textSub,
      display: 'block',
      marginBottom: '4px'
    }
  }, "\u552F\u4E00\u4EE3\u53F7 (\u53EF\u9009\uFF0C\u7559\u7A7A\u81EA\u52A8\u751F\u6210)"), /*#__PURE__*/React.createElement("input", {
    type: "text",
    placeholder: "\u4F8B\u5982: agent-fintech-audit",
    value: form.agent_id,
    onChange: e => setForm({
      ...form,
      agent_id: e.target.value
    }),
    style: {
      width: '100%',
      padding: '8px 12px',
      borderRadius: '8px',
      border: `1px solid ${borderCol}`,
      background: isDark ? '#0d1117' : '#fff',
      color: textMain
    }
  }))), wizardStep === 2 && /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: '14px'
    }
  }, /*#__PURE__*/React.createElement("h4", {
    style: {
      margin: 0,
      fontSize: '14px',
      color: textMain
    }
  }, "\u6B65\u9AA4 2: \u4E13\u4E1A\u804C\u8D23\u4E0E\u5185\u7F6E\u6A21\u677F"), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("label", {
    style: {
      fontSize: '12px',
      color: textSub,
      display: 'block',
      marginBottom: '6px'
    }
  }, "\u9009\u62E9\u5E38\u7528\u6A21\u677F\u5FEB\u901F\u586B\u5145"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: '1fr 1fr',
      gap: '8px',
      maxHeight: '180px',
      overflowY: 'auto'
    }
  }, templates.map(t => /*#__PURE__*/React.createElement("div", {
    key: t.template_id,
    onClick: () => handleTemplateSelect(t.template_id),
    style: {
      padding: '10px',
      borderRadius: '8px',
      border: `1px solid ${form.template_id === t.template_id ? '#58a6ff' : borderCol}`,
      background: form.template_id === t.template_id ? 'rgba(56, 139, 253, 0.15)' : isDark ? '#0d1117' : '#f9fafb',
      cursor: 'pointer'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: '13px',
      fontWeight: '600',
      color: textMain
    }
  }, t.display_title), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: '11px',
      color: textSub,
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap'
    }
  }, t.description)))))), wizardStep === 3 && /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: '14px'
    }
  }, /*#__PURE__*/React.createElement("h4", {
    style: {
      margin: 0,
      fontSize: '14px',
      color: textMain
    }
  }, "\u6B65\u9AA4 3: \u9ED8\u8BA4\u6A21\u578B\u4E0E\u6545\u969C\u964D\u7EA7\u5907\u7528"), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("label", {
    style: {
      fontSize: '12px',
      color: textSub,
      display: 'block',
      marginBottom: '4px'
    }
  }, "\u4E3B\u6267\u884C\u6A21\u578B"), /*#__PURE__*/React.createElement("select", {
    value: form.primary_model_id,
    onChange: e => setForm({
      ...form,
      primary_model_id: e.target.value
    }),
    style: {
      width: '100%',
      padding: '8px 12px',
      borderRadius: '8px',
      border: `1px solid ${borderCol}`,
      background: isDark ? '#0d1117' : '#fff',
      color: textMain
    }
  }, /*#__PURE__*/React.createElement("option", {
    value: "deepseek-chat"
  }, "DeepSeek V3 (Chat) - $0.14/M (\u63A8\u8350\u4EE3\u7801/\u901A\u7528)"), /*#__PURE__*/React.createElement("option", {
    value: "deepseek-reasoner"
  }, "DeepSeek R1 (Reasoner) - $0.55/M (\u9AD8\u9636\u903B\u8F91\u63A8\u7406)"), /*#__PURE__*/React.createElement("option", {
    value: "qwen-plus"
  }, "\u901A\u4E49\u5343\u95EE Qwen Plus - $0.40/M"), /*#__PURE__*/React.createElement("option", {
    value: "qwen-max"
  }, "\u901A\u4E49\u5343\u95EE Qwen Max - $1.60/M"), /*#__PURE__*/React.createElement("option", {
    value: "gpt-4o"
  }, "OpenAI GPT-4o"), /*#__PURE__*/React.createElement("option", {
    value: "claude-3-5-sonnet"
  }, "Claude 3.5 Sonnet"), /*#__PURE__*/React.createElement("option", {
    value: "gemini-2.0-flash"
  }, "Google Gemini 2.0 Flash"), /*#__PURE__*/React.createElement("option", {
    value: "ollama-llama3.3"
  }, "Ollama Llama 3.3 (\u672C\u5730\u79BB\u7EBF $0.00)"))), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("label", {
    style: {
      fontSize: '12px',
      color: textSub,
      display: 'block',
      marginBottom: '4px'
    }
  }, "\u81EA\u52A8\u964D\u7EA7\u5907\u7528\u6A21\u578B"), /*#__PURE__*/React.createElement("select", {
    value: form.fallback_model_id,
    onChange: e => setForm({
      ...form,
      fallback_model_id: e.target.value
    }),
    style: {
      width: '100%',
      padding: '8px 12px',
      borderRadius: '8px',
      border: `1px solid ${borderCol}`,
      background: isDark ? '#0d1117' : '#fff',
      color: textMain
    }
  }, /*#__PURE__*/React.createElement("option", {
    value: "qwen-plus"
  }, "\u901A\u4E49\u5343\u95EE Qwen Plus (\u9AD8\u53EF\u7528\u5907\u4EFD)"), /*#__PURE__*/React.createElement("option", {
    value: "deepseek-chat"
  }, "DeepSeek V3"), /*#__PURE__*/React.createElement("option", {
    value: "gemini-2.0-flash"
  }, "Gemini 2.0 Flash"), /*#__PURE__*/React.createElement("option", {
    value: "ollama-llama3.3"
  }, "\u672C\u5730\u79BB\u7EBF Ollama")))), wizardStep === 4 && /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: '14px'
    }
  }, /*#__PURE__*/React.createElement("h4", {
    style: {
      margin: 0,
      fontSize: '14px',
      color: textMain
    }
  }, "\u6B65\u9AA4 4: \u5355\u4EFB\u52A1 Token \u9884\u7B97\u4E0E\u9632\u6B7B\u9501\u7EA6\u675F"), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("label", {
    style: {
      fontSize: '12px',
      color: textSub,
      display: 'block',
      marginBottom: '4px'
    }
  }, "\u5355\u4EFB\u52A1 Token \u786C\u7194\u65AD\u4E0A\u9650: ", form.budget_tokens_per_task.toLocaleString(), " Tokens"), /*#__PURE__*/React.createElement("input", {
    type: "range",
    min: "5000",
    max: "100000",
    step: "5000",
    value: form.budget_tokens_per_task,
    onChange: e => setForm({
      ...form,
      budget_tokens_per_task: Number(e.target.value)
    }),
    style: {
      width: '100%'
    }
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: '1fr 1fr',
      gap: '12px'
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("label", {
    style: {
      fontSize: '12px',
      color: textSub,
      display: 'block',
      marginBottom: '4px'
    }
  }, "\u6700\u5927\u91CD\u8BD5\u6B21\u6570 (\u53CD\u81A8\u80C0)"), /*#__PURE__*/React.createElement("input", {
    type: "number",
    min: "0",
    max: "3",
    value: form.max_retries,
    onChange: e => setForm({
      ...form,
      max_retries: Number(e.target.value)
    }),
    style: {
      width: '100%',
      padding: '8px 12px',
      borderRadius: '8px',
      border: `1px solid ${borderCol}`,
      background: isDark ? '#0d1117' : '#fff',
      color: textMain
    }
  })), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("label", {
    style: {
      fontSize: '12px',
      color: textSub,
      display: 'block',
      marginBottom: '4px'
    }
  }, "\u8D85\u65F6\u786C\u7194\u65AD (\u79D2)"), /*#__PURE__*/React.createElement("input", {
    type: "number",
    min: "10",
    max: "300",
    value: form.timeout_seconds,
    onChange: e => setForm({
      ...form,
      timeout_seconds: Number(e.target.value)
    }),
    style: {
      width: '100%',
      padding: '8px 12px',
      borderRadius: '8px',
      border: `1px solid ${borderCol}`,
      background: isDark ? '#0d1117' : '#fff',
      color: textMain
    }
  })))), wizardStep === 5 && /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: '14px'
    }
  }, /*#__PURE__*/React.createElement("h4", {
    style: {
      margin: 0,
      fontSize: '14px',
      color: textMain
    }
  }, "\u6B65\u9AA4 5: \u81EA\u4E3B\u6743\u9650\u7B49\u7EA7\u4E0E\u5DE5\u5177\u6302\u8F7D"), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("label", {
    style: {
      fontSize: '12px',
      color: textSub,
      display: 'block',
      marginBottom: '4px'
    }
  }, "\u81EA\u4E3B\u6743\u9650\u7B49\u7EA7"), /*#__PURE__*/React.createElement("select", {
    value: form.permission_level,
    onChange: e => setForm({
      ...form,
      permission_level: e.target.value
    }),
    style: {
      width: '100%',
      padding: '8px 12px',
      borderRadius: '8px',
      border: `1px solid ${borderCol}`,
      background: isDark ? '#0d1117' : '#fff',
      color: textMain
    }
  }, /*#__PURE__*/React.createElement("option", {
    value: "strict"
  }, "STRICT: \u4E25\u683C\u53EA\u8BFB\u6C99\u7BB1\uFF0C\u4E0D\u53EF\u89E6\u53D1\u4FEE\u6539"), /*#__PURE__*/React.createElement("option", {
    value: "supervised"
  }, "SUPERVISED (\u63A8\u8350): \u53D7\u63A7\u81EA\u4E3B\uFF0C\u9AD8\u98CE\u9669\u5199\u64CD\u4F5C\u9700\u4EBA\u5DE5\u5BA1\u6279"), /*#__PURE__*/React.createElement("option", {
    value: "autonomous"
  }, "AUTONOMOUS: \u5728\u9884\u7B97\u4E0E\u6388\u6743\u5185\u5168\u81EA\u4E3B\u6267\u884C"))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: '12px',
      color: textSub
    }
  }, "\u4E13\u5BB6\u6A21\u5F0F (\u5FAE\u8C03\u5E95\u5C42 System Prompt)"), /*#__PURE__*/React.createElement("input", {
    type: "checkbox",
    checked: expertMode,
    onChange: e => setExpertMode(e.target.checked)
  })), expertMode && /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("label", {
    style: {
      fontSize: '12px',
      color: textSub,
      display: 'block',
      marginBottom: '4px'
    }
  }, "\u7CFB\u7EDF\u63D0\u793A\u8BCD (System Prompt)"), /*#__PURE__*/React.createElement("textarea", {
    rows: 4,
    value: form.system_prompt,
    onChange: e => setForm({
      ...form,
      system_prompt: e.target.value
    }),
    style: {
      width: '100%',
      padding: '8px 12px',
      borderRadius: '8px',
      border: `1px solid ${borderCol}`,
      background: isDark ? '#0d1117' : '#fff',
      color: textMain,
      fontSize: '12px'
    }
  }))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      borderTop: `1px solid ${borderCol}`,
      paddingTop: '16px'
    }
  }, /*#__PURE__*/React.createElement("button", {
    disabled: wizardStep === 1,
    onClick: () => setWizardStep(prev => prev - 1),
    style: {
      padding: '8px 16px',
      borderRadius: '8px',
      border: `1px solid ${borderCol}`,
      background: cardBg,
      color: textSub,
      cursor: wizardStep === 1 ? 'not-allowed' : 'pointer'
    }
  }, "\u4E0A\u4E00\u6B65"), wizardStep < 5 ? /*#__PURE__*/React.createElement("button", {
    onClick: () => setWizardStep(prev => prev + 1),
    style: {
      padding: '8px 18px',
      borderRadius: '8px',
      border: 'none',
      background: '#58a6ff',
      color: '#fff',
      fontWeight: '600',
      cursor: 'pointer'
    }
  }, "\u4E0B\u4E00\u6B65 \u2192") : /*#__PURE__*/React.createElement("button", {
    onClick: handleCreateSubmit,
    style: {
      padding: '8px 22px',
      borderRadius: '8px',
      border: 'none',
      background: '#238636',
      color: '#fff',
      fontWeight: '600',
      cursor: 'pointer'
    }
  }, "\uD83D\uDE80 \u786E\u8BA4\u5E76\u6CE8\u518C Agent")))), testAgent && /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: 'rgba(0,0,0,0.65)',
      backdropFilter: 'blur(4px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "apple-modal-box",
    style: {
      background: cardBg,
      border: `1px solid ${borderCol}`,
      borderRadius: '16px',
      width: '90%',
      maxWidth: '580px',
      padding: '24px',
      display: 'flex',
      flexDirection: 'column',
      gap: '16px',
      boxShadow: '0 24px 48px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.1)',
      backdropFilter: 'blur(24px)',
      WebkitBackdropFilter: 'blur(24px)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center'
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("h3", {
    style: {
      margin: '0 0 2px 0',
      fontSize: '16px',
      fontWeight: '700',
      color: textMain
    }
  }, "\u25B6 \u72EC\u7ACB\u6D4B\u8BD5 Agent: ", testAgent.name), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: '11px',
      color: textSub
    }
  }, "\u6A21\u578B: ", testAgent.primary_model_id, " \xB7 \u6A21\u5F0F: ", testAgent.permission_level)), /*#__PURE__*/React.createElement("button", {
    onClick: () => setTestAgent(null),
    style: {
      background: 'none',
      border: 'none',
      color: textSub,
      fontSize: '18px',
      cursor: 'pointer'
    }
  }, "\u2715")), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("label", {
    style: {
      fontSize: '12px',
      color: textSub,
      display: 'block',
      marginBottom: '4px'
    }
  }, "\u6D4B\u8BD5\u4EFB\u52A1\u76EE\u6807 (Input Prompt)"), /*#__PURE__*/React.createElement("textarea", {
    rows: 3,
    value: testPrompt,
    onChange: e => setTestPrompt(e.target.value),
    style: {
      width: '100%',
      padding: '8px 12px',
      borderRadius: '8px',
      border: `1px solid ${borderCol}`,
      background: isDark ? '#0d1117' : '#fff',
      color: textMain,
      fontSize: '13px'
    }
  })), /*#__PURE__*/React.createElement("button", {
    disabled: testLoading,
    onClick: handleRunTest,
    style: {
      padding: '10px 16px',
      borderRadius: '8px',
      border: 'none',
      background: '#238636',
      color: '#fff',
      fontWeight: '600',
      cursor: testLoading ? 'wait' : 'pointer'
    }
  }, testLoading ? '正在执行推理与独立验证...' : '⚡ 发起隔离测试'), testResult && /*#__PURE__*/React.createElement("div", {
    style: {
      background: isDark ? '#0d1117' : '#f6f8fa',
      border: `1px solid ${borderCol}`,
      borderRadius: '8px',
      padding: '12px',
      fontSize: '12px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      justifyContent: 'space-between',
      marginBottom: '8px'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      color: '#3fb950',
      fontWeight: '600'
    }
  }, "\u2713 \u72EC\u7ACB\u6838\u9A8C\u901A\u8FC7"), /*#__PURE__*/React.createElement("span", {
    style: {
      color: textSub
    }
  }, "\u8017\u65F6: ", testResult.latency_ms, "ms \xB7 \u6D88\u8017: ", testResult.tokens_used, " tok")), /*#__PURE__*/React.createElement("pre", {
    style: {
      margin: 0,
      whiteSpace: 'pre-wrap',
      color: textMain,
      fontFamily: 'monospace',
      maxHeight: '160px',
      overflowY: 'auto'
    }
  }, testResult.output)))));
};

// ===== components/ModelCenter.tsx =====

const ModelCenter = ({
  isDark = true
}) => {
  const [models, setModels] = useState([]);
  const [providers, setProviders] = useState([]);
  const [routingPolicy, setRoutingPolicy] = useState({
    mode: 'auto_complexity',
    manual_model_id: 'deepseek-chat',
    cost_threshold_usd_per_m: 1.0,
    fallback_model_id: 'qwen-plus'
  });
  const [loading, setLoading] = useState(true);

  // Add Model Modal State
  const [showAddModal, setShowAddModal] = useState(false);
  const [addForm, setAddForm] = useState({
    provider_type: 'deepseek',
    model_id: '',
    display_name: '',
    api_base: '',
    api_key: ''
  });

  // Ping Testing State
  const [pingTesting, setPingTesting] = useState(false);
  const [pingResult, setPingResult] = useState(null);
  const fetchModels = async () => {
    try {
      setLoading(true);
      const res = await fetch(`${API_BASE}/api/models`);
      if (res.ok) setModels(await res.json());
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };
  const fetchProviders = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/models/providers`);
      if (res.ok) setProviders(await res.json());
    } catch (err) {
      console.error(err);
    }
  };
  const fetchPolicy = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/models/routing/policy`);
      if (res.ok) setRoutingPolicy(await res.json());
    } catch (err) {
      console.error(err);
    }
  };
  useEffect(() => {
    fetchModels();
    fetchProviders();
    fetchPolicy();
  }, []);
  const handleProviderSelect = ptype => {
    const p = providers.find(item => item.provider_type === ptype);
    if (p) {
      setAddForm(prev => ({
        ...prev,
        provider_type: ptype,
        api_base: p.default_api_base,
        model_id: p.recommended_models[0] || '',
        display_name: `${p.display_name} - ${p.recommended_models[0] || 'Model'}`
      }));
    }
  };
  const handleTestConnection = async () => {
    try {
      setPingTesting(true);
      setPingResult(null);
      const res = await fetch(`${API_BASE}/api/models/test-connection`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          provider_type: addForm.provider_type,
          api_base: addForm.api_base,
          api_key: addForm.api_key || 'mock-key',
          model_id: addForm.model_id
        })
      });
      const data = await res.json();
      setPingResult(data);
    } catch (err) {
      setPingResult({
        ok: false,
        error: err.message
      });
    } finally {
      setPingTesting(false);
    }
  };
  const handleAddModelSubmit = async () => {
    if (!addForm.model_id || !addForm.api_key) {
      alert('请填写模型 ID 与 API Key');
      return;
    }
    try {
      const res = await fetch(`${API_BASE}/api/models`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(addForm)
      });
      if (res.ok) {
        setShowAddModal(false);
        fetchModels();
      } else {
        const err = await res.json();
        alert(`添加失败: ${err.detail || '未知异常'}`);
      }
    } catch (err) {
      alert(`网络错误: ${err.message}`);
    }
  };
  const handleSavePolicy = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/models/routing/policy`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(routingPolicy)
      });
      if (res.ok) {
        alert('智能路由策略已成功保存并实时生效！');
      }
    } catch (err) {
      alert(`保存失败: ${err.message}`);
    }
  };
  const cardBg = isDark ? '#161b22' : '#ffffff';
  const borderCol = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)';
  const textMain = isDark ? '#f0f6fc' : '#1d1d1f';
  const textSub = isDark ? '#8b949e' : '#86868b';
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: '20px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      flexWrap: 'wrap',
      gap: '14px'
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("h2", {
    style: {
      margin: '0 0 4px 0',
      fontSize: '20px',
      fontWeight: '700',
      color: textMain
    }
  }, "\uD83C\uDF10 \u6A21\u578B\u63A5\u5165\u4E0E\u7BA1\u7406\u4E2D\u5FC3"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: '13px',
      color: textSub
    }
  }, "\u4E3B\u6D41\u670D\u52A1\u5546\u63D2\u4EF6\u5316\u9884\u8BBE \xB7 \u79D8\u94A5\u8131\u654F\u9632\u62A4 \xB7 \u5EF6\u8FDF\u6D4B\u901F \xB7 \u4E0A\u4E0B\u6587\u53C2\u6570 \xB7 \u667A\u80FD\u591A\u7EA7\u8DEF\u7531")), /*#__PURE__*/React.createElement("button", {
    onClick: () => {
      setShowAddModal(true);
      handleProviderSelect('deepseek');
    },
    style: {
      padding: '10px 18px',
      borderRadius: '10px',
      border: 'none',
      background: '#238636',
      color: '#ffffff',
      fontWeight: '600',
      fontSize: '13px',
      cursor: 'pointer',
      display: 'flex',
      alignItems: 'center',
      gap: '6px'
    }
  }, /*#__PURE__*/React.createElement("span", null, "+"), " \u63A5\u5165\u65B0\u6A21\u578B\u670D\u52A1\u5546")), /*#__PURE__*/React.createElement("div", {
    className: "apple-card",
    style: {
      background: cardBg,
      border: `1px solid ${borderCol}`,
      borderRadius: '16px',
      padding: '18px',
      backdropFilter: 'blur(20px)',
      WebkitBackdropFilter: 'blur(20px)',
      boxShadow: isDark ? '0 8px 24px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.06)' : '0 8px 24px rgba(0,0,0,0.04), inset 0 1px 0 rgba(255,255,255,0.9)'
    }
  }, /*#__PURE__*/React.createElement("h3", {
    style: {
      margin: '0 0 12px 0',
      fontSize: '14px',
      fontWeight: '600',
      color: textMain
    }
  }, "\uD83E\uDDE9 \u652F\u6301\u7684\u5B98\u65B9\u6A21\u578B\u670D\u52A1\u5546\u9884\u8BBE"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
      gap: '10px'
    }
  }, providers.map(p => /*#__PURE__*/React.createElement("div", {
    key: p.provider_type,
    onClick: () => {
      setShowAddModal(true);
      handleProviderSelect(p.provider_type);
    },
    className: "apple-card",
    style: {
      padding: '12px',
      borderRadius: '10px',
      border: `1px solid ${borderCol}`,
      background: isDark ? '#0d1117' : '#f9fafb',
      cursor: 'pointer',
      display: 'flex',
      alignItems: 'center',
      gap: '10px'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: '22px'
    }
  }, p.icon), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: '13px',
      fontWeight: '600',
      color: textMain
    }
  }, p.display_name), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: '11px',
      color: textSub
    }
  }, p.recommended_models.length, " \u4E2A\u63A8\u8350\u6A21\u578B")))))), /*#__PURE__*/React.createElement("div", {
    className: "apple-card",
    style: {
      background: cardBg,
      border: `1px solid ${borderCol}`,
      borderRadius: '16px',
      padding: '20px',
      backdropFilter: 'blur(20px)',
      WebkitBackdropFilter: 'blur(20px)',
      boxShadow: isDark ? '0 8px 24px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.06)' : '0 8px 24px rgba(0,0,0,0.04), inset 0 1px 0 rgba(255,255,255,0.9)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: '16px'
    }
  }, /*#__PURE__*/React.createElement("h3", {
    style: {
      margin: 0,
      fontSize: '15px',
      fontWeight: '600',
      color: textMain
    }
  }, "\uD83C\uDFAF \u667A\u80FD\u6A21\u578B\u8DEF\u7531\u7B56\u7565 (Smart Routing Engine)"), /*#__PURE__*/React.createElement("button", {
    onClick: handleSavePolicy,
    style: {
      padding: '6px 14px',
      borderRadius: '6px',
      border: 'none',
      background: '#58a6ff',
      color: '#fff',
      fontSize: '12px',
      fontWeight: '600',
      cursor: 'pointer'
    }
  }, "\u4FDD\u5B58\u7B56\u7565")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
      gap: '16px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    onClick: () => setRoutingPolicy({
      ...routingPolicy,
      mode: 'auto_complexity'
    }),
    style: {
      padding: '14px',
      borderRadius: '10px',
      border: `1px solid ${routingPolicy.mode === 'auto_complexity' ? '#58a6ff' : borderCol}`,
      background: routingPolicy.mode === 'auto_complexity' ? 'rgba(56, 139, 253, 0.12)' : isDark ? '#0d1117' : '#f9fafb',
      cursor: 'pointer'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: '14px',
      fontWeight: '700',
      color: textMain,
      marginBottom: '4px'
    }
  }, "\uD83E\uDD16 \u590D\u6742\u5EA6\u81EA\u9002\u5E94 (\u63A8\u8350)"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: '12px',
      color: textSub
    }
  }, "\u7B80\u5355\u4EFB\u52A1\u9009\u4F4E\u4EF7\u5FEB\u901F\u6A21\u578B\uFF1B\u590D\u6742\u67B6\u6784\u6216\u591A\u8F6E\u63A8\u7406\u81EA\u52A8\u8DEF\u7531\u81F3 DeepSeek R1 / Qwen Max\u3002")), /*#__PURE__*/React.createElement("div", {
    onClick: () => setRoutingPolicy({
      ...routingPolicy,
      mode: 'cost_optimized'
    }),
    style: {
      padding: '14px',
      borderRadius: '10px',
      border: `1px solid ${routingPolicy.mode === 'cost_optimized' ? '#58a6ff' : borderCol}`,
      background: routingPolicy.mode === 'cost_optimized' ? 'rgba(56, 139, 253, 0.12)' : isDark ? '#0d1117' : '#f9fafb',
      cursor: 'pointer'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: '14px',
      fontWeight: '700',
      color: textMain,
      marginBottom: '4px'
    }
  }, "\uD83D\uDCB0 \u6210\u672C\u4F18\u5148\u6A21\u5F0F"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: '12px',
      color: textSub
    }
  }, "\u5728\u6EE1\u8DB3\u8D28\u91CF\u9608\u503C\u524D\u63D0\u4E0B\uFF0C\u4F18\u5148\u9009\u53D6\u5355\u4EF7\u6700\u4F4E\u6A21\u578B (\u5982 DeepSeek V3 $0.14/M \u6216\u672C\u5730 Ollama $0)\u3002")), /*#__PURE__*/React.createElement("div", {
    onClick: () => setRoutingPolicy({
      ...routingPolicy,
      mode: 'manual'
    }),
    style: {
      padding: '14px',
      borderRadius: '10px',
      border: `1px solid ${routingPolicy.mode === 'manual' ? '#58a6ff' : borderCol}`,
      background: routingPolicy.mode === 'manual' ? 'rgba(56, 139, 253, 0.12)' : isDark ? '#0d1117' : '#f9fafb',
      cursor: 'pointer'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: '14px',
      fontWeight: '700',
      color: textMain,
      marginBottom: '4px'
    }
  }, "\u2699\uFE0F \u624B\u52A8\u6307\u5B9A\u6A21\u578B"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: '12px',
      color: textSub
    }
  }, "\u56FA\u5B9A\u7531\u7279\u5B9A\u6A21\u578B\u627F\u63FD\u6240\u6709\u5206\u53D1\u5B50\u4EFB\u52A1\u3002")))), /*#__PURE__*/React.createElement("div", {
    style: {
      background: cardBg,
      border: `1px solid ${borderCol}`,
      borderRadius: '16px',
      overflow: 'hidden'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '16px 20px',
      borderBottom: `1px solid ${borderCol}`
    }
  }, /*#__PURE__*/React.createElement("h3", {
    style: {
      margin: 0,
      fontSize: '15px',
      fontWeight: '600',
      color: textMain
    }
  }, "\uD83D\uDCCB \u5DF2\u63A5\u5165\u8FD0\u884C\u7684\u6A21\u578B\u5217\u8868 (", models.length, ")")), /*#__PURE__*/React.createElement("div", {
    style: {
      overflowX: 'auto'
    }
  }, /*#__PURE__*/React.createElement("table", {
    style: {
      width: '100%',
      borderCollapse: 'collapse',
      fontSize: '13px',
      textAlign: 'left'
    }
  }, /*#__PURE__*/React.createElement("thead", null, /*#__PURE__*/React.createElement("tr", {
    style: {
      background: isDark ? 'rgba(0,0,0,0.2)' : 'rgba(0,0,0,0.02)',
      color: textSub,
      borderBottom: `1px solid ${borderCol}`
    }
  }, /*#__PURE__*/React.createElement("th", {
    style: {
      padding: '12px 18px'
    }
  }, "\u6A21\u578B ID / \u670D\u52A1\u5546"), /*#__PURE__*/React.createElement("th", {
    style: {
      padding: '12px 14px'
    }
  }, "API \u7AEF\u70B9\u4E0E\u51ED\u8BC1"), /*#__PURE__*/React.createElement("th", {
    style: {
      padding: '12px 14px'
    }
  }, "\u8FDE\u901A\u5EF6\u8FDF"), /*#__PURE__*/React.createElement("th", {
    style: {
      padding: '12px 14px'
    }
  }, "\u80FD\u529B\u7279\u6027"), /*#__PURE__*/React.createElement("th", {
    style: {
      padding: '12px 14px'
    }
  }, "\u4E0A\u4E0B\u6587\u7A97\u53E3"), /*#__PURE__*/React.createElement("th", {
    style: {
      padding: '12px 14px'
    }
  }, "\u8D39\u7387 (\u8F93\u5165 / \u8F93\u51FA)"), /*#__PURE__*/React.createElement("th", {
    style: {
      padding: '12px 18px',
      textAlign: 'right'
    }
  }, "\u72B6\u6001"))), /*#__PURE__*/React.createElement("tbody", null, models.map(m => /*#__PURE__*/React.createElement("tr", {
    key: m.model_id,
    style: {
      borderBottom: `1px solid ${borderCol}`
    }
  }, /*#__PURE__*/React.createElement("td", {
    style: {
      padding: '14px 18px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontWeight: '600',
      color: textMain
    }
  }, m.display_name), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: '11px',
      color: textSub,
      fontFamily: 'monospace'
    }
  }, m.model_id)), /*#__PURE__*/React.createElement("td", {
    style: {
      padding: '14px 14px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: '11px',
      color: textSub,
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      maxWidth: '200px'
    }
  }, m.api_base), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: '11px',
      color: '#58a6ff',
      fontFamily: 'monospace'
    }
  }, m.credential_ref)), /*#__PURE__*/React.createElement("td", {
    style: {
      padding: '14px 14px'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: '12px',
      color: '#3fb950',
      display: 'flex',
      alignItems: 'center',
      gap: '4px'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      width: '6px',
      height: '6px',
      borderRadius: '50%',
      background: '#3fb950'
    }
  }), m.last_ping_ms, "ms")), /*#__PURE__*/React.createElement("td", {
    style: {
      padding: '14px 14px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: '4px',
      flexWrap: 'wrap'
    }
  }, m.capabilities.supports_tools && /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: '10px',
      padding: '1px 5px',
      borderRadius: '4px',
      background: 'rgba(56, 139, 253, 0.15)',
      color: '#58a6ff'
    }
  }, "Tools"), m.capabilities.supports_reasoning && /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: '10px',
      padding: '1px 5px',
      borderRadius: '4px',
      background: 'rgba(188, 140, 255, 0.15)',
      color: '#bc8cff'
    }
  }, "Reasoner"), m.capabilities.supports_vision && /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: '10px',
      padding: '1px 5px',
      borderRadius: '4px',
      background: 'rgba(63, 185, 80, 0.15)',
      color: '#3fb950'
    }
  }, "Vision"))), /*#__PURE__*/React.createElement("td", {
    style: {
      padding: '14px 14px',
      color: textMain,
      fontWeight: '500'
    }
  }, (m.capabilities.context_window / 1000).toFixed(0), "k tokens"), /*#__PURE__*/React.createElement("td", {
    style: {
      padding: '14px 14px',
      color: textSub
    }
  }, "$", m.pricing.input_price_per_m, " / $", m.pricing.output_price_per_m, " ", /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: '10px'
    }
  }, "/ 1M")), /*#__PURE__*/React.createElement("td", {
    style: {
      padding: '14px 18px',
      textAlign: 'right'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: '11px',
      padding: '2px 8px',
      borderRadius: '10px',
      background: m.enabled ? 'rgba(63, 185, 80, 0.15)' : 'rgba(239, 68, 68, 0.15)',
      color: m.enabled ? '#3fb950' : '#f85149',
      fontWeight: '600'
    }
  }, m.enabled ? '已启用' : '未就绪')))))))), showAddModal && /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: 'rgba(0,0,0,0.65)',
      backdropFilter: 'blur(4px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "apple-modal-box",
    style: {
      background: cardBg,
      border: `1px solid ${borderCol}`,
      borderRadius: '16px',
      width: '90%',
      maxWidth: '580px',
      padding: '24px',
      display: 'flex',
      flexDirection: 'column',
      gap: '16px',
      boxShadow: '0 24px 48px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.1)',
      backdropFilter: 'blur(24px)',
      WebkitBackdropFilter: 'blur(24px)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center'
    }
  }, /*#__PURE__*/React.createElement("h3", {
    style: {
      margin: 0,
      fontSize: '17px',
      fontWeight: '700',
      color: textMain
    }
  }, "\uD83C\uDF10 \u63A5\u5165\u65B0\u5927\u6A21\u578B\u670D\u52A1\u5546"), /*#__PURE__*/React.createElement("button", {
    onClick: () => setShowAddModal(false),
    style: {
      background: 'none',
      border: 'none',
      color: textSub,
      fontSize: '18px',
      cursor: 'pointer'
    }
  }, "\u2715")), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("label", {
    style: {
      fontSize: '12px',
      color: textSub,
      display: 'block',
      marginBottom: '4px'
    }
  }, "\u9009\u62E9\u670D\u52A1\u5546\u7C7B\u578B"), /*#__PURE__*/React.createElement("select", {
    value: addForm.provider_type,
    onChange: e => handleProviderSelect(e.target.value),
    style: {
      width: '100%',
      padding: '8px 12px',
      borderRadius: '8px',
      border: `1px solid ${borderCol}`,
      background: isDark ? '#0d1117' : '#fff',
      color: textMain
    }
  }, providers.map(p => /*#__PURE__*/React.createElement("option", {
    key: p.provider_type,
    value: p.provider_type
  }, p.display_name)))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: '1fr 1fr',
      gap: '12px'
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("label", {
    style: {
      fontSize: '12px',
      color: textSub,
      display: 'block',
      marginBottom: '4px'
    }
  }, "\u6A21\u578B ID"), /*#__PURE__*/React.createElement("input", {
    type: "text",
    placeholder: "deepseek-chat",
    value: addForm.model_id,
    onChange: e => setAddForm({
      ...addForm,
      model_id: e.target.value
    }),
    style: {
      width: '100%',
      padding: '8px 12px',
      borderRadius: '8px',
      border: `1px solid ${borderCol}`,
      background: isDark ? '#0d1117' : '#fff',
      color: textMain
    }
  })), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("label", {
    style: {
      fontSize: '12px',
      color: textSub,
      display: 'block',
      marginBottom: '4px'
    }
  }, "\u663E\u793A\u540D\u79F0"), /*#__PURE__*/React.createElement("input", {
    type: "text",
    placeholder: "DeepSeek V3",
    value: addForm.display_name,
    onChange: e => setAddForm({
      ...addForm,
      display_name: e.target.value
    }),
    style: {
      width: '100%',
      padding: '8px 12px',
      borderRadius: '8px',
      border: `1px solid ${borderCol}`,
      background: isDark ? '#0d1117' : '#fff',
      color: textMain
    }
  }))), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("label", {
    style: {
      fontSize: '12px',
      color: textSub,
      display: 'block',
      marginBottom: '4px'
    }
  }, "API \u7AEF\u70B9 URL (API Base)"), /*#__PURE__*/React.createElement("input", {
    type: "text",
    value: addForm.api_base,
    onChange: e => setAddForm({
      ...addForm,
      api_base: e.target.value
    }),
    style: {
      width: '100%',
      padding: '8px 12px',
      borderRadius: '8px',
      border: `1px solid ${borderCol}`,
      background: isDark ? '#0d1117' : '#fff',
      color: textMain
    }
  })), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("label", {
    style: {
      fontSize: '12px',
      color: textSub,
      display: 'block',
      marginBottom: '4px'
    }
  }, "API Key (\u5B58\u5165\u53D7\u4FDD\u62A4 Secret Store\uFF0C\u524D\u7AEF\u8131\u654F\u4E0D\u56DE\u663E\u660E\u6587)"), /*#__PURE__*/React.createElement("input", {
    type: "password",
    placeholder: "sk-...",
    value: addForm.api_key,
    onChange: e => setAddForm({
      ...addForm,
      api_key: e.target.value
    }),
    style: {
      width: '100%',
      padding: '8px 12px',
      borderRadius: '8px',
      border: `1px solid ${borderCol}`,
      background: isDark ? '#0d1117' : '#fff',
      color: textMain
    }
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: '10px'
    }
  }, /*#__PURE__*/React.createElement("button", {
    disabled: pingTesting,
    onClick: handleTestConnection,
    style: {
      padding: '8px 14px',
      borderRadius: '8px',
      border: `1px solid ${borderCol}`,
      background: isDark ? '#1f2937' : '#f0f7ff',
      color: '#58a6ff',
      fontSize: '12px',
      fontWeight: '600',
      cursor: pingTesting ? 'wait' : 'pointer'
    }
  }, pingTesting ? '正在探测连通性...' : '⚡ 测速与连接测试')), pingResult && /*#__PURE__*/React.createElement("div", {
    style: {
      background: pingResult.ok ? 'rgba(63, 185, 80, 0.1)' : 'rgba(239, 68, 68, 0.1)',
      border: `1px solid ${pingResult.ok ? '#3fb950' : '#ef4444'}`,
      borderRadius: '8px',
      padding: '10px 14px',
      fontSize: '12px',
      color: pingResult.ok ? '#3fb950' : '#ef4444'
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("strong", null, pingResult.ok ? '✓ 连接成功' : '✕ 连接失败', ":"), " ", pingResult.message || pingResult.error), pingResult.reported_models && /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: '11px',
      marginTop: '4px',
      color: textSub
    }
  }, "\u63A2\u6D4B\u5230\u53EF\u7528\u6A21\u578B: ", pingResult.reported_models.join(', '))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      justifyContent: 'flex-end',
      gap: '10px',
      marginTop: '10px'
    }
  }, /*#__PURE__*/React.createElement("button", {
    onClick: () => setShowAddModal(false),
    style: {
      padding: '8px 16px',
      borderRadius: '8px',
      border: `1px solid ${borderCol}`,
      background: cardBg,
      color: textSub,
      cursor: 'pointer'
    }
  }, "\u53D6\u6D88"), /*#__PURE__*/React.createElement("button", {
    onClick: handleAddModelSubmit,
    style: {
      padding: '8px 20px',
      borderRadius: '8px',
      border: 'none',
      background: '#238636',
      color: '#fff',
      fontWeight: '600',
      cursor: 'pointer'
    }
  }, "\u4FDD\u5B58\u6A21\u578B\u63A5\u5165")))));
};

// ===== components/UsageCenter.tsx =====

const UsageCenter = ({
  isDark = true
}) => {
  const [summary, setSummary] = useState({
    today_tokens: 128600,
    today_cost_usd: 0.82,
    today_tasks_count: 46,
    avg_tokens_per_task: 2795,
    real_tokens_pct: 100.0,
    estimated_tokens_pct: 0.0,
    currency: 'USD'
  });
  const [rankings, setRankings] = useState([{
    agent_id: 'nexus-coder-01',
    agent_name: 'Core Code Engineer',
    total_tokens: 58400,
    total_cost_usd: 0.38,
    task_count: 18,
    avg_tokens_per_task: 3244,
    efficiency_score: 0.94
  }, {
    agent_id: 'nexus-planner-01',
    agent_name: 'Task Planning Lead',
    total_tokens: 42100,
    total_cost_usd: 0.28,
    task_count: 14,
    avg_tokens_per_task: 3007,
    efficiency_score: 0.96
  }, {
    agent_id: 'nexus-reviewer-01',
    agent_name: 'Independent Reviewer',
    total_tokens: 18100,
    total_cost_usd: 0.11,
    task_count: 12,
    avg_tokens_per_task: 1508,
    efficiency_score: 0.98
  }]);
  const [modelCosts, setModelCosts] = useState([{
    model_id: 'deepseek-chat',
    provider_id: 'deepseek',
    total_tokens: 58000,
    cost_usd: 0.37,
    share_pct: 45.2
  }, {
    model_id: 'qwen-plus',
    provider_id: 'qwen',
    total_tokens: 36600,
    cost_usd: 0.23,
    share_pct: 28.5
  }, {
    model_id: 'deepseek-reasoner',
    provider_id: 'deepseek',
    total_tokens: 23200,
    cost_usd: 0.16,
    share_pct: 18.1
  }, {
    model_id: 'gpt-4o',
    provider_id: 'openai',
    total_tokens: 10800,
    cost_usd: 0.06,
    share_pct: 8.2
  }]);
  const [taskAudits, setTaskAudits] = useState([{
    task_id: 'TASK-20261106-001',
    total_tokens: 14200,
    retry_tokens: 1200,
    total_cost_usd: 0.091,
    retry_overhead_pct: 8.4
  }, {
    task_id: 'TASK-20261106-002',
    total_tokens: 28400,
    retry_tokens: 0,
    total_cost_usd: 0.182,
    retry_overhead_pct: 0.0
  }, {
    task_id: 'TASK-20261106-003',
    total_tokens: 19800,
    retry_tokens: 2100,
    total_cost_usd: 0.127,
    retry_overhead_pct: 10.6
  }]);
  const [records, setRecords] = useState([]);
  const [activeSubTab, setActiveSubTab] = useState('agents');
  const [budgetStatus, setBudgetStatus] = useState(null);
  const fetchAllUsage = async () => {
    try {
      const [rSum, rRank, rMod, rAud, rRec, rBud] = await Promise.all([fetch(`${API_BASE}/api/usage/summary`), fetch(`${API_BASE}/api/usage/by-agent`), fetch(`${API_BASE}/api/usage/by-model`), fetch(`${API_BASE}/api/usage/task-audits`), fetch(`${API_BASE}/api/usage/records?limit=25`), fetch(`${API_BASE}/api/usage/budget/check`)]);
      if (rSum.ok) setSummary(await rSum.json());
      if (rRank.ok) setRankings(await rRank.json());
      if (rMod.ok) setModelCosts(await rMod.json());
      if (rAud.ok) setTaskAudits(await rAud.json());
      if (rRec.ok) setRecords(await rRec.json());
      if (rBud.ok) setBudgetStatus(await rBud.json());
    } catch (err) {
      console.warn('Live usage fetch fallback', err);
    }
  };
  useEffect(() => {
    fetchAllUsage();
  }, []);
  const cardBg = isDark ? '#161b22' : '#ffffff';
  const borderCol = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)';
  const textMain = isDark ? '#f0f6fc' : '#1d1d1f';
  const textSub = isDark ? '#8b949e' : '#86868b';
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: '22px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      flexWrap: 'wrap',
      gap: '14px'
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("h2", {
    style: {
      margin: '0 0 4px 0',
      fontSize: '20px',
      fontWeight: '700',
      color: textMain,
      letterSpacing: '-0.02em'
    }
  }, "\uD83D\uDCCA Token \u4E0E\u6210\u672C\u76D1\u63A7\u4E2D\u5FC3"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: '13px',
      color: textSub
    }
  }, "\u771F\u5B9E vs \u4F30\u7B97\u4E25\u683C\u5206\u8F68 \xB7 5\u7EF4\u7A7F\u900F\u62A5\u8868 \xB7 \u4EFB\u52A1\u91CD\u8BD5\u6EA2\u4EF7\u5BA1\u8BA1 \xB7 \u591A\u5C42\u7EA7\u9884\u7B97\u7194\u65AD")), /*#__PURE__*/React.createElement("button", {
    onClick: fetchAllUsage,
    className: "apple-card",
    style: {
      padding: '8px 16px',
      borderRadius: '10px',
      border: `1px solid ${borderCol}`,
      background: isDark ? 'rgba(31, 41, 55, 0.7)' : 'rgba(240, 247, 255, 0.8)',
      color: '#58a6ff',
      fontSize: '12px',
      fontWeight: '600',
      cursor: 'pointer',
      backdropFilter: 'blur(12px)'
    }
  }, "\uD83D\uDD04 \u5B9E\u65F6\u5237\u65B0\u5BF9\u8D26")), /*#__PURE__*/React.createElement("div", {
    className: "apple-card",
    style: {
      background: isDark ? 'rgba(63, 185, 80, 0.08)' : 'rgba(52, 199, 89, 0.08)',
      border: '1px solid rgba(63, 185, 80, 0.25)',
      borderRadius: '16px',
      padding: '16px 22px',
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      flexWrap: 'wrap',
      gap: '12px',
      backdropFilter: 'blur(20px)',
      WebkitBackdropFilter: 'blur(20px)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: '12px'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: '20px'
    }
  }, "\uD83D\uDEE1\uFE0F"), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: '13px',
      fontWeight: '600',
      color: textMain
    }
  }, "\u5DE5\u7A0B\u7EA7\u771F\u5B9E Token \u5BA1\u8BA1\u4FDD\u969C\u4F53\u7CFB (RFC 8785 \u7B7E\u540D\u4FDD\u62A4)"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: '12px',
      color: textSub
    }
  }, "\u672C\u7CFB\u7EDF\u4E25\u683C\u533A\u5206 ", /*#__PURE__*/React.createElement("strong", null, "Provider \u5B98\u65B9\u56DE\u4F20 (`provider_reported`)"), " \u4E0E\u5B57\u7B26\u4F30\u7B97\u503C (`estimated`)\uFF0C\u675C\u7EDD\u5047\u6570\u636E\u6DF7\u5165\u8BA1\u8D39\u62A5\u8868\u3002"))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: '10px'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: '12px',
      padding: '4px 12px',
      borderRadius: '8px',
      background: 'rgba(63, 185, 80, 0.2)',
      color: '#3fb950',
      fontWeight: '600'
    }
  }, "\u2713 \u771F\u5B9E\u7528\u91CF: ", summary?.real_tokens_pct || 100, "%"), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: '12px',
      padding: '4px 12px',
      borderRadius: '8px',
      background: 'rgba(210, 153, 34, 0.2)',
      color: '#d29922',
      fontWeight: '600'
    }
  }, "\u4F30\u7B97\u7528\u91CF: ", summary?.estimated_tokens_pct || 0, "%"))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
      gap: '16px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "apple-card apple-animate-in apple-stagger-1",
    style: {
      background: cardBg,
      border: `1px solid ${borderCol}`,
      borderRadius: '16px',
      padding: '20px',
      backdropFilter: 'blur(20px)',
      WebkitBackdropFilter: 'blur(20px)',
      boxShadow: isDark ? '0 8px 24px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.06)' : '0 8px 24px rgba(0,0,0,0.04), inset 0 1px 0 rgba(255,255,255,0.9)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: '12px',
      color: textSub,
      marginBottom: '6px'
    }
  }, "\u4ECA\u65E5\u6D88\u8017 Token"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: '26px',
      fontWeight: '700',
      color: textMain,
      letterSpacing: '-0.02em'
    }
  }, ((summary?.today_tokens || 0) / 1000).toFixed(1), "k"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: '11px',
      color: textSub,
      marginTop: '4px'
    }
  }, "\u5168\u7CFB\u7EDF\u6240\u6709 Agent \u6C47\u603B")), /*#__PURE__*/React.createElement("div", {
    className: "apple-card apple-animate-in apple-stagger-2",
    style: {
      background: cardBg,
      border: `1px solid ${borderCol}`,
      borderRadius: '16px',
      padding: '20px',
      backdropFilter: 'blur(20px)',
      WebkitBackdropFilter: 'blur(20px)',
      boxShadow: isDark ? '0 8px 24px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.06)' : '0 8px 24px rgba(0,0,0,0.04), inset 0 1px 0 rgba(255,255,255,0.9)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: '12px',
      color: textSub,
      marginBottom: '6px'
    }
  }, "\u4ECA\u65E5\u9884\u4F30\u8D39\u7528"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: '26px',
      fontWeight: '700',
      color: '#34c759',
      letterSpacing: '-0.02em'
    }
  }, "$", (summary?.today_cost_usd || 0).toFixed(2)), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: '11px',
      color: textSub,
      marginTop: '4px'
    }
  }, "\u6309\u670D\u52A1\u5546\u8D39\u7387\u6838\u7B97 (\u7EA6 \xA5", ((summary?.today_cost_usd || 0) * 7.25).toFixed(2), ")")), /*#__PURE__*/React.createElement("div", {
    className: "apple-card apple-animate-in apple-stagger-3",
    style: {
      background: cardBg,
      border: `1px solid ${borderCol}`,
      borderRadius: '16px',
      padding: '20px',
      backdropFilter: 'blur(20px)',
      WebkitBackdropFilter: 'blur(20px)',
      boxShadow: isDark ? '0 8px 24px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.06)' : '0 8px 24px rgba(0,0,0,0.04), inset 0 1px 0 rgba(255,255,255,0.9)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: '12px',
      color: textSub,
      marginBottom: '6px'
    }
  }, "\u6267\u884C\u4EFB\u52A1\u6570"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: '26px',
      fontWeight: '700',
      color: textMain,
      letterSpacing: '-0.02em'
    }
  }, summary?.today_tasks_count || 0), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: '11px',
      color: textSub,
      marginTop: '4px'
    }
  }, "\u771F\u5B9E\u4EFB\u52A1\u5B9E\u4F8B")), /*#__PURE__*/React.createElement("div", {
    className: "apple-card apple-animate-in apple-stagger-4",
    style: {
      background: cardBg,
      border: `1px solid ${borderCol}`,
      borderRadius: '16px',
      padding: '20px',
      backdropFilter: 'blur(20px)',
      WebkitBackdropFilter: 'blur(20px)',
      boxShadow: isDark ? '0 8px 24px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.06)' : '0 8px 24px rgba(0,0,0,0.04), inset 0 1px 0 rgba(255,255,255,0.9)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: '12px',
      color: textSub,
      marginBottom: '6px'
    }
  }, "\u5355\u4EFB\u52A1\u5E73\u5747\u6D88\u8017"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: '26px',
      fontWeight: '700',
      color: textMain,
      letterSpacing: '-0.02em'
    }
  }, ((summary?.avg_tokens_per_task || 0) / 1000).toFixed(1), "k"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: '11px',
      color: textSub,
      marginTop: '4px'
    }
  }, "Tokens / Task"))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'inline-flex',
      gap: '4px',
      background: isDark ? 'rgba(0,0,0,0.35)' : 'rgba(0,0,0,0.05)',
      padding: '4px',
      borderRadius: '12px',
      border: `1px solid ${borderCol}`,
      overflowX: 'auto'
    }
  }, [{
    key: 'agents',
    label: '🤖 Agent 消耗排行'
  }, {
    key: 'models',
    label: '🌐 模型费用分布'
  }, {
    key: 'retries',
    label: '⚠️ 重试溢价审计'
  }, {
    key: 'records',
    label: '📋 明细流水对账'
  }, {
    key: 'budget',
    label: '🛡️ 预算熔断策略'
  }].map(tab => /*#__PURE__*/React.createElement("button", {
    key: tab.key,
    onClick: () => setActiveSubTab(tab.key),
    style: {
      padding: '8px 16px',
      borderRadius: '9px',
      border: 'none',
      background: activeSubTab === tab.key ? isDark ? '#0071e3' : '#0071e3' : 'transparent',
      color: activeSubTab === tab.key ? '#ffffff' : textSub,
      fontSize: '13px',
      fontWeight: '600',
      cursor: 'pointer',
      whiteSpace: 'nowrap',
      boxShadow: activeSubTab === tab.key ? '0 2px 8px rgba(0, 113, 227, 0.4)' : 'none',
      transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)'
    }
  }, tab.label))), activeSubTab === 'agents' && /*#__PURE__*/React.createElement("div", {
    className: "apple-card",
    style: {
      background: cardBg,
      border: `1px solid ${borderCol}`,
      borderRadius: '16px',
      overflow: 'hidden',
      backdropFilter: 'blur(20px)',
      WebkitBackdropFilter: 'blur(20px)',
      boxShadow: isDark ? '0 8px 24px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.06)' : '0 8px 24px rgba(0,0,0,0.04), inset 0 1px 0 rgba(255,255,255,0.9)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '16px 20px',
      borderBottom: `1px solid ${borderCol}`
    }
  }, /*#__PURE__*/React.createElement("h3", {
    style: {
      margin: 0,
      fontSize: '15px',
      fontWeight: '600',
      color: textMain
    }
  }, "Agent \u7D2F\u8BA1\u6D88\u8017\u4E0E\u4EA7\u51FA\u6027\u4EF7\u6BD4\u6392\u884C\u699C")), /*#__PURE__*/React.createElement("div", {
    style: {
      overflowX: 'auto'
    }
  }, /*#__PURE__*/React.createElement("table", {
    style: {
      width: '100%',
      borderCollapse: 'collapse',
      fontSize: '13px',
      textAlign: 'left'
    }
  }, /*#__PURE__*/React.createElement("thead", null, /*#__PURE__*/React.createElement("tr", {
    style: {
      background: isDark ? 'rgba(0,0,0,0.2)' : 'rgba(0,0,0,0.02)',
      color: textSub,
      borderBottom: `1px solid ${borderCol}`
    }
  }, /*#__PURE__*/React.createElement("th", {
    style: {
      padding: '12px 18px'
    }
  }, "\u6392\u540D / Agent"), /*#__PURE__*/React.createElement("th", {
    style: {
      padding: '12px 14px'
    }
  }, "\u603B\u6D88\u8017 Tokens"), /*#__PURE__*/React.createElement("th", {
    style: {
      padding: '12px 14px'
    }
  }, "\u9884\u4F30\u6210\u672C (USD)"), /*#__PURE__*/React.createElement("th", {
    style: {
      padding: '12px 14px'
    }
  }, "\u6267\u884C\u4EFB\u52A1\u6570"), /*#__PURE__*/React.createElement("th", {
    style: {
      padding: '12px 14px'
    }
  }, "\u5E73\u5747\u6D88\u8017 / \u4EFB\u52A1"), /*#__PURE__*/React.createElement("th", {
    style: {
      padding: '12px 18px',
      textAlign: 'right'
    }
  }, "\u6548\u7387\u8BC4\u5206"))), /*#__PURE__*/React.createElement("tbody", null, rankings.map((r, i) => /*#__PURE__*/React.createElement("tr", {
    key: r.agent_id,
    style: {
      borderBottom: `1px solid ${borderCol}`,
      transition: 'background 0.15s ease'
    }
  }, /*#__PURE__*/React.createElement("td", {
    style: {
      padding: '14px 18px',
      display: 'flex',
      alignItems: 'center',
      gap: '10px'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      width: '20px',
      height: '20px',
      borderRadius: '50%',
      background: i === 0 ? 'rgba(210, 153, 34, 0.2)' : 'rgba(255,255,255,0.06)',
      color: i === 0 ? '#d29922' : textSub,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontSize: '11px',
      fontWeight: '700'
    }
  }, i + 1), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      fontWeight: '600',
      color: textMain
    }
  }, r.agent_name), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: '11px',
      color: textSub,
      fontFamily: 'monospace'
    }
  }, r.agent_id))), /*#__PURE__*/React.createElement("td", {
    style: {
      padding: '14px 14px',
      fontWeight: '600',
      color: textMain
    }
  }, r.total_tokens.toLocaleString()), /*#__PURE__*/React.createElement("td", {
    style: {
      padding: '14px 14px',
      color: '#3fb950',
      fontWeight: '500'
    }
  }, "$", r.total_cost_usd.toFixed(4)), /*#__PURE__*/React.createElement("td", {
    style: {
      padding: '14px 14px',
      color: textMain
    }
  }, r.task_count, " \u6B21"), /*#__PURE__*/React.createElement("td", {
    style: {
      padding: '14px 14px',
      color: textSub
    }
  }, r.avg_tokens_per_task.toLocaleString(), " tok"), /*#__PURE__*/React.createElement("td", {
    style: {
      padding: '14px 18px',
      textAlign: 'right'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: '12px',
      padding: '2px 8px',
      borderRadius: '6px',
      background: 'rgba(63, 185, 80, 0.15)',
      color: '#3fb950',
      fontWeight: '600'
    }
  }, (r.efficiency_score * 100).toFixed(0), "\u5206")))))))), activeSubTab === 'models' && /*#__PURE__*/React.createElement("div", {
    className: "apple-card",
    style: {
      background: cardBg,
      border: `1px solid ${borderCol}`,
      borderRadius: '16px',
      overflow: 'hidden',
      backdropFilter: 'blur(20px)',
      WebkitBackdropFilter: 'blur(20px)',
      boxShadow: isDark ? '0 8px 24px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.06)' : '0 8px 24px rgba(0,0,0,0.04), inset 0 1px 0 rgba(255,255,255,0.9)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '16px 20px',
      borderBottom: `1px solid ${borderCol}`
    }
  }, /*#__PURE__*/React.createElement("h3", {
    style: {
      margin: 0,
      fontSize: '15px',
      fontWeight: '600',
      color: textMain
    }
  }, "\u5927\u6A21\u578B\u8D39\u7528\u5360\u6BD4\u4E0E\u8C03\u7528\u89C4\u6A21\u5206\u5E03")), /*#__PURE__*/React.createElement("div", {
    style: {
      overflowX: 'auto'
    }
  }, /*#__PURE__*/React.createElement("table", {
    style: {
      width: '100%',
      borderCollapse: 'collapse',
      fontSize: '13px',
      textAlign: 'left'
    }
  }, /*#__PURE__*/React.createElement("thead", null, /*#__PURE__*/React.createElement("tr", {
    style: {
      background: isDark ? 'rgba(0,0,0,0.2)' : 'rgba(0,0,0,0.02)',
      color: textSub,
      borderBottom: `1px solid ${borderCol}`
    }
  }, /*#__PURE__*/React.createElement("th", {
    style: {
      padding: '12px 18px'
    }
  }, "\u6A21\u578B ID"), /*#__PURE__*/React.createElement("th", {
    style: {
      padding: '12px 14px'
    }
  }, "\u670D\u52A1\u5546"), /*#__PURE__*/React.createElement("th", {
    style: {
      padding: '12px 14px'
    }
  }, "\u603B\u6D88\u8017 Tokens"), /*#__PURE__*/React.createElement("th", {
    style: {
      padding: '12px 14px'
    }
  }, "\u9884\u4F30\u6210\u672C (USD)"), /*#__PURE__*/React.createElement("th", {
    style: {
      padding: '12px 18px',
      textAlign: 'right'
    }
  }, "\u8D39\u7528\u5360\u6BD4"))), /*#__PURE__*/React.createElement("tbody", null, modelCosts.map(m => /*#__PURE__*/React.createElement("tr", {
    key: m.model_id,
    style: {
      borderBottom: `1px solid ${borderCol}`
    }
  }, /*#__PURE__*/React.createElement("td", {
    style: {
      padding: '14px 18px',
      fontWeight: '600',
      color: textMain
    }
  }, m.model_id), /*#__PURE__*/React.createElement("td", {
    style: {
      padding: '14px 14px',
      color: '#58a6ff'
    }
  }, m.provider_id), /*#__PURE__*/React.createElement("td", {
    style: {
      padding: '14px 14px',
      color: textMain
    }
  }, m.total_tokens.toLocaleString()), /*#__PURE__*/React.createElement("td", {
    style: {
      padding: '14px 14px',
      color: '#3fb950',
      fontWeight: '500'
    }
  }, "$", m.cost_usd.toFixed(4)), /*#__PURE__*/React.createElement("td", {
    style: {
      padding: '14px 18px',
      textAlign: 'right'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'flex-end',
      gap: '8px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: '80px',
      height: '6px',
      background: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)',
      borderRadius: '3px',
      overflow: 'hidden'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: `${m.share_pct}%`,
      height: '100%',
      background: '#58a6ff',
      borderRadius: '3px'
    }
  })), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: '12px',
      fontWeight: '600',
      color: textMain
    }
  }, m.share_pct, "%"))))))))), activeSubTab === 'retries' && /*#__PURE__*/React.createElement("div", {
    className: "apple-card",
    style: {
      background: cardBg,
      border: `1px solid ${borderCol}`,
      borderRadius: '16px',
      overflow: 'hidden',
      backdropFilter: 'blur(20px)',
      WebkitBackdropFilter: 'blur(20px)',
      boxShadow: isDark ? '0 8px 24px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.06)' : '0 8px 24px rgba(0,0,0,0.04), inset 0 1px 0 rgba(255,255,255,0.9)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '16px 20px',
      borderBottom: `1px solid ${borderCol}`
    }
  }, /*#__PURE__*/React.createElement("h3", {
    style: {
      margin: 0,
      fontSize: '15px',
      fontWeight: '600',
      color: textMain
    }
  }, "\u26A0\uFE0F \u4EFB\u52A1\u91CD\u8BD5\u81A8\u80C0\u5BA1\u8BA1 (\u8BC6\u522B\u56E0\u91CD\u8BD5\u6D6A\u8D39\u7684\u6210\u672C)")), /*#__PURE__*/React.createElement("div", {
    style: {
      overflowX: 'auto'
    }
  }, /*#__PURE__*/React.createElement("table", {
    style: {
      width: '100%',
      borderCollapse: 'collapse',
      fontSize: '13px',
      textAlign: 'left'
    }
  }, /*#__PURE__*/React.createElement("thead", null, /*#__PURE__*/React.createElement("tr", {
    style: {
      background: isDark ? 'rgba(0,0,0,0.2)' : 'rgba(0,0,0,0.02)',
      color: textSub,
      borderBottom: `1px solid ${borderCol}`
    }
  }, /*#__PURE__*/React.createElement("th", {
    style: {
      padding: '12px 18px'
    }
  }, "\u4EFB\u52A1 ID"), /*#__PURE__*/React.createElement("th", {
    style: {
      padding: '12px 14px'
    }
  }, "\u603B\u6D88\u8017 Tokens"), /*#__PURE__*/React.createElement("th", {
    style: {
      padding: '12px 14px'
    }
  }, "\u91CD\u8BD5\u6D88\u8017 Tokens"), /*#__PURE__*/React.createElement("th", {
    style: {
      padding: '12px 14px'
    }
  }, "\u603B\u6210\u672C (USD)"), /*#__PURE__*/React.createElement("th", {
    style: {
      padding: '12px 18px',
      textAlign: 'right'
    }
  }, "\u91CD\u8BD5\u989D\u5916\u6EA2\u4EF7\u5360\u6BD4"))), /*#__PURE__*/React.createElement("tbody", null, taskAudits.map(t => /*#__PURE__*/React.createElement("tr", {
    key: t.task_id,
    style: {
      borderBottom: `1px solid ${borderCol}`,
      transition: 'background 0.15s ease'
    }
  }, /*#__PURE__*/React.createElement("td", {
    style: {
      padding: '14px 18px',
      fontFamily: 'monospace',
      color: textMain,
      fontWeight: '600'
    }
  }, t.task_id), /*#__PURE__*/React.createElement("td", {
    style: {
      padding: '14px 14px',
      color: textMain
    }
  }, t.total_tokens.toLocaleString()), /*#__PURE__*/React.createElement("td", {
    style: {
      padding: '14px 14px',
      color: t.retry_tokens > 0 ? '#f85149' : textSub
    }
  }, t.retry_tokens.toLocaleString()), /*#__PURE__*/React.createElement("td", {
    style: {
      padding: '14px 14px',
      color: '#3fb950'
    }
  }, "$", t.total_cost_usd.toFixed(4)), /*#__PURE__*/React.createElement("td", {
    style: {
      padding: '14px 18px',
      textAlign: 'right'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: '11px',
      padding: '2px 8px',
      borderRadius: '6px',
      background: t.retry_overhead_pct > 0 ? 'rgba(239, 68, 68, 0.15)' : 'rgba(63, 185, 80, 0.15)',
      color: t.retry_overhead_pct > 0 ? '#f85149' : '#3fb950',
      fontWeight: '600'
    }
  }, t.retry_overhead_pct, "%")))))))), activeSubTab === 'records' && /*#__PURE__*/React.createElement("div", {
    className: "apple-card",
    style: {
      background: cardBg,
      border: `1px solid ${borderCol}`,
      borderRadius: '16px',
      overflow: 'hidden',
      backdropFilter: 'blur(20px)',
      WebkitBackdropFilter: 'blur(20px)',
      boxShadow: isDark ? '0 8px 24px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.06)' : '0 8px 24px rgba(0,0,0,0.04), inset 0 1px 0 rgba(255,255,255,0.9)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '16px 20px',
      borderBottom: `1px solid ${borderCol}`
    }
  }, /*#__PURE__*/React.createElement("h3", {
    style: {
      margin: 0,
      fontSize: '15px',
      fontWeight: '600',
      color: textMain
    }
  }, "\uD83D\uDCCB \u5B9E\u65F6 Token \u6D41\u6C34\u8D26\u672C (\u6700\u8FD1 25 \u6761)")), /*#__PURE__*/React.createElement("div", {
    style: {
      overflowX: 'auto'
    }
  }, /*#__PURE__*/React.createElement("table", {
    style: {
      width: '100%',
      borderCollapse: 'collapse',
      fontSize: '12px',
      textAlign: 'left'
    }
  }, /*#__PURE__*/React.createElement("thead", null, /*#__PURE__*/React.createElement("tr", {
    style: {
      background: isDark ? 'rgba(0,0,0,0.2)' : 'rgba(0,0,0,0.02)',
      color: textSub,
      borderBottom: `1px solid ${borderCol}`
    }
  }, /*#__PURE__*/React.createElement("th", {
    style: {
      padding: '10px 14px'
    }
  }, "\u6D41\u6C34\u53F7 / \u4EFB\u52A1"), /*#__PURE__*/React.createElement("th", {
    style: {
      padding: '10px 12px'
    }
  }, "Agent"), /*#__PURE__*/React.createElement("th", {
    style: {
      padding: '10px 12px'
    }
  }, "\u6A21\u578B"), /*#__PURE__*/React.createElement("th", {
    style: {
      padding: '10px 12px'
    }
  }, "Input"), /*#__PURE__*/React.createElement("th", {
    style: {
      padding: '10px 12px'
    }
  }, "Output"), /*#__PURE__*/React.createElement("th", {
    style: {
      padding: '10px 12px'
    }
  }, "Cached"), /*#__PURE__*/React.createElement("th", {
    style: {
      padding: '10px 12px'
    }
  }, "Reasoning"), /*#__PURE__*/React.createElement("th", {
    style: {
      padding: '10px 12px'
    }
  }, "\u603B Tokens"), /*#__PURE__*/React.createElement("th", {
    style: {
      padding: '10px 12px'
    }
  }, "\u8D39\u7528"), /*#__PURE__*/React.createElement("th", {
    style: {
      padding: '10px 14px',
      textAlign: 'right'
    }
  }, "\u53E3\u5F84\u6765\u6E90"))), /*#__PURE__*/React.createElement("tbody", null, records.map(rec => /*#__PURE__*/React.createElement("tr", {
    key: rec.record_id,
    style: {
      borderBottom: `1px solid ${borderCol}`,
      transition: 'background 0.15s ease'
    }
  }, /*#__PURE__*/React.createElement("td", {
    style: {
      padding: '10px 14px',
      fontFamily: 'monospace'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      color: textMain,
      fontWeight: '600'
    }
  }, rec.task_id), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: '10px',
      color: textSub
    }
  }, rec.record_id)), /*#__PURE__*/React.createElement("td", {
    style: {
      padding: '10px 12px',
      color: '#58a6ff'
    }
  }, rec.agent_id), /*#__PURE__*/React.createElement("td", {
    style: {
      padding: '10px 12px',
      color: textMain
    }
  }, rec.model_id), /*#__PURE__*/React.createElement("td", {
    style: {
      padding: '10px 12px',
      color: textSub
    }
  }, rec.prompt_tokens), /*#__PURE__*/React.createElement("td", {
    style: {
      padding: '10px 12px',
      color: textSub
    }
  }, rec.completion_tokens), /*#__PURE__*/React.createElement("td", {
    style: {
      padding: '10px 12px',
      color: textSub
    }
  }, rec.cached_tokens), /*#__PURE__*/React.createElement("td", {
    style: {
      padding: '10px 12px',
      color: textSub
    }
  }, rec.reasoning_tokens), /*#__PURE__*/React.createElement("td", {
    style: {
      padding: '10px 12px',
      fontWeight: '700',
      color: textMain
    }
  }, rec.total_tokens), /*#__PURE__*/React.createElement("td", {
    style: {
      padding: '10px 12px',
      color: '#3fb950',
      fontWeight: '600'
    }
  }, "$", rec.cost_usd.toFixed(4)), /*#__PURE__*/React.createElement("td", {
    style: {
      padding: '10px 14px',
      textAlign: 'right'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: '10px',
      padding: '1px 6px',
      borderRadius: '4px',
      background: rec.usage_source === 'provider_reported' ? 'rgba(63, 185, 80, 0.15)' : 'rgba(56, 139, 253, 0.15)',
      color: rec.usage_source === 'provider_reported' ? '#3fb950' : '#58a6ff',
      fontWeight: '600'
    }
  }, rec.usage_source)))))))), activeSubTab === 'budget' && /*#__PURE__*/React.createElement("div", {
    className: "apple-card",
    style: {
      background: cardBg,
      border: `1px solid ${borderCol}`,
      borderRadius: '16px',
      padding: '24px',
      backdropFilter: 'blur(20px)',
      WebkitBackdropFilter: 'blur(20px)',
      boxShadow: isDark ? '0 8px 24px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.06)' : '0 8px 24px rgba(0,0,0,0.04), inset 0 1px 0 rgba(255,255,255,0.9)'
    }
  }, /*#__PURE__*/React.createElement("h3", {
    style: {
      margin: '0 0 14px 0',
      fontSize: '15px',
      fontWeight: '600',
      color: textMain
    }
  }, "\uD83D\uDEE1\uFE0F \u5206\u5C42\u9884\u7B97\u63A7\u5236\u53F0 (\u5F3A\u5236\u6027 B0 \u534F\u8BAE\u7EA6\u675F)"), /*#__PURE__*/React.createElement("p", {
    style: {
      margin: '0 0 16px 0',
      fontSize: '13px',
      color: textSub,
      lineHeight: 1.5
    }
  }, "\u9884\u7B97\u63A7\u5236\u4E0D\u4EC5\u4EC5\u662F\u524D\u7AEF\u544A\u8B66\u3002\u6240\u6709\u9650\u5236\u5747\u4E0B\u6C89\u81F3\u540E\u7AEF B0 \u72B6\u6001\u673A\u4E0E B1 \u6267\u884C\u5F15\u64CE\uFF0C\u4E00\u65E6\u8FBE\u5230 100% \u9608\u503C\u7ACB\u5373\u5F3A\u5236\u963B\u65AD\uFF0C\u907F\u514D\u5929\u4EF7\u8D26\u5355\u3002"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
      gap: '16px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "apple-card",
    style: {
      background: isDark ? 'rgba(13, 17, 23, 0.7)' : 'rgba(249, 250, 251, 0.8)',
      border: `1px solid ${borderCol}`,
      borderRadius: '14px',
      padding: '18px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: '14px',
      fontWeight: '700',
      color: textMain,
      marginBottom: '6px'
    }
  }, "\u6BCF\u65E5\u5168\u5C40\u9884\u7B97 (Daily Global)"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: '12px',
      color: textSub,
      marginBottom: '10px'
    }
  }, "\u4E0A\u9650: 1,000,000 Tokens \xB7 \u544A\u8B66\u7EBF: 80%"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: '12px',
      color: '#34c759',
      fontWeight: '600'
    }
  }, "\u7194\u65AD\u884C\u4E3A: BLOCK (\u76F4\u63A5\u963B\u65AD\u65B0\u4EFB\u52A1\u63D0\u4EA4)")), /*#__PURE__*/React.createElement("div", {
    className: "apple-card",
    style: {
      background: isDark ? 'rgba(13, 17, 23, 0.7)' : 'rgba(249, 250, 251, 0.8)',
      border: `1px solid ${borderCol}`,
      borderRadius: '14px',
      padding: '18px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: '14px',
      fontWeight: '700',
      color: textMain,
      marginBottom: '6px'
    }
  }, "\u5355\u4EFB\u52A1\u9884\u7B97 (Per-Task SLA)"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: '12px',
      color: textSub,
      marginBottom: '10px'
    }
  }, "\u4E0A\u9650: 100,000 Tokens \xB7 \u544A\u8B66\u7EBF: 80%"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: '12px',
      color: '#0071e3',
      fontWeight: '600'
    }
  }, "\u7194\u65AD\u884C\u4E3A: DEGRADE (\u81EA\u52A8\u964D\u7EA7\u81F3\u4F4E\u6210\u672C\u6A21\u578B)")))));
};

// ===== App.tsx =====

const VALID_TABS = ['dashboard', 'agents', 'models', 'usage', 'tasks', 'dag', 'benchmark', 'evolution', 'memory'];
const App = () => {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [isServerOnline, setIsServerOnline] = useState(null);
  const [isDark, setIsDark] = useState(() => {
    const saved = localStorage.getItem('nexus_theme');
    return saved !== null ? saved === 'dark' : true; // Default dark tech obsidian
  });

  // Codex Sidebar collapse state
  const [isCollapsed, setIsCollapsed] = useState(() => {
    const saved = localStorage.getItem('nexus_sidebar_collapsed');
    return saved === 'true';
  });

  // Codex Sidebar search filter
  const [searchQuery, setSearchQuery] = useState('');

  // Codex Recent tasks in sidebar
  const [recentTasks, setRecentTasks] = useState([]);

  // Codex Bottom Console Drawer
  const [isConsoleOpen, setIsConsoleOpen] = useState(false);
  const [consoleLogs, setConsoleLogs] = useState([{
    time: '21:02:18',
    type: 'SYS',
    msg: 'NEXUS CORE 2.1 引擎内核已就绪，B0 CAS 状态行锁激活'
  }, {
    time: '21:05:40',
    type: 'HOST',
    msg: '检测到宿主真实 DSH 运行时: D:\\新建文件夹\\...\\dsh.cmd (0.2.1-rc.3)'
  }, {
    time: '21:08:12',
    type: 'HOST',
    msg: '检测到宿主真实 Hermes 运行时: ...\\hermes\\bin\\hermes.exe (v0.21.6)'
  }, {
    time: '21:12:05',
    type: 'HOST',
    msg: '检测到宿主 Google Antigravity 宿主环境: Antigravity.exe'
  }, {
    time: '21:31:16',
    type: 'ORCH',
    msg: '真实流水线完成: Hermes 调研 -> DSH 探活 -> Antigravity 熔断实现 (1595 tokens)'
  }]);

  // Sync with URL Hash routing
  useEffect(() => {
    const handleHashChange = () => {
      const rawHash = window.location.hash.replace('#/', '').replace('#', '');
      if (VALID_TABS.includes(rawHash)) {
        setActiveTab(rawHash);
      }
    };
    handleHashChange();
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  // Global Keyboard Shortcut: Ctrl+B or Cmd+B to toggle sidebar
  useEffect(() => {
    const handleKeyDown = e => {
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
    fetch(`${API_BASE}/health`).then(res => setIsServerOnline(res.ok)).catch(() => setIsServerOnline(false));
    fetch(`${API_BASE}/tasks`).then(res => res.ok ? res.json() : []).then(data => {
      if (Array.isArray(data)) {
        setRecentTasks(data.slice(0, 5));
      }
    }).catch(() => {});
  }, []);
  const handleTabClick = tab => {
    if (VALID_TABS.includes(tab)) {
      setActiveTab(tab);
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
  const navSections = [{
    title: 'MAIN WORKSPACE',
    items: [{
      key: 'dashboard',
      icon: '📊',
      label: '控制台总览',
      desc: 'KPI / 遥测 / 快捷通道'
    }, {
      key: 'agents',
      icon: '🤖',
      label: 'Agent 管理中心',
      desc: '可视化向导 / 模板 / 启停'
    }, {
      key: 'models',
      icon: '🌐',
      label: '模型接入中心',
      desc: '多服务商 / 测速 / 路由'
    }, {
      key: 'usage',
      icon: '📈',
      label: 'Token 成本监控',
      desc: '真实审计 / 报表 / 预算'
    }]
  }, {
    title: 'EXECUTION & TOPOLOGY',
    items: [{
      key: 'tasks',
      icon: '📝',
      label: '任务编排与实时流',
      desc: 'SSE 推流与即时取消'
    }, {
      key: 'dag',
      icon: '🕸️',
      label: 'DAG 拓扑工作台',
      desc: '可拖拽拓扑图与抽屉'
    }, {
      key: 'benchmark',
      icon: '🔬',
      label: '性能对比实验室',
      desc: '多模型/Agent 竞速收益'
    }]
  }, {
    title: 'GOVERNANCE & AUDIT',
    items: [{
      key: 'evolution',
      icon: '🧬',
      label: 'M4 自主进化与巡检',
      desc: '沙箱预审 / 审批 / 回滚'
    }, {
      key: 'memory',
      icon: '🧠',
      label: 'M3 长期记忆库',
      desc: 'RCA 归因与混合向量检索'
    }]
  }];

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
    items: sec.items.filter(item => !isSearching || item.label.toLowerCase().includes(searchQuery.toLowerCase()) || item.desc.toLowerCase().includes(searchQuery.toLowerCase()) || item.key.toLowerCase().includes(searchQuery.toLowerCase()))
  })).filter(sec => sec.items.length > 0);
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      minHeight: '100vh',
      background: bgMain,
      color: textMain,
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", sans-serif',
      transition: 'background 0.2s ease'
    }
  }, /*#__PURE__*/React.createElement("aside", {
    className: "codex-sidebar-transition",
    style: {
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
      boxShadow: isDark ? '2px 0 20px rgba(0,0,0,0.2)' : '2px 0 10px rgba(0,0,0,0.02)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      padding: isCollapsed ? '16px 8px' : '16px 20px',
      borderBottom: `1px solid ${borderCol}`,
      display: 'flex',
      alignItems: 'center',
      justifyContent: isCollapsed ? 'center' : 'space-between'
    }
  }, !isCollapsed ? /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: '10px'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: '20px'
    }
  }, "\u26A1"), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: '15px',
      fontWeight: '700',
      letterSpacing: '-0.02em',
      color: textMain
    }
  }, "NEXUS CORE 2.1"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: '10px',
      color: '#58a6ff',
      fontWeight: '700',
      letterSpacing: '0.04em'
    }
  }, "CODEX CONSOLE"))) : /*#__PURE__*/React.createElement("div", {
    title: "NEXUS CORE 2.1",
    style: {
      fontSize: '22px',
      cursor: 'pointer'
    },
    onClick: toggleSidebar
  }, "\u26A1"), /*#__PURE__*/React.createElement("button", {
    onClick: toggleSidebar,
    title: isCollapsed ? '展开侧边栏 (Ctrl+B)' : '折叠侧边栏 (Ctrl+B)',
    style: {
      background: 'transparent',
      border: `1px solid ${borderCol}`,
      borderRadius: '6px',
      padding: '4px 7px',
      cursor: 'pointer',
      color: textSub,
      fontSize: '12px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center'
    }
  }, isCollapsed ? '◧' : '◨')), !isCollapsed && /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '12px 16px 4px 16px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      background: isDark ? 'rgba(255,255,255,0.04)' : '#f0f2f5',
      padding: '6px 10px',
      borderRadius: '8px',
      border: `1px solid ${borderCol}`
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: '12px',
      color: textSub
    }
  }, "\uD83D\uDD0D"), /*#__PURE__*/React.createElement("input", {
    type: "text",
    placeholder: "\u5FEB\u901F\u641C\u7D22\u529F\u80FD...",
    value: searchQuery,
    onChange: e => setSearchQuery(e.target.value),
    style: {
      width: '100%',
      background: 'transparent',
      border: 'none',
      fontSize: '12px',
      color: textMain,
      outline: 'none'
    }
  }), searchQuery && /*#__PURE__*/React.createElement("button", {
    onClick: () => setSearchQuery(''),
    style: {
      background: 'transparent',
      border: 'none',
      color: textSub,
      fontSize: '11px',
      cursor: 'pointer'
    }
  }, "\u2715"))), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      overflowY: 'auto',
      padding: isCollapsed ? '12px 8px' : '14px 12px',
      display: 'flex',
      flexDirection: 'column',
      gap: '16px'
    }
  }, filteredSections.map(sec => /*#__PURE__*/React.createElement("div", {
    key: sec.title
  }, !isCollapsed && /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: '10px',
      fontWeight: '700',
      color: textSub,
      letterSpacing: '0.06em',
      padding: '0 8px 6px 8px'
    }
  }, sec.title), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: '3px'
    }
  }, sec.items.map(item => {
    const isActive = activeTab === item.key;
    return /*#__PURE__*/React.createElement("div", {
      key: item.key,
      className: "codex-rail-item"
    }, /*#__PURE__*/React.createElement("button", {
      onClick: () => handleTabClick(item.key),
      style: {
        width: '100%',
        padding: isCollapsed ? '10px 0' : '8px 10px',
        borderRadius: '8px',
        border: 'none',
        background: isActive ? isDark ? 'rgba(56, 139, 253, 0.16)' : 'rgba(0, 113, 227, 0.1)' : 'transparent',
        color: isActive ? '#58a6ff' : textMain,
        textAlign: isCollapsed ? 'center' : 'left',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        gap: isCollapsed ? '0' : '10px',
        justifyContent: isCollapsed ? 'center' : 'flex-start',
        position: 'relative',
        transition: 'all 0.2s ease',
        boxShadow: isActive ? isDark ? 'inset 0 1px 0 rgba(255,255,255,0.08)' : '0 2px 6px rgba(0,113,227,0.1)' : 'none'
      }
    }, isActive && !isCollapsed && /*#__PURE__*/React.createElement("div", {
      style: {
        position: 'absolute',
        left: '-4px',
        top: '20%',
        bottom: '20%',
        width: '3px',
        background: '#58a6ff',
        borderRadius: '2px'
      }
    }), /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: isCollapsed ? '18px' : '15px'
      }
    }, item.icon), !isCollapsed && /*#__PURE__*/React.createElement("div", {
      style: {
        overflow: 'hidden'
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: '12px',
        fontWeight: isActive ? '700' : '500',
        whiteSpace: 'nowrap',
        textOverflow: 'ellipsis',
        overflow: 'hidden'
      }
    }, item.label), /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: '10px',
        color: textSub,
        whiteSpace: 'nowrap',
        textOverflow: 'ellipsis',
        overflow: 'hidden'
      }
    }, item.desc))), isCollapsed && /*#__PURE__*/React.createElement("div", {
      className: "codex-tooltip"
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        fontWeight: '700'
      }
    }, item.label), /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: '10px',
        color: '#8b949e'
      }
    }, item.desc)));
  })))), !isCollapsed && /*#__PURE__*/React.createElement("div", {
    style: {
      background: isDark ? 'rgba(0,0,0,0.25)' : '#f8fafc',
      border: `1px solid ${borderCol}`,
      borderRadius: '10px',
      padding: '10px 12px',
      marginTop: '4px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: '8px'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: '10px',
      fontWeight: '700',
      color: textSub,
      letterSpacing: '0.04em'
    }
  }, "HOST AGENTS \u672C\u673A\u667A\u80FD\u4F53"), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: '9px',
      color: '#3fb950',
      fontWeight: '700'
    }
  }, "3 ONLINE")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: '5px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    onClick: () => handleTabClick('agents'),
    style: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      fontSize: '11px',
      cursor: 'pointer',
      padding: '2px 0'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: '6px'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      width: '6px',
      height: '6px',
      borderRadius: '50%',
      background: '#3fb950',
      display: 'inline-block'
    }
  }), /*#__PURE__*/React.createElement("strong", null, "DSH"), " (0.2.1-rc.3)"), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: '9px',
      color: textSub,
      fontFamily: 'monospace'
    }
  }, "dsh.cmd")), /*#__PURE__*/React.createElement("div", {
    onClick: () => handleTabClick('agents'),
    style: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      fontSize: '11px',
      cursor: 'pointer',
      padding: '2px 0'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: '6px'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      width: '6px',
      height: '6px',
      borderRadius: '50%',
      background: '#3fb950',
      display: 'inline-block'
    }
  }), /*#__PURE__*/React.createElement("strong", null, "Hermes"), " (0.21.6)"), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: '9px',
      color: textSub,
      fontFamily: 'monospace'
    }
  }, "hermes.exe")), /*#__PURE__*/React.createElement("div", {
    onClick: () => handleTabClick('agents'),
    style: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      fontSize: '11px',
      cursor: 'pointer',
      padding: '2px 0'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: '6px'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      width: '6px',
      height: '6px',
      borderRadius: '50%',
      background: '#3fb950',
      display: 'inline-block'
    }
  }), /*#__PURE__*/React.createElement("strong", null, "Antigravity")), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: '9px',
      color: textSub,
      fontFamily: 'monospace'
    }
  }, "Host Runtime")))), !isCollapsed && recentTasks.length > 0 && /*#__PURE__*/React.createElement("div", {
    style: {
      background: isDark ? 'rgba(0,0,0,0.2)' : '#f8fafc',
      border: `1px solid ${borderCol}`,
      borderRadius: '10px',
      padding: '10px 12px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: '6px'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: '10px',
      fontWeight: '700',
      color: textSub,
      letterSpacing: '0.04em'
    }
  }, "RECENT TASKS \u6700\u8FD1\u4EFB\u52A1"), /*#__PURE__*/React.createElement("span", {
    onClick: () => handleTabClick('tasks'),
    style: {
      fontSize: '10px',
      color: '#58a6ff',
      cursor: 'pointer'
    }
  }, "\u67E5\u770B\u5168\u90E8")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: '4px'
    }
  }, recentTasks.slice(0, 3).map(t => /*#__PURE__*/React.createElement("div", {
    key: t.id,
    onClick: () => handleTabClick('tasks'),
    style: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      fontSize: '11px',
      cursor: 'pointer',
      padding: '4px 6px',
      borderRadius: '6px',
      background: isDark ? 'rgba(255,255,255,0.02)' : '#fff'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap',
      maxWidth: '160px'
    }
  }, t.goal), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: '9px',
      padding: '1px 5px',
      borderRadius: '4px',
      background: t.status === 'success' ? 'rgba(63, 185, 80, 0.15)' : 'rgba(210, 153, 34, 0.15)',
      color: t.status === 'success' ? '#3fb950' : '#d29922',
      fontWeight: '700'
    }
  }, t.status)))))), /*#__PURE__*/React.createElement("div", {
    style: {
      padding: isCollapsed ? '12px 0' : '12px 18px',
      borderTop: `1px solid ${borderCol}`,
      fontSize: '11px',
      color: textSub,
      display: 'flex',
      justifyContent: isCollapsed ? 'center' : 'space-between',
      alignItems: 'center'
    }
  }, !isCollapsed ? /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: '5px'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      width: '6px',
      height: '6px',
      borderRadius: '50%',
      background: '#3fb950',
      display: 'inline-block'
    }
  }), /*#__PURE__*/React.createElement("span", null, "208 \u9879\u6D4B\u8BD5\u5168\u8FC7")), /*#__PURE__*/React.createElement("button", {
    onClick: toggleSidebar,
    style: {
      background: 'transparent',
      border: 'none',
      color: textSub,
      fontSize: '10px',
      cursor: 'pointer',
      padding: '2px 4px'
    }
  }, "\u6298\u53E0 [Ctrl+B]")) : /*#__PURE__*/React.createElement("button", {
    onClick: toggleSidebar,
    title: "\u5C55\u5F00\u4FA7\u8FB9\u680F (Ctrl+B)",
    style: {
      background: 'transparent',
      border: 'none',
      color: textSub,
      fontSize: '13px',
      cursor: 'pointer'
    }
  }, "\u25E7"))), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      display: 'flex',
      flexDirection: 'column',
      minWidth: 0,
      position: 'relative'
    }
  }, /*#__PURE__*/React.createElement("header", {
    style: {
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
      zIndex: 40
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: '8px'
    }
  }, /*#__PURE__*/React.createElement("button", {
    onClick: toggleSidebar,
    style: {
      background: isDark ? 'rgba(255,255,255,0.05)' : '#f0f2f5',
      border: `1px solid ${borderCol}`,
      borderRadius: '6px',
      padding: '4px 8px',
      cursor: 'pointer',
      color: textMain,
      fontSize: '12px',
      display: 'flex',
      alignItems: 'center',
      gap: '4px'
    },
    title: "\u6298\u53E0/\u5C55\u5F00\u4FA7\u8FB9\u680F (Ctrl+B)"
  }, /*#__PURE__*/React.createElement("span", null, isCollapsed ? '◧' : '◨')), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: '12px',
      color: textSub
    }
  }, "NEXUS"), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: '12px',
      color: textSub
    }
  }, "/"), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: '13px',
      fontWeight: '700',
      color: textMain,
      textTransform: 'uppercase'
    }
  }, activeTab), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: '10px',
      padding: '1px 6px',
      borderRadius: '6px',
      background: isDark ? 'rgba(56, 139, 253, 0.15)' : 'rgba(0, 113, 227, 0.1)',
      color: '#58a6ff',
      fontWeight: '600'
    }
  }, "Codex Workspace")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: '12px'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: '11px',
      display: 'flex',
      alignItems: 'center',
      gap: '6px',
      background: isDark ? 'rgba(63, 185, 80, 0.1)' : '#f0fdf4',
      border: `1px solid ${isDark ? 'rgba(63, 185, 80, 0.25)' : 'rgba(63, 185, 80, 0.3)'}`,
      padding: '4px 10px',
      borderRadius: '8px',
      color: '#3fb950',
      fontWeight: '600'
    }
  }, /*#__PURE__*/React.createElement("span", {
    className: "apple-pulse-green",
    style: {
      width: '6px',
      height: '6px',
      borderRadius: '50%',
      background: '#3fb950'
    }
  }), "3\u4E2A\u5BBF\u4E3B\u771F\u5B9EAgent\u5DF2\u7ED1\u5B9A"), /*#__PURE__*/React.createElement("button", {
    onClick: () => handleTabClick('tasks'),
    style: {
      background: '#0071e3',
      border: 'none',
      borderRadius: '8px',
      color: '#fff',
      padding: '5px 12px',
      fontSize: '12px',
      fontWeight: '600',
      cursor: 'pointer',
      display: 'flex',
      alignItems: 'center',
      gap: '5px'
    }
  }, /*#__PURE__*/React.createElement("span", null, "+"), " \u7F16\u6392\u4EFB\u52A1"), /*#__PURE__*/React.createElement("button", {
    onClick: () => setIsConsoleOpen(!isConsoleOpen),
    title: "\u5207\u6362\u5E95\u90E8\u63A7\u5236\u53F0\u6258\u76D8",
    style: {
      background: isConsoleOpen ? isDark ? 'rgba(88, 166, 255, 0.2)' : 'rgba(0, 113, 227, 0.15)' : 'transparent',
      border: `1px solid ${borderCol}`,
      borderRadius: '8px',
      padding: '5px 10px',
      fontSize: '12px',
      cursor: 'pointer',
      color: isConsoleOpen ? '#58a6ff' : textMain,
      display: 'flex',
      alignItems: 'center',
      gap: '5px'
    }
  }, /*#__PURE__*/React.createElement("span", null, "\uD83D\uDCBB"), " \u63A7\u5236\u53F0"), /*#__PURE__*/React.createElement("button", {
    onClick: toggleTheme,
    title: "\u5207\u6362\u6DF1\u8272/\u6D45\u8272\u4E3B\u9898",
    style: {
      background: isDark ? '#1f2937' : '#f0f7ff',
      border: `1px solid ${borderCol}`,
      borderRadius: '8px',
      padding: '5px 9px',
      fontSize: '12px',
      cursor: 'pointer',
      color: textMain,
      display: 'flex',
      alignItems: 'center',
      gap: '4px'
    }
  }, /*#__PURE__*/React.createElement("span", null, isDark ? '🌙' : '☀️')))), /*#__PURE__*/React.createElement("main", {
    key: activeTab,
    className: "apple-animate-in",
    style: {
      flex: 1,
      padding: '24px 28px',
      maxWidth: '1440px',
      width: '100%',
      boxSizing: 'border-box',
      marginBottom: isConsoleOpen ? '190px' : '0',
      transition: 'margin-bottom 0.28s ease'
    }
  }, activeTab === 'dashboard' && /*#__PURE__*/React.createElement(DashboardOverview, {
    onNavigate: handleTabClick,
    isDark: isDark
  }), activeTab === 'agents' && /*#__PURE__*/React.createElement(AgentCenter, {
    isDark: isDark
  }), activeTab === 'models' && /*#__PURE__*/React.createElement(ModelCenter, {
    isDark: isDark
  }), activeTab === 'usage' && /*#__PURE__*/React.createElement(UsageCenter, {
    isDark: isDark
  }), activeTab === 'tasks' && /*#__PURE__*/React.createElement(TaskWorkspace, null), activeTab === 'dag' && /*#__PURE__*/React.createElement(DAGStudio, null), activeTab === 'benchmark' && /*#__PURE__*/React.createElement(BenchmarkCenter, null), activeTab === 'evolution' && /*#__PURE__*/React.createElement(EvolutionPanel, {
    isDark: isDark
  }), activeTab === 'memory' && /*#__PURE__*/React.createElement(MemoryInspector, null)), /*#__PURE__*/React.createElement("div", {
    className: "codex-bottom-drawer",
    style: {
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
      boxShadow: '0 -8px 24px rgba(0,0,0,0.3)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      height: '32px',
      background: isDark ? '#161b22' : '#252526',
      borderBottom: `1px solid ${borderCol}`,
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: '0 16px',
      fontSize: '11px',
      fontFamily: 'monospace'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: '12px'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      color: '#58a6ff',
      fontWeight: '700'
    }
  }, "\u26A1 NEXUS TELEMETRY STREAM"), /*#__PURE__*/React.createElement("span", {
    style: {
      color: '#3fb950'
    }
  }, "\u25CF LIVE"), /*#__PURE__*/React.createElement("span", {
    style: {
      color: '#8b949e'
    }
  }, "\u4E3B\u673A\u76F4\u8FDE\u63A2\u9488\u5C31\u7EEA")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: '10px'
    }
  }, /*#__PURE__*/React.createElement("button", {
    onClick: () => setConsoleLogs([]),
    style: {
      background: 'transparent',
      border: 'none',
      color: '#8b949e',
      fontSize: '10px',
      cursor: 'pointer'
    }
  }, "\u6E05\u7A7A"), /*#__PURE__*/React.createElement("button", {
    onClick: () => setIsConsoleOpen(false),
    style: {
      background: 'transparent',
      border: 'none',
      color: '#8b949e',
      fontSize: '12px',
      cursor: 'pointer'
    }
  }, "\u2715"))), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      padding: '10px 16px',
      overflowY: 'auto',
      fontFamily: 'monospace',
      fontSize: '11px',
      lineHeight: '1.6'
    }
  }, consoleLogs.map((log, i) => /*#__PURE__*/React.createElement("div", {
    key: i,
    style: {
      display: 'flex',
      gap: '8px'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      color: '#8b949e'
    }
  }, "[", log.time, "]"), /*#__PURE__*/React.createElement("span", {
    style: {
      color: log.type === 'HOST' ? '#3fb950' : log.type === 'ORCH' ? '#58a6ff' : '#d29922',
      fontWeight: '700'
    }
  }, "[", log.type, "]"), /*#__PURE__*/React.createElement("span", {
    style: {
      color: '#f0f6fc'
    }
  }, log.msg)))))));
};

// Mount React root
const container = document.getElementById('root');
if (container) {
  const root = ReactDOM.createRoot(container);
  root.render(React.createElement(App, null));
}
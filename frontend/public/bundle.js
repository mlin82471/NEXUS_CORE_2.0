const {
  useState,
  useEffect,
  useRef
} = React;
const API_BASE = 'http://127.0.0.1:8000';

// ===== types.ts =====

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
  const [error, setError] = useState(null);
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
  }, "\u23F9\uFE0F \u53D6\u6D88")), error && /*#__PURE__*/React.createElement("div", {
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
    style: {
      background: '#fff',
      borderRadius: '16px',
      padding: '18px 24px',
      border: '1px solid rgba(0,0,0,0.06)',
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center'
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'monospace',
      fontWeight: '600',
      color: '#0071e3',
      fontSize: '14px'
    }
  }, currentTask.id), /*#__PURE__*/React.createElement("span", {
    style: {
      marginLeft: '12px',
      fontSize: '12px',
      padding: '3px 10px',
      borderRadius: '12px',
      background: currentTask.status === 'success' ? '#e3f9e5' : '#e8f2ff',
      color: currentTask.status === 'success' ? '#1a7f37' : '#0071e3',
      fontWeight: '600'
    }
  }, currentTask.status), /*#__PURE__*/React.createElement("span", {
    style: {
      marginLeft: '8px',
      fontSize: '12px',
      color: '#86868b'
    }
  }, "\u590D\u6742\u5EA6: ", /*#__PURE__*/React.createElement("strong", null, currentTask.complexity), " | \u8DEF\u7531\u6A21\u578B: ", /*#__PURE__*/React.createElement("strong", null, currentTask.routing_decision?.model_name || 'default'))), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: '12px',
      color: '#86868b'
    }
  }, "\u6B65\u9AA4\u6570: ", currentTask.steps.length)), /*#__PURE__*/React.createElement("div", {
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
  }, "\uD83D\uDDFA\uFE0F \u4EFB\u52A1 DAG \u7F16\u6392\u62D3\u6251\u56FE\uFF08\u70B9\u51FB\u8282\u70B9\u67E5\u770B\u8BE6\u7EC6\u8F93\u5165\u8F93\u51FA\uFF09"), /*#__PURE__*/React.createElement(DAGTopology, {
    steps: currentTask.steps,
    selectedKey: selectedStep?.step_key,
    onSelectStep: s => setSelectedStep(s)
  })), selectedStep && /*#__PURE__*/React.createElement("div", {
    style: {
      background: '#fff',
      borderRadius: '16px',
      padding: '20px',
      border: '1px solid #0071e3',
      boxShadow: '0 4px 16px rgba(0,113,227,0.08)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      justifyContent: 'space-between',
      marginBottom: '8px'
    }
  }, /*#__PURE__*/React.createElement("strong", null, "\u8282\u70B9\u8BE6\u60C5: ", selectedStep.step_key, " [", selectedStep.role, "]"), /*#__PURE__*/React.createElement("span", {
    style: {
      color: '#0071e3',
      fontWeight: '600',
      fontSize: '12px'
    }
  }, "\u72B6\u6001: ", selectedStep.status)), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: '12px',
      color: '#86868b',
      marginBottom: '8px'
    }
  }, "\u76EE\u6807: ", selectedStep.goal), selectedStep.result && /*#__PURE__*/React.createElement("pre", {
    style: {
      background: '#f5f5f7',
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

const BenchmarkCenter = () => {
  const [goal, setGoal] = useState('计算 2+2 的结果');
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState(null);
  const [error, setError] = useState(null);
  const handleRunCompare = async () => {
    if (!goal.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/benchmark/compare`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          goal: goal.trim(),
          task_type: 'general'
        })
      });
      if (!res.ok) throw new Error(`对照测试失败 HTTP ${res.status}`);
      setReport(await res.json());
    } catch (e) {
      setError(e.message);
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
  }, "\u2696\uFE0F \u5355 Agent vs \u591A Agent A/B \u5BF9\u7167\u57FA\u51C6\u4E2D\u5FC3 (\xA77 \u6536\u76CA\u9A8C\u8BC1)"), /*#__PURE__*/React.createElement("p", {
    style: {
      fontSize: '13px',
      color: '#86868b',
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
      color: '#86868b',
      marginBottom: '6px'
    }
  }, "\u5B9E\u9A8C\u6D4B\u8BD5\u76EE\u6807"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: '10px'
    }
  }, /*#__PURE__*/React.createElement("input", {
    type: "text",
    value: goal,
    onChange: e => setGoal(e.target.value),
    placeholder: "\u4F8B\u5982\uFF1A\u8BA1\u7B97 2+2 \u7684\u7ED3\u679C \u6216 \u7F16\u5199\u5FEB\u901F\u6392\u5E8F\u7B97\u6CD5\u5E76\u6D4B\u8BD5",
    style: {
      flex: 1,
      padding: '10px 14px',
      borderRadius: '10px',
      border: '1px solid #d2d2d7',
      fontSize: '13px'
    }
  }), /*#__PURE__*/React.createElement("button", {
    onClick: handleRunCompare,
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
  }, loading ? '🔬 正在并发对照运行...' : '🔬 启动双模式对照实验'))), error && /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '12px',
      background: '#ffebe9',
      color: '#cf222e',
      borderRadius: '8px',
      fontSize: '13px',
      marginBottom: '16px'
    }
  }, error), report && /*#__PURE__*/React.createElement("div", {
    style: {
      border: '1px solid #e5e5ea',
      borderRadius: '14px',
      padding: '20px',
      background: '#fafafc',
      marginTop: '20px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: '12px'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: '15px',
      fontWeight: '600',
      color: report.recommendation === 'use_single_agent' ? '#0071e3' : '#34c759'
    }
  }, "\uD83D\uDCCA \u667A\u80FD\u4E3B\u63A7\u5224\u5B9A: ", report.recommendation === 'use_single_agent' ? '推荐单 Agent 直达 (避免冗余开销)' : '推荐多 Agent 协作 (解耦与验证价值成立)'), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: '12px',
      color: '#86868b'
    }
  }, "\u5206\u7C7B\u590D\u6742\u5EA6: ", /*#__PURE__*/React.createElement("strong", null, report.complexity))), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: '13px',
      color: '#1d1d1f',
      background: '#fff',
      padding: '12px',
      borderRadius: '8px',
      border: '1px solid #e5e5ea',
      marginBottom: '16px'
    }
  }, report.reason), /*#__PURE__*/React.createElement("table", {
    style: {
      width: '100%',
      fontSize: '13px',
      borderCollapse: 'collapse',
      background: '#fff',
      borderRadius: '8px',
      overflow: 'hidden',
      border: '1px solid #e5e5ea'
    }
  }, /*#__PURE__*/React.createElement("thead", null, /*#__PURE__*/React.createElement("tr", {
    style: {
      background: '#f5f5f7',
      borderBottom: '1px solid #e5e5ea',
      textAlign: 'left',
      color: '#86868b'
    }
  }, /*#__PURE__*/React.createElement("th", {
    style: {
      padding: '10px 14px'
    }
  }, "\u5BF9\u6BD4\u7EF4\u5EA6"), /*#__PURE__*/React.createElement("th", {
    style: {
      padding: '10px 14px'
    }
  }, "\u5355 Agent \u6A21\u5F0F (Mode A)"), /*#__PURE__*/React.createElement("th", {
    style: {
      padding: '10px 14px'
    }
  }, "\u591A Agent \u7F16\u6392\u6A21\u5F0F (Mode B)"), /*#__PURE__*/React.createElement("th", {
    style: {
      padding: '10px 14px'
    }
  }, "\u5BF9\u6BD4\u5DEE\u5F02 / \u653E\u5927\u500D\u7387"))), /*#__PURE__*/React.createElement("tbody", null, /*#__PURE__*/React.createElement("tr", {
    style: {
      borderBottom: '1px solid #e5e5ea'
    }
  }, /*#__PURE__*/React.createElement("td", {
    style: {
      padding: '10px 14px',
      fontWeight: '500'
    }
  }, "\u6D88\u8017\u603B Token"), /*#__PURE__*/React.createElement("td", {
    style: {
      padding: '10px 14px'
    }
  }, report.single_agent.total_tokens), /*#__PURE__*/React.createElement("td", {
    style: {
      padding: '10px 14px'
    }
  }, report.multi_agent.total_tokens), /*#__PURE__*/React.createElement("td", {
    style: {
      padding: '10px 14px',
      color: '#ff9500',
      fontWeight: '600'
    }
  }, report.token_multiplier, "x \u6D88\u8017")), /*#__PURE__*/React.createElement("tr", {
    style: {
      borderBottom: '1px solid #e5e5ea'
    }
  }, /*#__PURE__*/React.createElement("td", {
    style: {
      padding: '10px 14px',
      fontWeight: '500'
    }
  }, "\u6267\u884C\u8017\u65F6"), /*#__PURE__*/React.createElement("td", {
    style: {
      padding: '10px 14px'
    }
  }, report.single_agent.elapsed_seconds, " s"), /*#__PURE__*/React.createElement("td", {
    style: {
      padding: '10px 14px'
    }
  }, report.multi_agent.elapsed_seconds, " s"), /*#__PURE__*/React.createElement("td", {
    style: {
      padding: '10px 14px'
    }
  }, "\u0394 ", report.time_delta_seconds, " s")), /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("td", {
    style: {
      padding: '10px 14px',
      fontWeight: '500'
    }
  }, "\u6267\u884C\u6B65\u9AA4\u4E0E\u72B6\u6001"), /*#__PURE__*/React.createElement("td", {
    style: {
      padding: '10px 14px'
    }
  }, "1 \u6B65 (", report.single_agent.status, ")"), /*#__PURE__*/React.createElement("td", {
    style: {
      padding: '10px 14px'
    }
  }, report.multi_agent.steps_count, " \u6B65 (", report.multi_agent.status, ")"), /*#__PURE__*/React.createElement("td", {
    style: {
      padding: '10px 14px'
    }
  }, report.multi_agent.status === 'success' ? '✅ 全部成功' : '⚠️ 存在失败'))))));
};

// ===== components/EvolutionPanel.tsx =====

const EvolutionPanel = () => {
  const [proposals, setProposals] = useState([]);
  const [sweeperStatus, setSweeperStatus] = useState(null);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState(null);
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
      const res = await fetch(`${API_BASE}/evolution/sweeper/trigger`, {
        method: 'POST'
      });
      if (res.ok) {
        const data = await res.json();
        setMsg(`巡检 #${data.sweep_id} 完成（耗时 ${data.duration_seconds}s）！发现新提案: ${data.new_proposals_found}，沙箱通过待审批: ${data.verified_pending_approval}`);
        fetchProposals();
        fetchSweeperStatus();
      }
    } catch (e) {
      setMsg(`巡检触发异常: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };
  const handleRunDiagnosis = async () => {
    setLoading(true);
    setMsg('正在基于历史遥测指标与失败 RCA 执行全量自演进分析...');
    try {
      const res = await fetch(`${API_BASE}/evolution/analyze`, {
        method: 'POST'
      });
      if (res.ok) {
        const found = await res.json();
        setMsg(`诊断完成，发现 ${found.length} 个优化提案！已通过沙箱预演。`);
        fetchProposals();
      }
    } catch (e) {
      setMsg(`分析失败: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };
  const handleApprove = async id => {
    const token = prompt('请输入批准口令 (NEXUS_APPROVAL_TOKEN):', 'nexus-dev-approval-token') || 'nexus-dev-approval-token';
    try {
      const res = await fetch(`${API_BASE}/evolution/proposals/${id}/approve`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          approval_token: token,
          comment: 'Web UI User Approval'
        })
      });
      if (res.ok) {
        alert('提案已批准并原子生效！');
        fetchProposals();
      } else {
        const err = await res.json();
        alert(`批准失败: ${err.detail || '未知原因'}`);
      }
    } catch (e) {
      alert(`网络异常: ${e.message}`);
    }
  };
  const handleRollback = async id => {
    if (!confirm('确认回滚此生效提案并恢复到之前快照吗？')) return;
    try {
      const res = await fetch(`${API_BASE}/evolution/proposals/${id}/rollback`, {
        method: 'POST'
      });
      if (res.ok) {
        alert('提案已安全回滚！');
        fetchProposals();
      } else {
        const err = await res.json();
        alert(`回滚失败: ${err.detail || '未知原因'}`);
      }
    } catch (e) {
      alert(`网络异常: ${e.message}`);
    }
  };
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
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: '14px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: '42px',
      height: '42px',
      borderRadius: '12px',
      background: sweeperStatus?.is_running ? '#e6f7ed' : '#fff4e5',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontSize: '20px'
    }
  }, "\uD83E\uDD16"), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: '8px'
    }
  }, /*#__PURE__*/React.createElement("h3", {
    style: {
      fontSize: '16px',
      fontWeight: '600',
      margin: 0,
      color: '#1d1d1f'
    }
  }, "\u81EA\u4E3B\u6F14\u8FDB\u5B88\u62A4\u5DE1\u68C0\u5668 (Autonomous Sweeper)"), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: '11px',
      padding: '2px 8px',
      borderRadius: '10px',
      background: sweeperStatus?.is_running ? '#e6f7ed' : '#f2f2f7',
      color: sweeperStatus?.is_running ? '#1b803a' : '#8e8e93',
      fontWeight: '600',
      display: 'flex',
      alignItems: 'center',
      gap: '4px'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      width: '6px',
      height: '6px',
      borderRadius: '50%',
      background: sweeperStatus?.is_running ? '#34c759' : '#8e8e93'
    }
  }), sweeperStatus?.is_running ? '常驻运行中' : '未就绪')), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: '12px',
      color: '#86868b',
      marginTop: '4px'
    }
  }, "\u5DE1\u68C0\u5468\u671F: ", /*#__PURE__*/React.createElement("strong", null, sweeperStatus?.interval_seconds || 300, "s"), " | \u7D2F\u8BA1\u5DE1\u68C0: ", /*#__PURE__*/React.createElement("strong", null, sweeperStatus?.total_sweeps || 0, " \u6B21"), " | \u6700\u8FD1\u6267\u884C: ", /*#__PURE__*/React.createElement("strong", null, sweeperStatus?.last_sweep_at ? sweeperStatus.last_sweep_at.slice(11, 19) : '等待首次触发')))), /*#__PURE__*/React.createElement("div", {
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
  }, "\u26A1 \u7ACB\u5373\u89E6\u53D1\u81EA\u4E3B\u5DE1\u68C0"), /*#__PURE__*/React.createElement("button", {
    onClick: handleRunDiagnosis,
    disabled: loading,
    style: {
      padding: '9px 18px',
      borderRadius: '10px',
      border: '1px solid #d2d2d7',
      background: '#fff',
      color: '#1d1d1f',
      fontSize: '13px',
      fontWeight: '600',
      cursor: loading ? 'not-allowed' : 'pointer',
      opacity: loading ? 0.7 : 1
    }
  }, "\uD83D\uDD0D \u624B\u52A8\u6DF1\u5EA6\u8BCA\u65AD"))), msg && /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '12px 16px',
      background: '#e8f2ff',
      color: '#0071e3',
      borderRadius: '12px',
      fontSize: '13px'
    }
  }, msg), /*#__PURE__*/React.createElement("div", {
    style: {
      background: '#ffffff',
      borderRadius: '18px',
      padding: '24px',
      border: '1px solid rgba(0,0,0,0.06)',
      boxShadow: '0 8px 24px rgba(0,0,0,0.03)'
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
      fontWeight: '600',
      color: '#1d1d1f',
      margin: 0
    }
  }, "\uD83E\uDDEC \u53D7\u63A7\u81EA\u6F14\u8FDB\u63D0\u6848\u5E93"), /*#__PURE__*/React.createElement("p", {
    style: {
      fontSize: '13px',
      color: '#86868b',
      margin: '4px 0 0'
    }
  }, "\u9AD8\u98CE\u9669\u53D8\u66F4\u5F3A\u5236\u6C99\u7BB1\u9884\u6F14\u3001\u591A\u7EA7\u5B89\u5168\u9632\u7EBF\u4E0E\u4EBA\u5DE5\u53CC\u56E0\u5B50\u5BA1\u6279\u95E8\u7981")), /*#__PURE__*/React.createElement("button", {
    onClick: fetchProposals,
    style: {
      padding: '6px 14px',
      borderRadius: '8px',
      border: '1px solid #d2d2d7',
      background: '#fff',
      fontSize: '12px',
      cursor: 'pointer'
    }
  }, "\uD83D\uDD04 \u5237\u65B0\u5217\u8868")), proposals.length === 0 ? /*#__PURE__*/React.createElement("div", {
    style: {
      textAlign: 'center',
      padding: '40px',
      color: '#8e8e93',
      fontSize: '13px'
    }
  }, "\u6682\u65E0\u6F14\u8FDB\u63D0\u6848\uFF0C\u7CFB\u7EDF\u5904\u4E8E\u7A33\u6001\u8FD0\u884C\u3002\u70B9\u51FB\u4E0A\u65B9\u201C\u7ACB\u5373\u89E6\u53D1\u81EA\u4E3B\u5DE1\u68C0\u201D\u53EF\u5B9E\u65F6\u8BCA\u65AD\u3002") : /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: '16px'
    }
  }, proposals.map(p => /*#__PURE__*/React.createElement("div", {
    key: p.id,
    style: {
      border: '1px solid #e5e5ea',
      borderRadius: '12px',
      padding: '18px',
      background: '#fafafc'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      marginBottom: '10px'
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: '11px',
      fontWeight: '600',
      padding: '3px 8px',
      borderRadius: '6px',
      background: '#e8f2ff',
      color: '#0071e3',
      marginRight: '8px'
    }
  }, p.proposal_type), /*#__PURE__*/React.createElement("strong", {
    style: {
      fontSize: '15px',
      color: '#1d1d1f'
    }
  }, p.title), /*#__PURE__*/React.createElement("span", {
    style: {
      marginLeft: '10px',
      fontSize: '12px',
      color: '#86868b',
      fontFamily: 'monospace'
    }
  }, "ID: ", p.id)), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("span", {
    style: {
      padding: '4px 10px',
      borderRadius: '12px',
      fontSize: '11px',
      fontWeight: '600',
      background: p.status === 'applied' ? '#e3f9e5' : p.status === 'pending_approval' || p.status === 'test_passed' ? '#fff4e5' : '#f2f2f7',
      color: p.status === 'applied' ? '#1a7f37' : p.status === 'pending_approval' || p.status === 'test_passed' ? '#9a6700' : '#8e8e93'
    }
  }, p.status))), /*#__PURE__*/React.createElement("p", {
    style: {
      fontSize: '13px',
      color: '#424245',
      lineHeight: '1.5',
      margin: '0 0 12px'
    }
  }, p.description), /*#__PURE__*/React.createElement("div", {
    style: {
      background: '#1d1d1f',
      color: '#e5e5ea',
      padding: '12px',
      borderRadius: '8px',
      fontSize: '11px',
      fontFamily: 'monospace',
      overflowX: 'auto',
      marginBottom: '12px'
    }
  }, JSON.stringify(p.proposed_diff, null, 2)), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: '10px',
      justifyContent: 'flex-end'
    }
  }, (p.status === 'pending_approval' || p.status === 'test_passed') && /*#__PURE__*/React.createElement("button", {
    onClick: () => handleApprove(p.id),
    style: {
      padding: '6px 16px',
      borderRadius: '8px',
      border: 'none',
      background: '#34c759',
      color: '#fff',
      fontSize: '12px',
      fontWeight: '600',
      cursor: 'pointer'
    }
  }, "\u2713 \u6279\u51C6\u5E76\u539F\u5B50\u751F\u6548"), p.status === 'applied' && /*#__PURE__*/React.createElement("button", {
    onClick: () => handleRollback(p.id),
    style: {
      padding: '6px 16px',
      borderRadius: '8px',
      border: '1px solid #ff3b30',
      background: '#fff',
      color: '#ff3b30',
      fontSize: '12px',
      fontWeight: '600',
      cursor: 'pointer'
    }
  }, "\u21A9\uFE0F \u4E00\u952E\u56DE\u6EDA")))))));
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

// ===== App.tsx =====

const VALID_TABS = ['tasks', 'dag', 'benchmark', 'evolution', 'memory', 'agents'];
const App = () => {
  const [activeTab, setActiveTab] = useState('tasks');
  const [isServerOnline, setIsServerOnline] = useState(null);

  // Sync with URL Hash routing (Multi-route support)
  useEffect(() => {
    const handleHashChange = () => {
      const rawHash = window.location.hash.replace('#/', '').replace('#', '');
      if (VALID_TABS.includes(rawHash)) {
        setActiveTab(rawHash);
      }
    };

    // Initial check
    handleHashChange();
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);
  const handleTabClick = tab => {
    setActiveTab(tab);
    window.location.hash = `#/${tab}`;
  };
  useEffect(() => {
    fetch('http://127.0.0.1:8000/health').then(res => setIsServerOnline(res.ok)).catch(() => setIsServerOnline(false));
  }, []);
  const navItems = [{
    key: 'tasks',
    label: '📝 任务编排与实时流'
  }, {
    key: 'dag',
    label: '🕸️ DAG 拓扑全景工作台'
  }, {
    key: 'benchmark',
    label: '⚖️ A/B 对照基准'
  }, {
    key: 'evolution',
    label: '🧬 M4 自我进化与治理'
  }, {
    key: 'memory',
    label: '🧠 M3 长期记忆库'
  }, {
    key: 'agents',
    label: '🤖 专业 Agent 遥测'
  }];
  return /*#__PURE__*/React.createElement("div", {
    style: {
      minHeight: '100vh',
      background: 'linear-gradient(180deg, #f5f5f7 0%, #e8ebed 100%)',
      color: '#1d1d1f',
      fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", sans-serif'
    }
  }, /*#__PURE__*/React.createElement("header", {
    style: {
      background: 'rgba(255, 255, 255, 0.85)',
      backdropFilter: 'blur(20px)',
      borderBottom: '1px solid rgba(0,0,0,0.06)',
      padding: '14px 32px',
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      position: 'sticky',
      top: 0,
      zIndex: 100
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: '14px'
    }
  }, /*#__PURE__*/React.createElement("h1", {
    style: {
      fontSize: '18px',
      fontWeight: '600',
      letterSpacing: '-0.02em',
      margin: 0
    }
  }, "\u26A1 NEXUS CORE 2.0"), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: '11px',
      fontWeight: '600',
      padding: '3px 9px',
      borderRadius: '12px',
      background: '#e8f2ff',
      color: '#0071e3'
    }
  }, "Production Dashboard (React + TS + Tailwind)")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: '12px'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: '12px',
      display: 'flex',
      alignItems: 'center',
      gap: '6px',
      color: isServerOnline ? '#34c759' : '#ff3b30',
      fontWeight: '500'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      width: '8px',
      height: '8px',
      borderRadius: '50%',
      background: isServerOnline ? '#34c759' : '#ff3b30'
    }
  }), isServerOnline ? '主控核心在线 (8000)' : '主控核心未就绪'))), /*#__PURE__*/React.createElement("div", {
    style: {
      maxWidth: '1260px',
      margin: '20px auto 0',
      padding: '0 24px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: '8px',
      borderBottom: '1px solid rgba(0,0,0,0.06)',
      paddingBottom: '12px',
      overflowX: 'auto'
    }
  }, navItems.map(item => {
    const isActive = activeTab === item.key;
    return /*#__PURE__*/React.createElement("button", {
      key: item.key,
      onClick: () => handleTabClick(item.key),
      style: {
        padding: '8px 16px',
        borderRadius: '10px',
        border: 'none',
        background: isActive ? '#0071e3' : 'rgba(0,0,0,0.04)',
        color: isActive ? '#fff' : '#1d1d1f',
        fontSize: '13px',
        fontWeight: '600',
        cursor: 'pointer',
        transition: 'all 0.15s ease',
        whiteSpace: 'nowrap'
      }
    }, item.label);
  }))), /*#__PURE__*/React.createElement("main", {
    style: {
      maxWidth: '1260px',
      margin: '20px auto 60px',
      padding: '0 24px'
    }
  }, activeTab === 'tasks' && /*#__PURE__*/React.createElement(TaskWorkspace, null), activeTab === 'dag' && /*#__PURE__*/React.createElement(DAGStudio, null), activeTab === 'benchmark' && /*#__PURE__*/React.createElement(BenchmarkCenter, null), activeTab === 'evolution' && /*#__PURE__*/React.createElement(EvolutionPanel, null), activeTab === 'memory' && /*#__PURE__*/React.createElement(MemoryInspector, null), activeTab === 'agents' && /*#__PURE__*/React.createElement(AgentMatrix, null)));
};

// Mount React root
const container = document.getElementById('root');
if (container) {
  const root = ReactDOM.createRoot(container);
  root.render(React.createElement(App, null));
}
import React, { useState, useEffect, useRef } from 'react';
import { PlanStep } from '../types.ts';

interface DAGProps {
  steps: PlanStep[];
  selectedKey?: string;
  onSelectStep?: (step: PlanStep) => void;
  height?: number | string;
  interactive?: boolean;
}

interface NodeCoord {
  x: number;
  y: number;
}

export const DAGTopology: React.FC<DAGProps> = ({
  steps,
  selectedKey,
  onSelectStep,
  height = 360,
  interactive = true,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [positions, setPositions] = useState<Record<string, NodeCoord>>({});
  const [zoom, setZoom] = useState<number>(1);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 30, y: 30 });
  
  // Dragging state
  const [draggingKey, setDraggingKey] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState<boolean>(false);
  const [panStart, setPanStart] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [hoveredKey, setHoveredKey] = useState<string | null>(null);

  const nodeWidth = 170;
  const nodeHeight = 72;
  const layerSpacing = 240;
  const nodeSpacing = 105;

  // Auto layout function using topological layers (Kahn's based)
  const computeAutoLayout = (stepsList: PlanStep[]): Record<string, NodeCoord> => {
    if (!stepsList || stepsList.length === 0) return {};

    const stepMap = new Map<string, PlanStep>();
    stepsList.forEach(s => stepMap.set(s.step_key, s));

    const layers: Map<string, number> = new Map();
    const getLayer = (key: string, visited = new Set<string>()): number => {
      if (layers.has(key)) return layers.get(key)!;
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

    const layerGroups: Map<number, PlanStep[]> = new Map();
    stepsList.forEach(s => {
      const l = layers.get(s.step_key) || 0;
      if (!layerGroups.has(l)) layerGroups.set(l, []);
      layerGroups.get(l)!.push(s);
    });

    const newPositions: Record<string, NodeCoord> = {};
    layerGroups.forEach((group, layerIdx) => {
      const startY = 40 + (group.length > 1 ? 0 : 35);
      group.forEach((step, idx) => {
        const x = 50 + layerIdx * layerSpacing;
        const y = startY + idx * nodeSpacing;
        newPositions[step.step_key] = { x, y };
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
    setPan({ x: 30, y: 30 });
    setZoom(1);
  };

  const handleZoom = (delta: number) => {
    setZoom(prev => Math.min(2.2, Math.max(0.4, Number((prev + delta).toFixed(2)))));
  };

  // Mouse handlers for dragging nodes
  const handleNodeMouseDown = (e: React.MouseEvent, stepKey: string) => {
    if (!interactive) return;
    e.stopPropagation();
    const pos = positions[stepKey] || { x: 0, y: 0 };
    setDraggingKey(stepKey);
    setDragOffset({
      x: (e.clientX - pan.x) / zoom - pos.x,
      y: (e.clientY - pan.y) / zoom - pos.y,
    });

    const s = steps.find(item => item.step_key === stepKey);
    if (s && onSelectStep) {
      onSelectStep(s);
    }
  };

  // Canvas pan handlers
  const handleCanvasMouseDown = (e: React.MouseEvent) => {
    if (!interactive) return;
    if (e.button === 0 || e.button === 1) {
      setIsPanning(true);
      setPanStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (draggingKey) {
      const newX = (e.clientX - pan.x) / zoom - dragOffset.x;
      const newY = (e.clientY - pan.y) / zoom - dragOffset.y;
      setPositions(prev => ({
        ...prev,
        [draggingKey]: { x: Math.max(10, Math.round(newX)), y: Math.max(10, Math.round(newY)) },
      }));
    } else if (isPanning) {
      setPan({
        x: e.clientX - panStart.x,
        y: e.clientY - panStart.y,
      });
    }
  };

  const handleMouseUp = () => {
    setDraggingKey(null);
    setIsPanning(false);
  };

  const handleWheel = (e: React.WheelEvent) => {
    if (!interactive) return;
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.08 : 0.92;
    setZoom(prev => Math.min(2.2, Math.max(0.4, Number((prev * factor).toFixed(2)))));
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'success': return '#34c759';
      case 'running': return '#0071e3';
      case 'failed': return '#ff3b30';
      case 'skipped': return '#8e8e93';
      case 'pending': return '#ff9500';
      default: return '#aeaeb2';
    }
  };

  const getRoleBadge = (role: string) => {
    switch (role?.toLowerCase()) {
      case 'coding': return { label: '💻 Coding', bg: '#e8f2ff', color: '#0071e3' };
      case 'research': return { label: '🔍 Research', bg: '#f3e8ff', color: '#8944ab' };
      case 'analysis': return { label: '🧠 Analysis', bg: '#e6f7ed', color: '#1b803a' };
      case 'evaluator': return { label: '⚖️ Verifier', bg: '#fff4e5', color: '#c46900' };
      default: return { label: `⚙️ ${role || 'Agent'}`, bg: '#f2f2f7', color: '#1d1d1f' };
    }
  };

  if (!steps || steps.length === 0) {
    return (
      <div style={{
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
      }}>
        <span style={{ fontSize: '28px', marginBottom: '8px' }}>🕸️</span>
        <span>暂无 DAG 步骤拓扑数据</span>
      </div>
    );
  }

  // Pre-calculate dependencies for edge rendering
  const edges: Array<{ from: string; to: string; isHighlighted: boolean; isRunning: boolean }> = [];
  steps.forEach(step => {
    (step.depends_on || []).forEach(depKey => {
      const isHighlighted = hoveredKey === step.step_key || hoveredKey === depKey || selectedKey === step.step_key;
      const isRunning = step.status === 'running';
      edges.push({ from: depKey, to: step.step_key, isHighlighted, isRunning });
    });
  });

  return (
    <div
      ref={containerRef}
      style={{
        position: 'relative',
        height,
        background: '#f8f9fa',
        borderRadius: '16px',
        border: '1px solid rgba(0,0,0,0.08)',
        overflow: 'hidden',
        userSelect: 'none',
        boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.02)',
      }}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onWheel={handleWheel}
    >
      {/* Dynamic CSS animations */}
      <style>{`
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
      `}</style>

      {/* Floating Toolbar */}
      {interactive && (
        <div style={{
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
          boxShadow: '0 4px 12px rgba(0,0,0,0.05)',
        }}>
          <button
            onClick={() => handleZoom(0.15)}
            title="放大"
            style={{ padding: '4px 8px', border: 'none', background: 'transparent', cursor: 'pointer', fontSize: '13px', fontWeight: 'bold' }}
          >
            ＋
          </button>
          <button
            onClick={() => handleZoom(-0.15)}
            title="缩小"
            style={{ padding: '4px 8px', border: 'none', background: 'transparent', cursor: 'pointer', fontSize: '13px', fontWeight: 'bold' }}
          >
            －
          </button>
          <button
            onClick={() => { setZoom(1); setPan({ x: 30, y: 30 }); }}
            title="重置缩放 100%"
            style={{ padding: '4px 8px', border: 'none', background: 'transparent', cursor: 'pointer', fontSize: '11px', color: '#6e6e73' }}
          >
            {Math.round(zoom * 100)}%
          </button>
          <div style={{ width: '1px', background: 'rgba(0,0,0,0.1)', margin: '2px 2px' }} />
          <button
            onClick={handleResetLayout}
            title="智能拓扑重排"
            style={{
              padding: '4px 8px',
              border: 'none',
              background: '#0071e3',
              color: '#fff',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '11px',
              fontWeight: '600'
            }}
          >
            ⚡ 拓扑自排
          </button>
        </div>
      )}

      {/* Help Hint Overlay */}
      {interactive && (
        <div style={{
          position: 'absolute',
          bottom: '10px',
          left: '14px',
          zIndex: 10,
          fontSize: '11px',
          color: '#86868b',
          pointerEvents: 'none',
        }}>
          💡 拖拽节点移动 · 按住画布空白平移 · 滚轮缩放画布
        </div>
      )}

      {/* Main SVG Canvas */}
      <svg
        width="100%"
        height="100%"
        style={{
          cursor: isPanning ? 'grabbing' : (draggingKey ? 'grabbing' : 'default'),
          display: 'block',
        }}
        onMouseDown={handleCanvasMouseDown}
      >
        <defs>
          {/* Dot Matrix Background Pattern */}
          <pattern id="dag-grid-pattern" width="24" height="24" patternUnits="userSpaceOnUse">
            <circle cx="2" cy="2" r="1.2" fill="rgba(0,0,0,0.06)" />
          </pattern>

          {/* Standard Arrow Marker */}
          <marker id="dag-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M 0 1 L 9 5 L 0 9 z" fill="#8e8e93" />
          </marker>

          {/* Highlighted Arrow Marker */}
          <marker id="dag-arrow-active" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M 0 1 L 9 5 L 0 9 z" fill="#0071e3" />
          </marker>
        </defs>

        {/* Blueprint background grid */}
        <rect width="100%" height="100%" fill="url(#dag-grid-pattern)" />

        {/* Scaled & Panned Group */}
        <g transform={`translate(${pan.x}, ${pan.y}) scale(${zoom})`}>
          {/* Dependency Bezier Edges */}
          {edges.map(({ from, to, isHighlighted, isRunning }) => {
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

            return (
              <path
                key={`${from}->${to}`}
                d={`M ${startX} ${startY} C ${ctrlX1} ${ctrlY1}, ${ctrlX2} ${ctrlY2}, ${endX} ${endY}`}
                fill="none"
                stroke={isHighlighted ? '#0071e3' : '#aeaeb2'}
                strokeWidth={isHighlighted ? 2.8 : 1.8}
                markerEnd={isHighlighted ? 'url(#dag-arrow-active)' : 'url(#dag-arrow)'}
                className={isRunning ? 'running-edge' : undefined}
                style={{ transition: draggingKey ? 'none' : 'stroke 0.2s ease, stroke-width 0.2s ease' }}
              />
            );
          })}

          {/* Draggable Step Nodes */}
          {steps.map(step => {
            const pos = positions[step.step_key] || { x: 50, y: 50 };
            const isSelected = selectedKey === step.step_key;
            const isHovered = hoveredKey === step.step_key;
            const isDragging = draggingKey === step.step_key;
            const isRunning = step.status === 'running';
            const statusColor = getStatusColor(step.status);
            const roleInfo = getRoleBadge(step.role);

            return (
              <g
                key={step.step_key}
                transform={`translate(${pos.x}, ${pos.y})`}
                onMouseDown={e => handleNodeMouseDown(e, step.step_key)}
                onMouseEnter={() => setHoveredKey(step.step_key)}
                onMouseLeave={() => setHoveredKey(null)}
                style={{ cursor: isDragging ? 'grabbing' : 'grab' }}
                className={isRunning ? 'running-node' : undefined}
              >
                {/* Node Box Card */}
                <rect
                  width={nodeWidth}
                  height={nodeHeight}
                  rx="14"
                  ry="14"
                  fill="#ffffff"
                  stroke={isSelected ? '#0071e3' : (isHovered ? '#62aaff' : 'rgba(0,0,0,0.1)')}
                  strokeWidth={isSelected ? 2.5 : (isHovered ? 2 : 1)}
                  filter={isSelected ? 'drop-shadow(0 6px 16px rgba(0,113,227,0.22))' : 'drop-shadow(0 2px 8px rgba(0,0,0,0.06))'}
                />

                {/* Left Status Accent Indicator Bar */}
                <rect
                  x="0"
                  y="12"
                  width="4"
                  height={nodeHeight - 24}
                  rx="2"
                  fill={statusColor}
                />

                {/* Top Row: Step Key & Role Badge */}
                <text
                  x="14"
                  y="26"
                  fontSize="13"
                  fontWeight="600"
                  fill="#1d1d1f"
                  fontFamily="-apple-system, BlinkMacSystemFont, sans-serif"
                >
                  {step.step_key}
                </text>

                {/* Status Dot */}
                <circle cx={nodeWidth - 18} cy="22" r="4.5" fill={statusColor} />

                {/* Role Pill background */}
                <rect
                  x="14"
                  y="36"
                  width={Math.min(100, roleInfo.label.length * 8 + 10)}
                  height="18"
                  rx="5"
                  fill={roleInfo.bg}
                />
                <text
                  x="18"
                  y="49"
                  fontSize="10"
                  fontWeight="600"
                  fill={roleInfo.color}
                  fontFamily="-apple-system, sans-serif"
                >
                  {roleInfo.label}
                </text>

                {/* Bottom Status / Summary Text */}
                <text
                  x="14"
                  y="64"
                  fontSize="10"
                  fill="#86868b"
                  fontFamily="-apple-system, sans-serif"
                >
                  {step.status === 'success' ? '✓ 执行完成' :
                   step.status === 'running' ? '⏳ 实时执行中...' :
                   step.status === 'failed' ? '✕ 执行异常' :
                   `前置依赖: ${step.depends_on?.length || 0}`}
                </text>
              </g>
            );
          })}
        </g>
      </svg>
    </div>
  );
};

export default DAGTopology;

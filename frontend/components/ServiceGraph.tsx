'use client';

import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Network, AlertTriangle, CheckCircle2, Activity } from 'lucide-react';

// ═══════════════════════════════════════════════════════════════
// Service Dependency Graph — SVG + React + Framer Motion
// ═══════════════════════════════════════════════════════════════

interface ServiceNode {
  id: string;
  label: string;
  x: number;
  y: number;
  icon: string;
}

interface ServiceEdge {
  from: string;
  to: string;
}

// Graph topology — centered layout for 5 services
const NODES: ServiceNode[] = [
  { id: 'user-gateway',      label: 'User Gateway',      x: 400, y: 55,  icon: '🌐' },
  { id: 'checkout-ui',       label: 'Checkout UI',        x: 180, y: 155, icon: '🛒' },
  { id: 'payment-api',       label: 'Payment API',        x: 620, y: 155, icon: '💳' },
  { id: 'inventory-service', label: 'Inventory Service',  x: 180, y: 275, icon: '📦' },
  { id: 'database-cluster',  label: 'Database Cluster',   x: 620, y: 275, icon: '🗄️' },
];

const EDGES: ServiceEdge[] = [
  { from: 'user-gateway', to: 'checkout-ui' },
  { from: 'user-gateway', to: 'payment-api' },
  { from: 'user-gateway', to: 'inventory-service' },
  { from: 'checkout-ui', to: 'payment-api' },
  { from: 'checkout-ui', to: 'inventory-service' },
  { from: 'payment-api', to: 'database-cluster' },
  { from: 'inventory-service', to: 'database-cluster' },
];

// Downstream dependency map for blast radius
const DOWNSTREAM: Record<string, string[]> = {
  'user-gateway':      ['checkout-ui', 'payment-api', 'inventory-service'],
  'checkout-ui':       ['payment-api', 'inventory-service'],
  'payment-api':       ['database-cluster'],
  'inventory-service': ['database-cluster'],
  'database-cluster':  ['payment-api', 'inventory-service', 'checkout-ui', 'user-gateway'],
};

interface Incident {
  id: string;
  service: string;
  [key: string]: any;
}

interface ServiceGraphProps {
  incidents: Incident[];
  onSelectService?: (service: string) => void;
}

export default function ServiceGraph({ incidents, onSelectService }: ServiceGraphProps) {
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);
  const [selectedNode, setSelectedNode] = useState<string | null>(null);

  // Compute which services have active incidents
  const affectedServices = useMemo(() => {
    const set = new Set<string>();
    incidents.forEach(inc => set.add(inc.service));
    return set;
  }, [incidents]);

  // Compute incident counts per service
  const incidentCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    incidents.forEach(inc => {
      counts[inc.service] = (counts[inc.service] || 0) + 1;
    });
    return counts;
  }, [incidents]);

  // Active node = hovered or selected
  const activeNode = hoveredNode || selectedNode;

  // Compute blast radius for active node
  const blastRadius = useMemo(() => {
    if (!activeNode) return new Set<string>();
    const downstream = DOWNSTREAM[activeNode] || [];
    return new Set([activeNode, ...downstream]);
  }, [activeNode]);

  // Determine node status
  const getNodeStatus = (id: string): 'healthy' | 'affected' | 'incident' => {
    if (affectedServices.has(id)) return 'incident';
    if (activeNode && blastRadius.has(id) && id !== activeNode) return 'affected';
    return 'healthy';
  };

  // Status colors
  const statusColors = {
    healthy:  { fill: '#0f172a', stroke: '#22d3ee', glow: 'rgba(34,211,238,0.15)', text: '#94a3b8' },
    incident: { fill: '#1a0a0a', stroke: '#f43f5e', glow: 'rgba(244,63,94,0.25)', text: '#fda4af' },
    affected: { fill: '#1a1400', stroke: '#f59e0b', glow: 'rgba(245,158,11,0.2)', text: '#fbbf24' },
  };

  // Is edge highlighted?
  const isEdgeActive = (edge: ServiceEdge) => {
    if (!activeNode) return false;
    return (edge.from === activeNode && blastRadius.has(edge.to)) ||
           (edge.to === activeNode && blastRadius.has(edge.from));
  };

  const handleNodeClick = (id: string) => {
    setSelectedNode(prev => prev === id ? null : id);
  };

  const activeNodeData = NODES.find(n => n.id === activeNode);
  const activeDownstream = activeNode ? (DOWNSTREAM[activeNode] || []) : [];

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass rounded-2xl border border-white/[0.06] overflow-hidden"
    >
      {/* Header */}
      <div className="px-5 py-3 border-b border-white/[0.04] flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Network size={16} className="text-accent-cyan" />
          <h3 className="text-sm font-semibold text-slate-200">Service Dependency Graph</h3>
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-accent-cyan/10 text-accent-cyan border border-accent-cyan/20">
            LIVE
          </span>
        </div>
        <div className="flex items-center gap-4 text-[10px]">
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-400" /> Healthy
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-rose-400" /> Incident
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-amber-400" /> Blast Radius
          </span>
        </div>
      </div>

      <div className="flex">
        {/* SVG Graph */}
        <div className="flex-1 relative">
          <svg viewBox="0 0 800 340" className="w-full" style={{ minHeight: '280px' }}>
            <defs>
              {/* Glow filters */}
              <filter id="glow-cyan" x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur stdDeviation="6" result="blur" />
                <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
              </filter>
              <filter id="glow-rose" x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur stdDeviation="8" result="blur" />
                <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
              </filter>
              <filter id="glow-amber" x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur stdDeviation="6" result="blur" />
                <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
              </filter>

              {/* Animated gradient for active edges */}
              <linearGradient id="edge-active-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#f43f5e" stopOpacity="0.8">
                  <animate attributeName="stopOpacity" values="0.4;1;0.4" dur="2s" repeatCount="indefinite" />
                </stop>
                <stop offset="100%" stopColor="#f59e0b" stopOpacity="0.6">
                  <animate attributeName="stopOpacity" values="0.6;0.2;0.6" dur="2s" repeatCount="indefinite" />
                </stop>
              </linearGradient>
            </defs>

            {/* Edges */}
            {EDGES.map((edge, i) => {
              const fromNode = NODES.find(n => n.id === edge.from)!;
              const toNode = NODES.find(n => n.id === edge.to)!;
              const active = isEdgeActive(edge);

              return (
                <motion.line
                  key={`edge-${i}`}
                  x1={fromNode.x}
                  y1={fromNode.y}
                  x2={toNode.x}
                  y2={toNode.y}
                  stroke={active ? 'url(#edge-active-gradient)' : 'rgba(148,163,184,0.08)'}
                  strokeWidth={active ? 2.5 : 1}
                  strokeDasharray={active ? '6 3' : undefined}
                  initial={false}
                  animate={{
                    strokeWidth: active ? 2.5 : 1,
                    opacity: activeNode ? (active ? 1 : 0.15) : 0.4,
                  }}
                  transition={{ duration: 0.3 }}
                />
              );
            })}

            {/* Nodes */}
            {NODES.map((node) => {
              const status = getNodeStatus(node.id);
              const colors = statusColors[status];
              const isActive = node.id === activeNode;
              const count = incidentCounts[node.id] || 0;
              const filterMap = { healthy: 'glow-cyan', incident: 'glow-rose', affected: 'glow-amber' };

              return (
                <g
                  key={node.id}
                  onMouseEnter={() => setHoveredNode(node.id)}
                  onMouseLeave={() => setHoveredNode(null)}
                  onClick={() => handleNodeClick(node.id)}
                  style={{ cursor: 'pointer' }}
                >
                  {/* Invisible hit area — prevents hover flicker */}
                  <circle
                    cx={node.x}
                    cy={node.y + 10}
                    r={55}
                    fill="transparent"
                    stroke="none"
                  />
                  {/* Pulse ring for incidents */}
                  {status === 'incident' && (
                    <motion.circle
                      cx={node.x}
                      cy={node.y}
                      r={38}
                      fill="none"
                      stroke="#f43f5e"
                      strokeWidth={1}
                      initial={{ r: 34, opacity: 0.6 }}
                      animate={{ r: 48, opacity: 0 }}
                      transition={{ duration: 2, repeat: Infinity, ease: 'easeOut' }}
                    />
                  )}

                  {/* Outer glow ring */}
                  <motion.circle
                    cx={node.x}
                    cy={node.y}
                    fill="none"
                    stroke={colors.stroke}
                    strokeWidth={isActive ? 2 : 1}
                    filter={isActive || status === 'incident' ? `url(#${filterMap[status]})` : undefined}
                    initial={false}
                    animate={{
                      r: isActive ? 38 : 34,
                      strokeOpacity: isActive ? 0.8 : status === 'incident' ? 0.5 : 0.2,
                    }}
                    transition={{ duration: 0.25, ease: 'easeOut' }}
                  />

                  {/* Background circle */}
                  <motion.circle
                    cx={node.x}
                    cy={node.y}
                    r={30}
                    fill={colors.fill}
                    stroke={colors.stroke}
                    strokeWidth={1.5}
                    initial={false}
                    animate={{
                      strokeOpacity: isActive ? 1 : 0.4,
                    }}
                    transition={{ duration: 0.2 }}
                  />

                  {/* Icon emoji */}
                  <text
                    x={node.x}
                    y={node.y - 2}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fontSize="18"
                  >
                    {node.icon}
                  </text>

                  {/* Label */}
                  <text
                    x={node.x}
                    y={node.y + 48}
                    textAnchor="middle"
                    fill={isActive ? colors.stroke : colors.text}
                    fontSize="11"
                    fontWeight={isActive ? 600 : 400}
                    fontFamily="Inter, sans-serif"
                  >
                    {node.label}
                  </text>

                  {/* Incident badge */}
                  {count > 0 && (
                    <g>
                      <circle cx={node.x + 22} cy={node.y - 22} r={10} fill="#f43f5e" />
                      <text
                        x={node.x + 22}
                        y={node.y - 21}
                        textAnchor="middle"
                        dominantBaseline="middle"
                        fill="white"
                        fontSize="9"
                        fontWeight="700"
                        fontFamily="Inter, sans-serif"
                      >
                        {count}
                      </text>
                    </g>
                  )}
                </g>
              );
            })}
          </svg>
        </div>

        {/* Info Panel — slides in when a node is active */}
        <AnimatePresence>
          {activeNode && (
            <motion.div
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 240, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 300, damping: 30 }}
              className="border-l border-white/[0.04] overflow-hidden flex-shrink-0"
            >
              <div className="p-4 w-[240px]">
                {/* Service name */}
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-lg">{activeNodeData?.icon}</span>
                  <div>
                    <h4 className="text-sm font-semibold text-slate-200">{activeNodeData?.label}</h4>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                      affectedServices.has(activeNode)
                        ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                        : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                    }`}>
                      {affectedServices.has(activeNode) ? (
                        <><AlertTriangle size={8} className="inline mr-1" />Incident Active</>
                      ) : (
                        <><CheckCircle2 size={8} className="inline mr-1" />Healthy</>
                      )}
                    </span>
                  </div>
                </div>

                {/* Incident count */}
                {(incidentCounts[activeNode] || 0) > 0 && (
                  <div className="bg-rose-500/5 border border-rose-500/10 rounded-lg p-2.5 mb-3">
                    <p className="text-[10px] text-rose-300 uppercase tracking-wider font-semibold mb-1">Active Incidents</p>
                    <p className="text-lg font-bold text-rose-400">{incidentCounts[activeNode]}</p>
                  </div>
                )}

                {/* Blast Radius */}
                <div className="mb-3">
                  <p className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold mb-2">
                    Blast Radius ({activeDownstream.length})
                  </p>
                  <div className="space-y-1.5">
                    {activeDownstream.length > 0 ? activeDownstream.map(svc => {
                      const nodeData = NODES.find(n => n.id === svc);
                      const hasIncident = affectedServices.has(svc);
                      return (
                        <div key={svc} className="flex items-center gap-2 text-xs p-1.5 rounded-md bg-surface-100/40 border border-white/[0.03]">
                          <span className={`w-1.5 h-1.5 rounded-full ${hasIncident ? 'bg-rose-400' : 'bg-amber-400'}`} />
                          <span className="text-slate-400">{nodeData?.icon}</span>
                          <span className="text-slate-300">{nodeData?.label}</span>
                        </div>
                      );
                    }) : (
                      <p className="text-xs text-slate-600 italic">No downstream dependencies</p>
                    )}
                  </div>
                </div>

                {/* Quick action */}
                {affectedServices.has(activeNode) && onSelectService && (
                  <button
                    onClick={() => onSelectService(activeNode)}
                    className="w-full mt-2 px-3 py-2 bg-gradient-to-r from-cyan-500/10 to-purple-500/10 hover:from-cyan-500/20 hover:to-purple-500/20 text-cyan-300 text-xs rounded-lg border border-cyan-500/20 transition-all flex items-center justify-center gap-1.5"
                  >
                    <Activity size={10} /> Investigate
                  </button>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

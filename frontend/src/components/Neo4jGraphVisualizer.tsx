"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { GraphNode, GraphLink } from "@/lib/types";

const BASE_W = 740;
const BASE_H = 480;
const MIN_ZOOM = 0.6;
const MAX_ZOOM = 4;
const ZOOM_STEP = 1.25;
const DRAG_THRESHOLD_PX = 4;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

interface Neo4jGraphVisualizerProps {
  nodes: GraphNode[];
  links: GraphLink[];
  selectedNodeId?: string;
  onSelectNode: (node: GraphNode) => void;
}

export const Neo4jGraphVisualizer: React.FC<Neo4jGraphVisualizerProps> = ({
  nodes,
  links,
  selectedNodeId,
  onSelectNode,
}) => {
  const [filterType, setFilterType] = useState<string>("ALL");
  const [zoomLevel, setZoomLevel] = useState<number>(1);
  // Pan = offset of the view centre from the graph centre, in graph (viewBox) units.
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const dragRef = useRef<{ startX: number; startY: number; panX: number; panY: number } | null>(
    null
  );
  const dragMovedRef = useRef(false);

  const viewW = BASE_W / zoomLevel;
  const viewH = BASE_H / zoomLevel;

  // Keep the viewport inside the graph when zoomed in; centred when zoomed out.
  const clampPan = useCallback((x: number, y: number, zoom: number) => {
    const maxX = Math.max(0, (BASE_W - BASE_W / zoom) / 2);
    const maxY = Math.max(0, (BASE_H - BASE_H / zoom) / 2);
    return { x: clamp(x, -maxX, maxX), y: clamp(y, -maxY, maxY) };
  }, []);

  // Zoom to `next`, keeping the point under `focus` (graph coordinates) fixed on screen.
  const zoomTo = useCallback(
    (next: number, focus?: { x: number; y: number }) => {
      const target = clamp(next, MIN_ZOOM, MAX_ZOOM);
      if (target === zoomLevel) return;
      if (!focus) {
        setZoomLevel(target);
        setPan((p) => clampPan(p.x, p.y, target));
        return;
      }
      const ratio = zoomLevel / target;
      const centreX = BASE_W / 2 + pan.x;
      const centreY = BASE_H / 2 + pan.y;
      const newCentreX = focus.x - (focus.x - centreX) * ratio;
      const newCentreY = focus.y - (focus.y - centreY) * ratio;
      setZoomLevel(target);
      setPan(clampPan(newCentreX - BASE_W / 2, newCentreY - BASE_H / 2, target));
    },
    [zoomLevel, pan, clampPan]
  );

  const resetView = useCallback(() => {
    setZoomLevel(1);
    setPan({ x: 0, y: 0 });
  }, []);

  // Ctrl/Cmd + wheel zooms toward the cursor. Plain wheel still scrolls the page.
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const fx = (e.clientX - rect.left) / rect.width;
      const fy = (e.clientY - rect.top) / rect.height;
      const focus = {
        x: BASE_W / 2 + pan.x - viewW / 2 + fx * viewW,
        y: BASE_H / 2 + pan.y - viewH / 2 + fy * viewH,
      };
      zoomTo(zoomLevel * (e.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP), focus);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [zoomLevel, pan, viewW, viewH, zoomTo]);

  const handlePointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if (e.button !== 0) return;
    dragMovedRef.current = false;
    dragRef.current = { startX: e.clientX, startY: e.clientY, panX: pan.x, panY: pan.y };
  };

  const handlePointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const drag = dragRef.current;
    if (!drag || zoomLevel <= 1) return;
    const dx = e.clientX - drag.startX;
    const dy = e.clientY - drag.startY;
    if (!dragMovedRef.current && Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return;
    dragMovedRef.current = true;
    setIsDragging(true);
    const rect = e.currentTarget.getBoundingClientRect();
    setPan(
      clampPan(
        drag.panX - dx * (viewW / rect.width),
        drag.panY - dy * (viewH / rect.height),
        zoomLevel
      )
    );
  };

  const endDrag = () => {
    dragRef.current = null;
    setIsDragging(false);
  };

  const handleNodeClick = (node: GraphNode) => {
    if (dragMovedRef.current) return; // a pan gesture, not a click
    onSelectNode(node);
  };

  const handleCanvasKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "+" || e.key === "=") zoomTo(zoomLevel * ZOOM_STEP);
    else if (e.key === "-" || e.key === "_") zoomTo(zoomLevel / ZOOM_STEP);
    else if (e.key === "0") resetView();
  };

  const controlBtn =
    "w-8 h-8 flex items-center justify-center bg-[#FFFFFF] text-[#141413] border border-[#141413] font-extrabold text-base leading-none hover:bg-[#141413] hover:text-white disabled:opacity-40 disabled:hover:bg-[#FFFFFF] disabled:hover:text-[#141413] disabled:cursor-not-allowed cursor-pointer";

  const filteredNodes = nodes.filter((n) => {
    if (filterType === "ALL") return true;
    return n.type === filterType;
  });

  const selectedNode = nodes.find((n) => n.id === selectedNodeId) || nodes[0];

  return (
    <div className="w-full bg-[#FFFFFF] border-2 border-[#141413] p-5 flex flex-col gap-4">
      {/* Visualizer Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b-2 border-[#141413] gap-2">
        <div>
          <div className="flex items-center gap-2">
            <span className="font-extrabold text-sm uppercase text-[#141413]">
              NEO4J GRAPH ENGINE · MULE RING CLUSTERING
            </span>
            <span className="bg-[#2A4B45] text-white px-2 py-0.5 text-[10px] font-bold uppercase">
              3-HOP CYCLES
            </span>
          </div>
          <p className="text-xs text-[#141413]/70 mt-0.5 font-medium">
            Multi-hop graph traversal: Shared device hardware fingerprints, Tor relays &amp; beneficiary chains
          </p>
        </div>

        {/* Filter Badges */}
        <div className="flex flex-wrap items-center gap-1.5 text-xs font-semibold">
          <span className="mr-1 text-[#141413]/60 text-[11px]">FILTER:</span>
          {(["ALL", "ACCOUNT", "MULE", "DEVICE", "IP"] as const).map((type) => (
            <button
              key={type}
              onClick={() => setFilterType(type)}
              className={`px-2.5 py-1 border border-[#141413] font-bold text-[11px] uppercase cursor-pointer ${
                filterType === type
                  ? "bg-[#141413] text-[#FFFFFF]"
                  : "bg-[#FAF7F2] text-[#141413] hover:bg-[#EAE3D2]"
              }`}
            >
              {type}
            </button>
          ))}
        </div>
      </div>

      {/* Main Graph Canvas Area */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* SVG Interactive Canvas */}
        <div
          className="lg:col-span-2 border-2 border-[#141413] bg-[#FAF7F2] relative min-h-[380px] flex items-center justify-center overflow-hidden outline-none focus-visible:ring-2 focus-visible:ring-[#C86432]"
          tabIndex={0}
          onKeyDown={handleCanvasKeyDown}
          aria-label="Fraud graph. Use plus and minus to zoom, zero to reset."
        >
          <div className="absolute top-2 left-2 z-10 text-[10px] font-bold bg-[#FFFFFF] border border-[#141413] px-2 py-1 uppercase text-[#141413]">
            GRAPH TOPOLOGY · CLICK TO INSPECT NODE
          </div>

          {/* Zoom controls */}
          <div
            className="absolute top-2 right-2 z-10 flex flex-col items-stretch gap-1"
            role="group"
            aria-label="Graph zoom controls"
          >
            <button
              type="button"
              onClick={() => zoomTo(zoomLevel * ZOOM_STEP)}
              disabled={zoomLevel >= MAX_ZOOM}
              className={controlBtn}
              title="Zoom in (+)"
              aria-label="Zoom in"
            >
              +
            </button>
            <button
              type="button"
              onClick={() => zoomTo(zoomLevel / ZOOM_STEP)}
              disabled={zoomLevel <= MIN_ZOOM}
              className={controlBtn}
              title="Zoom out (-)"
              aria-label="Zoom out"
            >
              −
            </button>
            <button
              type="button"
              onClick={resetView}
              disabled={zoomLevel === 1 && pan.x === 0 && pan.y === 0}
              className={`${controlBtn} text-[9px] tracking-tight`}
              title="Reset zoom (0)"
              aria-label="Reset zoom"
            >
              1:1
            </button>
            <span
              className="text-[10px] font-mono font-bold text-center bg-[#FFFFFF] border border-[#141413] px-1 py-0.5 text-[#141413]"
              aria-live="polite"
            >
              {Math.round(zoomLevel * 100)}%
            </span>
          </div>

          <div className="absolute bottom-2 left-2 z-10 text-[9px] font-bold bg-[#FFFFFF]/90 border border-[#141413] px-2 py-0.5 uppercase text-[#141413]/70 pointer-events-none">
            {zoomLevel > 1 ? "DRAG TO PAN · " : ""}CTRL + SCROLL TO ZOOM
          </div>

          <svg
            ref={svgRef}
            className={`w-full h-[380px] select-none touch-none ${
              zoomLevel > 1 ? (isDragging ? "cursor-grabbing" : "cursor-grab") : "cursor-crosshair"
            }`}
            viewBox={`${BASE_W / 2 + pan.x - viewW / 2} ${BASE_H / 2 + pan.y - viewH / 2} ${viewW} ${viewH}`}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={endDrag}
            onPointerLeave={endDrag}
            onDoubleClick={resetView}
          >
            {/* Grid Pattern Lines */}
            <defs>
              <pattern id="brutal-grid" width="40" height="40" patternUnits="userSpaceOnUse">
                <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#E5DDD0" strokeWidth="1" />
              </pattern>
            </defs>
            <rect
              x={-BASE_W}
              y={-BASE_H}
              width={BASE_W * 3}
              height={BASE_H * 3}
              fill="url(#brutal-grid)"
            />

            {/* Links between Nodes */}
            {links.map((link, idx) => {
              const src = nodes.find((n) => n.id === link.source);
              const tgt = nodes.find((n) => n.id === link.target);
              if (!src || !tgt) return null;

              const isConnectedToSelected =
                selectedNode && (src.id === selectedNode.id || tgt.id === selectedNode.id);

              return (
                <g key={`link-${idx}`}>
                  <line
                    x1={src.x}
                    y1={src.y}
                    x2={tgt.x}
                    y2={tgt.y}
                    stroke={link.isHighRisk ? "#C86432" : "#141413"}
                    strokeWidth={link.isHighRisk ? "2.5" : "1.5"}
                    strokeDasharray={link.isHighRisk ? "6 3" : "none"}
                    opacity={isConnectedToSelected ? 1 : 0.65}
                  />
                  {/* Link Label Midpoint */}
                  <rect
                    x={(src.x + tgt.x) / 2 - 45}
                    y={(src.y + tgt.y) / 2 - 9}
                    width="90"
                    height="18"
                    fill="#FFFFFF"
                    stroke="#141413"
                    strokeWidth="1"
                  />
                  <text
                    x={(src.x + tgt.x) / 2}
                    y={(src.y + tgt.y) / 2 + 4}
                    fill="#141413"
                    fontSize="9"
                    fontFamily="sans-serif"
                    textAnchor="middle"
                    fontWeight="700"
                  >
                    {link.label.substring(0, 16)}
                  </text>
                </g>
              );
            })}

            {/* Graph Nodes */}
            {filteredNodes.map((node) => {
              const isSelected = selectedNode?.id === node.id;
              const isHighRisk = node.riskScore >= 75;

              return (
                <g
                  key={node.id}
                  transform={`translate(${node.x}, ${node.y})`}
                  onClick={() => handleNodeClick(node)}
                  className="cursor-pointer"
                >
                  {/* Outer brutalist bounding box */}
                  <rect
                    x="-70"
                    y="-24"
                    width="140"
                    height="48"
                    fill={isSelected ? "#141413" : isHighRisk ? "#FAF7F2" : "#FFFFFF"}
                    stroke={isSelected ? "#141413" : isHighRisk ? "#C86432" : "#141413"}
                    strokeWidth={isSelected ? "3" : isHighRisk ? "2.5" : "1.5"}
                  />
                  {/* High Risk Pill Accent */}
                  {isHighRisk && (
                    <polygon
                      points="-70,-24 -52,-24 -70,-6"
                      fill={isSelected ? "#C86432" : "#C86432"}
                    />
                  )}
                  {/* Node Type Label */}
                  <text
                    x="0"
                    y="-8"
                    fill={isSelected ? "#FFFFFF" : isHighRisk ? "#C86432" : "#141413"}
                    fontSize="9"
                    fontFamily="sans-serif"
                    textAnchor="middle"
                    fontWeight="800"
                    letterSpacing="0.5"
                  >
                    [{node.type}] SCORE: {node.riskScore}
                  </text>
                  {/* Node Name */}
                  <text
                    x="0"
                    y="11"
                    fill={isSelected ? "#FFFFFF" : "#141413"}
                    fontSize="10"
                    fontFamily="sans-serif"
                    textAnchor="middle"
                    fontWeight="700"
                  >
                    {node.label.length > 18 ? node.label.substring(0, 17) + "…" : node.label}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>

        {/* Selected Node Inspector & Cypher Console */}
        <div className="border-2 border-[#141413] bg-[#FAF7F2] p-4 flex flex-col justify-between text-xs">
          <div>
            <div className="flex items-center justify-between pb-2 border-b border-[#141413]">
              <span className="font-extrabold uppercase tracking-wide text-[#141413]">
                NODE FORENSIC INSPECTOR
              </span>
              <span
                className={`px-2 py-0.5 text-[10px] font-bold border border-[#141413] ${
                  selectedNode.riskScore >= 75
                    ? "bg-[#C86432] text-white"
                    : "bg-[#FFFFFF] text-[#141413]"
                }`}
              >
                RISK: {selectedNode.riskScore}/100
              </span>
            </div>

            <div className="mt-3 space-y-2.5">
              <div>
                <span className="text-[#141413]/60 block text-[10px] font-bold uppercase">
                  NODE IDENTIFIER
                </span>
                <span className="font-bold text-sm text-[#141413] font-mono">{selectedNode.id}</span>
              </div>
              <div>
                <span className="text-[#141413]/60 block text-[10px] font-bold uppercase">
                  ENTITY NAME
                </span>
                <span className="font-bold text-[#141413]">{selectedNode.label}</span>
              </div>
              <div>
                <span className="text-[#141413]/60 block text-[10px] font-bold uppercase">
                  ENTITY CATEGORY
                </span>
                <span className="font-extrabold text-[#141413]">[{selectedNode.type}]</span>
              </div>
              <div>
                <span className="text-[#141413]/60 block text-[10px] font-bold uppercase">
                  FORENSIC TRACE &amp; HOPS
                </span>
                <p className="bg-[#FFFFFF] border border-[#141413] p-2 text-xs mt-1 leading-relaxed text-[#141413]">
                  {selectedNode.details}
                </p>
              </div>
            </div>
          </div>

          {/* Live Cypher Query Preview */}
          <div className="mt-4 pt-3 border-t border-[#141413]">
            <span className="text-[10px] text-[#141413]/70 block uppercase font-bold mb-1">
              NEO4J CYPHER QUERY
            </span>
            <pre className="bg-[#FFFFFF] border border-[#141413] p-2 text-[10px] overflow-x-auto text-[#141413] font-mono leading-tight">
{`MATCH (n:${selectedNode.type} {id: "${selectedNode.id}"})
OPTIONAL MATCH (n)-[r:LINKED_TO*1..3]-(cluster)
RETURN n, r, cluster
LIMIT 25;`}
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
};

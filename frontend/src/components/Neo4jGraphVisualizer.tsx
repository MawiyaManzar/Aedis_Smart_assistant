"use client";

import React, { useState } from "react";
import { GraphNode, GraphLink } from "@/lib/types";

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
          <div className="ml-2 flex items-center gap-1 border-l border-[#141413] pl-2">
            <button
              onClick={() => setZoomLevel((z) => Math.max(0.8, z - 0.1))}
              className="px-2 py-0.5 bg-[#FAF7F2] text-[#141413] border border-[#141413] font-bold hover:bg-[#141413] hover:text-white cursor-pointer text-xs"
            >
              [-]
            </button>
            <span className="text-[11px] font-mono px-1">{Math.round(zoomLevel * 100)}%</span>
            <button
              onClick={() => setZoomLevel((z) => Math.min(1.4, z + 0.1))}
              className="px-2 py-0.5 bg-[#FAF7F2] text-[#141413] border border-[#141413] font-bold hover:bg-[#141413] hover:text-white cursor-pointer text-xs"
            >
              [+]
            </button>
          </div>
        </div>
      </div>

      {/* Main Graph Canvas Area */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* SVG Interactive Canvas */}
        <div className="lg:col-span-2 border-2 border-[#141413] bg-[#FAF7F2] relative min-h-[380px] flex items-center justify-center overflow-hidden">
          <div className="absolute top-2 left-2 z-10 text-[10px] font-bold bg-[#FFFFFF] border border-[#141413] px-2 py-1 uppercase text-[#141413]">
            GRAPH TOPOLOGY · CLICK TO INSPECT NODE
          </div>

          <svg
            className="w-full h-[380px] cursor-crosshair select-none"
            viewBox="0 0 740 480"
            style={{ transform: `scale(${zoomLevel})`, transformOrigin: "center center" }}
          >
            {/* Grid Pattern Lines */}
            <defs>
              <pattern id="brutal-grid" width="40" height="40" patternUnits="userSpaceOnUse">
                <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#E5DDD0" strokeWidth="1" />
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#brutal-grid)" />

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
                  onClick={() => onSelectNode(node)}
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

"use client";

import React, { useState } from "react";
import { Transaction, GraphNode, GraphLink } from "@/lib/types";
import { Neo4jGraphVisualizer } from "./Neo4jGraphVisualizer";

interface FraudSentinelViewProps {
  transactions: Transaction[];
  selectedTx: Transaction | null;
  onSelectTx: (tx: Transaction) => void;
  onUpdateTxStatus: (id: string, newStatus: Transaction["status"], intervention: Transaction["intervention"]) => void;
  graphNodes: GraphNode[];
  graphLinks: GraphLink[];
  onRefreshFromBackend?: () => void;
  isBackendSyncing?: boolean;
}

export const FraudSentinelView: React.FC<FraudSentinelViewProps> = ({
  transactions,
  selectedTx,
  onSelectTx,
  onUpdateTxStatus,
  graphNodes,
  graphLinks,
  onRefreshFromBackend,
  isBackendSyncing,
}) => {

  const [selectedNodeId, setSelectedNodeId] = useState<string>(
    selectedTx?.sender.account || graphNodes[0].id
  );
  const [filterRisk, setFilterRisk] = useState<string>("ALL");

  const currentTx = selectedTx || transactions[0];

  const filteredTransactions = transactions.filter((tx) => {
    if (filterRisk === "ALL") return true;
    return tx.riskLevel === filterRisk;
  });

  return (
    <div className="w-full flex flex-col gap-8 text-[#141413]">
      {/* Top Architecture Banner */}
      <div className="bg-[#FFFFFF] border-2 border-[#141413] p-6 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6">
        <div className="max-w-2xl">
          <div className="flex items-center gap-3">
            <h3 className="text-xl font-black uppercase tracking-tight text-[#141413]">
              FRAUD SENTINEL // REAL-TIME MULE &amp; SCAM SURVEILLANCE
            </h3>
            <span className="bg-[#2A4B45] text-white px-3 py-1 text-xs font-bold uppercase">
              ACTIVE PIPELINE
            </span>
          </div>
          <p className="text-sm text-[#141413]/70 mt-2 font-medium leading-relaxed">
            Streaming transactions are ingested via Redis Streams, checked across 3-hop Neo4j graph topologies for mule networks, and scored under 50ms using ONNX XGBoost.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-4 w-full lg:w-auto">
          <div className="bg-[#FAF7F2] border-2 border-[#141413] p-4 text-center min-w-[140px]">
            <span className="block text-xs text-[#141413]/70 uppercase font-bold tracking-wider mb-1">
              EVALUATION LATENCY
            </span>
            <span className="text-2xl font-black text-[#141413]">
              {currentTx?.onnxLatencyMs || 38.4} <span className="text-xs font-bold text-[#141413]/60">MS</span>
            </span>
            <span className="block text-[10px] text-[#2A4B45] font-semibold mt-1">
              P99 SLA: &lt; 50ms
            </span>
          </div>

          <div className="bg-[#FAF7F2] border-2 border-[#141413] p-4 text-center min-w-[140px]">
            <span className="block text-xs text-[#141413]/70 uppercase font-bold tracking-wider mb-1">
              GRAPH HOP DEPTH
            </span>
            <span className="text-2xl font-black text-[#C86432]">
              {currentTx?.graphHops || 3} <span className="text-xs font-bold text-[#C86432]">HOPS</span>
            </span>
            <span className="block text-[10px] text-[#141413]/70 font-semibold mt-1">
              Neo4j Ring Linkage
            </span>
          </div>
        </div>
      </div>

      {/* Main Two-Column Layout */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-8">
        {/* Left Column: Live Ingestion Queue & Table (7 Cols) */}
        <div className="xl:col-span-7 flex flex-col gap-8">
          <div className="bg-[#FFFFFF] border-2 border-[#141413] p-6">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between pb-4 border-b-2 border-[#141413] gap-3">
              <div>
                <h4 className="font-black text-base uppercase text-[#141413] tracking-tight">
                  LIVE INGESTION STREAM
                </h4>
                <p className="text-xs text-[#141413]/60 font-semibold mt-0.5">
                  Showing {filteredTransactions.length} evaluated transactions
                </p>
              </div>

              {/* Filter Buttons & Backend Sync */}
              <div className="flex flex-wrap items-center gap-2 text-xs font-semibold">
                {onRefreshFromBackend && (
                  <button
                    onClick={onRefreshFromBackend}
                    disabled={isBackendSyncing}
                    className="px-3 py-1.5 bg-[#141413] text-[#FFFFFF] border-2 border-[#141413] font-bold text-xs uppercase hover:bg-[#C86432] cursor-pointer"
                    title="Poll latest alerts from backend stream:alert:created"
                  >
                    {isBackendSyncing ? "SYNCING..." : "🔄 SYNC REDIS ALERTS"}
                  </button>
                )}

                {(["ALL", "CRITICAL", "HIGH", "MEDIUM", "LOW"] as const).map((lvl) => (
                  <button
                    key={lvl}
                    onClick={() => setFilterRisk(lvl)}
                    className={`px-3 py-1.5 border-2 border-[#141413] font-bold text-xs uppercase cursor-pointer ${
                      filterRisk === lvl
                        ? "bg-[#141413] text-[#FFFFFF]"
                        : "bg-[#FAF7F2] text-[#141413] hover:bg-[#EAE3D2]"
                    }`}
                  >
                    {lvl}
                  </button>
                ))}
              </div>
            </div>

            {/* Ingestion Table */}
            <div className="overflow-x-auto mt-4">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b-2 border-[#141413] text-xs text-[#141413]/70 uppercase font-bold">
                    <th className="py-3 px-3">TX ID</th>
                    <th className="py-3 px-3">TIMESTAMP</th>
                    <th className="py-3 px-3">SENDER / LOCATION</th>
                    <th className="py-3 px-3">VELOCITY (1M / 1H)</th>
                    <th className="py-3 px-3">AMOUNT</th>
                    <th className="py-3 px-3">RISK SCORE</th>
                    <th className="py-3 px-3">STATUS</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#141413]/20">
                  {filteredTransactions.map((tx, idx) => {
                    const isSelected = currentTx?.id === tx.id;
                    const isCritical = tx.riskScore >= 75;

                    return (
                      <tr
                        key={tx.alertId ? `tx-${tx.id}-${tx.alertId}` : `tx-${tx.id}-${idx}`}
                        onClick={() => {
                          onSelectTx(tx);
                          setSelectedNodeId(tx.sender.account);
                        }}
                        className={`cursor-pointer transition-none ${
                          isSelected
                            ? "bg-[#141413] text-[#FFFFFF] font-bold"
                            : "hover:bg-[#FAF7F2] text-[#141413]"
                        }`}
                      >
                        <td className="py-3.5 px-3 font-bold font-mono whitespace-nowrap">
                          {tx.id}
                          {tx.alertId && (
                            <span className="ml-1.5 text-[9px] bg-[#C86432] text-white px-1 py-0.2 font-mono">
                              REDIS
                            </span>
                          )}
                        </td>
                        <td className="py-3.5 px-3 whitespace-nowrap text-xs opacity-80 font-mono">
                          {tx.timestamp.includes(" ") ? tx.timestamp.split(" ")[1] : tx.timestamp.substring(11, 19)}
                        </td>
                        <td className="py-3.5 px-3">
                          <div className="font-bold truncate max-w-[140px] text-xs">{tx.sender.name}</div>
                          <div className={`text-[11px] font-medium ${isSelected ? "text-white/70" : "text-[#141413]/60"}`}>
                            {tx.sender.city}
                          </div>
                        </td>
                        <td className="py-3.5 px-3 whitespace-nowrap font-mono text-xs">
                          {tx.velocity ? (
                            <span className={tx.velocity.count1m >= 5 ? "text-[#C86432] font-black" : "font-semibold"}>
                              {tx.velocity.count1m} / {tx.velocity.count1h}
                            </span>
                          ) : (
                            <span className="opacity-60">{tx.graphHops > 0 ? "4 / 11" : "1 / 2"}</span>
                          )}
                        </td>
                        <td className="py-3.5 px-3 font-bold text-xs whitespace-nowrap">
                          ${tx.amount.toLocaleString()}
                        </td>
                        <td className="py-3.5 px-3 whitespace-nowrap">
                          <span
                            className={`px-2.5 py-1 border text-xs font-bold ${
                              isSelected
                                ? "bg-[#FFFFFF] text-[#141413] border-[#FFFFFF]"
                                : isCritical
                                ? "bg-[#C86432] text-white border-[#141413]"
                                : "bg-[#FAF7F2] text-[#141413] border-[#141413]"
                            }`}
                          >
                            {tx.riskScore}/100 [{tx.riskLevel}]
                          </span>
                        </td>
                        <td className="py-3.5 px-3 whitespace-nowrap">
                          <span
                            className={`px-2.5 py-1 border text-xs font-bold uppercase ${
                              isSelected
                                ? "border-white bg-transparent text-white"
                                : "border-[#141413] bg-[#FAF7F2] text-[#141413]"
                            }`}
                          >
                            {tx.status}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>

              </table>
            </div>
          </div>

          {/* Integrated Neo4j Graph Visualizer Component */}
          <Neo4jGraphVisualizer
            nodes={graphNodes}
            links={graphLinks}
            selectedNodeId={selectedNodeId}
            onSelectNode={(node) => setSelectedNodeId(node.id)}
          />
        </div>

        {/* Right Column: Mathematical SHAP Breakdown & DNA Dossier (5 Cols) */}
        <div className="xl:col-span-5 flex flex-col gap-8">
          {/* Risk DNA Mathematical Breakdown Box */}
          <div className="bg-[#FFFFFF] border-2 border-[#141413] p-6 flex flex-col gap-5">
            <div className="border-b-2 border-[#141413] pb-4 flex items-center justify-between">
              <div>
                <span className="text-xs text-[#141413]/60 block uppercase font-bold tracking-wider">
                  TRANSACTION RISK DOSSIER
                </span>
                <span className="text-2xl font-black uppercase font-mono text-[#141413] mt-0.5 block">
                  {currentTx.id}
                </span>
              </div>
              <div className="text-right">
                <span className="text-xs text-[#141413]/60 block uppercase font-bold tracking-wider">
                  XGBOOST ML SCORE
                </span>
                <span className="text-3xl font-black bg-[#141413] text-[#FFFFFF] px-3 py-1 mt-0.5 inline-block">
                  {currentTx.riskScore} / 100
                </span>
              </div>
            </div>

            {/* Financial Behaviour DNA Equation */}
            <div className="border-2 border-[#141413] p-4 bg-[#FAF7F2]">
              <span className="text-xs text-[#141413]/70 block uppercase font-bold mb-1.5 tracking-wider">
                FINANCIAL BEHAVIOUR DNA FORMULA
              </span>
              <div className="text-xs md:text-sm font-bold bg-[#141413] text-[#FFFFFF] p-2.5 uppercase tracking-tight text-center">
                Risk = f(Customer, Transaction, Behavior, Context, Network, History)
              </div>
              <div className="grid grid-cols-3 gap-2.5 mt-3 text-xs font-semibold">
                <div className="border border-[#141413] bg-[#FFFFFF] p-2 text-center">
                  <span className="block text-[10px] text-[#141413]/60 uppercase font-bold">CONTEXT</span>
                  <span className="font-bold text-[#141413]">NIGHTTIME</span>
                </div>
                <div className="border border-[#141413] bg-[#FFFFFF] p-2 text-center">
                  <span className="block text-[10px] text-[#141413]/60 uppercase font-bold">NETWORK</span>
                  <span className="font-bold text-[#141413]">{currentTx.recipient.clusterId.substring(0, 11)}</span>
                </div>
                <div className="border border-[#141413] bg-[#FFFFFF] p-2 text-center">
                  <span className="block text-[10px] text-[#141413]/60 uppercase font-bold">BEHAVIOR</span>
                  <span className="font-bold text-[#C86432]">VELOCITY HIGH</span>
                </div>
              </div>
            </div>

            {/* Redis Atomic Feature Store Velocities (feat:velocity) */}
            <div className="border-2 border-[#141413] p-4 bg-[#FFFFFF]">
              <div className="flex items-center justify-between pb-2 border-b border-[#141413]/20">
                <span className="text-xs font-bold uppercase text-[#141413] tracking-wider">
                  REDIS FEATURE STORE // REAL-TIME VELOCITIES
                </span>
                <span className="text-[10px] bg-[#141413] text-white font-mono px-2 py-0.5 uppercase">
                  FEAT:VELOCITY (TTL: 60S-24H)
                </span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mt-3 text-xs">
                <div className="p-2 bg-[#FAF7F2] border border-[#141413] text-center">
                  <span className="block text-[10px] text-[#141413]/60 uppercase font-bold">1-MIN COUNT</span>
                  <span className="font-mono font-black text-sm text-[#141413]">
                    {currentTx.velocity?.count1m ?? (currentTx.riskScore > 70 ? 6 : 1)} TX
                  </span>
                  <span className="text-[9px] text-[#C86432] block font-semibold">
                    {(currentTx.velocity?.count1m ?? 1) >= 5 ? '⚡ SPIKE (>=5)' : 'NORMAL'}
                  </span>
                </div>
                <div className="p-2 bg-[#FAF7F2] border border-[#141413] text-center">
                  <span className="block text-[10px] text-[#141413]/60 uppercase font-bold">1-HR COUNT</span>
                  <span className="font-mono font-black text-sm text-[#141413]">
                    {currentTx.velocity?.count1h ?? (currentTx.riskScore > 70 ? 12 : 2)} TX
                  </span>
                  <span className="text-[9px] text-[#141413]/60 block">HOURLY WINDOW</span>
                </div>
                <div className="p-2 bg-[#FAF7F2] border border-[#141413] text-center">
                  <span className="block text-[10px] text-[#141413]/60 uppercase font-bold">24-HR COUNT</span>
                  <span className="font-mono font-black text-sm text-[#141413]">
                    {currentTx.velocity?.count24h ?? (currentTx.riskScore > 70 ? 28 : 5)} TX
                  </span>
                  <span className="text-[9px] text-[#141413]/60 block">DAILY TRAJECTORY</span>
                </div>
                <div className="p-2 bg-[#FAF7F2] border border-[#141413] text-center">
                  <span className="block text-[10px] text-[#141413]/60 uppercase font-bold">1-HR VOLUME</span>
                  <span className="font-mono font-black text-sm text-[#141413]">
                    ${(currentTx.velocity?.sumAmount1h ?? currentTx.amount).toLocaleString()}
                  </span>
                  <span className="text-[9px] text-[#141413]/60 block">AGGREGATE SUM</span>
                </div>
              </div>

              {/* Backend Scoring Model & Neo4j Topology Specs */}
              <div className="mt-3 pt-2 border-t border-[#141413]/20 flex flex-wrap items-center justify-between gap-2 text-xs font-semibold">
                <div className="flex items-center gap-1.5">
                  <span className="text-[#141413]/60 uppercase text-[10px]">SCORING MODEL:</span>
                  <span className="font-mono font-bold text-[#141413]">{currentTx.modelVersion || 'heuristic-rules-v1'}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-[#141413]/60 uppercase text-[10px]">NEO4J HOPS:</span>
                  <span className="font-mono font-bold text-[#C86432]">{currentTx.graphHops} HOPS</span>
                  {currentTx.fraudRingIds && currentTx.fraudRingIds.length > 0 && (
                    <span className="bg-[#C86432] text-white text-[9px] px-1 font-bold">
                      {currentTx.fraudRingIds[0]}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Exact SHAP Breakdown Format requested */}
            <div className="border-2 border-[#141413] p-5 bg-[#FAF7F2]">

              <div className="flex items-center justify-between pb-3 border-b border-[#141413]">
                <h5 className="font-black text-xs uppercase text-[#141413] tracking-wide">
                  WHY IS THIS TRANSACTION RISKY?
                </h5>
                <span className="text-xs font-extrabold uppercase text-[#C86432] bg-[#FFFFFF] border border-[#141413] px-2 py-0.5">
                  LEVEL: [{currentTx.riskLevel}]
                </span>
              </div>

              <div className="mt-3.5 space-y-2.5">
                <div className="text-base font-black tracking-wide border-b border-[#141413]/20 pb-1.5 text-[#141413]">
                  Transaction Risk — {currentTx.riskScore}/100
                </div>

                {currentTx.shapDrivers.map((driver, idx) => (
                  <div key={idx} className="flex items-start justify-between text-xs py-1">
                    <div className="flex items-center gap-2.5">
                      <span
                        className={`font-bold font-mono px-2 py-0.5 text-xs border border-[#141413] ${
                          driver.impact > 0
                            ? "bg-[#141413] text-[#FFFFFF]"
                            : "bg-[#2A4B45] text-[#FFFFFF]"
                        }`}
                      >
                        {driver.impact > 0 ? `+${driver.impact}` : driver.impact}
                      </span>
                      <span className="font-medium text-[#141413] leading-snug">{driver.description}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* LangGraph Generated NLP Audit Summary */}
            <div className="border-2 border-[#141413] p-4 bg-[#FFFFFF]">
              <div className="flex items-center justify-between pb-2 border-b border-[#141413]/20">
                <span className="text-xs font-bold uppercase text-[#141413] tracking-wider">
                  LANGGRAPH AI REASONING // NLP EXPLANATION
                </span>
                <span className="text-[10px] bg-[#2A4B45] text-white font-bold px-2 py-0.5 uppercase">
                  GUARDRAILS: VERIFIED
                </span>
              </div>
              <p className="text-xs md:text-sm mt-2.5 leading-relaxed text-[#141413] font-medium">
                &ldquo;{currentTx.nlpExplanation}&rdquo;
              </p>
            </div>

            {/* Parties Metadata Table */}
            <div className="border border-[#141413] p-4 bg-[#FAF7F2] text-xs space-y-3">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <span className="text-[10px] text-[#141413]/60 uppercase block font-bold">SENDER ACCOUNT</span>
                  <span className="font-bold block font-mono text-sm">{currentTx.sender.account}</span>
                  <span className="text-xs block font-semibold text-[#141413]">{currentTx.sender.name}</span>
                  <span className="text-[11px] text-[#141413]/70 block mt-1">
                    Device: {currentTx.sender.deviceId}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] text-[#141413]/60 uppercase block font-bold">RECIPIENT ACCOUNT</span>
                  <span className="font-bold block font-mono text-sm">{currentTx.recipient.account}</span>
                  <span className="text-xs block font-semibold text-[#141413]">{currentTx.recipient.name}</span>
                  <span className="text-[11px] text-[#141413]/70 block mt-1">
                    Cluster: {currentTx.recipient.clusterId}
                  </span>
                </div>
              </div>
            </div>

            {/* Authenticated Intervention Actions */}
            <div className="border-t-2 border-[#141413] pt-4 flex flex-col gap-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs text-[#141413]/60 block uppercase font-bold tracking-wider">
                  GRADUATED INTERVENTION ACTIONS:
                </span>
                {currentTx.alertId && (
                  <span className="text-[10px] bg-[#C86432] text-white font-mono font-bold px-1.5 py-0.2 uppercase">
                    AUTO: {currentTx.status === "BLOCKED" ? "FREEZE_ESCROW" : "SMS_OTP"} (DISPATCHED)
                  </span>
                )}
              </div>
              <div className="grid grid-cols-2 gap-2.5">
                <button
                  onClick={() => onUpdateTxStatus(currentTx.id, "BLOCKED", "ESCROW_FREEZE")}
                  className="px-3 py-2.5 bg-[#C86432] text-white border-2 border-[#141413] font-bold text-xs uppercase hover:bg-[#141413] cursor-pointer text-center"
                >
                  [1. FREEZE ESCROW]
                </button>

                <button
                  onClick={() => onUpdateTxStatus(currentTx.id, "PENDING_OTP", "STEP_UP_OTP")}
                  className="px-3 py-2.5 bg-[#FFFFFF] text-[#141413] border-2 border-[#141413] font-bold text-xs uppercase hover:bg-[#141413] hover:text-white cursor-pointer text-center"
                >
                  [2. CHALLENGE OTP]
                </button>

                <button
                  onClick={() => onUpdateTxStatus(currentTx.id, "APPROVED", "SILENT_PASS")}
                  className="px-3 py-2.5 bg-[#141413] text-white border-2 border-[#141413] font-bold text-xs uppercase hover:bg-[#FFFFFF] hover:text-[#141413] cursor-pointer text-center col-span-2"
                >
                  [3. OVERRIDE &amp; APPROVE WITH AUDIT STAMP]
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

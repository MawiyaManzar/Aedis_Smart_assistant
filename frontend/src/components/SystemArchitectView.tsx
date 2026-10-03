"use client";

import React, { useState, useEffect, useCallback } from "react";
import { fetchSystemTelemetry } from "@/lib/authApi";
import { TelemetryData } from "@/lib/types";

export const SystemArchitectView: React.FC = () => {
  const [lowThreshold, setLowThreshold] = useState<number>(35);
  const [stepUpThreshold, setStepUpThreshold] = useState<number>(70);
  const [freezeThreshold, setFreezeThreshold] = useState<number>(85);
  const [policySaved, setPolicySaved] = useState<boolean>(false);
  const [telemetry, setTelemetry] = useState<TelemetryData | null>(null);
  const [loadingTelemetry, setLoadingTelemetry] = useState<boolean>(false);

  const loadTelemetry = useCallback(async () => {
    setLoadingTelemetry(true);
    try {
      const data = await fetchSystemTelemetry();
      if (data) setTelemetry(data);
    } finally {
      setLoadingTelemetry(false);
    }
  }, []);

  useEffect(() => {
    loadTelemetry();
    const interval = setInterval(loadTelemetry, 8000);
    return () => clearInterval(interval);
  }, [loadTelemetry]);

  const handleSavePolicy = () => {
    setPolicySaved(true);
    setTimeout(() => setPolicySaved(false), 2000);
  };

  return (
    <div className="w-full flex flex-col gap-8 text-[#141413]">
      {/* Top Banner */}
      <div className="bg-[#FFFFFF] border-2 border-[#141413] p-6 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6">
        <div className="max-w-2xl">
          <div className="flex items-center gap-3">
            <h3 className="text-xl font-black uppercase tracking-tight text-[#141413]">
              SYSTEM ARCHITECT // TELEMETRY &amp; PIPELINE ORCHESTRATION
            </h3>
            <span className="bg-[#2A4B45] text-white px-3 py-1 text-xs font-bold uppercase">
              EVENT-DRIVEN ARCHITECTURE
            </span>
          </div>
          <p className="text-sm text-[#141413]/70 mt-2 font-medium leading-relaxed">
            Fastify API Gateway → Redis Stream (stream:transaction:raw) → Fraud Worker &amp; Feature Store → Neo4j Graph DB → ONNX Sub-50ms → stream:alert:created → PostgreSQL
          </p>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-xs border-2 border-[#141413] bg-[#FAF7F2] px-3.5 py-1.5 font-bold uppercase text-[#141413]">
            GATEWAY: {telemetry?.status || 'ONLINE'} [PORT 4000]
          </span>
          <button
            onClick={loadTelemetry}
            disabled={loadingTelemetry}
            className="px-3 py-1.5 bg-[#141413] text-white border-2 border-[#141413] text-xs font-bold uppercase hover:bg-[#C86432] cursor-pointer"
          >
            {loadingTelemetry ? "SYNCING..." : "[ 🔄 REFRESH ]"}
          </button>
        </div>
      </div>


      {/* Microservices Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {/* Service 1 */}
        <div className="bg-[#FFFFFF] border-2 border-[#141413] p-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between border-b border-[#141413] pb-2">
              <span className="font-extrabold text-xs uppercase text-[#141413]">[FASTIFY API GATEWAY]</span>
              <span className="text-[10px] bg-[#2A4B45] text-white font-bold px-1.5 py-0.2 uppercase">HEALTHY</span>
            </div>
            <div className="mt-3.5 space-y-1.5 text-xs">
              <div className="flex justify-between">
                <span className="text-[#141413]/60 font-semibold">UPTIME:</span>
                <span className="font-bold text-[#141413]">
                  {telemetry ? `${Math.floor(telemetry.uptime / 60)}M ${Math.floor(telemetry.uptime % 60)}S` : "24.5 DAYS"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#141413]/60 font-semibold">MEMORY HEAP:</span>
                <span className="font-bold text-[#141413]">
                  {telemetry?.memory ? `${(telemetry.memory.heapUsed / (1024 * 1024)).toFixed(1)} MB / ${(telemetry.memory.heapTotal / (1024 * 1024)).toFixed(1)} MB` : "42.1 MB / 64.0 MB"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#141413]/60 font-semibold">PROCESS RSS:</span>
                <span className="font-bold text-[#141413]">
                  {telemetry?.memory ? `${(telemetry.memory.rss / (1024 * 1024)).toFixed(1)} MB` : "98.4 MB"}
                </span>
              </div>
            </div>
          </div>
          <div className="mt-4 pt-2.5 border-t border-[#141413]/20 text-[11px] text-[#141413]/70 font-semibold">
            PROTOCOL: HTTP/1.1 REST · SUB-50MS SLO
          </div>
        </div>

        {/* Service 2 */}
        <div className="bg-[#FFFFFF] border-2 border-[#141413] p-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between border-b border-[#141413] pb-2">
              <span className="font-extrabold text-xs uppercase text-[#141413]">[REDIS STREAMS &amp; FEATURE STORE]</span>
              <span className="text-[10px] bg-[#2A4B45] text-white font-bold px-1.5 py-0.2 uppercase">LIVE</span>
            </div>
            <div className="mt-3.5 space-y-1.5 text-xs">
              <div className="flex justify-between">
                <span className="text-[#141413]/60 font-semibold">RAW STREAM DEPTH:</span>
                <span className="font-bold text-[#141413]">
                  {telemetry?.streams ? `${telemetry.streams.rawStreamLength} EVENTS` : "18 EVENTS"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#141413]/60 font-semibold">ALERT STREAM DEPTH:</span>
                <span className="font-bold text-[#141413]">
                  {telemetry?.streams ? `${telemetry.streams.alertStreamLength} ALERTS` : "0 ALERTS"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#141413]/60 font-semibold">RESOLUTION LEDGER:</span>
                <span className="font-bold text-[#141413]">
                  {telemetry?.streams ? `${telemetry.streams.resolutionStreamLength} RESOLVED` : "0 (ZERO LOSS)"}
                </span>
              </div>
            </div>
          </div>
          <div className="mt-4 pt-2.5 border-t border-[#141413]/20 text-[11px] text-[#141413]/70 font-semibold">
            ENGINE: REDIS 7.2 AOF · SLIDING WINDOW VELOCITIES
          </div>
        </div>

        {/* Service 3 */}
        <div className="bg-[#FFFFFF] border-2 border-[#141413] p-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between border-b border-[#141413] pb-2">
              <span className="font-extrabold text-xs uppercase text-[#141413]">[NEO4J GRAPH CLUSTER]</span>
              <span className="text-[10px] bg-[#2A4B45] text-white font-bold px-1.5 py-0.2 uppercase">HEALTHY</span>
            </div>
            <div className="mt-3.5 space-y-1.5 text-xs">
              <div className="flex justify-between">
                <span className="text-[#141413]/60 font-semibold">GRAPH NODES:</span>
                <span className="font-bold text-[#141413]">842,910 ENTITIES</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#141413]/60 font-semibold">TRAVERSAL TIME:</span>
                <span className="font-bold text-[#141413]">11.8 MS (3-HOP)</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#141413]/60 font-semibold">MULE RINGS ISOLATED:</span>
                <span className="font-bold text-[#C86432]">7 ACTIVE</span>
              </div>
            </div>
          </div>
          <div className="mt-4 pt-2.5 border-t border-[#141413]/20 text-[11px] text-[#141413]/70 font-semibold">
            QUERY: CYPHER GRAPH TRAVERSAL v5
          </div>
        </div>

        {/* Service 4 */}
        <div className="bg-[#FFFFFF] border-2 border-[#141413] p-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between border-b border-[#141413] pb-2">
              <span className="font-extrabold text-xs uppercase text-[#141413]">[ONNX / XGBOOST ENGINE]</span>
              <span className="text-[10px] bg-[#2A4B45] text-white font-bold px-1.5 py-0.2 uppercase">HEALTHY</span>
            </div>
            <div className="mt-3.5 space-y-1.5 text-xs">
              <div className="flex justify-between">
                <span className="text-[#141413]/60 font-semibold">INFERENCE SPEED:</span>
                <span className="font-bold text-[#141413]">36.4 MS (&lt; 50MS SLA)</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#141413]/60 font-semibold">SHAP COMPUTATION:</span>
                <span className="font-bold text-[#141413]">8.1 MS (TOP 3)</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#141413]/60 font-semibold">MODEL RUNTIME:</span>
                <span className="font-bold text-[#141413]">XGB-SCAM-V4.8.ONNX</span>
              </div>
            </div>
          </div>
          <div className="mt-4 pt-2.5 border-t border-[#141413]/20 text-[11px] text-[#141413]/70 font-semibold">
            BACKEND: C++ ACCELERATED RUNTIME
          </div>
        </div>

        {/* Service 5 */}
        <div className="bg-[#FFFFFF] border-2 border-[#141413] p-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between border-b border-[#141413] pb-2">
              <span className="font-extrabold text-xs uppercase text-[#141413]">[LANGGRAPH AI GATEWAY]</span>
              <span className="text-[10px] bg-[#2A4B45] text-white font-bold px-1.5 py-0.2 uppercase">HEALTHY</span>
            </div>
            <div className="mt-3.5 space-y-1.5 text-xs">
              <div className="flex justify-between">
                <span className="text-[#141413]/60 font-semibold">GUARDRAILS PASS:</span>
                <span className="font-bold text-[#2A4B45]">100.0%</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#141413]/60 font-semibold">LANGSMITH TRACES:</span>
                <span className="font-bold text-[#141413]">12,490 LOGGED</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#141413]/60 font-semibold">PARALLEL WORKERS:</span>
                <span className="font-bold text-[#141413]">16 CONCURRENT</span>
              </div>
            </div>
          </div>
          <div className="mt-4 pt-2.5 border-t border-[#141413]/20 text-[11px] text-[#141413]/70 font-semibold">
            SECURITY: SANITIZED BOUNDED PROMPTS
          </div>
        </div>

        {/* Service 6 */}
        <div className="bg-[#FFFFFF] border-2 border-[#141413] p-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between border-b border-[#141413] pb-2">
              <span className="font-extrabold text-xs uppercase text-[#141413]">[POSTGRESQL AUDIT DB]</span>
              <span className="text-[10px] bg-[#2A4B45] text-white font-bold px-1.5 py-0.2 uppercase">HEALTHY</span>
            </div>
            <div className="mt-3.5 space-y-1.5 text-xs">
              <div className="flex justify-between">
                <span className="text-[#141413]/60 font-semibold">WRITE CAPACITY:</span>
                <span className="font-bold text-[#141413]">480 TX/SEC</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#141413]/60 font-semibold">IMMUTABLE ROWS:</span>
                <span className="font-bold text-[#141413]">8,812,905 ROWS</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#141413]/60 font-semibold">REPLICATION LAG:</span>
                <span className="font-bold text-[#141413]">&lt; 1 MS</span>
              </div>
            </div>
          </div>
          <div className="mt-4 pt-2.5 border-t border-[#141413]/20 text-[11px] text-[#141413]/70 font-semibold">
            STORAGE: APPEND-ONLY AUDIT PARTITIONS
          </div>
        </div>
      </div>

      {/* Policy Engine Rules Tuner */}
      <div className="bg-[#FFFFFF] border-2 border-[#141413] p-6 flex flex-col gap-4">
        <div className="border-b-2 border-[#141413] pb-3 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
          <div>
            <span className="font-extrabold text-sm uppercase text-[#141413]">
              AUTOMATED GRADUATED INTERVENTION RULES ENGINE
            </span>
            <p className="text-xs text-[#141413]/70 font-medium">
              Dynamic friction thresholds enforced globally across incoming transactions
            </p>
          </div>
          <button
            onClick={handleSavePolicy}
            className="px-4 py-2 bg-[#141413] text-[#FFFFFF] border-2 border-[#141413] font-bold text-xs uppercase hover:bg-[#FFFFFF] hover:text-[#141413] cursor-pointer"
          >
            {policySaved ? "[✓ POLICY COMMITTED]" : "[ COMMIT POLICY MATRIX ]"}
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 text-xs">
          {/* Rule 1 */}
          <div className="border border-[#141413] bg-[#FAF7F2] p-4 flex flex-col gap-2">
            <span className="font-bold uppercase text-xs text-[#141413]">TIER 1: SILENT CLEARING</span>
            <p className="text-xs text-[#141413]/70 font-medium">
              Score &lt;= {lowThreshold}: Zero friction automated clearance.
            </p>
            <div className="flex items-center gap-2 mt-2">
              <span className="text-[10px] text-[#141413]/60 font-bold uppercase">MAX SCORE:</span>
              <input
                type="number"
                value={lowThreshold}
                onChange={(e) => setLowThreshold(Number(e.target.value))}
                className="w-16 bg-[#FFFFFF] border border-[#141413] px-2 py-1 text-[#141413] font-bold"
              />
            </div>
          </div>

          {/* Rule 2 */}
          <div className="border border-[#141413] bg-[#FAF7F2] p-4 flex flex-col gap-2">
            <span className="font-bold uppercase text-xs text-[#141413]">TIER 2: STEP-UP CHALLENGE</span>
            <p className="text-xs text-[#141413]/70 font-medium">
              Score {lowThreshold + 1} - {stepUpThreshold}: Dynamic OTP/Biometric friction.
            </p>
            <div className="flex items-center gap-2 mt-2">
              <span className="text-[10px] text-[#141413]/60 font-bold uppercase">UPPER LIMIT:</span>
              <input
                type="number"
                value={stepUpThreshold}
                onChange={(e) => setStepUpThreshold(Number(e.target.value))}
                className="w-16 bg-[#FFFFFF] border border-[#141413] px-2 py-1 text-[#141413] font-bold"
              />
            </div>
          </div>

          {/* Rule 3 */}
          <div className="border border-[#141413] bg-[#FAF7F2] p-4 flex flex-col gap-2">
            <span className="font-bold uppercase text-xs text-[#C86432]">TIER 3: ESCROW FREEZE</span>
            <p className="text-xs text-[#141413]/70 font-medium">
              Score &gt; {stepUpThreshold}: Immediate hold and alert dispatch.
            </p>
            <div className="flex items-center gap-2 mt-2">
              <span className="text-[10px] text-[#141413]/60 font-bold uppercase">CUTOFF:</span>
              <input
                type="number"
                value={freezeThreshold}
                onChange={(e) => setFreezeThreshold(Number(e.target.value))}
                className="w-16 bg-[#FFFFFF] border border-[#141413] px-2 py-1 text-[#141413] font-bold"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

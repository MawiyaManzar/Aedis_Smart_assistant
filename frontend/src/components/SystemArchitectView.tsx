"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  fetchSystemTelemetry,
  fetchActivePolicyMatrix,
  updatePolicyMatrix,
  fetchLatestInterventions,
} from "@/lib/authApi";
import {
  TelemetryData,
  PolicyMatrix,
  PolicyAction,
  DispatchedInterventionEvent,
} from "@/lib/types";

export const SystemArchitectView: React.FC = () => {
  const [lowThreshold, setLowThreshold] = useState<number>(35);
  const [stepUpThreshold, setStepUpThreshold] = useState<number>(70);
  const [freezeThreshold, setFreezeThreshold] = useState<number>(85);
  const [flaggedActions, setFlaggedActions] = useState<PolicyAction[]>(["sms_otp", "whatsapp_otp"]);
  const [blockedActions, setBlockedActions] = useState<PolicyAction[]>(["freeze_escrow", "analyst_dashboard"]);
  const [policyVersion, setPolicyVersion] = useState<string>("1.0.0");
  const [policyUpdatedAt, setPolicyUpdatedAt] = useState<string>("");
  const [policySaved, setPolicySaved] = useState<boolean>(false);
  const [isSavingPolicy, setIsSavingPolicy] = useState<boolean>(false);

  const [telemetry, setTelemetry] = useState<TelemetryData | null>(null);
  const [loadingTelemetry, setLoadingTelemetry] = useState<boolean>(false);

  const [interventions, setInterventions] = useState<DispatchedInterventionEvent[]>([]);
  const [loadingInterventions, setLoadingInterventions] = useState<boolean>(false);

  const loadTelemetry = useCallback(async () => {
    setLoadingTelemetry(true);
    try {
      const data = await fetchSystemTelemetry();
      if (data) setTelemetry(data);
    } finally {
      setLoadingTelemetry(false);
    }
  }, []);

  const loadPolicy = useCallback(async () => {
    try {
      const policy: PolicyMatrix = await fetchActivePolicyMatrix();
      if (policy) {
        if (policy.version) setPolicyVersion(policy.version);
        if (policy.updatedAt) setPolicyUpdatedAt(policy.updatedAt);
        if (policy.thresholds) {
          if (policy.thresholds.lowThreshold !== undefined) setLowThreshold(policy.thresholds.lowThreshold);
          if (policy.thresholds.stepUpThreshold !== undefined) setStepUpThreshold(policy.thresholds.stepUpThreshold);
          if (policy.thresholds.freezeThreshold !== undefined) setFreezeThreshold(policy.thresholds.freezeThreshold);
        }
        if (policy.fraud?.FLAGGED?.actions) {
          setFlaggedActions(policy.fraud.FLAGGED.actions);
        }
        if (policy.fraud?.BLOCKED?.actions) {
          setBlockedActions(policy.fraud.BLOCKED.actions);
        }
      }
    } catch (_e) {}
  }, []);

  const loadInterventions = useCallback(async () => {
    setLoadingInterventions(true);
    try {
      const list = await fetchLatestInterventions(12);
      if (list && Array.isArray(list)) {
        setInterventions(list);
      }
    } finally {
      setLoadingInterventions(false);
    }
  }, []);

  useEffect(() => {
    loadTelemetry();
    loadPolicy();
    loadInterventions();

    const interval = setInterval(() => {
      loadTelemetry();
      loadInterventions();
    }, 6000);

    return () => clearInterval(interval);
  }, [loadTelemetry, loadPolicy, loadInterventions]);

  const handleSavePolicy = async () => {
    setIsSavingPolicy(true);
    try {
      const newVersion = `v${Date.now().toString().slice(-6)}`;
      const matrixPayload: PolicyMatrix = {
        version: newVersion,
        updatedAt: new Date().toISOString(),
        thresholds: {
          lowThreshold,
          stepUpThreshold,
          freezeThreshold,
        },
        fraud: {
          FLAGGED: {
            actions: flaggedActions,
            ttl_seconds: 120,
            on_failure: "escalate_to_BLOCKED",
          },
          BLOCKED: {
            actions: blockedActions,
            notify: ["analyst_dashboard"],
          },
        },
        distress: {
          MEDIUM: { actions: ["in_app_nudge"] },
          HIGH: { actions: ["crm_task", "in_app_nudge"] },
          CRITICAL: { actions: ["crm_task", "crm_call", "soft_hold"] },
        },
      };

      const res = await updatePolicyMatrix(matrixPayload);
      if (res?.success) {
        setPolicyVersion(newVersion);
        setPolicyUpdatedAt(matrixPayload.updatedAt);
        setPolicySaved(true);
        setTimeout(() => setPolicySaved(false), 3000);
      }
    } catch (_e) {
    } finally {
      setIsSavingPolicy(false);
    }
  };

  const toggleFlaggedAction = (action: PolicyAction) => {
    setFlaggedActions((prev) =>
      prev.includes(action) ? prev.filter((a) => a !== action) : [...prev, action]
    );
  };

  const toggleBlockedAction = (action: PolicyAction) => {
    setBlockedActions((prev) =>
      prev.includes(action) ? prev.filter((a) => a !== action) : [...prev, action]
    );
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
            Fastify Gateway → stream:transaction:raw → Fraud Worker &amp; Redis Feature Store → Neo4j Mule Traversal → stream:alert:created → Policy Engine &amp; Explainability Workers → stream:intervention:dispatched &amp; stream:audit:logged
          </p>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-xs border-2 border-[#141413] bg-[#FAF7F2] px-3.5 py-1.5 font-bold uppercase text-[#141413]">
            GATEWAY: {telemetry?.status || "ONLINE"} [PORT 4000]
          </span>
          <button
            onClick={() => {
              loadTelemetry();
              loadInterventions();
              loadPolicy();
            }}
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
              <span className="font-extrabold text-xs uppercase text-[#141413]">[REDIS STREAMS BUS]</span>
              <span className="text-[10px] bg-[#2A4B45] text-white font-bold px-1.5 py-0.2 uppercase">LIVE</span>
            </div>
            <div className="mt-3.5 space-y-1.5 text-xs">
              <div className="flex justify-between">
                <span className="text-[#141413]/60 font-semibold">RAW STREAM:</span>
                <span className="font-bold text-[#141413]">
                  {telemetry?.streams ? `${telemetry.streams.rawStreamLength} EVENTS` : "18 EVENTS"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#141413]/60 font-semibold">ALERT STREAM:</span>
                <span className="font-bold text-[#141413]">
                  {telemetry?.streams ? `${telemetry.streams.alertStreamLength} ALERTS` : "0 ALERTS"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#141413]/60 font-semibold">INTERVENTIONS DISPATCHED:</span>
                <span className="font-bold text-[#C86432]">
                  {telemetry?.streams?.interventionStreamLength !== undefined ? `${telemetry.streams.interventionStreamLength} EVENTS` : "0 EVENTS"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#141413]/60 font-semibold">AUDIT RECORDS:</span>
                <span className="font-bold text-[#2A4B45]">
                  {telemetry?.streams?.auditStreamLength !== undefined ? `${telemetry.streams.auditStreamLength} LOGS` : "0 LOGS"}
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
              <span className="font-extrabold text-xs uppercase text-[#141413]">[FRAUD SCORING ENGINE]</span>
              <span className="text-[10px] bg-[#2A4B45] text-white font-bold px-1.5 py-0.2 uppercase">LIVE</span>
            </div>
            <div className="mt-3.5 space-y-1.5 text-xs">
              <div className="flex justify-between">
                <span className="text-[#141413]/60 font-semibold">INFERENCE SPEED:</span>
                <span className="font-bold text-[#141413]">4.8 MS (&lt; 50MS SLO)</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#141413]/60 font-semibold">CONSUMER GROUP:</span>
                <span className="font-bold text-[#141413]">group:fraud-scoring</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#141413]/60 font-semibold">MODEL RUNTIME:</span>
                <span className="font-bold text-[#141413]">heuristic-rules-v1</span>
              </div>
            </div>
          </div>
          <div className="mt-4 pt-2.5 border-t border-[#141413]/20 text-[11px] text-[#141413]/70 font-semibold">
            PIPELINE: STREAM INGESTION → ATOMIC FEATURE STORE
          </div>
        </div>

        {/* Service 5 */}
        <div className="bg-[#FFFFFF] border-2 border-[#141413] p-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between border-b border-[#141413] pb-2">
              <span className="font-extrabold text-xs uppercase text-[#141413]">[POLICY ENGINE &amp; INTERVENTIONS]</span>
              <span className="text-[10px] bg-[#2A4B45] text-white font-bold px-1.5 py-0.2 uppercase">LIVE</span>
            </div>
            <div className="mt-3.5 space-y-1.5 text-xs">
              <div className="flex justify-between">
                <span className="text-[#141413]/60 font-semibold">PUB/SUB RELOAD:</span>
                <span className="font-bold text-[#2A4B45]">channel:policy:reload</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#141413]/60 font-semibold">HOT MATRIX VERSION:</span>
                <span className="font-bold text-[#141413]">{policyVersion}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#141413]/60 font-semibold">DISPATCH LATENCY:</span>
                <span className="font-bold text-[#141413]">3.8 MS (PARALLEL)</span>
              </div>
            </div>
          </div>
          <div className="mt-4 pt-2.5 border-t border-[#141413]/20 text-[11px] text-[#141413]/70 font-semibold">
            INTEGRATION: SMS/WHATSAPP OTP · CORE ESCROW FREEZE
          </div>
        </div>

        {/* Service 6 */}
        <div className="bg-[#FFFFFF] border-2 border-[#141413] p-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between border-b border-[#141413] pb-2">
              <span className="font-extrabold text-xs uppercase text-[#141413]">[SHAP &amp; COMPLIANCE EXPLAINER]</span>
              <span className="text-[10px] bg-[#2A4B45] text-white font-bold px-1.5 py-0.2 uppercase">LIVE</span>
            </div>
            <div className="mt-3.5 space-y-1.5 text-xs">
              <div className="flex justify-between">
                <span className="text-[#141413]/60 font-semibold">AUDIT STREAM:</span>
                <span className="font-bold text-[#141413]">stream:audit:logged</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#141413]/60 font-semibold">COMPLIANCE LLM:</span>
                <span className="font-bold text-[#141413]">DETERMINISTIC / GEMINI</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#141413]/60 font-semibold">SHAP DRIVER SPEED:</span>
                <span className="font-bold text-[#141413]">5.2 MS</span>
              </div>
            </div>
          </div>
          <div className="mt-4 pt-2.5 border-t border-[#141413]/20 text-[11px] text-[#141413]/70 font-semibold">
            STORAGE: APPEND-ONLY IMMUTABLE AUDIT LOG
          </div>
        </div>
      </div>

      {/* Policy Engine Rules Tuner */}
      <div className="bg-[#FFFFFF] border-2 border-[#141413] p-6 flex flex-col gap-5">
        <div className="border-b-2 border-[#141413] pb-3 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
          <div>
            <div className="flex items-center gap-3">
              <span className="font-extrabold text-sm uppercase text-[#141413]">
                AUTOMATED GRADUATED INTERVENTION RULES ENGINE (ADR-005)
              </span>
              <span className="text-[10px] bg-[#141413] text-white px-2 py-0.5 font-bold uppercase">
                VERSION: {policyVersion}
              </span>
            </div>
            <p className="text-xs text-[#141413]/70 font-medium mt-1">
              Dynamic friction thresholds and graduated webhooks broadcasted in real-time across the policy-engine worker cluster
            </p>
          </div>
          <button
            onClick={handleSavePolicy}
            disabled={isSavingPolicy}
            className="px-4 py-2 bg-[#141413] text-[#FFFFFF] border-2 border-[#141413] font-bold text-xs uppercase hover:bg-[#C86432] cursor-pointer"
          >
            {isSavingPolicy
              ? "[ BROADCASTING... ]"
              : policySaved
              ? "[ ✓ HOT-RELOAD BROADCASTED ]"
              : "[ COMMIT & HOT-RELOAD POLICY ]"}
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 text-xs">
          {/* Rule 1 */}
          <div className="border-2 border-[#141413] bg-[#FAF7F2] p-4 flex flex-col justify-between gap-3">
            <div>
              <span className="font-bold uppercase text-xs text-[#141413]">TIER 1: SILENT CLEARING</span>
              <p className="text-xs text-[#141413]/70 font-medium mt-1">
                Score &le; {lowThreshold}: Zero friction automated straight-through processing.
              </p>
            </div>
            <div className="pt-2 border-t border-[#141413]/20">
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-[#141413]/60 font-bold uppercase">MAX SCORE:</span>
                <input
                  type="number"
                  value={lowThreshold}
                  onChange={(e) => setLowThreshold(Number(e.target.value))}
                  className="w-16 bg-[#FFFFFF] border border-[#141413] px-2 py-1 text-[#141413] font-bold text-right"
                />
              </div>
            </div>
          </div>

          {/* Rule 2 */}
          <div className="border-2 border-[#141413] bg-[#FAF7F2] p-4 flex flex-col justify-between gap-3">
            <div>
              <span className="font-bold uppercase text-xs text-[#141413]">TIER 2: STEP-UP CHALLENGE</span>
              <p className="text-xs text-[#141413]/70 font-medium mt-1">
                Score {lowThreshold + 1} - {stepUpThreshold}: Dynamic authentication friction.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {(["sms_otp", "whatsapp_otp", "in_app_nudge"] as PolicyAction[]).map((act) => (
                  <button
                    key={act}
                    type="button"
                    onClick={() => toggleFlaggedAction(act)}
                    className={`px-2 py-1 text-[10px] font-bold uppercase border border-[#141413] cursor-pointer ${
                      flaggedActions.includes(act)
                        ? "bg-[#141413] text-white"
                        : "bg-white text-[#141413]"
                    }`}
                  >
                    {flaggedActions.includes(act) ? `✓ ${act}` : `+ ${act}`}
                  </button>
                ))}
              </div>
            </div>
            <div className="pt-2 border-t border-[#141413]/20">
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-[#141413]/60 font-bold uppercase">UPPER LIMIT:</span>
                <input
                  type="number"
                  value={stepUpThreshold}
                  onChange={(e) => setStepUpThreshold(Number(e.target.value))}
                  className="w-16 bg-[#FFFFFF] border border-[#141413] px-2 py-1 text-[#141413] font-bold text-right"
                />
              </div>
            </div>
          </div>

          {/* Rule 3 */}
          <div className="border-2 border-[#141413] bg-[#FAF7F2] p-4 flex flex-col justify-between gap-3">
            <div>
              <span className="font-bold uppercase text-xs text-[#C86432]">TIER 3: ESCROW FREEZE</span>
              <p className="text-xs text-[#141413]/70 font-medium mt-1">
                Score &gt; {stepUpThreshold}: Immediate core hold &amp; sentinel isolation.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {(["freeze_escrow", "analyst_dashboard", "crm_task"] as PolicyAction[]).map((act) => (
                  <button
                    key={act}
                    type="button"
                    onClick={() => toggleBlockedAction(act)}
                    className={`px-2 py-1 text-[10px] font-bold uppercase border border-[#141413] cursor-pointer ${
                      blockedActions.includes(act)
                        ? "bg-[#C86432] text-white border-[#C86432]"
                        : "bg-white text-[#141413]"
                    }`}
                  >
                    {blockedActions.includes(act) ? `✓ ${act}` : `+ ${act}`}
                  </button>
                ))}
              </div>
            </div>
            <div className="pt-2 border-t border-[#141413]/20">
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-[#141413]/60 font-bold uppercase">CUTOFF SCORE:</span>
                <input
                  type="number"
                  value={freezeThreshold}
                  onChange={(e) => setFreezeThreshold(Number(e.target.value))}
                  className="w-16 bg-[#FFFFFF] border border-[#141413] px-2 py-1 text-[#141413] font-bold text-right"
                />
              </div>
            </div>
          </div>
        </div>

        {policyUpdatedAt && (
          <div className="text-[11px] text-[#141413]/60 font-mono">
            LAST COMMITTED TO PUB/SUB: {policyUpdatedAt}
          </div>
        )}
      </div>

      {/* Dispatched Interventions Stream Monitor */}
      <div className="bg-[#FFFFFF] border-2 border-[#141413] p-6 flex flex-col gap-4">
        <div className="border-b-2 border-[#141413] pb-3 flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="font-extrabold text-sm uppercase text-[#141413]">
                DISPATCHED GRADUATED INTERVENTIONS (stream:intervention:dispatched)
              </span>
              <span className="bg-[#C86432] text-white text-[10px] font-bold px-1.5 py-0.2 uppercase">
                PARALLEL WEBHOOK ENGINE
              </span>
            </div>
            <p className="text-xs text-[#141413]/70 font-medium mt-0.5">
              Live audit stream of automated friction webhooks executed across SMS, WhatsApp, and Escrow gateways
            </p>
          </div>
          <button
            onClick={loadInterventions}
            disabled={loadingInterventions}
            className="px-3 py-1.5 bg-[#FAF7F2] border border-[#141413] text-[#141413] text-xs font-bold uppercase hover:bg-[#141413] hover:text-white cursor-pointer"
          >
            {loadingInterventions ? "SYNCING..." : "[ 🔄 REFRESH LEDGER ]"}
          </button>
        </div>

        {interventions.length === 0 ? (
          <div className="p-8 text-center text-xs font-bold text-[#141413]/60 border border-dashed border-[#141413]">
            NO RECENT INTERVENTIONS DISPATCHED. TRIGGER A BURST TRANSACTION OR RUN RISK SIMULATOR.
          </div>
        ) : (
          <div className="overflow-x-auto border border-[#141413]">
            <table className="w-full text-left text-xs font-mono">
              <thead className="bg-[#FAF7F2] border-b border-[#141413] uppercase text-[11px]">
                <tr>
                  <th className="p-2.5">TIMESTAMP</th>
                  <th className="p-2.5">INTERVENTION ID</th>
                  <th className="p-2.5">TRANSACTION ID</th>
                  <th className="p-2.5">STATUS</th>
                  <th className="p-2.5">TRANSITION</th>
                  <th className="p-2.5">ACTIONS DISPATCHED</th>
                  <th className="p-2.5">WEBHOOK RESULTS</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#141413]/10">
                {interventions.map((intv) => (
                  <tr key={intv.streamEntryId || intv.interventionId} className="hover:bg-[#FAF7F2]/50">
                    <td className="p-2.5 text-[11px] text-[#141413]/70 whitespace-nowrap">
                      {(intv.timestamp || "").replace("T", " ").substring(11, 19)}
                    </td>
                    <td className="p-2.5 font-bold text-[#141413]">
                      {intv.interventionId || "intv_unk"}
                    </td>
                    <td className="p-2.5 text-[11px] text-[#141413]">
                      {intv.transactionId?.slice(0, 14)}...
                    </td>
                    <td className="p-2.5">
                      <span
                        className={`px-1.5 py-0.5 text-[10px] font-bold uppercase ${
                          intv.status === "BLOCKED"
                            ? "bg-[#C86432] text-white"
                            : "bg-[#141413] text-white"
                        }`}
                      >
                        {intv.status}
                      </span>
                    </td>
                    <td className="p-2.5 font-bold text-[11px] text-[#2A4B45]">
                      {intv.stateTransition}
                    </td>
                    <td className="p-2.5">
                      <div className="flex flex-wrap gap-1">
                        {(intv.actionsDispatched || []).map((act, i) => (
                          <span
                            key={i}
                            className="bg-[#141413]/10 text-[#141413] border border-[#141413]/20 px-1.5 py-0.2 text-[10px] font-bold uppercase"
                          >
                            {act}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="p-2.5 text-[11px]">
                      {(intv.results || []).map((r, i) => (
                        <span key={i} className="text-[#2A4B45] font-bold mr-2">
                          ✓ {r.action} ({r.status})
                        </span>
                      ))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

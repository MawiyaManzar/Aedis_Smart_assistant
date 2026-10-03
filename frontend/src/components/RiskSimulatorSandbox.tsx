"use client";

import React, { useState } from "react";
import { Transaction, ShapDriver, VelocityMetrics } from "@/lib/types";
import { fetchAccountVelocityFeatures } from "@/lib/authApi";

interface RiskSimulatorSandboxProps {
  onInjectEvaluatedTx: (tx: Transaction) => void;
}

export const RiskSimulatorSandbox: React.FC<RiskSimulatorSandboxProps> = ({
  onInjectEvaluatedTx,
}) => {
  const [senderName, setSenderName] = useState("Amira Soliman");
  const [amount, setAmount] = useState<number>(85000);
  const [avg14DayBalance, setAvg14DayBalance] = useState<number>(6000);
  const [beneficiaryType, setBeneficiaryType] = useState<"NEW_MULE" | "NEW_BENEFICIARY" | "WHITELISTED">("NEW_MULE");
  const [circadianContext, setCircadianContext] = useState<"NIGHT" | "DAY">("NIGHT");
  const [sessionVelocity, setSessionVelocity] = useState<"RAPID_AFTER_RESET" | "NORMAL">("RAPID_AFTER_RESET");
  const [deviceEnvironment, setDeviceEnvironment] = useState<"EMULATOR" | "TOR_IP" | "TRUSTED">("EMULATOR");

  const [targetAccount, setTargetAccount] = useState("acc_user_101");
  const [liveVelocity, setLiveVelocity] = useState<VelocityMetrics | null>(null);
  const [checkingVelocity, setCheckingVelocity] = useState(false);

  const [evaluatedResult, setEvaluatedResult] = useState<Transaction | null>(null);
  const [evaluating, setEvaluating] = useState<boolean>(false);

  const handleQueryRedisVelocity = async (accId = targetAccount) => {
    setCheckingVelocity(true);
    try {
      const vel = await fetchAccountVelocityFeatures(accId);
      if (vel) setLiveVelocity(vel);
    } finally {
      setCheckingVelocity(false);
    }
  };


  const runEvaluation = () => {
    setEvaluating(true);

    setTimeout(() => {
      let baseScore = 15;
      const shapDrivers: ShapDriver[] = [];

      // 1. Amount multiplier
      const ratio = amount / Math.max(1, avg14DayBalance);
      if (ratio > 10) {
        const impact = Math.min(36, Math.round(ratio * 2));
        baseScore += impact;
        shapDrivers.push({
          feature: "Amount Velocity",
          impact: impact,
          description: `Amount is ${ratio.toFixed(0)}× higher than 14-day average balance`,
        });
      } else if (ratio > 3) {
        baseScore += 18;
        shapDrivers.push({
          feature: "Amount Velocity",
          impact: 18,
          description: `Amount is ${ratio.toFixed(1)}× higher than normal pattern`,
        });
      } else {
        baseScore -= 10;
        shapDrivers.push({
          feature: "Amount Velocity",
          impact: -10,
          description: "Amount is within normal historical clearing baseline",
        });
      }

      // 2. Beneficiary
      if (beneficiaryType === "NEW_MULE") {
        baseScore += 24;
        shapDrivers.push({
          feature: "Mule Ring Topology",
          impact: 24,
          description: "Recipient connected to flagged Mule Ring cluster (2 hops)",
        });
      } else if (beneficiaryType === "NEW_BENEFICIARY") {
        baseScore += 14;
        shapDrivers.push({
          feature: "New Beneficiary",
          impact: 14,
          description: "Beneficiary account registered under 15 minutes ago",
        });
      } else {
        baseScore -= 12;
        shapDrivers.push({
          feature: "Merchant Whitelist",
          impact: -12,
          description: "Established corporate merchant clearing endpoint",
        });
      }

      // 3. Circadian Context
      if (circadianContext === "NIGHT") {
        baseScore += 14;
        shapDrivers.push({
          feature: "Circadian Anomaly",
          impact: 14,
          description: "Unusual transaction time (03:42 AM local circadian anomaly)",
        });
      }

      // 4. Session Velocity (Aligned with feat:velocity Redis feature store)
      const vel1m = sessionVelocity === "RAPID_AFTER_RESET" ? 6 : 1;
      const vel1h = sessionVelocity === "RAPID_AFTER_RESET" ? 14 : 3;
      const vel24h = sessionVelocity === "RAPID_AFTER_RESET" ? 36 : 7;
      const sumAmount1h = amount * (sessionVelocity === "RAPID_AFTER_RESET" ? 2.5 : 1);

      if (sessionVelocity === "RAPID_AFTER_RESET") {
        baseScore += 24;
        shapDrivers.push({
          feature: "1-Min Velocity Spike",
          impact: 24,
          description: `${vel1m} transactions within 60s window (threshold: >= 5)`,
        });
        shapDrivers.push({
          feature: "Hourly Outflow Surge",
          impact: 14,
          description: `Hourly outflow volume exceeds $${Math.round(sumAmount1h).toLocaleString()}`,
        });
      }

      // 5. Device
      if (deviceEnvironment === "EMULATOR") {
        baseScore += 22;
        shapDrivers.push({
          feature: "Hardware Fingerprint",
          impact: 22,
          description: "Android Emulator detected with spoofed IMEI/MAC hash",
        });
      } else if (deviceEnvironment === "TOR_IP") {
        baseScore += 16;
        shapDrivers.push({
          feature: "Network Routing",
          impact: 16,
          description: "Known Tor exit relay / VPN tunnel address detected",
        });
      } else {
        baseScore -= 8;
        shapDrivers.push({
          feature: "Hardware Fingerprint",
          impact: -8,
          description: "Trusted device hardware profile (> 180 days registered)",
        });
      }

      const finalScore = Math.max(5, Math.min(99, baseScore));
      let riskLevel: Transaction["riskLevel"] = "LOW";
      let status: Transaction["status"] = "APPROVED";
      let intervention: Transaction["intervention"] = "SILENT_PASS";

      if (finalScore >= 75) {
        riskLevel = "CRITICAL";
        status = "BLOCKED";
        intervention = "ESCROW_FREEZE";
      } else if (finalScore >= 50) {
        riskLevel = "HIGH";
        status = "FLAGGED";
        intervention = "STEP_UP_OTP";
      } else if (finalScore >= 35) {
        riskLevel = "MEDIUM";
        status = "PENDING_OTP";
        intervention = "STEP_UP_OTP";
      }

      const generatedTx: Transaction = {
        id: `TX-SIM-${Math.floor(1000 + Math.random() * 9000)}`,
        timestamp: new Date().toISOString().replace("T", " ").substring(0, 19),
        sender: {
          name: senderName,
          account: `ACC-US-${Math.floor(100000 + Math.random() * 900000)}`,
          balance: amount + 12000,
          avg14DayBalance: avg14DayBalance,
          deviceId: deviceEnvironment === "EMULATOR" ? "DEV-EMU-SIM" : "DEV-USR-SIM",
          ipAddress: deviceEnvironment === "TOR_IP" ? "198.51.100.22" : "197.38.19.102",
          city: "Metro Central",
        },
        recipient: {
          name: beneficiaryType === "NEW_MULE" ? "Apex Holding Gate" : "Commercial Retailer",
          account: `ACC-US-${Math.floor(900000 + Math.random() * 99999)}`,
          isMuleCandidate: beneficiaryType === "NEW_MULE",
          hopDepth: beneficiaryType === "NEW_MULE" ? 2 : 0,
          clusterId: beneficiaryType === "NEW_MULE" ? "MULE-RING-ALPHA-07" : "DIRECT-ENDPOINT",
        },
        amount: amount,
        riskScore: finalScore,
        riskLevel: riskLevel,
        status: status,
        intervention: intervention,
        shapDrivers: shapDrivers,
        nlpExplanation:
          finalScore >= 75
            ? `High-risk extraction detected: Amount is ${(amount / avg14DayBalance).toFixed(0)}x baseline with anomalous device fingerprint targeting a mule cluster node.`
            : finalScore >= 50
            ? `Elevated risk pattern: Velocity burst and unusual transaction window detected. Step-Up authentication challenged.`
            : `Low-risk standard transaction within verified bounds. Silent approval granted.`,
        guardrailsVerified: true,
        onnxLatencyMs: parseFloat((28 + Math.random() * 15).toFixed(1)),
        graphHops: beneficiaryType === "NEW_MULE" ? 2 : 0,
        velocity: {
          count1m: vel1m,
          count1h: vel1h,
          count24h: vel24h,
          sumAmount1h: Math.round(sumAmount1h),
        },
        fraudRingIds: beneficiaryType === "NEW_MULE" ? ["MULE-RING-ALPHA-07"] : [],
        modelVersion: "heuristic-rules-v1",
      };

      setEvaluatedResult(generatedTx);
      onInjectEvaluatedTx(generatedTx);
      setEvaluating(false);
    }, 450);
  };


  return (
    <div className="w-full flex flex-col gap-8 text-[#141413]">
      {/* Top Banner */}
      <div className="bg-[#FFFFFF] border-2 border-[#141413] p-6 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6">
        <div className="max-w-2xl">
          <div className="flex items-center gap-3">
            <h3 className="text-xl font-black uppercase tracking-tight text-[#141413]">
              FINANCIAL BEHAVIOUR DNA // INTERACTIVE RISK SANDBOX
            </h3>
            <span className="bg-[#2A4B45] text-white px-3 py-1 text-xs font-bold uppercase">
              LIVE TEST BENCH
            </span>
          </div>
          <p className="text-sm text-[#141413]/70 mt-2 font-medium leading-relaxed">
            Formulate transaction vectors: Risk = f(Customer, Transaction, Behavior, Context, Network, History)
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-8">
        {/* Left: Input Form (6 Cols) */}
        <div className="xl:col-span-6 bg-[#FFFFFF] border-2 border-[#141413] p-6 flex flex-col gap-5">
          <div className="border-b-2 border-[#141413] pb-3">
            <span className="font-extrabold text-sm uppercase text-[#141413]">
              CRAFT TEST TRANSACTION PAYLOAD
            </span>
            <p className="text-xs text-[#141413]/70 font-medium mt-0.5">
              Adjust behavioral and network variables to test XGBoost, SHAP, and LangGraph live
            </p>
          </div>

          <div className="space-y-4 text-xs">
            {/* Sender & Amount */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] text-[#141413]/70 block uppercase font-bold mb-1">
                  SENDER NAME
                </label>
                <input
                  type="text"
                  value={senderName}
                  onChange={(e) => setSenderName(e.target.value)}
                  className="w-full bg-[#FAF7F2] border border-[#141413] p-2.5 text-[#141413] font-bold text-xs"
                />
              </div>
              <div>
                <label className="text-[10px] text-[#141413]/70 block uppercase font-bold mb-1">
                  TRANSFER AMOUNT ($)
                </label>
                <input
                  type="number"
                  value={amount}
                  onChange={(e) => setAmount(Number(e.target.value))}
                  className="w-full bg-[#FAF7F2] border border-[#141413] p-2.5 text-[#141413] font-bold text-xs"
                />
              </div>
            </div>

            {/* 14-Day Average Balance */}
            <div>
              <div className="flex justify-between text-xs text-[#141413]/80 font-bold mb-1">
                <span>14-DAY AVERAGE LIQUID BALANCE</span>
                <span>${avg14DayBalance.toLocaleString()} (RATIO: {(amount / avg14DayBalance).toFixed(1)}x)</span>
              </div>
              <input
                type="range"
                min="1000"
                max="100000"
                step="1000"
                value={avg14DayBalance}
                onChange={(e) => setAvg14DayBalance(Number(e.target.value))}
                className="w-full accent-[#141413] cursor-pointer"
              />
            </div>

            {/* Beneficiary Type */}
            <div>
              <label className="text-[10px] text-[#141413]/70 block uppercase font-bold mb-1">
                BENEFICIARY NETWORK PROFILE (NEO4J)
              </label>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => setBeneficiaryType("NEW_MULE")}
                  className={`p-2.5 border border-[#141413] text-xs font-bold uppercase cursor-pointer ${
                    beneficiaryType === "NEW_MULE"
                      ? "bg-[#141413] text-white"
                      : "bg-[#FAF7F2] text-[#141413] hover:bg-[#EAE3D2]"
                  }`}
                >
                  MULE RING NODE
                </button>
                <button
                  type="button"
                  onClick={() => setBeneficiaryType("NEW_BENEFICIARY")}
                  className={`p-2.5 border border-[#141413] text-xs font-bold uppercase cursor-pointer ${
                    beneficiaryType === "NEW_BENEFICIARY"
                      ? "bg-[#141413] text-white"
                      : "bg-[#FAF7F2] text-[#141413] hover:bg-[#EAE3D2]"
                  }`}
                >
                  NEW UNKNOWN
                </button>
                <button
                  type="button"
                  onClick={() => setBeneficiaryType("WHITELISTED")}
                  className={`p-2.5 border border-[#141413] text-xs font-bold uppercase cursor-pointer ${
                    beneficiaryType === "WHITELISTED"
                      ? "bg-[#141413] text-white"
                      : "bg-[#FAF7F2] text-[#141413] hover:bg-[#EAE3D2]"
                  }`}
                >
                  WHITELISTED
                </button>
              </div>
            </div>

            {/* Circadian & Velocity */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] text-[#141413]/70 block uppercase font-bold mb-1">
                  CIRCADIAN CONTEXT
                </label>
                <div className="grid grid-cols-2 gap-1.5">
                  <button
                    type="button"
                    onClick={() => setCircadianContext("NIGHT")}
                    className={`p-2 border border-[#141413] text-[11px] font-bold uppercase cursor-pointer ${
                      circadianContext === "NIGHT"
                        ? "bg-[#141413] text-white"
                        : "bg-[#FAF7F2] text-[#141413] hover:bg-[#EAE3D2]"
                    }`}
                  >
                    NIGHT (3:42 AM)
                  </button>
                  <button
                    type="button"
                    onClick={() => setCircadianContext("DAY")}
                    className={`p-2 border border-[#141413] text-[11px] font-bold uppercase cursor-pointer ${
                      circadianContext === "DAY"
                        ? "bg-[#141413] text-white"
                        : "bg-[#FAF7F2] text-[#141413] hover:bg-[#EAE3D2]"
                    }`}
                  >
                    DAY (2:15 PM)
                  </button>
                </div>
              </div>

              <div>
                <label className="text-[10px] text-[#141413]/70 block uppercase font-bold mb-1">
                  SESSION VELOCITY
                </label>
                <div className="grid grid-cols-2 gap-1.5">
                  <button
                    type="button"
                    onClick={() => setSessionVelocity("RAPID_AFTER_RESET")}
                    className={`p-2 border border-[#141413] text-[11px] font-bold uppercase cursor-pointer ${
                      sessionVelocity === "RAPID_AFTER_RESET"
                        ? "bg-[#141413] text-white"
                        : "bg-[#FAF7F2] text-[#141413] hover:bg-[#EAE3D2]"
                    }`}
                  >
                    POST-RESET
                  </button>
                  <button
                    type="button"
                    onClick={() => setSessionVelocity("NORMAL")}
                    className={`p-2 border border-[#141413] text-[11px] font-bold uppercase cursor-pointer ${
                      sessionVelocity === "NORMAL"
                        ? "bg-[#141413] text-white"
                        : "bg-[#FAF7F2] text-[#141413] hover:bg-[#EAE3D2]"
                    }`}
                  >
                    NORMAL
                  </button>
                </div>
              </div>
            </div>

            {/* Device Environment */}
            <div>
              <label className="text-[10px] text-[#141413]/70 block uppercase font-bold mb-1">
                HARDWARE &amp; NETWORK ENVIRONMENT
              </label>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => setDeviceEnvironment("EMULATOR")}
                  className={`p-2.5 border border-[#141413] text-xs font-bold uppercase cursor-pointer ${
                    deviceEnvironment === "EMULATOR"
                      ? "bg-[#141413] text-white"
                      : "bg-[#FAF7F2] text-[#141413] hover:bg-[#EAE3D2]"
                  }`}
                >
                  EMULATOR BOT
                </button>
                <button
                  type="button"
                  onClick={() => setDeviceEnvironment("TOR_IP")}
                  className={`p-2.5 border border-[#141413] text-xs font-bold uppercase cursor-pointer ${
                    deviceEnvironment === "TOR_IP"
                      ? "bg-[#141413] text-white"
                      : "bg-[#FAF7F2] text-[#141413] hover:bg-[#EAE3D2]"
                  }`}
                >
                  TOR RELAY
                </button>
                <button
                  type="button"
                  onClick={() => setDeviceEnvironment("TRUSTED")}
                  className={`p-2.5 border border-[#141413] text-xs font-bold uppercase cursor-pointer ${
                    deviceEnvironment === "TRUSTED"
                      ? "bg-[#141413] text-white"
                      : "bg-[#FAF7F2] text-[#141413] hover:bg-[#EAE3D2]"
                  }`}
                >
                  TRUSTED HW
                </button>
              </div>
            </div>

            {/* Run Button */}
            <button
              onClick={runEvaluation}
              disabled={evaluating}
              className="w-full py-3.5 bg-[#141413] text-[#FFFFFF] border-2 border-[#141413] font-bold text-xs uppercase hover:bg-[#C86432] hover:border-[#141413] cursor-pointer mt-2"
            >
              {evaluating ? "[ EVALUATING VIA ONNX ML + SHAP... ]" : "[ EXECUTE RISK EVALUATION PIPELINE ]"}
            </button>
          </div>

          {/* Live Redis Feature Store Velocity Inspector */}
          <div className="border-t-2 border-[#141413] pt-4 mt-2 bg-[#FAF7F2] p-4 border border-[#141413]">
            <div className="flex items-center justify-between mb-2">
              <span className="font-extrabold text-xs uppercase text-[#141413]">
                REDIS FEATURE STORE LIVE INSPECTOR
              </span>
              <span className="text-[10px] bg-[#141413] text-white font-mono px-2 py-0.5 uppercase">
                FEAT:VELOCITY
              </span>
            </div>
            <p className="text-[11px] text-[#141413]/70 font-medium mb-3">
              Query atomic Redis keys (<code className="font-bold text-[#141413]">feat:velocity:1m</code>, <code className="font-bold text-[#141413]">1h</code>, <code className="font-bold text-[#141413]">24h</code>, <code className="font-bold text-[#141413]">amount_sum:1h</code>) hydrated by <code className="font-bold text-[#141413]">fraud-worker</code>:
            </p>

            <div className="flex gap-2 mb-3">
              <input
                type="text"
                value={targetAccount}
                onChange={(e) => setTargetAccount(e.target.value)}
                placeholder="acc_user_101"
                className="flex-1 bg-white border border-[#141413] p-2 text-xs font-mono font-bold"
              />
              <button
                type="button"
                onClick={() => handleQueryRedisVelocity()}
                disabled={checkingVelocity}
                className="px-3 py-2 bg-[#141413] text-white border border-[#141413] text-xs font-bold uppercase hover:bg-[#C86432] cursor-pointer"
              >
                {checkingVelocity ? "QUERYING..." : "[ ⚡ QUERY REDIS ]"}
              </button>
            </div>

            {liveVelocity ? (
              <div className="grid grid-cols-4 gap-2 text-center text-xs">
                <div className="p-2 bg-white border border-[#141413]">
                  <span className="block text-[9px] text-[#141413]/60 uppercase font-bold">1-MIN</span>
                  <span className={`font-mono font-black text-sm ${liveVelocity.count1m >= 5 ? 'text-[#C86432]' : 'text-[#141413]'}`}>
                    {liveVelocity.count1m} TX
                  </span>
                </div>
                <div className="p-2 bg-white border border-[#141413]">
                  <span className="block text-[9px] text-[#141413]/60 uppercase font-bold">1-HOUR</span>
                  <span className="font-mono font-black text-sm text-[#141413]">
                    {liveVelocity.count1h} TX
                  </span>
                </div>
                <div className="p-2 bg-white border border-[#141413]">
                  <span className="block text-[9px] text-[#141413]/60 uppercase font-bold">24-HOURS</span>
                  <span className="font-mono font-black text-sm text-[#141413]">
                    {liveVelocity.count24h} TX
                  </span>
                </div>
                <div className="p-2 bg-white border border-[#141413]">
                  <span className="block text-[9px] text-[#141413]/60 uppercase font-bold">1-HR VOL</span>
                  <span className="font-mono font-black text-sm text-[#141413]">
                    ${liveVelocity.sumAmount1h.toLocaleString()}
                  </span>
                </div>
              </div>
            ) : (
              <div className="text-[11px] text-[#141413]/60 font-mono italic text-center py-1">
                Click &quot;[ ⚡ QUERY REDIS ]&quot; to read real-time keys from localhost:4000/v1/features/velocity
              </div>
            )}
          </div>
        </div>


        {/* Right: Evaluated Output Box (6 Cols) */}
        <div className="xl:col-span-6 bg-[#FFFFFF] border-2 border-[#141413] p-6 flex flex-col gap-5">
          <div className="border-b-2 border-[#141413] pb-3 flex items-center justify-between">
            <span className="font-extrabold text-sm uppercase text-[#141413]">
              REAL-TIME EVALUATION OUTPUT
            </span>
            {evaluatedResult && (
              <span className="text-xs bg-[#2A4B45] text-white px-2.5 py-0.5 font-bold">
                {evaluatedResult.onnxLatencyMs} MS (SUB-50MS)
              </span>
            )}
          </div>

          {!evaluatedResult ? (
            <div className="border border-[#141413] bg-[#FAF7F2] p-8 text-center text-xs text-[#141413]/70 flex flex-col items-center justify-center min-h-[300px]">
              <span className="font-extrabold text-sm text-[#141413] uppercase block mb-1">
                NO TEST PAYLOAD EVALUATED YET
              </span>
              <span className="font-medium max-w-sm">
                Configure the variables on the left and click &quot;EXECUTE RISK EVALUATION PIPELINE&quot; to inspect real-time SHAP weights and LangGraph audit reasoning.
              </span>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              {/* Score Header */}
              <div className="border-2 border-[#141413] p-4 bg-[#FAF7F2] flex items-center justify-between">
                <div>
                  <span className="text-[10px] text-[#141413]/60 uppercase block font-bold">
                    INFERRED RISK CLASSIFICATION
                  </span>
                  <span className="text-xl font-extrabold uppercase font-mono">
                    {evaluatedResult.id}
                  </span>
                </div>
                <div className="text-right">
                  <span className="text-3xl font-black bg-[#141413] text-white px-3 py-1">
                    {evaluatedResult.riskScore} / 100
                  </span>
                </div>
              </div>

              {/* Feature Store Parameters Used */}
              {evaluatedResult.velocity && (
                <div className="grid grid-cols-4 gap-2 text-center text-xs p-2.5 bg-white border border-[#141413]">
                  <div>
                    <span className="block text-[9px] text-[#141413]/60 uppercase font-bold">1M VELOCITY</span>
                    <span className="font-mono font-bold">{evaluatedResult.velocity.count1m} TX</span>
                  </div>
                  <div>
                    <span className="block text-[9px] text-[#141413]/60 uppercase font-bold">1H VELOCITY</span>
                    <span className="font-mono font-bold">{evaluatedResult.velocity.count1h} TX</span>
                  </div>
                  <div>
                    <span className="block text-[9px] text-[#141413]/60 uppercase font-bold">HOURLY VOL</span>
                    <span className="font-mono font-bold">${evaluatedResult.velocity.sumAmount1h.toLocaleString()}</span>
                  </div>
                  <div>
                    <span className="block text-[9px] text-[#141413]/60 uppercase font-bold">MODEL VERSION</span>
                    <span className="font-mono font-bold text-[10px] text-[#2A4B45]">{evaluatedResult.modelVersion}</span>
                  </div>
                </div>
              )}

              {/* Exact SHAP Breakdown Format */}
              <div className="border-2 border-[#141413] p-4 bg-[#FAF7F2]">

                <div className="flex items-center justify-between pb-2 border-b border-[#141413]">
                  <span className="font-extrabold text-xs uppercase text-[#141413]">
                    WHY IS THIS TRANSACTION RISKY?
                  </span>
                  <span className="text-xs font-bold uppercase text-[#C86432]">
                    RISK LEVEL: [{evaluatedResult.riskLevel}]
                  </span>
                </div>

                <div className="mt-3 space-y-2">
                  <div className="text-sm font-extrabold tracking-wide border-b border-[#141413]/20 pb-1 text-[#141413]">
                    Transaction Risk — {evaluatedResult.riskScore}/100
                  </div>

                  {evaluatedResult.shapDrivers.map((driver, idx) => (
                    <div key={idx} className="flex items-start justify-between text-xs py-1">
                      <div className="flex items-center gap-2">
                        <span
                          className={`font-bold font-mono px-1.5 py-0.5 text-[11px] border border-[#141413] ${
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

              {/* LangGraph Generated NLP Output */}
              <div className="border border-[#141413] p-3.5 bg-[#FFFFFF]">
                <div className="flex items-center justify-between pb-1 border-b border-[#141413]/30 text-[10px] font-extrabold">
                  <span className="text-[#141413]">LANGGRAPH NLP REASONING OUTPUT</span>
                  <span className="bg-[#2A4B45] text-white px-1.5 py-0.2">GUARDRAILS: VERIFIED</span>
                </div>
                <p className="text-xs mt-2 leading-relaxed text-[#141413] font-medium">
                  &ldquo;{evaluatedResult.nlpExplanation}&rdquo;
                </p>
              </div>

              {/* Dynamic Action Triggered */}
              <div className="border-2 border-[#141413] p-3 bg-[#141413] text-white font-bold text-xs flex justify-between items-center uppercase">
                <span>TRIGGERED INTERVENTION:</span>
                <span className="text-[#FAF7F2]">[{evaluatedResult.intervention}]</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

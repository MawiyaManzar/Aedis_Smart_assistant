"use client";

import React, { useState, useEffect } from "react";
import { UserRole, Transaction, BorrowerDistress, AuditRecord, GraphNode, GraphLink } from "@/lib/types";
import {
  INITIAL_TRANSACTIONS,
  INITIAL_BORROWER_DISTRESS,
  INITIAL_GRAPH_NODES,
  INITIAL_GRAPH_LINKS,
  INITIAL_AUDIT_LOGS,
} from "@/lib/mockData";
import { Sidebar } from "@/components/Sidebar";
import { TopBar } from "@/components/TopBar";
import { FraudSentinelView } from "@/components/FraudSentinelView";
import { LoanDistressView } from "@/components/LoanDistressView";
import { ExplainabilityAuditView } from "@/components/ExplainabilityAuditView";
import { SystemArchitectView } from "@/components/SystemArchitectView";
import { RiskSimulatorSandbox } from "@/components/RiskSimulatorSandbox";
import { GraduatedInterventionsModal } from "@/components/GraduatedInterventionsModal";
import { LoginGatewayGate } from "@/components/LoginGatewayGate";
import { useAuth } from "@/context/AuthContext";
import {
  pushLiveTransactionToGateway,
  fetchLatestBackendAlerts,
  resolveBackendAlert,
  convertAlertToTransaction,
} from "@/lib/authApi";

export default function Home() {
  const { user, token, tenantId, isAuthenticated, openAuthModal } = useAuth();
  const [demoBypass, setDemoBypass] = useState<boolean>(false);
  const [isBackendSyncing, setIsBackendSyncing] = useState<boolean>(false);

  const [activeRole, setActiveRole] = useState<UserRole>("SENTINEL");
  const [transactions, setTransactions] = useState<Transaction[]>(INITIAL_TRANSACTIONS);
  const [selectedTx, setSelectedTx] = useState<Transaction | null>(INITIAL_TRANSACTIONS[0]);
  const [borrowers, setBorrowers] = useState<BorrowerDistress[]>(INITIAL_BORROWER_DISTRESS);
  const [graphNodes] = useState<GraphNode[]>(INITIAL_GRAPH_NODES);
  const [graphLinks] = useState<GraphLink[]>(INITIAL_GRAPH_LINKS);
  const [auditLogs, setAuditLogs] = useState<AuditRecord[]>(INITIAL_AUDIT_LOGS);

  const [isStreaming, setIsStreaming] = useState<boolean>(true);
  const [interventionModalTx, setInterventionModalTx] = useState<Transaction | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState<boolean>(false);


  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(null);
    }, 3500);
  };

  // Real-time simulated ingestion stream
  useEffect(() => {
    if (!isStreaming) return;

    const interval = setInterval(() => {
      const isHighRisk = Math.random() > 0.65;
      const score = isHighRisk
        ? Math.floor(75 + Math.random() * 24)
        : Math.floor(8 + Math.random() * 28);
      const amount = isHighRisk
        ? Math.floor(45000 + Math.random() * 120000)
        : Math.floor(300 + Math.random() * 4500);

      const newTx: Transaction = {
        id: `TX-SEC-${Math.floor(9047 + Math.random() * 9000)}`,
        timestamp: new Date().toISOString().replace("T", " ").substring(0, 19),
        sender: {
          name: isHighRisk ? "Ziad Khedr" : "Laila Abdel-Rehim",
          account: `ACC-US-${Math.floor(100000 + Math.random() * 900000)}`,
          balance: amount + 8000,
          avg14DayBalance: isHighRisk ? 4200 : 25000,
          deviceId: isHighRisk ? "DEV-EMU-88" : "DEV-IPH-02",
          ipAddress: isHighRisk ? "197.102.88.19" : "156.200.14.99",
          city: isHighRisk ? "Metro Central" : "Coastal District",
        },
        recipient: {
          name: isHighRisk ? "Alpha Funnel Hub 09" : "Commercial Clearing Node",
          account: `ACC-US-${Math.floor(800000 + Math.random() * 199999)}`,
          isMuleCandidate: isHighRisk,
          hopDepth: isHighRisk ? 3 : 0,
          clusterId: isHighRisk ? "MULE-RING-ALPHA-07" : "CORP-CLEARING",
        },
        amount: amount,
        riskScore: score,
        riskLevel: score >= 75 ? "CRITICAL" : score >= 50 ? "HIGH" : score >= 35 ? "MEDIUM" : "LOW",
        status: score >= 75 ? "BLOCKED" : score >= 35 ? "PENDING_OTP" : "APPROVED",
        intervention:
          score >= 75 ? "ESCROW_FREEZE" : score >= 35 ? "STEP_UP_OTP" : "SILENT_PASS",
        shapDrivers: isHighRisk
          ? [
              { feature: "Amount Velocity", impact: 32, description: "Amount is 14× higher than normal" },
              { feature: "Mule Ring", impact: 22, description: "Linked to identified Mule network cluster" },
              { feature: "Device Spoofing", impact: 18, description: "Emulator environment detected" },
              { feature: "Unusual Time", impact: 11, description: "Nighttime rapid transfer window" },
            ]
          : [
              { feature: "Known Route", impact: -18, description: "Regular monthly clearing merchant" },
              { feature: "Stable Balance", impact: -14, description: "Ample liquid reserves preserved" },
            ],
        nlpExplanation: isHighRisk
          ? `High-risk mule extraction attempt. Account drained ${(amount / 4200).toFixed(0)}x average balance to flagged Alpha hub.`
          : `Standard verified commercial payment within standard historical parameters.`,
        guardrailsVerified: true,
        onnxLatencyMs: parseFloat((32 + Math.random() * 12).toFixed(1)),
        graphHops: isHighRisk ? 3 : 0,
      };

      setTransactions((prev) => [newTx, ...prev.slice(0, 19)]);
    }, 6000);

    return () => clearInterval(interval);
  }, [isStreaming]);

  // Handle transaction status mutation
  const handleUpdateTxStatus = (
    txId: string,
    newStatus: Transaction["status"],
    intervention: Transaction["intervention"]
  ) => {
    const tx = transactions.find((t) => t.id === txId);
    if (!tx) return;

    if (intervention === "STEP_UP_OTP") {
      setInterventionModalTx(tx);
      return;
    }

    setTransactions((prev) =>
      prev.map((t) => (t.id === txId ? { ...t, status: newStatus, intervention } : t))
    );

    // If backed by a Redis stream alert, commit the analyst resolution to the backend ledger
    if (tx.alertId) {
      const resolution =
        newStatus === "BLOCKED"
          ? "CONFIRM_BLOCK"
          : newStatus === "APPROVED"
          ? "OVERRIDE_APPROVE"
          : "FLAGGED";
      resolveBackendAlert(
        tx.alertId,
        resolution,
        `Analyst manual decision: ${newStatus}`,
        token || undefined
      )
        .then((res) => {
          if (res?.success) {
            showToast(`✓ REDIS RESOLUTION LOGGED: ${tx.alertId}`);
          }
        })
        .catch(() => {});
    }

    const analystId = user?.sub ? `${user.sub.toUpperCase()} (${user.roles[0] || 'RISK_ANALYST'})` : "FRAUD-SENTINEL-OFFICER";

    const newAudit: AuditRecord = {
      id: `AUDIT-SEC-${Math.floor(100 + Math.random() * 900)}`,
      txOrLoanId: txId,
      timestamp: new Date().toISOString().replace("T", " ").substring(0, 19),
      analyst: analystId,
      actionTaken:
        newStatus === "BLOCKED"
          ? "MANUAL_ESCROW_FREEZE"
          : newStatus === "APPROVED"
          ? "MANUAL_OVERRIDE_APPROVE"
          : "STATUS_UPDATE",
      previousStatus: tx.status,
      newStatus: newStatus,
      shapDigest: `SHAP [Score: ${tx.riskScore}/100, Latency: ${tx.onnxLatencyMs}ms, Tenant: ${tenantId}]`,
      nlpSummary: tx.nlpExplanation,
      guardrailsHash: `0x${Math.random().toString(16).substring(2, 6).toUpperCase()}...${Math.random().toString(16).substring(2, 6).toUpperCase()}`,
      immutableBlock: `#Block-${Math.floor(8812900 + Math.random() * 500)}`,
    };

    setAuditLogs((prev) => [newAudit, ...prev]);
    showToast(`✓ ACTION APPLIED: ${txId} → ${newStatus} [AUDIT COMMITTED: ${analystId}]`);
  };

  // Handle modal resolution
  const handleModalResolve = (
    txId: string,
    resolution: "PASSED_OTP" | "FAILED_OTP" | "FROZEN_ESCROW"
  ) => {
    const newStatus = resolution === "PASSED_OTP" ? "APPROVED" : "BLOCKED";
    const newIntervention = resolution === "PASSED_OTP" ? "SILENT_PASS" : "ESCROW_FREEZE";

    setTransactions((prev) =>
      prev.map((t) =>
        t.id === txId ? { ...t, status: newStatus, intervention: newIntervention } : t
      )
    );

    const targetTx = transactions.find((t) => t.id === txId);
    if (targetTx?.alertId) {
      resolveBackendAlert(
        targetTx.alertId,
        resolution === "PASSED_OTP" ? "OVERRIDE_APPROVE" : "CONFIRM_BLOCK",
        `Friction verification result: ${resolution}`,
        token || undefined
      ).catch(() => {});
    }

    const analystId = user?.sub ? `${user.sub.toUpperCase()} (DYNAMIC_FRICTION)` : "DYNAMIC-FRICTION-ENGINE";

    const newAudit: AuditRecord = {
      id: `AUDIT-SEC-${Math.floor(100 + Math.random() * 900)}`,
      txOrLoanId: txId,
      timestamp: new Date().toISOString().replace("T", " ").substring(0, 19),
      analyst: analystId,
      actionTaken: resolution,
      previousStatus: "PENDING_OTP",
      newStatus: newStatus,
      shapDigest: `INTERVENTION RESOLUTION: ${resolution} [Tenant: ${tenantId}]`,
      nlpSummary:
        resolution === "PASSED_OTP"
          ? "Step-up SMS OTP verified by customer. Risk baseline recalibrated."
          : "Step-up OTP failed or escrow held by sentinel protocol.",
      guardrailsHash: `0x${Math.random().toString(16).substring(2, 6).toUpperCase()}...EE99`,
      immutableBlock: `#Block-${Math.floor(8812950 + Math.random() * 200)}`,
    };

    setAuditLogs((prev) => [newAudit, ...prev]);
    showToast(`✓ DYNAMIC FRICTION COMPLETE: ${txId} → ${resolution}`);
  };

  // Sync live alerts directly from backend Redis stream:alert:created
  const handleSyncBackendAlerts = async () => {
    setIsBackendSyncing(true);
    try {
      const rawAlerts = await fetchLatestBackendAlerts(20);
      if (rawAlerts && rawAlerts.length > 0) {
        const streamTxs = rawAlerts.map(convertAlertToTransaction);
        setTransactions((prev) => {
          const existingIds = new Set(prev.map((t) => t.id));
          const newTxs = streamTxs.filter((t) => !existingIds.has(t.id));
          if (newTxs.length > 0) {
            setSelectedTx(newTxs[0]);
          }
          return [...newTxs, ...prev].slice(0, 30);
        });
        showToast(`✓ INGESTED ${rawAlerts.length} ALERTS FROM REDIS STREAM (SUB-50MS SLO)`);
      } else {
        showToast("ℹ NO NEW ALERTS IN REDIS STREAM (SYSTEM NOMINAL)");
      }
    } catch {
      showToast("⚠️ FAILED TO SYNC BACKEND REDIS ALERTS");
    } finally {
      setIsBackendSyncing(false);
    }
  };

  // Handle triggering credit playbook
  const handleTriggerPlaybook = (borrowerId: string, playbook: string) => {
    setBorrowers((prev) =>
      prev.map((b) => (b.id === borrowerId ? { ...b, status: "INTERVENED" } : b))
    );

    const b = borrowers.find((item) => item.id === borrowerId);
    const analystId = user?.sub ? `${user.sub.toUpperCase()} (CREDIT_RISK)` : "CREDIT-RISK-OFFICER";

    const newAudit: AuditRecord = {
      id: `AUDIT-SEC-${Math.floor(100 + Math.random() * 900)}`,
      txOrLoanId: borrowerId,
      timestamp: new Date().toISOString().replace("T", " ").substring(0, 19),
      analyst: analystId,
      actionTaken: "DISPATCH_RESTRUCTURING_PLAYBOOK",
      previousStatus: b?.status || "MONITORED",
      newStatus: "INTERVENED",
      shapDigest: `LIGHTGBM SCORE ${b?.distressScore}/100 [Tenant: ${tenantId}]`,
      nlpSummary: playbook,
      guardrailsHash: `0x${Math.random().toString(16).substring(2, 6).toUpperCase()}...CRED`,
      immutableBlock: `#Block-${Math.floor(8813000 + Math.random() * 100)}`,
    };

    setAuditLogs((prev) => [newAudit, ...prev]);
    showToast(`✓ CREDIT PLAYBOOK DISPATCHED: ${borrowerId}`);
  };

  // Inject manually evaluated simulated transaction
  const handleInjectEvaluatedTx = (tx: Transaction) => {
    setTransactions((prev) => [tx, ...prev.slice(0, 19)]);
    setSelectedTx(tx);
    showToast(`✓ SIMULATED PAYLOAD INJECTED: ${tx.id} [SCORE: ${tx.riskScore}/100]`);

    // Also dispatch to API Gateway ingestion stream
    pushLiveTransactionToGateway(
      {
        transactionId: tx.id,
        fromAccountId: tx.sender.account,
        toAccountId: tx.recipient.account,
        amount: tx.amount,
        currency: "USD",
        channel: "web",
        deviceId: tx.sender.deviceId,
        ipAddress: tx.sender.ipAddress,
        timestamp: new Date().toISOString(),
      },
      token || undefined,
      tenantId
    ).catch(() => {});
  };

  // Manual inject burst
  const handleTriggerMockEvent = () => {
    const burstTx: Transaction = {
      id: `TX-BURST-${Math.floor(1000 + Math.random() * 9000)}`,
      timestamp: new Date().toISOString().replace("T", " ").substring(0, 19),
      sender: {
        name: "Youssef El-Shamy (Target)",
        account: "ACC-US-998112",
        balance: 198000,
        avg14DayBalance: 8200,
        deviceId: "DEV-ROOTED-89X",
        ipAddress: "197.45.10.88",
        city: "Metro Region",
      },
      recipient: {
        name: "Alpha Mule Ring Node Delta",
        account: "ACC-US-440911",
        isMuleCandidate: true,
        hopDepth: 3,
        clusterId: "MULE-RING-ALPHA-07",
      },
      amount: 195000,
      riskScore: 97,
      riskLevel: "CRITICAL",
      status: "BLOCKED",
      intervention: "ESCROW_FREEZE",
      shapDrivers: [
        { feature: "Wipeout Velocity", impact: 42, description: "Attempted 98% balance wipeout under 4 mins" },
        { feature: "Mule Ring", impact: 28, description: "Recipient linked to identified Mule Ring (3 hops)" },
        { feature: "Device Rooting", impact: 18, description: "Rooted Android kernel signature" },
        { feature: "IP Anomaly", impact: 9, description: "Tor exit node routing" },
      ],
      nlpExplanation: "Extreme account wipeout attack. 98% of total account funds drained immediately to an identified mule cluster.",
      guardrailsVerified: true,
      onnxLatencyMs: 34.2,
      graphHops: 3,
    };

    setTransactions((prev) => [burstTx, ...prev.slice(0, 19)]);
    setSelectedTx(burstTx);
    showToast(`🚨 CRITICAL SCAM BURST INJECTED: ${burstTx.id} ISOLATED`);

    // Stream directly into Fastify backend API Gateway
    pushLiveTransactionToGateway(
      {
        transactionId: burstTx.id,
        fromAccountId: burstTx.sender.account,
        toAccountId: burstTx.recipient.account,
        amount: burstTx.amount,
        currency: "USD",
        channel: "mobile",
        deviceId: burstTx.sender.deviceId,
        ipAddress: burstTx.sender.ipAddress,
        timestamp: new Date().toISOString(),
      },
      token || undefined,
      tenantId
    ).catch(() => {});
  };

  const blockedCount = transactions.filter((t) => t.status === "BLOCKED").length;

  // If user is unauthenticated and hasn't explicitly chosen demo mode, show Gateway Login portal
  if (!isAuthenticated && !demoBypass) {
    return (
      <div className="relative min-h-screen bg-[#F5EFEB] text-[#141413] font-sans flex flex-col justify-center items-center p-4 selection:bg-[#141413] selection:text-white">
        <div
          className="fixed inset-0 pointer-events-none z-0 bg-[url('/egypt-bg.png')] bg-cover bg-fixed bg-center opacity-25"
          aria-hidden="true"
        />
        <LoginGatewayGate onBypassDemo={() => setDemoBypass(true)} />
      </div>
    );
  }

  return (
    <div className="relative min-h-screen bg-[#F5EFEB] text-[#141413] font-sans flex flex-col justify-between selection:bg-[#141413] selection:text-white">
      {/* Soft Opacity Background Backdrop Layer */}
      <div
        className="fixed inset-0 pointer-events-none z-0 bg-[url('/egypt-bg.png')] bg-cover bg-fixed bg-center opacity-25"
        aria-hidden="true"
      />

      {/* Sticky Demo Warning Banner if unauthenticated */}
      {!isAuthenticated && (
        <div className="relative z-30 bg-[#FAF7F2] border-b-2 border-[#141413] px-4 py-2 flex flex-wrap items-center justify-between gap-3 text-xs font-bold uppercase shadow-sm">
          <div className="flex items-center gap-2">
            <span className="bg-[#C86432] text-white px-2 py-0.5 text-[10px] font-black">
              READ-ONLY DEMO
            </span>
            <span className="text-[#141413]">
              Running in unauthenticated preview mode. Authenticate to connect to Fastify API Gateway &amp; Redis Streams.
            </span>
          </div>
          <button
            onClick={openAuthModal}
            className="px-3 py-1 bg-[#141413] text-white border border-[#141413] hover:bg-[#C86432] cursor-pointer"
          >
            [ 🔑 AUTHENTICATE OPERATOR ]
          </button>
        </div>
      )}

      {/* Toast Notification Banner */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 bg-[#141413] text-[#FFFFFF] border-2 border-[#141413] px-4 py-3 font-bold text-xs uppercase shadow-lg flex items-center gap-2">
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Step-up / Dynamic Friction Modal */}
      <GraduatedInterventionsModal
        transaction={interventionModalTx}
        onClose={() => setInterventionModalTx(null)}
        onResolve={handleModalResolve}
      />


      {/* Left Sidebar Navigation (Laptop & Responsive) */}
      <Sidebar
        activeRole={activeRole}
        setActiveRole={setActiveRole}
        txCount={transactions.length}
        blockedCount={blockedCount}
        isStreaming={isStreaming}
        setIsStreaming={setIsStreaming}
        triggerMockEvent={handleTriggerMockEvent}
        mobileOpen={mobileMenuOpen}
        setMobileOpen={setMobileMenuOpen}
      />

      {/* Main Content Area (With Left Offset on Lg Screens) */}
      <div className="relative z-10 lg:pl-72 flex-1 flex flex-col">
        {/* Top Context & Telemetry Bar */}
        <TopBar
          activeRole={activeRole}
          onOpenMobileMenu={() => setMobileMenuOpen(true)}
          txCount={transactions.length}
          blockedCount={blockedCount}
        />

        {/* Dynamic Role Views */}
        <main className="w-full max-w-7xl mx-auto px-4 py-6 md:px-8 flex-1 flex flex-col">
          {activeRole === "SENTINEL" && (
            <FraudSentinelView
              transactions={transactions}
              selectedTx={selectedTx}
              onSelectTx={(tx) => setSelectedTx(tx)}
              onUpdateTxStatus={handleUpdateTxStatus}
              graphNodes={graphNodes}
              graphLinks={graphLinks}
              onRefreshFromBackend={handleSyncBackendAlerts}
              isBackendSyncing={isBackendSyncing}
            />
          )}

          {activeRole === "CREDIT" && (
            <LoanDistressView
              borrowers={borrowers}
              onTriggerPlaybook={handleTriggerPlaybook}
            />
          )}

          {activeRole === "AUDITOR" && (
            <ExplainabilityAuditView auditLogs={auditLogs} />
          )}

          {activeRole === "ARCHITECT" && <SystemArchitectView />}

          {activeRole === "SIMULATOR" && (
            <RiskSimulatorSandbox onInjectEvaluatedTx={handleInjectEvaluatedTx} />
          )}
        </main>

        {/* Clean Brutalist-Minimalist Footer */}
        <footer className="w-full bg-[#FFFFFF] border-t-2 border-[#141413] text-xs select-none mt-12">
          <div className="max-w-7xl mx-auto px-4 py-5 md:px-8 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <div className="font-extrabold uppercase text-xs tracking-tight text-[#141413]">
                FINTECHSTICO &apos;26 // CONSILIUM BUSINESS CONCLAVE
              </div>
              <p className="text-[11px] text-[#141413]/70 mt-0.5">
                Organized by The Finance &amp; Economics Society (FES) · NSUT Delhi
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3 text-[11px] font-semibold">
              <span className="border border-[#141413] bg-[#FAF7F2] px-2.5 py-1 uppercase">
                FASTAPI · NEXT.JS · ONNX · NEO4J · REDIS · SHAP · LANGGRAPH
              </span>
              <span className="border border-[#141413] px-2.5 py-1 uppercase bg-[#141413] text-white">
                RISK INTELLIGENCE ARCHITECTURE
              </span>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}

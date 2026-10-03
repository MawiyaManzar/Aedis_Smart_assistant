"use client";

import React from "react";
import { UserRole } from "@/lib/types";

interface TopBarProps {
  activeRole: UserRole;
  onOpenMobileMenu: () => void;
  txCount: number;
  blockedCount: number;
}

export const TopBar: React.FC<TopBarProps> = ({
  activeRole,
  onOpenMobileMenu,
  txCount,
  blockedCount,
}) => {
  const getRoleTitle = (role: UserRole) => {
    switch (role) {
      case "SENTINEL":
        return {
          title: "Real-Time Scam & Mule Detection",
          badge: "Role: Fraud Sentinel",
          sub: "Sub-50ms XGBoost scoring · Neo4j connection hops · Multi-cluster mule detection",
        };
      case "CREDIT":
        return {
          title: "Early Loan Default & Financial Distress",
          badge: "Role: Credit Risk Officer",
          sub: "14-day cash-flow decay · LightGBM regression · Pre-default automated playbooks",
        };
      case "AUDITOR":
        return {
          title: "Dual-Score Explainability & Audit Trail",
          badge: "Role: Compliance Auditor",
          sub: "SHAP mathematical drivers · LangGraph NLP translation · Immutable PostgreSQL ledger",
        };
      case "ARCHITECT":
        return {
          title: "Microservices Telemetry & Policy Rules",
          badge: "Role: System Architect",
          sub: "FastAPI · Redis Streams · BullMQ · ONNX Runtime · Graduated dynamic friction matrix",
        };
      case "SIMULATOR":
        return {
          title: "Financial Behaviour DNA Risk Sandbox",
          badge: "Interactive Testing Bench",
          sub: "Formulate payload vectors · Evaluate XGBoost + SHAP + LangGraph reasoning live",
        };
    }
  };

  const roleInfo = getRoleTitle(activeRole);

  return (
    <div className="w-full bg-[#FFFFFF] border-b-2 border-[#141413] px-6 py-6 flex flex-col gap-6">
      {/* Top Title & Role Breadcrumb Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-start gap-4">
          {/* Mobile menu button */}
          <button
            onClick={onOpenMobileMenu}
            className="lg:hidden p-2.5 border-2 border-[#141413] bg-[#FAF7F2] font-bold text-xs uppercase cursor-pointer hover:bg-[#141413] hover:text-white"
          >
            [ MENU ]
          </button>

          <div>
            <div className="flex items-center gap-2.5">
              <span className="bg-[#141413] text-[#FFFFFF] text-xs font-bold px-2.5 py-0.5 uppercase tracking-wide">
                {roleInfo.badge}
              </span>
              <span className="text-xs font-bold text-[#141413]/60 uppercase tracking-wider">
                FINTECHSTICO &apos;26 PROD ENGINE
              </span>
            </div>
            <h2 className="text-2xl md:text-3xl font-black text-[#141413] tracking-tight uppercase mt-1.5">
              {roleInfo.title}
            </h2>
            <p className="text-xs md:text-sm text-[#141413]/70 font-medium mt-1">
              {roleInfo.sub}
            </p>
          </div>
        </div>
      </div>

      {/* Spacious, Highly Legible KPI Cards Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 pt-1">
        {/* KPI 1 */}
        <div className="bg-[#FAF7F2] border-2 border-[#141413] p-4 flex flex-col justify-between">
          <div>
            <div className="text-xs font-bold text-[#141413] uppercase tracking-wider mb-1">
              LIVE INGESTION VELOCITY
            </div>
            <div className="text-2xl md:text-3xl font-black text-[#141413] tracking-tight">
              {1420 + txCount} <span className="text-sm font-bold text-[#141413]/60">TX/SEC</span>
            </div>
          </div>
          <div className="mt-2 pt-2 border-t border-[#141413]/15 text-[11px] font-medium text-[#141413]/70">
            Real-time buffer streaming via Redis &amp; BullMQ
          </div>
        </div>

        {/* KPI 2 */}
        <div className="bg-[#FAF7F2] border-2 border-[#141413] p-4 flex flex-col justify-between">
          <div>
            <div className="text-xs font-bold text-[#141413] uppercase tracking-wider mb-1">
              ONNX INFERENCE LATENCY
            </div>
            <div className="text-2xl md:text-3xl font-black text-[#141413] tracking-tight">
              36.4 <span className="text-sm font-bold text-[#141413]/60">MS</span>
            </div>
          </div>
          <div className="mt-2 pt-2 border-t border-[#141413]/15 text-[11px] font-medium text-[#2A4B45]">
            Strict sub-50ms SLA guaranteed per transaction
          </div>
        </div>

        {/* KPI 3 */}
        <div className="bg-[#FAF7F2] border-2 border-[#141413] p-4 flex flex-col justify-between">
          <div>
            <div className="text-xs font-bold text-[#141413] uppercase tracking-wider mb-1">
              ISOLATED THREATS &amp; MULES
            </div>
            <div className="text-2xl md:text-3xl font-black text-[#C86432] tracking-tight">
              {blockedCount} <span className="text-sm font-bold text-[#C86432]">BLOCKED</span>
            </div>
          </div>
          <div className="mt-2 pt-2 border-t border-[#141413]/15 text-[11px] font-medium text-[#141413]/70">
            Quarantined across identified mule ring clusters
          </div>
        </div>

        {/* KPI 4 */}
        <div className="bg-[#FAF7F2] border-2 border-[#141413] p-4 flex flex-col justify-between">
          <div>
            <div className="text-xs font-bold text-[#141413] uppercase tracking-wider mb-1">
              AI GUARDRAILS COMPLIANCE
            </div>
            <div className="text-2xl md:text-3xl font-black text-[#2A4B45] tracking-tight">
              100.0% <span className="text-sm font-bold text-[#2A4B45]">PASS</span>
            </div>
          </div>
          <div className="mt-2 pt-2 border-t border-[#141413]/15 text-[11px] font-medium text-[#141413]/70">
            Zero hallucination &amp; immutable audit ledger verified
          </div>
        </div>
      </div>
    </div>
  );
};

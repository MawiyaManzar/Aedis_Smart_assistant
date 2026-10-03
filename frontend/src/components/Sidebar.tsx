"use client";

import React from "react";
import { UserRole } from "@/lib/types";
import { useAuth } from "@/context/AuthContext";

interface SidebarProps {
  activeRole: UserRole;
  setActiveRole: (role: UserRole) => void;
  txCount: number;
  blockedCount: number;
  isStreaming: boolean;
  setIsStreaming: (val: boolean) => void;
  triggerMockEvent: () => void;
  mobileOpen: boolean;
  setMobileOpen: (open: boolean) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeRole,
  setActiveRole,
  txCount,
  blockedCount,
  isStreaming,
  setIsStreaming,
  triggerMockEvent,
  mobileOpen,
  setMobileOpen,
}) => {
  const { user, isAuthenticated, currentTenant, openAuthModal, gatewayStatus } =
    useAuth();

  const navItems: Array<{ id: UserRole; num: string; label: string; sub: string }> = [
    {
      id: "SENTINEL",
      num: "01",
      label: "Fraud & Mule Sentinel",
      sub: "Real-time scam detection & Neo4j",
    },
    {
      id: "CREDIT",
      num: "02",
      label: "Loan Default Distress",
      sub: "Early cash-flow warning & playbooks",
    },
    {
      id: "AUDITOR",
      num: "03",
      label: "Dual-Score Explainability",
      sub: "SHAP drivers & LangGraph audit",
    },
    {
      id: "ARCHITECT",
      num: "04",
      label: "Microservices Telemetry",
      sub: "Redis BullMQ & ONNX pipeline",
    },
    {
      id: "SIMULATOR",
      num: "05",
      label: "Risk DNA Simulator",
      sub: "Interactive formula sandbox",
    },
  ];

  return (
    <>
      {/* Mobile Backdrop */}
      {mobileOpen && (
        <div
          onClick={() => setMobileOpen(false)}
          className="fixed inset-0 z-40 bg-[#141413]/70 lg:hidden"
        />
      )}

      {/* Main Left Sidebar */}
      <aside
        className={`fixed top-0 bottom-0 left-0 z-50 w-72 bg-[#FAF7F2] border-r-2 border-[#141413] flex flex-col justify-between transition-transform duration-150 ease-in-out lg:translate-x-0 ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex flex-col">
          {/* Conclave Header */}
          <div className="p-5 border-b-2 border-[#141413] bg-[#F5EFEB]">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <span className="bg-[#141413] text-[#FFFFFF] px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wider">
                  FES NSUT
                </span>
                <span className="text-[11px] font-bold tracking-tight text-[#141413] uppercase">
                  CONSILIUM &apos;26
                </span>
              </div>
              <button
                onClick={() => setMobileOpen(false)}
                className="lg:hidden p-1 border border-[#141413] text-xs font-bold"
              >
                ✕
              </button>
            </div>

            <div className="mt-3">
              <h1 className="text-xl font-extrabold tracking-tight text-[#141413] uppercase">
                FINTECHSTICO
              </h1>
              <p className="text-[11px] font-medium text-[#141413]/70 mt-0.5">
                Risk &amp; Fraud Intelligence Platform
              </p>
            </div>
          </div>

          {/* Navigation Section */}
          <div className="p-3">
            <div className="text-[10px] font-bold text-[#141413]/50 uppercase tracking-wider px-3 py-2">
              SYSTEM ROLES &amp; INTERFACES
            </div>

            <nav className="space-y-1">
              {navItems.map((item) => {
                const isActive = activeRole === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => {
                      setActiveRole(item.id);
                      setMobileOpen(false);
                    }}
                    className={`w-full text-left p-3 border-2 transition-none cursor-pointer flex flex-col gap-0.5 ${
                      isActive
                        ? "bg-[#141413] text-[#FFFFFF] border-[#141413]"
                        : "bg-transparent text-[#141413] border-transparent hover:border-[#141413] hover:bg-[#F5EFEB]"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold tracking-tight uppercase">
                        {item.num} · {item.label}
                      </span>
                      {isActive && (
                        <span className="text-[9px] bg-[#C86432] text-white px-1.5 py-0.2 font-bold uppercase">
                          ACTIVE
                        </span>
                      )}
                    </div>
                    <span
                      className={`text-[11px] font-medium ${
                        isActive ? "text-[#FAF7F2]/80" : "text-[#141413]/60"
                      }`}
                    >
                      {item.sub}
                    </span>
                  </button>
                );
              })}
            </nav>
          </div>
        </div>

        {/* Sidebar Footer Controls & Quick Telemetry */}
        <div className="p-4 border-t-2 border-[#141413] bg-[#F5EFEB] space-y-3">
          {/* Operator Gateway Auth Card */}
          <div className="p-2.5 bg-[#FFFFFF] border-2 border-[#141413]">
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-1.5">
                <span
                  className={`w-2 h-2 ${
                    gatewayStatus === 'ONLINE' ? 'bg-[#2A4B45]' : 'bg-[#C86432]'
                  }`}
                />
                <span className="text-[10px] font-bold uppercase tracking-wider text-[#141413]/70">
                  {isAuthenticated ? 'OPERATOR ACTIVE' : 'GATEWAY STANDBY'}
                </span>
              </div>
              <button
                onClick={openAuthModal}
                className="text-[10px] font-bold uppercase underline hover:text-[#C86432] cursor-pointer"
              >
                {isAuthenticated ? '[MANAGE]' : '[LOGIN]'}
              </button>
            </div>

            {isAuthenticated && user ? (
              <div className="space-y-0.5">
                <div className="font-black text-xs uppercase text-[#141413] truncate">
                  {user.sub}
                </div>
                <div className="text-[10px] font-mono text-[#141413]/70 truncate">
                  {currentTenant.name}
                </div>
              </div>
            ) : (
              <button
                onClick={openAuthModal}
                className="w-full mt-1 py-1 px-2 text-[10px] font-bold uppercase bg-[#C86432] text-white border border-[#141413] hover:bg-[#141413] cursor-pointer"
              >
                [ CONNECT GATEWAY ]
              </button>
            )}
          </div>

          {/* Quick Metrics */}
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="p-2 bg-[#FFFFFF] border border-[#141413]">
              <span className="text-[10px] text-[#141413]/60 uppercase block font-semibold">
                INGESTION
              </span>
              <span className="font-extrabold text-sm">{1420 + txCount} TX/S</span>
            </div>
            <div className="p-2 bg-[#FFFFFF] border border-[#141413]">
              <span className="text-[10px] text-[#141413]/60 uppercase block font-semibold">
                ISOLATED
              </span>
              <span className="font-extrabold text-sm text-[#C86432]">
                {blockedCount} BLOCKED
              </span>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="space-y-1.5">
            <button
              onClick={() => setIsStreaming(!isStreaming)}
              className={`w-full py-2 px-3 border-2 border-[#141413] font-bold text-xs uppercase cursor-pointer text-center ${
                isStreaming
                  ? "bg-[#141413] text-[#FFFFFF]"
                  : "bg-[#FFFFFF] text-[#141413] hover:bg-[#141413] hover:text-[#FFFFFF]"
              }`}
            >
              {isStreaming ? "[ LIVE STREAM: ACTIVE ]" : "[ LIVE STREAM: PAUSED ]"}
            </button>

            <button
              onClick={triggerMockEvent}
              className="w-full py-2 px-3 bg-[#C86432] text-[#FFFFFF] border-2 border-[#141413] font-bold text-xs uppercase hover:bg-[#141413] cursor-pointer text-center"
            >
              [ + INJECT SCAM BURST ]
            </button>
          </div>

          <div className="pt-2 border-t border-[#141413]/20 flex items-center justify-between text-[10px] text-[#141413]/70 font-semibold">
            <span>PIPELINE SLA: &lt; 50MS</span>
            <span className="font-bold text-[#2A4B45]">AUDIT VERIFIED: OK</span>
          </div>
        </div>
      </aside>
    </>
  );
};

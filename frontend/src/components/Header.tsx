"use client";

import React from "react";
import { UserRole } from "@/lib/types";

interface HeaderProps {
  activeRole: UserRole;
  setActiveRole: (role: UserRole) => void;
  txCount: number;
  blockedCount: number;
  isStreaming: boolean;
  setIsStreaming: (val: boolean) => void;
  triggerMockEvent: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  activeRole,
  setActiveRole,
  txCount,
  blockedCount,
  isStreaming,
  setIsStreaming,
  triggerMockEvent,
}) => {
  return (
    <header className="w-full bg-[#FFFFFF] text-[#141413] border-b-2 border-[#141413] select-none">
      <div className="w-full bg-[#FAF7F2] text-[#141413] px-4 py-2 flex flex-wrap items-center justify-between font-bold text-xs uppercase tracking-wider border-b-2 border-[#141413]">
        <div className="flex items-center space-x-3">
          <span className="bg-[#141413] text-white px-2 py-0.5 text-[10px] font-bold">FES NSUT</span>
          <span className="text-xs tracking-wider font-extrabold">CONSILIUM &apos;26 — BUSINESS CONCLAVE</span>
        </div>
        <div className="flex items-center space-x-4 text-[11px]">
          <span>[3-4-5 OCTOBER &apos;26]</span>
          <span className="border-l border-[#141413] pl-3 font-mono font-bold">PRIZES: RS. 1,50,000</span>
        </div>
      </div>

      <div className="px-6 py-4 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black uppercase tracking-tight text-[#141413]">
            FINTECHSTICO &apos;26
          </h1>
          <p className="text-xs text-[#141413]/70 font-medium mt-0.5">
            HYPER-SCALE RISK ENGINE · REAL-TIME MULE DETECTION · DUAL-SCORE SHAP AUDIT
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs">
          <button
            onClick={() => setIsStreaming(!isStreaming)}
            className={`px-3 py-1.5 font-bold uppercase border-2 border-[#141413] ${
              isStreaming ? "bg-[#141413] text-white" : "bg-white text-[#141413]"
            }`}
          >
            {isStreaming ? "[ STREAM: ACTIVE ]" : "[ STREAM: PAUSED ]"}
          </button>

          <button
            onClick={triggerMockEvent}
            className="px-3 py-1.5 bg-[#C86432] text-white border-2 border-[#141413] font-bold uppercase hover:bg-[#141413] cursor-pointer"
          >
            [+ INJECT SCAM BURST]
          </button>
        </div>
      </div>
    </header>
  );
};

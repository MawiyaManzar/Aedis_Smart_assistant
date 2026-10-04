"use client";

import React, { useState } from "react";
import { BorrowerDistress } from "@/lib/types";
import { ExplanationPanel } from "./ExplanationPanel";
import { buildLoanFacts } from "@/lib/explain/facts";

interface LoanDistressViewProps {
  borrowers: BorrowerDistress[];
  onTriggerPlaybook: (borrowerId: string, playbook: string) => void;
}

export const LoanDistressView: React.FC<LoanDistressViewProps> = ({
  borrowers,
  onTriggerPlaybook,
}) => {
  const [selectedBorrowerId, setSelectedBorrowerId] = useState<string>(borrowers[0].id);
  const selectedBorrower = borrowers.find((b) => b.id === selectedBorrowerId) || borrowers[0];

  return (
    <div className="w-full flex flex-col gap-8 text-[#141413]">
      {/* Top Header Card */}
      <div className="bg-[#FFFFFF] border-2 border-[#141413] p-6 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6">
        <div className="max-w-2xl">
          <div className="flex items-center gap-3">
            <h3 className="text-xl font-black uppercase tracking-tight text-[#141413]">
              CREDIT RISK OFFICER // EARLY LOAN DEFAULT &amp; CASH FLOW DISTRESS
            </h3>
            <span className="bg-[#2A4B45] text-white px-3 py-1 text-xs font-bold uppercase">
              BATCH EVALUATION
            </span>
          </div>
          <p className="text-sm text-[#141413]/70 mt-2 font-medium leading-relaxed">
            Daily background cash-flow monitoring scans 14-day average monthly balances, sudden ATM extraction velocities, and secondary high-cost debt inquiries to forecast default weeks before the deadline.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-4 w-full lg:w-auto">
          <div className="bg-[#FAF7F2] border-2 border-[#141413] p-4 text-center min-w-[150px]">
            <span className="block text-xs text-[#141413]/70 uppercase font-bold tracking-wider mb-1">
              MONITORED PORTFOLIO
            </span>
            <span className="text-2xl font-black text-[#141413]">
              $1.22M
            </span>
            <span className="block text-[10px] text-[#141413]/70 font-semibold mt-1">
              Active Loan Principal
            </span>
          </div>

          <div className="bg-[#FAF7F2] border-2 border-[#141413] p-4 text-center min-w-[150px]">
            <span className="block text-xs text-[#141413]/70 uppercase font-bold tracking-wider mb-1">
              DANGER CUTOFF
            </span>
            <span className="text-2xl font-black text-[#C86432]">
              &gt; 65 <span className="text-xs font-bold">SCORE</span>
            </span>
            <span className="block text-[10px] text-[#C86432] font-semibold mt-1">
              Triggers Pre-Default Outreach
            </span>
          </div>
        </div>
      </div>

      {/* Grid Layout */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-8">
        {/* Left: Borrower Distress Register (7 Cols) */}
        <div className="xl:col-span-7 flex flex-col gap-8">
          <div className="bg-[#FFFFFF] border-2 border-[#141413] p-6">
            <div className="flex items-center justify-between pb-4 border-b-2 border-[#141413]">
              <div>
                <h4 className="font-black text-base uppercase text-[#141413] tracking-tight">
                  PRE-DEFAULT CREDIT REGISTER
                </h4>
                <p className="text-xs text-[#141413]/60 font-semibold mt-0.5">
                  Calculated daily via LightGBM regression &amp; Redis Feature Store
                </p>
              </div>
            </div>

            <div className="overflow-x-auto mt-4">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b-2 border-[#141413] text-xs text-[#141413]/70 uppercase font-bold">
                    <th className="py-3 px-3">BORROWER / LOAN</th>
                    <th className="py-3 px-3">MONTHLY EMI</th>
                    <th className="py-3 px-3">14-DAY CASH DROP</th>
                    <th className="py-3 px-3">ATM SPIKE</th>
                    <th className="py-3 px-3">DISTRESS SCORE</th>
                    <th className="py-3 px-3">STATE</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#141413]/20">
                  {borrowers.map((b) => {
                    const isSelected = b.id === selectedBorrower.id;
                    return (
                      <tr
                        key={b.id}
                        onClick={() => setSelectedBorrowerId(b.id)}
                        className={`cursor-pointer transition-none ${
                          isSelected
                            ? "bg-[#141413] text-[#FFFFFF] font-bold"
                            : "hover:bg-[#FAF7F2] text-[#141413]"
                        }`}
                      >
                        <td className="py-3.5 px-3">
                          <div className="font-bold text-xs">{b.borrowerName}</div>
                          <div className={`text-[11px] font-mono ${isSelected ? "text-white/70" : "text-[#141413]/60"}`}>
                            {b.loanId}
                          </div>
                        </td>
                        <td className="py-3.5 px-3 whitespace-nowrap text-xs">
                          ${b.monthlyEmi.toLocaleString()}
                          <span className="block text-[10px] opacity-75">Due {b.nextEmiDate}</span>
                        </td>
                        <td className="py-3.5 px-3 whitespace-nowrap font-bold text-xs text-[#C86432]">
                          -{b.cashReservesDropPct}%
                        </td>
                        <td className="py-3.5 px-3 whitespace-nowrap text-xs font-semibold">
                          {b.atmWithdrawalMultiplier}x
                        </td>
                        <td className="py-3.5 px-3 whitespace-nowrap">
                          <span
                            className={`px-2.5 py-1 border text-xs font-bold ${
                              isSelected
                                ? "bg-[#FFFFFF] text-[#141413] border-white"
                                : b.distressScore >= 70
                                ? "bg-[#C86432] text-white border-[#141413]"
                                : "bg-[#FAF7F2] text-[#141413] border-[#141413]"
                            }`}
                          >
                            {b.distressScore}/100
                          </span>
                        </td>
                        <td className="py-3.5 px-3 whitespace-nowrap">
                          <span
                            className={`text-xs border px-2 py-0.5 font-bold uppercase ${
                              isSelected
                                ? "border-white bg-transparent text-white"
                                : "border-[#141413] bg-[#FAF7F2] text-[#141413]"
                            }`}
                          >
                            {b.status}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* 14-Day Cash Flow Depletion Chart */}
          <div className="bg-[#FFFFFF] border-2 border-[#141413] p-6 flex flex-col gap-4">
            <div className="flex items-center justify-between pb-3 border-b border-[#141413]">
              <div>
                <h5 className="font-extrabold text-sm uppercase text-[#141413] tracking-wide">
                  14-DAY CASH RESERVE DECAY &amp; WITHDRAWAL ACCELERATION
                </h5>
                <p className="text-xs text-[#141413]/60 font-semibold mt-0.5">
                  Visualizing rapid balance liquidation before scheduled EMI date
                </p>
              </div>
              <span className="text-xs font-bold text-[#C86432] bg-[#FAF7F2] border border-[#141413] px-2.5 py-1">
                BORROWER: {selectedBorrower.borrowerName}
              </span>
            </div>

            <div className="w-full bg-[#FAF7F2] border-2 border-[#141413] p-5">
              <div className="flex justify-between text-xs text-[#141413]/70 font-bold mb-3">
                <span>LIQUID BALANCE ($ USD)</span>
                <span>ATM EXTRACTION ACCELERATION</span>
              </div>

              {/* Bar & Curve Graph */}
              <div className="grid grid-cols-6 gap-4 h-48 items-end pt-4 border-b-2 border-l-2 border-[#141413] px-4">
                {selectedBorrower.cashFlowHistory.map((pt, idx) => {
                  const maxBal = 350000;
                  const heightPct = Math.min(100, Math.max(15, (pt.balance / maxBal) * 100));
                  return (
                    <div key={idx} className="flex flex-col items-center h-full justify-end">
                      <div className="text-[11px] mb-1 font-bold text-[#141413]">
                        ${Math.round(pt.balance / 1000)}k
                      </div>
                      <div
                        className="w-full bg-[#141413] hover:bg-[#C86432] transition-none border border-[#141413]"
                        style={{ height: `${heightPct}%` }}
                      />
                      <span className="text-xs mt-2 font-bold text-[#141413]/80">{pt.day}</span>
                    </div>
                  );
                })}
              </div>
              <div className="text-xs text-[#141413]/80 mt-4 flex justify-between font-semibold">
                <span>■ SOLID BARS: Daily Available Bank Balance</span>
                <span className="font-bold text-[#C86432]">RESERVE DEPLETION: -{selectedBorrower.cashReservesDropPct}%</span>
              </div>
            </div>
          </div>
        </div>

        {/* Right: Dual-Score Credit SHAP Explainability & Playbook Intervention (5 Cols) */}
        <div className="xl:col-span-5 flex flex-col gap-8">
          <div className="bg-[#FFFFFF] border-2 border-[#141413] p-6 flex flex-col gap-5">
            <div className="border-b-2 border-[#141413] pb-4 flex items-center justify-between">
              <div>
                <span className="text-xs text-[#141413]/60 block uppercase font-bold tracking-wider">
                  CREDIT DISTRESS DOSSIER
                </span>
                <span className="text-2xl font-black uppercase font-mono text-[#141413] mt-0.5 block">
                  {selectedBorrower.loanId}
                </span>
              </div>
              <div className="text-right">
                <span className="text-xs text-[#141413]/60 block uppercase font-bold tracking-wider">
                  LIGHTGBM SCORE
                </span>
                <span className="text-3xl font-black bg-[#141413] text-white px-3 py-1 mt-0.5 inline-block">
                  {selectedBorrower.distressScore} / 100
                </span>
              </div>
            </div>

            {/* Feature 3 Format Requirement */}
            <div className="border-2 border-[#141413] p-5 bg-[#FAF7F2]">
              <div className="flex items-center justify-between pb-3 border-b border-[#141413]">
                <h5 className="font-black text-xs uppercase text-[#141413] tracking-wide">
                  WHY IS THIS BORROWER AT RISK?
                </h5>
                <span className="text-xs font-bold uppercase text-[#2A4B45] bg-[#FFFFFF] border border-[#141413] px-2 py-0.5">
                  CONFIDENCE: {(selectedBorrower.lightGbmConfidence * 100).toFixed(0)}%
                </span>
              </div>

              <div className="mt-3.5 space-y-2.5">
                <div className="text-base font-black tracking-wide border-b border-[#141413]/20 pb-1.5 text-[#141413]">
                  Default Risk — {selectedBorrower.distressScore}/100
                </div>

                {selectedBorrower.shapDrivers.map((driver, idx) => (
                  <div key={idx} className="flex items-start justify-between text-xs py-1">
                    <div className="flex items-center gap-2.5">
                      <span className="font-bold font-mono bg-[#141413] text-[#FFFFFF] px-2 py-0.5 text-xs border border-[#141413]">
                        {driver.impact > 0 ? `+${driver.impact}` : driver.impact}
                      </span>
                      <span className="font-medium text-[#141413] leading-snug">{driver.description}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Plain-English explanation of the values above (numbers stay visible) */}
            <ExplanationPanel facts={buildLoanFacts(selectedBorrower)} />

            {/* Natural Language Explanation Box */}
            <div className="border-2 border-[#141413] p-4 bg-[#FFFFFF]">
              <div className="flex items-center justify-between pb-2 border-b border-[#141413]/20">
                <span className="text-xs font-bold uppercase text-[#141413] tracking-wider">
                  REGULATOR AUDIT SENTENCE (LLM VIA SHAP DRIVERS)
                </span>
                <span className="text-[10px] bg-[#2A4B45] text-white font-bold px-2 py-0.5 uppercase">
                  ARTICLE-22 COMPLIANT
                </span>
              </div>
              <p className="text-xs md:text-sm mt-2.5 leading-relaxed text-[#141413] font-medium">
                &ldquo;{selectedBorrower.nlpExplanation}&rdquo;
              </p>
            </div>

            {/* Automated Graduated Playbooks */}
            <div className="border-t-2 border-[#141413] pt-4 flex flex-col gap-2.5">
              <span className="text-xs text-[#141413]/60 block uppercase font-bold tracking-wider">
                AUTOMATED GRADUATED PLAYBOOK DISPATCHER:
              </span>
              <p className="text-xs text-[#141413]/80 font-medium mb-1">
                Target: {selectedBorrower.recommendedAction}
              </p>

              <button
                onClick={() =>
                  onTriggerPlaybook(
                    selectedBorrower.id,
                    "PLAYBOOK #1: Soft payment reminder & split schedule via WhatsApp"
                  )
                }
                className="px-3 py-2.5 bg-[#FAF7F2] text-[#141413] border-2 border-[#141413] font-bold text-xs uppercase hover:bg-[#141413] hover:text-white cursor-pointer text-left"
              >
                [1. SOFT REMINDER &amp; SPLIT-PAY SCHEDULE (WHATSAPP)]
              </button>

              <button
                onClick={() =>
                  onTriggerPlaybook(
                    selectedBorrower.id,
                    "PLAYBOOK #2: 3-Month interest-only moratorium offer"
                  )
                }
                className="px-3 py-2.5 bg-[#C86432] text-white border-2 border-[#141413] font-bold text-xs uppercase hover:bg-[#141413] cursor-pointer text-left"
              >
                [2. 3-MONTH MORATORIUM RESTRUCTURING OFFER]
              </button>

              <button
                onClick={() =>
                  onTriggerPlaybook(
                    selectedBorrower.id,
                    "PLAYBOOK #3: Officer phone consultation & emergency refinancing"
                  )
                }
                className="px-3 py-2.5 bg-[#141413] text-white border-2 border-[#141413] font-bold text-xs uppercase hover:bg-[#FAF7F2] hover:text-[#141413] cursor-pointer text-left"
              >
                [3. CREDIT OFFICER EMERGENCY CONSULTATION]
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

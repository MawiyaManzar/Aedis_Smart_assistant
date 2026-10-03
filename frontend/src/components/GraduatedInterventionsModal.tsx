"use client";

import React, { useState } from "react";
import { Transaction } from "@/lib/types";

interface GraduatedInterventionsModalProps {
  transaction: Transaction | null;
  onClose: () => void;
  onResolve: (txId: string, resolution: "PASSED_OTP" | "FAILED_OTP" | "FROZEN_ESCROW") => void;
}

export const GraduatedInterventionsModal: React.FC<GraduatedInterventionsModalProps> = ({
  transaction,
  onClose,
  onResolve,
}) => {
  const [otpCode, setOtpCode] = useState("");
  const [step, setStep] = useState<"INPUT" | "SUCCESS" | "FAILED">("INPUT");

  if (!transaction) return null;

  const handleVerifyOtp = () => {
    if (otpCode === "8842" || otpCode.length === 4) {
      setStep("SUCCESS");
      setTimeout(() => {
        onResolve(transaction.id, "PASSED_OTP");
        onClose();
      }, 1500);
    } else {
      setStep("FAILED");
    }
  };

  const handleFreezeEscrow = () => {
    onResolve(transaction.id, "FROZEN_ESCROW");
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-[#141413]/80 flex items-center justify-center p-4">
      <div className="w-full max-w-lg bg-[#FFFFFF] border-2 border-[#141413] p-6 flex flex-col gap-4 text-[#141413]">
        <div className="flex items-center justify-between border-b-2 border-[#141413] pb-3">
          <div>
            <span className="text-[10px] text-[#141413]/60 block uppercase font-bold">
              DYNAMIC FRICTION CHALLENGE
            </span>
            <span className="text-lg font-extrabold uppercase font-mono">
              INTERVENTION: {transaction.id}
            </span>
          </div>
          <button
            onClick={onClose}
            className="px-2.5 py-1 bg-[#FAF7F2] text-[#141413] border border-[#141413] font-bold hover:bg-[#141413] hover:text-white cursor-pointer text-xs"
          >
            ✕
          </button>
        </div>

        <div className="border border-[#141413] p-3.5 bg-[#FAF7F2] text-xs space-y-1.5 font-medium">
          <div className="flex justify-between">
            <span className="text-[#141413]/60">PAYLOAD AMOUNT:</span>
            <span className="font-bold">${transaction.amount.toLocaleString()}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-[#141413]/60">SENDER:</span>
            <span className="font-bold">{transaction.sender.name} ({transaction.sender.account})</span>
          </div>
          <div className="flex justify-between">
            <span className="text-[#141413]/60">XGBOOST RISK SCORE:</span>
            <span className="font-bold bg-[#141413] text-white px-1.5 py-0.2">{transaction.riskScore}/100</span>
          </div>
        </div>

        {step === "INPUT" && (
          <div className="space-y-4">
            <div className="border-2 border-[#141413] p-4 bg-[#FAF7F2]">
              <span className="font-extrabold text-xs uppercase block mb-1 text-[#141413]">
                STEP-UP OTP CHALLENGE SIMULATOR
              </span>
              <p className="text-xs text-[#141413]/80 font-medium mb-3">
                SMS / WhatsApp challenge dispatched to verified user terminal. Enter 4-digit code (e.g. 8842) to simulate user verification.
              </p>
              <div className="flex gap-2">
                <input
                  type="text"
                  maxLength={4}
                  placeholder="8842"
                  value={otpCode}
                  onChange={(e) => setOtpCode(e.target.value)}
                  className="bg-[#FFFFFF] border-2 border-[#141413] p-2 text-center text-lg font-bold w-32 tracking-widest text-[#141413]"
                />
                <button
                  onClick={handleVerifyOtp}
                  className="flex-1 py-2 bg-[#141413] text-[#FFFFFF] border-2 border-[#141413] font-bold text-xs uppercase hover:bg-[#FAF7F2] hover:text-[#141413] cursor-pointer"
                >
                  [ SIMULATE VERIFY ]
                </button>
              </div>
            </div>

            <div className="border border-[#141413]/40 p-3 bg-[#FFFFFF]">
              <span className="text-[10px] text-[#141413]/60 block uppercase font-bold mb-1">
                OR ESCALATE HARD QUARANTINE:
              </span>
              <button
                onClick={handleFreezeEscrow}
                className="w-full py-2 bg-[#C86432] text-[#FFFFFF] border-2 border-[#141413] font-bold text-xs uppercase hover:bg-[#141413] cursor-pointer"
              >
                [ HARD ESCROW FREEZE &amp; REPORT TO REGULATOR ]
              </button>
            </div>
          </div>
        )}

        {step === "SUCCESS" && (
          <div className="border-2 border-[#141413] p-6 bg-[#2A4B45] text-white text-center space-y-2">
            <span className="text-2xl font-bold">✓</span>
            <div className="font-extrabold text-sm uppercase">
              OTP VERIFIED SUCCESSFULLY
            </div>
            <p className="text-xs font-medium opacity-90">
              Transaction released to payment processor. Risk baseline recalibrated in Redis feature store.
            </p>
          </div>
        )}

        {step === "FAILED" && (
          <div className="border-2 border-[#141413] p-6 bg-[#FAF7F2] text-[#141413] text-center space-y-3">
            <div className="font-extrabold text-sm uppercase text-[#C86432]">
              OTP VERIFICATION FAILED / TIMED OUT
            </div>
            <p className="text-xs text-[#141413]/80 font-medium">
              3 invalid attempts recorded. Automated rule triggered: Account temporarily isolated.
            </p>
            <button
              onClick={handleFreezeEscrow}
              className="px-4 py-2 bg-[#C86432] text-white border-2 border-[#141413] font-bold text-xs uppercase hover:bg-[#141413] cursor-pointer"
            >
              [ CONFIRM ESCROW FREEZE ]
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

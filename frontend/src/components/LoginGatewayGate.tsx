"use client";

import React, { useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { API_BASE_URL } from '@/lib/authApi';

interface LoginGatewayGateProps {
  onBypassDemo?: () => void;
}

export const LoginGatewayGate: React.FC<LoginGatewayGateProps> = ({ onBypassDemo }) => {
  const {
    currentTenant,
    availableTenants,
    isLoading,
    gatewayStatus,
    checkGateway,
    login,
    quickDemoLogin,
  } = useAuth();

  const [email, setEmail] = useState('analyst@aedis.bank');
  const [password, setPassword] = useState('password123');
  const [selectedTenant, setSelectedTenant] = useState('tenant_bank_alpha');
  const [showPassword, setShowPassword] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    const result = await login({
      email,
      password,
      tenantId: selectedTenant,
    });

    if (!result.success) {
      setErrorMsg(result.error || 'Authentication rejected. Verify backend status.');
    }
  };

  const handleQuickPreset = async (demoEmail: string, demoTenant: string) => {
    setEmail(demoEmail);
    setPassword('password123');
    setSelectedTenant(demoTenant);
    setErrorMsg(null);
    await quickDemoLogin(demoEmail, demoTenant);
  };

  return (
    <div className="w-full max-w-4xl mx-auto my-auto py-8 px-4 flex flex-col gap-6">
      {/* Brutalist Hero Security Frame */}
      <div className="bg-[#FFFFFF] border-2 border-[#141413] shadow-[8px_8px_0px_0px_#141413]">
        {/* Top Dark Bar */}
        <div className="bg-[#141413] text-[#FFFFFF] px-6 py-4 flex flex-wrap items-center justify-between gap-4 border-b-2 border-[#141413]">
          <div className="flex items-center space-x-3">
            <span className="bg-[#C86432] text-white px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider">
              CONSILIUM &apos;26
            </span>
            <span className="text-xs font-mono font-bold tracking-wider uppercase text-[#FAF7F2]">
              FINTECHSTICO // ZERO-TRUST EDGE GATEWAY
            </span>
          </div>

          <div className="flex items-center gap-4 text-xs font-mono">
            <div className="flex items-center gap-1.5">
              <span
                className={`w-2.5 h-2.5 ${
                  gatewayStatus === 'ONLINE'
                    ? 'bg-[#2A4B45]'
                    : gatewayStatus === 'OFFLINE'
                    ? 'bg-[#C86432]'
                    : 'bg-yellow-500'
                }`}
              />
              <span className="font-bold">
                API GATEWAY: {gatewayStatus} ({API_BASE_URL})
              </span>
            </div>
            <button
              onClick={checkGateway}
              className="text-[11px] underline uppercase hover:text-[#C86432] cursor-pointer"
            >
              [PING]
            </button>
          </div>
        </div>

        {/* Content Box */}
        <div className="p-6 md:p-10 space-y-8">
          <div className="border-b-2 border-[#141413] pb-6 flex flex-col md:flex-row md:items-end justify-between gap-4">
            <div>
              <div className="text-xs font-bold text-[#141413]/60 uppercase tracking-widest">
                AEDIS SMART ASSISTANT · FINANCIAL RISK INFRASTRUCTURE
              </div>
              <h1 className="text-3xl md:text-4xl font-black uppercase tracking-tight text-[#141413] mt-1.5">
                OPERATOR AUTHENTICATION
              </h1>
              <p className="text-xs md:text-sm text-[#141413]/70 font-medium mt-2 max-w-2xl leading-relaxed">
                Connect to the Fastify API Gateway with multi-tenant bank credentials.
                Issues signed RS256 JWT tokens for real-time scam &amp; mule surveillance, loan distress prediction, and SHAP explainability ledgers.
              </p>
            </div>

            <div className="border-2 border-[#141413] bg-[#FAF7F2] p-3 text-right">
              <div className="text-[10px] font-bold text-[#141413]/60 uppercase">
                SECURITY STANDARD
              </div>
              <div className="text-sm font-black text-[#141413] uppercase">
                JWT RS256 · 8H LEASE
              </div>
            </div>
          </div>

          {/* Quick Demo Launch Strip */}
          <div className="bg-[#FAF7F2] border-2 border-[#141413] p-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-[#141413]">
                ⚡ 1-CLICK HACKATHON LOGIN PROFILES:
              </span>
              <span className="text-[10px] font-mono text-[#141413]/60">
                DEFAULT PASSWORD: <code className="font-bold text-[#141413]">password123</code>
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              <button
                type="button"
                onClick={() =>
                  handleQuickPreset('analyst@aedis.bank', 'tenant_bank_alpha')
                }
                disabled={isLoading}
                className="p-3 bg-[#FFFFFF] border-2 border-[#141413] hover:bg-[#141413] hover:text-[#FFFFFF] text-left cursor-pointer transition-none flex items-center justify-between"
              >
                <div>
                  <div className="text-xs font-black uppercase">
                    [ 🔑 ENTER AS RISK ANALYST ]
                  </div>
                  <div className="text-[11px] font-mono opacity-75 mt-0.5">
                    analyst@aedis.bank · Alpha Commercial Bank
                  </div>
                </div>
                <span className="text-[10px] bg-[#C86432] text-white px-2 py-0.5 font-bold uppercase">
                  LEAD
                </span>
              </button>

              <button
                type="button"
                onClick={() =>
                  handleQuickPreset('compliance@aedis.bank', 'tenant_apex_mutual')
                }
                disabled={isLoading}
                className="p-3 bg-[#FFFFFF] border-2 border-[#141413] hover:bg-[#141413] hover:text-[#FFFFFF] text-left cursor-pointer transition-none flex items-center justify-between"
              >
                <div>
                  <div className="text-xs font-black uppercase">
                    [ 🛡️ ENTER AS COMPLIANCE AUDITOR ]
                  </div>
                  <div className="text-[11px] font-mono opacity-75 mt-0.5">
                    compliance@aedis.bank · Apex Mutual Reserve
                  </div>
                </div>
                <span className="text-[10px] bg-[#2A4B45] text-white px-2 py-0.5 font-bold uppercase">
                  AUDIT
                </span>
              </button>
            </div>
          </div>

          {/* Manual Login Form */}
          <form onSubmit={handleLoginSubmit} className="space-y-5">
            {/* Institution / Tenant Select */}
            <div>
              <label className="text-xs font-bold uppercase text-[#141413] block mb-2">
                1. SELECT BANKING TENANT CONTEXT
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {availableTenants.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setSelectedTenant(t.id)}
                    className={`p-3 text-left border-2 text-xs font-bold uppercase cursor-pointer ${
                      selectedTenant === t.id
                        ? 'bg-[#141413] text-white border-[#141413] shadow-[3px_3px_0px_0px_#C86432]'
                        : 'bg-[#FAF7F2] text-[#141413] border-[#141413] hover:bg-[#FFFFFF]'
                    }`}
                  >
                    <div className="text-[10px] opacity-75">{t.code}</div>
                    <div className="font-black truncate">{t.name}</div>
                    <div className="text-[9px] opacity-60 mt-1 font-mono">{t.region}</div>
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Email */}
              <div>
                <label className="text-xs font-bold uppercase text-[#141413] block mb-1.5">
                  2. OPERATOR EMAIL
                </label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="analyst@aedis.bank"
                  className="brutal-input font-mono"
                />
              </div>

              {/* Password */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-bold uppercase text-[#141413]">
                    3. GATEWAY PASSCODE
                  </label>
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="text-[10px] font-bold uppercase underline text-[#141413]/70 hover:text-[#141413] cursor-pointer"
                  >
                    {showPassword ? '[ HIDE ]' : '[ SHOW ]'}
                  </button>
                </div>
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="brutal-input font-mono"
                />
              </div>
            </div>

            {/* Error Display */}
            {errorMsg && (
              <div className="p-3 bg-[#FAF7F2] border-2 border-[#C86432] text-[#C86432] text-xs font-bold uppercase flex items-center gap-2">
                <span>⚠</span>
                <span>{errorMsg}</span>
              </div>
            )}

            {/* Action Buttons */}
            <div className="pt-2 flex flex-col sm:flex-row items-center justify-between gap-4">
              <button
                type="submit"
                disabled={isLoading}
                className="w-full sm:w-auto px-8 py-3.5 brutal-btn-primary font-black uppercase text-sm tracking-wide cursor-pointer"
              >
                {isLoading ? '[ VERIFYING RS256 JWT... ]' : '[ AUTHENTICATE TO API GATEWAY ]'}
              </button>

              {onBypassDemo && (
                <button
                  type="button"
                  onClick={onBypassDemo}
                  className="text-xs font-bold text-[#141413]/70 hover:text-[#141413] uppercase underline cursor-pointer"
                >
                  [ EXPLORE IN READ-ONLY TELEMETRY MODE → ]
                </button>
              )}
            </div>
          </form>

          {/* Architecture Spec Alignment Strip */}
          <div className="border-t-2 border-[#141413] pt-6 grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
            <div className="p-3 bg-[#FAF7F2] border border-[#141413]">
              <span className="text-[10px] font-bold text-[#141413]/60 uppercase block">
                EDGE TRUST BOUNDARY
              </span>
              <p className="mt-1 font-semibold text-[#141413]">
                Kong / Fastify Gateway handles rate limiting, JWT validation &lt; 2ms, and header tenant injection.
              </p>
            </div>

            <div className="p-3 bg-[#FAF7F2] border border-[#141413]">
              <span className="text-[10px] font-bold text-[#141413]/60 uppercase block">
                ROLE-BASED ACTIONS
              </span>
              <p className="mt-1 font-semibold text-[#141413]">
                Assigned roles (<code className="font-mono text-[#C86432]">RISK_ANALYST</code>, <code className="font-mono text-[#2A4B45]">COMPLIANCE_OFFICER</code>) bound to immutable PostgreSQL audit entries.
              </p>
            </div>

            <div className="p-3 bg-[#FAF7F2] border border-[#141413]">
              <span className="text-[10px] font-bold text-[#141413]/60 uppercase block">
                MULTI-TENANT ENFORCEMENT
              </span>
              <p className="mt-1 font-semibold text-[#141413]">
                Strict row-level security isolates account topologies, distress curves, and rulesets per banking institution.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

"use client";

import React, { useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { API_BASE_URL } from '@/lib/authApi';

export const AuthModal: React.FC = () => {
  const {
    user,
    token,
    tenantId,
    currentTenant,
    availableTenants,
    isAuthenticated,
    isLoading,
    gatewayStatus,
    checkGateway,
    login,
    logout,
    switchTenant,
    isAuthModalOpen,
    closeAuthModal,
  } = useAuth();

  const [email, setEmail] = useState('analyst@aedis.bank');
  const [password, setPassword] = useState('password123');
  const [selectedTenant, setSelectedTenant] = useState(tenantId);
  const [showPassword, setShowPassword] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [showTokenDetails, setShowTokenDetails] = useState(false);
  const [copiedToken, setCopiedToken] = useState(false);

  if (!isAuthModalOpen) return null;

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    const result = await login({
      email,
      password,
      tenantId: selectedTenant,
    });

    if (!result.success) {
      setErrorMsg(result.error || 'Authentication failed. Please verify credentials.');
    }
  };

  const handleQuickFill = (demoEmail: string, demoTenant: string) => {
    setEmail(demoEmail);
    setPassword('password123');
    setSelectedTenant(demoTenant);
    setErrorMsg(null);
  };

  const handleCopyToken = () => {
    if (token) {
      navigator.clipboard.writeText(token);
      setCopiedToken(true);
      setTimeout(() => setCopiedToken(false), 2000);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Heavy Backdrop */}
      <div
        className="fixed inset-0 bg-[#141413]/75 backdrop-blur-[2px]"
        onClick={closeAuthModal}
      />

      {/* Main Brutalist Modal Box */}
      <div className="relative z-10 w-full max-w-xl bg-[#FAF7F2] border-2 border-[#141413] shadow-[8px_8px_0px_0px_#141413] flex flex-col max-h-[92vh] overflow-y-auto">
        {/* Top Conclave & Security Header */}
        <div className="bg-[#141413] text-[#FFFFFF] px-6 py-4 border-b-2 border-[#141413] flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <span className="bg-[#C86432] text-white px-2 py-0.5 text-[10px] font-black uppercase tracking-wider">
              SECURITY PROTOCOL
            </span>
            <span className="text-xs font-bold tracking-wider uppercase font-mono text-[#FAF7F2]">
              C4-L2 // EDGE GATEWAY AUTH
            </span>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 text-[11px] font-mono">
              <span
                className={`w-2 h-2 rounded-none ${
                  gatewayStatus === 'ONLINE'
                    ? 'bg-[#2A4B45]'
                    : gatewayStatus === 'OFFLINE'
                    ? 'bg-[#C86432]'
                    : 'bg-yellow-500'
                }`}
              />
              <span className="text-xs uppercase font-bold">
                {gatewayStatus === 'ONLINE'
                  ? 'GW: ONLINE (4000)'
                  : gatewayStatus === 'OFFLINE'
                  ? 'GW: OFFLINE'
                  : 'GW: CHECKING'}
              </span>
            </div>

            <button
              onClick={closeAuthModal}
              className="px-2 py-0.5 border border-[#FFFFFF] text-xs font-bold hover:bg-[#FFFFFF] hover:text-[#141413] cursor-pointer"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="p-6 md:p-8 space-y-6">
          {/* Header Title */}
          <div>
            <div className="text-[11px] font-bold text-[#141413]/60 uppercase tracking-widest">
              AEDIS FINANCIAL RISK PLATFORM
            </div>
            <h2 className="text-2xl md:text-3xl font-black uppercase tracking-tight text-[#141413] mt-1">
              ANALYST GATEWAY AUTH
            </h2>
            <p className="text-xs text-[#141413]/70 font-medium mt-1 leading-relaxed">
              Verify operator credentials with institutional multi-tenant context to issue an RS256
              JWT session for live fraud stream surveillance and regulatory interventions.
            </p>
          </div>

          {/* Already Authenticated State */}
          {isAuthenticated && user && (
            <div className="bg-[#FFFFFF] border-2 border-[#141413] p-5 space-y-4">
              <div className="flex items-center justify-between border-b border-[#141413]/20 pb-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 bg-[#141413] text-white flex items-center justify-center font-bold text-xs">
                    {user.sub.substring(0, 2).toUpperCase()}
                  </div>
                  <div>
                    <div className="text-xs font-black uppercase text-[#141413]">
                      ACTIVE OPERATOR: {user.sub}
                    </div>
                    <div className="text-[11px] text-[#141413]/70 font-mono">
                      {user.email}
                    </div>
                  </div>
                </div>
                <span className="bg-[#2A4B45] text-white px-2.5 py-0.5 text-[10px] font-bold uppercase">
                  JWT ACTIVE
                </span>
              </div>

              {/* Tenant context */}
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="p-2.5 bg-[#FAF7F2] border border-[#141413]">
                  <span className="text-[10px] font-bold text-[#141413]/60 uppercase block">
                    INSTITUTION TENANT
                  </span>
                  <span className="font-extrabold text-[#141413] block mt-0.5">
                    {currentTenant.name}
                  </span>
                  <span className="text-[10px] font-mono text-[#141413]/60">
                    ID: {user.tenantId}
                  </span>
                </div>

                <div className="p-2.5 bg-[#FAF7F2] border border-[#141413]">
                  <span className="text-[10px] font-bold text-[#141413]/60 uppercase block">
                    ASSIGNED ROLES
                  </span>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {user.roles.map((r) => (
                      <span
                        key={r}
                        className="bg-[#141413] text-white text-[9px] px-1.5 py-0.5 font-bold uppercase"
                      >
                        {r}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              {/* Switch Tenant Selector */}
              <div>
                <label className="text-[11px] font-bold text-[#141413] uppercase block mb-1.5">
                  SWITCH INSTITUTIONAL TENANT
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  {availableTenants.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => switchTenant(t.id)}
                      className={`p-2 text-left border-2 text-xs font-bold uppercase cursor-pointer ${
                        tenantId === t.id
                          ? 'bg-[#141413] text-white border-[#141413]'
                          : 'bg-[#FFFFFF] text-[#141413] border-[#141413] hover:bg-[#F5EFEB]'
                      }`}
                    >
                      <div className="text-[10px] opacity-75">{t.code}</div>
                      <div className="truncate">{t.name}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Token Inspector Toggle */}
              <div className="pt-2 border-t border-[#141413]/20 flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => setShowTokenDetails(!showTokenDetails)}
                  className="text-xs font-bold uppercase underline text-[#141413] cursor-pointer"
                >
                  {showTokenDetails ? '[ HIDE RAW JWT PAYLOAD ]' : '[ INSPECT RAW JWT PAYLOAD ]'}
                </button>

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={handleCopyToken}
                    className="px-3 py-1 border border-[#141413] text-xs font-bold uppercase bg-[#FAF7F2] hover:bg-[#141413] hover:text-white cursor-pointer"
                  >
                    {copiedToken ? '✓ COPIED' : 'COPY JWT'}
                  </button>

                  <button
                    type="button"
                    onClick={logout}
                    className="px-3 py-1 bg-[#C86432] text-white border border-[#141413] text-xs font-bold uppercase hover:bg-[#141413] cursor-pointer"
                  >
                    LOGOUT
                  </button>
                </div>
              </div>

              {/* Raw Token Box */}
              {showTokenDetails && (
                <div className="p-3 bg-[#141413] text-[#FAF7F2] font-mono text-[10px] break-all border border-[#141413] space-y-2">
                  <div className="text-[#C86432] font-bold">BEARER TOKEN:</div>
                  <div className="max-h-24 overflow-y-auto">{token}</div>
                  <div className="text-white/60 pt-1 border-t border-white/20">
                    Target API: {API_BASE_URL}/v1/transactions [Header: Authorization: Bearer &lt;token&gt;]
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Login Form (Shown if unauthenticated OR re-authenticating) */}
          {(!isAuthenticated || !user) && (
            <form onSubmit={handleLoginSubmit} className="space-y-5">
              {/* Quick Fill Demo Presets */}
              <div>
                <span className="text-[10px] font-bold text-[#141413]/60 uppercase tracking-wider block mb-2">
                  QUICK-FILL TEST PROFILES (HACKATHON STANDALONE):
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      handleQuickFill('analyst@aedis.bank', 'tenant_bank_alpha')
                    }
                    className="p-2.5 bg-[#FFFFFF] border-2 border-[#141413] hover:bg-[#141413] hover:text-white text-left cursor-pointer transition-none flex flex-col justify-between"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold uppercase">
                        RISK ANALYST
                      </span>
                      <span className="text-[9px] bg-[#C86432] text-white px-1.5 font-bold uppercase">
                        PRIMARY
                      </span>
                    </div>
                    <span className="text-[10px] font-mono opacity-80 mt-1">
                      analyst@aedis.bank · Alpha Bank
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      handleQuickFill('compliance@aedis.bank', 'tenant_apex_mutual')
                    }
                    className="p-2.5 bg-[#FFFFFF] border-2 border-[#141413] hover:bg-[#141413] hover:text-white text-left cursor-pointer transition-none flex flex-col justify-between"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold uppercase">
                        COMPLIANCE OFFICER
                      </span>
                      <span className="text-[9px] bg-[#2A4B45] text-white px-1.5 font-bold uppercase">
                        AUDITOR
                      </span>
                    </div>
                    <span className="text-[10px] font-mono opacity-80 mt-1">
                      compliance@aedis.bank · Apex Mutual
                    </span>
                  </button>
                </div>
              </div>

              {/* Institution / Tenant Select */}
              <div>
                <label className="text-xs font-bold uppercase text-[#141413] block mb-1.5">
                  1. SELECT INSTITUTIONAL TENANT
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  {availableTenants.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setSelectedTenant(t.id)}
                      className={`p-2.5 text-left border-2 text-xs font-bold uppercase cursor-pointer ${
                        selectedTenant === t.id
                          ? 'bg-[#141413] text-white border-[#141413]'
                          : 'bg-[#FFFFFF] text-[#141413] border-[#141413] hover:bg-[#F5EFEB]'
                      }`}
                    >
                      <div className="text-[10px] opacity-75">{t.code}</div>
                      <div className="truncate">{t.name}</div>
                      <div className="text-[9px] opacity-60 mt-1 font-mono">{t.region}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Email Input */}
              <div>
                <label className="text-xs font-bold uppercase text-[#141413] block mb-1.5">
                  2. OPERATOR EMAIL ADDRESS
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

              {/* Password Input */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-bold uppercase text-[#141413]">
                    3. GATEWAY PASSCODE (SECRET)
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
                <span className="text-[10px] text-[#141413]/60 font-medium mt-1 block">
                  Backend check: <code className="bg-[#FFFFFF] px-1 border border-[#141413]/30">password123</code> (as configured in backend auth route)
                </span>
              </div>

              {/* Error Display */}
              {errorMsg && (
                <div className="p-3 bg-[#FAF7F2] border-2 border-[#C86432] text-[#C86432] text-xs font-bold uppercase flex items-start gap-2">
                  <span className="text-base leading-none">⚠</span>
                  <div className="leading-snug">{errorMsg}</div>
                </div>
              )}

              {/* Submit Button */}
              <div className="pt-2 flex flex-col sm:flex-row gap-3">
                <button
                  type="submit"
                  disabled={isLoading}
                  className="flex-1 brutal-btn-primary py-3 cursor-pointer text-center font-black tracking-wider"
                >
                  {isLoading ? '[ VERIFYING RS256 CLAIMS... ]' : '[ AUTHENTICATE & ISSUE JWT ]'}
                </button>

                <button
                  type="button"
                  onClick={checkGateway}
                  className="px-4 py-3 brutal-btn-secondary text-xs uppercase cursor-pointer"
                  title="Ping localhost:4000/health"
                >
                  [ PING GW ]
                </button>
              </div>
            </form>
          )}

          {/* Architecture Guardrails Footnote */}
          <div className="p-3.5 bg-[#FAF7F2] border border-[#141413]/30 text-[11px] font-medium text-[#141413]/80 space-y-1">
            <div className="font-bold text-[#141413] uppercase flex items-center justify-between">
              <span>AEDIS BACKEND ARCHITECTURE COMPLIANCE</span>
              <span className="text-[#2A4B45]">SECTION 8.3 &amp; 10.6</span>
            </div>
            <p>
              Inbound traffic enforces JWT RS256 signature verification with tenant key isolation.
              Outbound webhooks signed with HMAC-SHA256. Audit trail immutably binds each analyst action to the verified subject context.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

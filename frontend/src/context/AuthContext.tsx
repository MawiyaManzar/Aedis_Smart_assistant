"use client";

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { AuthUser, LoginCredentials, Tenant } from '@/lib/types';
import {
  AVAILABLE_TENANTS,
  loginToGateway,
  checkGatewayHealth,
  LoginResult,
  decodeJwt,
} from '@/lib/authApi';

interface AuthContextType {
  user: AuthUser | null;
  token: string | null;
  tenantId: string;
  currentTenant: Tenant;
  availableTenants: Tenant[];
  isAuthenticated: boolean;
  isLoading: boolean;
  gatewayStatus: 'ONLINE' | 'OFFLINE' | 'CHECKING';
  checkGateway: () => Promise<void>;
  login: (credentials: LoginCredentials) => Promise<LoginResult>;
  logout: () => void;
  switchTenant: (tenantId: string) => void;
  isAuthModalOpen: boolean;
  openAuthModal: () => void;
  closeAuthModal: () => void;
  quickDemoLogin: (email?: string, tenantId?: string) => Promise<LoginResult>;
}

const STORAGE_KEY_TOKEN = 'aedis_jwt_token';
const STORAGE_KEY_USER = 'aedis_auth_user';
const STORAGE_KEY_TENANT = 'aedis_tenant_id';

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [tenantId, setTenantIdState] = useState<string>('tenant_bank_alpha');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [gatewayStatus, setGatewayStatus] = useState<'ONLINE' | 'OFFLINE' | 'CHECKING'>('CHECKING');
  const [isAuthModalOpen, setIsAuthModalOpen] = useState<boolean>(false);

  const currentTenant =
    AVAILABLE_TENANTS.find((t) => t.id === tenantId) || AVAILABLE_TENANTS[0];

  // Check Gateway Health
  const checkGateway = useCallback(async () => {
    setGatewayStatus('CHECKING');
    const isOnline = await checkGatewayHealth();
    setGatewayStatus(isOnline ? 'ONLINE' : 'OFFLINE');
  }, []);

  // Hydrate from localStorage on client mount
  useEffect(() => {
    try {
      const storedToken = localStorage.getItem(STORAGE_KEY_TOKEN);
      const storedUser = localStorage.getItem(STORAGE_KEY_USER);
      const storedTenant = localStorage.getItem(STORAGE_KEY_TENANT);

      if (storedTenant) {
        setTenantIdState(storedTenant);
      }

      if (storedToken && storedUser) {
        const parsedUser: AuthUser = JSON.parse(storedUser);
        // Check if token has expired
        if (parsedUser.expiresAt && parsedUser.expiresAt < Date.now()) {
          console.warn('Stored JWT session expired. Clearing local session.');
          localStorage.removeItem(STORAGE_KEY_TOKEN);
          localStorage.removeItem(STORAGE_KEY_USER);
        } else {
          setToken(storedToken);
          setUser(parsedUser);
          if (parsedUser.tenantId) {
            setTenantIdState(parsedUser.tenantId);
          }
        }
      }
    } catch (e) {
      console.error('Failed to restore auth from localStorage:', e);
    } finally {
      setIsLoading(false);
      checkGateway();
    }
  }, [checkGateway]);

  // Periodic gateway health ping
  useEffect(() => {
    const interval = setInterval(() => {
      checkGateway();
    }, 15000);
    return () => clearInterval(interval);
  }, [checkGateway]);

  // Perform Login
  const login = async (credentials: LoginCredentials): Promise<LoginResult> => {
    setIsLoading(true);
    try {
      const result = await loginToGateway(credentials);

      if (result.success && result.token && result.user) {
        setToken(result.token);
        setUser(result.user);
        setTenantIdState(result.user.tenantId);

        localStorage.setItem(STORAGE_KEY_TOKEN, result.token);
        localStorage.setItem(STORAGE_KEY_USER, JSON.stringify(result.user));
        localStorage.setItem(STORAGE_KEY_TENANT, result.user.tenantId);

        setGatewayStatus('ONLINE');
        setIsAuthModalOpen(false);
      } else {
        // If gateway was offline, recheck gateway status
        if (result.error?.includes('unreachable')) {
          setGatewayStatus('OFFLINE');
        }
      }

      return result;
    } finally {
      setIsLoading(false);
    }
  };

  // Quick Demo Login helper (fills standard credentials)
  const quickDemoLogin = async (
    email = 'analyst@aedis.bank',
    selectedTenant = 'tenant_bank_alpha'
  ): Promise<LoginResult> => {
    return login({
      email,
      password: 'password123',
      tenantId: selectedTenant,
    });
  };

  // Logout
  const logout = () => {
    setToken(null);
    setUser(null);
    localStorage.removeItem(STORAGE_KEY_TOKEN);
    localStorage.removeItem(STORAGE_KEY_USER);
  };

  // Switch active bank tenant
  const switchTenant = (newTenantId: string) => {
    setTenantIdState(newTenantId);
    localStorage.setItem(STORAGE_KEY_TENANT, newTenantId);
    if (user) {
      const updatedUser = { ...user, tenantId: newTenantId };
      setUser(updatedUser);
      localStorage.setItem(STORAGE_KEY_USER, JSON.stringify(updatedUser));
    }
  };

  const openAuthModal = () => setIsAuthModalOpen(true);
  const closeAuthModal = () => setIsAuthModalOpen(false);

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        tenantId,
        currentTenant,
        availableTenants: AVAILABLE_TENANTS,
        isAuthenticated: !!token && !!user,
        isLoading,
        gatewayStatus,
        checkGateway,
        login,
        logout,
        switchTenant,
        isAuthModalOpen,
        openAuthModal,
        closeAuthModal,
        quickDemoLogin,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

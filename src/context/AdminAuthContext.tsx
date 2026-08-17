'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { User } from '@/types';
import { api } from '@/lib/client/api';

interface AdminUser extends User {
  stream?: string;
  organization_name?: string;
}

interface AdminAuthContextValue {
  user: AdminUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => void;
  isSuperuser: boolean;
  isAdmin: boolean;
  isFaculty: boolean;
}

const AdminAuthContext = createContext<AdminAuthContextValue | null>(null);

const TOKEN_KEY = 'admin_token';
const USER_KEY = 'admin_user_info';

export function AdminAuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AdminUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const loadSession = useCallback(async () => {
    try {
      const storedToken = sessionStorage.getItem(TOKEN_KEY) || localStorage.getItem(TOKEN_KEY);
      const storedUser = sessionStorage.getItem(USER_KEY) || localStorage.getItem(USER_KEY);

      if (storedToken && storedUser) {
        const parsed = JSON.parse(storedUser);
        setUser(parsed);

        try {
          const fresh = await api.auth.getMe('admin');
          if (fresh && fresh.uid) {
            setUser({
              uid: fresh.uid,
              email: fresh.email,
              displayName: fresh.display_name,
              role: fresh.role,
              token: storedToken,
              stream: fresh.stream,
              organization_name: fresh.organization_name,
            });
          }
        } catch {
          logout();
        }
      }
    } catch (e) {
      console.error('Admin session restore error:', e);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSession();
  }, [loadSession]);

  const login = async (email: string, password: string) => {
    try {
      const res = await api.auth.adminLogin(email, password);
      const adminData: AdminUser = {
        uid: res.uid,
        email: res.email,
        displayName: res.display_name,
        role: res.role,
        token: res.token,
        stream: res.stream,
        organization_name: res.organization_name,
      };

      setUser(adminData);
      sessionStorage.setItem(TOKEN_KEY, res.token);
      sessionStorage.setItem(USER_KEY, JSON.stringify(adminData));
      localStorage.setItem(TOKEN_KEY, res.token);
      localStorage.setItem(USER_KEY, JSON.stringify(adminData));

      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message || 'Login failed' };
    }
  };

  const logout = () => {
    sessionStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(USER_KEY);
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    setUser(null);
  };

  const isSuperuser = user?.role === 'superuser' || user?.role === 'super_admin';
  const isAdmin = isSuperuser || user?.role === 'admin';
  const isFaculty = isAdmin || user?.role === 'faculty' || user?.role === 'hod' || user?.role === 'assistant';

  return (
    <AdminAuthContext.Provider
      value={{
        user,
        isAuthenticated: !!user,
        isLoading,
        login,
        logout,
        isSuperuser,
        isAdmin,
        isFaculty,
      }}
    >
      {children}
    </AdminAuthContext.Provider>
  );
}

export function useAdminAuth() {
  const context = useContext(AdminAuthContext);
  if (!context) {
    throw new Error('useAdminAuth must be used within an AdminAuthProvider');
  }
  return context;
}

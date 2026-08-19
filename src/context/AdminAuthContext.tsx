'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { User } from '@/types';
import { api } from '@/lib/client/api';

interface AdminUser extends User {
  stream?: string;
  allowed_streams?: string[];
  faculty_assignments?: Array<{ stream: string; semester: string; section: string; subject: string }>;
  hod_streams?: string[];
  organization_name?: string;
  department?: string;
}

interface AdminAuthContextValue {
  user: AdminUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  loginWithGoogle: (
    credential: string | { idToken?: string; accessToken?: string }
  ) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
  isAdmin: boolean;
  isFaculty: boolean;
}

const AdminAuthContext = createContext<AdminAuthContextValue | null>(null);

export function AdminAuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AdminUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const loadSession = useCallback(async () => {
    try {
      const fresh = await api.auth.getMe('admin');
      if (fresh && fresh.uid) {
        setUser({
          uid: fresh.uid,
          email: fresh.email,
          displayName: fresh.display_name,
          role: fresh.role,
          token: '',
          stream: fresh.stream,
          allowed_streams: fresh.allowed_streams,
          faculty_assignments: fresh.faculty_assignments,
          hod_streams: fresh.hod_streams,
          organization_name: fresh.organization_name,
          department: fresh.department,
        });
      } else {
        setUser(null);
      }
    } catch {
      setUser(null);
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
        token: res.token || '',
        stream: res.stream,
        allowed_streams: res.allowed_streams,
        organization_name: res.organization_name,
        department: res.department,
      };

      setUser(adminData);
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message || 'Login failed' };
    }
  };

  const loginWithGoogle = async (
    credential: string | { idToken?: string; accessToken?: string }
  ) => {
    try {
      const res = await api.auth.googleAuth(
        typeof credential === 'string' ? { idToken: credential, scope: 'dashboard' } : { ...credential, scope: 'dashboard' }
      );
      setUser({
        uid: res.uid,
        email: res.email,
        displayName: res.display_name,
        role: res.role,
        token: res.access_token || res.token || '',
        avatar_url: res.avatar_url,
      });
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message || 'Google Sign-In failed' };
    }
  };

  const logout = async () => {
    try {
      await api.auth.logout('admin');
    } catch (e) {
      console.error('Admin logout error:', e);
    } finally {
      setUser(null);
    }
  };

  const isAdmin = user?.role === 'admin';
  const isFaculty = isAdmin || user?.role === 'faculty' || user?.role === 'hod';

  return (
    <AdminAuthContext.Provider
      value={{
        user,
        isAuthenticated: !!user,
        isLoading,
        login,
        loginWithGoogle,
        logout,
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

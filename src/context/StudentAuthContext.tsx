'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { User, UserProfile } from '@/types';
import { api } from '@/lib/client/api';

interface StudentAuthContextValue {
  user: User | null;
  profile: UserProfile | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  loginWithGoogle: (credential: string | { idToken?: string; accessToken?: string }) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
  updateProfile: (data: Partial<UserProfile> & { currentPassword?: string; newPassword?: string }) => Promise<boolean>;
  refreshProfile: () => Promise<void>;
}

const StudentAuthContext = createContext<StudentAuthContextValue | null>(null);

export function StudentAuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const loadSession = useCallback(async () => {
    try {
      const fresh = await api.auth.getMe('student');
      if (fresh && fresh.uid && fresh.scope !== 'dashboard') {
        setUser({
          uid: fresh.uid,
          email: fresh.email,
          displayName: fresh.display_name,
          role: 'student',
          token: '',
          avatar_url: fresh.avatar_url,
        });
        setProfile({
          name: fresh.name,
          roll: fresh.roll,
          stream: fresh.stream || 'cse',
          sem: fresh.sem || '1',
          section: fresh.section,
          semester: fresh.sem || '1',
          rollNumber: fresh.roll,
          avatar_url: fresh.avatar_url,
        });
      } else {
        setUser(null);
        setProfile(null);
      }
    } catch {
      setUser(null);
      setProfile(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSession();
  }, [loadSession]);

  const login = async (email: string, password: string) => {
    try {
      const res = await api.auth.studentLogin(email, password);
      setUser({
        uid: res.uid,
        email: res.email,
        displayName: res.display_name,
        role: 'student',
        token: res.token || '',
      });
      if (res.profile) {
        setProfile(res.profile);
      }
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message || 'Login failed' };
    }
  };

  const loginWithGoogle = async (credential: string | { idToken?: string; accessToken?: string }) => {
    try {
      const res = await api.auth.googleAuth(credential);
      setUser({
        uid: res.uid,
        email: res.email,
        displayName: res.displayName || res.name,
        role: 'student',
        token: res.access_token || res.token || '',
        avatar_url: res.avatar_url,
      });
      setProfile({
        name: res.name || res.displayName,
        roll: res.roll,
        stream: res.stream || 'cse',
        sem: res.sem || '1',
        section: res.section,
        avatar_url: res.avatar_url,
      });
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message || 'Google Sign-In failed' };
    }
  };

  const logout = async () => {
    try {
      await api.auth.logout('student');
    } catch (e) {
      console.error('Logout error:', e);
    } finally {
      setUser(null);
      setProfile(null);
    }
  };

  const updateProfile = async (data: Partial<UserProfile>) => {
    try {
      await api.auth.updateProfile(data, 'student');
      setProfile((prev) => (prev ? { ...prev, ...data } : (data as UserProfile)));
      return true;
    } catch {
      return false;
    }
  };

  const refreshProfile = async () => {
    try {
      const fresh = await api.auth.getMe('student');
      if (fresh) {
        setProfile({
          name: fresh.name,
          roll: fresh.roll,
          stream: fresh.stream || 'cse',
          sem: fresh.sem || '1',
          section: fresh.section,
          semester: fresh.sem || '1',
          rollNumber: fresh.roll,
          avatar_url: fresh.avatar_url,
        });
      }
    } catch {}
  };

  return (
    <StudentAuthContext.Provider
      value={{
        user,
        profile,
        isAuthenticated: !!user,
        isLoading,
        login,
        loginWithGoogle,
        logout,
        updateProfile,
        refreshProfile,
      }}
    >
      {children}
    </StudentAuthContext.Provider>
  );
}

export function useStudentAuth() {
  const context = useContext(StudentAuthContext);
  if (!context) {
    throw new Error('useStudentAuth must be used within a StudentAuthProvider');
  }
  return context;
}

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
  register: (data: any) => Promise<{ success: boolean; error?: string }>;
  loginWithGoogle: (credential: string | { idToken?: string; accessToken?: string }) => Promise<{ success: boolean; error?: string }>;
  logout: () => void;
  updateProfile: (data: Partial<UserProfile>) => Promise<boolean>;
  refreshProfile: () => Promise<void>;
}

const StudentAuthContext = createContext<StudentAuthContextValue | null>(null);

const TOKEN_KEY = 'student_token';
const USER_KEY = 'student_user_info';

export function StudentAuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const loadStoredSession = useCallback(async () => {
    try {
      const storedToken = sessionStorage.getItem(TOKEN_KEY) || localStorage.getItem(TOKEN_KEY);
      const storedUser = sessionStorage.getItem(USER_KEY) || localStorage.getItem(USER_KEY);

      if (storedToken && storedUser) {
        const parsed = JSON.parse(storedUser);
        setUser(parsed);
        setProfile(parsed.profile || null);

        // Background verification
        try {
          const fresh = await api.auth.getMe('student');
          if (fresh && fresh.uid) {
            setUser({
              uid: fresh.uid,
              email: fresh.email,
              displayName: fresh.display_name,
              role: 'student',
              token: storedToken,
              avatar_url: fresh.avatar_url,
            });
            setProfile({
              name: fresh.name,
              roll: fresh.roll,
              stream: fresh.stream || 'cse',
              sem: fresh.sem || '1',
              batch: fresh.batch,
              semester: fresh.sem || '1',
              rollNumber: fresh.roll,
            });
          }
        } catch {
          // Token expired or invalid
          logout();
        }
      }
    } catch (e) {
      console.error('Failed to load session:', e);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadStoredSession();
  }, [loadStoredSession]);

  const setSession = (userData: User, userProfile?: UserProfile) => {
    setUser(userData);
    if (userProfile) setProfile(userProfile);
    sessionStorage.setItem(TOKEN_KEY, userData.token);
    sessionStorage.setItem(USER_KEY, JSON.stringify({ ...userData, profile: userProfile }));
    localStorage.setItem(TOKEN_KEY, userData.token);
    localStorage.setItem(USER_KEY, JSON.stringify({ ...userData, profile: userProfile }));
  };

  const login = async (email: string, password: string) => {
    try {
      const res = await api.auth.studentLogin(email, password);
      const userData: User = {
        uid: res.uid,
        email: res.email,
        displayName: res.display_name,
        role: 'student',
        token: res.token,
      };
      setSession(userData, res.profile);
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message || 'Login failed' };
    }
  };

  const register = async (data: any) => {
    try {
      const res = await api.auth.studentRegister(data);
      const userData: User = {
        uid: res.uid,
        email: res.email,
        displayName: res.display_name,
        role: 'student',
        token: res.token,
      };
      setSession(userData, res.profile);
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message || 'Registration failed' };
    }
  };

  const loginWithGoogle = async (credential: string | { idToken?: string; accessToken?: string }) => {
    try {
      const res = await api.auth.googleAuth(credential);
      const userData: User = {
        uid: res.uid,
        email: res.email,
        displayName: res.displayName || res.name,
        role: 'student',
        token: res.access_token || res.token,
        avatar_url: res.avatar_url,
      };
      setSession(userData, {
        name: res.name || res.displayName,
        roll: res.roll,
        stream: res.stream || 'cse',
        sem: res.sem || '1',
      });
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message || 'Google Sign-In failed' };
    }
  };

  const logout = () => {
    sessionStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(USER_KEY);
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    setUser(null);
    setProfile(null);
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
          batch: fresh.batch,
          semester: fresh.sem || '1',
          rollNumber: fresh.roll,
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
        register,
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

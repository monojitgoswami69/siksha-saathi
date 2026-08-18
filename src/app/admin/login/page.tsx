'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAdminAuth } from '@/context/AdminAuthContext';
import { Shield, Mail, Lock, ArrowRight } from 'lucide-react';
import Link from 'next/link';

export default function AdminLoginPage() {
  const router = useRouter();
  const { isAuthenticated, isLoading, login, loginWithGoogle } = useAdminAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      router.push('/admin/dashboard');
    }
  }, [isAuthenticated, isLoading, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    const res = await login(email, password);
    if (res.success) {
      router.push('/admin/dashboard');
    } else {
      setError(res.error || 'Invalid administrator credentials');
    }
    setSubmitting(false);
  };

  // Google OAuth 2.0 (dashboard scope) — mirrors the student flow but issues
  // an admin cookie. The email must be pre-enrolled (Manage Faculty).
  const handleGoogleSignIn = () => {
    setError(null);
    const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || '';
    if (!clientId || clientId.includes('dummy')) {
      setError('Google Client ID is not configured.');
      return;
    }

    if (typeof window !== 'undefined' && (window as any).google?.accounts?.oauth2) {
      try {
        const client = (window as any).google.accounts.oauth2.initTokenClient({
          client_id: clientId,
          scope: 'openid email profile',
          callback: async (tokenResponse: any) => {
            if (tokenResponse?.error) {
              if (tokenResponse.error !== 'user_cancelled') {
                setError(tokenResponse.error_description || 'Google sign-in was cancelled.');
              }
              return;
            }
            if (tokenResponse?.access_token) {
              setSubmitting(true);
              const res = await loginWithGoogle({ accessToken: tokenResponse.access_token });
              if (res.success) {
                router.push('/admin/dashboard');
              } else {
                setError(res.error || 'Google authentication failed.');
              }
              setSubmitting(false);
            }
          },
        });
        client.requestAccessToken({ prompt: 'select_account' });
      } catch (e: any) {
        console.error('Google OAuth client error:', e);
        setError('Failed to open Google Sign-In.');
      }
    } else {
      // Redirect fallback (hash-token)
      const redirectUri = window.location.origin + '/admin/login';
      const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${encodeURIComponent(
        clientId
      )}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=token&scope=openid%20email%20profile&prompt=select_account&state=dashboard`;
      window.location.href = authUrl;
    }
  };

  // Handle hash-token fallback (state=dashboard)
  useEffect(() => {
    if (typeof window === 'undefined' || !window.location.hash) return;
    const params = new URLSearchParams(window.location.hash.substring(1));
    const accessToken = params.get('access_token');
    const state = params.get('state');
    if (accessToken && state === 'dashboard') {
      setSubmitting(true);
      loginWithGoogle({ accessToken }).then((res) => {
        if (res.success) {
          router.push('/admin/dashboard');
        } else {
          setError(res.error || 'Google authentication failed.');
        }
        setSubmitting(false);
      });
    }
  }, [loginWithGoogle, router]);

  return (
    <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center p-6 relative overflow-hidden">
      {/* Background Glows */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-indigo-600/15 rounded-full blur-3xl pointer-events-none"></div>
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-violet-600/15 rounded-full blur-3xl pointer-events-none"></div>

      <div className="relative bg-slate-900 border border-slate-800 rounded-3xl p-8 md:p-12 max-w-md w-full shadow-2xl z-10">
        <div className="flex items-center justify-center mb-6">
          <div className="w-14 h-14 rounded-2xl bg-indigo-600 flex items-center justify-center shadow-xl shadow-indigo-600/30 text-white">
            <Shield className="w-7 h-7" />
          </div>
        </div>

        <h2 className="text-2xl font-bold text-center text-white mb-2">Faculty & Admin Portal</h2>
        <p className="text-xs text-center text-slate-400 mb-8">
          Sign in to manage curriculum, OCR document ingestion, and track academic risk analytics.
        </p>

        {error && (
          <div className="p-3 mb-5 rounded-xl bg-rose-950/60 border border-rose-800 text-rose-300 text-xs font-semibold">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
              Faculty / Admin Email
            </label>
            <div className="relative">
              <Mail className="w-4 h-4 text-slate-500 absolute left-3 top-3.5" />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="faculty@university.edu"
                className="w-full pl-9 pr-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-sm text-white focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500 outline-none placeholder:text-slate-600"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
              Password
            </label>
            <div className="relative">
              <Lock className="w-4 h-4 text-slate-500 absolute left-3 top-3.5" />
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full pl-9 pr-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-sm text-white focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500 outline-none placeholder:text-slate-600"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full flex items-center justify-center gap-2 py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold text-sm shadow-lg shadow-indigo-600/30 transition-all disabled:opacity-50 mt-2"
          >
            <span>{submitting ? 'Authenticating...' : 'Sign In to Dashboard'}</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </form>

        {/* Divider */}
        <div className="flex items-center gap-3 my-5 opacity-60">
          <div className="flex-1 h-px bg-slate-800"></div>
          <span className="text-[10px] font-bold tracking-widest text-slate-500 uppercase">OR</span>
          <div className="flex-1 h-px bg-slate-800"></div>
        </div>

        {/* Google OAuth */}
        <button
          type="button"
          onClick={handleGoogleSignIn}
          disabled={submitting}
          className="w-full bg-[#f1f5f9] hover:bg-[#e2e8f0] disabled:opacity-50 text-slate-700 font-bold text-[11px] tracking-widest uppercase py-3 rounded-xl transition-colors flex items-center justify-center gap-3"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
          </svg>
          CONTINUE WITH GOOGLE
        </button>

        <div className="mt-5 flex items-center justify-between text-xs text-slate-500">
          <Link href="/login" className="hover:text-indigo-400 transition-colors">
            ← Back to Student Portal
          </Link>
          <span>Demo: admin@sikshasaathi.in</span>
        </div>
      </div>
    </div>
  );
}

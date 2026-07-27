'use client';

import React from 'react';

interface Props {
  error?: string;
}

export function LoginScreen({ error }: Props) {
  const errorMessages: Record<string, string> = {
    unauthorized: 'That Google account is not authorized to access this app.',
    auth_failed: 'Authentication was cancelled or failed. Please try again.',
    token_failed: 'Could not exchange authorization code. Check OAuth credentials.',
    profile_failed: 'Could not retrieve your Google profile. Please retry.',
  };

  return (
    <div className="h-screen w-screen bg-[#0a0a0a] flex items-center justify-center">
      <div className="flex flex-col items-center gap-10">
        {/* Wordmark */}
        <div className="flex flex-col items-center gap-4">
          <div
            className="w-20 h-20 rounded-3xl flex items-center justify-center"
            style={{ background: 'linear-gradient(135deg, #00F2FE 0%, #ff2d55 100%)' }}
          >
            <svg width="40" height="40" viewBox="0 0 24 24" fill="white">
              <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z" />
            </svg>
          </div>
          <div className="text-center">
            <h1 className="text-4xl font-black text-white tracking-tight">Music</h1>
            <p className="text-sm text-white/40 mt-1">Your library. Downloaded. Yours.</p>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm text-center max-w-xs">
            {errorMessages[error] ?? 'Something went wrong. Please try again.'}
          </div>
        )}

        {/* Google Sign In */}
        <a
          href="/api/auth/google"
          className="flex items-center gap-3 px-7 py-4 bg-white hover:bg-gray-50 active:bg-gray-100 rounded-full text-gray-800 font-semibold text-sm transition-all duration-150 shadow-2xl hover:shadow-white/10"
        >
          <svg width="20" height="20" viewBox="0 0 24 24">
            <path
              fill="#4285F4"
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
            />
            <path
              fill="#34A853"
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
            />
            <path
              fill="#FBBC05"
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
            />
            <path
              fill="#EA4335"
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
            />
          </svg>
          Sign in with Google
        </a>
      </div>
    </div>
  );
}

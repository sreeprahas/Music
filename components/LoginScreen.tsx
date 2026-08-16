'use client';

import React, { useState, useEffect } from 'react';

interface Props {
  error?: string;
}

export function LoginScreen({ error }: Props) {
  const [isLoading, setIsLoading] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [isElectron, setIsElectron] = useState(false);
  const [isCanceling, setIsCanceling] = useState(false);
  const [deviceCode, setDeviceCode] = useState<{ userCode: string; verificationUrl: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const errorMessages: Record<string, string> = {
    unauthorized: 'That Google account is not authorized to access this app.',
    auth_failed: 'Authentication was cancelled or failed. Please try again.',
    token_failed: 'Could not exchange authorization code. Check OAuth credentials.',
    profile_failed: 'Could not retrieve your Google profile. Please retry.',
  };

  // Check if running in Electron environment
  useEffect(() => {
    const checkElectron = async () => {
      setIsElectron(Boolean(window.electron?.auth?.login));
    };

    checkElectron();
  }, []);

  const handleGoogleLogin = async () => {
    setIsLoading(true);
    setLoginError(null);
    setDeviceCode(null);
    setCopied(false);

    try {
      if (isElectron) {
        // Use Electron OAuth flow
        console.log('Starting Electron OAuth flow...');
        const result = await window.electron!.auth.login();
        if (!result.success) {
          const errorMsg = result.error || 'Authentication failed';
          console.error('OAuth error:', errorMsg);
          setLoginError(errorMsg);
          setIsLoading(false);
        } else if (result.deviceCode) {
          setDeviceCode(result.deviceCode);
          void navigator.clipboard?.writeText(result.deviceCode.userCode).then(() => setCopied(true)).catch(() => { });
        }
      } else {
        // Use regular web OAuth flow
        console.log('Starting web OAuth flow...');
        window.location.href = '/api/auth/google';
      }
    } catch (err) {
      console.error('Login error:', err);
      setLoginError(err instanceof Error ? err.message : 'An error occurred during login');
      setIsLoading(false);
    } finally {
      if (!isElectron) setIsLoading(false);
    }
  };

  const handleCancelLogin = async () => {
    setIsCanceling(true);
    try {
      if (isElectron) await window.electron!.auth.cancelLogin();
    } finally {
      setIsLoading(false);
      setIsCanceling(false);
      setLoginError(null);
      setDeviceCode(null);
    }
  };

  useEffect(() => {
    if (!isElectron) return;
    return window.electron!.auth.onLoginSuccess(() => window.location.reload());
  }, [isElectron]);

  useEffect(() => {
    if (!isElectron) return;
    return window.electron!.auth.onDeviceCode((code) => {
      setDeviceCode(code);
      void navigator.clipboard?.writeText(code.userCode).then(() => setCopied(true)).catch(() => { });
    });
  }, [isElectron]);

  const copyDeviceCode = async () => {
    if (!deviceCode) return;
    try {
      await navigator.clipboard.writeText(deviceCode.userCode);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  useEffect(() => {
    if (!isElectron) return;
    return window.electron!.auth.onLoginError(({ message }) => {
      setLoginError(message);
      setIsLoading(false);
    });
  }, [isElectron]);

  // Keep a small fallback poll while the browser flow is open. This covers
  // callbacks that complete during a renderer navigation/reload.
  useEffect(() => {
    if (!isElectron || !isLoading) return;
    const pollId = window.setInterval(async () => {
      const session = await window.electron!.auth.getSession().catch(() => null);
      if (session?.isAuthenticated) {
        window.clearInterval(pollId);
        window.location.reload();
      }
    }, 700);
    return () => window.clearInterval(pollId);
  }, [isElectron, isLoading]);

  const displayError = loginError || error;

  return (
    <div className="relative h-screen w-screen bg-[#0a0a0a] flex items-center justify-center select-none">
      <header
        className="fixed inset-x-0 top-0 z-40 flex h-16 items-center gap-3 border-b border-white/5 bg-[#0a0a0a]/95 px-5"
        style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
      >
        <img src="/music-icon.png" alt="Music" className="h-8 w-8 rounded-lg" />
        <span className="text-sm font-bold tracking-tight text-white/85">Music</span>
      </header>
      <div className="flex flex-col items-center gap-10">
        {/* Wordmark */}
        <div className="flex flex-col items-center gap-4">
          <div
            className="w-20 h-20 rounded-3xl flex items-center justify-center"
            style={{ background: '#17181d', border: '1px solid rgba(255,255,255,0.1)' }}
          >
            <img src="/music-icon.png" alt="Music" className="h-full w-full object-cover rounded-3xl" />
          </div>
          <div className="text-center">
            <h1 className="text-4xl font-black text-white tracking-tight">Music</h1>
            <p className="text-sm text-white/40 mt-1">Your library. Downloaded. Yours.</p>
          </div>
        </div>

        {/* Error */}
        {displayError && (
          <div className="px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm text-center max-w-xs">
            {errorMessages[displayError] ?? displayError}
          </div>
        )}

        {/* Google Sign In */}
        <button
          onClick={handleGoogleLogin}
          disabled={isLoading}
          className="flex items-center gap-3 px-7 py-4 bg-white hover:bg-gray-50 active:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed rounded-full text-gray-800 font-semibold text-sm transition-all duration-150 shadow-2xl hover:shadow-white/10"
        >
          {isLoading ? (
            <>
              <div className="w-5 h-5 border-2 border-gray-300 border-t-gray-800 rounded-full animate-spin" />
              Signing in...
            </>
          ) : (
            <>
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
            </>
          )}
        </button>
      </div>

      {isLoading && isElectron && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-5 backdrop-blur-md">
          <div className="w-full max-w-sm rounded-3xl border border-white/10 bg-[#17181d] p-7 text-center shadow-2xl shadow-black/60">
            <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-[#00F2FE]/10 ring-1 ring-[#00F2FE]/25">
              <div className="h-7 w-7 animate-spin rounded-full border-2 border-white/15 border-t-[#00F2FE]" />
            </div>
            <h2 className="text-lg font-semibold text-white">Finish signing in</h2>
            <p className="mt-2 text-sm leading-6 text-white/50">Google opened the verification page. Enter this code there while Music waits for approval.</p>
            {deviceCode && (
              <div className="mt-5 rounded-2xl border border-[#00F2FE]/20 bg-[#00F2FE]/5 p-3 text-left">
                <div className="flex items-center gap-2">
                  <code className="min-w-0 flex-1 truncate text-lg font-bold tracking-[0.18em] text-[#00F2FE]">{deviceCode.userCode}</code>
                  <button type="button" onClick={copyDeviceCode} className="shrink-0 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-white/75 transition hover:bg-white/10 hover:text-white">{copied ? 'Copied' : 'Copy'}</button>
                </div>
                <button type="button" onClick={() => window.open(deviceCode.verificationUrl, '_blank', 'noopener,noreferrer')} className="mt-2 text-xs text-white/45 underline underline-offset-4 hover:text-white/75">Open verification page</button>
              </div>
            )}
            <button
              type="button"
              onClick={handleCancelLogin}
              disabled={isCanceling}
              className="mt-6 w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-semibold text-white/75 transition hover:border-white/20 hover:bg-white/10 hover:text-white disabled:cursor-wait disabled:opacity-50"
            >
              {isCanceling ? 'Cancelling…' : 'Cancel'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

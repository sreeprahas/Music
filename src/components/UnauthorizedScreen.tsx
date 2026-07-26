import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { ShieldCheck, Music2, Lock, ArrowRight, UserCheck, KeyRound } from 'lucide-react';

export const UnauthorizedScreen: React.FC = () => {
  const { authorizedEmail, quickLogin, googleLogin, error, clearError } = useAuth();
  const [emailInput, setEmailInput] = useState<string>(authorizedEmail);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  const handleQuickAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    await quickLogin(emailInput);
    setIsSubmitting(false);
  };

  const handleGoogleOAuthSimulation = async () => {
    setIsSubmitting(true);
    await googleLogin(authorizedEmail, 'Prahas (Owner)', 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=200&q=80');
    setIsSubmitting(false);
  };

  return (
    <div className="min-h-screen bg-[#0f0f0f] text-white flex flex-col items-center justify-center p-6 relative overflow-hidden">
      {/* Background ambient glow */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-red-600/10 rounded-full blur-3xl pointer-events-none" />

      <div className="max-w-md w-full bg-[#181818] border border-white/10 rounded-2xl p-8 shadow-2xl relative z-10 text-center">
        {/* YTM Logo Icon */}
        <div className="mx-auto w-16 h-16 bg-red-600 rounded-full flex items-center justify-center mb-6 shadow-lg shadow-red-600/30">
          <Music2 className="w-8 h-8 text-white fill-white" />
        </div>

        <h1 className="text-2xl font-bold tracking-tight mb-2">YouTube Music Personal</h1>
        <p className="text-sm text-neutral-400 mb-6">
          Single-User Security Active. Only the authorized account owner can access this personal streaming library.
        </p>

        {/* Authorized Badge */}
        <div className="bg-[#242424] border border-white/10 rounded-xl p-3.5 mb-6 text-left flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-red-500/10 text-red-400 flex items-center justify-center shrink-0">
            <Lock className="w-5 h-5" />
          </div>
          <div className="overflow-hidden">
            <div className="text-xs text-neutral-400 font-medium">Authorized Email Constraint</div>
            <div className="text-sm font-semibold text-white truncate font-mono mt-0.5">{authorizedEmail}</div>
          </div>
        </div>

        {error && (
          <div className="mb-6 p-3 bg-red-900/30 border border-red-500/40 rounded-xl text-xs text-red-300 text-left flex items-start justify-between gap-2">
            <span>{error}</span>
            <button onClick={clearError} className="text-red-400 hover:text-white font-bold ml-1">
              ×
            </button>
          </div>
        )}

        {/* Auth Buttons */}
        <div className="space-y-3">
          <button
            onClick={handleGoogleOAuthSimulation}
            disabled={isSubmitting}
            className="w-full h-12 bg-white text-black hover:bg-neutral-200 font-semibold rounded-xl flex items-center justify-center gap-3 transition-colors shadow-md disabled:opacity-50 cursor-pointer"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24">
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
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
              />
              <path
                fill="#EA4335"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
              />
            </svg>
            Sign in with Google OAuth
          </button>

          <div className="relative my-4">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-white/10" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-[#181818] px-2 text-neutral-500 font-mono">or quick verify</span>
            </div>
          </div>

          <form onSubmit={handleQuickAuth} className="space-y-3">
            <div className="relative">
              <input
                type="email"
                value={emailInput}
                onChange={(e) => setEmailInput(e.target.value)}
                placeholder="Enter authorized email"
                className="w-full h-11 bg-[#242424] border border-white/10 rounded-xl px-4 text-sm text-white placeholder-neutral-500 focus:outline-none focus:border-red-500 font-mono"
              />
            </div>
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full h-11 bg-red-600 hover:bg-red-500 text-white font-semibold rounded-xl flex items-center justify-center gap-2 transition-colors cursor-pointer disabled:opacity-50"
            >
              <KeyRound className="w-4 h-4" />
              <span>Authenticate Session</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </form>
        </div>

        <div className="mt-6 pt-6 border-t border-white/10 text-xs text-neutral-500 flex items-center justify-center gap-2">
          <ShieldCheck className="w-4 h-4 text-emerald-500" />
          <span>Local JSON Storage & yt-dlp Audio Engine Ready</span>
        </div>
      </div>
    </div>
  );
};

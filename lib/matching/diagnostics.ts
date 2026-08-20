import type { MatchDiagnostic } from '@/types';

export function diagnostic(code: string, message?: string, details?: Record<string, unknown>, videoId?: string): MatchDiagnostic {
  return { code, message, details, videoId, at: Date.now() };
}

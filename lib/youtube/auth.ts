/**
 * lib/youtube/auth.ts
 *
 * Safe YouTube Music authentication helper interacting exclusively with the Python sidecar.
 * Handles OAuth device authorization, raw header setup, status checks, and logout.
 */

import { youtubeSidecar } from './sidecar-client';
import type { SidecarAuthStatus } from './types';

export async function getAuthStatus(): Promise<SidecarAuthStatus> {
  return youtubeSidecar.execute<SidecarAuthStatus>('auth_status', {}, 10_000);
}

export async function startOAuthFlow(): Promise<{
  device_code?: string;
  user_code?: string;
  verification_url?: string;
  expires_in?: number;
  interval?: number;
  [key: string]: any;
}> {
  return youtubeSidecar.execute('auth_oauth_start', {}, 30_000);
}

export async function finishOAuthFlow(authFilePath?: string): Promise<{ success: boolean; authFile: string }> {
  return youtubeSidecar.execute('auth_oauth_finish', { authFile: authFilePath }, 30_000);
}

export async function setupHeadersAuth(headersRaw: string, authFilePath?: string): Promise<{ success: boolean; status: SidecarAuthStatus }> {
  return youtubeSidecar.execute('auth_headers', { headers: headersRaw, authFile: authFilePath }, 20_000);
}

export async function logout(): Promise<{ success: boolean }> {
  return youtubeSidecar.execute('auth_logout', {}, 10_000);
}

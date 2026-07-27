'use client';

import { useEffect, useState, useCallback } from 'react';

declare global {
  interface Window {
    chrome: {
      webview: {
        postMessage: (message: string) => void;
        addEventListener: (type: string, listener: (event: any) => void) => void;
        removeEventListener: (type: string, listener: (event: any) => void) => void;
      };
    };
    __NATIVE_HOST__?: boolean;
  }
}

export const isNativeHost = () => {
  return typeof window !== 'undefined' && (!!window.__NATIVE_HOST__ || !!window.chrome?.webview);
};

export const sendNativeDownloadRequest = (videoId: string) => {
  if (isNativeHost()) {
    const url = `https://www.youtube.com/watch?v=${videoId}`;
    window.chrome.webview.postMessage(JSON.stringify({ Url: url, VideoId: videoId }));
    return true;
  }
  return false;
};

export function useNativeDownloadProgress() {
  const [nativeProgress, setNativeProgress] = useState<Record<string, number>>({});

  useEffect(() => {
    if (!isNativeHost()) return;

    const handleMessage = (event: any) => {
      try {
        const msg = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
        if (msg.type === 'progress' && msg.videoId) {
          setNativeProgress(prev => ({
            ...prev,
            [msg.videoId]: parseFloat(msg.value)
          }));
        } else if (msg.type === 'complete' && msg.videoId) {
          setNativeProgress(prev => ({
            ...prev,
            [msg.videoId]: 100
          }));
        }
      } catch (e) {
        console.error('Bridge parsing error', e);
      }
    };

    window.chrome.webview.addEventListener('message', handleMessage);
    return () => window.chrome.webview.removeEventListener('message', handleMessage);
  }, []);

  return nativeProgress;
}

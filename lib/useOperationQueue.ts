'use client';

import { useEffect, useState, useCallback, useRef } from 'react';

export interface OperationState {
  id: string;
  type: string;
  targetResource: string;
  status: 'PENDING' | 'RUNNING' | 'RETRY_WAIT' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
  attemptCount: number;
  maxAttempts: number;
  createdAt: number;
  updatedAt: number;
  errorCategory?: string;
  errorMessage?: string;
  result?: any;
}

export function useOperationQueue(targetResource?: string) {
  const [operations, setOperations] = useState<OperationState[]>([]);
  const [loading, setLoading] = useState(true);
  const isPollingRef = useRef(false);

  const fetchOperations = useCallback(async () => {
    try {
      const url = new URL('/api/operations', window.location.origin);
      if (targetResource) url.searchParams.set('targetResource', targetResource);
      url.searchParams.set('limit', '30');

      const res = await fetch(url.toString());
      if (!res.ok) return;
      const data = await res.json();

      if (data.success && Array.isArray(data.operations)) {
        setOperations(data.operations);
      }
    } catch {
      // Ignore poll error
    } finally {
      setLoading(false);
    }
  }, [targetResource]);

  useEffect(() => {
    fetchOperations();

    const checkAndPoll = async () => {
      if (isPollingRef.current) return;
      isPollingRef.current = true;

      try {
        await fetchOperations();
      } finally {
        isPollingRef.current = false;
      }
    };

    // Determine adaptive interval:
    // If active operations (PENDING or RUNNING or RETRY_WAIT) exist, poll every 1.5s.
    // Otherwise poll every 10s.
    const hasActiveOps = operations.some((op) =>
      op.status === 'PENDING' || op.status === 'RUNNING' || op.status === 'RETRY_WAIT'
    );

    const intervalMs = hasActiveOps ? 1500 : 10000;
    const timer = setInterval(checkAndPoll, intervalMs);

    return () => clearInterval(timer);
  }, [fetchOperations, operations]);

  const activeOperationsCount = operations.filter((op) =>
    op.status === 'PENDING' || op.status === 'RUNNING' || op.status === 'RETRY_WAIT'
  ).length;

  return {
    operations,
    loading,
    activeOperationsCount,
    refetch: fetchOperations,
  };
}

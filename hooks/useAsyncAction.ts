"use client";

import { useCallback, useRef, useState } from "react";

import { getApiErrorMessage } from "@/lib/admin/api-client";

type UseAsyncActionOptions = {
  onSuccess?: () => void;
  onError?: (message: string, error: unknown) => void;
};

export function useAsyncAction(options: UseAsyncActionOptions = {}) {
  const runningRef = useRef(false);
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState("");

  const clearError = useCallback(() => setError(""), []);

  const run = useCallback(
    async <T,>(action: () => Promise<T>) => {
      if (runningRef.current) {
        return null;
      }

      runningRef.current = true;
      setIsRunning(true);
      setError("");

      try {
        const result = await action();
        options.onSuccess?.();
        return result;
      } catch (actionError) {
        const message = getApiErrorMessage(actionError);
        setError(message);
        options.onError?.(message, actionError);
        return null;
      } finally {
        runningRef.current = false;
        setIsRunning(false);
      }
    },
    [options]
  );

  return {
    run,
    isRunning,
    error,
    clearError,
  };
}

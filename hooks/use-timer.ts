"use client";

import { useEffect, useState, useRef, useCallback } from "react";

export function useTimer(
  totalSec: number,
  onExpire?: () => void,
  opts?: { expiresAt?: Date | null }
) {
  const computeRemaining = useCallback(() => {
    if (opts?.expiresAt) {
      return Math.max(
        0,
        Math.floor((opts.expiresAt.getTime() - Date.now()) / 1000)
      );
    }
    return totalSec;
  }, [totalSec, opts?.expiresAt]);

  const [remaining, setRemaining] = useState(() => computeRemaining());
  const [isRunning, setIsRunning] = useState(true);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const onExpireRef = useRef(onExpire);
  onExpireRef.current = onExpire;

  const pause = useCallback(() => setIsRunning(false), []);
  const resume = useCallback(() => setIsRunning(true), []);

  useEffect(() => {
    setRemaining(computeRemaining());
  }, [computeRemaining]);

  useEffect(() => {
    if (!isRunning) {
      if (intervalRef.current) clearInterval(intervalRef.current);
      return;
    }
    intervalRef.current = setInterval(() => {
      setRemaining((prev) => {
        const actual = computeRemaining();
        const next = opts?.expiresAt ? actual : prev - 1;
        if (next <= 0) {
          if (intervalRef.current) clearInterval(intervalRef.current);
          onExpireRef.current?.();
          return 0;
        }
        return next;
      });
    }, 1000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isRunning, computeRemaining, opts?.expiresAt]);

  const format = (sec: number) => {
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    if (h > 0)
      return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  };

  return {
    remaining,
    formatted: format(remaining),
    isRunning,
    pause,
    resume,
    setRemaining,
  };
}

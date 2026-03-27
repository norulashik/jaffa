"use client";

import { useState, useEffect } from "react";

interface CountdownResult {
  hours: number;
  minutes: number;
  seconds: number;
  formatted: string;
  isExpired: boolean;
}

export function useCountdown(expiresAt: string | null): CountdownResult {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!expiresAt) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [expiresAt]);

  if (!expiresAt) {
    return { hours: 0, minutes: 0, seconds: 0, formatted: "0:00", isExpired: true };
  }

  const diff = new Date(expiresAt).getTime() - now;
  if (diff <= 0) {
    return { hours: 0, minutes: 0, seconds: 0, formatted: "0:00", isExpired: true };
  }

  const hours = Math.floor(diff / 3600000);
  const minutes = Math.floor((diff % 3600000) / 60000);
  const seconds = Math.floor((diff % 60000) / 1000);

  let formatted: string;
  if (hours > 0) {
    formatted = `${hours}h ${minutes}m`;
  } else if (minutes > 0) {
    formatted = `${minutes}:${seconds.toString().padStart(2, "0")}`;
  } else {
    formatted = `0:${seconds.toString().padStart(2, "0")}`;
  }

  return { hours, minutes, seconds, formatted, isExpired: false };
}

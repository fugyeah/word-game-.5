"use client";

import { useEffect, useMemo, useState } from "react";

interface CountdownTimerProps {
  label: string;
  deadline: number | null;
}

const formatMs = (value: number): string => {
  const safe = Math.max(0, value);
  const totalSeconds = Math.floor(safe / 1000);
  const minutes = Math.floor(totalSeconds / 60)
    .toString()
    .padStart(2, "0");
  const seconds = (totalSeconds % 60).toString().padStart(2, "0");
  return `${minutes}:${seconds}`;
};

export const CountdownTimer = ({ label, deadline }: CountdownTimerProps): JSX.Element => {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const remaining = useMemo(() => {
    if (!deadline) return "--:--";
    return formatMs(deadline - now);
  }, [deadline, now]);

  return (
    <div className="mc-card">
      <div className="mc-subtle">{label}</div>
      <strong>{remaining}</strong>
    </div>
  );
};

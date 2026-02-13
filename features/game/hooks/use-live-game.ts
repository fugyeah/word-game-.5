"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fetchSnapshot } from "@/features/game/services/snapshot-service";
import { AppSnapshot } from "@/types/word-game";

interface LiveState {
  snapshot: AppSnapshot | null;
  degraded: boolean;
  message: string | null;
  lastUpdated: number | null;
}

const pollBaseMs = 2000;
const maxBackoffMs = 30_000;

export const useLiveGame = (wallet?: string): LiveState => {
  const [state, setState] = useState<LiveState>({
    snapshot: null,
    degraded: false,
    message: null,
    lastUpdated: null,
  });

  const retries = useRef(0);
  const wsRef = useRef<WebSocket | null>(null);

  const refresh = useCallback(async () => {
    const response = await fetchSnapshot({ wallet });
    if (response.ok && response.data) {
      retries.current = 0;
      setState({
        snapshot: response.data,
        degraded: response.data.degraded,
        message: response.data.warning,
        lastUpdated: Date.now(),
      });
      return;
    }
    retries.current += 1;
    setState((prev) => ({
      ...prev,
      degraded: true,
      message: response.error?.message ?? "Live updates unavailable",
      lastUpdated: Date.now(),
    }));
  }, [wallet]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    const wsBase = process.env.NEXT_PUBLIC_WS_URL;
    if (!wsBase) {
      return;
    }
    const ws = new WebSocket(wsBase);
    wsRef.current = ws;

    ws.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data) as AppSnapshot;
        setState({
          snapshot: payload,
          degraded: payload.degraded,
          message: payload.warning,
          lastUpdated: Date.now(),
        });
      } catch {
        setState((prev) => ({ ...prev, degraded: true, message: "Malformed websocket payload" }));
      }
    };

    ws.onerror = () => {
      setState((prev) => ({
        ...prev,
        degraded: true,
        message: "Websocket disconnected. Polling fallback active.",
      }));
    };

    ws.onclose = () => {
      setState((prev) => ({
        ...prev,
        degraded: true,
        message: "Realtime channel closed. Polling fallback active.",
      }));
    };

    return () => {
      ws.close();
      wsRef.current = null;
    };
  }, []);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;

    const loop = async (): Promise<void> => {
      await refresh();
      const backoff = Math.min(pollBaseMs * 2 ** retries.current, maxBackoffMs);
      timer = setTimeout(loop, backoff);
    };

    timer = setTimeout(loop, pollBaseMs);

    return () => clearTimeout(timer);
  }, [refresh]);

  return useMemo(() => state, [state]);
};

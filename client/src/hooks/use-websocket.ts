import { useEffect, useRef } from "react";
import { getWebSocketUrl } from "@/lib/runtime";

export function useRoomWebSocket(
  roomCode: string,
  onMessage: (data: any) => void
) {
  const wsRef = useRef<WebSocket | null>(null);
  const onMessageRef = useRef(onMessage);
  onMessageRef.current = onMessage;

  useEffect(() => {
    if (!roomCode) return;

    const ws = new WebSocket(getWebSocketUrl(`/ws?room=${roomCode}`));
    wsRef.current = ws;

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        onMessageRef.current(data);
      } catch {}
    };

    ws.onclose = () => {
      // Reconnect after 3 seconds
      setTimeout(() => {
        if (wsRef.current === ws) {
          wsRef.current = null;
        }
      }, 3000);
    };

    return () => {
      ws.close();
      wsRef.current = null;
    };
  }, [roomCode]);
}

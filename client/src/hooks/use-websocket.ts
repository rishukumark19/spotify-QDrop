import { useEffect, useRef } from "react";
import { getWebSocketUrl } from "@/lib/runtime";

export function useRoomWebSocket(
  roomCode: string,
  onMessage: (data: any) => void
) {
  const wsRef = useRef<WebSocket | null>(null);
  const onMessageRef = useRef(onMessage);
  onMessageRef.current = onMessage;

  const sendMessage = (data: any) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(data));
    }
  };

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

    return () => {
      ws.close();
      wsRef.current = null;
    };
  }, [roomCode]);

  return { sendMessage };
}

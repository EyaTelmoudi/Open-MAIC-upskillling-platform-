"use client";

import { useEffect, useRef } from "react";

import { NOTIFICATIONS_URL } from "@/app/lib/api";

type LearningRealtimeEvent =
  | "xp.gained"
  | "level.up"
  | "badge.earned"
  | "streak.update"
  | "course_memory.completed"
  | "course_memory.failed";

type LearningRealtimePayload = {
  event: LearningRealtimeEvent;
  [key: string]: unknown;
};

const SUPPORTED_EVENTS = new Set<LearningRealtimeEvent>([
  "xp.gained",
  "level.up",
  "badge.earned",
  "streak.update",
  "course_memory.completed",
  "course_memory.failed",
]);

function buildNotificationsWebSocketUrl(userId: string, token: string): string[] {
  const notificationsBase = NOTIFICATIONS_URL.replace(/^http/, "ws");
  return [`${notificationsBase}/ws/${userId}?token=${encodeURIComponent(token)}`];
}

export function useGamificationRealtime(
  userId: string | undefined,
  enabled: boolean,
  onEvent: (event: LearningRealtimeEvent, payload: LearningRealtimePayload) => void,
) {
  const onEventRef = useRef(onEvent);

  useEffect(() => {
    onEventRef.current = onEvent;
  }, [onEvent]);

  useEffect(() => {
    if (!enabled || !userId) {
      return;
    }

    const token = localStorage.getItem("access_token");
    if (!token) {
      return;
    }

    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let isClosedByClient = false;
    let socket: WebSocket | null = null;
    let reconnectAttempts = 0;
    const maxReconnectAttempts = 4;
    const candidateUrls = buildNotificationsWebSocketUrl(userId, token);

    const connect = () => {
      socket = new WebSocket(candidateUrls[0]);

      socket.onopen = () => {
        reconnectAttempts = 0;
      };

      socket.onmessage = (messageEvent) => {
        try {
          const payload = JSON.parse(messageEvent.data);
          if (SUPPORTED_EVENTS.has(payload.event)) {
            onEventRef.current(payload.event, payload);
          }
        } catch (error) {
          console.error("Failed to parse realtime notification:", error);
        }
      };

      socket.onclose = () => {
        if (isClosedByClient) {
          return;
        }
        if (reconnectAttempts < maxReconnectAttempts) {
          reconnectAttempts += 1;
          reconnectTimer = setTimeout(connect, 1500 * reconnectAttempts);
        }
      };
    };

    connect();

    return () => {
      isClosedByClient = true;
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
      }
      socket?.close();
    };
  }, [enabled, userId]);
}

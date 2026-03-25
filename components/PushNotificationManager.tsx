"use client";

import { useEffect, useState, useCallback } from "react";

interface PushNotificationState {
  supported: boolean;
  permission: NotificationPermission | "unsupported";
  subscribed: boolean;
}

export function usePushNotifications() {
  const [state, setState] = useState<PushNotificationState>({
    supported: false,
    permission: "default",
    subscribed: false,
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    
    const supported = "Notification" in window && "serviceWorker" in navigator;
    const permission = supported ? Notification.permission : "unsupported";
    
    setState({
      supported,
      permission,
      subscribed: permission === "granted",
    });
  }, []);

  const requestPermission = useCallback(async () => {
    if (!("Notification" in window)) {
      return false;
    }

    if (Notification.permission === "granted") {
      return true;
    }

    if (Notification.permission !== "denied") {
      const permission = await Notification.requestPermission();
      setState(prev => ({ ...prev, permission, subscribed: permission === "granted" }));
      return permission === "granted";
    }

    return false;
  }, []);

  const showPushNotification = useCallback((title: string, options?: NotificationOptions) => {
    if (Notification.permission === "granted") {
      new Notification(title, {
        icon: "/icon-192x192.png",
        badge: "/icon-192x192.png",
        ...options,
      });
    }
  }, []);

  return {
    ...state,
    requestPermission,
    showPushNotification,
  };
}

export function PushNotificationListener() {
  const { supported, showPushNotification } = usePushNotifications();

  useEffect(() => {
    if (!supported) return;

    let eventSource: EventSource | null = null;

    const connect = () => {
      eventSource = new EventSource("/api/notifications/stream", {
        withCredentials: true,
      });

      eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === "heartbeat") return;

          showPushNotification(data.title, {
            body: data.message,
            tag: data.type,
          });
        } catch (e) {
          // ignore parse errors
        }
      };

      eventSource.onerror = () => {
        eventSource?.close();
        setTimeout(connect, 10000);
      };
    };

    connect();

    return () => {
      eventSource?.close();
    };
  }, [supported, showPushNotification]);

  return null;
}

"use client";

import { useEffect, useRef } from "react";
import { useToast } from "./ToastProvider";

export function NotificationListener() {
  const { addToast } = useToast();
  const eventSourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    let reconnectTimeout: NodeJS.Timeout;
    let isMounted = true;

    const connect = () => {
      if (!isMounted) return;

      try {
        eventSourceRef.current = new EventSource("/api/notifications/stream", {
          withCredentials: true,
        });

        eventSourceRef.current.onmessage = (event) => {
          if (!isMounted) return;
          try {
            const data = JSON.parse(event.data);
            
            if (data.type === "heartbeat") return;
            
            // Handle session close event
            if (data.type === "close") {
              eventSourceRef.current?.close();
              reconnectTimeout = setTimeout(connect, 5000);
              return;
            }

            addToast({
              type: data.type,
              title: data.title,
              message: data.message,
              amount: data.amount,
              shop: data.shop,
            });
          } catch (e) {
            console.error("[NotificationListener] Parse error:", e);
          }
        };

        eventSourceRef.current.onerror = () => {
          eventSourceRef.current?.close();
          reconnectTimeout = setTimeout(connect, 5000);
        };
      } catch (e) {
        console.error("[NotificationListener] Connection failed:", e);
        reconnectTimeout = setTimeout(connect, 15000);
      }
    };

    connect();

    return () => {
      isMounted = false;
      clearTimeout(reconnectTimeout);
      eventSourceRef.current?.close();
    };
  }, [addToast]);

  return null;
}

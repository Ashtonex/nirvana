"use client";

import { usePushNotifications } from "./PushNotificationManager";
import { Bell, BellOff } from "lucide-react";
import { Button } from "./ui";

export function NotificationPermissionButton() {
  const { supported, permission, subscribed, requestPermission } = usePushNotifications();

  if (!supported) return null;

  if (subscribed) {
    return (
      <div className="flex items-center gap-2 text-xs text-emerald-400">
        <Bell className="h-4 w-4" />
        <span>Push notifications on</span>
      </div>
    );
  }

  if (permission === "denied") {
    return (
      <div className="flex items-center gap-2 text-xs text-rose-400">
        <BellOff className="h-4 w-4" />
        <span>Notifications blocked</span>
      </div>
    );
  }

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={requestPermission}
      className="text-xs"
    >
      <Bell className="h-4 w-4 mr-2" />
      Enable notifications
    </Button>
  );
}

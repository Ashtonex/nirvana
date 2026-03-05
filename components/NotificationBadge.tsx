"use client";

import React, { useEffect, useState } from "react";
import { Bell, X } from "lucide-react";
import { useStaffNotifications } from "@/hooks/useStaffNotifications";
import { Button } from "@/components/ui";

interface NotificationBadgeProps {
  employeeId?: string;
}

export function NotificationBadge({ employeeId }: NotificationBadgeProps) {
  const { notifications, unreadCount, permissionGranted, markAsRead } = useStaffNotifications(employeeId);
  const [isOpen, setIsOpen] = useState(false);

  if (!employeeId) return null;

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 text-slate-400 hover:text-slate-200 rounded-lg hover:bg-slate-900 transition-all"
      >
        <Bell className="h-5 w-5" />
        {unreadCount > 0 && (
          <span className="absolute top-0 right-0 h-5 w-5 bg-rose-500 text-white text-xs font-bold rounded-full flex items-center justify-center">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 top-12 w-80 bg-slate-900 border border-slate-800 rounded-lg shadow-2xl z-50">
          <div className="flex items-center justify-between p-4 border-b border-slate-800">
            <h3 className="font-bold text-slate-100">Notifications</h3>
            <button onClick={() => setIsOpen(false)} className="text-slate-500 hover:text-slate-300">
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="max-h-96 overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="text-center py-8 text-slate-500">
                <p>No notifications</p>
              </div>
            ) : (
              notifications.map((notif) => (
                <div
                  key={notif.id}
                  className={`p-4 border-b border-slate-800 last:border-0 cursor-pointer transition-colors ${
                    notif.read ? "bg-slate-950/50" : "bg-slate-900/80 hover:bg-slate-900"
                  }`}
                  onClick={() => {
                    if (!notif.read) markAsRead(notif.id);
                  }}
                >
                  <p className="font-semibold text-slate-200 text-sm">{notif.title}</p>
                  <p className="text-xs text-slate-400 mt-1">{notif.body}</p>
                  <p className="text-xs text-slate-600 mt-2">
                    {new Date(notif.createdAt).toLocaleTimeString()}
                  </p>
                  {!notif.read && (
                    <div className="h-1.5 w-1.5 rounded-full bg-blue-500 mt-2" />
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

"use client";

import { useEffect, useState } from 'react';
import { NotificationService } from '@/lib/notifications';

interface StaffNotification {
  id: string;
  type: 'message' | 'stock_request' | 'sale';
  title: string;
  body: string;
  createdAt: string;
  read: boolean;
}

export function useStaffNotifications(employeeId?: string) {
  const [notifications, setNotifications] = useState<StaffNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [permissionGranted, setPermissionGranted] = useState(false);

  useEffect(() => {
    // Request notification permission
    NotificationService.requestPermission().then(setPermissionGranted);
  }, []);

  useEffect(() => {
    if (!employeeId) return;

    // Poll for new notifications every 2 seconds
    const checkNotifications = async () => {
      try {
        const res = await fetch(`/api/notifications?employeeId=${employeeId}`, {
          cache: 'no-store'
        });
        
        if (res.ok) {
          const data = await res.json();
          const newNotifications = data.notifications || [];
          
          // Find new notifications
          const existingIds = new Set(notifications.map(n => n.id));
          const newOnes = newNotifications.filter((n: StaffNotification) => !existingIds.has(n.id));
          
          // Show browser notifications for new items
          newOnes.forEach((n: StaffNotification) => {
            if (n.type === 'message') {
              NotificationService.notifyMessage('New Message', n.body);
            } else if (n.type === 'stock_request') {
              NotificationService.notifyStockRequest('Stock Request', parseInt(n.body));
            } else if (n.type === 'sale') {
              NotificationService.notifySale('Sale', 1, parseFloat(n.body));
            }
          });
          
          setNotifications(newNotifications);
          setUnreadCount(newNotifications.filter((n: StaffNotification) => !n.read).length);
        }
      } catch (e) {
        console.error('Failed to fetch notifications:', e);
      }
    };

    checkNotifications();
    const interval = setInterval(checkNotifications, 2000);

    return () => clearInterval(interval);
  }, [employeeId, notifications]);

  const markAsRead = async (notificationId: string) => {
    try {
      await fetch(`/api/notifications/${notificationId}`, { method: 'PATCH' });
      setNotifications(prev => prev.map(n => 
        n.id === notificationId ? { ...n, read: true } : n
      ));
      setUnreadCount(Math.max(0, unreadCount - 1));
    } catch (e) {
      console.error('Failed to mark notification as read:', e);
    }
  };

  return { notifications, unreadCount, permissionGranted, markAsRead };
}

// Browser Notification Service
export class NotificationService {
  static async requestPermission() {
    if (!('Notification' in window)) {
      console.log('This browser does not support notifications');
      return false;
    }

    if (Notification.permission === 'granted') {
      return true;
    }

    if (Notification.permission !== 'denied') {
      const permission = await Notification.requestPermission();
      return permission === 'granted';
    }

    return false;
  }

  static notify(title: string, options: NotificationOptions = {}) {
    if (Notification.permission === 'granted') {
      const notification = new Notification(title, {
        icon: '/nirvana-icon.png',
        badge: '/nirvana-badge.png',
        ...options
      });

      // Auto-close after 5 seconds
      setTimeout(() => notification.close(), 5000);

      return notification;
    }
  }

  static notifyMessage(senderName: string, message: string) {
    this.notify('New Message', {
      body: `${senderName}: ${message}`,
      tag: 'message',
      requireInteraction: false
    });
  }

  static notifyStockRequest(itemName: string, quantity: number) {
    this.notify('Stock Request Pending', {
      body: `${itemName} (${quantity} units) requested from shop`,
      tag: 'stock-request',
      requireInteraction: true
    });
  }

  static notifySale(itemName: string, quantity: number, total: number) {
    this.notify('New Sale', {
      body: `${itemName} x${quantity} - $${total.toFixed(2)}`,
      tag: 'sale',
      requireInteraction: false
    });
  }
}

import type { AppNotification, NotificationKind } from '../../../shared/types.ts';

// In-app notifications (the header bell). Kept in memory for the session, newest first.
const LIMIT = 50;

export class NotificationCenter {
  private items: AppNotification[] = [];
  private nextId = 1;

  constructor(private readonly onNew: (notification: AppNotification) => void = () => {}) {}

  push(kind: NotificationKind, title: string, body = ''): AppNotification {
    const notification: AppNotification = {
      id: this.nextId++, kind, title, body, created_at: new Date().toISOString(), read: false,
    };
    this.items = [notification, ...this.items].slice(0, LIMIT);
    this.onNew(notification);
    return notification;
  }

  list(): AppNotification[] {
    return this.items;
  }

  markAllRead() {
    this.items = this.items.map((n) => ({ ...n, read: true }));
  }
}

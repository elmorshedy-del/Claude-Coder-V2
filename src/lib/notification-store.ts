import path from 'path';
import fs from 'fs/promises';
import { randomUUID } from 'crypto';
import { Notification } from '@/types';

const DEFAULT_STORE_PATH = path.join(process.cwd(), 'data', 'notifications.json');

export class NotificationStore {
  private initialized = false;

  constructor(private filePath: string = DEFAULT_STORE_PATH) {}

  private async ensureInitialized() {
    if (this.initialized) return;
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    try {
      await fs.access(this.filePath);
    } catch {
      await fs.writeFile(this.filePath, '[]', 'utf-8');
    }
    this.initialized = true;
  }

  private async readAll(): Promise<Notification[]> {
    await this.ensureInitialized();
    const raw = await fs.readFile(this.filePath, 'utf-8');
    try {
      const parsed = JSON.parse(raw) as Notification[];
      return parsed.map((item) => ({
        ...item,
        createdAt: new Date(item.createdAt).toISOString(),
      }));
    } catch (error) {
      console.error('Failed to parse notifications file', { error });
      return [];
    }
  }

  private async writeAll(notifications: Notification[]) {
    await this.ensureInitialized();
    await fs.writeFile(this.filePath, JSON.stringify(notifications, null, 2), 'utf-8');
  }

  async add(notification: Omit<Notification, 'id'> & { id?: string }): Promise<Notification> {
    const current = await this.readAll();
    const withDefaults: Notification = {
      id: notification.id || randomUUID(),
      createdAt: notification.createdAt || new Date().toISOString(),
      ...notification,
    } as Notification;
    current.push(withDefaults);
    await this.writeAll(current);
    return withDefaults;
  }

  async addMany(notifications: Array<Omit<Notification, 'id'> & { id?: string }>): Promise<Notification[]> {
    const current = await this.readAll();
    const normalized = notifications.map((notification) => ({
      id: notification.id || randomUUID(),
      createdAt: notification.createdAt || new Date().toISOString(),
      ...notification,
    })) as Notification[];
    current.push(...normalized);
    await this.writeAll(current);
    return normalized;
  }

  async list(limit = 50): Promise<Notification[]> {
    const current = await this.readAll();
    return current
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, limit);
  }
}

let cachedStore: NotificationStore | null = null;
let cachedPath: string | null = null;

export function getNotificationStore(): NotificationStore {
  const targetPath = process.env.NOTIFICATION_STORE_PATH
    ? path.resolve(process.env.NOTIFICATION_STORE_PATH)
    : DEFAULT_STORE_PATH;

  if (!cachedStore || cachedPath !== targetPath) {
    cachedPath = targetPath;
    cachedStore = new NotificationStore(targetPath);
  }

  return cachedStore;
}

export const notificationStore = getNotificationStore();

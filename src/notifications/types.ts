export const NOTIFICATION_TYPES = ["badge", "live", "follow", "raid", "redeem", "system"] as const;

export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export interface NotificationItem {
    id: number;
    type: string;
    title: string;
    body: string | null;
    linkUrl: string | null;
    icon: string | null;
    read: boolean;
    createdAt: number;
}

export interface NotificationPage {
    notifications: NotificationItem[];
    unreadCount: number;
}

export interface NotificationState {
    items: NotificationItem[];
    unreadCount: number;
    loading: boolean;
    loaded: boolean;
    exhausted: boolean;
    error: string;
}

export interface ToastInput {
    type?: string;
    title: string;
    body?: string | null;
    linkUrl?: string | null;
    icon?: string | null;
}

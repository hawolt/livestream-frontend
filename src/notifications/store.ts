import { compareNotifications } from "./wire.ts";
import type { NotificationItem, NotificationState } from "./types.ts";

export type NotificationListener = (state: NotificationState) => void;

export interface NotificationStore {
    getState(): NotificationState;
    subscribe(listener: NotificationListener): () => void;
    setLoading(loading: boolean): void;
    setError(message: string): void;
    receiveFirstPage(items: NotificationItem[], unreadCount: number, exhausted: boolean): void;
    receiveNextPage(items: NotificationItem[], exhausted: boolean): void;
    receiveLive(item: NotificationItem): boolean;
    markRead(ids: number[], serverUnreadCount?: number): number;
    markAllRead(serverUnreadCount?: number): number;
    oldestId(): number | null;
    reset(): void;
}

function emptyState(): NotificationState {
    return {
        items: [],
        unreadCount: 0,
        loading: false,
        loaded: false,
        exhausted: false,
        error: "",
    };
}

function clampCount(count: number): number {
    if (!Number.isFinite(count) || count < 0) return 0;
    return Math.floor(count);
}

export function createNotificationStore(): NotificationStore {
    let state = emptyState();
    const listeners = new Set<NotificationListener>();

    function emit(): void {
        const snapshot = state;
        for (const listener of [...listeners]) listener(snapshot);
    }

    function commit(next: Partial<NotificationState>): void {
        state = { ...state, ...next };
        emit();
    }

    function mergeOlder(existing: NotificationItem[], incoming: NotificationItem[]): NotificationItem[] {
        const known = new Set(existing.map(item => item.id));
        const merged = [...existing];
        for (const item of incoming) {
            if (known.has(item.id)) continue;
            known.add(item.id);
            merged.push(item);
        }
        merged.sort(compareNotifications);
        return merged;
    }

    return {
        getState() {
            return state;
        },
        subscribe(listener) {
            listeners.add(listener);
            listener(state);
            return () => {
                listeners.delete(listener);
            };
        },
        setLoading(loading) {
            if (state.loading === loading) return;
            commit({ loading });
        },
        setError(message) {
            if (state.error === message) return;
            commit({ error: message, loading: false });
        },
        receiveFirstPage(items, unreadCount, exhausted) {
            const merged = mergeOlder([], items);
            commit({
                items: merged,
                unreadCount: clampCount(unreadCount),
                loading: false,
                loaded: true,
                exhausted,
                error: "",
            });
        },
        receiveNextPage(items, exhausted) {
            commit({
                items: mergeOlder(state.items, items),
                loading: false,
                loaded: true,
                exhausted,
                error: "",
            });
        },
        receiveLive(item) {
            if (state.items.some(existing => existing.id === item.id)) return false;
            const items = [...state.items, item].sort(compareNotifications);
            commit({
                items,
                unreadCount: item.read ? state.unreadCount : state.unreadCount + 1,
                loaded: true,
            });
            return true;
        },
        markRead(ids, serverUnreadCount) {
            const targets = new Set(ids);
            let flipped = 0;
            const items = state.items.map(item => {
                if (item.read || !targets.has(item.id)) return item;
                flipped += 1;
                return { ...item, read: true };
            });
            const unreadCount = typeof serverUnreadCount === "number"
                ? clampCount(serverUnreadCount)
                : Math.max(0, state.unreadCount - flipped);
            if (flipped === 0 && unreadCount === state.unreadCount) return 0;
            commit({ items, unreadCount });
            return flipped;
        },
        markAllRead(serverUnreadCount) {
            let flipped = 0;
            const items = state.items.map(item => {
                if (item.read) return item;
                flipped += 1;
                return { ...item, read: true };
            });
            const unreadCount = typeof serverUnreadCount === "number" ? clampCount(serverUnreadCount) : 0;
            if (flipped === 0 && unreadCount === state.unreadCount) return 0;
            commit({ items, unreadCount });
            return flipped;
        },
        oldestId() {
            const last = state.items[state.items.length - 1];
            return last ? last.id : null;
        },
        reset() {
            state = emptyState();
            emit();
        },
    };
}

export const notificationStore = createNotificationStore();

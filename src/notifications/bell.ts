import { wireDropdown } from "../nav/dropdown.ts";
import { BELL_ICON } from "./icons.ts";
import { buildNotificationPanel } from "./panel.ts";
import { ensureNotificationStyles } from "./styles.ts";
import { loadFirstNotificationsPage } from "./controller.ts";
import { ensureToastHost } from "./toast-host.ts";
import { notificationStore } from "./store.ts";

const BADGE_CAP = 99;

export interface NotificationBell {
    element: HTMLElement;
    close(): void;
    destroy(): void;
}

function badgeLabel(unreadCount: number): string {
    return unreadCount > BADGE_CAP ? `${BADGE_CAP}+` : String(unreadCount);
}

function bellLabel(unreadCount: number): string {
    if (unreadCount === 0) return "Notifications";
    if (unreadCount === 1) return "Notifications, 1 unread";
    return `Notifications, ${badgeLabel(unreadCount)} unread`;
}

export function mountNotificationBell(container: HTMLElement): NotificationBell {
    ensureNotificationStyles();
    ensureToastHost();

    const element = document.createElement("div");
    element.className = "site-bell";

    const button = document.createElement("button");
    button.type = "button";
    button.className = "site-bell-btn";
    button.innerHTML = BELL_ICON;

    const badge = document.createElement("span");
    badge.className = "site-bell-badge";
    badge.hidden = true;
    badge.setAttribute("aria-hidden", "true");

    const panel = buildNotificationPanel();
    element.append(button, badge, panel.element);
    container.appendChild(element);

    const close = wireDropdown(element, button, panel.element, () => {
        void loadFirstNotificationsPage();
    });

    const unsubscribe = notificationStore.subscribe(state => {
        const unread = state.unreadCount;
        badge.hidden = unread === 0;
        badge.textContent = badgeLabel(unread);
        button.classList.toggle("unread", unread > 0);
        button.title = bellLabel(unread);
        button.setAttribute("aria-label", bellLabel(unread));
    });

    return {
        element,
        close: () => close(),
        destroy() {
            unsubscribe();
            panel.destroy();
            element.remove();
        },
    };
}

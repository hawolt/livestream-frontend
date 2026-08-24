import { relativeDate } from "../live/about/relative-date.ts";
import { notificationIcon } from "./icons.ts";
import { safeNotificationHref } from "./link.ts";
import { loadMoreNotifications, markAllNotificationsReadNow, markNotificationRead } from "./controller.ts";
import { notificationStore } from "./store.ts";
import type { NotificationItem, NotificationState } from "./types.ts";

const SCROLL_THRESHOLD_PX = 80;

export interface NotificationPanel {
    element: HTMLElement;
    destroy(): void;
}

function note(text: string): HTMLElement {
    const el = document.createElement("li");
    el.className = "site-inbox-note";
    el.textContent = text;
    return el;
}

function stateSignature(state: NotificationState): string {
    return [
        state.unreadCount,
        state.loading,
        state.loaded,
        state.exhausted,
        state.error,
        state.items.map(item => `${item.id}:${item.read ? 1 : 0}`).join(","),
    ].join("|");
}

function buildItem(item: NotificationItem): HTMLElement {
    const row = document.createElement("li");
    const href = safeNotificationHref(item.linkUrl);
    const control = document.createElement(href ? "a" : "button") as HTMLElement;
    control.className = item.read ? "site-inbox-item" : "site-inbox-item unread";
    if (href) {
        (control as HTMLAnchorElement).href = href;
    } else {
        (control as HTMLButtonElement).type = "button";
    }

    const icon = document.createElement("span");
    icon.className = "site-inbox-icon";
    icon.innerHTML = notificationIcon(item.icon ?? item.type);

    const text = document.createElement("span");
    text.className = "site-inbox-text";
    const title = document.createElement("span");
    title.className = "site-inbox-title";
    title.textContent = item.title;
    text.appendChild(title);
    if (item.body) {
        const body = document.createElement("span");
        body.className = "site-inbox-body";
        body.textContent = item.body;
        text.appendChild(body);
    }
    if (item.createdAt > 0) {
        const date = document.createElement("span");
        date.className = "site-inbox-date";
        date.textContent = relativeDate(new Date(item.createdAt * 1000).toISOString());
        text.appendChild(date);
    }

    control.append(icon, text);
    control.addEventListener("click", () => {
        void markNotificationRead(item.id);
    });
    row.appendChild(control);
    return row;
}

export function buildNotificationPanel(): NotificationPanel {
    const element = document.createElement("div");
    element.className = "site-inbox";
    element.hidden = true;

    const head = document.createElement("div");
    head.className = "site-inbox-head";
    const heading = document.createElement("span");
    heading.textContent = "Notifications";
    const readAll = document.createElement("button");
    readAll.type = "button";
    readAll.className = "site-inbox-readall";
    readAll.textContent = "Mark all read";
    readAll.addEventListener("click", () => {
        void markAllNotificationsReadNow();
    });
    head.append(heading, readAll);

    const list = document.createElement("ul");
    list.className = "site-inbox-list";
    list.setAttribute("aria-label", "Notifications");
    list.addEventListener("scroll", () => {
        const distance = list.scrollHeight - list.scrollTop - list.clientHeight;
        if (distance <= SCROLL_THRESHOLD_PX) void loadMoreNotifications();
    });

    element.append(head, list);

    let signature = "";

    function render(state: NotificationState): void {
        const next = stateSignature(state);
        if (next === signature) return;
        signature = next;
        readAll.disabled = state.unreadCount === 0;
        const rows: HTMLElement[] = state.items.map(buildItem);
        if (!rows.length) {
            if (state.loading && !state.loaded) rows.push(note("Loading notifications…"));
            else if (state.error) rows.push(note(state.error));
            else rows.push(note("Nothing yet. Follows, raids and badges land here."));
        } else if (state.error) {
            rows.push(note(state.error));
        } else if (!state.exhausted) {
            const more = document.createElement("li");
            more.className = "site-inbox-more";
            more.textContent = state.loading ? "Loading…" : "Scroll for more";
            rows.push(more);
        }
        list.replaceChildren(...rows);
    }

    const unsubscribe = notificationStore.subscribe(render);

    return {
        element,
        destroy() {
            unsubscribe();
            element.remove();
        },
    };
}

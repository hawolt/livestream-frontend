const rows = new Map<string, HTMLDivElement>();
const timers = new Map<string, number>();
const ID_RE = /^[a-z0-9-]{1,32}$/;

function containerEl(): HTMLElement | null {
    return document.getElementById("live-chat-notices");
}

export function showNotice(id: string, build: (root: HTMLDivElement) => void, opts?: { ttlMs?: number }): void {
    if (!ID_RE.test(id)) return;
    const host = containerEl();
    if (!host) return;
    const oldTimer = timers.get(id);
    if (oldTimer !== undefined) {
        window.clearTimeout(oldTimer);
        timers.delete(id);
    }
    let row = rows.get(id);
    if (!row || !row.isConnected) {
        row = document.createElement("div");
        rows.set(id, row);
        host.appendChild(row);
    }
    row.className = "live-chat-pin live-chat-notice";
    row.replaceChildren();
    build(row);
    host.hidden = false;
    const ttl = opts?.ttlMs;
    if (ttl !== undefined && ttl > 0) {
        timers.set(id, window.setTimeout(() => removeNotice(id), ttl));
    }
}

export function removeNotice(id: string): void {
    const timer = timers.get(id);
    if (timer !== undefined) {
        window.clearTimeout(timer);
        timers.delete(id);
    }
    const row = rows.get(id);
    if (row) {
        rows.delete(id);
        row.remove();
    }
    const host = containerEl();
    if (host && rows.size === 0) host.hidden = true;
}

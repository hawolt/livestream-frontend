export function formatUptime(total: number): string {
    const t = Math.max(0, Math.floor(total));
    const d = Math.floor(t / 86400);
    const h = Math.floor((t % 86400) / 3600);
    const m = Math.floor((t % 3600) / 60);
    const s = t % 60;
    const mm = String(m).padStart(2, "0");
    const ss = String(s).padStart(2, "0");
    if (d > 0) return `${d}:${String(h).padStart(2, "0")}:${mm}:${ss}`;
    if (h > 0) return `${h}:${mm}:${ss}`;
    return `${m}:${ss}`;
}

export function formatBehind(s: number): string {
    const total = Math.max(0, Math.round(s));
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const sec = total % 60;
    const mm = h > 0 ? String(m).padStart(2, "0") : String(m);
    const ss = String(sec).padStart(2, "0");
    return h > 0 ? `-${h}:${mm}:${ss}` : `-${mm}:${ss}`;
}

export function formatUptime(total: number): string {
    const d = Math.floor(total / 86400);
    const h = Math.floor((total % 86400) / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    const hh = String(h).padStart(2, "0");
    const mm = String(m).padStart(2, "0");
    const ss = String(s).padStart(2, "0");
    return `${d}:${hh}:${mm}:${ss}`;
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

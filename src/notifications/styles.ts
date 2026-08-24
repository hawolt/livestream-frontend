const STYLE_ID = "site-notification-styles";

const CSS = `
.site-bell { position: relative; display: flex; align-items: center; }
.site-bell-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: none;
    color: var(--dim);
    cursor: pointer;
    padding: 0;
    transition: color .15s, border-color .15s;
}
.site-bell-btn:hover { color: var(--text); border-color: var(--accent); }
.site-bell-btn.unread { color: var(--accent); }
.site-bell-badge {
    position: absolute;
    top: -5px;
    right: -5px;
    min-width: 16px;
    height: 16px;
    padding: 0 4px;
    border-radius: 8px;
    background: var(--accent);
    color: var(--bg);
    font-size: 10px;
    line-height: 16px;
    text-align: center;
    font-family: var(--font-ui);
}
.site-bell-badge[hidden] { display: none; }

.site-inbox {
    position: absolute;
    top: calc(100% + 8px);
    right: 0;
    width: 320px;
    max-width: calc(100vw - 24px);
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    box-shadow: var(--shadow);
    display: flex;
    flex-direction: column;
    z-index: 60;
}
.site-inbox[hidden] { display: none; }
.site-inbox-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 8px 10px;
    border-bottom: 1px solid var(--border);
    font-size: 12px;
    color: var(--muted);
}
.site-inbox-readall {
    background: none;
    border: none;
    padding: 2px 4px;
    font-family: inherit;
    font-size: 12px;
    color: var(--accent);
    cursor: pointer;
}
.site-inbox-readall:disabled { color: var(--muted); cursor: default; }
.site-inbox-list {
    list-style: none;
    margin: 0;
    padding: 4px;
    max-height: 60vh;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 2px;
}
.site-inbox-item {
    display: flex;
    gap: 8px;
    width: 100%;
    text-align: left;
    padding: 8px 10px;
    background: none;
    border: none;
    border-radius: calc(var(--radius) - 2px);
    color: var(--muted);
    font-family: inherit;
    font-size: 13px;
    text-decoration: none;
    cursor: pointer;
}
.site-inbox-item:hover { background: rgba(255, 255, 255, .06); text-decoration: none; }
.site-inbox-item.unread { color: var(--text); background: var(--accent-pale); }
.site-inbox-item.unread:hover { background: var(--accent-pale); }
.site-inbox-icon { flex: 0 0 auto; color: var(--accent); padding-top: 1px; }
.site-inbox-text { min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.site-inbox-title { font-size: 13px; color: inherit; }
.site-inbox-body { font-size: 12px; color: var(--muted); overflow-wrap: anywhere; }
.site-inbox-date { font-size: 11px; color: var(--dim); }
.site-inbox-note {
    padding: 18px 12px;
    text-align: center;
    font-size: 12px;
    color: var(--muted);
}
.site-inbox-more { padding: 8px; text-align: center; font-size: 11px; color: var(--dim); }

.site-toasts {
    position: fixed;
    right: 16px;
    bottom: 16px;
    z-index: 200;
    display: flex;
    flex-direction: column;
    gap: 8px;
    width: 300px;
    max-width: calc(100vw - 32px);
    pointer-events: none;
}
.site-toast {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    padding: 10px;
    background: var(--surface);
    border: 1px solid var(--border);
    border-left: 2px solid var(--accent);
    border-radius: var(--radius);
    box-shadow: var(--shadow);
    pointer-events: auto;
    animation: site-toast-in .18s ease-out;
}
.site-toast-link {
    display: flex;
    gap: 8px;
    flex: 1 1 auto;
    min-width: 0;
    color: var(--text);
    text-decoration: none;
    font-family: inherit;
    font-size: 13px;
    text-align: left;
    background: none;
    border: none;
    padding: 0;
    cursor: pointer;
}
.site-toast-link:hover { text-decoration: none; color: var(--accent-light); }
.site-toast-icon { flex: 0 0 auto; color: var(--accent); padding-top: 1px; }
.site-toast-text { min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.site-toast-title { font-size: 13px; color: inherit; }
.site-toast-body { font-size: 12px; color: var(--muted); overflow-wrap: anywhere; }
.site-toast-close {
    flex: 0 0 auto;
    background: none;
    border: none;
    padding: 0;
    color: var(--dim);
    cursor: pointer;
    line-height: 0;
}
.site-toast-close:hover { color: var(--text); }
.site-toast.leaving { animation: site-toast-out .16s ease-in forwards; }

@keyframes site-toast-in { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
@keyframes site-toast-out { from { opacity: 1; } to { opacity: 0; transform: translateY(4px); } }

@media (prefers-reduced-motion: reduce) {
    .site-toast, .site-toast.leaving { animation: none; }
}
`;

export function ensureNotificationStyles(): void {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = CSS;
    document.head.appendChild(style);
}

import { ctx } from "./context.ts";

type UpsellState = "unknown" | "show" | "hide";

let state: UpsellState = "unknown";
let fetching = false;
let tipEl: HTMLDivElement | null = null;
let hideTimer: number | null = null;

async function resolveState(): Promise<void> {
    if (fetching || state !== "unknown") return;
    fetching = true;
    try {
        const token = ctx.accountSessionToken;
        if (!token) {
            state = "show";
            return;
        }
        const res = await fetch("/api/billing/tiers", { headers: { Authorization: `Bearer ${token}` } });
        if (!res.ok) {
            state = "show";
            return;
        }
        const data = await res.json() as { enabled?: boolean; current?: unknown };
        state = data.enabled === false ? "hide" : data.current ? "hide" : "show";
    } catch {
        state = "show";
    } finally {
        fetching = false;
    }
}

function removeTip(): void {
    if (hideTimer !== null) {
        window.clearTimeout(hideTimer);
        hideTimer = null;
    }
    if (tipEl) {
        tipEl.remove();
        tipEl = null;
    }
}

function scheduleRemove(): void {
    if (hideTimer !== null) window.clearTimeout(hideTimer);
    hideTimer = window.setTimeout(removeTip, 200);
}

function showTip(anchor: HTMLElement): void {
    if (state !== "show") return;
    removeTip();
    const tip = document.createElement("div");
    tip.className = "live-chat-badge-tip";
    const text = document.createElement("span");
    text.textContent = "Cosmetic subscription badge.";
    const link = document.createElement("a");
    link.href = "/dashboard/subscription";
    link.target = "_blank";
    link.rel = "noopener";
    link.textContent = "Get yours";
    tip.append(text, link);
    tip.addEventListener("mouseenter", () => {
        if (hideTimer !== null) {
            window.clearTimeout(hideTimer);
            hideTimer = null;
        }
    });
    tip.addEventListener("mouseleave", scheduleRemove);
    const rect = anchor.getBoundingClientRect();
    tip.style.left = `${Math.round(rect.left)}px`;
    tip.style.top = `${Math.round(rect.bottom + 4)}px`;
    document.body.appendChild(tip);
    tipEl = tip;
}

export function attachBadgeUpsell(img: HTMLElement): void {
    if (document.body.classList.contains("chat-popout")) return;
    img.addEventListener("mouseenter", () => {
        void resolveState();
        showTip(img);
    });
    img.addEventListener("mouseleave", scheduleRemove);
}

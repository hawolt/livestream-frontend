import { API_BASE } from "../api.ts";
import { ctx } from "./context.ts";
import { subscriberBadgeAssetPath, subscriberBadgeTitle } from "./badges.ts";

const BADGE_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l2.4 6.2 6.6.4-5.1 4.2 1.7 6.4-5.6-3.6-5.6 3.6 1.7-6.4-5.1-4.2 6.6-.4z"/></svg>`;

let buttonEl: HTMLButtonElement | null = null;
let popEl: HTMLDivElement | null = null;
let outsideHandler: ((e: MouseEvent) => void) | null = null;

interface BadgeState {
    selected: string | null;
    owned: string[];
}

async function fetchState(): Promise<BadgeState | null> {
    const token = ctx.accountSessionToken;
    if (!token) return null;
    try {
        const res = await fetch(`${API_BASE}/settings/chat-badge`, { headers: { Authorization: `Bearer ${token}` } });
        if (!res.ok) return null;
        const data = await res.json() as { selected?: string | null; owned?: string[] };
        return { selected: data.selected ?? null, owned: Array.isArray(data.owned) ? data.owned : [] };
    } catch {
        return null;
    }
}

async function saveSelection(badge: string): Promise<boolean> {
    const token = ctx.accountSessionToken;
    if (!token) return false;
    try {
        const res = await fetch(`${API_BASE}/settings/chat-badge`, {
            method: "PUT",
            headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
            body: JSON.stringify({ badge }),
        });
        return res.ok;
    } catch {
        return false;
    }
}

function closePop(): void {
    if (popEl) {
        popEl.remove();
        popEl = null;
    }
    if (outsideHandler) {
        document.removeEventListener("mousedown", outsideHandler);
        outsideHandler = null;
    }
    buttonEl?.classList.remove("active");
    buttonEl?.setAttribute("aria-expanded", "false");
}

function renderPop(state: BadgeState): void {
    if (!buttonEl) return;
    closePop();
    const pop = document.createElement("div");
    pop.className = "live-chat-badge-pop";
    pop.setAttribute("role", "dialog");
    pop.setAttribute("aria-label", "Chat badge");

    const makeTile = (label: string, selected: boolean, onPick: () => void, imgName?: string): HTMLButtonElement => {
        const tile = document.createElement("button");
        tile.type = "button";
        tile.className = "live-chat-badge-tile";
        if (selected) tile.classList.add("active");
        tile.title = label;
        tile.setAttribute("aria-label", label);
        if (imgName) {
            const img = document.createElement("img");
            img.src = subscriberBadgeAssetPath(imgName);
            img.alt = label;
            tile.appendChild(img);
        } else {
            tile.textContent = "×";
            tile.classList.add("live-chat-badge-none");
        }
        tile.addEventListener("click", () => {
            void onPick();
        });
        return tile;
    };

    const pick = (badge: string): void => {
        void saveSelection(badge).then(ok => {
            if (!ok) return;
            closePop();
        });
    };

    pop.appendChild(makeTile("No badge", state.selected === "", () => pick("")));
    for (const name of state.owned) {
        pop.appendChild(makeTile(subscriberBadgeTitle(name), state.selected === name, () => pick(name), name));
    }
    if (state.owned.length === 0) {
        const empty = document.createElement("span");
        empty.className = "live-chat-badge-empty";
        empty.textContent = "No badges yet";
        pop.appendChild(empty);
    }

    buttonEl.parentElement?.appendChild(pop);
    buttonEl.classList.add("active");
    buttonEl.setAttribute("aria-expanded", "true");
    outsideHandler = (e: MouseEvent): void => {
        const target = e.target as Node;
        if (pop.contains(target) || buttonEl?.contains(target)) return;
        closePop();
    };
    document.addEventListener("mousedown", outsideHandler);
    popEl = pop;
}

function togglePop(): void {
    if (popEl) {
        closePop();
        return;
    }
    void fetchState().then(state => {
        if (state) renderPop(state);
    });
}

export function initBadgePicker(settingsBtn: HTMLButtonElement): void {
    if (buttonEl) return;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.id = "btn-chat-badge";
    btn.className = "live-chat-gear-btn";
    btn.title = "Chat badge";
    btn.setAttribute("aria-label", "Chat badge");
    btn.setAttribute("aria-haspopup", "dialog");
    btn.setAttribute("aria-expanded", "false");
    btn.innerHTML = BADGE_ICON;
    btn.addEventListener("click", togglePop);
    settingsBtn.parentElement?.insertBefore(btn, settingsBtn);
    buttonEl = btn;
}

export function destroyBadgePicker(): void {
    closePop();
    if (buttonEl) {
        buttonEl.remove();
        buttonEl = null;
    }
}

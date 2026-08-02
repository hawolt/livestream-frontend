import { followBellEl, followBtnEl, followWrapEl } from "./dom.ts";
import { ctx } from "./player/context.ts";
import { API_BASE } from "../api.ts";
import { openLoginModal } from "./login-modal.ts";

let followLoggedIn = false;
let followOwn = false;
let following = false;
let followNotify = false;
let followWired = false;
let followRefreshRevision = 0;

export function canAutoFollow(): boolean {
    return followLoggedIn && !followOwn && !following;
}

export function renderFollow(): void {
    followWrapEl.hidden = false;
    if (followOwn) {
        followBtnEl.hidden = true;
        followBellEl.hidden = true;
        return;
    }
    followBtnEl.hidden = false;
    followBtnEl.textContent = following ? "Following" : "Follow";
    followBtnEl.classList.toggle("following", following);
    followBellEl.hidden = !following;
    followBellEl.classList.toggle("on", followNotify);
    followBellEl.title = followNotify ? "Email notifications on" : "Email me when this channel goes live";
}

function wireFollow(): void {
    if (followWired) return;
    followWired = true;
    followBtnEl.addEventListener("click", async () => {
        if (!followLoggedIn) {
            openLoginModal("follow");
            return;
        }
        followBtnEl.disabled = true;
        try {
            const method = following ? "DELETE" : "POST";
            const r = await fetch(`${API_BASE}/follows/${encodeURIComponent(ctx.username)}`, { method, credentials: "include" });
            if (r.ok) {
                const j = await r.json();
                following = !!j.following;
                if (following) followNotify = j.notify !== false;
                window.dispatchEvent(new CustomEvent("follow-changed"));
            }
        } catch {}
        followBtnEl.disabled = false;
        renderFollow();
    });
    followBellEl.addEventListener("click", async () => {
        if (!following) return;
        const next = !followNotify;
        followBellEl.disabled = true;
        try {
            const r = await fetch(`${API_BASE}/follows/${encodeURIComponent(ctx.username)}/notify`, {
                method: "PUT",
                credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ enabled: next }),
            });
            if (r.ok) {
                const j = await r.json();
                followNotify = !!j.notify;
            }
        } catch {}
        followBellEl.disabled = false;
        renderFollow();
    });
}

export async function initFollow(): Promise<void> {
    const revision = ++followRefreshRevision;
    let me = "";
    let nextFollowing = false;
    let nextNotify = false;
    try {
        const s = await fetch(`${API_BASE}/auth/session`, { credentials: "include" });
        if (s.ok) {
            const j = await s.json();
            me = String(j.username ?? "").toLowerCase();
        }
    } catch {}
    const nextLoggedIn = me !== "";
    const nextOwn = nextLoggedIn && me === ctx.username;
    if (nextLoggedIn && !nextOwn) {
        try {
            const st = await fetch(`${API_BASE}/follows/status?username=${encodeURIComponent(ctx.username)}`, { credentials: "include" });
            if (st.ok) {
                const j = await st.json();
                nextFollowing = !!j.following;
                nextNotify = !!j.notify;
            }
        } catch {}
    }
    if (revision !== followRefreshRevision) return;
    followLoggedIn = nextLoggedIn;
    followOwn = nextOwn;
    following = nextFollowing;
    followNotify = nextNotify;
    wireFollow();
    renderFollow();
}

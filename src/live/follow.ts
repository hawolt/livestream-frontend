import { followBellEl, followBtnEl, followWrapEl } from "./dom.ts";
import { ctx } from "./player/context.ts";
import { API_BASE } from "../api.ts";
import { openLoginModal } from "./login-modal.ts";
import { resolveFollowResponse } from "./follow-wire.ts";

let followLoggedIn = false;
let followOwn = false;
let followKnown = false;
let following = false;
let followNotify = false;
let followWired = false;
let followRefreshRevision = 0;
let followError: string | null = null;
let lastFollowing: boolean | null = null;

const FOLLOW_SESSION_RETRY_MS = 5000;

export function canAutoFollow(): boolean {
    return followLoggedIn && !followOwn && !following;
}

export function renderFollow(): void {
    if (!followKnown) {
        followWrapEl.hidden = true;
        return;
    }
    followWrapEl.hidden = false;
    if (followOwn) {
        followBtnEl.hidden = true;
        followBellEl.hidden = true;
        lastFollowing = null;
        return;
    }
    followBtnEl.hidden = false;
    followBtnEl.textContent = followError ? "Try again" : following ? "Following" : "Follow";
    followBtnEl.title = followError ?? "";
    followBtnEl.classList.toggle("following", following);
    followBellEl.hidden = !following;
    followBellEl.classList.toggle("on", followNotify);
    followBellEl.title = followError ?? (followNotify ? "Email notifications on" : "Email me when this channel goes live");
    if (lastFollowing !== null && lastFollowing !== following) popFollowButton();
    lastFollowing = following;
}

function popFollowButton(): void {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    followBtnEl.animate(
        [
            { transform: "scale(1)" },
            { transform: "scale(1.15)" },
            { transform: "scale(1)" },
        ],
        { duration: 300, easing: "ease-out" },
    );
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
        followError = null;
        try {
            const wasFollowing = following;
            const method = wasFollowing ? "DELETE" : "POST";
            const r = await fetch(`${API_BASE}/follows/${encodeURIComponent(ctx.username)}`, { method, credentials: "include" });
            const bodyText = await r.text();
            const result = resolveFollowResponse({ ok: r.ok, status: r.status, bodyText }, wasFollowing ? { kind: "unfollow" } : { kind: "follow" });
            if (result.kind === "follow") {
                following = result.following;
                if (following) followNotify = result.notify;
                window.dispatchEvent(new CustomEvent("follow-changed"));
            } else if (result.kind === "login-required") {
                followLoggedIn = false;
                openLoginModal("follow");
            } else {
                followError = "Could not update follow. Try again.";
            }
        } catch {
            followError = "Could not reach the server. Try again.";
        }
        followBtnEl.disabled = false;
        renderFollow();
    });
    followBellEl.addEventListener("click", async () => {
        if (!following) return;
        const next = !followNotify;
        followBellEl.disabled = true;
        followError = null;
        try {
            const r = await fetch(`${API_BASE}/follows/${encodeURIComponent(ctx.username)}/notify`, {
                method: "PUT",
                credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ enabled: next }),
            });
            const bodyText = await r.text();
            const result = resolveFollowResponse({ ok: r.ok, status: r.status, bodyText }, { kind: "notify", enabled: next });
            if (result.kind === "notify") {
                followNotify = result.notify;
            } else if (result.kind === "login-required") {
                followLoggedIn = false;
                openLoginModal("follow");
            } else {
                followError = "Could not update notifications. Try again.";
            }
        } catch {
            followError = "Could not reach the server. Try again.";
        }
        followBellEl.disabled = false;
        renderFollow();
    });
}

export async function initFollow(): Promise<void> {
    const revision = ++followRefreshRevision;
    let me = "";
    let kind = "";
    let nextFollowing = false;
    let nextNotify = false;
    let sessionFailed = false;
    try {
        const s = await fetch(`${API_BASE}/auth/session`, { credentials: "include" });
        if (s.ok) {
            const j = await s.json();
            me = String(j.username ?? "").toLowerCase();
            kind = String(j.kind ?? "");
        } else if (s.status !== 401) {
            sessionFailed = true;
        }
    } catch {
        sessionFailed = true;
    }
    if (sessionFailed) {
        if (revision !== followRefreshRevision) return;
        followKnown = false;
        renderFollow();
        window.setTimeout(() => {
            if (revision === followRefreshRevision) void initFollow();
        }, FOLLOW_SESSION_RETRY_MS);
        return;
    }
    const nextLoggedIn = me !== "";
    const nextOwn = nextLoggedIn && (kind !== "user" || me === ctx.username.toLowerCase());
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
    followKnown = true;
    followLoggedIn = nextLoggedIn;
    followOwn = nextOwn;
    following = nextFollowing;
    followNotify = nextNotify;
    followError = null;
    wireFollow();
    renderFollow();
}

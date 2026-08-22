import { subscriberBadgeAssetPath, subscriberBadgeTitle } from "./badges.ts";
import { hasModRole, nickColor } from "./members.ts";
import { inputEl } from "./dom.ts";
import { loadProfile } from "../profile-card.ts";
import { ctx, myNickLower } from "./context.ts";
import { send } from "./connection.ts";

let cardEl: HTMLElement | null = null;
let cardToken = 0;

export function closeUserCard(): void {
    cardEl?.remove();
    cardEl = null;
}

function positionCard(card: HTMLElement, anchor: DOMRect): void {
    const width = 260;
    const left = Math.max(8, Math.min(anchor.left, window.innerWidth - width - 8));
    card.style.left = `${Math.round(left)}px`;
    document.body.appendChild(card);
    const height = card.offsetHeight;
    const below = anchor.bottom + 6;
    const top = below + height > window.innerHeight - 8 ? Math.max(8, anchor.top - height - 6) : below;
    card.style.top = `${Math.round(top)}px`;
}

function wireDismiss(card: HTMLElement): void {
    const onDoc = (ev: MouseEvent): void => {
        if (ev.target instanceof Node && card.contains(ev.target)) return;
        cleanup();
    };
    const onKey = (ev: KeyboardEvent): void => {
        if (ev.key === "Escape") cleanup();
    };
    const cleanup = (): void => {
        document.removeEventListener("click", onDoc, true);
        document.removeEventListener("keydown", onKey);
        closeUserCard();
    };
    window.setTimeout(() => {
        document.addEventListener("click", onDoc, true);
        document.addEventListener("keydown", onKey);
    }, 0);
}

function monthYear(timestamp: number): string {
    return new Date(timestamp).toLocaleString("en", { month: "short", year: "numeric" });
}

function fullDate(timestamp: number): string {
    return new Date(timestamp).toLocaleString("en", { day: "numeric", month: "short", year: "numeric" });
}

export function memberSince(createdAt: number | null): string {
    if (!createdAt) return "";
    return `Member since ${monthYear(createdAt)}`;
}

export function followingSinceLabel(followingSince: number | null): string {
    if (!followingSince || !Number.isFinite(followingSince)) return "";
    return `Following since ${fullDate(followingSince)}`;
}

export function openUserCard(username: string, anchor: DOMRect): void {
    closeUserCard();
    const token = ++cardToken;
    const card = document.createElement("div");
    card.className = "live-user-card";
    card.setAttribute("role", "dialog");
    card.setAttribute("aria-label", `${username} profile`);

    const head = document.createElement("div");
    head.className = "live-user-card-head";
    const fallback = document.createElement("div");
    fallback.className = "live-user-card-avatar-fallback";
    fallback.textContent = username.slice(0, 1);
    head.appendChild(fallback);
    const id = document.createElement("div");
    id.style.minWidth = "0";
    const name = document.createElement("div");
    name.className = "live-user-card-name";
    name.textContent = username;
    name.style.color = nickColor(username);
    id.appendChild(name);
    const meta = document.createElement("div");
    meta.className = "live-user-card-meta";
    meta.textContent = "Loading…";
    id.appendChild(meta);
    head.appendChild(id);
    card.appendChild(head);

    const actions = document.createElement("div");
    actions.className = "live-user-card-actions";
    const mention = document.createElement("button");
    mention.type = "button";
    mention.textContent = "Mention";
    mention.addEventListener("click", () => {
        if (!inputEl.disabled) {
            const prefix = inputEl.value && !inputEl.value.endsWith(" ") ? " " : "";
            inputEl.value += `${prefix}@${username} `;
            inputEl.focus();
        }
        closeUserCard();
    });
    actions.appendChild(mention);
    card.appendChild(actions);

    if (ctx.joined && hasModRole() && username.toLowerCase() !== myNickLower()) {
        const mod = document.createElement("div");
        mod.className = "live-user-card-actions live-user-card-mod";
        const timeout = document.createElement("button");
        timeout.type = "button";
        timeout.textContent = "Timeout 10m";
        timeout.addEventListener("click", () => {
            send(`PRIVMSG ${ctx.channel} :.timeout ${username} 10`);
            closeUserCard();
        });
        const ban = document.createElement("button");
        ban.type = "button";
        ban.className = "live-user-card-ban";
        ban.textContent = "Ban";
        ban.addEventListener("click", () => {
            send(`PRIVMSG ${ctx.channel} :.ban ${username}`);
            closeUserCard();
        });
        const unban = document.createElement("button");
        unban.type = "button";
        unban.textContent = "Unban";
        unban.addEventListener("click", () => {
            send(`PRIVMSG ${ctx.channel} :.unban ${username}`);
            closeUserCard();
        });
        mod.append(timeout, ban, unban);
        card.appendChild(mod);
    }

    positionCard(card, anchor);
    wireDismiss(card);
    cardEl = card;

    void loadProfile(username, ctx.channel.replace(/^#/, "")).then(profile => {
        if (token !== cardToken || cardEl !== card) return;
        if (!profile) {
            meta.textContent = "Guest viewer";
            return;
        }
        name.textContent = profile.username;
        if (profile.hasAvatar) {
            const img = document.createElement("img");
            img.className = "live-user-card-avatar";
            img.src = `/api/live/profile/${encodeURIComponent(profile.username)}/avatar?v=${profile.avatarVersion}`;
            img.alt = "";
            img.addEventListener("error", () => img.replaceWith(fallback));
            fallback.replaceWith(img);
        }
        meta.textContent = memberSince(profile.createdAt) || " ";
        if (profile.streamer) {
            const followers = document.createElement("div");
            followers.className = "live-user-card-meta";
            followers.textContent = profile.followers === 1 ? "1 follower" : `${profile.followers} followers`;
            id.appendChild(followers);
        }
        const followingLabel = followingSinceLabel(profile.followingSince);
        if (followingLabel) {
            const following = document.createElement("div");
            following.className = "live-user-card-meta";
            following.textContent = followingLabel;
            id.appendChild(following);
        }
        if (profile.badges.length) {
            const shelf = document.createElement("div");
            shelf.className = "live-user-card-badges";
            for (const badge of profile.badges) {
                const img = document.createElement("img");
                img.src = subscriberBadgeAssetPath(badge);
                img.alt = badge;
                img.title = subscriberBadgeTitle(badge);
                img.addEventListener("error", () => img.remove());
                shelf.appendChild(img);
            }
            card.insertBefore(shelf, actions);
        }
        if (profile.streamer) {
            const visit = document.createElement("a");
            visit.href = `/${encodeURIComponent(profile.username)}`;
            visit.textContent = "Visit channel";
            visit.target = "_blank";
            visit.rel = "noopener";
            actions.appendChild(visit);
        }
        positionCard(card, anchor);
    });
}

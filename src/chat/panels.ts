import { ctx } from "./context.ts";
import {
    avatarToggleEl,
    helpBodyEl,
    helpBtnEl,
    helpEl,
    helpFootEl,
    msgsEl,
    pingMuteToggleEl,
    profileBodyEl,
    profileBtnEl,
    profileEl,
    settingsBtnEl,
    settingsEl,
    timestampToggleEl,
    userlistBodyEl,
    userlistEl,
    usersBtnEl,
} from "./dom.ts";
import { send } from "./connection.ts";
import { buildBadges, makeBadge, type BadgeName } from "./badges.ts";
import { memberDisplay, memberRankBucket, nickColor, USERLIST_GROUPS } from "./members.ts";
import { loadProfile, renderProfileCard, type Profile } from "../profile-card.ts";

export const TIMESTAMPS_KEY = "live-chat-timestamps";
export const AVATARS_KEY = "live-chat-avatars";
export const MUTE_PINGS_KEY = "live-chat-mute-pings";

export function renderUserlist(): void {
    const byBucket = new Map<number, string[]>();
    for (const [key, display] of memberDisplay) {
        const b = memberRankBucket(key);
        (byBucket.get(b) ?? byBucket.set(b, []).get(b)!).push(display);
    }
    userlistBodyEl.replaceChildren();
    let total = 0;
    for (const g of USERLIST_GROUPS) {
        const names = byBucket.get(g.bucket);
        if (!names || !names.length) continue;
        names.sort((a, b) => a.localeCompare(b));
        const header = document.createElement("div");
        header.className = "live-chat-userlist-group";
        header.textContent = g.label;
        const groupCount = document.createElement("span");
        groupCount.className = "live-chat-userlist-count";
        groupCount.textContent = `(${names.length})`;
        header.appendChild(groupCount);
        userlistBodyEl.appendChild(header);
        for (const name of names) {
            total++;
            const item = document.createElement("div");
            item.className = "live-chat-userlist-item";
            for (const badge of buildBadges(name)) item.appendChild(badge);
            const n = document.createElement("span");
            n.className = "n";
            n.textContent = name;
            n.style.color = nickColor(name);
            item.appendChild(n);
            userlistBodyEl.appendChild(item);
        }
    }
    const title = document.getElementById("live-chat-userlist-title");
    if (title) {
        title.textContent = "Viewers ";
        const titleCount = document.createElement("span");
        titleCount.className = "live-chat-userlist-count";
        titleCount.textContent = `(${total})`;
        title.appendChild(titleCount);
    }
    if (!total) {
        const empty = document.createElement("div");
        empty.className = "live-chat-userlist-group";
        empty.textContent = "No one here yet";
        userlistBodyEl.appendChild(empty);
    }
}

export function setUserlist(open: boolean): void {
    ctx.userlistOpen = open;
    usersBtnEl.classList.toggle("active", open);
    userlistEl.hidden = !open;
    if (open) {
        setHelp(false);
        setSettings(false);
        setProfile(false);
        renderUserlist();
        send(`NAMES ${ctx.channel}`);
    }
}

export function toggleUserlist(): void {
    setUserlist(!ctx.userlistOpen);
}

const HELP_COMMANDS: { group: string; badge?: BadgeName; items: [string, string][] }[] = [
    {
        group: "Everyone",
        items: [
            ["@name", "Mention someone - Tab to autocomplete, keep pressing Tab to cycle."],
            [":emote", "Insert a 7TV emote - Tab to autocomplete, keep pressing Tab to cycle."],
            ["/whisper <user> <msg>", "Send a private message (alias /w). Commands also work with a . prefix."],
            ["Reply", "Hover a message and click ↩ to reply to it."],
        ],
    },
    {
        group: "Moderators & above",
        badge: "mod",
        items: [
            ["/ban <user>", "Ban a user from the channel."],
            ["/timeout <user> <min>", "Temporarily ban (1-10080 minutes)."],
            ["/unban <user>", "Lift a ban."],
            ["/pin <id> / /unpin", "Pin/unpin a message (use the 📌 hover action)."],
            ["/delete <id>", "Delete a message (use the ✕ hover action)."],
        ],
    },
    {
        group: "Channel owner",
        badge: "op",
        items: [
            ["/mod / /unmod <user>", "Grant or remove a moderator."],
            ["/vip / /unvip <user>", "Grant or remove VIP."],
        ],
    },
];

export function buildHelp(): void {
    helpBodyEl.replaceChildren();
    for (const section of HELP_COMMANDS) {
        const card = document.createElement("div");
        card.className = "live-chat-help-card";

        const head = document.createElement("div");
        head.className = "live-chat-help-card-head";
        if (section.badge) head.appendChild(makeBadge(section.badge));
        const h4 = document.createElement("h4");
        h4.textContent = section.group;
        head.appendChild(h4);
        card.appendChild(head);

        const rows = document.createElement("div");
        rows.className = "live-chat-help-cmds";
        for (const [cmd, desc] of section.items) {
            const row = document.createElement("div");
            row.className = "live-chat-help-cmd-row";
            const code = document.createElement("code");
            code.textContent = cmd;
            const d = document.createElement("span");
            d.className = "live-chat-help-cmd-desc";
            d.textContent = desc;
            row.append(code, d);
            rows.appendChild(row);
        }
        card.appendChild(rows);
        helpBodyEl.appendChild(card);
    }
    helpFootEl.textContent = "Commands are typed straight into chat. You only see the actions your role allows.";
    ctx.helpBuilt = true;
}

export function setHelp(open: boolean): void {
    ctx.helpOpen = open;
    helpBtnEl.classList.toggle("active", open);
    helpEl.hidden = !open;
    if (open) {
        setUserlist(false);
        setSettings(false);
        setProfile(false);
        if (!ctx.helpBuilt) buildHelp();
    }
}

export function toggleHelp(): void {
    setHelp(!ctx.helpOpen);
}

export function setSettings(open: boolean): void {
    ctx.settingsOpen = open;
    settingsBtnEl.classList.toggle("active", open);
    settingsEl.hidden = !open;
    if (open) {
        setUserlist(false);
        setHelp(false);
        setProfile(false);
    }
}

export function toggleSettings(): void {
    setSettings(!ctx.settingsOpen);
}

let profileData: Profile | null = null;
let profileLoadedFor = "";
let profileLoading = false;
let profileDefaultDecided = false;
let profileUserControlled = false;
let profileTargetUsername = "";

function currentProfileUsername(): string {
    return profileTargetUsername || ctx.channel.slice(1);
}

function loadProfileIfNeeded(username: string): void {
    if (!username || profileLoading || profileLoadedFor === username) return;
    profileLoading = true;
    void loadProfile(username).then(profile => {
        profileLoading = false;
        profileLoadedFor = username;
        profileData = profile;
        if (ctx.profileOpen && currentProfileUsername() === username) showProfileBody();
    });
}

function showProfileBody(): void {
    const username = currentProfileUsername();
    if (profileLoadedFor !== username) {
        profileBodyEl.textContent = "Loading...";
        loadProfileIfNeeded(username);
        return;
    }
    if (profileData) {
        renderProfileCard(profileBodyEl, profileData);
        return;
    }
    profileBodyEl.replaceChildren();
    const empty = document.createElement("div");
    empty.className = "profile-card-empty";
    empty.textContent = username.toLowerCase() === ctx.channel.slice(1).toLowerCase()
        ? "This channel has no profile yet."
        : "This user has no profile yet.";
    profileBodyEl.appendChild(empty);
}

export function setProfile(open: boolean): void {
    ctx.profileOpen = open;
    profileBtnEl.classList.toggle("active", open);
    profileEl.hidden = !open;
    if (!open) return;
    setUserlist(false);
    setHelp(false);
    setSettings(false);
    showProfileBody();
}

export function toggleProfile(): void {
    profileUserControlled = true;
    profileTargetUsername = "";
    setProfile(!ctx.profileOpen);
}

export function closeProfile(): void {
    profileUserControlled = true;
    setProfile(false);
}

export function openProfileFromUser(username?: string): void {
    profileUserControlled = true;
    profileTargetUsername = username ? username.trim() : "";
    setProfile(true);
}

export function applyDefaultProfileVisibility(offline: boolean): void {
    if (profileDefaultDecided || profileUserControlled) return;
    profileDefaultDecided = true;
    profileTargetUsername = "";
    setProfile(offline);
}

export function applyTimestampPref(on: boolean): void {
    msgsEl.classList.toggle("show-timestamps", on);
    timestampToggleEl.checked = on;
}

export function applyAvatarPref(on: boolean): void {
    msgsEl.classList.toggle("show-avatars", on);
    avatarToggleEl.checked = on;
}

export function applyMutePingsPref(on: boolean): void {
    ctx.pingsMuted = on;
    pingMuteToggleEl.checked = on;
}

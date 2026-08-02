import { ctx } from "./context.ts";
import {
    helpBodyEl,
    helpBtnEl,
    helpCloseEl,
    helpEl,
    helpFootEl,
    msgsEl,
    profileBodyEl,
    profileBtnEl,
    profileCloseEl,
    profileEl,
    settingsBtnEl,
    settingsCloseEl,
    settingsEl,
    timestampToggleEl,
    userlistBodyEl,
    userlistCloseEl,
    userlistEl,
    usersBtnEl,
} from "./dom.ts";
import { send } from "./connection.ts";
import { buildBadges, makeBadge, type BadgeName } from "./badges.ts";
import { memberDisplay, memberRankBucket, nickColor, USERLIST_GROUPS } from "./members.ts";
import { loadProfile, renderProfileCard, type Profile } from "../profile-card.ts";
import { closeDismissibleSurface, openDismissibleSurface } from "../dismissible-surface.ts";
import { inertSiblings, restoreInertSiblings, type InertSiblingState } from "../inert-siblings.ts";

export const TIMESTAMPS_KEY = "live-chat-timestamps";

interface ChatPanel {
    element: HTMLElement;
    trigger: HTMLButtonElement;
    close: HTMLButtonElement;
    open: () => boolean;
    setOpen: (open: boolean) => void;
}

interface PanelTransitionOptions {
    focus?: boolean;
    rememberFocus?: boolean;
    restoreFocus?: boolean;
}

const chatMoreEl = document.getElementById("btn-chat-more") as HTMLButtonElement;
const chatOverflowEl = document.getElementById("live-chat-overflow") as HTMLElement;
const userlistPanel: ChatPanel = {
    element: userlistEl,
    trigger: usersBtnEl,
    close: userlistCloseEl,
    open: () => ctx.userlistOpen,
    setOpen: open => { ctx.userlistOpen = open; },
};
const helpPanel: ChatPanel = {
    element: helpEl,
    trigger: helpBtnEl,
    close: helpCloseEl,
    open: () => ctx.helpOpen,
    setOpen: open => { ctx.helpOpen = open; },
};
const settingsPanel: ChatPanel = {
    element: settingsEl,
    trigger: settingsBtnEl,
    close: settingsCloseEl,
    open: () => ctx.settingsOpen,
    setOpen: open => { ctx.settingsOpen = open; },
};
const profilePanel: ChatPanel = {
    element: profileEl,
    trigger: profileBtnEl,
    close: profileCloseEl,
    open: () => ctx.profileOpen,
    setOpen: open => { ctx.profileOpen = open; },
};
const chatPanels = [userlistPanel, helpPanel, settingsPanel, profilePanel];

let activePanel: ChatPanel | null = null;
let panelReturnFocus: HTMLElement | null = null;
let panelInertState: InertSiblingState[] = [];

function focusBeforePanel(): HTMLElement | null {
    const active = document.activeElement;
    if (!(active instanceof HTMLElement) || active === document.body) return chatMoreEl;
    return chatOverflowEl.contains(active) ? chatMoreEl : active;
}

function updatePanelState(panel: ChatPanel, open: boolean): void {
    panel.setOpen(open);
    panel.trigger.classList.toggle("active", open);
    panel.trigger.setAttribute("aria-expanded", String(open));
    panel.element.hidden = !open;
    if (!open) closeDismissibleSurface(panel.element);
}

function restorePanelBackground(): void {
    restoreInertSiblings(panelInertState);
    panelInertState = [];
}

function openPanel(panel: ChatPanel, options: PanelTransitionOptions): void {
    if (options.rememberFocus && (!activePanel || panelReturnFocus === null)) panelReturnFocus = focusBeforePanel();
    if (activePanel !== panel) {
        for (const other of chatPanels) {
            if (other !== panel) updatePanelState(other, false);
        }
        restorePanelBackground();
        activePanel = panel;
        panelInertState = inertSiblings(panel.element);
    }
    updatePanelState(panel, true);
    openDismissibleSurface(panel.element, () => closePanel(panel, true));
    const active = document.activeElement;
    if (options.focus || (active instanceof HTMLElement && active.closest("[inert]"))) panel.close.focus();
}

function closePanel(panel: ChatPanel, restoreFocus: boolean): void {
    updatePanelState(panel, false);
    if (activePanel !== panel) return;
    activePanel = null;
    restorePanelBackground();
    const returnFocus = panelReturnFocus;
    panelReturnFocus = null;
    if (!restoreFocus) return;
    const target = returnFocus?.isConnected && returnFocus.offsetParent !== null && !returnFocus.closest("[inert]")
        ? returnFocus
        : chatMoreEl;
    if (target.isConnected && target.offsetParent !== null && !target.closest("[inert]")) target.focus();
}

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
        header.textContent = `${g.label} (${names.length})`;
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
    if (title) title.textContent = `Viewers (${total})`;
    if (!total) {
        const empty = document.createElement("div");
        empty.className = "live-chat-userlist-group";
        empty.textContent = "No one here yet";
        userlistBodyEl.appendChild(empty);
    }
}

export function setUserlist(open: boolean, options: PanelTransitionOptions = {}): void {
    if (!open) {
        closePanel(userlistPanel, options.restoreFocus === true);
        return;
    }
    openPanel(userlistPanel, options);
    renderUserlist();
    send(`NAMES ${ctx.channel}`);
}

export function toggleUserlist(): void {
    if (userlistPanel.open()) setUserlist(false, { restoreFocus: true });
    else setUserlist(true, { focus: true, rememberFocus: true });
}

const HELP_COMMANDS: { group: string; badge?: BadgeName; items: [string, string][] }[] = [
    {
        group: "Everyone",
        items: [
            ["@name", "Mention someone - Tab to autocomplete, keep pressing Tab to cycle."],
            [":emote", "Insert a 7TV emote - Tab to autocomplete, keep pressing Tab to cycle."],
            [".whisper <user> <msg>", "Send a private message (alias .w)."],
            ["Reply", "Hover a message and click ↩ to reply to it."],
        ],
    },
    {
        group: "Moderators & above",
        badge: "mod",
        items: [
            [".ban <user>", "Ban a user from the channel."],
            [".timeout <user> <min>", "Temporarily ban (1–10080 minutes)."],
            [".unban <user>", "Lift a ban."],
            [".pin <id> / .unpin", "Pin/unpin a message (use the 📌 hover action)."],
            [".delete <id>", "Delete a message (use the ✕ hover action)."],
        ],
    },
    {
        group: "Channel owner",
        badge: "op",
        items: [
            [".mod / .unmod <user>", "Grant or remove a moderator."],
            [".vip / .unvip <user>", "Grant or remove VIP."],
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

export function setHelp(open: boolean, options: PanelTransitionOptions = {}): void {
    if (!open) {
        closePanel(helpPanel, options.restoreFocus === true);
        return;
    }
    openPanel(helpPanel, options);
    if (!ctx.helpBuilt) buildHelp();
}

export function toggleHelp(): void {
    if (helpPanel.open()) setHelp(false, { restoreFocus: true });
    else setHelp(true, { focus: true, rememberFocus: true });
}

export function setSettings(open: boolean, options: PanelTransitionOptions = {}): void {
    if (!open) {
        closePanel(settingsPanel, options.restoreFocus === true);
        return;
    }
    openPanel(settingsPanel, options);
}

export function toggleSettings(): void {
    if (settingsPanel.open()) setSettings(false, { restoreFocus: true });
    else setSettings(true, { focus: true, rememberFocus: true });
}

let profileData: Profile | null = null;
let profileLoadedFor = "";
let profileLoading = false;
let profileDefaultDecided = false;
let profileUserControlled = false;

function loadProfileIfNeeded(): void {
    const username = ctx.channel.slice(1);
    if (!username || profileLoading || profileLoadedFor === username) return;
    profileLoading = true;
    void loadProfile(username).then(profile => {
        profileLoading = false;
        profileLoadedFor = username;
        profileData = profile;
        if (ctx.profileOpen) showProfileBody();
    });
}

function showProfileBody(): void {
    const username = ctx.channel.slice(1);
    if (profileLoadedFor !== username) {
        profileBodyEl.textContent = "Loading...";
        loadProfileIfNeeded();
        return;
    }
    if (profileData) {
        renderProfileCard(profileBodyEl, profileData);
        return;
    }
    profileBodyEl.replaceChildren();
    const empty = document.createElement("div");
    empty.className = "profile-card-empty";
    empty.textContent = "This channel has no profile yet.";
    profileBodyEl.appendChild(empty);
}

export function setProfile(open: boolean, options: PanelTransitionOptions = {}): void {
    if (!open) {
        closePanel(profilePanel, options.restoreFocus === true);
        return;
    }
    openPanel(profilePanel, options);
    showProfileBody();
}

export function toggleProfile(): void {
    profileUserControlled = true;
    if (profilePanel.open()) setProfile(false, { restoreFocus: true });
    else setProfile(true, { focus: true, rememberFocus: true });
}

export function closeProfile(): void {
    profileUserControlled = true;
    setProfile(false, { restoreFocus: true });
}

export function openProfileFromUser(): void {
    profileUserControlled = true;
    setProfile(true, { focus: true, rememberFocus: true });
}

export function applyDefaultProfileVisibility(offline: boolean): void {
    if (profileDefaultDecided || profileUserControlled) return;
    profileDefaultDecided = true;
    setProfile(offline && !document.body.classList.contains("chat-popout"));
}

export function applyTimestampPref(on: boolean): void {
    msgsEl.classList.toggle("show-timestamps", on);
    timestampToggleEl.checked = on;
}

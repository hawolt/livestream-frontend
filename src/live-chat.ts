import { API_BASE } from "./api.ts";
import { ChatEmoteCatalog, type ChatEmoteScope } from "./chat-emotes.ts";
import { applyReplacement, wrapIndex, type ReplaceRange } from "./chat-suggest.ts";
import { readLocalStorage, removeLocalStorage, writeLocalStorage } from "./storage.ts";

const msgsEl = document.getElementById("live-chat-messages") as HTMLElement;
const inputEl = document.getElementById("live-chat-input") as HTMLTextAreaElement;
const inputRowEl = document.getElementById("live-chat-inputrow") as HTMLElement;
const guestLoginEl = document.getElementById("live-chat-guest-login") as HTMLAnchorElement;
const verifyEl = document.getElementById("live-chat-verify") as HTMLAnchorElement;
const usersBtnEl = document.getElementById("btn-chat-users") as HTMLButtonElement;
const userlistEl = document.getElementById("live-chat-userlist") as HTMLElement;
const pinnedEl = document.getElementById("live-chat-pinned") as HTMLElement;
const userlistBodyEl = document.getElementById("live-chat-userlist-body") as HTMLElement;
const userlistCloseEl = document.getElementById("live-chat-userlist-close") as HTMLButtonElement;
const helpBtnEl = document.getElementById("btn-chat-help") as HTMLButtonElement;
const helpEl = document.getElementById("live-chat-help") as HTMLElement;
const helpBodyEl = document.getElementById("live-chat-help-body") as HTMLElement;
const helpFootEl = document.getElementById("live-chat-help-foot") as HTMLElement;
const helpCloseEl = document.getElementById("live-chat-help-close") as HTMLButtonElement;
const settingsBtnEl = document.getElementById("btn-chat-settings") as HTMLButtonElement;
const settingsEl = document.getElementById("live-chat-settings") as HTMLElement;
const settingsCloseEl = document.getElementById("live-chat-settings-close") as HTMLButtonElement;
const timestampToggleEl = document.getElementById("live-chat-ts-toggle") as HTMLInputElement;
const sendEl = document.getElementById("live-chat-send-btn") as HTMLButtonElement;
const emoteBtnEl = document.getElementById("live-chat-emote-btn") as HTMLButtonElement;
const pickerEl = document.getElementById("live-chat-picker") as HTMLElement;
const pickerFilterEl = document.getElementById("live-chat-picker-filter") as HTMLInputElement;
const pickerGridEl = document.getElementById("live-chat-picker-grid") as HTMLElement;
const suggestEl = document.getElementById("live-chat-suggest") as HTMLElement;
const replyBarEl = document.getElementById("live-chat-reply") as HTMLElement;
const replyLabelEl = document.getElementById("live-chat-reply-label") as HTMLElement;
const replyCancelEl = document.getElementById("live-chat-reply-cancel") as HTMLButtonElement;

const GUEST_NICK_KEY = "live-chat-guest-nick";
const LEGACY_NICK_KEY = "live-chat-nick";
const GUEST_NICK_RE = /^guest_[0-9a-f]{8}$/;
const EMOTE_SET_URL = "https://7tv.io/v3/emote-sets/global";
const MAX_MESSAGES = 200;
const MAX_TEXT = 400;
const MAX_SUGGESTIONS = 8;
const MIN_SUGGEST_LEN = 2;
const RETRY_MS = 5000;
const FLOOD_RETRY_MS = 30000;
const BAN_RETRY_MS = 30000;
const SESSION_RENEWAL_CHECK_MS = 4 * 60 * 1000;
const SCROLL_SLACK_PX = 40;
const RENDERED_BODY_CLASS = "live-chat-rendered-body";

const emotes = new ChatEmoteCatalog();

type Role = "op" | "staff" | "bot" | "mod";
const roles = new Map<string, Role>();
const vips = new Set<string>();
const unverified = new Set<string>();
const guests = new Set<string>();
const knownMembers = new Set<string>();
const memberDisplay = new Map<string, string>();
const colors = new Map<string, string>();

const pinnedMsgs = new Map<string, { from: string; text: string }>();
const dismissedPins = new Set<string>();
let userlistOpen = false;
let helpOpen = false;
let settingsOpen = false;
const TIMESTAMPS_KEY = "live-chat-timestamps";
let helpBuilt = false;
let suggestIndex = -1;
let suggestItemsData: SuggestItem[] = [];
let tabCycleRange: ReplaceRange | null = null;
let channelEmoteTwitchId = "";

const MENTION_RE = /^@([A-Za-z0-9_-]{1,32})$/;
const USER_ARG_COMMANDS = [".ban", ".unban", ".timeout", ".mod", ".unmod", ".vip", ".unvip", ".whisper", ".w"];

let replyTo: { msgid: string; from: string; text: string } | null = null;

let sock: WebSocket | null = null;
let channel = "";
let nick = "";
let joined = false;
let banned = false;
let isAccount = false;
let retryTimer: number | null = null;
let banRetry = false;
let destroyed = false;
let pickerOpen = false;
let capEcho = false;
let capRedact = false;
let pendingCapRequests = 0;
let pageGuestNick = "";
let accountStatusRevision = 0;
let accountStatusTimer: number | null = null;
let accountStatusRequest: Promise<void> | null = null;
let accountStatusResolved = false;
let accountSessionToken = "";
let requestLogin: (() => void) | null = null;

function migrateGuestNick(): void {
    const legacy = readLocalStorage(LEGACY_NICK_KEY);
    if (legacy === null) return;
    if (!readLocalStorage(GUEST_NICK_KEY) && GUEST_NICK_RE.test(legacy)) {
        pageGuestNick = legacy;
        writeLocalStorage(GUEST_NICK_KEY, legacy);
    }
    removeLocalStorage(LEGACY_NICK_KEY);
}

function guestNick(): string {
    if (GUEST_NICK_RE.test(pageGuestNick)) return pageGuestNick;
    const stored = readLocalStorage(GUEST_NICK_KEY);
    if (stored && GUEST_NICK_RE.test(stored)) {
        pageGuestNick = stored;
        return pageGuestNick;
    }
    const buf = new Uint8Array(4);
    crypto.getRandomValues(buf);
    pageGuestNick = "guest_" + Array.from(buf, (b) => b.toString(16).padStart(2, "0")).join("");
    writeLocalStorage(GUEST_NICK_KEY, pageGuestNick);
    return pageGuestNick;
}

function atBottom(): boolean {
    return msgsEl.scrollHeight - msgsEl.scrollTop - msgsEl.clientHeight < SCROLL_SLACK_PX;
}

function append(node: HTMLElement): void {
    const stick = atBottom();
    const empty = msgsEl.querySelector(".live-chat-empty");
    if (empty) empty.remove();
    msgsEl.appendChild(node);
    while (msgsEl.childElementCount > MAX_MESSAGES) msgsEl.removeChild(msgsEl.firstElementChild as Element);
    if (stick) msgsEl.scrollTop = msgsEl.scrollHeight;
}

function addSystem(text: string): void {
    const line = document.createElement("div");
    line.className = "live-chat-sys";
    line.textContent = text;
    append(line);
}

function isOwner(from: string): boolean {
    return from.toLowerCase() === channel.slice(1);
}

function myNickLower(): string {
    return nick.toLowerCase();
}

function truncate(s: string, n: number): string {
    return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

function cssEsc(s: string): string {
    if (typeof CSS !== "undefined" && typeof CSS.escape === "function") return CSS.escape(s);
    return s.replace(/[^A-Za-z0-9_-]/g, "");
}

function findMessageEl(msgid: string): HTMLElement | null {
    return msgsEl.querySelector(`.live-chat-msg[data-msgid="${cssEsc(msgid)}"]`);
}

function setReply(msgid: string, from: string, text: string): void {
    replyTo = { msgid, from, text };
    updateReplyBar();
    if (!inputEl.disabled) inputEl.focus();
}

function clearReply(): void {
    replyTo = null;
    updateReplyBar();
}

function updateReplyBar(): void {
    if (!replyTo || !joined || banned) {
        replyBarEl.hidden = true;
        replyLabelEl.replaceChildren();
        return;
    }
    const pre = document.createTextNode("Replying to ");
    const who = document.createElement("b");
    who.textContent = replyTo.from;
    const rest = document.createTextNode(": " + truncate(replyTo.text, 60));
    replyLabelEl.replaceChildren(pre, who, rest);
    replyBarEl.hidden = false;
}

function jumpToMessage(msgid: string): void {
    const el = findMessageEl(msgid);
    if (!el) return;
    el.scrollIntoView({ block: "center", behavior: "smooth" });
    el.classList.remove("live-chat-flash");
    void el.offsetWidth;
    el.classList.add("live-chat-flash");
    window.setTimeout(() => el.classList.remove("live-chat-flash"), 1500);
}

function mentionsMe(text: string): boolean {
    const me = myNickLower();
    if (!me) return false;
    for (const tok of text.split(/\s+/)) {
        const { core } = splitTrailingPunctuation(tok);
        const m = MENTION_RE.exec(core);
        if (m && m[1]!.toLowerCase() === me) return true;
    }
    return false;
}

type BadgeName = "op" | "staff" | "bot" | "mod" | "vip" | "unverified";
const BADGE_TITLE: Record<BadgeName, string> = {
    op: "Owner", staff: "Staff", bot: "Bot", mod: "Mod", vip: "VIP", unverified: "Unverified",
};

function makeBadge(name: BadgeName): HTMLImageElement {
    const img = document.createElement("img");
    img.className = "live-chat-badge";
    img.src = `/static/img/badge-${name}.svg`;
    img.alt = name;
    img.title = BADGE_TITLE[name];
    img.loading = "lazy";
    return img;
}

function buildBadges(from: string): HTMLImageElement[] {
    const key = from.toLowerCase();
    const role = roles.get(key);
    const badges: HTMLImageElement[] = [];
    if (role === "staff") badges.push(makeBadge("staff"));
    if (isOwner(from)) badges.push(makeBadge("op"));
    if (role === "bot") badges.push(makeBadge("bot"));
    if (role === "mod") badges.push(makeBadge("mod"));
    if (vips.has(key)) badges.push(makeBadge("vip"));
    if (unverified.has(key)) badges.push(makeBadge("unverified"));
    return badges;
}

function hasModRole(): boolean {
    if (isOwner(nick)) return true;
    const role = roles.get(nick.toLowerCase());
    return role === "staff" || role === "mod";
}

function buildQuote(replyId: string): { el: HTMLElement; parentFrom: string } {
    const q = document.createElement("div");
    q.className = "live-chat-quote";
    const arrow = document.createElement("span");
    arrow.className = "live-chat-quote-arrow";
    arrow.textContent = "↩";
    q.appendChild(arrow);
    const parent = findMessageEl(replyId);
    let parentFrom = "";
    if (parent) {
        parentFrom = parent.dataset["from"] ?? "";
        const body = parent.dataset["text"] ?? "";
        const who = document.createElement("span");
        who.className = "live-chat-quote-who";
        who.textContent = parentFrom;
        q.append(who, document.createTextNode(": " + truncate(body, 50)));
        q.title = "Jump to message";
        q.addEventListener("click", () => jumpToMessage(replyId));
    } else {
        q.appendChild(document.createTextNode("replying to a message"));
    }
    return { el: q, parentFrom };
}

function buildActions(from: string, text: string, msgid: string): HTMLElement {
    const actions = document.createElement("div");
    actions.className = "live-chat-actions";
    const reply = document.createElement("button");
    reply.type = "button";
    reply.className = "live-chat-reply-btn";
    reply.title = "Reply";
    reply.setAttribute("aria-label", `Reply to ${from}`);
    reply.textContent = "↩";
    reply.addEventListener("click", () => setReply(msgid, from, text));
    actions.appendChild(reply);
    const pin = document.createElement("button");
    pin.type = "button";
    pin.className = "live-chat-pin-btn";
    pin.title = "Pin message";
    pin.setAttribute("aria-label", `Pin message from ${from}`);
    pin.textContent = "📌";
    pin.addEventListener("click", () => send(`PRIVMSG ${channel} :.pin ${msgid}`));
    actions.appendChild(pin);
    const del = document.createElement("button");
    del.type = "button";
    del.className = "live-chat-del";
    del.title = "Delete message";
    del.setAttribute("aria-label", `Delete message from ${from}`);
    del.textContent = "✕";
    del.addEventListener("click", () => send(`PRIVMSG ${channel} :.delete ${msgid}`));
    actions.appendChild(del);
    return actions;
}

function addMessage(from: string, text: string, msgid?: string, replyId?: string, sentAt?: string): void {
    const line = document.createElement("div");
    line.className = "live-chat-msg";
    line.dataset["from"] = from;
    line.dataset["text"] = text;

    let repliedToMe = false;
    if (replyId) {
        const quote = buildQuote(replyId);
        line.appendChild(quote.el);
        repliedToMe = quote.parentFrom.toLowerCase() === myNickLower();
    }

    line.appendChild(buildTimeSpan(sentAt));
    const who = document.createElement("span");
    who.className = "live-chat-nick";
    who.textContent = from;
    who.style.color = nickColor(from);
    const badges = buildBadges(from);
    if (badges.length) line.append(...badges);
    line.append(who, document.createTextNode(": "), buildRenderedBody(text));
    if (from.toLowerCase() === myNickLower()) line.classList.add("live-chat-own");
    if (msgid) {
        line.dataset["msgid"] = msgid;
        line.appendChild(buildActions(from, text, msgid));
    }
    if (repliedToMe || mentionsMe(text)) line.classList.add("live-chat-mentioned");
    append(line);
}

function redactMessageEl(el: HTMLElement): void {
    const from = el.dataset["from"] ?? "";
    el.replaceChildren();
    el.classList.remove("live-chat-mentioned");
    const badges = buildBadges(from);
    if (badges.length) el.append(...badges);
    const who = document.createElement("span");
    who.className = "live-chat-nick";
    who.textContent = from;
    who.style.color = nickColor(from);
    const placeholder = document.createElement("span");
    placeholder.className = "live-chat-deleted";
    placeholder.textContent = "<deleted message>";
    el.append(who, document.createTextNode(": "), placeholder);
    el.removeAttribute("data-msgid");
    el.dataset["text"] = "<deleted message>";
}

function addHiddenMessage(from: string, text: string): void {
    const line = document.createElement("div");
    line.className = "live-chat-msg live-chat-automod";
    line.dataset["from"] = from;
    line.dataset["text"] = text;
    const tag = document.createElement("span");
    tag.className = "live-chat-automod-tag";
    tag.textContent = "blocked";
    tag.title = "Removed by automod. Only moderators see this message.";
    const who = document.createElement("span");
    who.className = "live-chat-nick";
    who.textContent = from;
    who.style.color = nickColor(from);
    const badges = buildBadges(from);
    line.append(tag);
    if (badges.length) line.append(...badges);
    line.append(who, document.createTextNode(": "), buildRenderedBody(text));
    append(line);
}

function addWhisper(from: string, target: string, text: string): void {
    const line = document.createElement("div");
    line.className = "live-chat-msg live-chat-whisper";
    const tag = document.createElement("span");
    tag.className = "live-chat-whisper-tag";
    const outgoing = from.toLowerCase() === myNickLower();
    tag.textContent = outgoing ? `↪ ${target}` : `${from} whispers`;
    line.append(tag, document.createTextNode(": "), buildRenderedBody(text));
    append(line);
}

function updateModTools(): void {
    msgsEl.classList.toggle("live-chat-can-mod", joined && capRedact && hasModRole());
    renderPins();
}

function addPin(msgid: string, from: string, text: string): void {
    pinnedMsgs.set(msgid, { from, text });
    renderPins();
}

function removePin(msgid: string): void {
    pinnedMsgs.delete(msgid);
    renderPins();
}

function clearPins(): void {
    pinnedMsgs.clear();
    renderPins();
}

function renderPins(): void {
    pinnedEl.replaceChildren();
    const canMod = hasModRole();
    let shown = 0;
    for (const [msgid, p] of pinnedMsgs) {
        if (dismissedPins.has(msgid)) continue;
        shown++;
        const row = document.createElement("div");
        row.className = "live-chat-pin";
        const icon = document.createElement("span");
        icon.className = "live-chat-pin-icon";
        icon.textContent = "📌";
        const body = document.createElement("span");
        body.className = "live-chat-pin-body";
        body.title = "Jump to message";
        const who = document.createElement("b");
        who.textContent = p.from;
        body.append(who, document.createTextNode(": "), buildRenderedBody(p.text));
        body.addEventListener("click", () => jumpToMessage(msgid));
        const close = document.createElement("button");
        close.type = "button";
        close.className = "live-chat-pin-close";
        close.title = canMod ? "Unpin for everyone" : "Dismiss";
        close.textContent = "×";
        close.addEventListener("click", () => {
            if (canMod) {
                send(`PRIVMSG ${channel} :.unpin ${msgid}`);
            } else {
                dismissedPins.add(msgid);
                renderPins();
            }
        });
        row.append(icon, body, close);
        pinnedEl.appendChild(row);
    }
    pinnedEl.hidden = shown === 0;
}

function autoGrowInput(): void {
    inputEl.style.height = "auto";
    inputEl.style.height = Math.min(inputEl.scrollHeight, 120) + "px";
}

function memberRankBucket(key: string): number {
    if (roles.get(key) === "staff") return 6;
    if (key === channel.slice(1)) return 5;
    if (roles.get(key) === "bot") return 4;
    if (roles.get(key) === "mod") return 3;
    if (vips.has(key)) return 2;
    if (guests.has(key)) return 0;
    return 1;
}

const USERLIST_GROUPS: { label: string; bucket: number }[] = [
    { label: "Staff", bucket: 6 },
    { label: "Broadcaster", bucket: 5 },
    { label: "Bots", bucket: 4 },
    { label: "Moderators", bucket: 3 },
    { label: "VIPs", bucket: 2 },
    { label: "Users", bucket: 1 },
    { label: "Guests", bucket: 0 },
];

function renderUserlist(): void {
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

function setUserlist(open: boolean): void {
    userlistOpen = open;
    usersBtnEl.classList.toggle("active", open);
    userlistEl.hidden = !open;
    if (open) {
        setHelp(false);
        setSettings(false);
        renderUserlist();
        send(`NAMES ${channel}`);
    }
}

function toggleUserlist(): void {
    setUserlist(!userlistOpen);
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

function buildHelp(): void {
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
    helpBuilt = true;
}

function setHelp(open: boolean): void {
    helpOpen = open;
    helpBtnEl.classList.toggle("active", open);
    helpEl.hidden = !open;
    if (open) {
        setUserlist(false);
        setSettings(false);
        if (!helpBuilt) buildHelp();
    }
}

function toggleHelp(): void {
    setHelp(!helpOpen);
}

function setSettings(open: boolean): void {
    settingsOpen = open;
    settingsBtnEl.classList.toggle("active", open);
    settingsEl.hidden = !open;
    if (open) {
        setUserlist(false);
        setHelp(false);
    }
}

function toggleSettings(): void {
    setSettings(!settingsOpen);
}

function applyTimestampPref(on: boolean): void {
    msgsEl.classList.toggle("show-timestamps", on);
    timestampToggleEl.checked = on;
}

function pad2(n: number): string {
    return n < 10 ? `0${n}` : String(n);
}

function parseServerTime(value: string | undefined): Date {
    if (value && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/.test(value)) {
        const parsed = new Date(value);
        if (Number.isFinite(parsed.getTime())) return parsed;
    }
    return new Date();
}

function buildTimeSpan(sentAt?: string): HTMLSpanElement {
    const time = parseServerTime(sentAt);
    const span = document.createElement("span");
    span.className = "live-chat-time";
    span.textContent = `${pad2(time.getHours())}:${pad2(time.getMinutes())}`;
    return span;
}

function buildEmoteImg(name: string, url: string): HTMLImageElement {
    const img = document.createElement("img");
    img.className = "live-chat-emote";
    img.src = url;
    img.alt = name;
    img.title = name;
    img.loading = "lazy";
    return img;
}

const LINK_CLOSERS: Record<string, string> = { ")": "(", "]": "[", "}": "{" };
const LINK_TRAILING_PUNCT = new Set([".", ",", "!", "?", ";", ":", "'", '"']);

function countChar(text: string, ch: string): number {
    let n = 0;
    for (let i = 0; i < text.length; i++) if (text[i] === ch) n++;
    return n;
}

function splitTrailingPunctuation(token: string): { core: string; trail: string } {
    let core = token;
    let trail = "";
    while (core.length > 0) {
        const ch = core[core.length - 1];
        const opener = LINK_CLOSERS[ch];
        if (opener) {
            if (countChar(core, ch) <= countChar(core, opener)) break;
            trail = ch + trail;
            core = core.slice(0, -1);
            continue;
        }
        if (LINK_TRAILING_PUNCT.has(ch)) {
            trail = ch + trail;
            core = core.slice(0, -1);
            continue;
        }
        break;
    }
    return { core, trail };
}

function parseLinkUrl(text: string): URL | null {
    if (!/^https?:\/\//i.test(text)) return null;
    let url: URL;
    try {
        url = new URL(text);
    } catch {
        return null;
    }
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url;
}

function buildLinkAnchor(url: string): HTMLAnchorElement {
    const a = document.createElement("a");
    a.href = url;
    a.target = "_blank";
    a.rel = "noopener noreferrer nofollow ugc";
    a.referrerPolicy = "no-referrer";
    a.className = "live-chat-link";
    a.textContent = url;
    return a;
}

function buildMention(name: string): HTMLSpanElement {
    const span = document.createElement("span");
    span.className = "live-chat-mention";
    span.textContent = name;
    return span;
}

function renderToken(token: string): Node {
    const emoteUrl = emotes.get(token)?.url;
    if (emoteUrl) return buildEmoteImg(token, emoteUrl);
    const { core, trail } = splitTrailingPunctuation(token);
    if (core && MENTION_RE.test(core)) {
        if (!trail) return buildMention(core);
        const frag = document.createDocumentFragment();
        frag.append(buildMention(core), document.createTextNode(trail));
        return frag;
    }
    if (core && parseLinkUrl(core)) {
        if (!trail) return buildLinkAnchor(core);
        const frag = document.createDocumentFragment();
        frag.appendChild(buildLinkAnchor(core));
        frag.appendChild(document.createTextNode(trail));
        return frag;
    }
    return document.createTextNode(token);
}

function renderBody(text: string): DocumentFragment {
    const frag = document.createDocumentFragment();
    let lastStack: HTMLElement | null = null;
    let pendingWs = "";
    for (const token of text.split(/(\s+)/)) {
        if (!token) continue;
        if (/^\s+$/.test(token)) {
            pendingWs += token;
            continue;
        }
        const emote = emotes.get(token);
        const url = emote?.url;
        if (url && emote.zeroWidth && lastStack) {
            const img = buildEmoteImg(token, url);
            img.classList.add("live-chat-emote-zw");
            lastStack.appendChild(img);
            pendingWs = "";
            continue;
        }
        if (pendingWs) {
            frag.appendChild(document.createTextNode(pendingWs));
            pendingWs = "";
        }
        const node = renderToken(token);
        if (url) {
            const stack = document.createElement("span");
            stack.className = "live-chat-emote-stack";
            stack.appendChild(node);
            frag.appendChild(stack);
            lastStack = stack;
        } else {
            frag.appendChild(node);
            lastStack = null;
        }
    }
    if (pendingWs) frag.appendChild(document.createTextNode(pendingWs));
    return frag;
}

function buildRenderedBody(text: string): HTMLSpanElement {
    const body = document.createElement("span");
    body.className = RENDERED_BODY_CLASS;
    body.dataset["rawText"] = text;
    body.appendChild(renderBody(text));
    return body;
}

function refreshEmoteRendering(): void {
    const stick = atBottom();
    const previousHeight = msgsEl.scrollHeight;
    for (const body of Array.from(document.querySelectorAll<HTMLElement>(`.${RENDERED_BODY_CLASS}`))) {
        body.replaceChildren(renderBody(body.dataset["rawText"] ?? ""));
    }
    if (pickerOpen) renderPickerGrid(pickerFilterEl.value);
    if (!suggestEl.hidden) updateSuggest();
    if (stick) {
        msgsEl.scrollTop = msgsEl.scrollHeight;
    } else {
        msgsEl.scrollTop += msgsEl.scrollHeight - previousHeight;
    }
}

async function loadEmoteSet(url: string, scope: ChatEmoteScope): Promise<void> {
    try {
        const res = await fetch(url);
        if (!res.ok) return;
        const payload: any = await res.json();
        const list = scope === "channel" ? payload?.emote_set?.emotes : payload?.emotes;
        emotes.replace(scope, list);
        refreshEmoteRendering();
    } catch {}
}

async function loadEmotes(): Promise<void> {
    const requests: Promise<void>[] = [loadEmoteSet(EMOTE_SET_URL, "global")];
    if (channelEmoteTwitchId) {
        const url = `https://7tv.io/v3/users/twitch/${encodeURIComponent(channelEmoteTwitchId)}`;
        requests.push(loadEmoteSet(url, "channel"));
    }
    await Promise.all(requests);
}

function nickColor(from: string): string {
    const chosen = colors.get(from.toLowerCase());
    if (chosen) return chosen;
    let h = 0;
    for (let i = 0; i < from.length; i++) h = (h * 31 + from.charCodeAt(i)) % 360;
    return `hsl(${h}, 65%, 68%)`;
}

function isGuestNow(): boolean {
    return !isAccount || guests.has(myNickLower());
}

async function requestAccountStatus(): Promise<void> {
    const revision = ++accountStatusRevision;
    let account: boolean;
    let renewed = false;
    let sessionToken = "";
    try {
        const res = await fetch(`${API_BASE}/auth/session`, { credentials: "include" });
        if (res.status === 401) {
            account = false;
        } else {
            if (!res.ok) return;
            const info: any = await res.json();
            account = !!info && (info.kind === "user" || info.kind === "admin") && typeof info.username === "string";
            renewed = info?.renewed === true;
            sessionToken = typeof info?.token === "string" ? info.token : "";
        }
    } catch {
        return;
    }
    if (revision !== accountStatusRevision) return;
    const wasResolved = accountStatusResolved;
    const wasAccount = isAccount;
    const tokenChanged = accountSessionToken !== "" && sessionToken !== "" && sessionToken !== accountSessionToken;
    // connect() authenticates over the WebSocket via the session cookie, so the
    // very first status resolution after a fresh connect has nothing to
    // synchronize: the connection already reflects whatever the cookie said.
    // Only force a restart here if the join actually came up as a guest despite
    // the account now reporting as logged in (a genuine identity mismatch).
    const connectedAsGuest = joined && guests.has(myNickLower());
    const synchronize = wasResolved
        ? account !== wasAccount || (account && (renewed || tokenChanged))
        : account && connectedAsGuest;
    accountStatusResolved = true;
    accountSessionToken = account ? sessionToken : "";
    isAccount = account;
    updateComposer();
    if (synchronize) restartChatConnection();
}

function checkAccountStatus(): Promise<void> {
    if (!accountStatusRequest) {
        accountStatusRequest = requestAccountStatus().finally(() => {
            accountStatusRequest = null;
        });
    }
    return accountStatusRequest;
}

function checkAccountWhenVisible(): void {
    if (!document.hidden) void checkAccountStatus();
}

function showComposerInput(enabled: boolean): void {
    inputRowEl.hidden = false;
    guestLoginEl.hidden = true;
    verifyEl.hidden = true;
    inputEl.disabled = !enabled;
    sendEl.disabled = !enabled;
    emoteBtnEl.disabled = !enabled;
    inputEl.placeholder = enabled ? `Chat as ${nick}` : "Send message";
    if (!enabled) {
        closePicker();
        hideSuggest();
    }
}

function showGuestLogin(): void {
    inputRowEl.hidden = true;
    guestLoginEl.hidden = false;
    verifyEl.hidden = true;
    guestLoginEl.href = `/login?return=${encodeURIComponent(location.href)}`;
    closePicker();
    hideSuggest();
}

function showVerifyEmail(): void {
    inputRowEl.hidden = true;
    guestLoginEl.hidden = true;
    verifyEl.hidden = false;
    closePicker();
    hideSuggest();
}

function isSelfUnverified(): boolean {
    return isAccount && unverified.has(myNickLower());
}

function updateComposer(): void {
    if (banned) {
        inputRowEl.hidden = true;
        guestLoginEl.hidden = true;
        verifyEl.hidden = true;
        closePicker();
        hideSuggest();
        updateReplyBar();
        return;
    }
    if (!joined) {
        showComposerInput(false);
        updateReplyBar();
        return;
    }
    if (isGuestNow()) {
        showGuestLogin();
    } else if (isSelfUnverified()) {
        showVerifyEmail();
    } else {
        showComposerInput(true);
    }
    updateReplyBar();
}

function buildEmoteCell(name: string): HTMLButtonElement {
    const cell = document.createElement("button");
    cell.type = "button";
    cell.className = "live-chat-picker-cell";
    const img = document.createElement("img");
    img.src = emotes.get(name)?.url ?? "";
    img.alt = name;
    img.title = name;
    img.loading = "lazy";
    cell.appendChild(img);
    cell.addEventListener("click", () => insertEmoteAtCaret(name));
    return cell;
}

function pickerEmpty(text: string): HTMLDivElement {
    const empty = document.createElement("div");
    empty.className = "live-chat-picker-empty";
    empty.textContent = text;
    return empty;
}

function renderPickerGrid(filter: string): void {
    pickerGridEl.replaceChildren();
    if (emotes.size === 0) {
        pickerGridEl.appendChild(pickerEmpty("Emotes unavailable"));
        return;
    }
    const lower = filter.trim().toLowerCase();
    const names = Array.from(emotes.names())
        .filter((name) => !lower || name.toLowerCase().includes(lower))
        .sort((a, b) => a.localeCompare(b));
    if (!names.length) {
        pickerGridEl.appendChild(pickerEmpty("No emotes match"));
        return;
    }
    for (const name of names) pickerGridEl.appendChild(buildEmoteCell(name));
}

function onPickerOutsideMouseDown(e: MouseEvent): void {
    const target = e.target as Node;
    if (pickerEl.contains(target) || emoteBtnEl.contains(target)) return;
    closePicker();
}

function openPicker(): void {
    if (pickerOpen) return;
    pickerOpen = true;
    emoteBtnEl.classList.add("active");
    pickerFilterEl.value = "";
    renderPickerGrid("");
    pickerEl.hidden = false;
    hideSuggest();
    document.addEventListener("mousedown", onPickerOutsideMouseDown, true);
    pickerFilterEl.focus();
}

function closePicker(): void {
    if (!pickerOpen) return;
    pickerOpen = false;
    emoteBtnEl.classList.remove("active");
    pickerEl.hidden = true;
    document.removeEventListener("mousedown", onPickerOutsideMouseDown, true);
}

function togglePicker(): void {
    if (pickerOpen) closePicker();
    else openPicker();
}

function insertEmoteAtCaret(name: string): void {
    const val = inputEl.value;
    const start = inputEl.selectionStart ?? val.length;
    const end = inputEl.selectionEnd ?? val.length;
    const before = val.slice(0, start);
    const after = val.slice(end);
    const lead = before.length > 0 && !/\s$/.test(before) ? " " : "";
    const trail = after.length === 0 || !/^\s/.test(after) ? " " : "";
    const insert = lead + name + trail;
    inputEl.value = before + insert + after;
    const caret = (before + insert).length;
    inputEl.setSelectionRange(caret, caret);
    inputEl.focus();
}

function currentWordRange(): { start: number; end: number; word: string } | null {
    const val = inputEl.value;
    const caret = inputEl.selectionStart ?? val.length;
    if (inputEl.selectionEnd !== caret) return null;
    let start = caret;
    while (start > 0 && !/\s/.test(val[start - 1])) start--;
    let end = caret;
    while (end < val.length && !/\s/.test(val[end])) end++;
    return { start, end, word: val.slice(start, end) };
}

function matchEmotes(term: string): string[] {
    const lower = term.toLowerCase();
    const prefix: string[] = [];
    const substr: string[] = [];
    for (const name of emotes.names()) {
        const l = name.toLowerCase();
        if (l.startsWith(lower)) prefix.push(name);
        else if (l.includes(lower)) substr.push(name);
    }
    prefix.sort((a, b) => a.localeCompare(b));
    substr.sort((a, b) => a.localeCompare(b));
    return [...prefix, ...substr].slice(0, MAX_SUGGESTIONS);
}

function acceptSuggestion(name: string): void {
    const range = currentWordRange();
    if (!range) return;
    const { value } = applyReplacement(inputEl.value, range, name + " ");
    inputEl.value = value;
    const caret = range.start + name.length + 1;
    inputEl.setSelectionRange(caret, caret);
    inputEl.focus();
    hideSuggest();
}

function hideSuggest(): void {
    suggestEl.hidden = true;
    suggestEl.replaceChildren();
    suggestIndex = -1;
    suggestItemsData = [];
    tabCycleRange = null;
}

function suggestItems(): HTMLElement[] {
    return Array.from(suggestEl.querySelectorAll<HTMLElement>(".live-chat-suggest-item"));
}

function highlightSuggest(): void {
    const items = suggestItems();
    items.forEach((it, i) => it.classList.toggle("sel", i === suggestIndex));
    items[suggestIndex]?.scrollIntoView({ block: "nearest" });
}

function moveSuggest(delta: number): void {
    const items = suggestItems();
    if (!items.length) return;
    suggestIndex = wrapIndex(suggestIndex, delta, items.length);
    highlightSuggest();
}

function acceptSelectedSuggestion(): boolean {
    const items = suggestItems();
    const cur = items[suggestIndex >= 0 ? suggestIndex : 0];
    if (!cur) return false;
    cur.click();
    return true;
}

function advanceTabCycle(back: boolean): void {
    if (!tabCycleRange) {
        const range = currentWordRange();
        if (!range) return;
        tabCycleRange = { start: range.start, end: range.end };
        highlightSuggest();
    } else {
        moveSuggest(back ? -1 : 1);
    }
    const item = suggestItemsData[suggestIndex];
    if (!item || !tabCycleRange) return;
    const { value, end } = applyReplacement(inputEl.value, tabCycleRange, item.insert + " ");
    inputEl.value = value;
    tabCycleRange = { start: tabCycleRange.start, end };
    inputEl.setSelectionRange(end, end);
    inputEl.focus();
}

function matchMembers(term: string): string[] {
    const lower = term.toLowerCase();
    const me = myNickLower();
    const pre: string[] = [];
    const sub: string[] = [];
    for (const [key, display] of memberDisplay) {
        if (key === me) continue;
        if (key.startsWith(lower)) pre.push(display);
        else if (lower && key.includes(lower)) sub.push(display);
    }
    pre.sort((a, b) => a.localeCompare(b));
    sub.sort((a, b) => a.localeCompare(b));
    return [...pre, ...sub].slice(0, MAX_SUGGESTIONS);
}

interface SuggestContext {
    kind: "emote" | "member";
    term: string;
    withAt: boolean;
}

function suggestContext(): SuggestContext | null {
    const range = currentWordRange();
    if (!range) return null;
    const word = range.word;
    if (word.startsWith(":")) {
        if (word.length < MIN_SUGGEST_LEN + 1) return null;
        return { kind: "emote", term: word.slice(1), withAt: false };
    }
    if (word.startsWith("@")) {
        if (word.length < 2) return null;
        return { kind: "member", term: word.slice(1), withAt: true };
    }
    const val = inputEl.value;
    const firstSpace = val.indexOf(" ");
    if (firstSpace > 0) {
        const cmd = val.slice(0, firstSpace).toLowerCase();
        if (USER_ARG_COMMANDS.includes(cmd)) {
            const m = val.slice(firstSpace).match(/\S/);
            const argStart = m ? firstSpace + (m.index ?? 0) : -1;
            if (argStart >= 0 && range.start === argStart && word.length >= 1) {
                return { kind: "member", term: word, withAt: false };
            }
        }
    }
    return null;
}

interface SuggestItem {
    label: string;
    insert: string;
    img?: string;
    color?: string;
}

function renderSuggestItems(items: SuggestItem[]): void {
    tabCycleRange = null;
    suggestEl.replaceChildren();
    if (!items.length) {
        suggestEl.hidden = true;
        suggestItemsData = [];
        return;
    }
    suggestItemsData = items;
    for (const it of items) {
        const item = document.createElement("button");
        item.type = "button";
        item.className = "live-chat-suggest-item";
        if (it.img) {
            const img = document.createElement("img");
            img.src = it.img;
            img.alt = it.label;
            img.loading = "lazy";
            item.appendChild(img);
        } else if (it.color) {
            const dot = document.createElement("span");
            dot.className = "live-chat-suggest-dot";
            dot.style.background = it.color;
            item.appendChild(dot);
        }
        const label = document.createElement("span");
        label.textContent = it.label;
        item.appendChild(label);
        item.addEventListener("click", () => acceptSuggestion(it.insert));
        item.addEventListener("mousemove", () => {
            suggestIndex = suggestItems().indexOf(item);
            highlightSuggest();
        });
        suggestEl.appendChild(item);
    }
    suggestEl.hidden = false;
    suggestIndex = 0;
    highlightSuggest();
}

function updateSuggest(): void {
    if (pickerOpen) {
        hideSuggest();
        return;
    }
    const ctx = suggestContext();
    if (!ctx) {
        hideSuggest();
        return;
    }
    if (ctx.kind === "emote") {
        renderSuggestItems(matchEmotes(ctx.term).map((name) => ({ label: name, insert: name, img: emotes.get(name)?.url })));
    } else {
        renderSuggestItems(matchMembers(ctx.term).map((name) => ({ label: name, insert: (ctx.withAt ? "@" : "") + name, color: nickColor(name) })));
    }
}

interface IrcLine {
    nick: string;
    command: string;
    params: string[];
    msgid?: string;
    reply?: string;
    color?: string;
    time?: string;
    automod?: boolean;
}

function parse(line: string): IrcLine | null {
    let rest = line;
    let from = "";
    let msgid: string | undefined;
    let reply: string | undefined;
    let color: string | undefined;
    let time: string | undefined;
    let automod = false;
    if (rest.startsWith("@")) {
        const sp = rest.indexOf(" ");
        if (sp < 0) return null;
        for (const tag of rest.slice(1, sp).split(";")) {
            const eq = tag.indexOf("=");
            const key = eq > 0 ? tag.slice(0, eq) : tag;
            const val = eq > 0 ? tag.slice(eq + 1) : "";
            if (key === "msgid") msgid = val;
            else if (key === "+reply") reply = val;
            else if (key === "color") color = val;
            else if (key === "time") time = val;
            else if (key === "automod") automod = true;
        }
        rest = rest.slice(sp + 1);
    }
    if (rest.startsWith(":")) {
        const sp = rest.indexOf(" ");
        if (sp < 0) return null;
        const prefix = rest.slice(1, sp);
        const bang = prefix.indexOf("!");
        from = bang < 0 ? prefix : prefix.slice(0, bang);
        rest = rest.slice(sp + 1);
    }
    const params: string[] = [];
    while (rest.length > 0) {
        if (rest.startsWith(":")) {
            params.push(rest.slice(1));
            break;
        }
        const sp = rest.indexOf(" ");
        if (sp < 0) {
            params.push(rest);
            break;
        }
        params.push(rest.slice(0, sp));
        rest = rest.slice(sp + 1);
    }
    const command = params.shift();
    if (!command) return null;
    const out: IrcLine = { nick: from, command: command.toUpperCase(), params };
    if (msgid) out.msgid = msgid;
    if (reply) out.reply = reply;
    if (color) out.color = color;
    if (time) out.time = time;
    if (automod) out.automod = true;
    return out;
}

function send(line: string): void {
    if (sock && sock.readyState === WebSocket.OPEN) sock.send(line);
}

function applyNamesList(names: string): void {
    for (const raw of names.split(/\s+/)) {
        if (!raw) continue;
        let i = 0;
        let role: Role | null = null;
        let vip = false;
        let unver = false;
        let guest = false;
        for (; i < raw.length; i++) {
            const ch = raw[i];
            if (ch === "@") role = "op";
            else if (ch === "%") role = "staff";
            else if (ch === "&") role = "bot";
            else if (ch === "+") role = "mod";
            else if (ch === "~") vip = true;
            else if (ch === "=") unver = true;
            else if (ch === "?") guest = true;
            else break;
        }
        const name = raw.slice(i);
        if (!name) continue;
        const key = name.toLowerCase();
        knownMembers.add(key);
        memberDisplay.set(key, name);
        if (role) roles.set(key, role);
        else roles.delete(key);
        if (vip) vips.add(key);
        else vips.delete(key);
        if (unver) unverified.add(key);
        else unverified.delete(key);
        if (guest) guests.add(key);
        else guests.delete(key);
    }
    if (userlistOpen) renderUserlist();
}

function removeMember(key: string): void {
    if (!knownMembers.has(key)) return;
    knownMembers.delete(key);
    memberDisplay.delete(key);
    roles.delete(key);
    vips.delete(key);
    unverified.delete(key);
    guests.delete(key);
    if (userlistOpen) renderUserlist();
}

function enterBanned(): void {
    if (!banned) {
        banned = true;
        joined = false;
        addSystem("You are banned from this channel");
        updateComposer();
    }
    banRetry = true;
    sock?.close();
}

function handle(line: IrcLine): void {
    switch (line.command) {
        case "PING":
            send(`PONG :${line.params[0] ?? ""}`);
            return;
        case "CAP": {
            const sub = (line.params[1] ?? "").toUpperCase();
            if (sub === "ACK") {
                const granted = (line.params[2] ?? "").split(/\s+/);
                if (granted.includes("echo-message")) capEcho = true;
                if (granted.includes("draft/message-redaction")) capRedact = true;
            }
            if (sub === "ACK" || sub === "NAK") {
                pendingCapRequests = Math.max(0, pendingCapRequests - 1);
                if (pendingCapRequests === 0) send("CAP END");
            }
            return;
        }
        case "REDACT": {
            if (line.params[0]?.toLowerCase() !== channel) return;
            const id = line.params[1];
            if (id) {
                const el = findMessageEl(id);
                if (el) redactMessageEl(el);
            }
            return;
        }
        case "001": {
            const confirmed = line.params[0] ?? nick;
            nick = confirmed;
            if (GUEST_NICK_RE.test(confirmed)) {
                pageGuestNick = confirmed;
                writeLocalStorage(GUEST_NICK_KEY, confirmed);
            }
            send(`JOIN ${channel}`);
            return;
        }
        case "JOIN": {
            const joiner = line.nick;
            if (joiner === nick && !joined) {
                banned = false;
                joined = true;
                addSystem(`Connected as ${nick}`);
                updateComposer();
                updateModTools();
                updateReplyBar();
            }
            const key = joiner.toLowerCase();
            memberDisplay.set(key, joiner);
            if (!knownMembers.has(key)) {
                knownMembers.add(key);
                send(`NAMES ${channel}`);
            }
            return;
        }
        case "353": {
            const names = line.params[line.params.length - 1] ?? "";
            const chan = line.params[line.params.length - 2] ?? "";
            if (chan.toLowerCase() !== channel) return;
            applyNamesList(names);
            updateModTools();
            updateComposer();
            return;
        }
        case "MODE": {
            if (line.params[0]?.toLowerCase() !== channel) return;
            const modeStr = line.params[1] ?? "";
            const target = line.params[2] ?? "";
            if (!target) return;
            const key = target.toLowerCase();
            if (modeStr === "+v") roles.set(key, "mod");
            else if (modeStr === "-v") roles.delete(key);
            else if (modeStr === "+V") vips.add(key);
            else if (modeStr === "-V") vips.delete(key);
            updateModTools();
            return;
        }
        case "PART": {
            if (line.params[0]?.toLowerCase() !== channel) return;
            removeMember(line.nick.toLowerCase());
            return;
        }
        case "QUIT": {
            removeMember(line.nick.toLowerCase());
            return;
        }
        case "KICK": {
            if (line.params[0]?.toLowerCase() !== channel) return;
            const target = line.params[1] ?? "";
            if (target.toLowerCase() === nick.toLowerCase()) {
                enterBanned();
            } else {
                addSystem(`${target} was banned`);
                removeMember(target.toLowerCase());
            }
            return;
        }
        case "PRIVMSG": {
            const target = line.params[0] ?? "";
            const body = line.params[1];
            if (!body) return;
            if (line.color !== undefined && line.nick) {
                const key = line.nick.toLowerCase();
                if (line.color) colors.set(key, line.color);
                else colors.delete(key);
            }
            if (target.toLowerCase() === channel) {
                if (line.automod) {
                    if (!document.body.classList.contains("chat-popout")) addHiddenMessage(line.nick, body);
                } else {
                    addMessage(line.nick, body, line.msgid, line.reply, line.time);
                }
            } else {
                addWhisper(line.nick, target, body);
            }
            return;
        }
        case "PIN": {
            if (line.params[0]?.toLowerCase() !== channel) return;
            const id = line.params[1] ?? "";
            if (id) addPin(id, line.params[2] ?? "", line.params[3] ?? "");
            return;
        }
        case "UNPIN": {
            if (line.params[0]?.toLowerCase() !== channel) return;
            const id = line.params[1];
            if (id) removePin(id);
            else clearPins();
            return;
        }
        case "NOTICE": {
            const text = line.params[line.params.length - 1];
            if (text) addSystem(text);
            return;
        }
        case "474":
            enterBanned();
            return;
        case "404":
        case "421":
        case "461":
            addSystem(line.params[line.params.length - 1] ?? "Chat error");
            return;
        default:
            return;
    }
}

const CLOSE_REASONS: Record<number, string> = {
    4400: "Disconnected: too many messages too fast.",
    4401: "Disconnected: connection timed out.",
    4402: "Disconnected: connection too slow to keep up.",
    1009: "Disconnected: message too long.",
};

function scheduleRetry(delayMs: number): void {
    if (destroyed || retryTimer !== null) return;
    retryTimer = window.setTimeout(() => {
        retryTimer = null;
        connect();
    }, delayMs);
}

function connect(): void {
    if (destroyed) return;
    if (sock && (sock.readyState === WebSocket.CONNECTING || sock.readyState === WebSocket.OPEN)) return;
    joined = false;
    roles.clear();
    vips.clear();
    unverified.clear();
    guests.clear();
    knownMembers.clear();
    memberDisplay.clear();
    colors.clear();
    replyTo = null;
    updateReplyBar();
    clearPins();
    dismissedPins.clear();
    if (userlistOpen) setUserlist(false);
    if (helpOpen) setHelp(false);
    if (settingsOpen) setSettings(false);
    capEcho = false;
    capRedact = false;
    pendingCapRequests = 0;
    updateComposer();
    updateModTools();
    nick = guestNick();

    const proto = location.protocol === "https:" ? "wss" : "ws";
    const s = new WebSocket(`${proto}://${location.host}/ws/irc`);
    sock = s;

    s.onopen = () => {
        // Sent as two CAP REQ lines: per IRCv3, a single CAP REQ is atomic, so a
        // server that supports message-tags/echo-message/draft/message-redaction
        // but not server-time would NAK the entire request if they were combined,
        // silently losing echo-message and mod redaction. Each REQ below is
        // ACK/NAK'd independently; CAP END is deferred until both are answered.
        pendingCapRequests = 2;
        send("CAP REQ :message-tags echo-message draft/message-redaction");
        send("CAP REQ :server-time");
        send(`NICK ${nick}`);
        send(`USER ${nick} 0 * :${nick}`);
    };
    s.onmessage = (ev) => {
        if (typeof ev.data !== "string") return;
        for (const raw of ev.data.split("\n")) {
            const line = parse(raw.replace(/\r$/, ""));
            if (line) handle(line);
        }
    };
    s.onclose = (ev) => {
        if (sock !== s) return;
        sock = null;
        joined = false;
        updateComposer();
        if (destroyed) return;
        if (ev.reason === "session-limit") {
            addSystem("Chat is open in too many windows.");
            scheduleRetry(FLOOD_RETRY_MS);
            return;
        }
        const reason = CLOSE_REASONS[ev.code];
        if (reason) addSystem(reason);
        const delay = banRetry || banned
            ? BAN_RETRY_MS
            : ev.code === 4400 ? FLOOD_RETRY_MS : RETRY_MS;
        banRetry = false;
        scheduleRetry(delay);
    };
    s.onerror = () => s.close();
}

function submit(): void {
    const text = inputEl.value.replace(/[\r\n]/g, " ").trim().slice(0, MAX_TEXT);
    if (!text || !joined) return;
    const r = replyTo;
    const cmdWord = text.startsWith(".") ? text.split(" ")[0]!.toLowerCase() : "";
    const isWhisper = cmdWord === ".whisper" || cmdWord === ".w";
    const serverHandles = isWhisper || (cmdWord !== "" && hasModRole());
    const tag = r && !isWhisper ? `@+reply=${r.msgid} ` : "";
    send(`${tag}PRIVMSG ${channel} :${text}`);
    if (!capEcho && !serverHandles) addMessage(nick, text, undefined, r?.msgid);
    inputEl.value = "";
    autoGrowInput();
    clearReply();
    hideSuggest();
    msgsEl.scrollTop = msgsEl.scrollHeight;
}

export function startChat(user: string, emoteTwitchId?: string, onLoginRequested?: () => void): void {
    channel = `#${user}`;
    channelEmoteTwitchId = emoteTwitchId ?? "";
    requestLogin = onLoginRequested ?? null;
    inputEl.maxLength = MAX_TEXT;
    migrateGuestNick();
    void loadEmotes();
    void checkAccountStatus();
    if (accountStatusTimer === null) {
        accountStatusTimer = window.setInterval(checkAccountWhenVisible, SESSION_RENEWAL_CHECK_MS);
    }
    document.addEventListener("visibilitychange", checkAccountWhenVisible);
    guestLoginEl.addEventListener("click", (event) => {
        if (!requestLogin) return;
        event.preventDefault();
        requestLogin();
    });
    sendEl.addEventListener("click", submit);
    replyCancelEl.addEventListener("click", clearReply);
    emoteBtnEl.addEventListener("click", togglePicker);
    usersBtnEl.addEventListener("click", toggleUserlist);
    userlistCloseEl.addEventListener("click", () => setUserlist(false));
    helpBtnEl.addEventListener("click", toggleHelp);
    helpCloseEl.addEventListener("click", () => setHelp(false));
    settingsBtnEl.addEventListener("click", toggleSettings);
    settingsCloseEl.addEventListener("click", () => setSettings(false));
    applyTimestampPref(readLocalStorage(TIMESTAMPS_KEY) === "1");
    timestampToggleEl.addEventListener("change", () => {
        applyTimestampPref(timestampToggleEl.checked);
        writeLocalStorage(TIMESTAMPS_KEY, timestampToggleEl.checked ? "1" : "0");
    });
    pickerFilterEl.addEventListener("input", () => renderPickerGrid(pickerFilterEl.value));
    inputEl.addEventListener("input", () => {
        autoGrowInput();
        updateSuggest();
    });
    inputEl.addEventListener("click", updateSuggest);
    inputEl.addEventListener("keyup", (e) => {
        if (e.key === "ArrowLeft" || e.key === "ArrowRight" || e.key === "Home" || e.key === "End") updateSuggest();
    });
    inputEl.addEventListener("keydown", (e) => {
        const suggestOpen = !suggestEl.hidden;
        if (suggestOpen && e.key === "Tab") {
            e.preventDefault();
            advanceTabCycle(e.shiftKey);
            return;
        }
        if (suggestOpen && !tabCycleRange && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
            e.preventDefault();
            moveSuggest(e.key === "ArrowUp" ? -1 : 1);
            return;
        }
        if (tabCycleRange && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
            tabCycleRange = null;
        }
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            if (suggestOpen && !tabCycleRange && acceptSelectedSuggestion()) return;
            tabCycleRange = null;
            submit();
        }
    });
    document.addEventListener("keydown", (e) => {
        if (e.key !== "Escape") return;
        closePicker();
        hideSuggest();
        clearReply();
        if (userlistOpen) setUserlist(false);
        if (helpOpen) setHelp(false);
        if (settingsOpen) setSettings(false);
    });
    connect();
}

function restartChatConnection(): void {
    if (destroyed || banned) return;
    if (retryTimer !== null) {
        window.clearTimeout(retryTimer);
        retryTimer = null;
    }
    const previous = sock;
    sock = null;
    joined = false;
    updateComposer();
    previous?.close();
    connect();
}

export function reconnectChatAfterLogin(): void {
    accountStatusRevision++;
    isAccount = true;
    accountStatusResolved = true;
    accountSessionToken = "";
    banned = false;
    banRetry = false;
    restartChatConnection();
}

export function stopChat(): void {
    destroyed = true;
    accountStatusRevision++;
    accountStatusRequest = null;
    if (accountStatusTimer !== null) {
        window.clearInterval(accountStatusTimer);
        accountStatusTimer = null;
    }
    document.removeEventListener("visibilitychange", checkAccountWhenVisible);
    if (retryTimer !== null) window.clearTimeout(retryTimer);
    sock?.close();
}

import { API_BASE } from "../api.ts";
import type { ChatEmoteScope } from "../chat-emotes.ts";
import { readLocalStorage, removeLocalStorage, writeLocalStorage } from "../storage.ts";
import { ctx, emotes } from "./context.ts";
import { updateComposer } from "./composer.ts";
import { parse, type IrcLine } from "./irc.ts";
import {
    addHiddenMessage,
    addMessage,
    addRaidIncoming,
    addSystem,
    addSystemHighlight,
    addWhisper,
    findMessageEl,
    redactMessageEl,
    refreshEmoteRendering,
    updateModTools,
    updateReplyBar,
} from "./messages.ts";
import {
    applyNamesList,
    colors,
    guests,
    knownMembers,
    memberDisplay,
    removeMember,
    roles,
    subscribers,
    subscriberBadges,
    unverified,
    vips,
} from "./members.ts";
import { sanitizeSubscriberBadgeName } from "./badges.ts";
import { addPin, clearPins, dismissedPins, removePin } from "./pins.ts";
import { hideRaidBanner, raidGo, showRaidStart, updateRaidCount } from "./raid.ts";
import { parseRaidCount, parseRaidIncoming, parseRaidStart, parseRaidTarget } from "./raid-wire.ts";
import { renderUserlist, setHelp, setSettings, setUserlist } from "./panels.ts";
import { getChatWssBase } from "./ws-config.ts";
import { toWsOrigin } from "../player-shared/ws-url.ts";
import { chooseTransportBase, markDirectFailed, shouldMarkDirectFailed } from "../player-shared/transport-fallback.ts";

const GUEST_NICK_KEY = "live-chat-guest-nick";
const LEGACY_NICK_KEY = "live-chat-nick";
const GUEST_NICK_RE = /^guest_[0-9a-f]{8}$/;
const EMOTE_SET_URL = "https://7tv.io/v3/emote-sets/global";
export const RETRY_MS = 5000;
export const FLOOD_RETRY_MS = 30000;
export const BAN_RETRY_MS = 30000;
export const SESSION_RENEWAL_CHECK_MS = 4 * 60 * 1000;
const NAMES_REFRESH_DELAY_MS = 750;

let namesRefreshTimer: number | null = null;

function cancelNamesRefresh(): void {
    if (namesRefreshTimer === null) return;
    window.clearTimeout(namesRefreshTimer);
    namesRefreshTimer = null;
}

function scheduleNamesRefresh(): void {
    if (namesRefreshTimer !== null) return;
    namesRefreshTimer = window.setTimeout(() => {
        namesRefreshTimer = null;
        send(`NAMES ${ctx.channel}`);
    }, NAMES_REFRESH_DELAY_MS);
}

export function migrateGuestNick(): void {
    const legacy = readLocalStorage(LEGACY_NICK_KEY);
    if (legacy === null) return;
    if (!readLocalStorage(GUEST_NICK_KEY) && GUEST_NICK_RE.test(legacy)) {
        ctx.pageGuestNick = legacy;
        writeLocalStorage(GUEST_NICK_KEY, legacy);
    }
    removeLocalStorage(LEGACY_NICK_KEY);
}

function guestNick(): string {
    if (GUEST_NICK_RE.test(ctx.pageGuestNick)) return ctx.pageGuestNick;
    const stored = readLocalStorage(GUEST_NICK_KEY);
    if (stored && GUEST_NICK_RE.test(stored)) {
        ctx.pageGuestNick = stored;
        return ctx.pageGuestNick;
    }
    const buf = new Uint8Array(4);
    crypto.getRandomValues(buf);
    ctx.pageGuestNick = "guest_" + Array.from(buf, (b) => b.toString(16).padStart(2, "0")).join("");
    writeLocalStorage(GUEST_NICK_KEY, ctx.pageGuestNick);
    return ctx.pageGuestNick;
}

async function loadEmoteSet(url: string, scope: ChatEmoteScope): Promise<void> {
    try {
        const res = await fetch(url, { referrerPolicy: "no-referrer" });
        if (!res.ok) return;
        const payload: any = await res.json();
        const list = scope === "channel" ? payload?.emote_set?.emotes : payload?.emotes;
        emotes.replace(scope, list);
        refreshEmoteRendering();
    } catch {}
}

export async function loadEmotes(): Promise<void> {
    const requests: Promise<void>[] = [loadEmoteSet(EMOTE_SET_URL, "global")];
    if (ctx.channelEmoteTwitchId) {
        const url = `https://7tv.io/v3/users/twitch/${encodeURIComponent(ctx.channelEmoteTwitchId)}`;
        requests.push(loadEmoteSet(url, "channel"));
    }
    await Promise.all(requests);
}

async function requestAccountStatus(): Promise<void> {
    const revision = ++ctx.accountStatusRevision;
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
    if (revision !== ctx.accountStatusRevision) return;
    const wasResolved = ctx.accountStatusResolved;
    const wasAccount = ctx.isAccount;
    const tokenChanged = ctx.accountSessionToken !== "" && sessionToken !== "" && sessionToken !== ctx.accountSessionToken;
    const connectedAsGuest = ctx.joined && guests.has(ctx.nick.toLowerCase());
    const synchronize = wasResolved
        ? account !== wasAccount || (account && (renewed || tokenChanged))
        : account && connectedAsGuest;
    ctx.accountStatusResolved = true;
    ctx.accountSessionToken = account ? sessionToken : "";
    ctx.isAccount = account;
    updateComposer();
    if (synchronize) restartChatConnection();
}

export function checkAccountStatus(): Promise<void> {
    if (!ctx.accountStatusRequest) {
        ctx.accountStatusRequest = requestAccountStatus().finally(() => {
            ctx.accountStatusRequest = null;
        });
    }
    return ctx.accountStatusRequest;
}

export function checkAccountWhenVisible(): void {
    if (!document.hidden) void checkAccountStatus();
}

export function enterBanned(): void {
    if (!ctx.banned) {
        ctx.banned = true;
        ctx.joined = false;
        addSystem("You are banned from this channel");
        updateComposer();
    }
    ctx.banRetry = true;
    ctx.sock?.close();
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
                if (granted.includes("echo-message")) ctx.capEcho = true;
                if (granted.includes("draft/message-redaction")) ctx.capRedact = true;
            }
            if (sub === "ACK" || sub === "NAK") {
                ctx.pendingCapRequests = Math.max(0, ctx.pendingCapRequests - 1);
                if (ctx.pendingCapRequests === 0) send("CAP END");
            }
            return;
        }
        case "REDACT": {
            if (line.params[0]?.toLowerCase() !== ctx.channel) return;
            const id = line.params[1];
            if (id) {
                const el = findMessageEl(id);
                if (el) redactMessageEl(el);
            }
            return;
        }
        case "001": {
            const confirmed = line.params[0] ?? ctx.nick;
            ctx.nick = confirmed;
            if (GUEST_NICK_RE.test(confirmed)) {
                ctx.pageGuestNick = confirmed;
                writeLocalStorage(GUEST_NICK_KEY, confirmed);
            }
            send(`JOIN ${ctx.channel}`);
            return;
        }
        case "JOIN": {
            const joiner = line.nick;
            const firstOwnJoin = joiner.toLowerCase() === ctx.nick.toLowerCase() && !ctx.joined;
            if (firstOwnJoin) {
                ctx.banned = false;
                ctx.joined = true;
                addSystem(`Connected as ${ctx.nick}`);
                updateComposer();
                updateModTools();
                updateReplyBar();
            }
            const key = joiner.toLowerCase();
            const isNewMember = !knownMembers.has(key);
            memberDisplay.set(key, joiner);
            knownMembers.add(key);
            if (firstOwnJoin) send(`NAMES ${ctx.channel}`);
            else if (isNewMember) scheduleNamesRefresh();
            return;
        }
        case "353": {
            const names = line.params[line.params.length - 1] ?? "";
            const chan = line.params[line.params.length - 2] ?? "";
            if (chan.toLowerCase() !== ctx.channel) return;
            applyNamesList(names);
            if (ctx.userlistOpen) renderUserlist();
            updateModTools();
            updateComposer();
            return;
        }
        case "MODE": {
            if (line.params[0]?.toLowerCase() !== ctx.channel) return;
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
            if (line.params[0]?.toLowerCase() !== ctx.channel) return;
            removeMember(line.nick.toLowerCase());
            if (ctx.userlistOpen) renderUserlist();
            return;
        }
        case "QUIT": {
            removeMember(line.nick.toLowerCase());
            if (ctx.userlistOpen) renderUserlist();
            return;
        }
        case "KICK": {
            if (line.params[0]?.toLowerCase() !== ctx.channel) return;
            const target = line.params[1] ?? "";
            if (target.toLowerCase() === ctx.nick.toLowerCase()) {
                enterBanned();
            } else {
                addSystem(`${target} was banned`);
                removeMember(target.toLowerCase());
                if (ctx.userlistOpen) renderUserlist();
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
            if (line.subBadge !== undefined && line.nick) {
                subscriberBadges.set(line.nick.toLowerCase(), sanitizeSubscriberBadgeName(line.subBadge));
            }
            if (target.toLowerCase() === ctx.channel) {
                if (line.automod) {
                    if (!document.body.classList.contains("chat-popout")) {
                        addHiddenMessage(line.nick, body, line.userId, line.avatar);
                    }
                } else {
                    addMessage(line.nick, body, line.msgid, line.reply, line.time, line.userId, line.avatar);
                }
            } else {
                addWhisper(line.nick, target, body, line.userId, line.avatar);
            }
            return;
        }
        case "SUBBADGE": {
            if (line.params[0]?.toLowerCase() !== ctx.channel) return;
            const who = line.params[1];
            if (!who) return;
            subscriberBadges.set(who.toLowerCase(), sanitizeSubscriberBadgeName(line.params[2]));
            if (ctx.userlistOpen) renderUserlist();
            return;
        }
        case "PIN": {
            if (line.params[0]?.toLowerCase() !== ctx.channel) return;
            const id = line.params[1] ?? "";
            if (id) addPin(id, line.params[2] ?? "", line.params[3] ?? "");
            return;
        }
        case "UNPIN": {
            if (line.params[0]?.toLowerCase() !== ctx.channel) return;
            const id = line.params[1];
            if (id) removePin(id);
            else clearPins();
            return;
        }
        case "RAID": {
            if (line.params[0]?.toLowerCase() !== ctx.channel) return;
            const raid = parseRaidStart(line.params[1], line.params[2], line.params[3]);
            if (raid) showRaidStart(raid.target, raid.seconds, raid.count);
            return;
        }
        case "RAIDCANCEL": {
            if (line.params[0]?.toLowerCase() !== ctx.channel) return;
            hideRaidBanner();
            return;
        }
        case "RAIDCOUNT": {
            if (line.params[0]?.toLowerCase() !== ctx.channel) return;
            const n = parseRaidCount(line.params[1]);
            if (n !== null) updateRaidCount(n);
            return;
        }
        case "RAIDGO": {
            if (line.params[0]?.toLowerCase() !== ctx.channel) return;
            const target = parseRaidTarget(line.params[1]);
            if (target) raidGo(target);
            return;
        }
        case "SYSMSG": {
            if (line.params[0]?.toLowerCase() !== ctx.channel) return;
            const text = line.params[line.params.length - 1];
            if (text) addSystemHighlight(text);
            return;
        }
        case "RAIDINCOMING": {
            if (line.params[0]?.toLowerCase() !== ctx.channel) return;
            const incoming = parseRaidIncoming(line.params[1], line.params[2]);
            if (incoming) addRaidIncoming(incoming.raider, incoming.viewers);
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

export function send(line: string): void {
    if (ctx.sock && ctx.sock.readyState === WebSocket.OPEN) ctx.sock.send(line);
}

function scheduleRetry(delayMs: number): void {
    if (ctx.destroyed || ctx.retryTimer !== null) return;
    ctx.retryTimer = window.setTimeout(() => {
        ctx.retryTimer = null;
        connect();
    }, delayMs);
}

function readyToOpenSocket(): boolean {
    return !ctx.destroyed && !(ctx.sock && (ctx.sock.readyState === WebSocket.CONNECTING || ctx.sock.readyState === WebSocket.OPEN));
}

function openChatSocket(chatWssBase: string): void {
    if (!readyToOpenSocket()) return;
    const proto = location.protocol === "https:" ? "wss" : "ws";
    const fallback = `${proto}://${location.host}`;
    const normalizedDirect = chatWssBase ? toWsOrigin(chatWssBase, location.protocol) : "";
    const { base, direct } = chooseTransportBase(normalizedDirect, fallback);
    const s = new WebSocket(`${base}/ws/irc`);
    ctx.sock = s;

    s.onopen = () => {
        if (ctx.sock !== s) return;
        ctx.pendingCapRequests = 2;
        s.send("CAP REQ :message-tags echo-message draft/message-redaction");
        s.send("CAP REQ :server-time");
        s.send(`NICK ${ctx.nick}`);
        s.send(`USER ${ctx.nick} 0 * :${ctx.nick}`);
    };
    s.onmessage = (ev) => {
        if (ctx.sock !== s) return;
        if (typeof ev.data !== "string") return;
        for (const raw of ev.data.split("\n")) {
            const line = parse(raw.replace(/\r$/, ""));
            if (line) handle(line);
        }
    };
    s.onclose = (ev) => {
        if (ctx.sock !== s) return;
        cancelNamesRefresh();
        ctx.sock = null;
        const wasJoined = ctx.joined;
        ctx.joined = false;
        updateComposer();
        if (ctx.destroyed) return;
        if (shouldMarkDirectFailed(direct, wasJoined)) {
            markDirectFailed(normalizedDirect);
            scheduleRetry(100);
            return;
        }
        if (ev.reason === "session-limit") {
            addSystem("Chat is open in too many windows.");
            scheduleRetry(FLOOD_RETRY_MS);
            return;
        }
        const reason = CLOSE_REASONS[ev.code];
        if (reason) addSystem(reason);
        const delay = ctx.banRetry || ctx.banned
            ? BAN_RETRY_MS
            : ev.code === 4400 ? FLOOD_RETRY_MS : RETRY_MS;
        ctx.banRetry = false;
        scheduleRetry(delay);
    };
    s.onerror = () => {
        if (ctx.sock === s) s.close();
    };
}

export function connect(): void {
    if (ctx.destroyed) return;
    if (ctx.sock && (ctx.sock.readyState === WebSocket.CONNECTING || ctx.sock.readyState === WebSocket.OPEN)) return;
    ctx.joined = false;
    cancelNamesRefresh();
    roles.clear();
    vips.clear();
    subscribers.clear();
    subscriberBadges.clear();
    unverified.clear();
    guests.clear();
    knownMembers.clear();
    memberDisplay.clear();
    colors.clear();
    ctx.replyTo = null;
    updateReplyBar();
    clearPins();
    dismissedPins.clear();
    if (ctx.userlistOpen) setUserlist(false);
    if (ctx.helpOpen) setHelp(false);
    if (ctx.settingsOpen) setSettings(false);
    ctx.capEcho = false;
    ctx.capRedact = false;
    ctx.pendingCapRequests = 0;
    updateComposer();
    updateModTools();
    ctx.nick = guestNick();

    void getChatWssBase().then(openChatSocket);
}

export function restartChatConnection(): void {
    if (ctx.destroyed || ctx.banned) return;
    if (ctx.retryTimer !== null) {
        window.clearTimeout(ctx.retryTimer);
        ctx.retryTimer = null;
    }
    const previous = ctx.sock;
    cancelNamesRefresh();
    ctx.sock = null;
    ctx.joined = false;
    updateComposer();
    previous?.close();
    connect();
}

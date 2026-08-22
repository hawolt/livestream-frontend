import { BAN_RETRY_MS, RETRY_MS, colors, ctx, knownMembers, msgsEl, partners, roles, subscriberBadges, subscribers, unverified, vips } from "./context.ts";
import type { Role } from "./context.ts";
import type { IrcLine } from "./irc.ts";
import { parse } from "./irc.ts";
import { addMessage, addSystemMessage, type BadgeSnapshot } from "./render.ts";
import { sanitizeSubscriberBadgeName } from "../chat/badges.ts";

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

function guestNick(): string {
    const buf = new Uint8Array(4);
    crypto.getRandomValues(buf);
    return "guest_" + Array.from(buf, (b) => b.toString(16).padStart(2, "0")).join("");
}

function send(line: string): void {
    if (ctx.sock && ctx.sock.readyState === WebSocket.OPEN) ctx.sock.send(line);
}

function applyNamesList(names: string): void {
    for (const raw of names.split(/\s+/)) {
        if (!raw) continue;
        let i = 0;
        let role: Role | null = null;
        let vip = false;
        let sub = false;
        let unver = false;
        for (; i < raw.length; i++) {
            const ch = raw[i];
            if (ch === "@") role = "op";
            else if (ch === "%") role = "staff";
            else if (ch === "&") role = "bot";
            else if (ch === "+") role = "mod";
            else if (ch === "~") vip = true;
            else if (ch === "*") sub = true;
            else if (ch === "=") unver = true;
            else if (ch === "?") continue;
            else break;
        }
        const name = raw.slice(i);
        if (!name) continue;
        const key = name.toLowerCase();
        knownMembers.add(key);
        if (role) roles.set(key, role);
        else roles.delete(key);
        if (vip) vips.add(key);
        else vips.delete(key);
        if (sub) {
            subscribers.add(key);
            if (!subscriberBadges.has(key)) subscriberBadges.set(key, "regular");
        } else {
            subscribers.delete(key);
            subscriberBadges.delete(key);
        }
        if (unver) unverified.add(key);
        else unverified.delete(key);
    }
}

function applyMemberMeta(who: string, line: IrcLine): void {
    const key = who.toLowerCase();
    if (line.subBadge) {
        subscribers.add(key);
        subscriberBadges.set(key, sanitizeSubscriberBadgeName(line.subBadge));
    }
    if (line.partner) partners.add(key);
}

function badgeSnapshotFrom(line: IrcLine): BadgeSnapshot {
    return { role: line.role, vip: line.vip, partner: line.partner, subBadge: line.subBadge, unverified: line.unverified };
}

function enterBanned(): void {
    ctx.banRetry = true;
    ctx.joined = false;
    ctx.sock?.close();
}

function handle(line: IrcLine): void {
    switch (line.command) {
        case "PING":
            send(`PONG :${line.params[0] ?? ""}`);
            return;
        case "CAP": {
            const sub = (line.params[1] ?? "").toUpperCase();
            if (sub === "ACK" || sub === "NAK") send("CAP END");
            return;
        }
        case "REDACT": {
            if (line.params[0]?.toLowerCase() !== ctx.channel) return;
            const id = line.params[1];
            if (id) {
                for (const el of Array.from(msgsEl.querySelectorAll<HTMLElement>(".msg[data-msgid]"))) {
                    if (el.dataset["msgid"] !== id) continue;
                    el.remove();
                    break;
                }
            }
            return;
        }
        case "001":
            ctx.nick = line.params[0] ?? ctx.nick;
            send(`JOIN ${ctx.channel}`);
            return;
        case "JOIN": {
            const joiner = line.nick;
            applyMemberMeta(joiner, line);
            const firstOwnJoin = joiner.toLowerCase() === ctx.nick.toLowerCase() && !ctx.joined;
            if (firstOwnJoin) ctx.joined = true;
            const key = joiner.toLowerCase();
            const isNewMember = !knownMembers.has(key);
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
            return;
        }
        case "KICK": {
            if (line.params[0]?.toLowerCase() !== ctx.channel) return;
            const target = line.params[1] ?? "";
            if (target.toLowerCase() === ctx.nick.toLowerCase()) enterBanned();
            return;
        }
        case "META": {
            if (line.params[0]?.toLowerCase() !== ctx.channel) return;
            const who = line.params[1];
            if (!who) return;
            applyMemberMeta(who, line);
            return;
        }
        case "SUBBADGE": {
            if (line.params[0]?.toLowerCase() !== ctx.channel) return;
            const who = line.params[1];
            if (!who) return;
            const key = who.toLowerCase();
            subscribers.add(key);
            subscriberBadges.set(key, sanitizeSubscriberBadgeName(line.params[2]));
            return;
        }
        case "PARTNER": {
            if (line.params[0]?.toLowerCase() !== ctx.channel) return;
            const who = line.params[1];
            if (!who) return;
            if (line.params[2] === "1") partners.add(who.toLowerCase());
            else partners.delete(who.toLowerCase());
            return;
        }
        case "VERIFIED": {
            if (line.params[0]?.toLowerCase() !== ctx.channel) return;
            const who = line.params[1];
            if (!who) return;
            if (line.params[2] === "1") unverified.delete(who.toLowerCase());
            else unverified.add(who.toLowerCase());
            return;
        }
        case "PRIVMSG":
            if (line.color !== undefined && line.nick) {
                const key = line.nick.toLowerCase();
                if (line.color) colors.set(key, line.color);
                else colors.delete(key);
            }
            if (line.subBadge !== undefined && line.nick) {
                const key = line.nick.toLowerCase();
                subscribers.add(key);
                subscriberBadges.set(key, sanitizeSubscriberBadgeName(line.subBadge));
            }
            if (line.partner && line.nick) {
                partners.add(line.nick.toLowerCase());
            }
            if (line.params[0]?.toLowerCase() === ctx.channel && line.params[1]) {
                addMessage(line.nick, line.params[1], line.msgid, badgeSnapshotFrom(line));
            }
            return;
        case "474":
            enterBanned();
            return;
        case "SYSMSG": {
            if (!ctx.showSystem) return;
            if (line.params[0]?.toLowerCase() !== ctx.channel) return;
            const text = line.params[1];
            if (text) addSystemMessage(text);
            return;
        }
        default:
            return;
    }
}

function scheduleRetry(delayMs: number): void {
    if (ctx.retryTimer !== null) return;
    ctx.retryTimer = window.setTimeout(() => {
        ctx.retryTimer = null;
        connect();
    }, delayMs);
}

export function connect(): void {
    if (ctx.sock && (ctx.sock.readyState === WebSocket.CONNECTING || ctx.sock.readyState === WebSocket.OPEN)) return;
    ctx.joined = false;
    cancelNamesRefresh();
    roles.clear();
    vips.clear();
    partners.clear();
    subscribers.clear();
    subscriberBadges.clear();
    colors.clear();
    unverified.clear();
    knownMembers.clear();
    ctx.nick = guestNick();

    const proto = location.protocol === "https:" ? "wss" : "ws";
    const s = new WebSocket(`${proto}://${location.host}/ws/irc`);
    ctx.sock = s;

    s.onopen = () => {
        if (ctx.sock !== s) return;
        s.send("CAP REQ :message-tags draft/message-redaction");
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
    s.onclose = () => {
        if (ctx.sock !== s) return;
        cancelNamesRefresh();
        ctx.sock = null;
        ctx.joined = false;
        const delay = ctx.banRetry ? BAN_RETRY_MS : RETRY_MS;
        ctx.banRetry = false;
        scheduleRetry(delay);
    };
    s.onerror = () => {
        if (ctx.sock === s) s.close();
    };
}

import { BAN_RETRY_MS, RETRY_MS, ctx, knownMembers, msgsEl, roles, unverified, vips } from "./context.ts";
import type { Role } from "./context.ts";
import type { IrcLine } from "./irc.ts";
import { parse } from "./irc.ts";
import { addMessage } from "./render.ts";

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
        let unver = false;
        for (; i < raw.length; i++) {
            const ch = raw[i];
            if (ch === "@") role = "op";
            else if (ch === "%") role = "staff";
            else if (ch === "&") role = "bot";
            else if (ch === "+") role = "mod";
            else if (ch === "~") vip = true;
            else if (ch === "=") unver = true;
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
        if (unver) unverified.add(key);
        else unverified.delete(key);
    }
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
            if (joiner === ctx.nick && !ctx.joined) ctx.joined = true;
            const key = joiner.toLowerCase();
            if (!knownMembers.has(key)) {
                knownMembers.add(key);
                send(`NAMES ${ctx.channel}`);
            }
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
        case "PRIVMSG":
            if (line.params[0]?.toLowerCase() === ctx.channel && line.params[1]) {
                addMessage(line.nick, line.params[1], line.msgid);
            }
            return;
        case "474":
            enterBanned();
            return;
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
    roles.clear();
    vips.clear();
    unverified.clear();
    knownMembers.clear();
    ctx.nick = guestNick();

    const proto = location.protocol === "https:" ? "wss" : "ws";
    const s = new WebSocket(`${proto}://${location.host}/ws/irc`);
    ctx.sock = s;

    s.onopen = () => {
        send("CAP REQ :message-tags draft/message-redaction");
        send(`NICK ${ctx.nick}`);
        send(`USER ${ctx.nick} 0 * :${ctx.nick}`);
    };
    s.onmessage = (ev) => {
        if (typeof ev.data !== "string") return;
        for (const raw of ev.data.split("\n")) {
            const line = parse(raw.replace(/\r$/, ""));
            if (line) handle(line);
        }
    };
    s.onclose = () => {
        if (ctx.sock !== s) return;
        ctx.sock = null;
        ctx.joined = false;
        const delay = ctx.banRetry ? BAN_RETRY_MS : RETRY_MS;
        ctx.banRetry = false;
        scheduleRetry(delay);
    };
    s.onerror = () => s.close();
}

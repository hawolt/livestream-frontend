const msgsEl = document.getElementById("chat-messages") as HTMLElement;

const EMOTE_SET_URL = "https://7tv.io/v3/emote-sets/global";
const EMOTE_FILE = "2x.webp";
const EMOTE_FILE_FALLBACK = "1x.webp";
const MAX_MESSAGES = 100;
const RETRY_MS = 5000;
const BAN_RETRY_MS = 30000;

const emotes = new Map<string, string>();

type Role = "op" | "staff" | "bot" | "mod";
const roles = new Map<string, Role>();
const vips = new Set<string>();
const unverified = new Set<string>();
const knownMembers = new Set<string>();

let channel = "";
let nick = "";
let joined = false;
let sock: WebSocket | null = null;
let retryTimer: number | null = null;
let banRetry = false;

let showBadges = true;
let showEmotes = true;
let fadeMs = 0;
let demoMode = false;

function parseParams(): void {
    const qs = new URLSearchParams(location.search);
    const size = qs.get("size");
    if (size === "s" || size === "l") document.body.dataset.size = size;
    const fadeSec = Number(qs.get("fade"));
    fadeMs = Number.isFinite(fadeSec) && fadeSec > 0 ? fadeSec * 1000 : 0;
    showBadges = qs.get("badges") !== "0";
    showEmotes = qs.get("emotes") !== "0";
    if (qs.get("bg") === "1") document.body.dataset.bg = "1";
    if (qs.get("shadow") === "0") document.body.dataset.shadow = "0";
    if (qs.get("align") === "right") document.body.dataset.align = "right";
    demoMode = qs.get("demo") === "1";
}

function guestNick(): string {
    const buf = new Uint8Array(4);
    crypto.getRandomValues(buf);
    return "guest_" + Array.from(buf, (b) => b.toString(16).padStart(2, "0")).join("");
}

function nickColor(from: string): string {
    let h = 0;
    for (let i = 0; i < from.length; i++) h = (h * 31 + from.charCodeAt(i)) % 360;
    return `hsl(${h}, 65%, 68%)`;
}

function isOwner(from: string): boolean {
    return from.toLowerCase() === channel.slice(1);
}

type BadgeName = "op" | "staff" | "bot" | "mod" | "vip" | "unverified";

function makeBadge(name: BadgeName): HTMLImageElement {
    const img = document.createElement("img");
    img.className = "badge";
    img.src = `/static/img/badge-${name}.svg`;
    img.alt = name;
    return img;
}

function buildBadges(from: string): HTMLImageElement[] {
    if (!showBadges) return [];
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

const zeroWidthEmotes = new Set<string>();

function buildOverlayEmote(token: string, url: string): HTMLImageElement {
    const img = document.createElement("img");
    img.className = "emote";
    img.src = url;
    img.alt = token;
    img.title = token;
    return img;
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
        const url = showEmotes ? emotes.get(token) : undefined;
        if (url && zeroWidthEmotes.has(token) && lastStack) {
            const img = buildOverlayEmote(token, url);
            img.classList.add("emote-zw");
            lastStack.appendChild(img);
            pendingWs = "";
            continue;
        }
        if (pendingWs) {
            frag.appendChild(document.createTextNode(pendingWs));
            pendingWs = "";
        }
        if (!url) {
            frag.appendChild(document.createTextNode(token));
            lastStack = null;
            continue;
        }
        const stack = document.createElement("span");
        stack.className = "emote-stack";
        stack.appendChild(buildOverlayEmote(token, url));
        frag.appendChild(stack);
        lastStack = stack;
    }
    if (pendingWs) frag.appendChild(document.createTextNode(pendingWs));
    return frag;
}

async function loadEmotes(): Promise<void> {
    try {
        const res = await fetch(EMOTE_SET_URL);
        if (!res.ok) return;
        const data = await res.json();
        for (const emote of data?.emotes ?? []) {
            const name: unknown = emote?.name;
            const host = emote?.data?.host;
            if (typeof name !== "string" || !name || typeof host?.url !== "string") continue;
            const files: { name?: string }[] = host.files ?? [];
            const file = files.find((f) => f.name === EMOTE_FILE) ?? files.find((f) => f.name === EMOTE_FILE_FALLBACK);
            if (!file?.name) continue;
            emotes.set(name, `https:${host.url}/${file.name}`);
            const zw = ((emote?.flags ?? 0) & 1) !== 0 || ((emote?.data?.flags ?? 0) & 256) !== 0;
            if (zw) zeroWidthEmotes.add(name);
            else zeroWidthEmotes.delete(name);
        }
    } catch {}
}

function append(node: HTMLElement): void {
    msgsEl.appendChild(node);
    while (msgsEl.childElementCount > MAX_MESSAGES) msgsEl.removeChild(msgsEl.firstElementChild as Element);
    if (fadeMs > 0) {
        window.setTimeout(() => {
            node.classList.add("fade-out");
            window.setTimeout(() => node.remove(), 400);
        }, fadeMs);
    }
}

function addMessage(from: string, text: string, msgid?: string): void {
    const line = document.createElement("div");
    line.className = "msg";
    if (msgid) line.dataset["msgid"] = msgid;
    const badges = buildBadges(from);
    if (badges.length) line.append(...badges);
    const who = document.createElement("span");
    who.className = "nick";
    who.textContent = from;
    who.style.color = nickColor(from);
    line.append(who, document.createTextNode(": "), renderBody(text));
    append(line);
}

interface IrcLine {
    nick: string;
    command: string;
    params: string[];
    msgid?: string;
}

function parse(line: string): IrcLine | null {
    let rest = line;
    let from = "";
    let msgid: string | undefined;
    if (rest.startsWith("@")) {
        const sp = rest.indexOf(" ");
        if (sp < 0) return null;
        for (const tag of rest.slice(1, sp).split(";")) {
            const eq = tag.indexOf("=");
            if (eq > 0 && tag.slice(0, eq) === "msgid") msgid = tag.slice(eq + 1);
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
    banRetry = true;
    joined = false;
    sock?.close();
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
            if (line.params[0]?.toLowerCase() !== channel) return;
            const id = line.params[1];
            if (id) msgsEl.querySelector(`.msg[data-msgid="${id}"]`)?.remove();
            return;
        }
        case "001":
            nick = line.params[0] ?? nick;
            send(`JOIN ${channel}`);
            return;
        case "JOIN": {
            const joiner = line.nick;
            if (joiner === nick && !joined) joined = true;
            const key = joiner.toLowerCase();
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
            return;
        }
        case "KICK": {
            if (line.params[0]?.toLowerCase() !== channel) return;
            const target = line.params[1] ?? "";
            if (target.toLowerCase() === nick.toLowerCase()) enterBanned();
            return;
        }
        case "PRIVMSG":
            if (line.params[0]?.toLowerCase() === channel && line.params[1]) {
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
    if (retryTimer !== null) return;
    retryTimer = window.setTimeout(() => {
        retryTimer = null;
        connect();
    }, delayMs);
}

function connect(): void {
    if (sock && (sock.readyState === WebSocket.CONNECTING || sock.readyState === WebSocket.OPEN)) return;
    joined = false;
    roles.clear();
    vips.clear();
    unverified.clear();
    knownMembers.clear();
    nick = guestNick();

    const proto = location.protocol === "https:" ? "wss" : "ws";
    const s = new WebSocket(`${proto}://${location.host}/ws/irc`);
    sock = s;

    s.onopen = () => {
        send("CAP REQ :message-tags draft/message-redaction");
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
    s.onclose = () => {
        if (sock !== s) return;
        sock = null;
        joined = false;
        const delay = banRetry ? BAN_RETRY_MS : RETRY_MS;
        banRetry = false;
        scheduleRetry(delay);
    };
    s.onerror = () => s.close();
}

const DEMO_STAFF = "sentinel";
const DEMO_MOD = "riverside";
const DEMO_VIP = "emberly";
const DEMO_GUEST = "guest_8f3a91c2";
const DEMO_USER = "kestrel";
const DEMO_EMOTE_USER = "pixelfox";
const DEMO_LONG_USER = "northwind";
const DEMO_INTERVAL_MS = 1500;

function demoEmoteToken(): string {
    if (emotes.size > 0) return emotes.keys().next().value as string;
    return "nice";
}

function demoScript(): [string, string][] {
    return [
        [DEMO_STAFF, "welcome to the stream, chat!"],
        [channel.slice(1), "hey everyone, good to see you"],
        [DEMO_MOD, "reminder: keep it friendly in here"],
        [DEMO_VIP, "been here since day one, love it"],
        [DEMO_GUEST, "first time here, loving the stream so far"],
        [DEMO_USER, "let's gooo"],
        [DEMO_EMOTE_USER, `${demoEmoteToken()} that play was insane`],
        [DEMO_LONG_USER, "this is a much longer message meant to show how the overlay wraps text across multiple lines once a viewer writes something more substantial than a quick reaction"],
    ];
}

function startDemo(): void {
    roles.set(DEMO_STAFF.toLowerCase(), "staff");
    roles.set(DEMO_MOD.toLowerCase(), "mod");
    vips.add(DEMO_VIP.toLowerCase());
    let i = 0;
    const step = (): void => {
        const script = demoScript();
        const [from, text] = script[i % script.length]!;
        addMessage(from, text);
        i++;
    };
    step();
    window.setInterval(step, DEMO_INTERVAL_MS);
}

function boot(): void {
    const m = location.pathname.match(/^\/chat\/([A-Za-z0-9_-]{3,32})\/?$/);
    if (!m) return;
    channel = `#${m[1].toLowerCase()}`;
    parseParams();
    if (showEmotes) void loadEmotes();
    if (demoMode) startDemo();
    else connect();
}

boot();

export {};

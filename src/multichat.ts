import { ChatEmoteCatalog, type ChatEmoteScope } from "./chat-emotes.ts";

const scrollEl = document.getElementById("chat-scroll") as HTMLElement;
const msgsEl = document.getElementById("chat-messages") as HTMLElement;
const resumeEl = document.getElementById("resume") as HTMLButtonElement;
const hintEl = document.getElementById("hint") as HTMLElement;

const MAX_MESSAGES = 200;
const RETRY_MS = 5000;
const OFFLINE_RETRY_MS = 45000;
const EMOTE_SET_URL = "https://7tv.io/v3/emote-sets/global";
const RENDERED_BODY_CLASS = "rendered-emote-body";

type Platform = "itzon" | "twitch" | "youtube" | "kick";

const SVG_NS = "http://www.w3.org/2000/svg";

const PLATFORM_ICON_PATHS: Record<Exclude<Platform, "itzon">, { path: string; color: string }> = {
    twitch: {
        path: "M11.571 4.714h1.715v5.143H11.57zm4.715 0H18v5.143h-1.714zM6 0L1.714 4.286v15.428h5.143V24l4.286-4.286h3.428L22.286 12V0zm14.571 11.143l-3.428 3.428h-3.429l-3 3v-3H7.714V1.714h12.857z",
        color: "#9146ff",
    },
    youtube: {
        path: "M23.5 6.19a3.02 3.02 0 0 0-2.12-2.14C19.5 3.55 12 3.55 12 3.55s-7.5 0-9.38.5A3.02 3.02 0 0 0 .5 6.19C0 8.07 0 12 0 12s0 3.93.5 5.81a3.02 3.02 0 0 0 2.12 2.14c1.88.5 9.38.5 9.38.5s7.5 0 9.38-.5a3.02 3.02 0 0 0 2.12-2.14C24 15.93 24 12 24 12s0-3.93-.5-5.81zM9.55 15.57V8.43L15.82 12z",
        color: "#ff0000",
    },
    kick: {
        path: "M1.333 0h8v5.333H12V2.667h2.667V0h8v8H20v2.667h-2.667v2.666H20V16h2.667v8h-8v-2.667H12v-2.666H9.333V24h-8Z",
        color: "#53fc18",
    },
};

const emotes = new ChatEmoteCatalog();
let showEmotes = true;
let pinned = true;

interface Sources {
    channel: string;
    twitch: string;
    youtube: string;
    ytVideo: string;
    kick: string;
    proxy: string;
}

function parseParams(): Sources {
    const qs = new URLSearchParams(location.search);
    const size = qs.get("size");
    if (size === "s" || size === "l") document.body.dataset["size"] = size;
    showEmotes = qs.get("emotes") !== "0";
    const clean = (value: string | null, pattern: RegExp): string => {
        const v = (value ?? "").trim().replace(/^[@#]/, "");
        return pattern.test(v) ? v : "";
    };
    return {
        channel: clean(qs.get("channel"), /^[A-Za-z0-9_-]{3,32}$/),
        twitch: clean(qs.get("twitch"), /^[A-Za-z0-9_]{3,32}$/),
        youtube: clean(qs.get("youtube"), /^[A-Za-z0-9._-]{3,30}$/),
        ytVideo: clean(qs.get("ytvideo"), /^[A-Za-z0-9_-]{11}$/),
        kick: clean(qs.get("kick"), /^[A-Za-z0-9_-]{3,30}$/),
        proxy: (qs.get("proxy") ?? "").trim().replace(/[^A-Za-z0-9.:-]/g, ""),
    };
}

function bareHost(): string {
    return location.hostname.replace(/^(www|live|studio)\./, "");
}

function proxyBase(sources: Sources): string {
    return sources.proxy || `chat-proxy.${bareHost()}:8445`;
}

function nickColor(from: string): string {
    let h = 0;
    for (let i = 0; i < from.length; i++) h = (h * 31 + from.charCodeAt(i)) % 360;
    return `hsl(${h}, 65%, 68%)`;
}

function makeIcon(platform: Platform): HTMLSpanElement {
    const wrap = document.createElement("span");
    wrap.className = "picon";
    wrap.title = platform;
    if (platform === "itzon") {
        const img = document.createElement("img");
        img.src = "/static/img/icon.png";
        img.alt = "itzon";
        wrap.appendChild(img);
        return wrap;
    }
    const spec = PLATFORM_ICON_PATHS[platform];
    const svg = document.createElementNS(SVG_NS, "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    const path = document.createElementNS(SVG_NS, "path");
    path.setAttribute("d", spec.path);
    path.setAttribute("fill", spec.color);
    svg.appendChild(path);
    wrap.appendChild(svg);
    return wrap;
}

function nearBottom(): boolean {
    return scrollEl.scrollHeight - scrollEl.scrollTop - scrollEl.clientHeight < 40;
}

function scrollToBottom(): void {
    scrollEl.scrollTop = scrollEl.scrollHeight;
}

scrollEl.addEventListener("scroll", () => {
    pinned = nearBottom();
    resumeEl.classList.toggle("show", !pinned);
});

resumeEl.addEventListener("click", () => {
    pinned = true;
    resumeEl.classList.remove("show");
    scrollToBottom();
});

function append(node: HTMLElement): void {
    msgsEl.appendChild(node);
    while (msgsEl.childElementCount > MAX_MESSAGES) msgsEl.removeChild(msgsEl.firstElementChild as Element);
    if (pinned) scrollToBottom();
}

interface MessageMeta {
    color?: string;
    amount?: string;
    id?: string;
    login?: string;
}

function addChat(platform: Platform, from: string, body: Node, meta: MessageMeta = {}): void {
    const line = document.createElement("div");
    line.className = "msg";
    line.dataset["platform"] = platform;
    if (meta.id) line.dataset["mid"] = meta.id;
    if (meta.login) line.dataset["login"] = meta.login.toLowerCase();
    line.appendChild(makeIcon(platform));
    if (meta.amount) {
        const amount = document.createElement("span");
        amount.className = "amount";
        amount.textContent = meta.amount;
        line.appendChild(amount);
    }
    const who = document.createElement("span");
    who.className = "nick";
    who.textContent = from;
    who.style.color = meta.color || nickColor(from);
    line.append(who, document.createTextNode(": "), body);
    append(line);
}

function addSystem(platform: Platform, text: string): void {
    const line = document.createElement("div");
    line.className = "msg sys";
    line.appendChild(makeIcon(platform));
    line.appendChild(document.createTextNode(text));
    append(line);
}

function removeMessage(platform: Platform, id: string): void {
    for (const el of Array.from(msgsEl.querySelectorAll<HTMLElement>(`.msg[data-platform="${platform}"]`))) {
        if (el.dataset["mid"] === id) {
            el.remove();
            return;
        }
    }
}

function removeMessagesByLogin(platform: Platform, login: string): void {
    for (const el of Array.from(msgsEl.querySelectorAll<HTMLElement>(`.msg[data-platform="${platform}"]`))) {
        if (el.dataset["login"] === login.toLowerCase()) el.remove();
    }
}

function buildEmoteImg(token: string, url: string): HTMLImageElement {
    const img = document.createElement("img");
    img.className = "emote";
    img.src = url;
    img.alt = token;
    img.title = token;
    return img;
}

function renderSevenTvBody(text: string): DocumentFragment {
    const frag = document.createDocumentFragment();
    let lastStack: HTMLElement | null = null;
    let pendingWs = "";
    for (const token of text.split(/(\s+)/)) {
        if (!token) continue;
        if (/^\s+$/.test(token)) {
            pendingWs += token;
            continue;
        }
        const emote = showEmotes ? emotes.get(token) : undefined;
        const url = emote?.url;
        if (url && emote.zeroWidth && lastStack) {
            const img = buildEmoteImg(token, url);
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
        stack.appendChild(buildEmoteImg(token, url));
        frag.appendChild(stack);
        lastStack = stack;
    }
    if (pendingWs) frag.appendChild(document.createTextNode(pendingWs));
    return frag;
}

function buildRenderedBody(text: string): HTMLSpanElement {
    const body = document.createElement("span");
    body.className = RENDERED_BODY_CLASS;
    body.dataset["rawText"] = text;
    body.appendChild(renderSevenTvBody(text));
    return body;
}

function refreshEmoteRendering(): void {
    for (const body of Array.from(msgsEl.querySelectorAll<HTMLElement>(`.${RENDERED_BODY_CLASS}`))) {
        body.replaceChildren(renderSevenTvBody(body.dataset["rawText"] ?? ""));
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

async function loadChannelEmotes(user: string): Promise<void> {
    const jobs = [loadEmoteSet(EMOTE_SET_URL, "global")];
    try {
        const res = await fetch(`/api/live/channel/${encodeURIComponent(user)}`);
        if (res.ok) {
            const info: any = await res.json();
            if (info && typeof info.emoteTwitchId === "string" && info.emoteTwitchId) {
                jobs.push(loadEmoteSet(`https://7tv.io/v3/users/twitch/${encodeURIComponent(info.emoteTwitchId)}`, "channel"));
            }
        }
    } catch {}
    await Promise.all(jobs);
}

interface IrcLine {
    nick: string;
    command: string;
    params: string[];
    tags: Map<string, string>;
}

function parseIrc(line: string): IrcLine | null {
    let rest = line;
    let from = "";
    const tags = new Map<string, string>();
    if (rest.startsWith("@")) {
        const sp = rest.indexOf(" ");
        if (sp < 0) return null;
        for (const tag of rest.slice(1, sp).split(";")) {
            const eq = tag.indexOf("=");
            if (eq > 0) tags.set(tag.slice(0, eq), tag.slice(eq + 1));
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
    return { nick: from, command: command.toUpperCase(), params, tags };
}

function guestNick(): string {
    const buf = new Uint8Array(4);
    crypto.getRandomValues(buf);
    return "guest_" + Array.from(buf, (b) => b.toString(16).padStart(2, "0")).join("");
}

function startItzon(channelName: string): void {
    const channel = `#${channelName.toLowerCase()}`;
    let sock: WebSocket | null = null;
    let nick = "";

    const send = (line: string): void => {
        if (sock && sock.readyState === WebSocket.OPEN) sock.send(line);
    };

    const handle = (line: IrcLine): void => {
        switch (line.command) {
            case "PING":
                send(`PONG :${line.params[0] ?? ""}`);
                return;
            case "CAP": {
                const sub = (line.params[1] ?? "").toUpperCase();
                if (sub === "ACK" || sub === "NAK") send("CAP END");
                return;
            }
            case "001":
                nick = line.params[0] ?? nick;
                send(`JOIN ${channel}`);
                return;
            case "PRIVMSG": {
                if (line.params[0]?.toLowerCase() !== channel || !line.params[1]) return;
                const meta: MessageMeta = {};
                const color = line.tags.get("color");
                if (color && /^#[0-9a-fA-F]{6}$/.test(color)) meta.color = color;
                const msgid = line.tags.get("msgid");
                if (msgid) meta.id = msgid;
                addChat("itzon", line.nick, buildRenderedBody(line.params[1]), meta);
                return;
            }
            case "REDACT": {
                if (line.params[0]?.toLowerCase() !== channel) return;
                const id = line.params[1];
                if (id) removeMessage("itzon", id);
                return;
            }
            default:
                return;
        }
    };

    const connect = (): void => {
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
                const line = parseIrc(raw.replace(/\r$/, ""));
                if (line) handle(line);
            }
        };
        s.onclose = () => {
            if (sock !== s) return;
            sock = null;
            window.setTimeout(connect, RETRY_MS);
        };
        s.onerror = () => s.close();
    };

    if (showEmotes) void loadChannelEmotes(channelName.toLowerCase());
    connect();
}

function renderTwitchBody(text: string, emotesTag: string): DocumentFragment {
    const frag = document.createDocumentFragment();
    const cps = Array.from(text);
    const ranges: { id: string; start: number; end: number }[] = [];
    for (const group of emotesTag.split("/")) {
        const colon = group.indexOf(":");
        if (colon <= 0) continue;
        const id = group.slice(0, colon);
        for (const span of group.slice(colon + 1).split(",")) {
            const dash = span.indexOf("-");
            if (dash <= 0) continue;
            const start = Number(span.slice(0, dash));
            const end = Number(span.slice(dash + 1));
            if (Number.isInteger(start) && Number.isInteger(end) && start >= 0 && end >= start && end < cps.length) {
                ranges.push({ id, start, end });
            }
        }
    }
    ranges.sort((a, b) => a.start - b.start);
    let pos = 0;
    for (const range of ranges) {
        if (range.start < pos) continue;
        if (range.start > pos) frag.appendChild(document.createTextNode(cps.slice(pos, range.start).join("")));
        const token = cps.slice(range.start, range.end + 1).join("");
        frag.appendChild(buildEmoteImg(token, `https://static-cdn.jtvnw.net/emoticons/v2/${range.id}/default/dark/1.0`));
        pos = range.end + 1;
    }
    if (pos < cps.length) frag.appendChild(document.createTextNode(cps.slice(pos).join("")));
    return frag;
}

function startTwitch(channelName: string): void {
    const channel = `#${channelName.toLowerCase()}`;
    let sock: WebSocket | null = null;

    const send = (line: string): void => {
        if (sock && sock.readyState === WebSocket.OPEN) sock.send(line);
    };

    const handle = (line: IrcLine): void => {
        switch (line.command) {
            case "PING":
                send(`PONG :${line.params[0] ?? ""}`);
                return;
            case "001":
                send(`JOIN ${channel}`);
                return;
            case "PRIVMSG": {
                if (line.params[0]?.toLowerCase() !== channel || !line.params[1]) return;
                let body = line.params[1];
                if (body.startsWith("\u0001ACTION ") && body.endsWith("\u0001")) body = body.slice(8, -1);
                const meta: MessageMeta = { login: line.nick };
                const color = line.tags.get("color");
                if (color && /^#[0-9a-fA-F]{6}$/.test(color)) meta.color = color;
                const msgid = line.tags.get("id");
                if (msgid) meta.id = msgid;
                const display = line.tags.get("display-name") || line.nick;
                const emotesTag = line.tags.get("emotes") ?? "";
                const rendered = showEmotes && emotesTag
                    ? renderTwitchBody(body, emotesTag)
                    : document.createTextNode(body);
                addChat("twitch", display, rendered, meta);
                return;
            }
            case "CLEARMSG": {
                const id = line.tags.get("target-msg-id");
                if (id) removeMessage("twitch", id);
                return;
            }
            case "CLEARCHAT": {
                const target = line.params[1];
                if (target) removeMessagesByLogin("twitch", target);
                return;
            }
            default:
                return;
        }
    };

    const connect = (): void => {
        const s = new WebSocket("wss://irc-ws.chat.twitch.tv:443");
        sock = s;
        s.onopen = () => {
            send("CAP REQ :twitch.tv/tags twitch.tv/commands");
            send(`NICK justinfan${Math.floor(10000 + Math.random() * 80000)}`);
        };
        s.onmessage = (ev) => {
            if (typeof ev.data !== "string") return;
            for (const raw of ev.data.split("\r\n")) {
                if (!raw) continue;
                const line = parseIrc(raw);
                if (line) handle(line);
            }
        };
        s.onclose = () => {
            if (sock !== s) return;
            sock = null;
            window.setTimeout(connect, RETRY_MS);
        };
        s.onerror = () => s.close();
    };

    connect();
}

interface YtRun {
    text?: string;
    emoji?: string;
    alt?: string;
}

function renderYoutubeRuns(runs: YtRun[]): DocumentFragment {
    const frag = document.createDocumentFragment();
    for (const run of runs) {
        if (typeof run.text === "string" && run.text) {
            frag.appendChild(document.createTextNode(run.text));
        } else if (typeof run.emoji === "string" && run.emoji && showEmotes) {
            frag.appendChild(buildEmoteImg(run.alt || "emoji", run.emoji));
        } else if (typeof run.alt === "string" && run.alt) {
            frag.appendChild(document.createTextNode(run.alt));
        }
    }
    return frag;
}

function startYoutube(base: string, query: string): void {
    let sock: WebSocket | null = null;
    let lastState = "";

    const connect = (): void => {
        const s = new WebSocket(`wss://${base}/ws/youtube?${query}`);
        sock = s;
        s.onmessage = (ev) => {
            if (typeof ev.data !== "string") return;
            let frame: any;
            try {
                frame = JSON.parse(ev.data);
            } catch {
                return;
            }
            if (frame.type === "status" && typeof frame.state === "string") {
                if (frame.state !== lastState && frame.state !== "connecting" && frame.state !== "live") {
                    addSystem("youtube", `YouTube chat ${frame.state}`);
                }
                lastState = frame.state;
                return;
            }
            if (frame.type === "chat" && typeof frame.author === "string") {
                const meta: MessageMeta = {};
                if (typeof frame.id === "string") meta.id = frame.id;
                if (typeof frame.amount === "string" && frame.amount) meta.amount = frame.amount;
                const runs: YtRun[] = Array.isArray(frame.runs) ? frame.runs : [];
                addChat("youtube", frame.author.replace(/^@/, ""), renderYoutubeRuns(runs), meta);
                return;
            }
            if (frame.type === "delete" && typeof frame.id === "string") {
                removeMessage("youtube", frame.id);
            }
        };
        s.onclose = (ev) => {
            if (sock !== s) return;
            sock = null;
            const delay = ev.reason === "offline" || lastState === "offline" ? OFFLINE_RETRY_MS : RETRY_MS;
            window.setTimeout(connect, delay);
        };
        s.onerror = () => s.close();
    };

    connect();
}

const KICK_EMOTE_PATTERN = /\[emote:(\d+):([^\]]*)\]/g;

function renderKickBody(content: string): DocumentFragment {
    const frag = document.createDocumentFragment();
    let pos = 0;
    for (const match of content.matchAll(KICK_EMOTE_PATTERN)) {
        const index = match.index ?? 0;
        if (index > pos) frag.appendChild(document.createTextNode(content.slice(pos, index)));
        if (showEmotes) {
            frag.appendChild(buildEmoteImg(match[2] || "emote", `https://files.kick.com/emotes/${match[1]}/fullsize`));
        } else if (match[2]) {
            frag.appendChild(document.createTextNode(match[2]));
        }
        pos = index + match[0].length;
    }
    if (pos < content.length) frag.appendChild(document.createTextNode(content.slice(pos)));
    return frag;
}

function startKick(base: string, slug: string): void {
    let sock: WebSocket | null = null;

    const openPusher = (chatroomId: number, key: string, cluster: string): void => {
        const s = new WebSocket(`wss://ws-${cluster}.pusher.com/app/${key}?protocol=7&client=js&version=8.4.0&flash=false`);
        sock = s;
        s.onmessage = (ev) => {
            if (typeof ev.data !== "string") return;
            let frame: any;
            try {
                frame = JSON.parse(ev.data);
            } catch {
                return;
            }
            if (frame.event === "pusher:connection_established") {
                s.send(JSON.stringify({ event: "pusher:subscribe", data: { auth: "", channel: `chatrooms.${chatroomId}.v2` } }));
                return;
            }
            if (frame.event === "pusher:ping") {
                s.send(JSON.stringify({ event: "pusher:pong", data: {} }));
                return;
            }
            if (typeof frame.data !== "string") return;
            let payload: any;
            try {
                payload = JSON.parse(frame.data);
            } catch {
                return;
            }
            if (frame.event === "App\\Events\\ChatMessageEvent") {
                const from: unknown = payload?.sender?.username;
                const content: unknown = payload?.content;
                if (typeof from !== "string" || typeof content !== "string") return;
                const meta: MessageMeta = {};
                if (typeof payload?.id === "string") meta.id = payload.id;
                const color: unknown = payload?.sender?.identity?.color;
                if (typeof color === "string" && /^#[0-9a-fA-F]{6}$/.test(color)) meta.color = color;
                addChat("kick", from, renderKickBody(content), meta);
                return;
            }
            if (frame.event === "App\\Events\\MessageDeletedEvent") {
                const id: unknown = payload?.message?.id;
                if (typeof id === "string") removeMessage("kick", id);
            }
        };
        s.onclose = () => {
            if (sock !== s) return;
            sock = null;
            window.setTimeout(() => void resolveAndConnect(), RETRY_MS);
        };
        s.onerror = () => s.close();
    };

    const resolveAndConnect = async (): Promise<void> => {
        try {
            const res = await fetch(`https://${base}/kick/chatroom?channel=${encodeURIComponent(slug)}`);
            if (res.status === 404) {
                addSystem("kick", `Kick channel "${slug}" not found`);
                return;
            }
            if (!res.ok) throw new Error(`lookup ${res.status}`);
            const info: any = await res.json();
            if (typeof info?.chatroomId !== "number" || typeof info?.pusherKey !== "string" || typeof info?.pusherCluster !== "string") {
                throw new Error("bad lookup payload");
            }
            openPusher(info.chatroomId, info.pusherKey, info.pusherCluster);
        } catch {
            window.setTimeout(() => void resolveAndConnect(), OFFLINE_RETRY_MS);
        }
    };

    void resolveAndConnect();
}

function showHint(): void {
    hintEl.classList.add("show");
    const p = document.createElement("p");
    p.append("No chat sources configured. Add any of: ");
    const code = document.createElement("code");
    code.textContent = "?channel=<itzon user>&twitch=<channel>&youtube=<handle>&kick=<slug>";
    p.appendChild(code);
    const p2 = document.createElement("p");
    p2.append("Optional: ");
    const code2 = document.createElement("code");
    code2.textContent = "ytvideo=<video id>, size=s|l, emotes=0";
    p2.appendChild(code2);
    hintEl.append(p, p2);
}

function boot(): void {
    const sources = parseParams();
    const base = proxyBase(sources);
    let any = false;
    if (sources.channel) {
        startItzon(sources.channel);
        any = true;
    }
    if (sources.twitch) {
        startTwitch(sources.twitch);
        any = true;
    }
    if (sources.ytVideo) {
        startYoutube(base, `v=${encodeURIComponent(sources.ytVideo)}`);
        any = true;
    } else if (sources.youtube) {
        startYoutube(base, `c=${encodeURIComponent(sources.youtube)}`);
        any = true;
    }
    if (sources.kick) {
        startKick(base, sources.kick);
        any = true;
    }
    if (!any) showHint();
}

boot();

export {};

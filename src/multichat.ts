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

type Platform = "itzon" | "twitch" | "youtube" | "kick" | "tiktok";

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
    tiktok: {
        path: "M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z",
        color: "#fe2c55",
    },
};

const TIKTOK_BADGE_CHIPS: Record<string, { label: string; color: string }> = {
    owner: { label: "HOST", color: "#fe2c55" },
    moderator: { label: "MOD", color: "#25f4ee" },
    subscriber: { label: "SUB", color: "#fe2c55" },
};

type SiteBadge = "op" | "staff" | "bot" | "mod" | "vip" | "unverified";

const TWITCH_BADGE_IDS: Record<string, string> = {
    broadcaster: "5527c58c-fb7d-422d-b71b-f309dcb85cc1",
    moderator: "3267646d-33f0-4b17-b3df-f923a41db1d0",
    vip: "b817aba4-fad8-49e2-b88a-7cc744dfa6ec",
    partner: "d12a2e27-16f6-41d0-ab77-b780518f00a3",
    staff: "d97c37bd-a6f5-4c38-8f57-4e4bef88af34",
    subscriber: "5d9f2208-5dd8-11e7-8513-2ff4adfae661",
    founder: "511b78a9-ab37-472f-9569-457753bbe7d3",
    premium: "bbbe0db0-a598-423e-86d0-f9fb98ca1933",
    turbo: "bd444ec6-8f34-4bf9-91f4-af1e3428d80f",
};

const KICK_BADGE_CHIPS: Record<string, { label: string; color: string }> = {
    broadcaster: { label: "HOST", color: "#e93d82" },
    moderator: { label: "MOD", color: "#31a3ff" },
    vip: { label: "VIP", color: "#ff9d00" },
    og: { label: "OG", color: "#00e5c7" },
    founder: { label: "FOUNDER", color: "#ff5c00" },
    verified: { label: "VERIFIED", color: "#53fc18" },
    subscriber: { label: "SUB", color: "#53fc18" },
    sub_gifter: { label: "GIFTER", color: "#b066ff" },
};

const YT_MOD_PATH = "M22.7 19l-9.1-9.1c.9-2.3.4-5-1.5-6.9-2-2-5-2.4-7.4-1.3L9 6 6 9 1.6 4.7C.4 7.1.9 10.1 2.9 12.1c1.9 1.9 4.6 2.4 6.9 1.5l9.1 9.1c.4.4 1 .4 1.4 0l2.3-2.3c.5-.4.5-1.1.1-1.4z";
const YT_VERIFIED_PATH = "M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10 10-4.5 10-10S17.5 2 12 2zm-2 15l-5-5 1.4-1.4L10 14.2l7.6-7.6L19 8l-9 9z";

const emotes = new ChatEmoteCatalog();
const twitchEmotes = new Map<string, string>();
let showEmotes = true;
let showBadges = true;
let showIcons = true;
let fadeMs = 0;
let pinned = true;

interface Sources {
    channel: string;
    twitch: string;
    youtube: string;
    ytVideo: string;
    kick: string;
    tiktok: string;
    proxy: string;
}

function parseParams(): Sources {
    const qs = new URLSearchParams(location.search);
    const size = qs.get("size");
    if (size === "s" || size === "l") document.body.dataset["size"] = size;
    showEmotes = qs.get("emotes") !== "0";
    showBadges = qs.get("badges") !== "0";
    showIcons = qs.get("icons") !== "0";
    if (qs.get("overlay") === "1") document.body.dataset["overlay"] = "1";
    if (qs.get("bg") === "1") document.body.dataset["linebg"] = "1";
    if (qs.get("shadow") === "0") document.body.dataset["shadow"] = "0";
    const fadeSec = Number(qs.get("fade"));
    fadeMs = Number.isFinite(fadeSec) && fadeSec > 0 ? fadeSec * 1000 : 0;
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
        tiktok: clean(qs.get("tiktok"), /^[A-Za-z0-9._]{2,30}$/),
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

function makeSiteBadge(name: SiteBadge): HTMLImageElement {
    return makeBadgeImg(`/static/img/badge-${name}.svg`, name);
}

const SUB_BADGE_NAME_RE = /^[a-z0-9_]{1,24}$/;

function sanitizeSubBadgeName(raw: string | undefined): string {
    if (raw && SUB_BADGE_NAME_RE.test(raw)) return raw;
    return "regular";
}

function makeItzonSubBadge(name: string): HTMLImageElement {
    const img = makeBadgeImg(`/static/img/badge-${name.replace(/_/g, "-")}.svg`, name);
    if (name !== "regular") {
        img.addEventListener("error", () => {
            img.src = "/static/img/badge-regular.svg";
            img.title = "regular";
        }, { once: true });
    }
    return img;
}

function makeBadgeImg(url: string, title: string): HTMLImageElement {
    const img = document.createElement("img");
    img.className = "badge";
    img.src = url;
    img.alt = title;
    img.title = title;
    return img;
}

function makeChip(label: string, color: string, title: string): HTMLSpanElement {
    const chip = document.createElement("span");
    chip.className = "chip";
    chip.textContent = label;
    chip.style.color = color;
    chip.style.borderColor = color;
    chip.title = title;
    return chip;
}

function makeBadgeSvg(path: string, color: string, title: string): HTMLSpanElement {
    const wrap = document.createElement("span");
    wrap.className = "badge-svg";
    wrap.title = title;
    const svg = document.createElementNS(SVG_NS, "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    const p = document.createElementNS(SVG_NS, "path");
    p.setAttribute("d", path);
    p.setAttribute("fill", color);
    svg.appendChild(p);
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
    if (fadeMs > 0) {
        window.setTimeout(() => {
            node.classList.add("fade-out");
            window.setTimeout(() => node.remove(), 400);
        }, fadeMs);
    }
}

interface MessageMeta {
    color?: string;
    amount?: string;
    id?: string;
    login?: string;
    badges?: Node[];
    nickClass?: string;
}

function addChat(platform: Platform, from: string, body: Node, meta: MessageMeta = {}): void {
    const line = document.createElement("div");
    line.className = "msg";
    line.dataset["platform"] = platform;
    if (meta.id) line.dataset["mid"] = meta.id;
    if (meta.login) line.dataset["login"] = meta.login.toLowerCase();
    if (showIcons) line.appendChild(makeIcon(platform));
    if (meta.amount) {
        const amount = document.createElement("span");
        amount.className = "amount";
        amount.textContent = meta.amount;
        line.appendChild(amount);
    }
    if (showBadges && meta.badges?.length) line.append(...meta.badges);
    const who = document.createElement("span");
    who.className = "nick";
    if (meta.nickClass) who.classList.add(meta.nickClass);
    who.textContent = from;
    who.style.color = meta.color || nickColor(from);
    line.append(who, document.createTextNode(": "), body);
    append(line);
}

function addSystem(platform: Platform, text: string): void {
    const line = document.createElement("div");
    line.className = "msg sys";
    if (showIcons) line.appendChild(makeIcon(platform));
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

function addSevenTvEmotes(list: unknown, into: Map<string, string>): void {
    if (!Array.isArray(list)) return;
    for (const value of list) {
        const emote: any = value;
        const name: unknown = emote?.name;
        const host = emote?.data?.host;
        if (typeof name !== "string" || !name || typeof host?.url !== "string") continue;
        const files: { name?: string }[] = Array.isArray(host.files) ? host.files : [];
        const file = files.find((candidate) => candidate.name === "2x.webp")
            ?? files.find((candidate) => candidate.name === "1x.webp");
        if (!file?.name) continue;
        into.set(name, `https:${host.url}/${file.name}`);
    }
}

function addBttvEmotes(list: unknown, into: Map<string, string>): void {
    if (!Array.isArray(list)) return;
    for (const value of list) {
        const emote: any = value;
        if (typeof emote?.code === "string" && typeof emote?.id === "string") {
            into.set(emote.code, `https://cdn.betterttv.net/emote/${emote.id}/2x`);
        }
    }
}

function addFfzEmotes(sets: unknown, into: Map<string, string>): void {
    if (typeof sets !== "object" || sets === null) return;
    for (const set of Object.values(sets as Record<string, any>)) {
        const emoticons = set?.emoticons;
        if (!Array.isArray(emoticons)) continue;
        for (const emote of emoticons) {
            const name: unknown = emote?.name;
            const urls = emote?.urls;
            if (typeof name !== "string" || typeof urls !== "object" || urls === null) continue;
            const url: unknown = urls["2"] ?? urls["1"];
            if (typeof url !== "string") continue;
            into.set(name, url.startsWith("http") ? url : `https:${url}`);
        }
    }
}

async function fetchJSON(url: string): Promise<any> {
    const res = await fetch(url);
    if (!res.ok) throw new Error(String(res.status));
    return res.json();
}

async function loadTwitchThirdPartyEmotes(roomID: string): Promise<void> {
    await Promise.all([
        fetchJSON(`https://7tv.io/v3/users/twitch/${encodeURIComponent(roomID)}`)
            .then((payload) => addSevenTvEmotes(payload?.emote_set?.emotes, twitchEmotes)).catch(() => {}),
        fetchJSON(EMOTE_SET_URL)
            .then((payload) => addSevenTvEmotes(payload?.emotes, twitchEmotes)).catch(() => {}),
        fetchJSON(`https://api.betterttv.net/3/cached/users/twitch/${encodeURIComponent(roomID)}`)
            .then((payload) => {
                addBttvEmotes(payload?.channelEmotes, twitchEmotes);
                addBttvEmotes(payload?.sharedEmotes, twitchEmotes);
            }).catch(() => {}),
        fetchJSON("https://api.betterttv.net/3/cached/emotes/global")
            .then((payload) => addBttvEmotes(payload, twitchEmotes)).catch(() => {}),
        fetchJSON(`https://api.frankerfacez.com/v1/room/id/${encodeURIComponent(roomID)}`)
            .then((payload) => addFfzEmotes(payload?.sets, twitchEmotes)).catch(() => {}),
        fetchJSON("https://api.frankerfacez.com/v1/set/global")
            .then((payload) => addFfzEmotes(payload?.sets, twitchEmotes)).catch(() => {}),
    ]);
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

type ItzonRole = "op" | "staff" | "bot" | "mod";

function startItzon(channelName: string): void {
    const channel = `#${channelName.toLowerCase()}`;
    const roles = new Map<string, ItzonRole>();
    const vips = new Set<string>();
    const subscribers = new Set<string>();
    const subscriberBadges = new Map<string, string>();
    const unverified = new Set<string>();
    const knownMembers = new Set<string>();
    let sock: WebSocket | null = null;
    let nick = "";

    const send = (line: string): void => {
        if (sock && sock.readyState === WebSocket.OPEN) sock.send(line);
    };

    const applyNamesList = (names: string): void => {
        for (const raw of names.split(/\s+/)) {
            if (!raw) continue;
            let i = 0;
            let role: ItzonRole | null = null;
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
    };

    const badgesFor = (from: string): Node[] => {
        const key = from.toLowerCase();
        const out: Node[] = [];
        const role = roles.get(key);
        if (role === "staff") out.push(makeSiteBadge("staff"));
        if (key === channel.slice(1)) out.push(makeSiteBadge("op"));
        if (role === "bot") out.push(makeSiteBadge("bot"));
        if (role === "mod") out.push(makeSiteBadge("mod"));
        if (vips.has(key)) out.push(makeSiteBadge("vip"));
        if (subscribers.has(key)) out.push(makeItzonSubBadge(sanitizeSubBadgeName(subscriberBadges.get(key))));
        if (unverified.has(key)) out.push(makeSiteBadge("unverified"));
        return out;
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
            case "JOIN": {
                const key = line.nick.toLowerCase();
                if (line.nick !== nick && !knownMembers.has(key)) {
                    knownMembers.add(key);
                    send(`NAMES ${channel}`);
                }
                return;
            }
            case "353": {
                const names = line.params[line.params.length - 1] ?? "";
                const chan = line.params[line.params.length - 2] ?? "";
                if (chan.toLowerCase() === channel) applyNamesList(names);
                return;
            }
            case "MODE": {
                if (line.params[0]?.toLowerCase() !== channel) return;
                const modeStr = line.params[1] ?? "";
                const target = (line.params[2] ?? "").toLowerCase();
                if (!target) return;
                if (modeStr === "+v") roles.set(target, "mod");
                else if (modeStr === "-v") roles.delete(target);
                else if (modeStr === "+V") vips.add(target);
                else if (modeStr === "-V") vips.delete(target);
                return;
            }
            case "PRIVMSG": {
                if (line.params[0]?.toLowerCase() !== channel || !line.params[1]) return;
                const subBadge = line.tags.get("sub-badge");
                if (subBadge !== undefined) {
                    const key = line.nick.toLowerCase();
                    subscribers.add(key);
                    subscriberBadges.set(key, sanitizeSubBadgeName(subBadge));
                }
                const meta: MessageMeta = { badges: badgesFor(line.nick) };
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
        roles.clear();
        vips.clear();
        unverified.clear();
        knownMembers.clear();
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

function renderTwitchText(text: string, frag: DocumentFragment): void {
    if (!showEmotes || twitchEmotes.size === 0) {
        frag.appendChild(document.createTextNode(text));
        return;
    }
    let pendingWs = "";
    for (const token of text.split(/(\s+)/)) {
        if (!token) continue;
        if (/^\s+$/.test(token)) {
            pendingWs += token;
            continue;
        }
        if (pendingWs) {
            frag.appendChild(document.createTextNode(pendingWs));
            pendingWs = "";
        }
        const url = twitchEmotes.get(token);
        if (url) frag.appendChild(buildEmoteImg(token, url));
        else frag.appendChild(document.createTextNode(token));
    }
    if (pendingWs) frag.appendChild(document.createTextNode(pendingWs));
}

function renderTwitchBody(text: string, emotesTag: string): DocumentFragment {
    const frag = document.createDocumentFragment();
    const cps = Array.from(text);
    const ranges: { id: string; start: number; end: number }[] = [];
    if (showEmotes && emotesTag) {
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
    }
    ranges.sort((a, b) => a.start - b.start);
    let pos = 0;
    for (const range of ranges) {
        if (range.start < pos) continue;
        if (range.start > pos) renderTwitchText(cps.slice(pos, range.start).join(""), frag);
        const token = cps.slice(range.start, range.end + 1).join("");
        frag.appendChild(buildEmoteImg(token, `https://static-cdn.jtvnw.net/emoticons/v2/${range.id}/default/dark/1.0`));
        pos = range.end + 1;
    }
    if (pos < cps.length) renderTwitchText(cps.slice(pos).join(""), frag);
    return frag;
}

function parseTwitchBadges(badgesTag: string): Node[] {
    const out: Node[] = [];
    for (const entry of badgesTag.split(",")) {
        const slash = entry.indexOf("/");
        const name = slash < 0 ? entry : entry.slice(0, slash);
        const id = TWITCH_BADGE_IDS[name];
        if (id) out.push(makeBadgeImg(`https://static-cdn.jtvnw.net/badges/v1/${id}/2`, name));
    }
    return out;
}

function startTwitch(channelName: string): void {
    const channel = `#${channelName.toLowerCase()}`;
    let sock: WebSocket | null = null;
    let emotesLoaded = false;

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
            case "ROOMSTATE": {
                const roomID = line.tags.get("room-id");
                if (roomID && /^\d+$/.test(roomID) && !emotesLoaded && showEmotes) {
                    emotesLoaded = true;
                    void loadTwitchThirdPartyEmotes(roomID);
                }
                return;
            }
            case "PRIVMSG": {
                if (line.params[0]?.toLowerCase() !== channel || !line.params[1]) return;
                let body = line.params[1];
                if (body.startsWith("\u0001ACTION ") && body.endsWith("\u0001")) body = body.slice(8, -1);
                const meta: MessageMeta = {
                    login: line.nick,
                    badges: parseTwitchBadges(line.tags.get("badges") ?? ""),
                };
                const color = line.tags.get("color");
                if (color && /^#[0-9a-fA-F]{6}$/.test(color)) meta.color = color;
                const msgid = line.tags.get("id");
                if (msgid) meta.id = msgid;
                const display = line.tags.get("display-name") || line.nick;
                addChat("twitch", display, renderTwitchBody(body, line.tags.get("emotes") ?? ""), meta);
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

function parseYoutubeBadges(badges: unknown): { nodes: Node[]; owner: boolean } {
    const nodes: Node[] = [];
    let owner = false;
    if (!Array.isArray(badges)) return { nodes, owner };
    for (const badge of badges) {
        const type: unknown = typeof badge === "string" ? badge : (badge as any)?.type;
        const url: unknown = typeof badge === "object" && badge !== null ? (badge as any).url : undefined;
        switch (type) {
            case "owner":
                owner = true;
                break;
            case "moderator":
                nodes.push(makeBadgeSvg(YT_MOD_PATH, "#5f84f1", "moderator"));
                break;
            case "verified":
                nodes.push(makeBadgeSvg(YT_VERIFIED_PATH, "#aaaaaa", "verified"));
                break;
            case "member":
                if (typeof url === "string" && url) nodes.push(makeBadgeImg(url, "member"));
                else nodes.push(makeChip("MEMBER", "#2ba640", "member"));
                break;
        }
    }
    return { nodes, owner };
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
                const parsed = parseYoutubeBadges(frame.badges);
                const meta: MessageMeta = { badges: parsed.nodes };
                if (parsed.owner) meta.nickClass = "nick-yt-owner";
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

function parseTikTokBadges(badges: unknown): Node[] {
    if (!Array.isArray(badges)) return [];
    const out: Node[] = [];
    for (const badge of badges) {
        const type: unknown = typeof badge === "string" ? badge : (badge as any)?.type;
        if (typeof type !== "string") continue;
        const chip = TIKTOK_BADGE_CHIPS[type];
        if (chip) out.push(makeChip(chip.label, chip.color, type));
    }
    return out;
}

function startTikTok(base: string, user: string): void {
    let sock: WebSocket | null = null;
    let lastState = "";

    const connect = (): void => {
        const s = new WebSocket(`wss://${base}/ws/tiktok?u=${encodeURIComponent(user)}`);
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
                    addSystem("tiktok", `TikTok chat ${frame.state}`);
                }
                lastState = frame.state;
                return;
            }
            if (frame.type === "chat" && typeof frame.author === "string") {
                const meta: MessageMeta = { badges: parseTikTokBadges(frame.badges) };
                if (typeof frame.id === "string") meta.id = frame.id;
                const runs: YtRun[] = Array.isArray(frame.runs) ? frame.runs : [];
                addChat("tiktok", frame.author, renderYoutubeRuns(runs), meta);
                return;
            }
            if (frame.type === "delete" && typeof frame.id === "string") {
                removeMessage("tiktok", frame.id);
            }
        };
        s.onclose = () => {
            if (sock !== s) return;
            sock = null;
            const delay = lastState === "live" || lastState === "connecting" ? RETRY_MS : OFFLINE_RETRY_MS;
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

function parseKickBadges(badges: unknown): Node[] {
    if (!Array.isArray(badges)) return [];
    const out: Node[] = [];
    for (const badge of badges) {
        const type: unknown = (badge as any)?.type;
        if (typeof type !== "string") continue;
        const chip = KICK_BADGE_CHIPS[type];
        if (chip) out.push(makeChip(chip.label, chip.color, type));
    }
    return out;
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
                const meta: MessageMeta = { badges: parseKickBadges(payload?.sender?.identity?.badges) };
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
    code.textContent = "?channel=<itzon user>&twitch=<channel>&youtube=<handle>&kick=<slug>&tiktok=<username>";
    p.appendChild(code);
    const p2 = document.createElement("p");
    p2.append("Optional: ");
    const code2 = document.createElement("code");
    code2.textContent = "ytvideo=<video id>, size=s|l, badges=0, emotes=0, icons=0, overlay=1, bg=1, shadow=0, fade=<seconds>";
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
    if (sources.tiktok) {
        startTikTok(base, sources.tiktok);
        any = true;
    }
    if (!any) showHint();
}

boot();

export {};

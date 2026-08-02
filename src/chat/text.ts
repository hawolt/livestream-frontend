import { myNickLower } from "./context.ts";

export function truncate(s: string, n: number): string {
    return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

export function cssEsc(s: string): string {
    if (typeof CSS !== "undefined" && typeof CSS.escape === "function") return CSS.escape(s);
    return s.replace(/[^A-Za-z0-9_-]/g, "");
}

export function countChar(text: string, ch: string): number {
    let n = 0;
    for (let i = 0; i < text.length; i++) if (text[i] === ch) n++;
    return n;
}

export const LINK_CLOSERS: Record<string, string> = { ")": "(", "]": "[", "}": "{" };
export const LINK_TRAILING_PUNCT = new Set([".", ",", "!", "?", ";", ":", "'", '"']);

export function splitTrailingPunctuation(token: string): { core: string; trail: string } {
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

export const MENTION_RE = /^@([A-Za-z0-9_-]{1,32})$/;

export function mentionsMe(text: string): boolean {
    const me = myNickLower();
    if (!me) return false;
    for (const tok of text.split(/\s+/)) {
        const { core } = splitTrailingPunctuation(tok);
        const m = MENTION_RE.exec(core);
        if (m && m[1]!.toLowerCase() === me) return true;
    }
    return false;
}

export function hashColor(from: string): string {
    let h = 0;
    for (let i = 0; i < from.length; i++) h = (h * 31 + from.charCodeAt(i)) % 360;
    return `hsl(${h}, 65%, 68%)`;
}

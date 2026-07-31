export interface ReplaceRange {
    start: number;
    end: number;
}

export function wrapIndex(index: number, delta: number, length: number): number {
    if (length <= 0) return -1;
    return (((index + delta) % length) + length) % length;
}

export function applyReplacement(value: string, range: ReplaceRange, insertText: string): { value: string; end: number } {
    return {
        value: value.slice(0, range.start) + insertText + value.slice(range.end),
        end: range.start + insertText.length,
    };
}

export const MAX_SUGGESTIONS = 8;
export const MIN_SUGGEST_LEN = 2;
export const USER_ARG_COMMANDS = [".ban", ".unban", ".timeout", ".mod", ".unmod", ".vip", ".unvip", ".whisper", ".w"];

export interface SuggestContext {
    kind: "emote" | "member";
    term: string;
    withAt: boolean;
}

export interface SuggestItem {
    label: string;
    insert: string;
    img?: string;
    color?: string;
}

export function suggestContextFor(word: string, value: string, wordStart: number): SuggestContext | null {
    if (word.startsWith(":")) {
        if (word.length < MIN_SUGGEST_LEN + 1) return null;
        return { kind: "emote", term: word.slice(1), withAt: false };
    }
    if (word.startsWith("@")) {
        if (word.length < 2) return null;
        return { kind: "member", term: word.slice(1), withAt: true };
    }
    const firstSpace = value.indexOf(" ");
    if (firstSpace > 0) {
        const cmd = value.slice(0, firstSpace).toLowerCase();
        if (USER_ARG_COMMANDS.includes(cmd)) {
            const m = value.slice(firstSpace).match(/\S/);
            const argStart = m ? firstSpace + (m.index ?? 0) : -1;
            if (argStart >= 0 && wordStart === argStart && word.length >= 1) {
                return { kind: "member", term: word, withAt: false };
            }
        }
    }
    return null;
}

export function matchEmotes(term: string, names: Iterable<string>): string[] {
    const lower = term.toLowerCase();
    const prefix: string[] = [];
    const substr: string[] = [];
    for (const name of names) {
        const l = name.toLowerCase();
        if (l.startsWith(lower)) prefix.push(name);
        else if (l.includes(lower)) substr.push(name);
    }
    prefix.sort((a, b) => a.localeCompare(b));
    substr.sort((a, b) => a.localeCompare(b));
    return [...prefix, ...substr].slice(0, MAX_SUGGESTIONS);
}

export function matchMembers(term: string, members: Iterable<[string, string]>, me: string): string[] {
    const lower = term.toLowerCase();
    const pre: string[] = [];
    const sub: string[] = [];
    for (const [key, display] of members) {
        if (key === me) continue;
        if (key.startsWith(lower)) pre.push(display);
        else if (lower && key.includes(lower)) sub.push(display);
    }
    pre.sort((a, b) => a.localeCompare(b));
    sub.sort((a, b) => a.localeCompare(b));
    return [...pre, ...sub].slice(0, MAX_SUGGESTIONS);
}

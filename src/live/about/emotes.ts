import type { ChatEmote } from "../../chat-emotes.ts";

export interface AboutEmote {
    name: string;
    url: string;
}

export function sortAboutEmotes(entries: Iterable<[string, ChatEmote]>): AboutEmote[] {
    const out: AboutEmote[] = [];
    for (const [name, emote] of entries) {
        const url = emote?.url ?? "";
        if (!name || !url) continue;
        out.push({ name, url });
    }
    return out.sort((a, b) => a.name.localeCompare(b.name));
}

export function emoteCountLabel(count: number): string {
    return count === 1 ? "1 emote" : `${count} emotes`;
}

export function emoteSignature(list: AboutEmote[]): string {
    return `${list.length}:${list[0]?.name ?? ""}:${list[list.length - 1]?.name ?? ""}`;
}

export function emoteCardTitle(count: number): string {
    return count === 1 ? "1 Emote" : `${count} Emotes`;
}

export function matchesEmoteSearch(name: string, query: string): boolean {
    const needle = query.trim().toLowerCase();
    if (!needle) return true;
    return name.toLowerCase().includes(needle);
}

export function filterEmotes(list: AboutEmote[], query: string): AboutEmote[] {
    const needle = query.trim();
    if (!needle) return list;
    return list.filter((emote) => matchesEmoteSearch(emote.name, needle));
}

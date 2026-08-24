export type ChatEmoteScope = "global" | "channel";

export interface ChatEmote {
    url: string;
    zeroWidth: boolean;
}

const EMOTE_FILE = "2x.webp";
const EMOTE_FILE_FALLBACK = "1x.webp";

function parseEmoteList(list: unknown): Map<string, ChatEmote> {
    const parsed = new Map<string, ChatEmote>();
    if (!Array.isArray(list)) return parsed;
    for (const value of list) {
        const emote: any = value;
        const name: unknown = emote?.name;
        const host = emote?.data?.host;
        if (typeof name !== "string" || !name || typeof host?.url !== "string") continue;
        const files: { name?: string }[] = Array.isArray(host.files) ? host.files : [];
        const file = files.find((candidate) => candidate.name === EMOTE_FILE)
            ?? files.find((candidate) => candidate.name === EMOTE_FILE_FALLBACK);
        if (!file?.name) continue;
        parsed.set(name, {
            url: `https:${host.url}/${file.name}`,
            zeroWidth: ((emote?.flags ?? 0) & 1) !== 0 || ((emote?.data?.flags ?? 0) & 256) !== 0,
        });
    }
    return parsed;
}

export class ChatEmoteCatalog {
    private global = new Map<string, ChatEmote>();
    private channel = new Map<string, ChatEmote>();
    private combined = new Map<string, ChatEmote>();

    replace(scope: ChatEmoteScope, list: unknown): void {
        const parsed = parseEmoteList(list);
        if (scope === "channel") this.channel = parsed;
        else this.global = parsed;
        this.combined = new Map([...this.global, ...this.channel]);
    }

    get(name: string): ChatEmote | undefined {
        return this.combined.get(name);
    }

    names(): IterableIterator<string> {
        return this.combined.keys();
    }

    channelEntries(): IterableIterator<[string, ChatEmote]> {
        return this.channel.entries();
    }

    get size(): number {
        return this.combined.size;
    }
}

import { expect, test } from "bun:test";
import { ChatEmoteCatalog, type ChatEmote } from "../src/chat-emotes.ts";
import { emoteCountLabel, emoteSignature, sortAboutEmotes } from "../src/live/about/emotes.ts";

function emote(name: string, host: string): unknown {
    return {
        name,
        data: { host: { url: `//cdn.example/${host}`, files: [{ name: "2x.webp" }] } },
    };
}

test("lists only the channel scoped emotes of the shared chat catalog", () => {
    const catalog = new ChatEmoteCatalog();
    catalog.replace("global", [emote("GlobalWave", "global")]);
    catalog.replace("channel", [emote("zLast", "last"), emote("aFirst", "first")]);

    expect(sortAboutEmotes(catalog.channelEntries())).toEqual([
        { name: "aFirst", url: "https://cdn.example/first/2x.webp" },
        { name: "zLast", url: "https://cdn.example/last/2x.webp" },
    ]);
});

test("is empty when the channel has no emote set", () => {
    const catalog = new ChatEmoteCatalog();
    catalog.replace("global", [emote("GlobalWave", "global")]);

    expect(sortAboutEmotes(catalog.channelEntries())).toEqual([]);
});

test("drops entries without a name or url", () => {
    const unnamed: [string, ChatEmote][] = [["", { url: "https://cdn.example/x.webp", zeroWidth: false }]];
    const urlless: [string, ChatEmote][] = [["Wave", { url: "", zeroWidth: false }]];
    expect(sortAboutEmotes(unnamed)).toEqual([]);
    expect(sortAboutEmotes(urlless)).toEqual([]);
});

test("labels the emote count", () => {
    expect(emoteCountLabel(0)).toBe("0 emotes");
    expect(emoteCountLabel(1)).toBe("1 emote");
    expect(emoteCountLabel(42)).toBe("42 emotes");
});

test("signature changes when the list changes", () => {
    const first = [{ name: "a", url: "u" }, { name: "b", url: "u" }];
    const second = [{ name: "a", url: "u" }, { name: "c", url: "u" }];
    expect(emoteSignature(first)).toBe(emoteSignature([...first]));
    expect(emoteSignature(first)).not.toBe(emoteSignature(second));
    expect(emoteSignature([])).toBe("0::");
});

import { describe, expect, test } from "bun:test";
import { ChatEmoteCatalog, type ChatEmote } from "../src/chat-emotes.ts";
import { emoteCountLabel, emoteSignature, emoteCardTitle, filterEmotes, sortAboutEmotes } from "../src/live/about/emotes.ts";

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

describe("emoteCardTitle", () => {
    test("puts the count in the title so the card says what it holds", () => {
        expect(emoteCardTitle(235)).toBe("235 Emotes");
        expect(emoteCardTitle(0)).toBe("0 Emotes");
    });

    test("reads naturally at one", () => {
        expect(emoteCardTitle(1)).toBe("1 Emote");
    });
});

describe("filterEmotes", () => {
    const list = [
        { name: "catJAM", url: "a" },
        { name: "PogChamp", url: "b" },
        { name: "monkaS", url: "c" },
    ];

    test("an empty query keeps everything", () => {
        expect(filterEmotes(list, "")).toHaveLength(3);
        expect(filterEmotes(list, "   ")).toHaveLength(3);
    });

    test("matches anywhere in the name and ignores case", () => {
        expect(filterEmotes(list, "jam").map((e) => e.name)).toEqual(["catJAM"]);
        expect(filterEmotes(list, "POG").map((e) => e.name)).toEqual(["PogChamp"]);
        expect(filterEmotes(list, "cha").map((e) => e.name)).toEqual(["PogChamp"]);
    });

    test("a query that matches nothing returns nothing", () => {
        expect(filterEmotes(list, "zzz")).toEqual([]);
    });
});

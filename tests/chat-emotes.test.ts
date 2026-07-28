import { expect, test } from "bun:test";
import { ChatEmoteCatalog } from "../src/chat-emotes.ts";

function emote(name: string, host: string, flags = 0, files = ["1x.webp", "2x.webp"]): unknown {
    return {
        name,
        flags,
        data: {
            host: {
                url: `//cdn.example/${host}`,
                files: files.map((file) => ({ name: file })),
            },
        },
    };
}

test("channel emotes override global emotes regardless of response order", () => {
    const catalog = new ChatEmoteCatalog();
    catalog.replace("channel", [emote("Wave", "channel", 1)]);
    catalog.replace("global", [emote("Wave", "global"), emote("Global", "global-only")]);

    expect(catalog.get("Wave")).toEqual({
        url: "https://cdn.example/channel/2x.webp",
        zeroWidth: true,
    });
    expect(catalog.get("Global")?.url).toBe("https://cdn.example/global-only/2x.webp");
});

test("replacing a channel set removes stale entries and falls back to global", () => {
    const catalog = new ChatEmoteCatalog();
    catalog.replace("global", [emote("Wave", "global")]);
    catalog.replace("channel", [emote("Wave", "channel"), emote("Old", "old")]);
    catalog.replace("channel", []);

    expect(catalog.get("Wave")?.url).toBe("https://cdn.example/global/2x.webp");
    expect(catalog.get("Old")).toBeUndefined();
    expect(Array.from(catalog.names())).toEqual(["Wave"]);
});

test("catalog ignores unusable entries and supports the fallback image", () => {
    const catalog = new ChatEmoteCatalog();
    catalog.replace("global", [
        emote("Fallback", "fallback", 0, ["1x.webp"]),
        emote("Missing", "missing", 0, ["4x.avif"]),
        { name: "", data: { host: { url: "//cdn.example/empty", files: [{ name: "2x.webp" }] } } },
    ]);

    expect(catalog.size).toBe(1);
    expect(catalog.get("Fallback")?.url).toBe("https://cdn.example/fallback/1x.webp");
});

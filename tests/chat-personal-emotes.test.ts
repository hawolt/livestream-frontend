import { describe, expect, test } from "bun:test";

class StubText {
    text: string;
    constructor(text: string) {
        this.text = text;
    }
}

class StubElement {
    tagName: string;
    className = "";
    src = "";
    alt = "";
    title = "";
    loading = "";
    referrerPolicy = "";
    style: Record<string, string> = {};
    onerror: (() => void) | null = null;
    children: (StubElement | StubText)[] = [];

    constructor(tagName: string) {
        this.tagName = tagName;
    }

    appendChild(child: StubElement | StubText): StubElement | StubText {
        if (child instanceof StubElement && child.tagName === "#fragment") {
            this.children.push(...child.children);
            child.children = [];
        } else {
            this.children.push(child);
        }
        return child;
    }

    append(...nodes: (StubElement | StubText)[]): void {
        for (const node of nodes) this.appendChild(node);
    }
}

(globalThis as unknown as { document: unknown }).document = {
    createElement(tagName: string): StubElement {
        return new StubElement(tagName);
    },
    createTextNode(text: string): StubText {
        return new StubText(text);
    },
    createDocumentFragment(): StubElement {
        return new StubElement("#fragment");
    },
};

const { parsePersonalEmoteTag, splicePersonalEmotes, buildPersonalEmoteImg, personalEmoteUrl, resolveOwnPersonalEmoteTag } =
    await import("../src/chat-personal-emotes.ts");

describe("parsePersonalEmoteTag", () => {
    test("undefined or empty tag yields no groups", () => {
        expect(parsePersonalEmoteTag(undefined)).toEqual([]);
        expect(parsePersonalEmoteTag("")).toEqual([]);
    });

    test("parses a single name:id:range group", () => {
        expect(parsePersonalEmoteTag("Foo:42:6-8")).toEqual([
            { name: "Foo", id: "42", ranges: [{ start: 6, end: 8 }] },
        ]);
    });

    test("parses multiple groups separated by /", () => {
        expect(parsePersonalEmoteTag("Foo:1:0-2/Bar:2:8-10")).toEqual([
            { name: "Foo", id: "1", ranges: [{ start: 0, end: 2 }] },
            { name: "Bar", id: "2", ranges: [{ start: 8, end: 10 }] },
        ]);
    });

    test("parses grouped comma-separated ranges for repeated occurrences", () => {
        expect(parsePersonalEmoteTag("Foo:1:0-2,4-6,8-10")).toEqual([
            { name: "Foo", id: "1", ranges: [{ start: 0, end: 2 }, { start: 4, end: 6 }, { start: 8, end: 10 }] },
        ]);
    });

    test("drops malformed groups without throwing", () => {
        expect(parsePersonalEmoteTag("garbage")).toEqual([]);
        expect(parsePersonalEmoteTag("Foo::")).toEqual([]);
        expect(parsePersonalEmoteTag("Foo:1:notarange")).toEqual([]);
    });
});

describe("personalEmoteUrl", () => {
    test("builds the rendition-scoped serving path", () => {
        expect(personalEmoteUrl("42", "2x")).toBe("/api/live/emote/42/2x");
    });
});

describe("splicePersonalEmotes", () => {
    function flatten(frag: unknown): unknown[] {
        return (frag as StubElement).children.map((c) => (c instanceof StubText ? { text: c.text } : { el: c.tagName }));
    }

    test("with no groups renders the whole text as one plain segment", () => {
        const frag = splicePersonalEmotes(
            "hello world",
            [],
            (segment) => new StubText(segment) as unknown as Node,
            () => new StubElement("img") as unknown as Node,
        );
        expect(flatten(frag)).toEqual([{ text: "hello world" }]);
    });

    test("splices an emote node at the given code point range", () => {
        const frag = splicePersonalEmotes(
            "hello Foo world",
            [{ name: "Foo", id: "42", ranges: [{ start: 6, end: 8 }] }],
            (segment) => new StubText(segment) as unknown as Node,
            () => new StubElement("img") as unknown as Node,
        );
        expect(flatten(frag)).toEqual([{ text: "hello " }, { el: "img" }, { text: " world" }]);
    });

    test("ignores an out-of-range span rather than corrupting the message", () => {
        const frag = splicePersonalEmotes(
            "short",
            [{ name: "Foo", id: "1", ranges: [{ start: 100, end: 102 }] }],
            (segment) => new StubText(segment) as unknown as Node,
            () => new StubElement("img") as unknown as Node,
        );
        expect(flatten(frag)).toEqual([{ text: "short" }]);
    });

    test("skips an overlapping later range instead of double-splicing", () => {
        const frag = splicePersonalEmotes(
            "Foo Foo",
            [{
                name: "Foo", id: "1",
                ranges: [{ start: 0, end: 6 }, { start: 4, end: 6 }],
            }],
            (segment) => new StubText(segment) as unknown as Node,
            () => new StubElement("img") as unknown as Node,
        );
        expect(flatten(frag)).toEqual([{ el: "img" }]);
    });
});

describe("resolveOwnPersonalEmoteTag", () => {
    test("empty owned map yields an empty tag", () => {
        expect(resolveOwnPersonalEmoteTag("hello Foo world", new Map())).toBe("");
    });

    test("resolves a single owned name mid message", () => {
        const owned = new Map([["Foo", "42"]]);
        expect(resolveOwnPersonalEmoteTag("hello Foo world", owned)).toBe("Foo:42:6-8");
    });

    test("resolves a name at the start of the message", () => {
        const owned = new Map([["Foo", "1"]]);
        expect(resolveOwnPersonalEmoteTag("Foo hello", owned)).toBe("Foo:1:0-2");
    });

    test("ignores tokens that are not owned", () => {
        const owned = new Map([["Foo", "1"]]);
        expect(resolveOwnPersonalEmoteTag("Bar and Baz only", owned)).toBe("");
    });

    test("is case sensitive", () => {
        const owned = new Map([["Foo", "1"]]);
        expect(resolveOwnPersonalEmoteTag("foo FOO Foo", owned)).toBe("Foo:1:8-10");
    });

    test("groups repeated occurrences under one entry", () => {
        const owned = new Map([["Foo", "1"]]);
        expect(resolveOwnPersonalEmoteTag("Foo Foo Foo", owned)).toBe("Foo:1:0-2,4-6,8-10");
    });

    test("joins multiple distinct names with a slash", () => {
        const owned = new Map([["Foo", "1"], ["Bar", "2"]]);
        expect(resolveOwnPersonalEmoteTag("Foo and Bar", owned)).toBe("Foo:1:0-2/Bar:2:8-10");
    });
});

describe("buildPersonalEmoteImg", () => {
    test("requests the 2x rendition first with the name as alt and title", () => {
        const img = buildPersonalEmoteImg("Foo", "42", "live-chat-emote") as unknown as StubElement;
        expect(img.src).toBe("/api/live/emote/42/2x");
        expect(img.alt).toBe("Foo");
        expect(img.title).toBe("Foo");
        expect(img.className).toBe("live-chat-emote");
    });

    test("falls back through 1x then 4x on load failure, then gives up", () => {
        const img = buildPersonalEmoteImg("Foo", "42", "live-chat-emote") as unknown as StubElement;
        expect(img.src).toBe("/api/live/emote/42/2x");
        img.onerror?.();
        expect(img.src).toBe("/api/live/emote/42/1x");
        img.onerror?.();
        expect(img.src).toBe("/api/live/emote/42/4x");
        img.onerror?.();
        expect(img.src).toBe("/api/live/emote/42/4x");
        expect(img.onerror).toBeNull();
        expect(img.style["display"]).toBe("none");
    });
});

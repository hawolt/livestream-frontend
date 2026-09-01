import { expect, test } from "bun:test";
import { railCardModel } from "../src/rail-card.ts";

const live = {
    username: "steqian",
    title: "oida welcome welcome",
    category: "Just Chatting",
    viewers: 1800,
    offline: false,
};

test("a collapsed rail card carries the name, category, title and viewers", () => {
    const model = railCardModel({ ...live, collapsed: true });
    expect(model).toEqual({
        head: "steqian · Just Chatting",
        title: "oida welcome welcome",
        live: true,
        viewers: 1800,
    });
});

test("a collapsed card drops the separator when the channel has no category", () => {
    expect(railCardModel({ ...live, category: null, collapsed: true })?.head).toBe("steqian");
    expect(railCardModel({ ...live, category: "   ", collapsed: true })?.head).toBe("steqian");
});

test("an expanded rail card is the title alone, since the row already shows the rest", () => {
    expect(railCardModel({ ...live, collapsed: false })).toEqual({
        head: "",
        title: "oida welcome welcome",
        live: false,
        viewers: 0,
    });
});

test("an expanded card is suppressed when there is no title to add", () => {
    expect(railCardModel({ ...live, title: "", collapsed: false })).toBeNull();
    expect(railCardModel({ ...live, title: "   ", collapsed: false })).toBeNull();
});

test("an offline channel shows only its name while collapsed and nothing while expanded", () => {
    expect(railCardModel({ ...live, offline: true, title: "", category: null, collapsed: true })).toEqual({
        head: "steqian",
        title: "",
        live: false,
        viewers: 0,
    });
    expect(railCardModel({ ...live, offline: true, title: "", category: null, collapsed: false })).toBeNull();
});

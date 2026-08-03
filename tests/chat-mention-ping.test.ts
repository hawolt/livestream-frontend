import { expect, test } from "bun:test";
import { shouldPingForMention } from "../src/chat/mention-ping.ts";

function base(overrides: Partial<Parameters<typeof shouldPingForMention>[0]> = {}) {
    return {
        text: "hey @alice check this out",
        from: "bob",
        myUsername: "alice",
        signedIn: true,
        live: true,
        ...overrides,
    };
}

test("pings when another signed-in-relevant user mentions the current username", () => {
    expect(shouldPingForMention(base())).toBe(true);
});

test("is case-insensitive on both the username and the mention", () => {
    expect(shouldPingForMention(base({ text: "hey @ALICE", myUsername: "alice" }))).toBe(true);
    expect(shouldPingForMention(base({ text: "hey @alice", myUsername: "ALICE" }))).toBe(true);
});

test("respects word boundaries, not matching a longer or shorter name", () => {
    expect(shouldPingForMention(base({ text: "hey @alice2" }))).toBe(false);
    expect(shouldPingForMention(base({ text: "hey @ali" }))).toBe(false);
});

test("ignores an @ that appears inside another word rather than as its own token", () => {
    expect(shouldPingForMention(base({ text: "contact me@alice.com" }))).toBe(false);
});

test("still returns a single boolean when the message mentions the user multiple times", () => {
    expect(shouldPingForMention(base({ text: "@alice @alice @alice hi" }))).toBe(true);
});

test("excludes the user's own messages even when they mention themselves", () => {
    expect(shouldPingForMention(base({ from: "alice", text: "note to self @alice" }))).toBe(false);
});

test("excludes the user's own messages that mention someone else", () => {
    expect(shouldPingForMention(base({ from: "alice", myUsername: "alice", text: "hey @bob" }))).toBe(false);
});

test("never pings a guest with no signed-in username", () => {
    expect(shouldPingForMention(base({ signedIn: false }))).toBe(false);
});

test("never pings for messages that are not live, such as a history replay", () => {
    expect(shouldPingForMention(base({ live: false }))).toBe(false);
});

test("does not ping when the text does not mention the username at all", () => {
    expect(shouldPingForMention(base({ text: "hello everyone" }))).toBe(false);
});

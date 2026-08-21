import { expect, test } from "bun:test";
import { parse } from "../src/chat/irc.ts";

test("parses a tagged PRIVMSG with prefix and trailing param", () => {
    const line = parse("@msgid=abc-123;+reply=xyz-9;color=#ff0000;time=2024-01-01T00:00:00Z :alice!user@host PRIVMSG #chan :hello there");
    expect(line).toEqual({
        nick: "alice",
        command: "PRIVMSG",
        params: ["#chan", "hello there"],
        msgid: "abc-123",
        reply: "xyz-9",
        color: "#ff0000",
        time: "2024-01-01T00:00:00Z",
    });
});

test("parses NOTICE without tags or a bang-separated prefix", () => {
    const line = parse(":server.local NOTICE #chan :Chat error");
    expect(line).toEqual({ nick: "server.local", command: "NOTICE", params: ["#chan", "Chat error"] });
});

test("parses a numeric reply with multiple middle params", () => {
    const line = parse(":server.local 353 alice = #chan :alice @bob +carol");
    expect(line).toEqual({
        nick: "server.local",
        command: "353",
        params: ["alice", "=", "#chan", "alice @bob +carol"],
    });
});

test("uppercases the command and defaults to an empty nick with no prefix", () => {
    const line = parse("ping :tmi.twitch.tv");
    expect(line).toEqual({ nick: "", command: "PING", params: ["tmi.twitch.tv"] });
});

test("sets the automod flag only when the tag key is present", () => {
    const flagged = parse("@automod :bot!bot@host PRIVMSG #chan :bad word");
    expect(flagged?.automod).toBe(true);
    const plain = parse(":bot!bot@host PRIVMSG #chan :fine word");
    expect(plain?.automod).toBeUndefined();
});

test("sets the highlight flag only for highlight=1", () => {
    const flagged = parse("@highlight=1 :alice!u@h PRIVMSG #chan :look at me");
    expect(flagged?.highlight).toBe(true);
    const zero = parse("@highlight=0 :alice!u@h PRIVMSG #chan :hi");
    expect(zero?.highlight).toBeUndefined();
    const bare = parse("@highlight :alice!u@h PRIVMSG #chan :hi");
    expect(bare?.highlight).toBeUndefined();
    const absent = parse(":alice!u@h PRIVMSG #chan :hi");
    expect(absent?.highlight).toBeUndefined();
});

test("parses the highlight tag alongside other tags", () => {
    const line = parse("@msgid=m1;highlight=1;color=#00ff00 :alice!u@h PRIVMSG #chan :redeemed line");
    expect(line?.msgid).toBe("m1");
    expect(line?.highlight).toBe(true);
    expect(line?.color).toBe("#00ff00");
});

test("returns null for a tag block with no following space", () => {
    expect(parse("@msgid=abc")).toBeNull();
});

test("returns null for a prefix with no following space", () => {
    expect(parse(":alice!user@host")).toBeNull();
});

test("returns null when there is no command at all", () => {
    expect(parse("")).toBeNull();
    expect(parse(":alice!user@host ")).toBeNull();
});

test("strips the bang identifier from the prefix to get the nick", () => {
    const line = parse(":alice!ident@host.example JOIN #chan");
    expect(line?.nick).toBe("alice");
});

test("keeps the full prefix as nick when there is no bang", () => {
    const line = parse(":onlynick MODE #chan +v alice");
    expect(line?.nick).toBe("onlynick");
    expect(line?.params).toEqual(["#chan", "+v", "alice"]);
});

test("preserves an explicitly empty tag value as an empty string, distinct from an absent tag", () => {
    const line = parse("@color=;automod :alice!u@h PRIVMSG #chan :hi");
    expect(line?.color).toBe("");
    expect(line?.automod).toBe(true);
    const absent = parse(":alice!u@h PRIVMSG #chan :hi");
    expect(absent?.color).toBeUndefined();
});

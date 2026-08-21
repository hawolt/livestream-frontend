import { expect, test } from "bun:test";
import { parse } from "../src/chat-overlay/irc.ts";

test("parses a tagged PRIVMSG and keeps the msgid and color tags", () => {
    const line = parse("@msgid=abc-123;+reply=xyz-9;color=#ff0000 :alice!user@host PRIVMSG #chan :hello there");
    expect(line).toEqual({
        nick: "alice",
        command: "PRIVMSG",
        params: ["#chan", "hello there"],
        msgid: "abc-123",
        color: "#ff0000",
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

test("omits msgid when the tag block has no msgid key", () => {
    const line = parse("@color=#ff0000 :alice!u@h PRIVMSG #chan :hi");
    expect(line?.msgid).toBeUndefined();
});

test("exposes the color tag so the overlay can honour a custom chat colour", () => {
    const line = parse("@msgid=abc;color=#ff8800 :bob!u@h PRIVMSG #chan :hello");
    expect(line?.color).toBe("#ff8800");
    expect(line?.msgid).toBe("abc");
});

test("leaves color undefined when absent and empty when cleared", () => {
    expect(parse("@msgid=x :bob!u@h PRIVMSG #chan :hi")?.color).toBeUndefined();
    expect(parse("@color= :bob!u@h PRIVMSG #chan :hi")?.color).toBe("");
});

test("parses SYSMSG with the channel and trailing text as params", () => {
    const line = parse(":server.local SYSMSG #chan :kestrel redeemed Highlight my message");
    expect(line).toEqual({
        nick: "server.local",
        command: "SYSMSG",
        params: ["#chan", "kestrel redeemed Highlight my message"],
    });
});

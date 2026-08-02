import { expect, test } from "bun:test";
import { sessionResponseIdentity, sessionTokenMetadata } from "../src/session-token.ts";

function token(payload: string): string {
    const encoded = btoa(payload)
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/, "");
    return `${encoded}.signature`;
}

test("reads legacy and versioned session token metadata", () => {
    expect(sessionTokenMetadata(token("user:7:0:alice:verified:100:200"))).toEqual({
        identity: "user:7:0",
        issuedAt: 100,
    });
    expect(sessionTokenMetadata(token("admin:3:9:root:staff:v2:0123456789abcdef0123456789abcdef:300:400"))).toEqual({
        identity: "admin:3:9",
        issuedAt: 300,
    });
});

test("anchors v2 fields from both ends when username contains colons", () => {
    expect(
        sessionTokenMetadata(token("user:7:0:ali:ce:verified:v2:0123456789abcdef0123456789abcdef:100:200")),
    ).toEqual({
        identity: "user:7:0",
        issuedAt: 100,
    });
    expect(
        sessionTokenMetadata(
            token("admin:3:9:ro:o:t:staff:v2:0123456789abcdef0123456789abcdef:300:400"),
        ),
    ).toEqual({
        identity: "admin:3:9",
        issuedAt: 300,
    });
});

test("rejects ambiguous and malformed session token payloads", () => {
    expect(sessionTokenMetadata(token("user:7:0:alice:admin:verified:100:200"))).toBeNull();
    expect(sessionTokenMetadata(token("user:7:0:alice:verified:v2:short:100:200"))).toBeNull();
    expect(
        sessionTokenMetadata(token("user:7:0:alice:verified:v2:0123456789abcdef0123456789abcdef:100")),
    ).toBeNull();
    expect(sessionTokenMetadata("not-a-token")).toBeNull();
});

test("derives session response identities for both account kinds", () => {
    expect(sessionResponseIdentity({ kind: "user", id: 7, tenantId: 12 })).toBe("user:7:0");
    expect(sessionResponseIdentity({ kind: "admin", id: 3, tenantId: 9 })).toBe("admin:3:9");
    expect(sessionResponseIdentity({ kind: "guest", id: 2 })).toBe("");
});

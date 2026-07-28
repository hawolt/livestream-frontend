export interface SessionTokenMetadata {
    identity: string;
    issuedAt: number;
}

export function sessionTokenMetadata(token: string): SessionTokenMetadata | null {
    try {
        const encoded = token.split(".", 1)[0] ?? "";
        const base64 = encoded.replace(/-/g, "+").replace(/_/g, "/");
        const payload = atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, "="));
        const parts = payload.split(":");
        const legacy = parts.length === 7;
        const current = parts.length === 9 && parts[5] === "v2" && /^[0-9a-f]{32}$/.test(parts[6] ?? "");
        if (!legacy && !current) return null;
        const kind = parts[0];
        const principalId = Number(parts[1]);
        const tenantId = Number(parts[2]);
        const issuedAt = Number(parts[legacy ? 5 : 7]);
        if ((kind !== "user" && kind !== "admin") ||
                !Number.isSafeInteger(principalId) ||
                !Number.isSafeInteger(tenantId) ||
                !Number.isSafeInteger(issuedAt)) {
            return null;
        }
        return {
            identity: `${kind}:${principalId}:${kind === "admin" ? tenantId : 0}`,
            issuedAt,
        };
    } catch {
        return null;
    }
}

export function sessionResponseIdentity(data: {
    kind?: string;
    id?: number;
    tenantId?: number;
}): string {
    if ((data.kind !== "user" && data.kind !== "admin") || typeof data.id !== "number") return "";
    return `${data.kind}:${data.id}:${data.kind === "admin" ? data.tenantId ?? "" : 0}`;
}

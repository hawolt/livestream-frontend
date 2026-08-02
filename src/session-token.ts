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
        let issuedAt: number;
        if (legacy) {
            issuedAt = Number(parts[5]);
        } else {
            const n = parts.length;
            if (n < 9) return null;
            const markerIndex = n - 4;
            const nonceIndex = n - 3;
            if (parts[markerIndex] !== "v2" || !/^[0-9a-f]{32}$/.test(parts[nonceIndex] ?? "")) return null;
            issuedAt = Number(parts[n - 2]);
        }
        const kind = parts[0];
        const principalId = Number(parts[1]);
        const tenantId = Number(parts[2]);
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

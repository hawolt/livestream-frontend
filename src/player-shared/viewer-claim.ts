export interface ViewerClaim {
    claim: number;
    lowLatency: boolean;
}

export function parseViewerClaim(token: string | null): ViewerClaim {
    if (!token) return { claim: 0, lowLatency: false };
    const parts = token.split(".");
    if (parts.length !== 4) return { claim: 0, lowLatency: false };
    const raw = parts[2] ?? "";
    if (!/^[0-5]$/.test(raw)) return { claim: 0, lowLatency: false };
    const q = Number(raw);
    return { claim: q - (q % 2), lowLatency: q % 2 === 1 };
}

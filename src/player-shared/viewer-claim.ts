export function tokenCarriesLowLatency(token: string | null): boolean {
    if (!token) return false;
    const parts = token.split(".");
    if (parts.length !== 4) return false;
    const raw = parts[2] ?? "";
    if (!/^[0-5]$/.test(raw)) return false;
    return Number(raw) % 2 === 1;
}

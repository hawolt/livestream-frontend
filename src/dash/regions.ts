import type { RegionOption } from "../api.ts";
import { authFetch } from "./session.ts";

let regionsCache: RegionOption[] | null = null;

export async function loadRegions(): Promise<RegionOption[]> {
    if (regionsCache) return regionsCache;
    try {
        const res = await authFetch<{ regions: RegionOption[] }>("/api/regions");
        regionsCache = Array.isArray(res.regions) ? res.regions : [];
    } catch {
        return [];
    }
    return regionsCache;
}

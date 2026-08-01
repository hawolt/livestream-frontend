import { sessionTokenMetadata } from "./session-token.ts";

export interface AdSpot {
    id: number;
    imageUrl: string;
    targetUrl: string;
    altText: string;
    label: string;
}

export async function loadAds(slot: string): Promise<AdSpot[]> {
    try {
        const token = sessionStorage.getItem("dash_token") ?? "";
        const headers: Record<string, string> = {};
        if (token && sessionTokenMetadata(token)) headers["Authorization"] = `Bearer ${token}`;
        const res = await fetch(`/api/live/ads?slot=${encodeURIComponent(slot)}`, { headers });
        if (!res.ok) return [];
        const data = await res.json() as { ads?: unknown };
        return Array.isArray(data.ads) ? data.ads as AdSpot[] : [];
    } catch {
        return [];
    }
}

export function renderAdSlot(container: HTMLElement, ads: AdSpot[]): void {
    container.replaceChildren();
    const ad = ads[0];
    if (!ad) return;
    const a = document.createElement("a");
    a.className = "ad-slot-link";
    a.href = `/api/live/ads/click/${ad.id}`;
    a.target = "_blank";
    a.rel = "noopener noreferrer nofollow sponsored";
    const img = document.createElement("img");
    img.className = "ad-slot-img";
    img.src = ad.imageUrl;
    img.alt = ad.altText;
    img.loading = "lazy";
    a.appendChild(img);
    const label = document.createElement("span");
    label.className = "promo-flag";
    label.textContent = "Anzeige";
    a.appendChild(label);
    container.appendChild(a);
}

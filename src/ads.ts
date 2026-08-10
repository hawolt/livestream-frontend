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
        const res = await fetch(`/api/live/spots?slot=${encodeURIComponent(slot)}`, { headers });
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
    a.style.cssText = "display:block;position:relative;border:1px solid var(--border);border-radius:var(--radius);overflow:hidden";
    a.href = `/api/live/spots/visit/${ad.id}`;
    a.target = "_blank";
    a.rel = "noopener noreferrer nofollow sponsored";
    const img = document.createElement("img");
    img.style.cssText = "display:block;width:100%;max-height:90px;object-fit:contain;background:rgba(255,255,255,.03)";
    img.src = `/api/live/spots/image/${ad.id}`;
    img.referrerPolicy = "no-referrer";
    img.alt = ad.altText;
    img.loading = "lazy";
    a.appendChild(img);
    const label = document.createElement("span");
    label.style.cssText = "position:absolute;top:8px;left:8px;background:rgba(0,0,0,.65);color:#fff;font-size:11px;font-weight:700;padding:2px 8px;border-radius:999px";
    label.textContent = "Anzeige";
    a.appendChild(label);
    container.appendChild(a);
}

const AD_ROTATE_MS = 45000;

export function startAdRotation(container: HTMLElement, slot: string, skip?: () => boolean): () => void {
    let stopped = false;
    let lastAt = 0;

    async function cycle(): Promise<void> {
        if (stopped || document.visibilityState === "hidden") return;
        if (skip?.()) return;
        const ads = await loadAds(slot);
        if (stopped || !container.isConnected) return;
        renderAdSlot(container, ads);
        container.classList.toggle("feature-filled", ads.length > 0);
        lastAt = Date.now();
    }

    function onVisibility(): void {
        if (document.visibilityState !== "visible") return;
        if (Date.now() - lastAt >= AD_ROTATE_MS) void cycle();
    }

    void cycle();
    const timer = window.setInterval(() => void cycle(), AD_ROTATE_MS);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
        stopped = true;
        window.clearInterval(timer);
        document.removeEventListener("visibilitychange", onVisibility);
    };
}

import { sessionTokenMetadata } from "./session-token.ts";

export interface AdSpot {
    id: number;
    imageUrl: string;
    targetUrl: string;
    altText: string;
    label: string;
    advertiserName?: string;
    token?: string;
}

export interface AdImpression {
    stop(): void;
    reportFastClick(): void;
}

export interface AdRotationOptions {
    channel?: string;
    skip?: () => boolean;
}

const AD_LABELS: Record<string, string> = {
    DE: "Anzeige", AT: "Anzeige", CH: "Anzeige", LI: "Anzeige",
    FR: "Publicité", MC: "Publicité",
    IT: "Pubblicità",
    ES: "Publicidad", MX: "Publicidad", AR: "Publicidad", CO: "Publicidad", CL: "Publicidad", PE: "Publicidad",
    PT: "Publicidade", BR: "Publicidade",
    NL: "Advertentie",
    PL: "Reklama",
    TR: "Reklam",
};

export const IMPRESSION_API = "/api/live/spots/impression";
export const VIEWABLE_RATIO = 0.5;
export const VIEWABLE_MS = 1000;

const AD_CHANNEL = /^[A-Za-z0-9_]{1,32}$/;

let adCountry = "";

export function adLabelFor(country: string, fallback: string): string {
    const cc = country.trim().toUpperCase();
    if (!cc) return fallback;
    return AD_LABELS[cc] ?? "Ad";
}

export function currentAdLabel(fallback: string): string {
    return adLabelFor(adCountry, fallback);
}

export function advertiserLine(advertiserName: unknown): string {
    const name = typeof advertiserName === "string" ? advertiserName.trim() : "";
    return name ? `Paid for by ${name}` : "";
}

export function adVisitUrl(spotId: number, channel: string): string {
    return AD_CHANNEL.test(channel)
        ? `/api/live/spots/visit/${spotId}?channel=${encodeURIComponent(channel)}`
        : `/api/live/spots/visit/${spotId}`;
}

export function impressionBody(spotId: number, channel: string, token = ""): string {
    const body: Record<string, unknown> = { spot: spotId, viewable: true };
    if (AD_CHANNEL.test(channel)) body.channel = channel;
    if (token) body.token = token;
    return JSON.stringify(body);
}

export function adViewable(ratio: number, visibilityState: string): boolean {
    return ratio >= VIEWABLE_RATIO && visibilityState === "visible";
}

function postImpression(spotId: number, channel: string, token: string): Promise<void> {
    try {
        return fetch(IMPRESSION_API, {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: impressionBody(spotId, channel, token),
        }).then(() => undefined, () => undefined);
    } catch {
        return Promise.resolve();
    }
}

export function trackAdImpression(el: Element, spotId: number, channel: string, token = ""): AdImpression {
    let observer: IntersectionObserver | null = null;
    let timer: number | null = null;
    let ratio = 0;
    let reported = false;

    function clearTimer(): void {
        if (timer === null) return;
        window.clearTimeout(timer);
        timer = null;
    }

    function stop(): void {
        clearTimer();
        if (!observer) return;
        observer.disconnect();
        observer = null;
        document.removeEventListener("visibilitychange", sync);
    }

    function report(): Promise<void> {
        if (reported) return Promise.resolve();
        reported = true;
        stop();
        return postImpression(spotId, channel, token);
    }

    function sync(): void {
        if (reported) return;
        if (!adViewable(ratio, document.visibilityState)) {
            clearTimer();
            return;
        }
        if (timer === null) timer = window.setTimeout(() => void report(), VIEWABLE_MS);
    }

    function reportFastClick(): void {
        void report()
            .then(() => fetch(adVisitUrl(spotId, channel), { redirect: "manual", keepalive: true }))
            .then(() => undefined, () => undefined);
    }

    if (typeof IntersectionObserver === "function") {
        observer = new IntersectionObserver((entries) => {
            const entry = entries[entries.length - 1];
            if (!entry) return;
            ratio = entry.isIntersecting ? entry.intersectionRatio : 0;
            sync();
        }, { threshold: [0, VIEWABLE_RATIO, 1] });
        observer.observe(el);
        document.addEventListener("visibilitychange", sync);
    }
    return { stop, reportFastClick };
}

export async function loadAds(slot: string): Promise<AdSpot[]> {
    try {
        const token = sessionStorage.getItem("dash_token") ?? "";
        const headers: Record<string, string> = {};
        if (token && sessionTokenMetadata(token)) headers["Authorization"] = `Bearer ${token}`;
        const res = await fetch(`/api/live/spots?slot=${encodeURIComponent(slot)}`, { headers });
        if (!res.ok) return [];
        const data = await res.json() as { ads?: unknown; country?: unknown };
        if (typeof data.country === "string") adCountry = data.country;
        return Array.isArray(data.ads) ? data.ads as AdSpot[] : [];
    } catch {
        return [];
    }
}

const slotImpressions = new WeakMap<HTMLElement, AdImpression>();

export function renderAdSlot(container: HTMLElement, ads: AdSpot[], channel = ""): void {
    slotImpressions.get(container)?.stop();
    slotImpressions.delete(container);
    container.replaceChildren();
    const ad = ads[0];
    if (!ad) return;
    const a = document.createElement("a");
    a.style.cssText = "display:block;position:relative;border:1px solid var(--border);border-radius:var(--radius);overflow:hidden";
    a.href = adVisitUrl(ad.id, channel);
    a.target = "_blank";
    a.rel = "noopener nofollow sponsored";
    const img = document.createElement("img");
    img.style.cssText = "display:block;width:100%;max-height:90px;object-fit:contain;background:rgba(255,255,255,.03)";
    img.src = `/api/live/spots/image/${ad.id}`;
    img.referrerPolicy = "no-referrer";
    img.alt = ad.altText;
    img.loading = "lazy";
    a.appendChild(img);
    const label = document.createElement("span");
    label.style.cssText = "position:absolute;top:8px;left:8px;background:rgba(0,0,0,.65);color:#fff;font-size:11px;font-weight:700;padding:2px 8px;border-radius:999px";
    label.textContent = currentAdLabel("Anzeige");
    a.appendChild(label);
    const byline = advertiserLine(ad.advertiserName);
    if (byline) {
        const advertiser = document.createElement("span");
        advertiser.style.cssText = "position:absolute;bottom:8px;left:8px;max-width:calc(100% - 16px);background:rgba(0,0,0,.65);color:#fff;font-size:10px;padding:2px 8px;border-radius:999px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis";
        advertiser.textContent = byline;
        a.appendChild(advertiser);
    }
    container.appendChild(a);
    slotImpressions.set(container, trackAdImpression(a, ad.id, channel, ad.token ?? ""));
}

const AD_ROTATE_MS = 45000;

export function startAdRotation(container: HTMLElement, slot: string, options: AdRotationOptions = {}): () => void {
    const channel = options.channel ?? "";
    let stopped = false;
    let lastAt = 0;

    async function cycle(): Promise<void> {
        if (stopped || document.visibilityState === "hidden") return;
        if (options.skip?.()) return;
        const ads = await loadAds(slot);
        if (stopped || !container.isConnected) return;
        renderAdSlot(container, ads, channel);
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
        slotImpressions.get(container)?.stop();
        slotImpressions.delete(container);
    };
}

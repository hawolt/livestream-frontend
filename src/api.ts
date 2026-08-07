import type { StreamLanguageCode } from "./stream-languages.ts";

export interface AccountSettings {
    chatBotToken?: string | null;
    overlayToken?: string | null;
    email: string | null;
    emailVerified: boolean;
    tenantName?: string | null;
    chatColor?: string | null;
    chatColorAllowed?: boolean;
    username?: string | null;
    usernameChangedAt?: number | null;
    usernameCooldownRemaining?: number;
    liveNotify?: boolean;
}

export interface ApiTokenInfo {
    id: number;
    label: string;
    prefix: string;
    scope: string;
    createdAt: number;
    lastUsedAt: number | null;
}

export interface OAuthGrantInfo {
    clientId: string;
    app: string;
    scope: string;
    grantedAt: number | null;
    lastUsedAt: number | null;
}

export interface ApiTokenCreated {
    id: number;
    token: string;
    label: string;
    prefix: string;
    scope: string;
    createdAt: number;
}

export interface BillingTier {
    key: string;
    label: string;
    price: string;
    rank: number;
    perks: BillingPerks;
    passPrice?: string;
    passAvailable?: boolean;
}

export interface BillingPerks {
    badge: boolean;
    chatColor: boolean;
    adsOff: boolean;
    largeUploads: boolean;
    animatedAvatar: boolean;
    order?: string[];
}

export interface BillingCurrent {
    tier: string;
    status: string;
    provider?: string;
    currentPeriodEnd: number | null;
    perks: BillingPerks;
    source?: string;
}

export interface BillingTiers {
    enabled: boolean;
    tiers: BillingTier[];
    current: BillingCurrent | null;
    portalProviders?: string[];
    feeNote?: string;
    restreamDestinationCap?: number;
    currency?: string;
    priceInterval?: string;
    featuredTier?: string;
    passDays?: number;
}

export interface RegionOption {
    id: string;
    label: string;
}

export interface LiveInfo {
    ingestServer: string;
    region?: string;
    regionLabel?: string;
    mediaBase?: string;
    streamKey: string;
    keyHash: string;
    playbackKey: string;
    username: string;
    usernameOk: boolean;
    channelBase: string;
    title: string;
    category: string | null;
    categoryId: number | null;
    language: StreamLanguageCode;
    webhookStartUrl: string;
    webhookEndUrl: string;
    webhookSecret: string;
    discordWebhookUrl: string;
    emoteTwitch: string;
    hasThumbnail: boolean;
    thumbnailVersion: number | null;
    passwordProtected: boolean;
    thumbnailAllowed?: boolean;
    privateAllowed?: boolean;
    maxImageBytes?: number;
}

export interface LiveChannelInfo {
    username: string;
    title: string;
    category: string | null;
    categoryId: number | null;
    language: StreamLanguageCode;
    mediaBase: string;
    wssBase?: string;
    emoteTwitchId: string | null;
    passwordRequired?: boolean;
    locked?: boolean;
}

export interface LiveCategory {
    id: number;
    name: string;
}

export interface LiveBan {
    id: number;
    label: string;
    bannedBy: string;
    bannedByRank: number;
    expiresAt: number | null;
    createdAt: number;
}

export interface LiveMod {
    id: number;
    username: string;
    createdAt: number;
}

export interface Clip {
    id: string;
    channel: string;
    creator: string;
    title: string;
    status: string;
    url: string | null;
    thumbnailUrl: string | null;
    durationMs: number | null;
    createdAt: string | null;
}

export const API_BASE = "/api/main/v1";

export function buildRequestHeaders(headers?: HeadersInit): HeadersInit {
    return { "Content-Type": "application/json", ...headers };
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
    const url = path.replace(/^\/api\//, `${API_BASE}/`);
    const res = await fetch(url, {
        ...init,
        headers: buildRequestHeaders(init?.headers),
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText })) as { error?: string };
        const error = new Error(err.error ?? res.statusText) as Error & { status: number };
        error.status = res.status;
        throw error;
    }
    if (res.status === 204 || res.headers.get("content-length") === "0") return undefined as unknown as T;
    return res.json() as Promise<T>;
}

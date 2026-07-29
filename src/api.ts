import type { StreamLanguageCode } from "./stream-languages.ts";

export interface AccountSettings {
    chatBotToken?: string | null;
    overlayToken?: string | null;
    email: string | null;
    emailVerified: boolean;
    tenantName?: string | null;
    chatColor?: string | null;
    username?: string | null;
    usernameChangedAt?: number | null;
    usernameCooldownRemaining?: number;
    liveNotify?: boolean;
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
}

export interface LiveChannelInfo {
    title: string;
    category: string | null;
    categoryId: number | null;
    language: StreamLanguageCode;
    mediaBase: string;
    emoteTwitchId: string | null;
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

export const API_BASE = "/api/main/v1";

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
    const url = path.replace(/^\/api\//, `${API_BASE}/`);
    const res = await fetch(url, {
        headers: { "Content-Type": "application/json", ...init?.headers },
        ...init,
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

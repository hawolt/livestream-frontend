export interface ClipPin {
    pin: string;
    nowMs: number;
    windowMs: number;
}

export type PinResult = { ok: true; data: ClipPin } | { ok: false; status: number };

function authHeaders(token: string): HeadersInit {
    return { "Authorization": `Bearer ${token}` };
}

export async function requestClipPin(channel: string, token: string): Promise<PinResult> {
    try {
        const res = await fetch(`/api/main/v1/clips/pin?channel=${encodeURIComponent(channel)}`, {
            method: "POST",
            headers: authHeaders(token),
        });
        if (!res.ok) return { ok: false, status: res.status };
        const data = await res.json() as Partial<ClipPin>;
        if (typeof data.pin !== "string" || !data.pin || typeof data.nowMs !== "number" || typeof data.windowMs !== "number") {
            return { ok: false, status: 0 };
        }
        return { ok: true, data: { pin: data.pin, nowMs: data.nowMs, windowMs: data.windowMs } };
    } catch {
        return { ok: false, status: 0 };
    }
}

export async function renewClipPin(channel: string, pin: string, token: string): Promise<boolean> {
    try {
        const res = await fetch(`/api/main/v1/clips/pin/renew?channel=${encodeURIComponent(channel)}&pin=${encodeURIComponent(pin)}`, {
            method: "POST",
            headers: authHeaders(token),
        });
        return res.ok;
    } catch {
        return false;
    }
}

export function releaseClipPin(channel: string, pin: string, token: string): void {
    fetch(`/api/main/v1/clips/pin?channel=${encodeURIComponent(channel)}&pin=${encodeURIComponent(pin)}`, {
        method: "DELETE",
        headers: authHeaders(token),
        keepalive: true,
    }).catch(() => {});
}

export interface CreateClipResult {
    ok: boolean;
    status: number;
    id: string | null;
    error: string | null;
}

export async function createClip(
    channel: string,
    title: string,
    pin: string,
    startBehindMs: number,
    endBehindMs: number,
    token: string,
): Promise<CreateClipResult> {
    const params = new URLSearchParams({
        channel,
        title,
        pin,
        startBehindMs: String(startBehindMs),
        endBehindMs: String(endBehindMs),
    });
    try {
        const res = await fetch(`/api/main/v1/clips?${params.toString()}`, {
            method: "POST",
            headers: authHeaders(token),
        });
        let id: string | null = null;
        let error: string | null = null;
        try {
            const data = await res.json() as { id?: string; error?: string };
            if (typeof data.id === "string" && data.id) id = data.id;
            if (typeof data.error === "string" && data.error) error = data.error;
        } catch {}
        return { ok: res.ok, status: res.status, id, error };
    } catch {
        return { ok: false, status: 0, id: null, error: null };
    }
}

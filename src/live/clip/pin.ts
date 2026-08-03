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

let configLoaded = false;
let configPromise: Promise<void> | null = null;
let enabled = false;
let cached: { token: string; exp: number } | null = null;
let inflight: Promise<string> | null = null;

async function fetchConfig(): Promise<void> {
    const r = await fetch("/api/live/captcha/config");
    if (!r.ok) throw new Error(`captcha config: ${r.status}`);
    const c = await r.json();
    enabled = !!c?.enabled;
    configLoaded = true;
}

async function loadConfig(): Promise<void> {
    if (configLoaded) return;
    if (!configPromise) {
        configPromise = fetchConfig().finally(() => {
            configPromise = null;
        });
    }
    try {
        await configPromise;
    } catch {}
}

async function mint(): Promise<string> {
    try {
        const r = await fetch("/api/live/captcha/token", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: "{}",
        });
        if (!r.ok) return "";
        const j = await r.json();
        if (typeof j?.token !== "string" || !j.token) return "";
        cached = { token: j.token, exp: Date.now() / 1000 + (typeof j.ttl === "number" ? j.ttl : 1800) };
        return j.token;
    } catch {
        return "";
    }
}

export async function getCaptchaToken(): Promise<string> {
    await loadConfig();
    if (!enabled) return "";
    if (cached && cached.exp - 60 > Date.now() / 1000) return cached.token;
    if (!inflight) inflight = mint().finally(() => { inflight = null; });
    return inflight;
}

export async function captchaQuery(): Promise<string> {
    const t = await getCaptchaToken();
    return t ? `&t=${encodeURIComponent(t)}` : "";
}

export function captchaRequired(): boolean {
    return configLoaded && enabled;
}

export async function freshCaptchaQuery(): Promise<string> {
    await loadConfig();
    if (!enabled) return "";
    const t = await mint();
    return t ? `&t=${encodeURIComponent(t)}` : "";
}

export function warmCaptcha(): void {
    void getCaptchaToken();
}

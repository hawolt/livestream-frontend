const TURNSTILE_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

let configLoaded = false;
let configPromise: Promise<void> | null = null;
let enabled = false;
let challenge = false;
let sitekey = "";
let scriptLoaded = false;
let cached: { token: string; exp: number } | null = null;
let inflight: Promise<string> | null = null;
let anchorEl: HTMLElement | null = null;

export function setCaptchaAnchor(el: HTMLElement | null): void {
    anchorEl = el;
}

export function captchaChallengeActive(): boolean {
    return configLoaded && enabled && challenge;
}

async function fetchConfig(): Promise<void> {
    const r = await fetch("/api/live/captcha/config");
    if (!r.ok) throw new Error(`captcha config: ${r.status}`);
    const c = await r.json();
    enabled = !!c?.enabled;
    challenge = !!c?.challenge;
    sitekey = typeof c?.sitekey === "string" ? c.sitekey : "";
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

function loadScript(): Promise<void> {
    if (scriptLoaded && (window as any).turnstile) return Promise.resolve();
    return new Promise((resolve, reject) => {
        const s = document.createElement("script");
        s.src = TURNSTILE_SRC;
        s.async = true;
        s.defer = true;
        s.referrerPolicy = "no-referrer";
        s.onload = () => { scriptLoaded = true; resolve(); };
        s.onerror = () => reject(new Error("turnstile load failed"));
        document.head.appendChild(s);
    });
}

function markVisibleWhenExpanded(container: HTMLElement): void {
    if (typeof ResizeObserver !== "function") return;
    const ro = new ResizeObserver(() => {
        if (container.offsetHeight < 20) return;
        ro.disconnect();
        container.classList.add("captcha-slot-visible");
        container.style.background = "var(--surface, #141414)";
        container.style.border = "1px solid var(--border, #2e2e2e)";
        container.style.borderRadius = "var(--radius, 6px)";
        container.style.boxShadow = "var(--shadow, 0 1px 4px rgba(0,0,0,.5))";
        container.style.padding = "10px";
        container.style.margin = "8px 8px 0";
    });
    ro.observe(container);
}

function makeContainer(): HTMLElement {
    const container = document.createElement("div");
    container.className = "captcha-slot";
    if (anchorEl && anchorEl.isConnected && anchorEl.offsetWidth > 0) {
        container.style.cssText =
            "flex:0 0 auto;display:flex;justify-content:center;max-width:100%;overflow:hidden";
        anchorEl.prepend(container);
    } else {
        container.style.cssText =
            "position:fixed;z-index:2147483647;right:16px;top:calc(16px + env(safe-area-inset-top,0px));max-width:calc(100vw - 32px)";
        document.body.appendChild(container);
    }
    markVisibleWhenExpanded(container);
    return container;
}

function solve(): Promise<string> {
    return new Promise((resolve, reject) => {
        const ts = (window as any).turnstile;
        if (!ts) { reject(new Error("turnstile unavailable")); return; }
        const container = makeContainer();
        let done = false;
        let widgetId: string | undefined;
        const finish = (fn: () => void) => {
            if (done) return;
            done = true;
            try { if (widgetId) ts.remove(widgetId); } catch {}
            container.remove();
            fn();
        };
        try {
            widgetId = ts.render(container, {
                sitekey,
                theme: "dark",
                appearance: "interaction-only",
                callback: (token: string) => finish(() => resolve(token)),
                "error-callback": () => finish(() => reject(new Error("turnstile error"))),
                "timeout-callback": () => finish(() => reject(new Error("turnstile timeout"))),
            });
        } catch (e) {
            finish(() => reject(e instanceof Error ? e : new Error(String(e))));
            return;
        }
        window.setTimeout(() => finish(() => reject(new Error("turnstile timeout"))), 20000);
    });
}

async function mint(): Promise<string> {
    try {
        let body: string;
        if (challenge) {
            await loadScript();
            const provToken = await solve();
            body = JSON.stringify({ token: provToken });
        } else {
            body = "{}";
        }
        const r = await fetch("/api/live/captcha/token", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body,
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
    if (challenge && !sitekey) return "";
    if (cached && cached.exp - 60 > Date.now() / 1000) return cached.token;
    if (!inflight) inflight = mint().finally(() => { inflight = null; });
    return inflight;
}

export async function captchaQuery(): Promise<string> {
    const t = await getCaptchaToken();
    return t ? `&t=${encodeURIComponent(t)}` : "";
}

export function warmCaptcha(): void {
    void getCaptchaToken();
}

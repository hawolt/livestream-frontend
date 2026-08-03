export function parseChatWssBase(data: unknown): string {
    const c = data as { chatWss?: unknown } | null | undefined;
    return c && typeof c.chatWss === "string" ? c.chatWss : "";
}

let loaded = false;
let loadPromise: Promise<void> | null = null;
let chatWssBase = "";

async function fetchConfig(): Promise<void> {
    const r = await fetch("/api/live/ws-config");
    if (!r.ok) throw new Error(`ws-config: ${r.status}`);
    const c = await r.json();
    chatWssBase = parseChatWssBase(c);
    loaded = true;
}

async function loadConfig(): Promise<void> {
    if (loaded) return;
    if (!loadPromise) {
        loadPromise = fetchConfig().finally(() => {
            loadPromise = null;
        });
    }
    try {
        await loadPromise;
    } catch {}
}

export async function getChatWssBase(): Promise<string> {
    await loadConfig();
    return chatWssBase;
}

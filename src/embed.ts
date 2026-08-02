import { ctx, previewMode } from "./embed/context.ts";
import { beginTransport, enterTerminal, setPoster, wirePageLifecycle, wireUnmute } from "./embed/lifecycle.ts";
import { canUseNativeHLS } from "./embed/transport.ts";

let bootGeneration = 0;
let bootRequest: AbortController | null = null;
let shellWired = false;
let bootCompleted = false;

function isCurrentBoot(generation: number, request: AbortController): boolean {
    return generation === bootGeneration && bootRequest === request && !request.signal.aborted;
}

window.addEventListener("pagehide", () => {
    bootGeneration += 1;
    bootRequest?.abort();
    bootRequest = null;
});

window.addEventListener("pageshow", (event) => {
    if ((event as PageTransitionEvent).persisted && !bootCompleted && !ctx.terminal) void boot();
});

async function boot(): Promise<void> {
    const generation = ++bootGeneration;
    bootCompleted = false;
    if (previewMode) document.body.classList.add("embed-preview");
    if (!shellWired) {
        shellWired = true;
        wireUnmute();
        wirePageLifecycle();
    }

    const seg = location.pathname.split("/").filter(Boolean)[1] ?? "";
    ctx.username = seg.toLowerCase();
    if (!/^[a-z0-9_-]{3,32}$/.test(ctx.username)) {
        bootCompleted = true;
        enterTerminal("Invalid channel");
        return;
    }

    const request = new AbortController();
    bootRequest?.abort();
    bootRequest = request;
    try {
        const res = await fetch(`/api/live/channel/${encodeURIComponent(ctx.username)}`, { signal: request.signal });
        if (!isCurrentBoot(generation, request)) return;
        if (res.status === 404) {
            bootCompleted = true;
            enterTerminal("Channel not found");
            return;
        }
        if (res.ok) {
            const info: any = await res.json();
            if (!isCurrentBoot(generation, request)) return;
            if (info && typeof info.mediaBase === "string") {
                ctx.mediaBase = info.mediaBase.replace(/\/+$/, "");
            }
        }
    } catch {
        if (!isCurrentBoot(generation, request)) return;
    } finally {
        if (bootRequest === request) bootRequest = null;
    }
    if (generation !== bootGeneration) return;

    if (typeof MediaSource === "function" && typeof MediaSource.isTypeSupported === "function") {
        ctx.transportKind = "ws";
    } else if (canUseNativeHLS()) {
        ctx.transportKind = "hls";
    } else {
        bootCompleted = true;
        enterTerminal("Playback not supported");
        return;
    }

    setPoster("Offline");
    beginTransport();
    bootCompleted = true;
}

void boot();

export {};

import { cleanfeedMode, controlsMode, ctx, previewMode } from "./embed/context.ts";
import { beginTransport, enterTerminal, setPoster, wirePageLifecycle, wireUnmute } from "./embed/lifecycle.ts";
import { canUseHlsJs, canUseNativeHLS, mseSupported } from "./embed/transport.ts";
import { video } from "./embed/dom.ts";
import { getCaptchaToken } from "./captcha.ts";
import { parseViewerClaim } from "./player-shared/viewer-claim.ts";
import { chooseTransport } from "./player-shared/transport-choice.ts";
import { readLocalStorage } from "./storage.ts";
import { TRANSPORT_STORAGE_KEY } from "./embed/constants.ts";

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
    if (controlsMode) {
        document.body.classList.add("embed-controls");
        video.setAttribute("controls", "");
    } else {
        video.removeAttribute("controls");
    }
    if (cleanfeedMode) document.body.classList.add("embed-cleanfeed");
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
            if (info && info.locked === true) {
                bootCompleted = true;
                enterTerminal("Private stream");
                return;
            }
            if (info && typeof info.mediaBase === "string") {
                ctx.mediaBase = info.mediaBase.replace(/\/+$/, "");
            }
            if (info) ctx.wssBase = typeof info.wssBase === "string" ? info.wssBase.replace(/\/+$/, "") : "";
        }
    } catch {
        if (!isCurrentBoot(generation, request)) return;
    } finally {
        if (bootRequest === request) bootRequest = null;
    }
    if (generation !== bootGeneration) return;

    const captchaToken = await getCaptchaToken();
    if (generation !== bootGeneration) return;
    const { lowLatency } = parseViewerClaim(captchaToken || null);
    const transport = chooseTransport({
        mseSupported: mseSupported(),
        nativeHls: canUseNativeHLS(),
        hlsJsSupported: canUseHlsJs(),
        lowLatency,
        llDenied: ctx.llDenied,
        override: readLocalStorage(TRANSPORT_STORAGE_KEY),
    });
    if (transport === "unsupported") {
        bootCompleted = true;
        enterTerminal("Playback not supported");
        return;
    }
    ctx.transportKind = transport;

    setPoster("Offline");
    beginTransport();
    bootCompleted = true;
}

void boot();

export {};

import { ctx, previewMode } from "./embed/context.ts";
import { beginTransport, enterTerminal, setPoster, wirePageLifecycle, wireUnmute } from "./embed/lifecycle.ts";
import { canUseNativeHLS } from "./embed/transport.ts";

async function boot(): Promise<void> {
    if (previewMode) document.body.classList.add("embed-preview");
    wireUnmute();
    wirePageLifecycle();

    const seg = location.pathname.split("/").filter(Boolean)[1] ?? "";
    ctx.username = seg.toLowerCase();
    if (!/^[a-z0-9_-]{3,32}$/.test(ctx.username)) {
        enterTerminal("Invalid channel");
        return;
    }

    try {
        const res = await fetch(`/api/live/channel/${encodeURIComponent(ctx.username)}`);
        if (res.status === 404) {
            enterTerminal("Channel not found");
            return;
        }
        if (res.ok) {
            const info: any = await res.json();
            if (info && typeof info.mediaBase === "string") {
                ctx.mediaBase = info.mediaBase.replace(/\/+$/, "");
            }
        }
    } catch {}

    if (typeof MediaSource === "function" && typeof MediaSource.isTypeSupported === "function") {
        ctx.transportKind = "ws";
    } else if (canUseNativeHLS()) {
        ctx.transportKind = "hls";
    } else {
        enterTerminal("Playback not supported");
        return;
    }

    setPoster("Offline");
    beginTransport();
}

void boot();

export {};

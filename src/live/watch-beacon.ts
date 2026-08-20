import { ctx } from "./player/context.ts";
import { watchBeaconActive } from "./watch-beacon-decision.ts";

const BEACON_URL = "/api/live/watch/beacon";
const BEACON_INTERVAL_MS = 60000;

let currentVideo: HTMLVideoElement | null = null;
let timer: number | null = null;

function isActive(): boolean {
    return !!currentVideo && watchBeaconActive(currentVideo.paused, currentVideo.ended, document.visibilityState);
}

function sendBeacon(): void {
    try {
        void fetch(BEACON_URL, {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ channel: ctx.username }),
        }).catch(() => {});
    } catch {}
}

function sync(): void {
    if (isActive()) {
        if (timer === null) timer = window.setInterval(sendBeacon, BEACON_INTERVAL_MS);
    } else if (timer !== null) {
        window.clearInterval(timer);
        timer = null;
    }
}

document.addEventListener("visibilitychange", sync);

export function wireWatchBeacon(el: HTMLVideoElement): void {
    currentVideo = el;
    el.addEventListener("play", sync);
    el.addEventListener("pause", sync);
    el.addEventListener("ended", sync);
    sync();
}

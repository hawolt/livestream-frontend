import { watchBeaconActive, watchBeaconBody, watchBeaconStartsRun, type WatchSurface } from "./watch-beacon-decision.ts";

const BEACON_URL = "/api/live/watch/beacon";
const BEACON_INTERVAL_MS = 60000;

let currentVideo: HTMLVideoElement | null = null;
let currentSurface: WatchSurface = "channel";
let currentChannel: () => string = () => "";
let runChannel: string | null = null;
let timer: number | null = null;

function isActive(): boolean {
    return !!currentVideo && watchBeaconActive(currentVideo.paused, currentVideo.ended, document.visibilityState);
}

function sendBeacon(): void {
    const channel = currentChannel();
    if (!channel) return;
    const start = watchBeaconStartsRun(runChannel, channel);
    runChannel = channel;
    try {
        void fetch(BEACON_URL, {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: watchBeaconBody(channel, currentSurface, start),
        }).catch(() => {});
    } catch {}
}

function stopTimer(): void {
    if (timer === null) return;
    window.clearInterval(timer);
    timer = null;
}

function syncTimer(): void {
    if (!isActive()) {
        stopTimer();
        return;
    }
    if (timer === null) timer = window.setInterval(sendBeacon, BEACON_INTERVAL_MS);
}

function onPlaybackChange(): void {
    if (isActive() && watchBeaconStartsRun(runChannel, currentChannel())) sendBeacon();
    syncTimer();
}

document.addEventListener("visibilitychange", onPlaybackChange);

export function wireWatchBeacon(el: HTMLVideoElement, surface: WatchSurface, channel: () => string): void {
    stopTimer();
    currentVideo = el;
    currentSurface = surface;
    currentChannel = channel;
    runChannel = null;
    el.addEventListener("play", onPlaybackChange);
    el.addEventListener("pause", onPlaybackChange);
    el.addEventListener("ended", onPlaybackChange);
    syncTimer();
}

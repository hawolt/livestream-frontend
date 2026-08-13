import Hls from "hls.js";
import { video } from "../dom.ts";
import { ctx, isCurrent, track } from "./context.ts";
import { HLS_BEACON_INTERVAL_MS } from "../constants.ts";
import { ensureViewerId } from "../../player-shared/viewer-id.ts";
import { needsCredentials } from "../../player-shared/needs-credentials.ts";
import { captchaQuery } from "../../captcha.ts";
import { beginTransport, enterTerminal, fullTeardown, goOffline, resetRetryBackoff, restartAfterFailure, setState } from "./lifecycle.ts";
import { closeQualityUpsell, enterQualityLockedTerminal } from "../quality-upsell.ts";
import { withCaptchaHint } from "./ws.ts";
import { attachVideoFailureListeners } from "./health.ts";
import { renderQualityMenu } from "../quality-menu.ts";
import { streamQualityText } from "../../quality.ts";
import { canUseHlsJs, canUseNativeHLS } from "./hls-support.ts";

export interface HlsLevelEntry {
    index: number;
    label: string;
}

function sendHLSBeat(g: number): void {
    void Promise.all([captchaQuery(), ensureViewerId(ctx.mediaBase, ctx.username)]).then(([tq, vid]) => {
        if (!isCurrent(g)) return;
        const url = `${ctx.mediaBase}/hls/${encodeURIComponent(ctx.username)}/beat?id=${encodeURIComponent(vid)}${tq}`;
        fetch(url, { method: "POST", credentials: "include" }).catch(() => {});
    });
}

let hlsBeaconTimer: number | null = null;

export function stopHLSBeacon(): void {
    if (hlsBeaconTimer !== null) {
        window.clearInterval(hlsBeaconTimer);
        hlsBeaconTimer = null;
    }
}

export function startHLSBeacon(g: number): void {
    stopHLSBeacon();
    const beat = () => {
        if (!isCurrent(g)) {
            stopHLSBeacon();
            return;
        }
        sendHLSBeat(g);
    };
    beat();
    hlsBeaconTimer = window.setInterval(beat, HLS_BEACON_INTERVAL_MS);
}

let hlsInstance: Hls | null = null;
let hlsLevelEntries: HlsLevelEntry[] = [];

export function destroyHls(): void {
    if (hlsInstance) {
        try {
            hlsInstance.destroy();
        } catch {}
        hlsInstance = null;
    }
    hlsLevelEntries = [];
}

export function hlsLevels(): HlsLevelEntry[] {
    return hlsLevelEntries;
}

export function hlsAutoEnabled(): boolean {
    return hlsInstance ? hlsInstance.autoLevelEnabled : true;
}

export function hlsCurrentLevel(): number {
    return hlsInstance ? hlsInstance.currentLevel : -1;
}

export function hlsLevelLabel(): string {
    if (!hlsInstance || hlsAutoEnabled()) return "Auto";
    const entry = hlsLevelEntries.find((e) => e.index === hlsInstance!.currentLevel);
    return entry ? entry.label : "Auto";
}

export function setHlsLevel(index: number): void {
    if (!hlsInstance) return;
    hlsInstance.currentLevel = index;
    renderQualityMenu();
}

export function fallbackFromMSE(g: number): void {
    if (!isCurrent(g)) return;
    if (canUseNativeHLS()) {
        ctx.transportKind = "hls-native";
    } else if (canUseHlsJs()) {
        ctx.transportKind = "hls-js";
    } else {
        enterTerminal("Playback not supported");
        return;
    }
    ctx.qualityLadder = [];
    ctx.qualityLadderKnown = false;
    renderQualityMenu();
    beginTransport();
}

async function buildMasterUrl(): Promise<string> {
    const tq = await captchaQuery();
    const query = tq ? `?${tq.slice(1)}` : "";
    return `${ctx.mediaBase}/hls/${encodeURIComponent(ctx.username)}/master.m3u8${query}`;
}

function wireVideoLifecycle(g: number): void {
    const onPlaying = () => {
        if (!isCurrent(g)) return;
        ctx.lastMediaArrivalAt = Date.now();
        resetRetryBackoff();
        setState("playing");
        renderQualityMenu();
    };
    const onEnded = () => {
        if (!isCurrent(g)) return;
        console.log("live: stream ended, waiting for next");
        fullTeardown();
        goOffline(g);
    };
    video.addEventListener("playing", onPlaying);
    video.addEventListener("ended", onEnded);
    track(() => video.removeEventListener("playing", onPlaying));
    track(() => video.removeEventListener("ended", onEnded));
}

function startNativeHLS(g: number, src: string): void {
    video.src = src;
    void video.play().catch(() => {});
    startHLSBeacon(g);
}

function startHlsJsPlayer(g: number, src: string): void {
    const hls = new Hls({
        lowLatencyMode: true,
        backBufferLength: 30,
        liveSyncDuration: 2.5,
        maxLiveSyncPlaybackRate: 1.08,
        enableWorker: true,
        xhrSetup: (xhr, url) => {
            xhr.withCredentials = needsCredentials(url, ctx.mediaBase, location.origin);
        },
    });
    hlsInstance = hls;
    hlsLevelEntries = [];
    hls.on(Hls.Events.MANIFEST_PARSED, () => {
        if (!isCurrent(g) || hlsInstance !== hls) return;
        hlsLevelEntries = hls.levels.map((level, index) => ({
            index,
            label: streamQualityText(level.width ?? 0, level.height ?? 0, level.frameRate ?? 0),
        }));
        renderQualityMenu();
    });
    hls.on(Hls.Events.LEVEL_SWITCHED, () => {
        if (!isCurrent(g) || hlsInstance !== hls) return;
        renderQualityMenu();
    });
    hls.on(Hls.Events.ERROR, (_event, data) => {
        if (!isCurrent(g) || hlsInstance !== hls) return;
        if (data.details === Hls.ErrorDetails.BUFFER_FULL_ERROR) return;
        if (!data.fatal) return;
        console.warn("live: hls.js fatal error, restarting", data);
        restartAfterFailure(g);
    });
    hls.on(Hls.Events.MEDIA_ATTACHED, () => {
        if (!isCurrent(g) || hlsInstance !== hls) return;
        hls.loadSource(src);
    });
    hls.attachMedia(video);
    void video.play().catch(() => {});
    startHLSBeacon(g);
}

export function startHLSTransport(g: number): void {
    attachVideoFailureListeners(g);
    closeQualityUpsell();
    wireVideoLifecycle(g);
    setState("buffering");
    void withCaptchaHint(g, buildMasterUrl()).then(async (src) => {
        if (!isCurrent(g)) return;
        let locked = false;
        try {
            const probe = await fetch(src, { credentials: "include" });
            if (probe.status === 403) {
                const body: unknown = await probe.json().catch(() => null);
                if (body && (body as { error?: unknown }).error === "quality-locked") locked = true;
            }
        } catch {}
        if (!isCurrent(g)) return;
        if (locked) {
            enterQualityLockedTerminal();
            return;
        }
        if (ctx.transportKind === "hls-native") {
            startNativeHLS(g, src);
        } else {
            startHlsJsPlayer(g, src);
        }
    });
}

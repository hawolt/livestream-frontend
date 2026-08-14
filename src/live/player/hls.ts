import Hls from "hls.js";
import { video } from "../dom.ts";
import { ctx, isCurrent, track } from "./context.ts";
import { HLS_BEACON_INTERVAL_MS, PRUNE_KEEP_S } from "../constants.ts";
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
import { latencyWindowFor, type LatencyWindow } from "./latency-window.ts";
import { updateSeekBar } from "../seekbar.ts";

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

export function hlsLiveSyncPosition(): number | null {
    return hlsInstance ? hlsInstance.liveSyncPosition : null;
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

const HLS_DVR_TICK_MS = 500;
const DEFAULT_LIVE_WINDOW: LatencyWindow = { sync: 3.5, max: 8 };

function startHlsJsPlayer(g: number, src: string): void {
    let normalLiveWindow: LatencyWindow = DEFAULT_LIVE_WINDOW;
    let dvrHoldActive = false;
    const hls = new Hls({
        lowLatencyMode: true,
        backBufferLength: PRUNE_KEEP_S,
        liveSyncDuration: normalLiveWindow.sync,
        liveMaxLatencyDuration: normalLiveWindow.max,
        maxLiveSyncPlaybackRate: 1,
        enableWorker: true,
        xhrSetup: (xhr, url) => {
            xhr.withCredentials = needsCredentials(url, ctx.mediaBase, location.origin);
        },
    });
    hlsInstance = hls;
    hlsLevelEntries = [];
    const applyLiveWindow = (target: LatencyWindow): void => {
        hls.config.liveSyncDuration = target.sync;
        hls.config.liveMaxLatencyDuration = target.max;
    };
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
    hls.on(Hls.Events.LEVEL_LOADED, (_event, data) => {
        if (!isCurrent(g) || hlsInstance !== hls) return;
        if (data.details.live === false) {
            console.log("live: playlist is finalized, going offline");
            window.setTimeout(() => {
                if (!isCurrent(g) || hlsInstance !== hls) return;
                fullTeardown();
                goOffline(g);
            }, 0);
            return;
        }
        const widened = latencyWindowFor(data.details.targetduration);
        if (!widened) return;
        if (normalLiveWindow.sync !== widened.sync || normalLiveWindow.max !== widened.max) {
            console.warn(`live: large segments (target ${data.details.targetduration}s), widening latency window`);
            normalLiveWindow = widened;
            if (!dvrHoldActive) applyLiveWindow(widened);
        }
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
    startLadderWatch(g, src);
    const dvrTimer = window.setInterval(() => {
        if (!isCurrent(g) || hlsInstance !== hls) {
            window.clearInterval(dvrTimer);
            return;
        }
        if (ctx.behindLive !== dvrHoldActive) {
            dvrHoldActive = ctx.behindLive;
            applyLiveWindow(dvrHoldActive ? { sync: normalLiveWindow.sync, max: PRUNE_KEEP_S } : normalLiveWindow);
        }
        updateSeekBar();
    }, HLS_DVR_TICK_MS);
    track(() => window.clearInterval(dvrTimer));
}

const LADDER_WATCH_MS = 30000;

function startLadderWatch(g: number, src: string): void {
    const timer = window.setInterval(() => {
        if (!isCurrent(g)) return;
        const hls = hlsInstance;
        if (!hls) return;
        void fetch(src, { credentials: "include" }).then(async (res) => {
            if (!res.ok || !isCurrent(g) || hlsInstance !== hls) return;
            const text = await res.text();
            if (!isCurrent(g) || hlsInstance !== hls) return;
            const variants = text.split("#EXT-X-STREAM-INF").length - 1;
            if (variants > hls.levels.length) beginTransport();
        }).catch(() => {});
    }, LADDER_WATCH_MS);
    track(() => window.clearInterval(timer));
}

export function startHLSTransport(g: number): void {
    attachVideoFailureListeners(g);
    closeQualityUpsell();
    wireVideoLifecycle(g);
    if (ctx.state !== "offline") setState("buffering");
    void withCaptchaHint(g, buildMasterUrl()).then(async (src) => {
        if (!isCurrent(g)) return;
        let locked = false;
        let missing = false;
        try {
            const probe = await fetch(src, { credentials: "include" });
            if (probe.status === 403) {
                const body: unknown = await probe.json().catch(() => null);
                if (body && (body as { error?: unknown }).error === "quality-locked") locked = true;
            }
            if (probe.status === 404 || probe.status === 410) missing = true;
        } catch {}
        if (!isCurrent(g)) return;
        if (locked) {
            enterQualityLockedTerminal();
            return;
        }
        if (missing) {
            goOffline(g);
            return;
        }
        if (ctx.transportKind === "hls-native") {
            startNativeHLS(g, src);
        } else {
            startHlsJsPlayer(g, src);
        }
    });
}

import { video } from "../dom.ts";
import { ctx, isCurrent } from "./context.ts";
import {
    ABR_COMFORTABLE_BUFFER_S,
    ABR_DROPPED_RATIO_THRESHOLD,
    ABR_LAG_THRESHOLD_S,
    ABR_MIN_BUFFER_S,
    ABR_SAMPLE_INTERVAL_MS,
    ABR_STALL_THRESHOLD,
    ABR_STALL_WINDOW_MS,
    ABR_THRESHOLDS,
} from "../constants.ts";
import {
    QUALITY_AUTO,
    type AbrState,
    classifyAbrSignal,
    decideAbrAction,
    downgradeTarget,
    emptyAbrState,
    ladderIndex,
    stepAbrState,
    upgradeTarget,
} from "../../quality.ts";
import { bufferedEnd } from "./mse.ts";
import { renderQualityMenu } from "../quality-menu.ts";
import { beginTransport } from "./lifecycle.ts";

let abrState: AbrState = emptyAbrState();
let abrTimer: number | null = null;
let stallTimestamps: number[] = [];
let lastAbrSampleAt = 0;
let lastDroppedFrames = 0;
let lastTotalFrames = 0;

export function resetAbr(): void {
    abrState = emptyAbrState();
}

export function recordStall(): void {
    stallTimestamps.push(Date.now());
}

function resetAbrSampling(): void {
    stallTimestamps = [];
    lastDroppedFrames = 0;
    lastTotalFrames = 0;
    lastAbrSampleAt = Date.now();
}

export function stopAbrMonitor(): void {
    if (abrTimer !== null) {
        window.clearInterval(abrTimer);
        abrTimer = null;
    }
}

export function startAbrMonitor(g: number): void {
    stopAbrMonitor();
    resetAbrSampling();
    abrTimer = window.setInterval(() => {
        if (!isCurrent(g)) {
            stopAbrMonitor();
            return;
        }
        abrTick(g);
    }, ABR_SAMPLE_INTERVAL_MS);
}

function abrTick(g: number): void {
    const now = Date.now();
    const elapsed = lastAbrSampleAt > 0 ? now - lastAbrSampleAt : ABR_SAMPLE_INTERVAL_MS;
    lastAbrSampleAt = now;
    stallTimestamps = stallTimestamps.filter((t) => now - t <= ABR_STALL_WINDOW_MS);
    if (ctx.qualityPreference !== QUALITY_AUTO || ctx.qualityLadder.length < 2 || ctx.state !== "playing") {
        abrState = emptyAbrState();
        return;
    }
    let droppedRatio: number | null = null;
    if (typeof video.getVideoPlaybackQuality === "function") {
        const q = video.getVideoPlaybackQuality();
        const droppedDelta = q.droppedVideoFrames - lastDroppedFrames;
        const totalDelta = q.totalVideoFrames - lastTotalFrames;
        lastDroppedFrames = q.droppedVideoFrames;
        lastTotalFrames = q.totalVideoFrames;
        if (totalDelta > 0) droppedRatio = Math.max(0, droppedDelta) / totalDelta;
    }
    const edge = bufferedEnd();
    const hasEdge = edge > 0 && video.buffered.length > 0;
    const bufferAheadS = hasEdge ? Math.max(0, edge - video.currentTime) : ABR_COMFORTABLE_BUFFER_S;
    const edgeLagS = hasEdge && !ctx.behindLive ? Math.max(0, edge - video.currentTime) : null;
    const signal = classifyAbrSignal({
        stallsInWindow: stallTimestamps.length,
        stallThreshold: ABR_STALL_THRESHOLD,
        bufferAheadS,
        minBufferS: ABR_MIN_BUFFER_S,
        comfortableBufferS: ABR_COMFORTABLE_BUFFER_S,
        edgeLagS,
        laggingThresholdS: ABR_LAG_THRESHOLD_S,
        droppedFrameRatio: droppedRatio,
        droppedRatioThreshold: ABR_DROPPED_RATIO_THRESHOLD,
        paused: video.paused,
    });
    abrState = stepAbrState(abrState, signal, elapsed);
    const currentIndex = ladderIndex(ctx.qualityLadder, ctx.activeQuality);
    const action = decideAbrAction(abrState, ctx.qualityLadder.length, currentIndex, ABR_THRESHOLDS);
    if (action === "hold") return;
    const target = action === "downgrade" ? downgradeTarget(ctx.qualityLadder, ctx.activeQuality) : upgradeTarget(ctx.qualityLadder, ctx.activeQuality);
    if (!target) return;
    ctx.activeQuality = target;
    resetAbr();
    renderQualityMenu();
    beginTransport();
}

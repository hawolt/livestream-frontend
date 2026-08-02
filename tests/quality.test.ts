import { expect, test } from "bun:test";
import {
    QUALITY_AUTO,
    QUALITY_SOURCE,
    classifyAbrSignal,
    decideAbrAction,
    downgradeTarget,
    emptyAbrState,
    isQualityOnlyFrame,
    ladderIndex,
    parseQualitiesFrame,
    qualityLabel,
    qualityWsParam,
    resolveNextQuality,
    stepAbrState,
    upgradeTarget,
} from "../src/quality.ts";

const LADDER = ["source", "720p", "360p"];

test("parses a valid qualities frame and rejects malformed ones", () => {
    expect(parseQualitiesFrame({ qualities: ["source", "720p", "360p"] })).toEqual(["source", "720p", "360p"]);
    expect(parseQualitiesFrame({ qualities: [] })).toEqual([]);
    expect(parseQualitiesFrame({})).toBeNull();
    expect(parseQualitiesFrame({ qualities: "source" })).toBeNull();
    expect(parseQualitiesFrame({ qualities: ["source", 720] })).toBeNull();
    expect(parseQualitiesFrame({ qualities: ["source", " "] })).toBeNull();
    expect(parseQualitiesFrame(null)).toBeNull();
    expect(parseQualitiesFrame("qualities")).toBeNull();
});

test("distinguishes a quality-only update frame from a join frame", () => {
    expect(isQualityOnlyFrame({ qualities: ["source", "720p"] })).toBe(true);
    expect(isQualityOnlyFrame({ codecs: "avc1.64001f", qualities: ["source"] })).toBe(false);
    expect(isQualityOnlyFrame({ codecs: "avc1.64001f" })).toBe(false);
    expect(isQualityOnlyFrame({})).toBe(false);
});

test("labels quality names for display", () => {
    expect(qualityLabel(QUALITY_AUTO)).toBe("Auto");
    expect(qualityLabel(QUALITY_SOURCE)).toBe("Source");
    expect(qualityLabel("720p")).toBe("720p");
});

test("steps up and down the ladder without going out of bounds", () => {
    expect(ladderIndex(LADDER, "720p")).toBe(1);
    expect(downgradeTarget(LADDER, "source")).toBe("720p");
    expect(downgradeTarget(LADDER, "720p")).toBe("360p");
    expect(downgradeTarget(LADDER, "360p")).toBeNull();
    expect(downgradeTarget(LADDER, "missing")).toBeNull();
    expect(upgradeTarget(LADDER, "360p")).toBe("720p");
    expect(upgradeTarget(LADDER, "720p")).toBe("source");
    expect(upgradeTarget(LADDER, "source")).toBeNull();
    expect(upgradeTarget(LADDER, "missing")).toBeNull();
});

test("resolves the next connection quality against preference and ladder knowledge", () => {
    expect(resolveNextQuality(QUALITY_AUTO, [], false, QUALITY_SOURCE)).toBe(QUALITY_SOURCE);
    expect(resolveNextQuality("720p", [], false, QUALITY_SOURCE)).toBe(QUALITY_SOURCE);
    expect(resolveNextQuality(QUALITY_SOURCE, [], false, QUALITY_SOURCE)).toBe(QUALITY_SOURCE);
    expect(resolveNextQuality(QUALITY_AUTO, LADDER, true, "720p")).toBe("720p");
    expect(resolveNextQuality(QUALITY_AUTO, LADDER, true, "missing")).toBe("source");
    expect(resolveNextQuality(QUALITY_AUTO, [], true, "720p")).toBe(QUALITY_SOURCE);
    expect(resolveNextQuality("720p", LADDER, true, QUALITY_SOURCE)).toBe("720p");
    expect(resolveNextQuality("1080p", LADDER, true, QUALITY_SOURCE)).toBe(QUALITY_SOURCE);
});

test("only appends the q param for a non-source quality", () => {
    expect(qualityWsParam(QUALITY_SOURCE)).toBe("");
    expect(qualityWsParam("")).toBe("");
    expect(qualityWsParam("720p")).toBe("&q=720p");
});

const thresholds = { cooldownMs: 20000, downgradeStreak: 3, upgradeStreak: 15 };

test("classifies player health from buffer, stall, lag and dropped-frame signals", () => {
    expect(classifyAbrSignal({
        stallsInWindow: 0,
        stallThreshold: 2,
        bufferAheadS: 5,
        minBufferS: 1,
        comfortableBufferS: 3,
        edgeLagS: 0.5,
        laggingThresholdS: 3.5,
        droppedFrameRatio: 0,
        droppedRatioThreshold: 0.08,
        paused: false,
    })).toBe("healthy");

    expect(classifyAbrSignal({
        stallsInWindow: 2,
        stallThreshold: 2,
        bufferAheadS: 5,
        minBufferS: 1,
        comfortableBufferS: 3,
        edgeLagS: 0.5,
        laggingThresholdS: 3.5,
        droppedFrameRatio: 0,
        droppedRatioThreshold: 0.08,
        paused: false,
    })).toBe("unhealthy");

    expect(classifyAbrSignal({
        stallsInWindow: 0,
        stallThreshold: 2,
        bufferAheadS: 0.2,
        minBufferS: 1,
        comfortableBufferS: 3,
        edgeLagS: 0.5,
        laggingThresholdS: 3.5,
        droppedFrameRatio: 0,
        droppedRatioThreshold: 0.08,
        paused: false,
    })).toBe("unhealthy");

    expect(classifyAbrSignal({
        stallsInWindow: 0,
        stallThreshold: 2,
        bufferAheadS: 5,
        minBufferS: 1,
        comfortableBufferS: 3,
        edgeLagS: 4,
        laggingThresholdS: 3.5,
        droppedFrameRatio: 0,
        droppedRatioThreshold: 0.08,
        paused: false,
    })).toBe("unhealthy");

    expect(classifyAbrSignal({
        stallsInWindow: 0,
        stallThreshold: 2,
        bufferAheadS: 5,
        minBufferS: 1,
        comfortableBufferS: 3,
        edgeLagS: 0.5,
        laggingThresholdS: 3.5,
        droppedFrameRatio: 0.2,
        droppedRatioThreshold: 0.08,
        paused: false,
    })).toBe("unhealthy");

    expect(classifyAbrSignal({
        stallsInWindow: 0,
        stallThreshold: 2,
        bufferAheadS: 2,
        minBufferS: 1,
        comfortableBufferS: 3,
        edgeLagS: 0.5,
        laggingThresholdS: 3.5,
        droppedFrameRatio: 0,
        droppedRatioThreshold: 0.08,
        paused: false,
    })).toBe("neutral");

    expect(classifyAbrSignal({
        stallsInWindow: 5,
        stallThreshold: 2,
        bufferAheadS: 0,
        minBufferS: 1,
        comfortableBufferS: 3,
        edgeLagS: null,
        laggingThresholdS: 3.5,
        droppedFrameRatio: null,
        droppedRatioThreshold: 0.08,
        paused: true,
    })).toBe("neutral");
});

test("accumulates streaks and resets the opposite one on each signal", () => {
    let state = emptyAbrState();
    state = stepAbrState(state, "unhealthy", 2000);
    state = stepAbrState(state, "unhealthy", 2000);
    expect(state).toEqual({ unhealthyStreak: 2, healthyStreak: 0, msSinceSwitch: 4000 });
    state = stepAbrState(state, "healthy", 2000);
    expect(state).toEqual({ unhealthyStreak: 0, healthyStreak: 1, msSinceSwitch: 6000 });
    state = stepAbrState(state, "neutral", 2000);
    expect(state).toEqual({ unhealthyStreak: 0, healthyStreak: 1, msSinceSwitch: 8000 });
});

test("holds during cooldown even with a qualifying streak", () => {
    let state = emptyAbrState();
    for (let i = 0; i < 5; i++) state = stepAbrState(state, "unhealthy", 2000);
    expect(state.msSinceSwitch).toBeLessThan(thresholds.cooldownMs);
    expect(decideAbrAction(state, 3, 0, thresholds)).toBe("hold");
});

test("downgrades after a sustained unhealthy streak once the cooldown has elapsed", () => {
    let state = emptyAbrState();
    for (let i = 0; i < 11; i++) state = stepAbrState(state, "unhealthy", 2000);
    expect(state.msSinceSwitch).toBeGreaterThanOrEqual(thresholds.cooldownMs);
    expect(decideAbrAction(state, 3, 0, thresholds)).toBe("downgrade");
    expect(decideAbrAction(state, 3, 2, thresholds)).toBe("hold");
});

test("upgrades only after a much longer healthy streak than a downgrade needs", () => {
    let state = emptyAbrState();
    for (let i = 0; i < 3; i++) state = stepAbrState(state, "healthy", 2000);
    expect(decideAbrAction(state, 3, 1, thresholds)).toBe("hold");
    for (let i = 0; i < 12; i++) state = stepAbrState(state, "healthy", 2000);
    expect(decideAbrAction(state, 3, 1, thresholds)).toBe("upgrade");
    expect(decideAbrAction(state, 3, 0, thresholds)).toBe("hold");
});

test("never suggests an action on a single-rendition ladder", () => {
    let state = emptyAbrState();
    for (let i = 0; i < 50; i++) state = stepAbrState(state, "unhealthy", 2000);
    expect(decideAbrAction(state, 1, 0, thresholds)).toBe("hold");
    expect(decideAbrAction(state, 0, -1, thresholds)).toBe("hold");
});

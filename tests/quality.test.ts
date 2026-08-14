import { expect, test } from "bun:test";
import {
    qualityRowParts,
    QUALITY_AUTO,
    QUALITY_SOURCE,
    allowedSubset,
    downgradeTarget,
    highestAllowed,
    isQualityLockedFrame,
    isQualityOnlyFrame,
    ladderIndex,
    parseLockedList,
    parseQualitiesFrame,
    qualityLabel,
    qualityWsParam,
    resolveNextQuality,
    streamQualityText,
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

test("parses the locked list from a join or locked frame", () => {
    expect(parseLockedList({ locked: ["source", "1080p"] })).toEqual(["source", "1080p"]);
    expect(parseLockedList({ locked: [] })).toEqual([]);
    expect(parseLockedList({})).toEqual([]);
    expect(parseLockedList(null)).toEqual([]);
    expect(parseLockedList({ locked: ["ok", 5, "  "] })).toEqual(["ok"]);
});

test("recognizes the quality locked frame", () => {
    expect(isQualityLockedFrame({ error: "quality-locked", qualities: ["source"] })).toBe(true);
    expect(isQualityLockedFrame({ error: "other" })).toBe(false);
    expect(isQualityLockedFrame(null)).toBe(false);
});

test("picks the highest allowed quality and filters locked entries", () => {
    expect(highestAllowed(["source", "720p", "360p"], ["source"])).toBe("720p");
    expect(highestAllowed(["source"], ["source"])).toBeNull();
    expect(highestAllowed(["source", "720p"], [])).toBe("source");
    expect(allowedSubset(["source", "720p", "360p"], ["source"])).toEqual(["720p", "360p"]);
});

test("labels the stream quality for the upsell text", () => {
    expect(streamQualityText(1920, 1080, 120)).toBe("1080p120");
    expect(streamQualityText(2560, 1440, 60)).toBe("1440p60");
    expect(streamQualityText(3840, 2160, 0)).toBe("4K");
    expect(streamQualityText(1080, 1920, 120)).toBe("1080p120");
    expect(streamQualityText(0, 0, 0)).toBe("high quality");
});

test("qualityRowParts splits resolution and framerate", () => {
    expect(qualityRowParts("360p30")).toEqual({ res: "360p", fps: "30 FPS" });
    expect(qualityRowParts("1080p61")).toEqual({ res: "1080p", fps: "61 FPS" });
    expect(qualityRowParts("4K60")).toEqual({ res: "4K", fps: "60 FPS" });
    expect(qualityRowParts("Auto")).toEqual({ res: "Auto", fps: null });
    expect(qualityRowParts("Source")).toEqual({ res: "Source", fps: null });
    expect(qualityRowParts("720p")).toEqual({ res: "720p", fps: null });
});

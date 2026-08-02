import { expect, test } from "bun:test";
import {
    QUALITY_AUTO,
    QUALITY_SOURCE,
    downgradeTarget,
    isQualityOnlyFrame,
    ladderIndex,
    parseQualitiesFrame,
    qualityLabel,
    qualityWsParam,
    resolveNextQuality,
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

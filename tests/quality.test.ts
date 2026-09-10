import { expect, test } from "bun:test";
import { qualityRowParts, streamQualityText } from "../src/quality.ts";

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

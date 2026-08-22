import { expect, test } from "bun:test";
import { parseOverlayShadow } from "../src/overlay-shadow.ts";

test("accepts the off value", () => {
    expect(parseOverlayShadow("0")).toBe("0");
});

test("accepts every drop-shadow tier", () => {
    expect(parseOverlayShadow("dropsm")).toBe("dropsm");
    expect(parseOverlayShadow("dropmd")).toBe("dropmd");
    expect(parseOverlayShadow("droplg")).toBe("droplg");
});

test("falls back to undefined for an unknown value", () => {
    expect(parseOverlayShadow("1")).toBeUndefined();
    expect(parseOverlayShadow("soft")).toBeUndefined();
    expect(parseOverlayShadow("")).toBeUndefined();
});

test("falls back to undefined for a missing param", () => {
    expect(parseOverlayShadow(null)).toBeUndefined();
});

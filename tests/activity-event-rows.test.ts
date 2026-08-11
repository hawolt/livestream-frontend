import { expect, test } from "bun:test";
import { eventTypeClass } from "../src/dash/activity-events.ts";

test("maps event types to tag classes", () => {
    expect(eventTypeClass("follow")).toBe("act-ev-type act-ev-type-follow");
    expect(eventTypeClass("FOLLOW")).toBe("act-ev-type act-ev-type-follow");
});

test("sanitizes hostile type strings for class usage", () => {
    expect(eventTypeClass('x" onmouseover="1')).toBe("act-ev-type act-ev-type-xonmouseover1");
    expect(eventTypeClass("<>")).toBe("act-ev-type");
});

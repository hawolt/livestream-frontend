import { expect, test } from "bun:test";
import { visitBody, type VisitClass } from "../src/visit-beacon.ts";

test("serializes each page class into the beacon body", () => {
    const classes: VisitClass[] = ["explore", "channel", "dashboard", "other"];
    for (const cls of classes) {
        expect(visitBody(cls)).toBe(`{"p":"${cls}"}`);
    }
});

test("body carries nothing besides the page class", () => {
    expect(Object.keys(JSON.parse(visitBody("explore")))).toEqual(["p"]);
});

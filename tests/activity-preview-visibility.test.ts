import { expect, test } from "bun:test";
import { shouldPreviewRun } from "../src/dash/activity-preview.ts";

const allTrue = { toggledOn: true, tabActive: true, documentVisible: true, cardVisible: true };

test("runs only when every condition holds", () => {
    expect(shouldPreviewRun(allTrue)).toBe(true);
});

test("stops when the toggle is off", () => {
    expect(shouldPreviewRun({ ...allTrue, toggledOn: false })).toBe(false);
});

test("stops when the activity tab is not the active dashboard tab", () => {
    expect(shouldPreviewRun({ ...allTrue, tabActive: false })).toBe(false);
});

test("stops when the document is hidden", () => {
    expect(shouldPreviewRun({ ...allTrue, documentVisible: false })).toBe(false);
});

test("stops when the card is scrolled out of view", () => {
    expect(shouldPreviewRun({ ...allTrue, cardVisible: false })).toBe(false);
});

test("stops when every condition fails", () => {
    expect(shouldPreviewRun({ toggledOn: false, tabActive: false, documentVisible: false, cardVisible: false })).toBe(false);
});

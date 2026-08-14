import { describe, expect, test } from "bun:test";
import { type ChannelPanel, computeReorderSwap, sortPanels, validatePanelForm } from "../src/dash/panels.ts";

function panel(id: number, position: number, extra: Partial<ChannelPanel> = {}): ChannelPanel {
    return { id, title: `Card ${id}`, body: "", linkUrl: "", position, ...extra };
}

describe("validatePanelForm", () => {
    test("accepts a title-only card", () => {
        expect(validatePanelForm({ title: "Schedule", body: "", linkUrl: "" })).toEqual({});
    });

    test("accepts a body-only card", () => {
        expect(validatePanelForm({ title: "", body: "Stream weekdays at 6pm", linkUrl: "" })).toEqual({});
    });

    test("requires a title or body", () => {
        expect(validatePanelForm({ title: "", body: "", linkUrl: "" })).toEqual({ title: "Add a title or body." });
        expect(validatePanelForm({ title: "  ", body: "  ", linkUrl: "" })).toEqual({ title: "Add a title or body." });
    });

    test("rejects an overlong title", () => {
        const errors = validatePanelForm({ title: "x".repeat(81), body: "", linkUrl: "" });
        expect(errors.title).toBe("Title must be 80 characters or fewer.");
    });

    test("rejects an overlong body", () => {
        const errors = validatePanelForm({ title: "Card", body: "x".repeat(301), linkUrl: "" });
        expect(errors.body).toBe("Body must be 300 characters or fewer.");
    });

    test("rejects a link without http or https", () => {
        const errors = validatePanelForm({ title: "Card", body: "", linkUrl: "example.com" });
        expect(errors.linkUrl).toBe("Link must start with http:// or https://");
    });

    test("accepts a valid https link", () => {
        expect(validatePanelForm({ title: "Card", body: "", linkUrl: "https://example.com" })).toEqual({});
    });

    test("accepts an empty link", () => {
        expect(validatePanelForm({ title: "Card", body: "", linkUrl: "  " })).toEqual({});
    });
});

describe("sortPanels", () => {
    test("orders by position ascending without mutating input", () => {
        const panels = [panel(3, 2), panel(1, 0), panel(2, 1)];
        const sorted = sortPanels(panels);
        expect(sorted.map(p => p.id)).toEqual([1, 2, 3]);
        expect(panels.map(p => p.id)).toEqual([3, 1, 2]);
    });
});

describe("computeReorderSwap", () => {
    test("moving up swaps positions with the previous panel", () => {
        const panels = [panel(1, 0), panel(2, 1), panel(3, 2)];
        const swap = computeReorderSwap(panels, 2, "up");
        expect(swap).not.toBeNull();
        const [a, b] = swap!;
        expect(a).toEqual({ ...panel(2, 1), position: 0 });
        expect(b).toEqual({ ...panel(1, 0), position: 1 });
    });

    test("moving down swaps positions with the next panel", () => {
        const panels = [panel(1, 0), panel(2, 1), panel(3, 2)];
        const swap = computeReorderSwap(panels, 2, "down");
        expect(swap).not.toBeNull();
        const [a, b] = swap!;
        expect(a).toEqual({ ...panel(2, 1), position: 2 });
        expect(b).toEqual({ ...panel(3, 2), position: 1 });
    });

    test("returns null moving the first panel up or the last panel down", () => {
        const panels = [panel(1, 0), panel(2, 1), panel(3, 2)];
        expect(computeReorderSwap(panels, 1, "up")).toBeNull();
        expect(computeReorderSwap(panels, 3, "down")).toBeNull();
    });

    test("returns null for an unknown id", () => {
        const panels = [panel(1, 0), panel(2, 1)];
        expect(computeReorderSwap(panels, 99, "up")).toBeNull();
    });

    test("works regardless of input ordering", () => {
        const panels = [panel(3, 2), panel(1, 0), panel(2, 1)];
        const swap = computeReorderSwap(panels, 1, "down");
        expect(swap).not.toBeNull();
        const [a, b] = swap!;
        expect(a.id).toBe(1);
        expect(a.position).toBe(1);
        expect(b.id).toBe(2);
        expect(b.position).toBe(0);
    });
});

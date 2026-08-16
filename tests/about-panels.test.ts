import { expect, test } from "bun:test";
import { isSafeHttpLink, normalizePanels } from "../src/live/about/panels.ts";

test("normalizes a well formed panel list", () => {
    const panels = normalizePanels([
        { id: "1", title: "Rules", body: "Be nice", linkUrl: "https://x.com", imageUrl: "https://x.com/i.png" },
    ]);
    expect(panels).toEqual([
        { id: "1", title: "Rules", body: "Be nice", linkUrl: "https://x.com", imageUrl: "https://x.com/i.png" },
    ]);
});

test("drops entries with no title, body or image", () => {
    const panels = normalizePanels([{ id: "1", title: "", body: "", linkUrl: "https://x.com", imageUrl: "" }]);
    expect(panels).toEqual([]);
});

test("keeps an entry with only a body", () => {
    const panels = normalizePanels([{ id: "1", body: "Just text" }]);
    expect(panels).toEqual([{ id: "1", title: "", body: "Just text", linkUrl: "", imageUrl: "" }]);
});

test("numeric panel ids from the server normalize to strings", () => {
    const panels = normalizePanels([{ id: 42, body: "Numbered" }]);
    expect(panels[0]?.id).toBe("42");
});

test("is defensive about missing or malformed input", () => {
    expect(normalizePanels(undefined)).toEqual([]);
    expect(normalizePanels(null)).toEqual([]);
    expect(normalizePanels("panels")).toEqual([]);
    expect(normalizePanels([null, 42, "x", { title: 5 }])).toEqual([]);
});

test("isSafeHttpLink accepts only http and https", () => {
    expect(isSafeHttpLink("https://example.com")).toBe(true);
    expect(isSafeHttpLink("http://example.com")).toBe(true);
    expect(isSafeHttpLink("javascript:alert(1)")).toBe(false);
    expect(isSafeHttpLink("//example.com")).toBe(false);
    expect(isSafeHttpLink("")).toBe(false);
});

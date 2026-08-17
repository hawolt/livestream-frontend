import { describe, expect, test } from "bun:test";
import { anchorHeadings, headingId } from "../scripts/build-content.ts";

describe("headingId", () => {
    test("slugifies plain text", () => {
        expect(headingId("Encoder settings", new Set())).toBe("encoder-settings");
    });

    test("strips leading numbers into the slug rather than dropping them", () => {
        expect(headingId("1. Find your ingest URL", new Set())).toBe("1-find-your-ingest-url");
    });

    test("collapses punctuation and trims separators", () => {
        expect(headingId("  Tags, limits & close codes!  ", new Set())).toBe("tags-limits-close-codes");
    });

    test("falls back when nothing survives slugification", () => {
        expect(headingId("???", new Set())).toBe("section");
    });

    test("deduplicates collisions in document order", () => {
        const taken = new Set<string>();
        expect(headingId("Limits", taken)).toBe("limits");
        expect(headingId("Limits", taken)).toBe("limits-2");
        expect(headingId("Limits", taken)).toBe("limits-3");
    });
});

describe("anchorHeadings", () => {
    test("adds an id and an anchor link to every h2", () => {
        const { body, headings } = anchorHeadings("<h2>Endpoints</h2>\n<p>text</p>\n<h2>Limits</h2>");
        expect(headings).toEqual([
            { id: "endpoints", text: "Endpoints" },
            { id: "limits", text: "Limits" },
        ]);
        expect(body).toContain('<h2 id="endpoints">Endpoints<a class="content-anchor" href="#endpoints"');
        expect(body).toContain('<h2 id="limits">Limits<a class="content-anchor" href="#limits"');
    });

    test("leaves other markup untouched", () => {
        const source = "<p>before</p>\n<h2>Only</h2>\n<h3>Sub</h3>\n<pre><code>h2</code></pre>";
        const { body } = anchorHeadings(source);
        expect(body).toContain("<p>before</p>");
        expect(body).toContain("<h3>Sub</h3>");
        expect(body).toContain("<pre><code>h2</code></pre>");
    });

    test("is a no-op on a fragment with no headings", () => {
        const { body, headings } = anchorHeadings("<p>nothing here</p>");
        expect(headings).toEqual([]);
        expect(body).toBe("<p>nothing here</p>");
    });

    test("gives duplicate headings distinct anchors", () => {
        const { headings } = anchorHeadings("<h2>Limits</h2><h2>Limits</h2>");
        expect(headings.map(h => h.id)).toEqual(["limits", "limits-2"]);
    });
});

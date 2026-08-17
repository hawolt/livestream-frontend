import { describe, expect, test } from "bun:test";
import {
    CONTENT_PAGES,
    CONTENT_SECTIONS,
    pageUrl,
    pagesInSection,
    sectionMeta,
    sectionUrl,
} from "../content/pages.ts";

const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

describe("content manifest", () => {
    test("every page belongs to a declared section", () => {
        const known = new Set(CONTENT_SECTIONS.map(section => section.id));
        for (const page of CONTENT_PAGES) {
            expect(known.has(page.section)).toBe(true);
        }
    });

    test("slugs are url safe and unique within a section", () => {
        const seen = new Set<string>();
        for (const page of CONTENT_PAGES) {
            expect(page.slug).toMatch(SLUG_PATTERN);
            const key = `${page.section}/${page.slug}`;
            expect(seen.has(key)).toBe(false);
            seen.add(key);
        }
    });

    test("a slug never collides with its own section name", () => {
        for (const page of CONTENT_PAGES) {
            expect(page.slug).not.toBe(page.section);
        }
    });

    test("every page carries a title, heading, description and summary", () => {
        for (const page of CONTENT_PAGES) {
            expect(page.heading.trim().length).toBeGreaterThan(0);
            expect(page.title.trim().length).toBeGreaterThan(0);
            expect(page.description.trim().length).toBeGreaterThan(0);
            expect(page.summary.trim().length).toBeGreaterThan(0);
        }
    });

    test("titles are branded and within the length search engines render", () => {
        for (const page of CONTENT_PAGES) {
            expect(page.title.endsWith(" | ITZON")).toBe(true);
            expect(page.title.length).toBeLessThanOrEqual(65);
        }
        for (const section of CONTENT_SECTIONS) {
            expect(section.title.endsWith(" | ITZON")).toBe(true);
            expect(section.title.length).toBeLessThanOrEqual(65);
        }
    });

    test("descriptions stay inside the snippet budget", () => {
        for (const page of CONTENT_PAGES) {
            expect(page.description.length).toBeGreaterThanOrEqual(70);
            expect(page.description.length).toBeLessThanOrEqual(165);
        }
        for (const section of CONTENT_SECTIONS) {
            expect(section.description.length).toBeLessThanOrEqual(165);
        }
    });

    test("descriptions are unique so no two pages compete on the same snippet", () => {
        const descriptions = CONTENT_PAGES.map(page => page.description);
        expect(new Set(descriptions).size).toBe(descriptions.length);
    });

    test("every manifest entry has a fragment on disk", async () => {
        for (const page of CONTENT_PAGES) {
            const file = Bun.file(`${import.meta.dir}/../content/${page.section}/${page.slug}.html`);
            expect(await file.exists()).toBe(true);
        }
    });

    test("no fragment declares its own h1, the shell owns it", async () => {
        for (const page of CONTENT_PAGES) {
            const body = await Bun.file(`${import.meta.dir}/../content/${page.section}/${page.slug}.html`).text();
            expect(body).not.toContain("<h1");
        }
    });

    test("no fragment still points at a hash route", async () => {
        for (const page of CONTENT_PAGES) {
            const body = await Bun.file(`${import.meta.dir}/../content/${page.section}/${page.slug}.html`).text();
            expect(body).not.toContain('href="#');
        }
    });

    test("urls are built from the section and slug", () => {
        expect(pageUrl(CONTENT_PAGES[0]!)).toBe(`/${CONTENT_PAGES[0]!.section}/${CONTENT_PAGES[0]!.slug}`);
        expect(sectionUrl("docs")).toBe("/docs");
        expect(sectionUrl("guides")).toBe("/guides");
    });

    test("every section has at least one page", () => {
        for (const section of CONTENT_SECTIONS) {
            expect(pagesInSection(section.id).length).toBeGreaterThan(0);
        }
    });

    test("sectionMeta resolves a declared section and throws otherwise", () => {
        expect(sectionMeta("docs").id).toBe("docs");
        expect(() => sectionMeta("blog" as "docs")).toThrow();
    });
});

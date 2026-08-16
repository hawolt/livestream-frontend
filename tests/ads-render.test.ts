import { beforeEach, describe, expect, test } from "bun:test";
import type { AdSpot } from "../src/ads.ts";
import { adLabelFor, renderAdSlot } from "../src/ads.ts";

class StubElement {
    tagName: string;
    className = "";
    href = "";
    target = "";
    rel = "";
    src = "";
    alt = "";
    loading = "";
    textContent = "";
    style = { cssText: "" };
    children: StubElement[] = [];

    constructor(tagName: string) {
        this.tagName = tagName;
    }

    appendChild(child: StubElement): StubElement {
        this.children.push(child);
        return child;
    }

    replaceChildren(...next: StubElement[]): void {
        this.children = next;
    }

    descendants(): StubElement[] {
        const out: StubElement[] = [];
        for (const child of this.children) {
            out.push(child);
            out.push(...child.descendants());
        }
        return out;
    }

    findTag(tagName: string): StubElement | null {
        return this.descendants().find(el => el.tagName === tagName) ?? null;
    }
}

const stubDocument = {
    createElement(tagName: string): StubElement {
        return new StubElement(tagName);
    },
};

(globalThis as unknown as { document: unknown }).document = stubDocument;

function makeAd(overrides: Partial<AdSpot> = {}): AdSpot {
    return {
        id: 1,
        imageUrl: "/static/img/ad.png",
        targetUrl: "https://example.com",
        altText: "Example ad",
        label: "",
        ...overrides,
    };
}

function render(container: StubElement, ads: AdSpot[]): void {
    renderAdSlot(container as unknown as HTMLElement, ads);
}

describe("renderAdSlot", () => {
    let container: StubElement;

    beforeEach(() => {
        container = new StubElement("div");
    });

    test("renders nothing for an empty list", () => {
        render(container, []);
        expect(container.children.length).toBe(0);
    });

    test("builds an anchor with the visit endpoint, target and rel attributes", () => {
        render(container, [makeAd({ id: 42 })]);
        const anchor = container.findTag("a");
        expect(anchor).not.toBeNull();
        expect(anchor!.href).toBe("/api/live/spots/visit/42");
        expect(anchor!.target).toBe("_blank");
        expect(anchor!.rel).toBe("noopener nofollow sponsored");
    });

    test("carries no classes or ids, only inline styles, so per-element cosmetic filters have nothing to match", () => {
        render(container, [makeAd()]);
        const anchor = container.findTag("a");
        const img = container.findTag("img");
        const label = container.findTag("span");
        expect(anchor).not.toBeNull();
        expect(img).not.toBeNull();
        expect(label).not.toBeNull();
        expect(anchor!.className).toBe("");
        expect(img!.className).toBe("");
        expect(label!.className).toBe("");
        expect(anchor!.style.cssText.length).toBeGreaterThan(0);
        expect(img!.style.cssText.length).toBeGreaterThan(0);
        expect(label!.style.cssText.length).toBeGreaterThan(0);
    });

    test("never routes the advertiser url through the document", () => {
        const targetUrl = "https://advertiser.example/landing";
        render(container, [makeAd({ targetUrl })]);
        expect(container.descendants().some(el => el.href === targetUrl || el.src === targetUrl)).toBe(false);
    });

    test("builds an img carrying the alt text and a legally required Anzeige label", () => {
        render(container, [makeAd({ id: 7, altText: "Great deal" })]);
        const img = container.findTag("img");
        expect(img).not.toBeNull();
        expect(img!.alt).toBe("Great deal");
        expect(img!.src).toBe("/api/live/spots/image/7");
        const label = container.findTag("span");
        expect(label).not.toBeNull();
        expect(label!.textContent).toBe("Anzeige");
    });

    test("treats hostile ad copy as inert text, never interpreted as markup", () => {
        const hostile = "<script>window.pwned=1</script>";
        render(container, [makeAd({ altText: hostile })]);
        const img = container.findTag("img");
        expect(img).not.toBeNull();
        expect(img!.alt).toBe(hostile);
        expect(container.findTag("script")).toBeNull();
    });

    test("clears a previous render before drawing an empty list", () => {
        render(container, [makeAd()]);
        expect(container.children.length).toBeGreaterThan(0);
        render(container, []);
        expect(container.children.length).toBe(0);
    });

    test("localizes the ad label by viewer country, keeping the element fallback when unknown", () => {
        expect(adLabelFor("DE", "Anzeige")).toBe("Anzeige");
        expect(adLabelFor("at", "Ad")).toBe("Anzeige");
        expect(adLabelFor("FR", "Anzeige")).toBe("Publicité");
        expect(adLabelFor("BR", "Anzeige")).toBe("Publicidade");
        expect(adLabelFor("US", "Anzeige")).toBe("Ad");
        expect(adLabelFor("JP", "Anzeige")).toBe("Ad");
        expect(adLabelFor("", "Anzeige")).toBe("Anzeige");
        expect(adLabelFor("", "Ad")).toBe("Ad");
        expect(adLabelFor("  ", "Anzeige")).toBe("Anzeige");
    });

    test("renders only through createElement, so an innerHTML rewrite would fail this suite", () => {
        render(container, [makeAd()]);
        expect(container.children.length).toBe(1);
        expect(container.children[0]!.tagName).toBe("a");
    });
});

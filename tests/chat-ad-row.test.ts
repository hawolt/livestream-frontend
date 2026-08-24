import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import type { AdSpot } from "../src/ads.ts";

type Listener = (event: { preventDefault(): void }) => void;

class StubElement {
    tagName: string;
    className = "";
    textContent = "";
    hidden = false;
    href = "";
    target = "";
    rel = "";
    type = "";
    title = "";
    removed = false;
    attributes = new Map<string, string>();
    children: StubElement[] = [];
    listeners = new Map<string, Listener[]>();

    constructor(tagName: string) {
        this.tagName = tagName;
    }

    append(...nodes: StubElement[]): void {
        this.children.push(...nodes);
    }

    setAttribute(name: string, value: string): void {
        this.attributes.set(name, value);
    }

    addEventListener(type: string, fn: Listener): void {
        const list = this.listeners.get(type) ?? [];
        list.push(fn);
        this.listeners.set(type, list);
    }

    remove(): void {
        this.removed = true;
    }

    click(): { defaultPrevented: boolean } {
        let defaultPrevented = false;
        const event = { preventDefault(): void { defaultPrevented = true; } };
        for (const fn of this.listeners.get("click") ?? []) fn(event);
        return { defaultPrevented };
    }

    descendants(): StubElement[] {
        const out: StubElement[] = [];
        for (const child of this.children) {
            out.push(child);
            out.push(...child.descendants());
        }
        return out;
    }

    byClass(className: string): StubElement | null {
        return this.descendants().find((el) => el.className.split(" ").includes(className)) ?? null;
    }
}

interface SentRequest {
    url: string;
    method: string;
}

const stubDocument = {
    createElement(tagName: string): StubElement {
        return new StubElement(tagName);
    },
};

const sent: SentRequest[] = [];

function stubFetch(url: string, init?: { method?: string }): Promise<unknown> {
    sent.push({ url, method: init?.method ?? "GET" });
    return Promise.resolve({ ok: true });
}

const globals = globalThis as unknown as Record<string, unknown>;

let previousDocument: unknown;
let previousFetch: unknown;
let previousObserver: unknown;

beforeEach(() => {
    previousDocument = globals["document"];
    previousFetch = globals["fetch"];
    previousObserver = globals["IntersectionObserver"];
    sent.length = 0;
    globals["document"] = stubDocument;
    globals["fetch"] = stubFetch;
    globals["IntersectionObserver"] = undefined;
});

afterEach(() => {
    globals["document"] = previousDocument;
    globals["fetch"] = previousFetch;
    globals["IntersectionObserver"] = previousObserver;
});

const { buildChatAdRow, CHAT_AD_HOUSE_LABEL, chatAdText } = await import("../src/chat/chat-ad-row.ts");

function makeAd(overrides: Partial<AdSpot> = {}): AdSpot {
    return {
        id: 7,
        imageUrl: "/static/img/ad.png",
        targetUrl: "https://example.com",
        altText: "Example ad",
        label: "Try the thing",
        ...overrides,
    };
}

function buildRow(insertedAt: number, ad: AdSpot = makeAd(), onDismiss: () => void = () => {}): StubElement {
    return buildChatAdRow(ad, 7, "alice", insertedAt, onDismiss) as unknown as StubElement;
}

async function settle(): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, 0));
}

describe("chat ad row markup", () => {
    test("the dismiss button is a sibling of the link, never nested inside it", () => {
        const row = buildRow(Date.now());
        const cta = row.byClass("live-chat-ad-cta")!;
        const close = row.byClass("live-chat-ad-close")!;
        expect(cta.tagName).toBe("a");
        expect(close.tagName).toBe("button");
        expect(cta.children).toEqual([]);
        expect(row.descendants()).toContain(cta);
        expect(row.descendants()).toContain(close);
        expect(cta.descendants()).not.toContain(close);
    });

    test("the dismiss button keeps its own accessible name and button type", () => {
        const close = buildRow(Date.now()).byClass("live-chat-ad-close")!;
        expect(close.type).toBe("button");
        expect(close.attributes.get("aria-label")).toBe("Dismiss ad");
    });

    test("the ad label is always present for the disclosure", () => {
        const tag = buildRow(Date.now()).byClass("live-chat-ad-tag")!;
        expect(tag.textContent.length).toBeGreaterThan(0);
    });

    test("renders the advertiser name the API returns", () => {
        const advertiser = buildRow(Date.now(), makeAd({ advertiserName: "Example GmbH" }))
            .byClass("live-chat-ad-advertiser")!;
        expect(advertiser.textContent).toBe("Paid for by Example GmbH");
        expect(advertiser.hidden).toBe(false);
    });

    test("hides the advertiser line when the API returns none", () => {
        const advertiser = buildRow(Date.now()).byClass("live-chat-ad-advertiser")!;
        expect(advertiser.textContent).toBe("");
        expect(advertiser.hidden).toBe(true);
    });

    test("falls back to house copy when the spot carries no label", () => {
        const label = buildRow(Date.now(), makeAd({ label: "" })).byClass("live-chat-ad-label")!;
        expect(label.textContent).toBe(CHAT_AD_HOUSE_LABEL);
    });

    test("hostile ad copy stays inert text", () => {
        const hostile = "<img src=x onerror=alert(1)>";
        const label = buildRow(Date.now(), makeAd({ label: hostile })).byClass("live-chat-ad-label")!;
        expect(label.textContent).toBe(hostile);
        expect(label.children).toEqual([]);
    });

    test("the link points at the visit endpoint and carries the channel", () => {
        const cta = buildRow(Date.now()).byClass("live-chat-ad-cta")!;
        expect(cta.href).toBe("/api/live/spots/visit/7?channel=alice");
        expect(cta.target).toBe("_blank");
        expect(cta.rel).toBe("noopener nofollow sponsored");
    });

    test("never routes the advertiser url through the document", () => {
        const row = buildRow(Date.now(), makeAd({ targetUrl: "https://advertiser.example/landing" }));
        expect(row.descendants().some((el) => el.href === "https://advertiser.example/landing")).toBe(false);
    });
});

describe("chat ad click arming", () => {
    test("a click inside the arming window is cancelled and never navigates", async () => {
        const row = buildRow(Date.now());
        const result = row.byClass("live-chat-ad-cta")!.click();
        await settle();
        expect(result.defaultPrevented).toBe(true);
    });

    test("a click inside the arming window is reported as a fast click", async () => {
        const row = buildRow(Date.now());
        row.byClass("live-chat-ad-cta")!.click();
        await settle();
        expect(sent.map((request) => request.url)).toEqual([
            "/api/live/spots/impression",
            "/api/live/spots/visit/7?channel=alice",
        ]);
    });

    test("a click after the arming window navigates normally and reports no fast click", async () => {
        const row = buildRow(Date.now() - 5000);
        const result = row.byClass("live-chat-ad-cta")!.click();
        await settle();
        expect(result.defaultPrevented).toBe(false);
        expect(sent).toEqual([]);
    });
});

describe("chat ad dismissal", () => {
    test("dismissing removes the row and reports the dismissal once", () => {
        let dismissals = 0;
        const row = buildRow(Date.now(), makeAd(), () => { dismissals += 1; });
        row.byClass("live-chat-ad-close")!.click();
        expect(row.removed).toBe(true);
        expect(dismissals).toBe(1);
    });

    test("dismissing posts nothing", async () => {
        const row = buildRow(Date.now());
        row.byClass("live-chat-ad-close")!.click();
        await settle();
        expect(sent).toEqual([]);
    });
});

describe("chatAdText", () => {
    test("uses the label a spot carries", () => {
        expect(chatAdText("Half price hosting this week", "Acme")).toBe("Half price hosting this week");
    });

    test("falls back to house copy only when nobody paid for the spot", () => {
        expect(chatAdText("", "")).toBe(CHAT_AD_HOUSE_LABEL);
        expect(chatAdText("   ", "")).toBe(CHAT_AD_HOUSE_LABEL);
    });

    test("never puts house copy under an advertiser byline", () => {
        expect(chatAdText("", "Acme")).toBeNull();
        expect(chatAdText("   ", "Acme")).toBeNull();
    });
});

describe("stacked card structure", () => {
    test("the chip and the dismiss share the top row, away from the copy", () => {
        const row = buildRow(Date.now());
        const top = row.byClass("live-chat-ad-top")!;
        expect(top.children).toContain(row.byClass("live-chat-ad-tag")!);
        expect(top.children).toContain(row.byClass("live-chat-ad-close")!);
        expect(top.children).not.toContain(row.byClass("live-chat-ad-label")!);
    });

    test("the copy sits on its own, sharing a line with nothing", () => {
        const row = buildRow(Date.now());
        const label = row.byClass("live-chat-ad-label")!;
        expect(row.children).toContain(label);
        expect(label.children).toEqual([]);
    });

    test("the action row carries the link and the byline", () => {
        const row = buildRow(Date.now(), makeAd({ advertiserName: "Example GmbH" }));
        const foot = row.byClass("live-chat-ad-foot")!;
        expect(foot.children).toContain(row.byClass("live-chat-ad-cta")!);
        expect(foot.children).toContain(row.byClass("live-chat-ad-advertiser")!);
    });

    test("the three rows appear in reading order", () => {
        const row = buildRow(Date.now());
        expect(row.children.map((c) => c.className)).toEqual([
            "live-chat-ad-top",
            "live-chat-ad-label",
            "live-chat-ad-foot",
        ]);
    });

    test("the call to action names the action instead of relying on a glyph alone", () => {
        const cta = buildRow(Date.now()).byClass("live-chat-ad-cta")!;
        expect(cta.textContent).toContain("Learn more");
    });

    test("a house ad renders no paid-for-by line", () => {
        const advertiser = buildRow(Date.now(), makeAd({ label: "Get a subscription" }))
            .byClass("live-chat-ad-advertiser")!;
        expect(advertiser.hidden).toBe(true);
        expect(advertiser.textContent).toBe("");
    });
});

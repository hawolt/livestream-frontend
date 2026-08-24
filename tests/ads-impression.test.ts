import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
    adVisitUrl,
    adViewable,
    advertiserLine,
    impressionBody,
    trackAdImpression,
    VIEWABLE_MS,
    VIEWABLE_RATIO,
} from "../src/ads.ts";

type Listener = () => void;

interface StubEntry {
    isIntersecting: boolean;
    intersectionRatio: number;
}

interface SentRequest {
    url: string;
    method: string;
    body: string;
}

class StubObserver {
    static instances: StubObserver[] = [];
    readonly thresholds: number[];
    readonly observed: unknown[] = [];
    disconnected = false;
    private readonly callback: (entries: StubEntry[]) => void;

    constructor(callback: (entries: StubEntry[]) => void, options: { threshold?: number[] }) {
        this.callback = callback;
        this.thresholds = options.threshold ?? [];
        StubObserver.instances.push(this);
    }

    observe(el: unknown): void {
        this.observed.push(el);
    }

    disconnect(): void {
        this.disconnected = true;
    }

    emit(ratio: number): void {
        this.callback([{ isIntersecting: ratio > 0, intersectionRatio: ratio }]);
    }
}

const visibilityListeners = new Set<Listener>();

const stubDocument = {
    visibilityState: "visible",
    createElement(tagName: string): { tagName: string } {
        return { tagName };
    },
    addEventListener(type: string, fn: Listener): void {
        if (type === "visibilitychange") visibilityListeners.add(fn);
    },
    removeEventListener(type: string, fn: Listener): void {
        if (type === "visibilitychange") visibilityListeners.delete(fn);
    },
};

const timers = new Map<number, { fn: Listener; delay: number }>();
let nextTimerId = 0;

const stubWindow = {
    setTimeout(fn: Listener, delay: number): number {
        nextTimerId += 1;
        timers.set(nextTimerId, { fn, delay });
        return nextTimerId;
    },
    clearTimeout(id: number): void {
        timers.delete(id);
    },
};

const sent: SentRequest[] = [];

function stubFetch(url: string, init?: { method?: string; body?: string }): Promise<unknown> {
    sent.push({ url, method: init?.method ?? "GET", body: init?.body ?? "" });
    return Promise.resolve({ ok: true });
}

let previousDocument: unknown;
let previousWindow: unknown;
let previousFetch: unknown;
let previousObserver: unknown;

const globals = globalThis as unknown as Record<string, unknown>;

beforeEach(() => {
    previousDocument = globals["document"];
    previousWindow = globals["window"];
    previousFetch = globals["fetch"];
    previousObserver = globals["IntersectionObserver"];
    visibilityListeners.clear();
    timers.clear();
    sent.length = 0;
    StubObserver.instances.length = 0;
    stubDocument.visibilityState = "visible";
    globals["document"] = stubDocument;
    globals["window"] = stubWindow;
    globals["fetch"] = stubFetch;
    globals["IntersectionObserver"] = StubObserver;
});

afterEach(() => {
    globals["document"] = previousDocument;
    globals["window"] = previousWindow;
    globals["fetch"] = previousFetch;
    globals["IntersectionObserver"] = previousObserver;
});

function observer(): StubObserver {
    return StubObserver.instances[StubObserver.instances.length - 1] as StubObserver;
}

function elapseDwell(): void {
    for (const [id, timer] of [...timers]) {
        timers.delete(id);
        timer.fn();
    }
}

function changeVisibility(state: string): void {
    stubDocument.visibilityState = state;
    for (const fn of [...visibilityListeners]) fn();
}

async function settle(): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, 0));
}

describe("ad viewability rule", () => {
    test("half the pixels on a visible tab is viewable", () => {
        expect(adViewable(0.5, "visible")).toBe(true);
        expect(adViewable(1, "visible")).toBe(true);
    });

    test("less than half is not viewable", () => {
        expect(adViewable(0.49, "visible")).toBe(false);
        expect(adViewable(0, "visible")).toBe(false);
    });

    test("a hidden tab is never viewable however much is on screen", () => {
        expect(adViewable(1, "hidden")).toBe(false);
    });

    test("the threshold is the MRC half", () => {
        expect(VIEWABLE_RATIO).toBe(0.5);
        expect(VIEWABLE_MS).toBe(1000);
    });
});

describe("impression payload", () => {
    test("names the spot and marks the render viewable", () => {
        expect(JSON.parse(impressionBody(7, ""))).toEqual({ spot: 7, viewable: true });
    });

    test("carries the channel so the surface can be attributed", () => {
        expect(JSON.parse(impressionBody(7, "alice"))).toEqual({ spot: 7, channel: "alice", viewable: true });
    });

    test("drops a channel the backend would reject anyway", () => {
        expect(JSON.parse(impressionBody(7, "not a channel"))).toEqual({ spot: 7, viewable: true });
        expect(JSON.parse(impressionBody(7, "a".repeat(33)))).toEqual({ spot: 7, viewable: true });
    });

    test("carries the delivery token that proves the ad was served", () => {
        expect(JSON.parse(impressionBody(7, "alice", "1800000300.0123456789abcdef.fedcba9876543210"))).toEqual({
            spot: 7,
            channel: "alice",
            viewable: true,
            token: "1800000300.0123456789abcdef.fedcba9876543210",
        });
    });

    test("omits an absent token rather than sending an empty one", () => {
        expect(JSON.parse(impressionBody(7, "alice", ""))).toEqual({ spot: 7, channel: "alice", viewable: true });
    });

    test("stays well inside the 256 byte body cap", () => {
        expect(impressionBody(2147483647, "a".repeat(32), "1800000300.0123456789abcdef.fedcba9876543210").length)
            .toBeLessThanOrEqual(256);
    });
});

describe("visit url", () => {
    test("is the bare endpoint without a channel", () => {
        expect(adVisitUrl(42, "")).toBe("/api/live/spots/visit/42");
    });

    test("carries the channel for revenue attribution", () => {
        expect(adVisitUrl(42, "alice")).toBe("/api/live/spots/visit/42?channel=alice");
    });

    test("drops a channel the backend would reject anyway", () => {
        expect(adVisitUrl(42, "bad name")).toBe("/api/live/spots/visit/42");
    });
});

describe("advertiser disclosure", () => {
    test("renders the paid-for-by line the API returns", () => {
        expect(advertiserLine("Example GmbH")).toBe("Paid for by Example GmbH");
        expect(advertiserLine("  Example GmbH  ")).toBe("Paid for by Example GmbH");
    });

    test("is empty when the API returns no advertiser", () => {
        expect(advertiserLine("")).toBe("");
        expect(advertiserLine("   ")).toBe("");
        expect(advertiserLine(undefined)).toBe("");
        expect(advertiserLine(7)).toBe("");
    });
});

describe("trackAdImpression", () => {
    test("observes at the half threshold", () => {
        const el = {};
        trackAdImpression(el as Element, 7, "alice");
        expect(observer().observed).toEqual([el]);
        expect(observer().thresholds).toContain(VIEWABLE_RATIO);
    });

    test("posts nothing on render alone", () => {
        trackAdImpression({} as Element, 7, "alice");
        expect(sent).toEqual([]);
        expect(timers.size).toBe(0);
    });

    test("posts nothing while less than half the pixels are on screen", () => {
        trackAdImpression({} as Element, 7, "alice");
        observer().emit(0.49);
        expect(timers.size).toBe(0);
        expect(sent).toEqual([]);
    });

    test("posts one viewable impression after a continuous second", () => {
        trackAdImpression({} as Element, 7, "alice");
        observer().emit(0.6);
        expect(timers.size).toBe(1);
        expect([...timers.values()][0]!.delay).toBe(VIEWABLE_MS);
        expect(sent).toEqual([]);
        elapseDwell();
        expect(sent).toEqual([{
            url: "/api/live/spots/impression",
            method: "POST",
            body: impressionBody(7, "alice"),
        }]);
    });

    test("quotes the delivery token the serve handed out", () => {
        trackAdImpression({} as Element, 7, "alice", "1800000300.0123456789abcdef.fedcba9876543210");
        observer().emit(0.6);
        elapseDwell();
        expect(JSON.parse(sent[0]!.body)).toEqual({
            spot: 7,
            channel: "alice",
            viewable: true,
            token: "1800000300.0123456789abcdef.fedcba9876543210",
        });
    });

    test("scrolling away before the second elapses restarts the dwell", () => {
        trackAdImpression({} as Element, 7, "alice");
        observer().emit(0.6);
        observer().emit(0.2);
        expect(timers.size).toBe(0);
        elapseDwell();
        expect(sent).toEqual([]);
        observer().emit(0.9);
        expect(timers.size).toBe(1);
        elapseDwell();
        expect(sent.length).toBe(1);
    });

    test("hiding the tab clears the pending dwell", () => {
        trackAdImpression({} as Element, 7, "alice");
        observer().emit(1);
        changeVisibility("hidden");
        expect(timers.size).toBe(0);
        elapseDwell();
        expect(sent).toEqual([]);
    });

    test("returning to a visible tab starts the dwell again", () => {
        trackAdImpression({} as Element, 7, "alice");
        observer().emit(1);
        changeVisibility("hidden");
        changeVisibility("visible");
        expect(timers.size).toBe(1);
        elapseDwell();
        expect(sent.length).toBe(1);
    });

    test("a still-visible ad is reported once, never per callback", () => {
        trackAdImpression({} as Element, 7, "alice");
        observer().emit(0.6);
        elapseDwell();
        observer().emit(1);
        elapseDwell();
        expect(sent.length).toBe(1);
    });

    test("reporting disconnects the observer and drops the visibility listener", () => {
        trackAdImpression({} as Element, 7, "alice");
        observer().emit(1);
        elapseDwell();
        expect(observer().disconnected).toBe(true);
        expect(visibilityListeners.size).toBe(0);
    });

    test("stopping before the second elapses posts nothing", () => {
        const impression = trackAdImpression({} as Element, 7, "alice");
        observer().emit(1);
        impression.stop();
        expect(observer().disconnected).toBe(true);
        elapseDwell();
        expect(sent).toEqual([]);
    });

    test("a fast click posts the impression first so the backend can arm and discount it", async () => {
        const impression = trackAdImpression({} as Element, 7, "alice");
        impression.reportFastClick();
        await settle();
        expect(sent.map((request) => request.url)).toEqual([
            "/api/live/spots/impression",
            "/api/live/spots/visit/7?channel=alice",
        ]);
    });

    test("a fast click never double counts the impression", async () => {
        const impression = trackAdImpression({} as Element, 7, "alice");
        impression.reportFastClick();
        await settle();
        observer().emit(1);
        elapseDwell();
        await settle();
        expect(sent.filter((request) => request.url === "/api/live/spots/impression").length).toBe(1);
    });

    test("without an IntersectionObserver nothing is posted and stopping is safe", () => {
        globals["IntersectionObserver"] = undefined;
        const impression = trackAdImpression({} as Element, 7, "alice");
        impression.stop();
        expect(sent).toEqual([]);
        expect(StubObserver.instances.length).toBe(0);
    });
});

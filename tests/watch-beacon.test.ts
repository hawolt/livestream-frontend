import { beforeEach, describe, expect, test } from "bun:test";

type Listener = () => void;

class StubVideo {
    paused = true;
    ended = false;
    private listeners = new Map<string, Listener[]>();

    addEventListener(type: string, fn: Listener): void {
        const list = this.listeners.get(type) ?? [];
        list.push(fn);
        this.listeners.set(type, list);
    }

    fire(type: string): void {
        for (const fn of this.listeners.get(type) ?? []) fn();
    }
}

interface SentBeacon {
    channel: string;
    surface: string;
    start: boolean;
}

const visibilityListeners: Listener[] = [];
const stubDocument = {
    visibilityState: "visible",
    addEventListener(type: string, fn: Listener): void {
        if (type === "visibilitychange") visibilityListeners.push(fn);
    },
};

const intervals = new Map<number, Listener>();
let nextIntervalId = 0;
const stubWindow = {
    setInterval(fn: Listener): number {
        nextIntervalId += 1;
        intervals.set(nextIntervalId, fn);
        return nextIntervalId;
    },
    clearInterval(id: number): void {
        intervals.delete(id);
    },
};

const sent: SentBeacon[] = [];

(globalThis as unknown as { document: unknown }).document = stubDocument;
(globalThis as unknown as { window: unknown }).window = stubWindow;
(globalThis as unknown as { fetch: unknown }).fetch = (_url: string, init: { body: string }): Promise<unknown> => {
    sent.push(JSON.parse(init.body) as SentBeacon);
    return Promise.resolve({});
};

const { wireWatchBeacon } = await import("../src/live/watch-beacon.ts");

function fireHeartbeats(): void {
    for (const fn of [...intervals.values()]) fn();
}

function changeVisibility(state: string): void {
    stubDocument.visibilityState = state;
    for (const fn of visibilityListeners) fn();
}

function play(video: StubVideo): void {
    video.paused = false;
    video.fire("play");
}

function pause(video: StubVideo): void {
    video.paused = true;
    video.fire("pause");
}

beforeEach(() => {
    sent.length = 0;
    intervals.clear();
    stubDocument.visibilityState = "visible";
});

describe("watch beacon wiring", () => {
    test("the first beacon of a run marks the start and names the surface", () => {
        const video = new StubVideo();
        wireWatchBeacon(video as unknown as HTMLVideoElement, "channel", () => "alpha");
        play(video);
        expect(sent).toEqual([{ channel: "alpha", surface: "channel", start: true }]);
    });

    test("heartbeats after the start beacon carry no start marker", () => {
        const video = new StubVideo();
        wireWatchBeacon(video as unknown as HTMLVideoElement, "channel", () => "alpha");
        play(video);
        fireHeartbeats();
        fireHeartbeats();
        expect(sent.map(beacon => beacon.start)).toEqual([true, false, false]);
    });

    test("nothing is sent and no heartbeat runs while the tab is hidden", () => {
        const video = new StubVideo();
        stubDocument.visibilityState = "hidden";
        wireWatchBeacon(video as unknown as HTMLVideoElement, "channel", () => "alpha");
        play(video);
        expect(sent).toEqual([]);
        expect(intervals.size).toBe(0);
    });

    test("becoming visible while playing sends the start beacon", () => {
        const video = new StubVideo();
        stubDocument.visibilityState = "hidden";
        wireWatchBeacon(video as unknown as HTMLVideoElement, "channel", () => "alpha");
        play(video);
        changeVisibility("visible");
        expect(sent).toEqual([{ channel: "alpha", surface: "channel", start: true }]);
        expect(intervals.size).toBe(1);
    });

    test("pausing stops the heartbeat and resuming does not count a second view", () => {
        const video = new StubVideo();
        wireWatchBeacon(video as unknown as HTMLVideoElement, "channel", () => "alpha");
        play(video);
        pause(video);
        expect(intervals.size).toBe(0);
        play(video);
        expect(sent.map(beacon => beacon.start)).toEqual([true]);
        expect(intervals.size).toBe(1);
    });

    test("hiding and showing the tab does not count a second view", () => {
        const video = new StubVideo();
        wireWatchBeacon(video as unknown as HTMLVideoElement, "channel", () => "alpha");
        play(video);
        changeVisibility("hidden");
        changeVisibility("visible");
        fireHeartbeats();
        expect(sent.map(beacon => beacon.start)).toEqual([true, false]);
    });

    test("a channel handover starts a new run on the next beacon", () => {
        const video = new StubVideo();
        let channel = "alpha";
        wireWatchBeacon(video as unknown as HTMLVideoElement, "channel", () => channel);
        play(video);
        channel = "beta";
        fireHeartbeats();
        expect(sent).toEqual([
            { channel: "alpha", surface: "channel", start: true },
            { channel: "beta", surface: "channel", start: true },
        ]);
    });

    test("rewiring a player starts a new run", () => {
        const first = new StubVideo();
        wireWatchBeacon(first as unknown as HTMLVideoElement, "channel", () => "alpha");
        play(first);
        const second = new StubVideo();
        wireWatchBeacon(second as unknown as HTMLVideoElement, "channel", () => "alpha");
        play(second);
        expect(sent.map(beacon => beacon.start)).toEqual([true, true]);
        expect(intervals.size).toBe(1);
    });

    test("a player wired while already playing reports on its first heartbeat", () => {
        const video = new StubVideo();
        video.paused = false;
        wireWatchBeacon(video as unknown as HTMLVideoElement, "channel", () => "alpha");
        expect(sent).toEqual([]);
        fireHeartbeats();
        expect(sent).toEqual([{ channel: "alpha", surface: "channel", start: true }]);
    });

    test("the clip player reports the clip surface", () => {
        const video = new StubVideo();
        wireWatchBeacon(video as unknown as HTMLVideoElement, "clip", () => "alpha");
        play(video);
        expect(sent).toEqual([{ channel: "alpha", surface: "clip", start: true }]);
    });

    test("the embed player reports the embed surface", () => {
        const video = new StubVideo();
        wireWatchBeacon(video as unknown as HTMLVideoElement, "embed", () => "alpha");
        play(video);
        expect(sent).toEqual([{ channel: "alpha", surface: "embed", start: true }]);
    });

    test("no beacon is sent before the channel is known", () => {
        const video = new StubVideo();
        let channel = "";
        wireWatchBeacon(video as unknown as HTMLVideoElement, "embed", () => channel);
        play(video);
        expect(sent).toEqual([]);
        channel = "alpha";
        fireHeartbeats();
        expect(sent).toEqual([{ channel: "alpha", surface: "embed", start: true }]);
    });

    test("an ended player stops the heartbeat", () => {
        const video = new StubVideo();
        wireWatchBeacon(video as unknown as HTMLVideoElement, "channel", () => "alpha");
        play(video);
        video.ended = true;
        video.fire("ended");
        expect(intervals.size).toBe(0);
        expect(sent.length).toBe(1);
    });
});

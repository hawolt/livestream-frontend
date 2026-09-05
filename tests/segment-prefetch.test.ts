import { expect, test } from "bun:test";
import type { HlsConfig, LoaderCallbacks, LoaderConfiguration, LoaderContext, LoaderStats } from "hls.js";
import { prefetchURL, segmentPrefetchLoader } from "../src/live/player/segment-prefetch.ts";

class FakeLoader {
    static requests: FakeLoader[] = [];
    context: LoaderContext | null = null;
    stats = { loading: { start: 1, first: 2, end: 3 }, loaded: 4 } as LoaderStats;
    callbacks!: LoaderCallbacks<LoaderContext>;
    aborted = false;
    constructor(_config: HlsConfig) {}
    load(context: LoaderContext, _config: LoaderConfiguration, callbacks: LoaderCallbacks<LoaderContext>) {
        this.context = context;
        this.callbacks = callbacks;
        FakeLoader.requests.push(this);
    }
    abort() { this.aborted = true; }
    destroy() { this.abort(); }
    succeed(data: string | ArrayBuffer) {
        this.callbacks.onSuccess({ url: this.context!.url, data }, this.stats, this.context!, null);
    }
}

const config = {} as HlsConfig;
const loadConfig = {} as LoaderConfiguration;
const playlist = "https://edge.example/hls/alice/live.m3u8";
const hint = "#EXTM3U\n#EXT-X-PREFETCH:seg8.m4s?prefetch=1&v=123";
function callbacks(success: (data: unknown) => void = () => {}) {
    return { onSuccess: (response: { data?: unknown }) => success(response.data), onError: () => {}, onTimeout: () => {} };
}

function setup() {
    FakeLoader.requests = [];
    const factory = segmentPrefetchLoader(FakeLoader);
    const loader = new factory.loader(config);
    loader.load({ url: playlist, responseType: "text" }, loadConfig, callbacks());
    FakeLoader.requests[0].succeed(hint);
    return factory;
}

test("resolves same-origin prefetch and ignores ended or foreign playlists", () => {
    expect(prefetchURL(hint, playlist)).toBe("https://edge.example/hls/alice/seg8.m4s?prefetch=1&v=123");
    expect(prefetchURL(hint + "\n#EXT-X-ENDLIST", playlist)).toBeNull();
    expect(prefetchURL("#EXT-X-PREFETCH:https://other.example/a", playlist)).toBeNull();
});

test("playback joins an outstanding prefetch without a duplicate request", () => {
    const factory = setup();
    const pending = FakeLoader.requests[1];
    const loader = new factory.loader(config);
    let received: unknown;
    loader.load({ ...pending.context!, rangeStart: 0, rangeEnd: 0 }, loadConfig, callbacks((data) => received = data));
    const bytes = new ArrayBuffer(4);
    pending.succeed(bytes);
    expect(FakeLoader.requests.length).toBe(2);
    expect(received).toBe(bytes);
    expect(loader.stats).toBe(pending.stats);
    loader.destroy();
    factory.clear();
});

test("completed prefetch is reused and cancellation suppresses delivery", async () => {
    const factory = setup();
    const pending = FakeLoader.requests[1];
    pending.succeed(new ArrayBuffer(4));
    const loader = new factory.loader(config);
    let delivered = false;
    loader.load(pending.context!, loadConfig, callbacks(() => delivered = true));
    loader.abort();
    await Promise.resolve();
    expect(delivered).toBe(false);
    expect(FakeLoader.requests.length).toBe(2);
    factory.clear();
});

test("failed prefetch falls back to a normal playback request", () => {
    const factory = setup();
    const pending = FakeLoader.requests[1];
    const loader = new factory.loader(config);
    let received: unknown;
    loader.load({ ...pending.context!, rangeStart: 0, rangeEnd: 0 }, loadConfig, callbacks((data) => received = data));
    pending.callbacks.onTimeout(pending.stats, pending.context!, null);
    expect(FakeLoader.requests.length).toBe(3);
    const bytes = new ArrayBuffer(3);
    FakeLoader.requests[2].succeed(bytes);
    expect(received).toBe(bytes);
    loader.destroy();
    factory.clear();
});

test("teardown aborts unused prefetch requests", () => {
    const factory = setup();
    factory.clear();
    expect(FakeLoader.requests[1].aborted).toBe(true);
});

test("completed prefetch delivers its bytes asynchronously", async () => {
    const factory = setup();
    const pending = FakeLoader.requests[1];
    const bytes = new ArrayBuffer(4);
    pending.succeed(bytes);
    const loader = new factory.loader(config);
    let received: unknown;
    loader.load({ ...pending.context!, rangeStart: 0, rangeEnd: 0 }, loadConfig, callbacks((data) => received = data));
    expect(received).toBeUndefined();
    await Promise.resolve();
    expect(received).toBe(bytes);
    expect(FakeLoader.requests.length).toBe(2);
    loader.destroy();
    factory.clear();
});

test("byte-range loads do not consume full-segment prefetches", () => {
    const factory = setup();
    const pending = FakeLoader.requests[1];
    const loader = new factory.loader(config);
    loader.load({ ...pending.context!, rangeStart: 0, rangeEnd: 20 }, loadConfig, callbacks());
    expect(FakeLoader.requests.length).toBe(3);
    loader.destroy();
    factory.clear();
});

test("repeated hints are deduplicated and old unused requests are evicted", () => {
    const factory = setup();
    const load = (text: string) => {
        const loader = new factory.loader(config);
        loader.load({ url: playlist, responseType: "text" }, loadConfig, callbacks());
        FakeLoader.requests[FakeLoader.requests.length - 1].succeed(text);
    };
    load(hint);
    expect(FakeLoader.requests.length).toBe(3);
    load(hint.replace("seg8", "seg9"));
    load(hint.replace("seg8", "seg10"));
    expect(FakeLoader.requests[1].aborted).toBe(true);
    factory.clear();
});

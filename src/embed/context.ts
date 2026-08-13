import { resolveEmbedModes } from "./modes.ts";

export type EmbedPlaybackState = "offline" | "connecting" | "playing" | "retrying";
export type EmbedTransportKind = "none" | "ws" | "hls-native" | "hls-js" | "unsupported";

const modes = resolveEmbedModes(new URLSearchParams(location.search));

export const previewMode = modes.preview;
export const controlsMode = modes.controls;
export const cleanfeedMode = modes.cleanfeed;

export const ctx = {
    username: "",
    mediaBase: "",
    wssBase: "",
    transportKind: "none" as EmbedTransportKind,
    llDenied: false,

    gen: 0,
    terminal: false,
    offline: true,
    state: "offline" as EmbedPlaybackState,

    ws: null as WebSocket | null,
    mediaSource: null as MediaSource | null,
    sourceBuffer: null as SourceBuffer | null,
    appendQueue: [] as ArrayBuffer[],
    objectUrl: null as string | null,
    startedPlayback: false,
    genCleanup: [] as Array<() => void>,

    lastMediaArrivalAt: 0,
    lastProgressAt: 0,
    lastObservedTime: -1,
    lastStateChangeAt: 0,
};

export function nextGen(): number {
    ctx.gen += 1;
    return ctx.gen;
}

export function isCurrent(g: number): boolean {
    return g === ctx.gen && !ctx.terminal;
}

export function track(cleanup: () => void): void {
    ctx.genCleanup.push(cleanup);
}

export function runGenCleanup(): void {
    const fns = ctx.genCleanup;
    ctx.genCleanup = [];
    for (const fn of fns) {
        try {
            fn();
        } catch {}
    }
}
